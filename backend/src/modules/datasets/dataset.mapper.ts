import type { ApprovalHistory, DatasetItem, DatasetVersion, Prisma } from '@prisma/client';

import { getDatasetEntityDefinition, toApiDatasetItemType, toApiDatasetStatus } from './dataset.registry.js';
import type { ApiDatasetItemType } from './dataset.schemas.js';

type DatasetRecord = Pick<
  DatasetItem,
  | 'id'
  | 'itemType'
  | 'title'
  | 'summary'
  | 'tags'
  | 'status'
  | 'version'
  | 'archivedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'data'
>;

type ScopedDatasetRecord = DatasetRecord & {
  project?: { id: string; name: string } | null;
  module?: { id: string; name: string } | null;
  page?: { id: string; name: string } | null;
  scopeLevel?: string | null;
};

export function parsePayloadForItemType<TPayload>(
  itemType: ApiDatasetItemType,
  payload: Prisma.JsonValue,
): TPayload {
  const definition = getDatasetEntityDefinition(itemType);
  return definition.payloadSchema.parse(payload) as TPayload;
}

export function toDatasetItemResponse(record: ScopedDatasetRecord) {
  const itemType = toApiDatasetItemType(record.itemType);
  const payload = parsePayloadForItemType<Record<string, unknown>>(itemType, record.data);

  return {
    id: record.id,
    itemType,
    title: record.title,
    summary: record.summary ?? null,
    tags: [...record.tags],
    status: toApiDatasetStatus(record.status),
    version: record.version,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    project: record.project ? { id: record.project.id, name: record.project.name } : null,
    module: record.module ? { id: record.module.id, name: record.module.name } : null,
    page: record.page ? { id: record.page.id, name: record.page.name } : null,
    scopeLevel: record.scopeLevel ? record.scopeLevel.toLowerCase() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    payload,
  };
}

export function toDatasetVersionResponse(version: DatasetVersion) {
  return {
    id: version.id,
    version: version.version,
    snapshot: version.snapshot as Record<string, unknown>,
    createdAt: version.createdAt.toISOString(),
    createdBy: version.createdBy,
  };
}

export function toApprovalHistoryResponse(record: ApprovalHistory) {
  return {
    id: record.id,
    itemType: toApiDatasetItemType(record.itemType),
    versionBefore: record.versionBefore,
    versionAfter: record.versionAfter,
    action: record.action,
    actor: record.actor,
    notes: record.notes ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function buildOrderedExportObject(
  itemType: ApiDatasetItemType,
  record: ReturnType<typeof toDatasetItemResponse>,
) {
  const definition = getDatasetEntityDefinition(itemType);
  const orderedEntries = definition.exportFieldOrder.map((fieldName) => {
    switch (fieldName) {
      case 'id':
        return [fieldName, record.id] as const;
      case 'status':
        return [fieldName, record.status] as const;
      case 'version':
        return [fieldName, record.version] as const;
      case 'createdAt':
        return [fieldName, record.createdAt] as const;
      case 'updatedAt':
        return [fieldName, record.updatedAt] as const;
      default:
        return [fieldName, record.payload[fieldName as keyof typeof record.payload]] as const;
    }
  });

  return Object.fromEntries(orderedEntries);
}

export function deriveMetadataFromPayload(itemType: ApiDatasetItemType, payload: Record<string, unknown>) {
  const definition = getDatasetEntityDefinition(itemType);
  const titleValue = payload[definition.titleField];

  if (typeof titleValue !== 'string') {
    throw new Error(`Expected ${definition.titleField} to be a string for ${itemType}`);
  }

  const summaryValue = definition.summaryField ? payload[definition.summaryField] : undefined;
  const tagsValue = definition.tagsField ? payload[definition.tagsField] : undefined;

  return {
    title: titleValue,
    summary: typeof summaryValue === 'string' && summaryValue.length > 0 ? summaryValue : null,
    tags: Array.isArray(tagsValue) ? tagsValue.filter((value): value is string => typeof value === 'string') : [],
  };
}
