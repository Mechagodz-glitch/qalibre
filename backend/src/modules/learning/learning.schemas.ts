import { z } from 'zod';

import { apiDatasetItemTypeValues } from '../datasets/dataset.schemas.js';

export const knowledgeSuggestionStatusValues = ['pending', 'approved', 'rejected', 'applied'] as const;
export const knowledgeSuggestionTypeValues = ['testcasePromotion', 'autoStrengthening'] as const;
export const knowledgeSuggestionTargetTypeValues = [
  'projectMemory',
  'componentCatalogue',
  'scenarioTemplate',
  'rulePack',
] as const;
export const knowledgeScopeLevelValues = ['project', 'module', 'page'] as const;

export const learningSuggestionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  status: z.enum(knowledgeSuggestionStatusValues).optional(),
  type: z.enum(knowledgeSuggestionTypeValues).optional(),
  targetType: z.enum(knowledgeSuggestionTargetTypeValues).optional(),
});

export const learningSuggestionRouteParamsSchema = z.object({
  suggestionId: z.string(),
});

export const learningSuggestionReviewBodySchema = z.object({
  notes: z.string().trim().max(4_000).default(''),
});

export const knowledgeSuggestionResponseSchema = z.object({
  id: z.string(),
  type: z.enum(knowledgeSuggestionTypeValues),
  targetType: z.enum(knowledgeSuggestionTargetTypeValues),
  triggerType: z.string(),
  status: z.enum(knowledgeSuggestionStatusValues),
  title: z.string(),
  summary: z.string().nullable(),
  rationale: z.string().nullable(),
  evidence: z.record(z.string(), z.unknown()),
  proposedPayload: z.record(z.string(), z.unknown()),
  sourceDraftId: z.string().nullable(),
  sourceRunId: z.string().nullable(),
  sourceCaseId: z.string().nullable(),
  targetDatasetItemId: z.string().nullable(),
  targetDatasetItemTitle: z.string().nullable(),
  targetDatasetItemType: z.enum(apiDatasetItemTypeValues).nullable(),
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  module: z.object({ id: z.string(), name: z.string() }).nullable(),
  page: z.object({ id: z.string(), name: z.string() }).nullable(),
  scopeLevel: z.enum(knowledgeScopeLevelValues).nullable(),
  reviewerNotes: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  appliedAt: z.string().nullable(),
  appliedBy: z.string().nullable(),
  appliedDatasetItemId: z.string().nullable(),
  appliedDatasetItemTitle: z.string().nullable(),
  appliedRefinementRunId: z.string().nullable(),
  appliedRefinementDraftId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const paginatedKnowledgeSuggestionsResponseSchema = z.object({
  items: z.array(knowledgeSuggestionResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type KnowledgeSuggestionQuery = z.infer<typeof learningSuggestionQuerySchema>;
