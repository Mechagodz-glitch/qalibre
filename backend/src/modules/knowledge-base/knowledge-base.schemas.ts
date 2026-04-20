import { z } from 'zod';

import { apiDatasetItemTypeValues, apiDatasetStatusValues, datasetItemResponseSchema } from '../datasets/dataset.schemas.js';

const dedupeStrings = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};

export const knowledgeAssetKindValues = ['file', 'pastedText', 'manualInput'] as const;
export const knowledgeAssetReviewStatusValues = ['raw', 'reviewed', 'linked', 'archived'] as const;

const nullableTrimmedText = z.string().trim().max(20_000).default('');
const shortText = z.string().trim().max(300).default('');
const metadataSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const knowledgeAssetKindSchema = z.enum(knowledgeAssetKindValues);
export const knowledgeAssetReviewStatusSchema = z.enum(knowledgeAssetReviewStatusValues);

export const knowledgeScopeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const knowledgeAssetLinkResponseSchema = z.object({
  id: z.string(),
  datasetItemId: z.string(),
  datasetItemType: z.enum(apiDatasetItemTypeValues),
  datasetItemTitle: z.string(),
  datasetItemStatus: z.enum(apiDatasetStatusValues),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const knowledgeAssetResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  kind: knowledgeAssetKindSchema,
  sourceFormat: z.string().nullable(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  contentText: z.string().nullable(),
  previewDataUrl: z.string().nullable(),
  extractedMetadata: z.record(z.string(), z.unknown()).nullable(),
  tags: z.array(z.string()),
  reviewStatus: knowledgeAssetReviewStatusSchema,
  project: knowledgeScopeSummarySchema.nullable(),
  module: knowledgeScopeSummarySchema.nullable(),
  page: knowledgeScopeSummarySchema.nullable(),
  links: z.array(knowledgeAssetLinkResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const knowledgeLinkedAssetPreviewSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: knowledgeAssetKindSchema,
  sourceFormat: z.string().nullable(),
});

export const structuredKnowledgeWorkspaceItemSchema = datasetItemResponseSchema.extend({
  linkedAssetsCount: z.number().int(),
  linkedAssetsPreview: z.array(knowledgeLinkedAssetPreviewSchema),
});

export const projectHierarchySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      pages: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          features: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string().nullable(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const knowledgeBaseWorkspaceQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(true),
});

export const knowledgeAssetUpsertBodySchema = z.object({
  title: z.string().trim().max(200).default(''),
  summary: nullableTrimmedText.optional(),
  kind: knowledgeAssetKindSchema,
  sourceFormat: z.string().trim().max(100).optional(),
  fileName: z.string().trim().max(300).optional(),
  mimeType: z.string().trim().max(200).optional(),
  contentText: z.string().trim().max(1_000_000).optional(),
  previewDataUrl: z.string().trim().max(5_000_000).optional(),
  extractedMetadata: metadataSchema,
  tags: z.array(z.string().trim().min(1).max(300)).default([]).transform(dedupeStrings),
  reviewStatus: knowledgeAssetReviewStatusSchema.optional(),
  projectId: z.string().trim().min(1).optional(),
  moduleId: z.string().trim().min(1).optional(),
  pageId: z.string().trim().min(1).optional(),
  fileBase64: z.string().trim().max(25_000_000).optional(),
});

export const knowledgeAssetLinkCreateBodySchema = z.object({
  datasetItemId: z.string().trim().min(1),
  notes: shortText.optional(),
});

export const knowledgeBaseWorkspaceResponseSchema = z.object({
  summary: z.object({
    assetCount: z.number().int(),
    structuredCount: z.number().int(),
    linkedItemCount: z.number().int(),
    needsReviewCount: z.number().int(),
  }),
  assets: z.array(knowledgeAssetResponseSchema),
  structuredItems: z.array(structuredKnowledgeWorkspaceItemSchema),
  projectHierarchy: z.array(projectHierarchySchema),
});

export type KnowledgeAssetKind = (typeof knowledgeAssetKindValues)[number];
export type KnowledgeAssetReviewStatus = (typeof knowledgeAssetReviewStatusValues)[number];
export type KnowledgeBaseWorkspaceQuery = z.infer<typeof knowledgeBaseWorkspaceQuerySchema>;
export type KnowledgeAssetUpsertBody = z.infer<typeof knowledgeAssetUpsertBodySchema>;
