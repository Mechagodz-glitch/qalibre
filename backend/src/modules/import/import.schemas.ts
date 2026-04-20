import { z } from 'zod';

import { apiDatasetItemTypeValues } from '../datasets/dataset.schemas.js';

const trimmedString = z.string().trim();
const requiredString = trimmedString.min(1);

const inputStringListSchema = z
  .array(z.union([z.string(), z.null(), z.undefined()]))
  .optional()
  .default([])
  .transform((values) =>
    values
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean),
  );

const whereFoundInputSchema = z.object({
  module: trimmedString.optional().default(''),
  page: trimmedString.optional().default(''),
  routeOrLocationHint: trimmedString.optional().default(''),
});

export const componentCatalogueImportItemSchema = z.object({
  componentId: requiredString,
  componentName: requiredString,
  category: requiredString,
  description: requiredString,
  whereFound: z.array(whereFoundInputSchema).optional().default([]),
  variants: inputStringListSchema,
  visibleStates: inputStringListSchema,
  visibleValidationsOrConstraints: inputStringListSchema,
  commonActions: inputStringListSchema,
  dependencies: inputStringListSchema,
  risks: inputStringListSchema,
  applicableTestTypes: inputStringListSchema,
  smokeScenarios: inputStringListSchema,
  functionalScenarios: inputStringListSchema,
  negativeScenarios: inputStringListSchema,
  edgeScenarios: inputStringListSchema,
  standardTestCases: inputStringListSchema,
  accessibilityObservations: inputStringListSchema,
  notes: trimmedString.optional().default(''),
});

export const componentCatalogueImportRequestSchema = z
  .object({
    filePath: trimmedString.optional(),
    jsonText: trimmedString.optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.filePath || value.jsonText), {
    message: 'Provide either jsonText or filePath.',
    path: ['jsonText'],
  });

export const datasetImportItemTypeSchema = z.enum(apiDatasetItemTypeValues);

export const datasetImportRequestSchema = z
  .object({
    filePath: trimmedString.optional(),
    jsonText: trimmedString.optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.filePath || value.jsonText), {
    message: 'Provide either jsonText or filePath.',
    path: ['jsonText'],
  });

export const importFailureSchema = z.object({
  index: z.number().int().nonnegative(),
  componentId: z.string().nullable(),
  componentName: z.string().nullable(),
  message: z.string(),
});

export const importNormalizationSummarySchema = z.object({
  namesTitleCased: z.number().int().nonnegative(),
  categoriesNormalized: z.number().int().nonnegative(),
  testTypesStandardized: z.number().int().nonnegative(),
  arrayDuplicatesRemoved: z.number().int().nonnegative(),
  emptyValuesRemoved: z.number().int().nonnegative(),
});

export const datasetImportFailureSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string().nullable(),
  message: z.string(),
});

export const datasetImportNormalizationSummarySchema = z.object({
  namesTitleCased: z.number().int().nonnegative(),
  prioritiesNormalized: z.number().int().nonnegative(),
  testTypesStandardized: z.number().int().nonnegative(),
  tagsNormalized: z.number().int().nonnegative(),
  arrayDuplicatesRemoved: z.number().int().nonnegative(),
  emptyValuesRemoved: z.number().int().nonnegative(),
});

export const componentCatalogueImportSummarySchema = z.object({
  dryRun: z.boolean(),
  source: z.string(),
  totalProcessed: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  insertedIds: z.array(z.string()),
  updatedIds: z.array(z.string()),
  failures: z.array(importFailureSchema),
  normalization: importNormalizationSummarySchema,
});

export const datasetImportSummarySchema = z.object({
  itemType: datasetImportItemTypeSchema,
  dryRun: z.boolean(),
  source: z.string(),
  totalProcessed: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  insertedIds: z.array(z.string()),
  updatedIds: z.array(z.string()),
  failures: z.array(datasetImportFailureSchema),
  normalization: datasetImportNormalizationSummarySchema,
});

export type ComponentCatalogueImportRequest = z.infer<typeof componentCatalogueImportRequestSchema>;
export type ComponentCatalogueImportItem = z.infer<typeof componentCatalogueImportItemSchema>;
export type DatasetImportRequest = z.infer<typeof datasetImportRequestSchema>;
