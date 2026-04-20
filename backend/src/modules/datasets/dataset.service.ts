import { ApprovalAction, DatasetStatus, type Prisma } from '@prisma/client';

import { prisma } from '../../db/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { slugify } from '../../lib/slug.js';
import {
  buildOrderedExportObject,
  deriveMetadataFromPayload,
  toApprovalHistoryResponse,
  toDatasetItemResponse,
  toDatasetVersionResponse,
} from './dataset.mapper.js';
import { getDatasetEntityDefinition, toDbDatasetStatus } from './dataset.registry.js';
import type { ApiDatasetItemType, DatasetListQuery, DatasetUpsertBody } from './dataset.schemas.js';

async function resolveScopeContext(input: {
  projectId?: string;
  moduleId?: string;
  pageId?: string;
}) {
  let projectId = input.projectId ?? null;
  let moduleId = input.moduleId ?? null;
  let pageId = input.pageId ?? null;

  if (pageId) {
    const page = await prisma.projectPage.findUnique({
      where: { id: pageId },
      include: {
        module: true,
      },
    });

    if (!page) {
      throw notFound('Selected page does not exist.');
    }

    moduleId = moduleId ?? page.moduleId;
    projectId = projectId ?? page.module.projectId;
  }

  if (moduleId) {
    const moduleRecord = await prisma.projectModule.findUnique({
      where: { id: moduleId },
    });

    if (!moduleRecord) {
      throw notFound('Selected module does not exist.');
    }

    projectId = projectId ?? moduleRecord.projectId;
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw notFound('Selected project does not exist.');
    }
  }

  return { projectId, moduleId, pageId };
}

function resolveScopeLevel(input: DatasetUpsertBody) {
  if (input.scopeLevel) {
    return input.scopeLevel.toUpperCase() as 'PROJECT' | 'MODULE' | 'PAGE';
  }

  if (input.pageId) {
    return 'PAGE' as const;
  }

  if (input.moduleId) {
    return 'MODULE' as const;
  }

  if (input.projectId) {
    return 'PROJECT' as const;
  }

  return null;
}

async function generateUniqueSlug(itemType: ApiDatasetItemType, title: string, excludeId?: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const baseSlug = slugify(title) || 'item';
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await prisma.datasetItem.findFirst({
      where: {
        itemType: definition.dbType,
        slug: candidate,
        ...(excludeId
          ? {
              NOT: {
                id: excludeId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

async function createVersionSnapshot(
  transaction: Prisma.TransactionClient,
  itemType: ApiDatasetItemType,
  itemResponse: ReturnType<typeof toDatasetItemResponse>,
  actor: string,
) {
  await transaction.datasetVersion.create({
    data: {
      itemId: itemResponse.id,
      itemType: getDatasetEntityDefinition(itemType).dbType,
      version: itemResponse.version,
      createdBy: actor,
      snapshot: toPrismaJson(buildOrderedExportObject(itemType, itemResponse)),
    },
  });
}

async function createApprovalHistory(
  transaction: Prisma.TransactionClient,
  itemType: ApiDatasetItemType,
  itemId: string,
  versionBefore: number,
  versionAfter: number,
  action: ApprovalAction,
  actor: string,
  notes?: string,
) {
  await transaction.approvalHistory.create({
    data: {
      itemId,
      itemType: getDatasetEntityDefinition(itemType).dbType,
      versionBefore,
      versionAfter,
      action,
      actor,
      notes: notes ?? null,
    },
  });
}

async function getValidatedPayload(itemType: ApiDatasetItemType, payload: Record<string, unknown>) {
  return getDatasetEntityDefinition(itemType).payloadSchema.parse(payload) as Record<string, unknown>;
}

export async function listDatasetItems(itemType: ApiDatasetItemType, query: DatasetListQuery) {
  const definition = getDatasetEntityDefinition(itemType);
  const where: Prisma.DatasetItemWhereInput = {
    itemType: definition.dbType,
    ...(query.search
      ? {
          OR: [
            {
              title: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              summary: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {}),
    ...(query.status
      ? {
          status: toDbDatasetStatus(query.status),
        }
      : query.includeArchived
        ? {}
        : {
            status: {
              not: DatasetStatus.ARCHIVED,
            },
          }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.datasetItem.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.datasetItem.count({ where }),
  ]);

  return {
    items: items.map(toDatasetItemResponse),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getDatasetItem(itemType: ApiDatasetItemType, id: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const item = await prisma.datasetItem.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  if (!item || item.itemType !== definition.dbType) {
    throw notFound(`${definition.label} not found`);
  }

  return toDatasetItemResponse(item);
}

export async function createDatasetItem(itemType: ApiDatasetItemType, input: DatasetUpsertBody, actor: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const payload = await getValidatedPayload(itemType, input.payload);
  const metadata = deriveMetadataFromPayload(itemType, payload);
  const slug = await generateUniqueSlug(itemType, metadata.title);
  const status = input.status ? toDbDatasetStatus(input.status) : DatasetStatus.DRAFT;
  const scope = await resolveScopeContext(input);
  const scopeLevel = resolveScopeLevel(input);

  return prisma.$transaction(async (transaction) => {
    const created = await transaction.datasetItem.create({
      data: {
        itemType: definition.dbType,
        slug,
        title: metadata.title,
        summary: metadata.summary,
        tags: metadata.tags,
        status,
        version: 1,
        data: toPrismaJson(payload),
        projectId: scope.projectId,
        moduleId: scope.moduleId,
        pageId: scope.pageId,
        scopeLevel,
        archivedAt: status === DatasetStatus.ARCHIVED ? new Date() : null,
        archivedFromStatus: status === DatasetStatus.ARCHIVED ? DatasetStatus.DRAFT : null,
      },
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
    });

    const response = toDatasetItemResponse(created);
    await createVersionSnapshot(transaction, itemType, response, actor);
    await createApprovalHistory(transaction, itemType, created.id, 0, 1, ApprovalAction.MANUAL_CREATE, actor);

    return response;
  });
}

export async function updateDatasetItem(itemType: ApiDatasetItemType, id: string, input: DatasetUpsertBody, actor: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const existing = await prisma.datasetItem.findUnique({ where: { id } });

  if (!existing || existing.itemType !== definition.dbType) {
    throw notFound(`${definition.label} not found`);
  }

  if (existing.status === DatasetStatus.ARCHIVED) {
    throw conflict('Archived items must be restored before editing');
  }

  const payload = await getValidatedPayload(itemType, input.payload);
  const metadata = deriveMetadataFromPayload(itemType, payload);
  const slug = await generateUniqueSlug(itemType, metadata.title, id);
  const nextStatus = input.status ? toDbDatasetStatus(input.status) : existing.status;
  const nextVersion = existing.version + 1;
  const scope = await resolveScopeContext(input);
  const scopeLevel = resolveScopeLevel(input);

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.datasetItem.update({
      where: { id },
      data: {
        slug,
        title: metadata.title,
        summary: metadata.summary,
        tags: metadata.tags,
        status: nextStatus,
        version: nextVersion,
        data: toPrismaJson(payload),
        projectId: scope.projectId,
        moduleId: scope.moduleId,
        pageId: scope.pageId,
        scopeLevel,
        archivedAt: nextStatus === DatasetStatus.ARCHIVED ? new Date() : null,
        archivedFromStatus: nextStatus === DatasetStatus.ARCHIVED ? existing.status : null,
      },
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
    });

    const response = toDatasetItemResponse(updated);
    await createVersionSnapshot(transaction, itemType, response, actor);
    await createApprovalHistory(transaction, itemType, id, existing.version, nextVersion, ApprovalAction.MANUAL_UPDATE, actor);

    return response;
  });
}

export async function cloneDatasetItem(itemType: ApiDatasetItemType, id: string, actor: string) {
  const source = await getDatasetItem(itemType, id);
  const definition = getDatasetEntityDefinition(itemType);
  const copiedPayload = structuredClone(source.payload) as Record<string, unknown>;
  copiedPayload[definition.titleField] = `${source.title} Copy`;
  const payload = await getValidatedPayload(itemType, copiedPayload);
  const metadata = deriveMetadataFromPayload(itemType, payload);
  const slug = await generateUniqueSlug(itemType, metadata.title);

  return prisma.$transaction(async (transaction) => {
    const created = await transaction.datasetItem.create({
      data: {
        itemType: definition.dbType,
        slug,
        title: metadata.title,
        summary: metadata.summary,
        tags: metadata.tags,
        status: DatasetStatus.DRAFT,
        version: 1,
        data: toPrismaJson(payload),
        projectId: source.project?.id ?? null,
        moduleId: source.module?.id ?? null,
        pageId: source.page?.id ?? null,
        scopeLevel: (source.scopeLevel?.toUpperCase() as 'PROJECT' | 'MODULE' | 'PAGE' | undefined) ?? null,
      },
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
    });

    const response = toDatasetItemResponse(created);
    await createVersionSnapshot(transaction, itemType, response, actor);
    await createApprovalHistory(transaction, itemType, created.id, 0, 1, ApprovalAction.CLONED, actor, `Cloned from ${source.id}`);

    return response;
  });
}

export async function archiveDatasetItem(itemType: ApiDatasetItemType, id: string, actor: string, notes?: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const existing = await prisma.datasetItem.findUnique({ where: { id } });

  if (!existing || existing.itemType !== definition.dbType) {
    throw notFound(`${definition.label} not found`);
  }

  if (existing.status === DatasetStatus.ARCHIVED) {
    return toDatasetItemResponse(existing);
  }

  const nextVersion = existing.version + 1;

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.datasetItem.update({
      where: { id },
      data: {
        status: DatasetStatus.ARCHIVED,
        archivedFromStatus: existing.status,
        archivedAt: new Date(),
        version: nextVersion,
      },
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
    });

    const response = toDatasetItemResponse(updated);
    await createVersionSnapshot(transaction, itemType, response, actor);
    await createApprovalHistory(transaction, itemType, id, existing.version, nextVersion, ApprovalAction.ARCHIVED, actor, notes);

    return response;
  });
}

export async function restoreDatasetItem(itemType: ApiDatasetItemType, id: string, actor: string, notes?: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const existing = await prisma.datasetItem.findUnique({ where: { id } });

  if (!existing || existing.itemType !== definition.dbType) {
    throw notFound(`${definition.label} not found`);
  }

  if (existing.status !== DatasetStatus.ARCHIVED) {
    return toDatasetItemResponse(existing);
  }

  const restoredStatus = existing.archivedFromStatus ?? DatasetStatus.DRAFT;
  const nextVersion = existing.version + 1;

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.datasetItem.update({
      where: { id },
      data: {
        status: restoredStatus,
        archivedAt: null,
        archivedFromStatus: null,
        version: nextVersion,
      },
      include: {
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
    });

    const response = toDatasetItemResponse(updated);
    await createVersionSnapshot(transaction, itemType, response, actor);
    await createApprovalHistory(transaction, itemType, id, existing.version, nextVersion, ApprovalAction.RESTORED, actor, notes);

    return response;
  });
}

export async function deleteDatasetItem(itemType: ApiDatasetItemType, id: string) {
  const definition = getDatasetEntityDefinition(itemType);
  const existing = await prisma.datasetItem.findUnique({ where: { id } });

  if (!existing || existing.itemType !== definition.dbType) {
    throw notFound(`${definition.label} not found`);
  }

  await prisma.datasetItem.delete({
    where: { id },
  });
}

export async function listDatasetVersions(itemType: ApiDatasetItemType, id: string) {
  await getDatasetItem(itemType, id);

  const versions = await prisma.datasetVersion.findMany({
    where: { itemId: id },
    orderBy: { version: 'desc' },
  });

  return {
    items: versions.map(toDatasetVersionResponse),
  };
}

export async function listApprovalHistory(itemType: ApiDatasetItemType, id: string) {
  await getDatasetItem(itemType, id);

  const approvals = await prisma.approvalHistory.findMany({
    where: { itemId: id },
    orderBy: { createdAt: 'desc' },
  });

  return {
    items: approvals.map(toApprovalHistoryResponse),
  };
}
