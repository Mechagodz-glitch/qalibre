import { randomUUID } from 'node:crypto';

import {
  ApprovalAction,
  DatasetStatus,
  DraftReviewStatus,
  RefinementMode,
  RefinementRunStatus,
  type Prisma,
} from '@prisma/client';

import { prisma } from '../../db/prisma.js';
import { buildDiffSummary } from '../../lib/diff.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { slugify } from '../../lib/slug.js';
import {
  buildOrderedExportObject,
  deriveMetadataFromPayload,
  parsePayloadForItemType,
  toDatasetItemResponse,
} from '../datasets/dataset.mapper.js';
import { getDatasetEntityDefinition, toApiDatasetItemType } from '../datasets/dataset.registry.js';
import type { ApiDatasetItemType } from '../datasets/dataset.schemas.js';
import { runRefinementWithOpenAi } from './openai.service.js';
import type { ApiRefinementMode } from './refinement.schemas.js';

const apiToDbModeMap: Record<ApiRefinementMode, RefinementMode> = {
  normalize: RefinementMode.NORMALIZE,
  expand: RefinementMode.EXPAND,
  deduplicate: RefinementMode.DEDUPLICATE,
  classify: RefinementMode.CLASSIFY,
  strengthen: RefinementMode.STRENGTHEN,
  generateStarterDataset: RefinementMode.GENERATE_STARTER_DATASET,
};

const dbToApiModeMap: Record<RefinementMode, ApiRefinementMode> = {
  [RefinementMode.NORMALIZE]: 'normalize',
  [RefinementMode.EXPAND]: 'expand',
  [RefinementMode.DEDUPLICATE]: 'deduplicate',
  [RefinementMode.CLASSIFY]: 'classify',
  [RefinementMode.STRENGTHEN]: 'strengthen',
  [RefinementMode.GENERATE_STARTER_DATASET]: 'generateStarterDataset',
};

const dbToApiRunStatusMap: Record<RefinementRunStatus, 'pending' | 'completed' | 'failed'> = {
  [RefinementRunStatus.PENDING]: 'pending',
  [RefinementRunStatus.COMPLETED]: 'completed',
  [RefinementRunStatus.FAILED]: 'failed',
};

const dbToApiDraftStatusMap: Record<DraftReviewStatus, 'pending' | 'approved' | 'rejected'> = {
  [DraftReviewStatus.PENDING]: 'pending',
  [DraftReviewStatus.APPROVED]: 'approved',
  [DraftReviewStatus.REJECTED]: 'rejected',
};

const errorMessageFor = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown refinement error';
};

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

function toRunSummary(
  run: Prisma.RefinementRunGetPayload<{
    include: {
      item: {
        select: {
          title: true;
        };
      };
      draft: {
        select: {
          id: true;
        };
      };
    };
  }>,
) {
  return {
    id: run.id,
    itemType: toApiDatasetItemType(run.itemType),
    itemId: run.itemId,
    itemTitle: run.item.title,
    mode: dbToApiModeMap[run.mode],
    model: run.model,
    status: dbToApiRunStatusMap[run.status],
    errorMessage: run.errorMessage ?? null,
    correlationId: run.correlationId,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    draftId: run.draft?.id ?? null,
  };
}

function toRunDetail(
  run: Prisma.RefinementRunGetPayload<{
    include: {
      item: {
        select: {
          title: true;
        };
      };
      draft: {
        select: {
          id: true;
        };
      };
    };
  }>,
) {
  return {
    ...toRunSummary(run),
    requestPayload: (run.requestPayload ?? {}) as Record<string, unknown>,
    rawResponse: run.rawResponse ?? null,
    parsedResponse: run.parsedResponse ?? null,
  };
}

function toDraftResponse(
  draft: Prisma.RefinementDraftGetPayload<{
    include: {
      item: {
        select: {
          title: true;
        };
      };
      run: {
        select: {
          mode: true;
          model: true;
        };
      };
    };
  }>,
) {
  return {
    id: draft.id,
    runId: draft.runId,
    itemType: toApiDatasetItemType(draft.itemType),
    itemId: draft.itemId,
    itemTitle: draft.item.title,
    mode: dbToApiModeMap[draft.run.mode],
    model: draft.run.model,
    reviewStatus: dbToApiDraftStatusMap[draft.reviewStatus],
    confidence: draft.confidence,
    reviewerNotes: draft.reviewerNotes ?? null,
    originalData: draft.originalData as Record<string, unknown>,
    refinedData: draft.refinedData as Record<string, unknown>,
    diffSummary: draft.diffSummary as {
      added: Array<{ path: string; before?: unknown; after?: unknown }>;
      removed: Array<{ path: string; before?: unknown; after?: unknown }>;
      modified: Array<{ path: string; before?: unknown; after?: unknown }>;
      aiSummary: string[];
    },
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export async function bulkRefineItems(input: {
  itemType: ApiDatasetItemType;
  itemIds: string[];
  mode: ApiRefinementMode;
  requestCorrelationId?: string;
}) {
  const definition = getDatasetEntityDefinition(input.itemType);
  const items = await prisma.datasetItem.findMany({
    where: {
      id: {
        in: input.itemIds,
      },
      itemType: definition.dbType,
    },
  });

  if (items.length !== input.itemIds.length) {
    const foundIds = new Set(items.map((item) => item.id));
    const missingIds = input.itemIds.filter((id) => !foundIds.has(id));
    throw badRequest(`Some items could not be found for refinement: ${missingIds.join(', ')}`);
  }

  const archivedIds = items.filter((item) => item.status === DatasetStatus.ARCHIVED).map((item) => item.id);
  if (archivedIds.length > 0) {
    throw badRequest(`Archived items cannot be refined: ${archivedIds.join(', ')}`);
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const runIds: string[] = [];
  const draftIds: string[] = [];
  let completed = 0;
  let failed = 0;

  for (const itemId of input.itemIds) {
    const item = itemById.get(itemId);
    if (!item) {
      continue;
    }

    const payload = parsePayloadForItemType<Record<string, unknown>>(input.itemType, item.data);
    const correlationId = `${input.requestCorrelationId ?? randomUUID()}:${item.id}`;
    const run = await prisma.refinementRun.create({
      data: {
        itemType: definition.dbType,
        itemId: item.id,
        mode: apiToDbModeMap[input.mode],
        model: '',
        requestPayload: toPrismaJson({
          itemType: input.itemType,
          itemId: item.id,
          mode: input.mode,
          payload,
        }),
        status: RefinementRunStatus.PENDING,
        correlationId,
      },
    });

    runIds.push(run.id);

    try {
      const result = await runRefinementWithOpenAi({
        itemType: input.itemType,
        mode: input.mode,
        payload,
        correlationId,
      });

      const diffSummary = buildDiffSummary(payload, result.parsedResponse.refinedData);

      const createdDraft = await prisma.$transaction(async (transaction) => {
        await transaction.refinementRun.update({
          where: { id: run.id },
          data: {
            model: result.model,
            requestPayload: toPrismaJson(result.requestPayload),
            rawResponse: toPrismaJson(result.rawResponse),
            parsedResponse: toPrismaJson(result.parsedResponse),
            status: RefinementRunStatus.COMPLETED,
            errorMessage: null,
          },
        });

        return transaction.refinementDraft.create({
          data: {
            runId: run.id,
            itemType: definition.dbType,
            itemId: item.id,
            originalData: toPrismaJson(payload),
            refinedData: toPrismaJson(result.parsedResponse.refinedData),
            diffSummary: toPrismaJson({
              ...diffSummary,
              aiSummary: result.parsedResponse.changeSummary,
            }),
            confidence: result.parsedResponse.confidence,
          },
        });
      });

      draftIds.push(createdDraft.id);
      completed += 1;
    } catch (error) {
      failed += 1;
      await prisma.refinementRun.update({
        where: { id: run.id },
        data: {
          status: RefinementRunStatus.FAILED,
          errorMessage: errorMessageFor(error),
        },
      });
    }
  }

  return {
    requested: input.itemIds.length,
    completed,
    failed,
    runIds,
    draftIds,
  };
}

export async function listRefinementRuns(query: {
  page: number;
  pageSize: number;
  itemType?: ApiDatasetItemType;
  status?: 'pending' | 'completed' | 'failed';
}) {
  const where: Prisma.RefinementRunWhereInput = {
    ...(query.itemType
      ? {
          itemType: getDatasetEntityDefinition(query.itemType).dbType,
        }
      : {}),
    ...(query.status
      ? {
          status:
            query.status === 'pending'
              ? RefinementRunStatus.PENDING
              : query.status === 'completed'
                ? RefinementRunStatus.COMPLETED
                : RefinementRunStatus.FAILED,
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.refinementRun.findMany({
      where,
      include: {
        item: {
          select: {
            title: true,
          },
        },
        draft: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.refinementRun.count({ where }),
  ]);

  return {
    items: items.map(toRunSummary),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getRefinementRun(runId: string) {
  const run = await prisma.refinementRun.findUnique({
    where: { id: runId },
    include: {
      item: {
        select: {
          title: true,
        },
      },
      draft: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!run) {
    throw notFound('Refinement run not found');
  }

  return toRunDetail(run);
}

export async function listRefinementDrafts(query: {
  page: number;
  pageSize: number;
  itemType?: ApiDatasetItemType;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
}) {
  const where: Prisma.RefinementDraftWhereInput = {
    ...(query.itemType
      ? {
          itemType: getDatasetEntityDefinition(query.itemType).dbType,
        }
      : {}),
    ...(query.reviewStatus
      ? {
          reviewStatus:
            query.reviewStatus === 'pending'
              ? DraftReviewStatus.PENDING
              : query.reviewStatus === 'approved'
                ? DraftReviewStatus.APPROVED
                : DraftReviewStatus.REJECTED,
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.refinementDraft.findMany({
      where,
      include: {
        item: {
          select: {
            title: true,
          },
        },
        run: {
          select: {
            mode: true,
            model: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.refinementDraft.count({ where }),
  ]);

  return {
    items: items.map(toDraftResponse),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getRefinementDraft(draftId: string) {
  const draft = await prisma.refinementDraft.findUnique({
    where: { id: draftId },
    include: {
      item: {
        select: {
          title: true,
        },
      },
      run: {
        select: {
          mode: true,
          model: true,
        },
      },
    },
  });

  if (!draft) {
    throw notFound('Refinement draft not found');
  }

  return toDraftResponse(draft);
}

export async function approveRefinementDraft(draftId: string, actor: string, notes?: string) {
  const draft = await prisma.refinementDraft.findUnique({
    where: { id: draftId },
    include: {
      item: true,
      run: {
        select: {
          mode: true,
          model: true,
        },
      },
    },
  });

  if (!draft) {
    throw notFound('Refinement draft not found');
  }

  if (draft.reviewStatus !== DraftReviewStatus.PENDING) {
    throw conflict('Only pending drafts can be approved');
  }

  const itemType = toApiDatasetItemType(draft.itemType);
  const payload = parsePayloadForItemType<Record<string, unknown>>(itemType, draft.refinedData);
  const metadata = deriveMetadataFromPayload(itemType, payload);
  const slug = await generateUniqueSlug(itemType, metadata.title, draft.itemId);
  const nextVersion = draft.item.version + 1;

  const updated = await prisma.$transaction(async (transaction) => {
    const item = await transaction.datasetItem.update({
      where: { id: draft.itemId },
      data: {
        slug,
        title: metadata.title,
        summary: metadata.summary,
        tags: metadata.tags,
        data: toPrismaJson(payload),
        status: DatasetStatus.APPROVED,
        archivedAt: null,
        archivedFromStatus: null,
        version: nextVersion,
      },
    });

    const itemResponse = toDatasetItemResponse(item);

    await transaction.datasetVersion.create({
      data: {
        itemId: item.id,
        itemType: draft.itemType,
        version: nextVersion,
        snapshot: toPrismaJson(buildOrderedExportObject(itemType, itemResponse)),
        createdBy: actor,
      },
    });

    await transaction.approvalHistory.create({
      data: {
        itemId: item.id,
        itemType: draft.itemType,
        versionBefore: draft.item.version,
        versionAfter: nextVersion,
        action: ApprovalAction.AI_APPROVED,
        actor,
        notes: notes ?? null,
      },
    });

    const updatedDraft = await transaction.refinementDraft.update({
      where: { id: draftId },
      data: {
        reviewStatus: DraftReviewStatus.APPROVED,
        reviewerNotes: notes ?? null,
      },
      include: {
        item: {
          select: {
            title: true,
          },
        },
        run: {
          select: {
            mode: true,
            model: true,
          },
        },
      },
    });

    return {
      item: itemResponse,
      draft: toDraftResponse(updatedDraft),
    };
  });

  return updated;
}

export async function rejectRefinementDraft(draftId: string, actor: string, notes?: string) {
  const draft = await prisma.refinementDraft.findUnique({
    where: { id: draftId },
    include: {
      item: true,
      run: {
        select: {
          mode: true,
          model: true,
        },
      },
    },
  });

  if (!draft) {
    throw notFound('Refinement draft not found');
  }

  if (draft.reviewStatus !== DraftReviewStatus.PENDING) {
    throw conflict('Only pending drafts can be rejected');
  }

  const updatedDraft = await prisma.$transaction(async (transaction) => {
    await transaction.approvalHistory.create({
      data: {
        itemId: draft.itemId,
        itemType: draft.itemType,
        versionBefore: draft.item.version,
        versionAfter: draft.item.version,
        action: ApprovalAction.AI_REJECTED,
        actor,
        notes: notes ?? null,
      },
    });

    return transaction.refinementDraft.update({
      where: { id: draftId },
      data: {
        reviewStatus: DraftReviewStatus.REJECTED,
        reviewerNotes: notes ?? null,
      },
      include: {
        item: {
          select: {
            title: true,
          },
        },
        run: {
          select: {
            mode: true,
            model: true,
          },
        },
      },
    });
  });

  return {
    draft: toDraftResponse(updatedDraft),
  };
}
