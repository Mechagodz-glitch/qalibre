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

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const normalizeUserFeatures = (values: string[]) => {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
};

const shortTextSchema = z.string().trim().min(1).max(200);
const mediumTextSchema = z.string().trim().min(1).max(8_000);
const optionalTextSchema = z.string().trim().max(20_000).default('');
const caseTitleSchema = z.string().trim().min(1).max(500);
const stringListSchema = z
  .array(z.string().trim().min(1).max(300))
  .default([])
  .transform((values) => dedupeStrings(values));
const aiShortTextSchema = z.string().min(1).max(200);
const aiMediumTextSchema = z.string().min(1).max(8_000);
const aiOptionalTextSchema = z.string().max(20_000).default('');
const aiCaseTitleSchema = z.string().min(1).max(500);
const aiStringListSchema = z.array(z.string().max(300)).default([]);
const boundedStringListSchema = (max: number) =>
  z
    .array(z.string().trim().min(1).max(300))
    .max(max)
    .default([])
    .transform((values) => dedupeStrings(values));
const boundedAiStringListSchema = (max: number) => z.array(z.string().max(300)).max(max).default([]);
const userFeatureListSchema = z
  .array(z.preprocess(emptyStringToUndefined, z.string().trim().min(1).max(200)).optional())
  .default([])
  .transform((values) => normalizeUserFeatures(values.filter((value): value is string => Boolean(value))));
const suiteContextFallbackNames = new Set(['unassigned client', 'unassigned module', 'unassigned page']);

export const generationModeValues = ['processAlpha', 'processBeta', 'manualRecovery'] as const;
export const generationRunStatusValues = ['pending', 'completed', 'failed'] as const;
export const caseReviewStatusValues = ['pending', 'approved', 'rejected'] as const;
export const testCaseEntrySourceValues = ['generated', 'manual'] as const;
export const testCaseFeedbackActionValues = ['approved', 'rejected'] as const;
export const testCaseFeedbackReasonValues = [
  'missing_coverage',
  'wrong_logic',
  'wrong_assumption',
  'duplicate',
  'poor_wording',
  'wrong_priority_or_severity',
  'not_applicable',
  'other',
] as const;
export const knowledgeScopeLevelValues = ['project', 'module', 'page'] as const;
export const sourceKindValues = ['userStory', 'prd', 'mockup', 'image', 'video', 'link', 'note', 'file'] as const;
export const browserOptionValues = ['Chrome', 'Firefox', 'Microsoft Edge', 'Safari'] as const;
export const screenSizeValues = ['mobile', 'tablet', 'laptop', 'desktop', '4K TV'] as const;
const draftEditableTestCaseLimit = 250;

export const selectedDatasetIdsSchema = z.object({
  componentCatalogue: z.array(z.string()).default([]),
  featureType: z.array(z.string()).default([]),
  rulePack: z.array(z.string()).default([]),
  testTaxonomy: z.array(z.string()).default([]),
  scenarioTemplate: z.array(z.string()).default([]),
  projectMemory: z.array(z.string()).default([]),
  priorityMapping: z.array(z.string()).default([]),
  severityMapping: z.array(z.string()).default([]),
  synonymAlias: z.array(z.string()).default([]),
});

export const generationSuiteContextInputSchema = z.object({
  contributorId: z.string().optional(),
  contributorName: z.string().trim().max(200).default(''),
  projectId: z.string().optional(),
  projectName: z.string().trim().max(200).default(''),
  moduleId: z.string().optional(),
  moduleName: z.string().trim().max(200).default(''),
  pageId: z.string().optional(),
  pageName: z.string().trim().max(200).default(''),
  featureId: z.string().optional(),
  featureName: z.string().trim().max(200).default(''),
});

export const generationOptionsSchema = z.object({
  maxCases: z.coerce.number().int().min(1).max(180).default(180),
  includeSmoke: z.coerce.boolean().default(true),
  includeFunctional: z.coerce.boolean().default(true),
  includeNegative: z.coerce.boolean().default(true),
  includeEdge: z.coerce.boolean().default(true),
  includeUsability: z.coerce.boolean().default(true),
  includeResponsiveness: z.coerce.boolean().default(true),
  includeCompatibility: z.coerce.boolean().default(true),
  targetBrowsers: z.array(z.enum(browserOptionValues)).default(['Chrome', 'Firefox', 'Microsoft Edge', 'Safari']),
  screenSizes: z.array(z.enum(screenSizeValues)).default(['desktop', 'laptop', 'tablet', 'mobile', '4K TV']),
});

const defaultGenerationOptions = () => ({
  maxCases: 180,
  includeSmoke: true,
  includeFunctional: true,
  includeNegative: true,
  includeEdge: true,
  includeUsability: true,
  includeResponsiveness: true,
  includeCompatibility: true,
  targetBrowsers: ['Chrome', 'Firefox', 'Microsoft Edge', 'Safari'] as Array<(typeof browserOptionValues)[number]>,
  screenSizes: ['desktop', 'laptop', 'tablet', 'mobile', '4K TV'] as Array<(typeof screenSizeValues)[number]>,
});

export const sourceInputSchema = z
  .object({
    kind: z.enum(sourceKindValues),
    label: shortTextSchema,
    filename: z.string().trim().max(260).optional(),
    mimeType: z.string().trim().max(200).optional(),
    contentText: z.string().optional(),
    dataUrl: z.string().optional(),
    url: z.preprocess(emptyStringToUndefined, z.string().trim().url().optional()),
    notes: z.string().trim().max(4_000).optional(),
  })
  .superRefine((value, context) => {
    const hasMockupEvidence = Boolean(
      value.url?.trim() ||
        value.contentText?.trim() ||
        value.dataUrl?.trim() ||
        value.filename?.trim() ||
        value.notes?.trim(),
    );

    if (value.kind === 'mockup' && !hasMockupEvidence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mockup sources need a URL or attached content/evidence.',
        path: ['url'],
      });
    }
  });

export const preparedSourceInputSchema = z.object({
  kind: z.enum(sourceKindValues),
  label: shortTextSchema,
  filename: z.string().trim().max(260).optional(),
  mimeType: z.string().trim().max(200).optional(),
  url: z.string().trim().url().optional(),
  notes: z.string().trim().max(4_000).optional(),
  parseStatus: z.enum(['provided', 'parsed', 'reference-only']),
  contentText: z.string().default(''),
  imageDataUrl: z.string().optional(),
});

export const generationCreateBodySchema = z
  .object({
    title: shortTextSchema,
    description: z.string().trim().max(4_000).default(''),
    mode: z.enum(generationModeValues),
    sourceInputs: z.array(sourceInputSchema).default([]),
    userFeatures: userFeatureListSchema,
    suiteContext: generationSuiteContextInputSchema.default({
      contributorId: undefined,
      contributorName: '',
      projectId: undefined,
      projectName: '',
      moduleId: undefined,
      moduleName: '',
      pageId: undefined,
      pageName: '',
      featureId: undefined,
      featureName: '',
    }),
    selectedDatasetIds: selectedDatasetIdsSchema.default({
      componentCatalogue: [],
      featureType: [],
      rulePack: [],
      testTaxonomy: [],
      scenarioTemplate: [],
      projectMemory: [],
      priorityMapping: [],
      severityMapping: [],
      synonymAlias: [],
    }),
    generationOptions: generationOptionsSchema.default(defaultGenerationOptions),
  })
  .superRefine((value, context) => {
    const selectedCount = Object.values(value.selectedDatasetIds).reduce((total, ids) => total + ids.length, 0);
    const hasSupportingSources = value.sourceInputs.length > 0;
    const hasKnowledgeSelections = selectedCount > 0;
    const projectName = value.suiteContext.projectName.trim();
    const moduleName = value.suiteContext.moduleName.trim();
    const pageName = value.suiteContext.pageName.trim();

    if (!hasSupportingSources && !hasKnowledgeSelections) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one supporting source or one knowledge-base selection before generating.',
        path: ['sourceInputs'],
      });
    }

    if (
      !value.suiteContext.pageId &&
      (!pageName || suiteContextFallbackNames.has(pageName.toLowerCase()))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an existing page or enter a page name.',
        path: ['suiteContext', 'pageName'],
      });
    }

    if (
      !value.suiteContext.moduleId &&
      (!moduleName || suiteContextFallbackNames.has(moduleName.toLowerCase()))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an existing module or enter a module name.',
        path: ['suiteContext', 'moduleName'],
      });
    }

    if (
      !value.suiteContext.projectId &&
      (!projectName || suiteContextFallbackNames.has(projectName.toLowerCase()))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an existing client or enter a client name.',
        path: ['suiteContext', 'projectName'],
      });
    }
  });

export const generationRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  status: z.enum(generationRunStatusValues).optional(),
  mode: z.enum(generationModeValues).optional(),
  search: z.string().trim().max(120).optional(),
});

export const generationStoredRequestPayloadSchema = z.object({
  title: shortTextSchema,
  description: z.string().trim().max(4_000).default(''),
  requestedBy: z.string().trim().max(200).default(''),
  mode: z.enum(generationModeValues),
  suiteContext: generationSuiteContextInputSchema.default({
    contributorId: undefined,
    contributorName: '',
      projectId: undefined,
      projectName: '',
      moduleId: undefined,
      moduleName: '',
      pageId: undefined,
      pageName: '',
      featureId: undefined,
      featureName: '',
    }),
  selectedDatasetIds: selectedDatasetIdsSchema,
  generationOptions: generationOptionsSchema,
  sources: z.array(preparedSourceInputSchema).default([]),
  userFeatures: userFeatureListSchema,
});

export const generationDraftListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const generationRouteParamsSchema = z.object({
  runId: z.string(),
});

export const draftRouteParamsSchema = z.object({
  draftId: z.string(),
});

export const generationReviewBodySchema = z.object({
  notes: z.string().trim().max(4_000).default(''),
});

export const testCaseStepSchema = z.object({
  step: z.coerce.number().int().min(1),
  action: mediumTextSchema,
  expectedResult: mediumTextSchema,
});

export const aiTestCaseStepSchema = z.object({
  step: z.number().int().min(1),
  action: aiMediumTextSchema,
  expectedResult: aiMediumTextSchema,
});

export const generatedTestCaseSchema = z.object({
  caseId: z.string().trim().max(100).default(''),
  title: caseTitleSchema,
  objective: mediumTextSchema,
  feature: shortTextSchema,
  scenario: shortTextSchema,
  testType: shortTextSchema,
  priority: z.string().trim().max(20).default('P2'),
  severity: z.string().trim().max(50).default('Medium'),
  automationCandidate: z.coerce.boolean().default(false),
  preconditions: stringListSchema,
  testData: stringListSchema,
  steps: z.array(testCaseStepSchema).min(1).max(20),
  tags: stringListSchema,
  linkedComponents: stringListSchema,
  linkedFeatureTypes: stringListSchema,
  linkedRulePacks: stringListSchema,
  linkedTaxonomy: stringListSchema,
  sourceReferences: stringListSchema,
  notes: optionalTextSchema,
  reviewStatus: z.enum(caseReviewStatusValues).default('pending'),
  entrySource: z.enum(testCaseEntrySourceValues).default('generated'),
});

export const aiGeneratedTestCaseSchema = z.object({
  caseId: z.string().max(100).default(''),
  title: aiCaseTitleSchema,
  objective: aiMediumTextSchema,
  feature: aiShortTextSchema,
  scenario: aiShortTextSchema,
  testType: aiShortTextSchema,
  priority: z.string().max(20).default('P2'),
  severity: z.string().max(50).default('Medium'),
  automationCandidate: z.boolean().default(false),
  preconditions: aiStringListSchema,
  testData: aiStringListSchema,
  steps: z.array(aiTestCaseStepSchema).min(1).max(20),
  tags: aiStringListSchema,
  linkedComponents: aiStringListSchema,
  linkedFeatureTypes: aiStringListSchema,
  linkedRulePacks: aiStringListSchema,
  linkedTaxonomy: aiStringListSchema,
  sourceReferences: aiStringListSchema,
  notes: aiOptionalTextSchema,
  reviewStatus: z.enum(caseReviewStatusValues).default('pending'),
  entrySource: z.enum(testCaseEntrySourceValues).default('generated'),
});

export const coverageGapEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  expected: z.number().int().min(0).optional(),
  actual: z.number().int().min(0).optional(),
  missingScenarioTypes: z.array(z.string()).default([]),
});

export const coverageAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(1),
  quotaStatus: z.enum(['met', 'partially_met', 'unmet']),
  unitsIdentified: z.number().int().min(0),
  unitsCovered: z.number().int().min(0),
  missingRequestedFeatures: z.array(z.string()).default([]),
  missingBuckets: z.array(coverageGapEntrySchema).default([]),
  underCoveredUnits: z.array(coverageGapEntrySchema).default([]),
  missingScenarioTypesByUnit: z.array(coverageGapEntrySchema).default([]),
  scoreByBucket: z.record(z.string(), z.number().min(0).max(1)),
  scoreByFeature: z.record(z.string(), z.number().min(0).max(1)),
  scoreByUnit: z.record(z.string(), z.number().min(0).max(1)),
  unknownAreas: z.array(z.string()).default([]),
  retryTriggered: z.boolean().default(false),
  retryTriggeredForMissingFeatures: z.boolean().default(false),
});

export const testCaseFeedbackSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  runId: z.string(),
  caseId: z.string(),
  draftVersion: z.number().int().min(1),
  action: z.enum(testCaseFeedbackActionValues),
  reasonCode: z.enum(testCaseFeedbackReasonValues).nullable(),
  reasonDetails: z.string().nullable(),
  replacementSummary: z.string().nullable(),
  caseTitle: z.string(),
  caseSnapshot: z.record(z.string(), z.unknown()),
  reviewerNotes: z.string().nullable(),
  usedForLearning: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export const generationCaseFeedbackBodySchema = z.object({
  reasonCode: z.enum(testCaseFeedbackReasonValues).optional(),
  reasonDetails: z.string().trim().max(4_000).optional(),
  replacementSummary: z.string().trim().max(4_000).optional(),
  reviewerNotes: z.string().trim().max(4_000).optional(),
});

export const generationCaseRejectBodySchema = generationCaseFeedbackBodySchema.extend({
  reasonCode: z.enum(testCaseFeedbackReasonValues),
});

export const generationCasePromoteBodySchema = z.object({
  targetType: z.enum(['projectMemory', 'componentCatalogue', 'scenarioTemplate', 'rulePack']).default('projectMemory'),
  notes: z.string().trim().max(4_000).optional(),
});

export const testCaseDraftPayloadSchema = z.object({
  suiteTitle: shortTextSchema,
  suiteSummary: optionalTextSchema,
  inferredComponents: boundedStringListSchema(20),
  inferredFeatureTypes: boundedStringListSchema(20),
  inferredRulePacks: boundedStringListSchema(20),
  inferredTaxonomy: boundedStringListSchema(20),
  inferredScenarios: boundedStringListSchema(24),
  inferredIntegrations: boundedStringListSchema(20),
  assumptions: boundedStringListSchema(16),
  gaps: boundedStringListSchema(16),
  coverageSummary: boundedStringListSchema(20),
  confidence: z.number().min(0).max(1),
  testCases: z.array(generatedTestCaseSchema).min(1).max(draftEditableTestCaseLimit),
});

export const testCaseDraftAiResponseSchema = z.object({
  suiteTitle: aiShortTextSchema,
  suiteSummary: aiOptionalTextSchema,
  inferredComponents: boundedAiStringListSchema(20),
  inferredFeatureTypes: boundedAiStringListSchema(20),
  inferredRulePacks: boundedAiStringListSchema(20),
  inferredTaxonomy: boundedAiStringListSchema(20),
  inferredScenarios: boundedAiStringListSchema(24),
  inferredIntegrations: boundedAiStringListSchema(20),
  assumptions: boundedAiStringListSchema(16),
  gaps: boundedAiStringListSchema(16),
  coverageSummary: boundedAiStringListSchema(20),
  confidence: z.number().min(0).max(1),
  testCases: z.array(aiGeneratedTestCaseSchema).min(1).max(180),
});

export const generationDraftUpdateBodySchema = z.object({
  suiteTitle: shortTextSchema,
  suiteSummary: optionalTextSchema,
  inferredComponents: stringListSchema,
  inferredFeatureTypes: stringListSchema,
  inferredRulePacks: stringListSchema,
  inferredTaxonomy: stringListSchema,
  inferredScenarios: stringListSchema,
  inferredIntegrations: stringListSchema,
  assumptions: stringListSchema,
  gaps: stringListSchema,
  coverageSummary: stringListSchema,
  confidence: z.number().min(0).max(1),
  testCases: z.array(generatedTestCaseSchema).min(1).max(draftEditableTestCaseLimit),
  reviewerNotes: z.string().trim().max(4_000).default(''),
});

export const generationContextOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  project: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  module: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  page: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  scopeLevel: z.enum(knowledgeScopeLevelValues).nullable().optional(),
});

export const contributorOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleTitle: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),
  accentColor: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const projectPageOptionSchema = z.object({
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
});

export const projectModuleOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pages: z.array(projectPageOptionSchema),
});

export const projectHierarchyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  modules: z.array(projectModuleOptionSchema),
});

export const generationKnowledgeBaseResponseSchema = z.object({
  componentCatalogue: z.array(generationContextOptionSchema),
  featureType: z.array(generationContextOptionSchema),
  rulePack: z.array(generationContextOptionSchema),
  testTaxonomy: z.array(generationContextOptionSchema),
  scenarioTemplate: z.array(generationContextOptionSchema),
  projectMemory: z.array(generationContextOptionSchema),
  priorityMapping: z.array(generationContextOptionSchema),
  severityMapping: z.array(generationContextOptionSchema),
  synonymAlias: z.array(generationContextOptionSchema),
  contributors: z.array(contributorOptionSchema),
  projectHierarchy: z.array(projectHierarchyOptionSchema),
});

export const generationSuiteContextResponseSchema = z.object({
  contributor: z
    .object({
      id: z.string(),
      name: z.string(),
      roleTitle: z.string().nullable(),
      accentColor: z.string().nullable(),
    })
    .nullable(),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  module: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  page: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  feature: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  path: z.string().nullable(),
});

export const generationRunProgressResponseSchema = z.object({
  phase: z.enum(['queued', 'initial_generation', 'coverage_validation', 'remediation', 'finalizing', 'completed', 'failed']),
  completedBatches: z.number().int().min(0),
  totalBatches: z.number().int().min(0),
  generatedCaseCount: z.number().int().min(0),
  retryTriggered: z.boolean().default(false),
  previewTitles: z.array(z.string()).max(12).default([]),
});

export const generationRunResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: z.enum(generationModeValues),
  model: z.string(),
  status: z.enum(generationRunStatusValues),
  errorMessage: z.string().nullable(),
  correlationId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draftId: z.string().nullable(),
  suiteContext: generationSuiteContextResponseSchema,
  progress: generationRunProgressResponseSchema.nullable(),
});

export const generationRunDetailResponseSchema = generationRunResponseSchema.extend({
  requestPayload: z.record(z.string(), z.unknown()),
  sourceSummary: z.record(z.string(), z.unknown()),
  rawResponse: z.unknown().nullable(),
  parsedResponse: z.unknown().nullable(),
});

export const generationDraftResponseSchema = z.object({
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  version: z.number().int(),
  mode: z.enum(generationModeValues),
  model: z.string(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']),
  confidence: z.number(),
  reviewerNotes: z.string().nullable(),
  suiteContext: generationSuiteContextResponseSchema,
  inferredContext: z.object({
    components: z.array(z.string()),
    featureTypes: z.array(z.string()),
    rulePacks: z.array(z.string()),
    taxonomy: z.array(z.string()),
    scenarios: z.array(z.string()),
    integrations: z.array(z.string()),
    assumptions: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
  coverageSummary: z.array(z.string()),
  coverageAnalysis: coverageAnalysisSchema.nullable(),
  testCases: z.array(generatedTestCaseSchema),
  testCaseFeedback: z.array(testCaseFeedbackSchema),
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const generationCaseRouteParamsSchema = draftRouteParamsSchema.extend({
  caseId: z.string(),
});

export const generationDraftVersionResponseSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  createdBy: z.string(),
});

export const testcaseLibraryNodeKindSchema = z.enum([
  'client',
  'module',
  'page',
  'feature',
]);

export const testcaseLibraryNodeScopeSchema = z.object({
  projectId: z.string().nullable(),
  moduleId: z.string().nullable(),
  pageId: z.string().nullable(),
  featureId: z.string().nullable(),
});

export type TestcaseLibraryNodeSchema = z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  kind: typeof testcaseLibraryNodeKindSchema;
  path: z.ZodString;
  qaOwners: z.ZodArray<z.ZodString>;
  approvedSuiteCount: z.ZodNumber;
  approvedCaseCount: z.ZodNumber;
  scope: typeof testcaseLibraryNodeScopeSchema;
  children: z.ZodArray<z.ZodTypeAny>;
}>;

export const testcaseLibraryNodeSchema: z.ZodType<{
  id: string;
  name: string;
  kind: 'client' | 'module' | 'page' | 'feature';
  path: string;
  qaOwners: string[];
  approvedSuiteCount: number;
  approvedCaseCount: number;
  scope: {
    projectId: string | null;
    moduleId: string | null;
    pageId: string | null;
    featureId: string | null;
  };
  children: unknown[];
}> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    kind: testcaseLibraryNodeKindSchema,
    path: z.string(),
    qaOwners: z.array(z.string()),
    approvedSuiteCount: z.number().int().min(0),
    approvedCaseCount: z.number().int().min(0),
    scope: testcaseLibraryNodeScopeSchema,
    children: z.array(testcaseLibraryNodeSchema),
  }),
);

export const testcaseLibraryResponseSchema = z.object({
  summary: z.object({
    clientCount: z.number().int().min(0),
    moduleCount: z.number().int().min(0),
    pageCount: z.number().int().min(0),
    featureCount: z.number().int().min(0),
    approvedSuiteCount: z.number().int().min(0),
    approvedCaseCount: z.number().int().min(0),
  }),
  items: z.array(testcaseLibraryNodeSchema),
});

export const paginatedGenerationRunsResponseSchema = z.object({
  items: z.array(generationRunResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const paginatedGenerationDraftsResponseSchema = z.object({
  items: z.array(generationDraftResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type ApiGenerationMode = (typeof generationModeValues)[number];
export type ApiGenerationRunStatus = (typeof generationRunStatusValues)[number];
export type ApiTestCaseFeedbackReason = (typeof testCaseFeedbackReasonValues)[number];
export type GenerationCreateBody = z.infer<typeof generationCreateBodySchema>;
export type GenerationDraftUpdateBody = z.infer<typeof generationDraftUpdateBodySchema>;
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type TestCaseDraftAiResponse = z.infer<typeof testCaseDraftAiResponseSchema>;
export type CoverageAnalysis = z.infer<typeof coverageAnalysisSchema>;
