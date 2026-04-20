import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ApprovalAction, DatasetItemType, DatasetStatus, type Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';

import { prisma } from '../../db/prisma.js';
import { buildDiffSummary } from '../../lib/diff.js';
import { badRequest } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { slugify } from '../../lib/slug.js';
import { buildOrderedExportObject, toDatasetItemResponse } from '../datasets/dataset.mapper.js';
import { componentCataloguePayloadSchema } from '../datasets/dataset.schemas.js';
import {
  componentCatalogueImportItemSchema,
  type ComponentCatalogueImportItem,
  type ComponentCatalogueImportRequest,
} from './import.schemas.js';

type ImportLogger = {
  info: (bindings: Record<string, unknown>, message?: string) => void;
  warn: (bindings: Record<string, unknown>, message?: string) => void;
  error: (bindings: Record<string, unknown>, message?: string) => void;
};

type NormalizationSummary = {
  namesTitleCased: number;
  categoriesNormalized: number;
  testTypesStandardized: number;
  arrayDuplicatesRemoved: number;
  emptyValuesRemoved: number;
};

type ExistingComponentRecord = {
  id: string;
  title: string;
  status: DatasetStatus;
  version: number;
  payload: z.infer<typeof componentCataloguePayloadSchema>;
};

const allowedCategories = new Set([
  'input',
  'selection',
  'navigation',
  'container',
  'feedback',
  'data_display',
  'visualization',
  'workflow',
  'upload_download',
  'media',
  'utility',
]);

const standardTestTypeMap: Record<string, string> = {
  smoke: 'smoke',
  functional: 'functional',
  integration: 'integration',
  api: 'api',
  regression: 'regression',
  e2e: 'e2e',
  'end to end': 'e2e',
  'end-to-end': 'e2e',
  performance: 'performance',
  security: 'security',
  accessibility: 'accessibility',
  usability: 'usability',
  compatibility: 'compatibility',
  'data integrity': 'data integrity',
  'data-integrity': 'data integrity',
  data_integrity: 'data integrity',
  recovery: 'recovery',
};

function createNormalizationSummary(): NormalizationSummary {
  return {
    namesTitleCased: 0,
    categoriesNormalized: 0,
    testTypesStandardized: 0,
    arrayDuplicatesRemoved: 0,
    emptyValuesRemoved: 0,
  };
}

function mergeNormalizationSummary(target: NormalizationSummary, source: NormalizationSummary) {
  target.namesTitleCased += source.namesTitleCased;
  target.categoriesNormalized += source.categoriesNormalized;
  target.testTypesStandardized += source.testTypesStandardized;
  target.arrayDuplicatesRemoved += source.arrayDuplicatesRemoved;
  target.emptyValuesRemoved += source.emptyValuesRemoved;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function toTitleCase(value: string) {
  return normalizeWhitespace(value)
    .split(' ')
    .map((token) => {
      const cleaned = token.replace(/[_-]+/g, ' ');
      return cleaned
        .split(' ')
        .map((part) => {
          if (!part) {
            return part;
          }

          if (/^[A-Z0-9]{2,4}$/.test(part)) {
            return part;
          }

          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(' ');
    })
    .join(' ');
}

function normalizeCategory(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase().replace(/[\/\s-]+/g, '_');

  if (!allowedCategories.has(normalized)) {
    throw new Error(`Unsupported category "${value}"`);
  }

  return normalized;
}

function normalizeTestType(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase().replace(/\s+/g, ' ');
  return standardTestTypeMap[normalized] ?? normalized;
}

function normalizeStringArray(
  values: string[],
  summary: NormalizationSummary,
  mapper: (value: string) => string = (value) => normalizeWhitespace(value),
) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const trimmed = normalizeWhitespace(rawValue);

    if (!trimmed) {
      summary.emptyValuesRemoved += 1;
      continue;
    }

    const normalized = mapper(trimmed);

    if (normalized !== trimmed) {
      summary.testTypesStandardized += 1;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      summary.arrayDuplicatesRemoved += 1;
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function normalizeWhereFound(
  values: ComponentCatalogueImportItem['whereFound'],
  summary: NormalizationSummary,
) {
  const result: Array<{ module: string; page: string; routeOrLocationHint: string }> = [];
  const seen = new Set<string>();

  for (const value of values) {
    const module = normalizeWhitespace(value.module);
    const page = normalizeWhitespace(value.page);
    const routeOrLocationHint = normalizeWhitespace(value.routeOrLocationHint);

    if (!module || !page) {
      summary.emptyValuesRemoved += 1;
      continue;
    }

    const dedupeKey = JSON.stringify({ module, page, routeOrLocationHint });

    if (seen.has(dedupeKey)) {
      summary.arrayDuplicatesRemoved += 1;
      continue;
    }

    seen.add(dedupeKey);
    result.push({ module, page, routeOrLocationHint });
  }

  return result;
}

function normalizeImportItem(rawItem: unknown) {
  const normalization = createNormalizationSummary();
  const parsed = componentCatalogueImportItemSchema.parse(rawItem);
  const normalizedName = toTitleCase(parsed.componentName);

  if (normalizedName !== parsed.componentName) {
    normalization.namesTitleCased += 1;
  }

  const normalizedCategory = normalizeCategory(parsed.category);

  if (normalizedCategory !== normalizeWhitespace(parsed.category).toLowerCase()) {
    normalization.categoriesNormalized += 1;
  }

  const applicableTestTypes = normalizeStringArray(parsed.applicableTestTypes, normalization, normalizeTestType);
  const tags = normalizeStringArray([normalizedCategory, ...applicableTestTypes], normalization);

  const payload = componentCataloguePayloadSchema.parse({
    componentId: normalizeWhitespace(parsed.componentId),
    name: normalizedName,
    aliases: [],
    category: normalizedCategory,
    description: normalizeWhitespace(parsed.description),
    whereFound: normalizeWhereFound(parsed.whereFound, normalization),
    variants: normalizeStringArray(parsed.variants, normalization),
    states: normalizeStringArray(parsed.visibleStates, normalization),
    validations: normalizeStringArray(parsed.visibleValidationsOrConstraints, normalization),
    commonActions: normalizeStringArray(parsed.commonActions, normalization),
    dependencies: normalizeStringArray(parsed.dependencies, normalization),
    commonRisks: normalizeStringArray(parsed.risks, normalization),
    applicableTestTypes,
    smokeScenarios: normalizeStringArray(parsed.smokeScenarios, normalization),
    functionalScenarios: normalizeStringArray(parsed.functionalScenarios, normalization),
    negativeScenarios: normalizeStringArray(parsed.negativeScenarios, normalization),
    edgeScenarios: normalizeStringArray(parsed.edgeScenarios, normalization),
    standardTestCases: normalizeStringArray(parsed.standardTestCases, normalization),
    accessibilityObservations: normalizeStringArray(parsed.accessibilityObservations, normalization),
    notes: normalizeWhitespace(parsed.notes),
    tags,
  });

  return {
    payload,
    normalization,
    componentIdKey: payload.componentId.trim().toLowerCase(),
    nameKey: payload.name.trim().toLowerCase(),
  };
}

function getFailureMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`).join('; ');
  }

  return error instanceof Error ? error.message : 'Unknown import error';
}

function countDiffEntries(diff: ReturnType<typeof buildDiffSummary>) {
  return diff.added.length + diff.removed.length + diff.modified.length;
}

function summarizeDiff(diff: ReturnType<typeof buildDiffSummary>) {
  const entries = [...diff.added, ...diff.removed, ...diff.modified];
  const paths = entries.slice(0, 8).map((entry) => entry.path);

  if (!paths.length) {
    return 'No payload changes';
  }

  return `Changed ${entries.length} field(s): ${paths.join(', ')}${entries.length > paths.length ? ', ...' : ''}`;
}

async function generateUniqueSlug(title: string, excludeId?: string) {
  const baseSlug = slugify(title) || 'component';
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await prisma.datasetItem.findFirst({
      where: {
        itemType: DatasetItemType.COMPONENT_CATALOGUE,
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
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
  item: Parameters<typeof toDatasetItemResponse>[0],
  actor: string,
) {
  const response = toDatasetItemResponse(item);

  await transaction.datasetVersion.create({
    data: {
      itemId: item.id,
      itemType: DatasetItemType.COMPONENT_CATALOGUE,
      version: item.version,
      createdBy: actor,
      snapshot: toPrismaJson(buildOrderedExportObject('componentCatalogue', response)),
    },
  });
}

async function createApprovalRecord(
  transaction: Prisma.TransactionClient,
  itemId: string,
  versionBefore: number,
  versionAfter: number,
  action: ApprovalAction,
  actor: string,
  notes: string,
) {
  await transaction.approvalHistory.create({
    data: {
      itemId,
      itemType: DatasetItemType.COMPONENT_CATALOGUE,
      versionBefore,
      versionAfter,
      action,
      actor,
      notes,
    },
  });
}

async function resolveImportPath(filePath: string) {
  const candidatePaths = [
    path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), '..', filePath),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const rawText = await readFile(candidatePath, 'utf8');
      return {
        source: candidatePath,
        rawText,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw badRequest('Component catalogue file could not be found.', {
    filePath,
    searchedPaths: candidatePaths,
  });
}

async function readImportSource(input: ComponentCatalogueImportRequest) {
  if (input.jsonText) {
    return {
      source: 'jsonText',
      rawText: input.jsonText,
    };
  }

  return resolveImportPath(input.filePath!);
}

async function loadExistingComponents(logger: ImportLogger) {
  const records = await prisma.datasetItem.findMany({
    where: {
      itemType: DatasetItemType.COMPONENT_CATALOGUE,
    },
  });

  const byComponentId = new Map<string, ExistingComponentRecord>();
  const byName = new Map<string, ExistingComponentRecord>();

  for (const record of records) {
    const parsed = componentCataloguePayloadSchema.safeParse(record.data);

    if (!parsed.success) {
      logger.warn({ itemId: record.id }, 'Skipping existing component with unparsable payload during import indexing');
      continue;
    }

    const indexedRecord: ExistingComponentRecord = {
      id: record.id,
      title: record.title,
      status: record.status,
      version: record.version,
      payload: parsed.data,
    };

    byName.set(record.title.trim().toLowerCase(), indexedRecord);

    if (parsed.data.componentId.trim()) {
      byComponentId.set(parsed.data.componentId.trim().toLowerCase(), indexedRecord);
    }
  }

  return { byComponentId, byName };
}

export async function importComponentCatalogue(
  input: ComponentCatalogueImportRequest,
  actor: string,
  logger: ImportLogger,
) {
  const { source, rawText } = await readImportSource(input);

  logger.info({ source, dryRun: input.dryRun }, 'Starting component catalogue import');

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    throw badRequest('Invalid JSON in component catalogue input.', {
      source,
      message: error instanceof Error ? error.message : 'Unknown parse error',
    });
  }

  if (!Array.isArray(parsedJson)) {
    throw badRequest('Component catalogue import expects a JSON array.', {
      source,
    });
  }

  const existing = await loadExistingComponents(logger);
  const seenComponentIds = new Set<string>();
  const seenNames = new Set<string>();
  const normalization = createNormalizationSummary();
  const summary = {
    dryRun: input.dryRun,
    source,
    totalProcessed: parsedJson.length,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    failed: 0,
    insertedIds: [] as string[],
    updatedIds: [] as string[],
    failures: [] as Array<{ index: number; componentId: string | null; componentName: string | null; message: string }>,
    normalization,
  };

  for (const [index, rawItem] of parsedJson.entries()) {
    let componentId: string | null = null;
    let componentName: string | null = null;

    try {
      const normalized = normalizeImportItem(rawItem);
      mergeNormalizationSummary(normalization, normalized.normalization);
      componentId = normalized.payload.componentId;
      componentName = normalized.payload.name;

      if (normalized.componentIdKey) {
        if (seenComponentIds.has(normalized.componentIdKey)) {
          throw new Error(`Duplicate componentId "${normalized.payload.componentId}" inside the import file`);
        }

        seenComponentIds.add(normalized.componentIdKey);
      }

      if (seenNames.has(normalized.nameKey)) {
        throw new Error(`Duplicate componentName "${normalized.payload.name}" inside the import file`);
      }

      seenNames.add(normalized.nameKey);

      const matchById = normalized.componentIdKey ? existing.byComponentId.get(normalized.componentIdKey) : undefined;
      const matchByName = existing.byName.get(normalized.nameKey);

      if (matchById && matchByName && matchById.id !== matchByName.id) {
        throw new Error('componentId and componentName match different existing records');
      }

      const existingRecord = matchById ?? matchByName;

      if (!existingRecord) {
        summary.inserted += 1;

        logger.info({ index, componentId, componentName, dryRun: input.dryRun }, 'Prepared new component catalogue insert');

        if (!input.dryRun) {
          const slug = await generateUniqueSlug(normalized.payload.name);
          const created = await prisma.$transaction(async (transaction) => {
            const record = await transaction.datasetItem.create({
              data: {
                itemType: DatasetItemType.COMPONENT_CATALOGUE,
                slug,
                title: normalized.payload.name,
                summary: normalized.payload.description || null,
                tags: normalized.payload.tags,
                status: DatasetStatus.APPROVED,
                version: 1,
                data: toPrismaJson(normalized.payload),
              },
            });

            await createVersionSnapshot(transaction, record, actor);
            await createApprovalRecord(
              transaction,
              record.id,
              0,
              1,
              ApprovalAction.MANUAL_CREATE,
              actor,
              `Imported from component catalogue (${source})`,
            );

            return record;
          });

          summary.insertedIds.push(created.id);

          const indexedRecord: ExistingComponentRecord = {
            id: created.id,
            title: created.title,
            status: created.status,
            version: created.version,
            payload: normalized.payload,
          };
          existing.byName.set(normalized.nameKey, indexedRecord);
          if (normalized.componentIdKey) {
            existing.byComponentId.set(normalized.componentIdKey, indexedRecord);
          }
        }

        continue;
      }

      const diff = buildDiffSummary(existingRecord.payload, normalized.payload);
      const requiresStatusUpdate = existingRecord.status !== DatasetStatus.APPROVED;
      const hasMeaningfulChanges = countDiffEntries(diff) > 0 || requiresStatusUpdate;

      if (!hasMeaningfulChanges) {
        summary.duplicates += 1;
        logger.info({ index, componentId, componentName, itemId: existingRecord.id }, 'Duplicate component import skipped with no meaningful changes');
        continue;
      }

      const diffSummary = summarizeDiff(diff);
      summary.updated += 1;
      logger.info({ index, componentId, componentName, itemId: existingRecord.id, diffSummary, dryRun: input.dryRun }, 'Prepared component catalogue update');

      if (!input.dryRun) {
        const nextVersion = existingRecord.version + 1;
        const slug = await generateUniqueSlug(normalized.payload.name, existingRecord.id);
        const updated = await prisma.$transaction(async (transaction) => {
          const record = await transaction.datasetItem.update({
            where: { id: existingRecord.id },
            data: {
              slug,
              title: normalized.payload.name,
              summary: normalized.payload.description || null,
              tags: normalized.payload.tags,
              status: DatasetStatus.APPROVED,
              archivedAt: null,
              archivedFromStatus: null,
              version: nextVersion,
              data: toPrismaJson(normalized.payload),
            },
          });

          await createVersionSnapshot(transaction, record, actor);
          await createApprovalRecord(
            transaction,
            record.id,
            existingRecord.version,
            nextVersion,
            ApprovalAction.MANUAL_UPDATE,
            actor,
            `Imported from component catalogue (${source}). ${diffSummary}`,
          );

          return record;
        });

        summary.updatedIds.push(updated.id);
        const indexedRecord: ExistingComponentRecord = {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          version: updated.version,
          payload: normalized.payload,
        };
        existing.byName.set(normalized.nameKey, indexedRecord);
        if (normalized.componentIdKey) {
          existing.byComponentId.set(normalized.componentIdKey, indexedRecord);
        }
      }
    } catch (error) {
      summary.failed += 1;
      const message = getFailureMessage(error);
      summary.failures.push({
        index,
        componentId,
        componentName,
        message,
      });
      logger.warn({ index, componentId, componentName, message }, 'Component catalogue import item failed');
    }
  }

  logger.info(
    {
      source,
      dryRun: input.dryRun,
      totalProcessed: summary.totalProcessed,
      inserted: summary.inserted,
      updated: summary.updated,
      duplicates: summary.duplicates,
      failed: summary.failed,
    },
    'Completed component catalogue import',
  );

  return summary;
}
