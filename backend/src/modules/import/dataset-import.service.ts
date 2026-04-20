import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { DatasetStatus } from '@prisma/client';
import { ZodError } from 'zod';

import { prisma } from '../../db/prisma.js';
import { buildDiffSummary } from '../../lib/diff.js';
import { badRequest } from '../../lib/errors.js';
import {
  createDatasetItem,
  updateDatasetItem,
} from '../datasets/dataset.service.js';
import {
  deriveMetadataFromPayload,
  parsePayloadForItemType,
} from '../datasets/dataset.mapper.js';
import type { ApiDatasetItemType } from '../datasets/dataset.schemas.js';
import { getDatasetEntityDefinition } from '../datasets/dataset.registry.js';
import type { DatasetImportRequest } from './import.schemas.js';

type ImportLogger = {
  info: (bindings: Record<string, unknown>, message?: string) => void;
  warn: (bindings: Record<string, unknown>, message?: string) => void;
  error: (bindings: Record<string, unknown>, message?: string) => void;
};

type DatasetImportNormalizationSummary = {
  namesTitleCased: number;
  prioritiesNormalized: number;
  testTypesStandardized: number;
  tagsNormalized: number;
  arrayDuplicatesRemoved: number;
  emptyValuesRemoved: number;
};

type ExistingDatasetRecord = {
  id: string;
  title: string;
  status: 'draft' | 'approved' | 'archived';
  version: number;
  payload: Record<string, unknown>;
};

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

const standardPriorityMap: Record<string, string> = {
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
  p3: 'P3',
};

function createNormalizationSummary(): DatasetImportNormalizationSummary {
  return {
    namesTitleCased: 0,
    prioritiesNormalized: 0,
    testTypesStandardized: 0,
    tagsNormalized: 0,
    arrayDuplicatesRemoved: 0,
    emptyValuesRemoved: 0,
  };
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

function normalizeTestType(value: string, summary: DatasetImportNormalizationSummary) {
  const normalized = normalizeWhitespace(value).toLowerCase().replace(/\s+/g, ' ');
  const mapped = standardTestTypeMap[normalized] ?? normalized;

  if (mapped !== normalizeWhitespace(value)) {
    summary.testTypesStandardized += 1;
  }

  return mapped;
}

function normalizePriority(value: string, summary: DatasetImportNormalizationSummary) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const mapped = standardPriorityMap[normalized] ?? normalizeWhitespace(value).toUpperCase();

  if (mapped !== value) {
    summary.prioritiesNormalized += 1;
  }

  return mapped;
}

function normalizeTag(value: string, summary: DatasetImportNormalizationSummary) {
  const mapped = normalizeWhitespace(value).toLowerCase().replace(/[\/\s_]+/g, '-');

  if (mapped !== value) {
    summary.tagsNormalized += 1;
  }

  return mapped;
}

function normalizeStringArray(
  values: unknown,
  summary: DatasetImportNormalizationSummary,
  mapper: (value: string) => string = (value) => normalizeWhitespace(value),
) {
  const input = Array.isArray(values) ? values : [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of input) {
    if (typeof rawValue !== 'string') {
      continue;
    }

    const trimmed = normalizeWhitespace(rawValue);

    if (!trimmed) {
      summary.emptyValuesRemoved += 1;
      continue;
    }

    const normalized = mapper(trimmed);
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

function normalizeRulePackPayload(rawPayload: Record<string, unknown>) {
  const normalization = createNormalizationSummary();
  const normalizedName = toTitleCase(String(rawPayload.name ?? ''));

  if (normalizedName !== normalizeWhitespace(String(rawPayload.name ?? ''))) {
    normalization.namesTitleCased += 1;
  }

  const payload = getDatasetEntityDefinition('rulePack').payloadSchema.parse({
    name: normalizedName,
    description: normalizeWhitespace(String(rawPayload.description ?? '')),
    appliesToFeatureTypes: normalizeStringArray(rawPayload.appliesToFeatureTypes, normalization, toTitleCase),
    appliesToComponents: normalizeStringArray(rawPayload.appliesToComponents, normalization, toTitleCase),
    mandatoryScenarios: normalizeStringArray(rawPayload.mandatoryScenarios, normalization),
    negativeHeuristics: normalizeStringArray(rawPayload.negativeHeuristics, normalization),
    edgeHeuristics: normalizeStringArray(rawPayload.edgeHeuristics, normalization),
    securityHeuristics: normalizeStringArray(rawPayload.securityHeuristics, normalization),
    performanceHeuristics: normalizeStringArray(rawPayload.performanceHeuristics, normalization),
    accessibilityHeuristics: normalizeStringArray(rawPayload.accessibilityHeuristics, normalization),
    defaultPriority: normalizePriority(String(rawPayload.defaultPriority ?? 'P2'), normalization),
    tags: normalizeStringArray(rawPayload.tags, normalization, (value) => normalizeTag(value, normalization)),
  }) as Record<string, unknown>;

  return { payload, normalization };
}

function normalizeFeatureTypePayload(rawPayload: Record<string, unknown>) {
  const normalization = createNormalizationSummary();
  const normalizedName = toTitleCase(String(rawPayload.name ?? ''));

  if (normalizedName !== normalizeWhitespace(String(rawPayload.name ?? ''))) {
    normalization.namesTitleCased += 1;
  }

  const payload = getDatasetEntityDefinition('featureType').payloadSchema.parse({
    name: normalizedName,
    description: normalizeWhitespace(String(rawPayload.description ?? '')),
    applicableComponents: normalizeStringArray(rawPayload.applicableComponents, normalization, toTitleCase),
    applicableRulePacks: normalizeStringArray(rawPayload.applicableRulePacks, normalization, toTitleCase),
    applicableTestTypes: normalizeStringArray(rawPayload.applicableTestTypes, normalization, (value) =>
      normalizeTestType(value, normalization),
    ),
    defaultScenarioBuckets: normalizeStringArray(rawPayload.defaultScenarioBuckets, normalization),
    tags: normalizeStringArray(rawPayload.tags, normalization, (value) => normalizeTag(value, normalization)),
  }) as Record<string, unknown>;

  return { payload, normalization };
}

function normalizeDatasetPayload(itemType: ApiDatasetItemType, rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new Error('Each imported record must be a JSON object.');
  }

  const payloadObject = rawPayload as Record<string, unknown>;

  if (itemType === 'rulePack') {
    return normalizeRulePackPayload(payloadObject);
  }

  if (itemType === 'featureType') {
    return normalizeFeatureTypePayload(payloadObject);
  }

  return {
    payload: getDatasetEntityDefinition(itemType).payloadSchema.parse(payloadObject) as Record<string, unknown>,
    normalization: createNormalizationSummary(),
  };
}

function mergeNormalizationSummary(
  target: DatasetImportNormalizationSummary,
  source: DatasetImportNormalizationSummary,
) {
  target.namesTitleCased += source.namesTitleCased;
  target.prioritiesNormalized += source.prioritiesNormalized;
  target.testTypesStandardized += source.testTypesStandardized;
  target.tagsNormalized += source.tagsNormalized;
  target.arrayDuplicatesRemoved += source.arrayDuplicatesRemoved;
  target.emptyValuesRemoved += source.emptyValuesRemoved;
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

  throw badRequest('Dataset import file could not be found.', {
    filePath,
    searchedPaths: candidatePaths,
  });
}

async function readImportSource(input: DatasetImportRequest) {
  if (input.jsonText) {
    return {
      source: 'jsonText',
      rawText: input.jsonText,
    };
  }

  return resolveImportPath(input.filePath!);
}

async function loadExistingItems(itemType: ApiDatasetItemType, logger: ImportLogger) {
  const definition = getDatasetEntityDefinition(itemType);
  const records = await prisma.datasetItem.findMany({
    where: {
      itemType: definition.dbType,
    },
  });

  const byTitle = new Map<string, ExistingDatasetRecord>();

  for (const record of records) {
    try {
      const payload = parsePayloadForItemType<Record<string, unknown>>(itemType, record.data);
      byTitle.set(record.title.trim().toLowerCase(), {
        id: record.id,
        title: record.title,
        status:
          record.status === DatasetStatus.APPROVED
            ? 'approved'
            : record.status === DatasetStatus.ARCHIVED
              ? 'archived'
              : 'draft',
        version: record.version,
        payload,
      });
    } catch {
      logger.warn({ itemId: record.id, itemType }, 'Skipping existing record with unparsable payload during import indexing');
    }
  }

  return byTitle;
}

export async function importDatasetPayloads(
  itemType: ApiDatasetItemType,
  input: DatasetImportRequest,
  actor: string,
  logger: ImportLogger,
) {
  const { source, rawText } = await readImportSource(input);

  logger.info({ itemType, source, dryRun: input.dryRun }, 'Starting dataset payload import');

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    throw badRequest('Invalid JSON in dataset import input.', {
      itemType,
      source,
      message: error instanceof Error ? error.message : 'Unknown parse error',
    });
  }

  if (!Array.isArray(parsedJson)) {
    throw badRequest('Dataset import expects a JSON array.', {
      itemType,
      source,
    });
  }

  const existingByTitle = await loadExistingItems(itemType, logger);
  const seenTitles = new Set<string>();
  const normalization = createNormalizationSummary();
  const summary = {
    itemType,
    dryRun: input.dryRun,
    source,
    totalProcessed: parsedJson.length,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    failed: 0,
    insertedIds: [] as string[],
    updatedIds: [] as string[],
    failures: [] as Array<{ index: number; title: string | null; message: string }>,
    normalization,
  };

  for (const [index, rawItem] of parsedJson.entries()) {
    let title: string | null = null;

    try {
      const normalized = normalizeDatasetPayload(itemType, rawItem);
      mergeNormalizationSummary(normalization, normalized.normalization);
      const metadata = deriveMetadataFromPayload(itemType, normalized.payload);
      const titleKey = metadata.title.trim().toLowerCase();
      title = metadata.title;

      if (seenTitles.has(titleKey)) {
        throw new Error(`Duplicate title "${metadata.title}" inside the import file`);
      }

      seenTitles.add(titleKey);
      const existing = existingByTitle.get(titleKey);

      if (!existing) {
        summary.inserted += 1;
        logger.info({ itemType, index, title, dryRun: input.dryRun }, 'Prepared dataset insert');

        if (!input.dryRun) {
          const created = await createDatasetItem(
            itemType,
            {
              payload: normalized.payload,
              status: 'approved',
            },
            actor,
          );

          summary.insertedIds.push(created.id);
          existingByTitle.set(titleKey, {
            id: created.id,
            title: created.title,
            status: created.status,
            version: created.version,
            payload: created.payload,
          });
        }

        continue;
      }

      const diff = buildDiffSummary(existing.payload, normalized.payload);
      const requiresStatusUpdate = existing.status !== 'approved';
      const hasMeaningfulChanges = countDiffEntries(diff) > 0 || requiresStatusUpdate;

      if (!hasMeaningfulChanges) {
        summary.duplicates += 1;
        logger.info({ itemType, index, title, itemId: existing.id }, 'Duplicate dataset import skipped with no meaningful changes');
        continue;
      }

      summary.updated += 1;
      logger.info({ itemType, index, title, itemId: existing.id, dryRun: input.dryRun }, 'Prepared dataset update');

      if (!input.dryRun) {
        const updated = await updateDatasetItem(
          itemType,
          existing.id,
          {
            payload: normalized.payload,
            status: 'approved',
          },
          actor,
        );

        summary.updatedIds.push(updated.id);
        existingByTitle.set(titleKey, {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          version: updated.version,
          payload: updated.payload,
        });
      }
    } catch (error) {
      summary.failed += 1;
      const message = getFailureMessage(error);
      summary.failures.push({ index, title, message });
      logger.warn({ itemType, index, title, message }, 'Dataset import item failed');
    }
  }

  logger.info(
    {
      itemType,
      source,
      dryRun: input.dryRun,
      totalProcessed: summary.totalProcessed,
      inserted: summary.inserted,
      updated: summary.updated,
      duplicates: summary.duplicates,
      failed: summary.failed,
    },
    'Completed dataset payload import',
  );

  return summary;
}
