import { z } from 'zod';

const dedupeStrings = (values: string[]) => {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      deduped.push(value);
    }
  }

  return deduped;
};

const shortTextSchema = z.string().trim().min(1).max(200);
const optionalTextSchema = z.string().trim().max(8_000).default('');
const stringListSchema = z
  .array(z.string().trim().min(1).max(300))
  .default([])
  .transform((values) => dedupeStrings(values));

const whereFoundEntrySchema = z.object({
  module: shortTextSchema,
  page: shortTextSchema,
  routeOrLocationHint: z.string().trim().max(500).default(''),
});

const mappingRuleSchema = z.object({
  condition: shortTextSchema,
  mappedValue: shortTextSchema,
  notes: z.string().trim().max(2_000).optional(),
});

export const apiDatasetItemTypeValues = [
  'componentCatalogue',
  'rulePack',
  'featureType',
  'testTaxonomy',
  'scenarioTemplate',
  'projectMemory',
  'priorityMapping',
  'severityMapping',
  'synonymAlias',
] as const;

export const apiDatasetStatusValues = ['draft', 'approved', 'archived'] as const;

export const componentCataloguePayloadSchema = z.object({
  componentId: z.string().trim().max(200).default(''),
  name: shortTextSchema,
  aliases: stringListSchema,
  category: shortTextSchema,
  description: optionalTextSchema,
  whereFound: z.array(whereFoundEntrySchema).default([]),
  variants: stringListSchema,
  states: stringListSchema,
  validations: stringListSchema,
  commonActions: stringListSchema,
  dependencies: stringListSchema,
  commonRisks: stringListSchema,
  applicableTestTypes: stringListSchema,
  smokeScenarios: stringListSchema,
  functionalScenarios: stringListSchema,
  negativeScenarios: stringListSchema,
  edgeScenarios: stringListSchema,
  standardTestCases: stringListSchema,
  accessibilityObservations: stringListSchema,
  notes: optionalTextSchema,
  tags: stringListSchema,
});

export const rulePackPayloadSchema = z.object({
  name: shortTextSchema,
  description: optionalTextSchema,
  appliesToFeatureTypes: stringListSchema,
  appliesToComponents: stringListSchema,
  mandatoryScenarios: stringListSchema,
  negativeHeuristics: stringListSchema,
  edgeHeuristics: stringListSchema,
  securityHeuristics: stringListSchema,
  performanceHeuristics: stringListSchema,
  accessibilityHeuristics: stringListSchema,
  defaultPriority: z.string().trim().max(100).default('P2'),
  tags: stringListSchema,
});

export const featureTypePayloadSchema = z.object({
  name: shortTextSchema,
  description: optionalTextSchema,
  applicableComponents: stringListSchema,
  applicableRulePacks: stringListSchema,
  applicableTestTypes: stringListSchema,
  defaultScenarioBuckets: stringListSchema,
  tags: stringListSchema,
});

export const testTaxonomyPayloadSchema = z.object({
  name: shortTextSchema,
  description: optionalTextSchema,
  whenApplicable: stringListSchema,
  whenNotApplicable: stringListSchema,
  defaultPriority: z.string().trim().max(100).default('P2'),
  tags: stringListSchema,
});

export const scenarioTemplatePayloadSchema = z.object({
  name: shortTextSchema,
  scenarioType: shortTextSchema,
  description: optionalTextSchema,
  preconditionPattern: optionalTextSchema,
  stepPattern: optionalTextSchema,
  expectedResultPattern: optionalTextSchema,
  tags: stringListSchema,
  examples: stringListSchema,
});

export const projectMemoryPayloadSchema = z.object({
  name: shortTextSchema,
  overview: optionalTextSchema,
  businessTerminology: stringListSchema,
  workflows: stringListSchema,
  widgetRelationships: stringListSchema,
  knownRules: stringListSchema,
  knownRisks: stringListSchema,
  goldenScenarios: stringListSchema,
  exclusions: stringListSchema,
  linkedReusableComponents: stringListSchema,
  tags: stringListSchema,
});

export const priorityMappingPayloadSchema = z.object({
  name: shortTextSchema,
  description: optionalTextSchema,
  rules: z.array(mappingRuleSchema).min(1),
  tags: stringListSchema,
});

export const severityMappingPayloadSchema = z.object({
  name: shortTextSchema,
  description: optionalTextSchema,
  rules: z.array(mappingRuleSchema).min(1),
  tags: stringListSchema,
});

export const synonymAliasPayloadSchema = z.object({
  sourceType: shortTextSchema,
  canonicalName: shortTextSchema,
  aliases: stringListSchema,
  notes: optionalTextSchema,
});

export const datasetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().optional(),
  status: z.enum(apiDatasetStatusValues).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

export const datasetUpsertBodySchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(apiDatasetStatusValues).optional(),
  projectId: z.string().trim().min(1).optional(),
  moduleId: z.string().trim().min(1).optional(),
  pageId: z.string().trim().min(1).optional(),
  scopeLevel: z.enum(['project', 'module', 'page']).optional(),
});

export const datasetMutationBodySchema = z.object({
  notes: z.string().trim().max(2_000).optional(),
});

export const datasetItemResponseSchema = z.object({
  id: z.string(),
  itemType: z.enum(apiDatasetItemTypeValues),
  title: z.string(),
  summary: z.string().nullable(),
  tags: z.array(z.string()),
  status: z.enum(apiDatasetStatusValues),
  version: z.number().int(),
  archivedAt: z.string().nullable(),
  project: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  module: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  page: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  scopeLevel: z.enum(['project', 'module', 'page']).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export const paginatedDatasetItemsResponseSchema = z.object({
  items: z.array(datasetItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const datasetVersionResponseSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  createdBy: z.string(),
});

export const approvalHistoryResponseSchema = z.object({
  id: z.string(),
  itemType: z.enum(apiDatasetItemTypeValues),
  versionBefore: z.number().int(),
  versionAfter: z.number().int(),
  action: z.string(),
  actor: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const datasetVersionsListResponseSchema = z.object({
  items: z.array(datasetVersionResponseSchema),
});

export const approvalHistoryListResponseSchema = z.object({
  items: z.array(approvalHistoryResponseSchema),
});

export type ApiDatasetItemType = (typeof apiDatasetItemTypeValues)[number];
export type ApiDatasetStatus = (typeof apiDatasetStatusValues)[number];
export type DatasetListQuery = z.infer<typeof datasetListQuerySchema>;
export type DatasetUpsertBody = z.infer<typeof datasetUpsertBodySchema>;
