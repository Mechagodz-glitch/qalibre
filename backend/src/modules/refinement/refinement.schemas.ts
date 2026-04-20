import { z } from 'zod';

import { datasetItemResponseSchema } from '../datasets/dataset.schemas.js';
import { apiDatasetItemTypeValues } from '../datasets/dataset.schemas.js';

export const apiRefinementModeValues = [
  'normalize',
  'expand',
  'deduplicate',
  'classify',
  'strengthen',
  'generateStarterDataset',
] as const;

export const apiRefinementRunStatusValues = ['pending', 'completed', 'failed'] as const;
export const apiDraftReviewStatusValues = ['pending', 'approved', 'rejected'] as const;

export const refinementRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  itemType: z.enum(apiDatasetItemTypeValues).optional(),
  status: z.enum(apiRefinementRunStatusValues).optional(),
});

export const refinementDraftListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  itemType: z.enum(apiDatasetItemTypeValues).optional(),
  reviewStatus: z.enum(apiDraftReviewStatusValues).optional(),
});

export const bulkRefinementBodySchema = z.object({
  itemType: z.enum(apiDatasetItemTypeValues),
  itemIds: z.array(z.string()).min(1),
  mode: z.enum(apiRefinementModeValues),
});

export const reviewDraftBodySchema = z.object({
  notes: z.string().trim().max(2_000).optional(),
});

const diffEntrySchema = z.object({
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

export const draftDiffSummarySchema = z.object({
  added: z.array(diffEntrySchema),
  removed: z.array(diffEntrySchema),
  modified: z.array(diffEntrySchema),
  aiSummary: z.array(z.string()),
});

export const refinementRunSummarySchema = z.object({
  id: z.string(),
  itemType: z.enum(apiDatasetItemTypeValues),
  itemId: z.string(),
  itemTitle: z.string(),
  mode: z.enum(apiRefinementModeValues),
  model: z.string(),
  status: z.enum(apiRefinementRunStatusValues),
  errorMessage: z.string().nullable(),
  correlationId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draftId: z.string().nullable(),
});

export const refinementRunDetailSchema = refinementRunSummarySchema.extend({
  requestPayload: z.record(z.string(), z.unknown()),
  rawResponse: z.unknown().nullable(),
  parsedResponse: z.unknown().nullable(),
});

export const refinementDraftSchema = z.object({
  id: z.string(),
  runId: z.string(),
  itemType: z.enum(apiDatasetItemTypeValues),
  itemId: z.string(),
  itemTitle: z.string(),
  mode: z.enum(apiRefinementModeValues),
  model: z.string(),
  reviewStatus: z.enum(apiDraftReviewStatusValues),
  confidence: z.number(),
  reviewerNotes: z.string().nullable(),
  originalData: z.record(z.string(), z.unknown()),
  refinedData: z.record(z.string(), z.unknown()),
  diffSummary: draftDiffSummarySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const paginatedRefinementRunsResponseSchema = z.object({
  items: z.array(refinementRunSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const paginatedRefinementDraftsResponseSchema = z.object({
  items: z.array(refinementDraftSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const bulkRefinementResponseSchema = z.object({
  requested: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  runIds: z.array(z.string()),
  draftIds: z.array(z.string()),
});

export const reviewDraftResponseSchema = z.object({
  draft: refinementDraftSchema,
  item: datasetItemResponseSchema.optional(),
});

export type ApiRefinementMode = (typeof apiRefinementModeValues)[number];
