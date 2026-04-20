import { DatasetStatus, Prisma } from '@prisma/client';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import xlsx from 'xlsx';

import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { toDatasetItemResponse } from '../datasets/dataset.mapper.js';
import { toApiDatasetItemType, toApiDatasetStatus } from '../datasets/dataset.registry.js';
import type { KnowledgeAssetUpsertBody, KnowledgeBaseWorkspaceQuery, KnowledgeAssetKind, KnowledgeAssetReviewStatus } from './knowledge-base.schemas.js';

type ScopeContext = {
  projectId?: string | null;
  moduleId?: string | null;
  pageId?: string | null;
};

type ParsedFilePayload = {
  contentText?: string | null;
  previewDataUrl?: string | null;
  extractedMetadata?: Record<string, unknown> | null;
};

function toDbAssetKind(kind: KnowledgeAssetKind) {
  switch (kind) {
    case 'file':
      return 'FILE' as const;
    case 'pastedText':
      return 'PASTED_TEXT' as const;
    case 'manualInput':
      return 'MANUAL_INPUT' as const;
  }
}

function toApiAssetKind(kind: string): KnowledgeAssetKind {
  switch (kind) {
    case 'FILE':
      return 'file';
    case 'PASTED_TEXT':
      return 'pastedText';
    default:
      return 'manualInput';
  }
}

function toDbAssetStatus(status: KnowledgeAssetReviewStatus) {
  switch (status) {
    case 'raw':
      return 'RAW' as const;
    case 'reviewed':
      return 'REVIEWED' as const;
    case 'linked':
      return 'LINKED' as const;
    case 'archived':
      return 'ARCHIVED' as const;
  }
}

function toApiAssetStatus(status: string): KnowledgeAssetReviewStatus {
  switch (status) {
    case 'RAW':
      return 'raw';
    case 'REVIEWED':
      return 'reviewed';
    case 'LINKED':
      return 'linked';
    default:
      return 'archived';
  }
}

function trimToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function deriveTitle(input: Pick<KnowledgeAssetUpsertBody, 'title' | 'fileName' | 'sourceFormat' | 'kind'>) {
  const explicitTitle = trimToNull(input.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  const fileName = trimToNull(input.fileName);
  if (fileName) {
    const withoutExtension = fileName.replace(/\.[^.]+$/, '');
    return withoutExtension || fileName;
  }

  if (input.kind === 'pastedText') {
    return 'Pasted input';
  }

  if (input.kind === 'manualInput') {
    return 'Manual input';
  }

  return trimToNull(input.sourceFormat) ?? 'Uploaded source';
}

function summarizeContent(summary?: string | null, contentText?: string | null) {
  const explicitSummary = trimToNull(summary);
  if (explicitSummary) {
    return explicitSummary;
  }

  const content = trimToNull(contentText);
  if (!content) {
    return null;
  }

  return content.length > 240 ? `${content.slice(0, 237)}...` : content;
}

function toNullableJsonInput(value: Record<string, unknown> | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return toPrismaJson(value);
}

function bufferFromBase64(value: string) {
  return Buffer.from(value, 'base64');
}

async function parseFilePayload(input: KnowledgeAssetUpsertBody): Promise<ParsedFilePayload> {
  if (input.kind !== 'file' || !input.fileBase64) {
    return {
      previewDataUrl: trimToNull(input.previewDataUrl),
      extractedMetadata: input.extractedMetadata ?? null,
    };
  }

  const fileBuffer = bufferFromBase64(input.fileBase64);
  const mimeType = trimToNull(input.mimeType)?.toLowerCase() ?? '';
  const fileName = trimToNull(input.fileName)?.toLowerCase() ?? '';
  const sourceFormat = trimToNull(input.sourceFormat)?.toLowerCase() ?? '';
  const extension = fileName.includes('.') ? fileName.split('.').pop() ?? '' : sourceFormat;

  const baseMetadata: Record<string, unknown> = {
    ...(input.extractedMetadata ?? {}),
    originalSizeBytes: fileBuffer.byteLength,
    sourceFormat: sourceFormat || extension || null,
  };

  const previewDataUrl = trimToNull(input.previewDataUrl);

  if (
    mimeType.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(extension)
  ) {
    return {
      contentText: trimToNull(input.contentText),
      previewDataUrl,
      extractedMetadata: {
        ...baseMetadata,
        extractionStatus: 'preview-only',
      },
    };
  }

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    const parsed = await pdfParse(fileBuffer);
    return {
      contentText: trimToNull(parsed.text),
      previewDataUrl,
      extractedMetadata: {
        ...baseMetadata,
        extractionStatus: 'parsed',
        pageCount: parsed.numpages,
      },
    };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === 'docx'
  ) {
    const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
    return {
      contentText: trimToNull(parsed.value),
      previewDataUrl,
      extractedMetadata: {
        ...baseMetadata,
        extractionStatus: 'parsed',
        messages: parsed.messages,
      },
    };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ['xlsx', 'xls', 'csv'].includes(extension)
  ) {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetTexts = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return '';
      }
      return `# ${sheetName}\n${xlsx.utils.sheet_to_csv(sheet)}`.trim();
    }).filter(Boolean);

    return {
      contentText: trimToNull(sheetTexts.join('\n\n')),
      previewDataUrl,
      extractedMetadata: {
        ...baseMetadata,
        extractionStatus: 'parsed',
        sheetNames: workbook.SheetNames,
      },
    };
  }

  if (
    mimeType.startsWith('text/') ||
    ['txt', 'md', 'json', 'csv'].includes(extension)
  ) {
    return {
      contentText: trimToNull(fileBuffer.toString('utf-8')),
      previewDataUrl,
      extractedMetadata: {
        ...baseMetadata,
        extractionStatus: 'parsed',
      },
    };
  }

  return {
    contentText: trimToNull(input.contentText),
    previewDataUrl,
    extractedMetadata: {
      ...baseMetadata,
      extractionStatus: 'unsupported',
      extractionMessage: 'File stored as metadata-only; content extraction is not supported for this format yet.',
    },
  };
}

async function resolveScopeContext(input: ScopeContext): Promise<Required<ScopeContext>> {
  let projectId = input.projectId ?? null;
  let moduleId = input.moduleId ?? null;
  let pageId = input.pageId ?? null;

  if (pageId) {
    const page = await prisma.projectPage.findUnique({
      where: { id: pageId },
      include: {
        module: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!page) {
      throw badRequest('Selected page does not exist.');
    }

    moduleId = moduleId ?? page.moduleId;
    projectId = projectId ?? page.module.projectId;
  }

  if (moduleId) {
    const moduleRecord = await prisma.projectModule.findUnique({
      where: { id: moduleId },
    });

    if (!moduleRecord) {
      throw badRequest('Selected module does not exist.');
    }

    projectId = projectId ?? moduleRecord.projectId;
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw badRequest('Selected project does not exist.');
    }
  }

  return {
    projectId,
    moduleId,
    pageId,
  };
}

function toKnowledgeAssetResponse(
  asset: Prisma.KnowledgeAssetGetPayload<{
    include: {
      project: { select: { id: true; name: true } };
      module: { select: { id: true; name: true } };
      page: { select: { id: true; name: true } };
      links: {
        include: {
          datasetItem: true;
        };
      };
    };
  }>,
) {
  return {
    id: asset.id,
    title: asset.title,
    summary: asset.summary ?? null,
    kind: toApiAssetKind(asset.kind),
    sourceFormat: asset.sourceFormat ?? null,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    contentText: asset.contentText ?? null,
    previewDataUrl: asset.previewDataUrl ?? null,
    extractedMetadata:
      asset.extractedMetadata && typeof asset.extractedMetadata === 'object'
        ? (asset.extractedMetadata as Record<string, unknown>)
        : null,
    tags: [...asset.tags],
    reviewStatus: toApiAssetStatus(asset.reviewStatus),
    project: asset.project ? { id: asset.project.id, name: asset.project.name } : null,
    module: asset.module ? { id: asset.module.id, name: asset.module.name } : null,
    page: asset.page ? { id: asset.page.id, name: asset.page.name } : null,
    links: asset.links.map((link) => ({
      id: link.id,
      datasetItemId: link.datasetItemId,
      datasetItemType: toApiDatasetItemType(link.datasetItem.itemType),
      datasetItemTitle: link.datasetItem.title,
      datasetItemStatus: toApiDatasetStatus(link.datasetItem.status),
      notes: link.notes ?? null,
      createdAt: link.createdAt.toISOString(),
    })),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

async function syncAssetReviewStatus(transaction: Prisma.TransactionClient, assetId: string) {
  const [asset, linkCount] = await Promise.all([
    transaction.knowledgeAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        reviewStatus: true,
        contentText: true,
        fileName: true,
        previewDataUrl: true,
      },
    }),
    transaction.knowledgeAssetLink.count({
      where: { assetId },
    }),
  ]);

  if (!asset || asset.reviewStatus === 'ARCHIVED') {
    return;
  }

  if (linkCount > 0 && asset.reviewStatus !== 'LINKED') {
    await transaction.knowledgeAsset.update({
      where: { id: assetId },
      data: {
        reviewStatus: 'LINKED',
      },
    });
    return;
  }

  if (linkCount === 0 && asset.reviewStatus === 'LINKED') {
    await transaction.knowledgeAsset.update({
      where: { id: assetId },
      data: {
        reviewStatus:
          asset.contentText || asset.fileName || asset.previewDataUrl
            ? 'REVIEWED'
            : 'RAW',
      },
    });
  }
}

export async function getKnowledgeBaseWorkspace(query: KnowledgeBaseWorkspaceQuery) {
  const includeArchived = query.includeArchived;
  const assetWhere: Prisma.KnowledgeAssetWhereInput = includeArchived
    ? {}
    : {
        reviewStatus: {
          not: 'ARCHIVED',
        },
      };
  const datasetWhere: Prisma.DatasetItemWhereInput = includeArchived
    ? {}
    : {
        status: {
          not: DatasetStatus.ARCHIVED,
        },
      };

  const [assets, structuredItems, projects] = await prisma.$transaction([
    prisma.knowledgeAsset.findMany({
      where: assetWhere,
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
        links: {
          include: {
            datasetItem: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
    }),
    prisma.datasetItem.findMany({
      where: datasetWhere,
      include: {
        knowledgeLinks: {
          include: {
            asset: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
    }),
    prisma.project.findMany({
      include: {
        modules: {
          include: {
            pages: {
              orderBy: { name: 'asc' },
              include: {
                features: {
                  orderBy: { name: 'asc' },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const assetResponses = assets.map(toKnowledgeAssetResponse);
  const structuredResponses = structuredItems.map((item) => ({
    ...toDatasetItemResponse(item),
      linkedAssetsCount: item.knowledgeLinks.length,
      linkedAssetsPreview: item.knowledgeLinks.slice(0, 5).map((link) => ({
        id: link.asset.id,
        title: link.asset.title,
        kind: toApiAssetKind(link.asset.kind),
        sourceFormat: link.asset.sourceFormat ?? null,
      })),
  }));

  const linkedItemCount =
    assetResponses.filter((asset) => asset.links.length > 0).length +
    structuredResponses.filter((item) => item.linkedAssetsCount > 0).length;
  const needsReviewCount =
    assetResponses.filter((asset) => asset.reviewStatus === 'raw').length +
    structuredResponses.filter((item) => item.status === 'draft').length;

  return {
    summary: {
      assetCount: assetResponses.length,
      structuredCount: structuredResponses.length,
      linkedItemCount,
      needsReviewCount,
    },
    assets: assetResponses,
    structuredItems: structuredResponses,
    projectHierarchy: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      modules: project.modules.map((module) => ({
        id: module.id,
        name: module.name,
        description: module.description ?? null,
        pages: module.pages.map((page) => ({
          id: page.id,
          name: page.name,
          description: page.description ?? null,
          features: page.features.map((feature) => ({
            id: feature.id,
            name: feature.name,
            description: feature.description ?? null,
          })),
        })),
      })),
    })),
  };
}

export async function createKnowledgeAsset(input: KnowledgeAssetUpsertBody) {
  const scope = await resolveScopeContext({
    projectId: input.projectId,
    moduleId: input.moduleId,
    pageId: input.pageId,
  });
  const parsedFilePayload = await parseFilePayload(input);
  const contentText = trimToNull(input.contentText) ?? parsedFilePayload.contentText ?? null;
  const previewDataUrl = trimToNull(input.previewDataUrl) ?? parsedFilePayload.previewDataUrl ?? null;
  const title = deriveTitle(input);

  const created = await prisma.knowledgeAsset.create({
    data: {
      title,
      summary: summarizeContent(input.summary, contentText),
      kind: toDbAssetKind(input.kind),
      sourceFormat: trimToNull(input.sourceFormat),
      fileName: trimToNull(input.fileName),
      mimeType: trimToNull(input.mimeType),
      contentText,
      previewDataUrl,
      extractedMetadata: toNullableJsonInput(parsedFilePayload.extractedMetadata ?? input.extractedMetadata ?? null),
      tags: input.tags,
      reviewStatus: toDbAssetStatus(input.reviewStatus ?? 'raw'),
      projectId: scope.projectId,
      moduleId: scope.moduleId,
      pageId: scope.pageId,
    },
    include: {
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
      links: {
        include: {
          datasetItem: true,
        },
      },
    },
  });

  return toKnowledgeAssetResponse(created);
}

export async function updateKnowledgeAsset(id: string, input: KnowledgeAssetUpsertBody) {
  const existing = await prisma.knowledgeAsset.findUnique({
    where: { id },
  });

  if (!existing) {
    throw notFound('Knowledge asset not found.');
  }

  const scope = await resolveScopeContext({
    projectId: input.projectId,
    moduleId: input.moduleId,
    pageId: input.pageId,
  });
  const parsedFilePayload = await parseFilePayload(input);
  const contentText = trimToNull(input.contentText) ?? parsedFilePayload.contentText ?? existing.contentText ?? null;
  const previewDataUrl =
    trimToNull(input.previewDataUrl) ?? parsedFilePayload.previewDataUrl ?? existing.previewDataUrl ?? null;
  const title = deriveTitle(input) || existing.title;

  const updated = await prisma.knowledgeAsset.update({
    where: { id },
    data: {
      title,
      summary: summarizeContent(input.summary ?? existing.summary, contentText),
      kind: toDbAssetKind(input.kind),
      sourceFormat: trimToNull(input.sourceFormat) ?? existing.sourceFormat,
      fileName: trimToNull(input.fileName) ?? existing.fileName,
      mimeType: trimToNull(input.mimeType) ?? existing.mimeType,
      contentText,
      previewDataUrl,
      extractedMetadata: toNullableJsonInput(
        parsedFilePayload.extractedMetadata ??
          input.extractedMetadata ??
          (existing.extractedMetadata && typeof existing.extractedMetadata === 'object'
            ? (existing.extractedMetadata as Record<string, unknown>)
            : null),
      ),
      tags: input.tags,
      reviewStatus: toDbAssetStatus(input.reviewStatus ?? toApiAssetStatus(existing.reviewStatus)),
      projectId: scope.projectId,
      moduleId: scope.moduleId,
      pageId: scope.pageId,
    },
    include: {
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
      links: {
        include: {
          datasetItem: true,
        },
      },
    },
  });

  return toKnowledgeAssetResponse(updated);
}

export async function deleteKnowledgeAsset(id: string) {
  const existing = await prisma.knowledgeAsset.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw notFound('Knowledge asset not found.');
  }

  await prisma.knowledgeAsset.delete({
    where: { id },
  });
}

export async function createKnowledgeAssetLink(assetId: string, datasetItemId: string, notes?: string) {
  const [asset, datasetItem] = await Promise.all([
    prisma.knowledgeAsset.findUnique({
      where: { id: assetId },
      select: { id: true, reviewStatus: true, title: true },
    }),
    prisma.datasetItem.findUnique({
      where: { id: datasetItemId },
      select: { id: true, status: true, title: true },
    }),
  ]);

  if (!asset) {
    throw notFound('Knowledge asset not found.');
  }

  if (!datasetItem) {
    throw badRequest('Structured knowledge item does not exist.');
  }

  if (!['REVIEWED', 'LINKED'].includes(asset.reviewStatus)) {
    throw badRequest('Approve the source before linking it into reusable knowledge.');
  }

  if (datasetItem.status !== 'APPROVED') {
    throw badRequest('Only approved structured knowledge can be linked to a source.');
  }

  const existing = await prisma.knowledgeAssetLink.findUnique({
    where: {
      assetId_datasetItemId: {
        assetId,
        datasetItemId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw conflict('This asset is already linked to the selected structured item.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.knowledgeAssetLink.create({
      data: {
        assetId,
        datasetItemId,
        notes: trimToNull(notes),
      },
    });

    await syncAssetReviewStatus(transaction, assetId);
  });

  const linkedAsset = await prisma.knowledgeAsset.findUnique({
    where: { id: assetId },
    include: {
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
      links: {
        include: {
          datasetItem: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!linkedAsset) {
    throw notFound('Knowledge asset not found.');
  }

  return toKnowledgeAssetResponse(linkedAsset);
}

export async function deleteKnowledgeAssetLink(assetId: string, linkId: string) {
  const link = await prisma.knowledgeAssetLink.findUnique({
    where: { id: linkId },
    select: { id: true, assetId: true },
  });

  if (!link || link.assetId !== assetId) {
    throw notFound('Knowledge asset link not found.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.knowledgeAssetLink.delete({
      where: { id: linkId },
    });

    await syncAssetReviewStatus(transaction, assetId);
  });

  const asset = await prisma.knowledgeAsset.findUnique({
    where: { id: assetId },
    include: {
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
      links: {
        include: {
          datasetItem: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!asset) {
    throw notFound('Knowledge asset not found.');
  }

  return toKnowledgeAssetResponse(asset);
}
