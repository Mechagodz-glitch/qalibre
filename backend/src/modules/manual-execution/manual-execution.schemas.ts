import { z } from 'zod';

const shortTextSchema = z.string().trim().min(1).max(200);
const caseTitleSchema = z.string().trim().min(1).max(500);
const optionalTextSchema = z.string().trim().max(8_000).default('');

export const manualExecutionRunStatusValues = ['draft', 'inProgress', 'completed'] as const;
export const manualExecutionCaseStatusValues = ['untested', 'passed', 'failed', 'skipped'] as const;

export const projectScopeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const manualExecutionTesterOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleTitle: z.string().nullable(),
});

export const projectHierarchyPageOptionSchema = z.object({
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

export const projectHierarchyModuleOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pages: z.array(projectHierarchyPageOptionSchema),
});

export const projectHierarchyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  modules: z.array(projectHierarchyModuleOptionSchema),
});

export const manualExecutionSuiteContextSchema = z.object({
  project: projectScopeSummarySchema.nullable(),
  module: projectScopeSummarySchema.nullable(),
  page: projectScopeSummarySchema.nullable(),
  feature: projectScopeSummarySchema.nullable(),
  path: z.string().nullable(),
});

export const manualExecutionSelectableCaseSchema = z.object({
  sourceCaseId: shortTextSchema,
  title: caseTitleSchema,
  feature: shortTextSchema,
  scenario: shortTextSchema,
  testType: shortTextSchema,
  priority: shortTextSchema,
  severity: shortTextSchema,
  notes: z.string().trim().max(2_000).nullable().default(null),
});

export const approvedExecutionSuiteSchema = z.object({
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  version: z.number().int().min(1),
  caseCount: z.number().int().min(0),
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  suiteContext: manualExecutionSuiteContextSchema,
  cases: z.array(manualExecutionSelectableCaseSchema).max(500),
});

export const manualExecutionBootstrapResponseSchema = z.object({
  projectHierarchy: z.array(projectHierarchyOptionSchema),
  testerOptions: z.array(manualExecutionTesterOptionSchema),
  summary: z.object({
    approvedSuiteCount: z.number().int().min(0),
    inProgressRunCount: z.number().int().min(0),
    completedRunCount: z.number().int().min(0),
  }),
});

export const manualExecutionApprovedSuitesQuerySchema = z.object({
  projectId: z.string().trim().min(1),
  moduleId: z.string().trim().min(1).optional(),
  pageId: z.string().trim().min(1).optional(),
  featureId: z.string().trim().min(1).optional(),
});

export const manualExecutionRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  projectId: z.string().trim().min(1).optional(),
  status: z.enum(manualExecutionRunStatusValues).optional(),
});

export const manualExecutionImportedCaseSchema = z.object({
  sourceCaseId: shortTextSchema,
  title: caseTitleSchema,
  objective: z.string().trim().min(1).max(4_000),
  feature: shortTextSchema,
  scenario: shortTextSchema,
  testType: shortTextSchema,
  priority: shortTextSchema,
  severity: shortTextSchema,
  automationCandidate: z.boolean().default(false),
  preconditions: z.array(z.string().trim().max(500)).max(30).default([]),
  testData: z.array(z.string().trim().max(500)).max(30).default([]),
  tags: z.array(z.string().trim().max(120)).max(40).default([]),
  sourceReferences: z.array(z.string().trim().max(300)).max(30).default([]),
  notes: z.string().trim().max(2_000).nullable().default(null),
  caseSnapshot: z.record(z.string(), z.unknown()).default({}),
});

export const manualExecutionUploadedSuiteSchema = z.object({
  tempId: z.string().trim().min(1),
  sourceType: z.literal('uploadedDocument'),
  sourceFileName: z.string().trim().min(1).max(260),
  title: shortTextSchema,
  summary: z.string().trim().max(2_000).nullable().default(null),
  caseCount: z.number().int().min(0),
  cases: z.array(manualExecutionImportedCaseSchema).min(1).max(500),
});

export const manualExecutionSuiteSelectionSchema = z.object({
  suiteId: z.string().trim().min(1),
  caseIds: z
    .array(z.string().trim().min(1))
    .max(500)
    .default([])
    .transform((values) => [...new Set(values)]),
});

export const manualExecutionRunCreateBodySchema = z
  .object({
  name: shortTextSchema,
  projectId: z.string().trim().min(1).optional(),
  projectName: shortTextSchema.optional(),
  moduleId: z.string().trim().min(1).optional(),
  moduleName: shortTextSchema.optional(),
  pageId: z.string().trim().min(1).optional(),
  pageName: shortTextSchema.optional(),
  featureId: z.string().trim().min(1).optional(),
  featureName: shortTextSchema.optional(),
  suiteIds: z.array(z.string().trim().min(1)).max(20).default([]),
  suiteSelections: z.array(manualExecutionSuiteSelectionSchema).max(20).default([]),
  uploadedSuites: z.array(manualExecutionUploadedSuiteSchema).max(12).default([]),
  environment: z.string().trim().max(120).optional(),
  buildVersion: z.string().trim().max(120).optional(),
  assignedTester: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.projectId && !value.projectName) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'Select an existing project or enter a new client name.',
      });
    }

    if (!value.suiteIds.length && !value.suiteSelections.length && !value.uploadedSuites.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['suiteIds'],
        message: 'Select at least one approved suite or uploaded testcase document.',
      });
    }

    const usesNamedScope = Boolean(value.projectName || value.moduleName || value.pageName || value.featureName);
    if (usesNamedScope && (value.suiteIds.length || value.suiteSelections.length)) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectName'],
        message: 'New client, module, page, and feature entries are supported only for uploaded testcase documents.',
      });
    }

    if (value.pageName && !value.pageId && !value.moduleId && !value.moduleName) {
      ctx.addIssue({
        code: 'custom',
        path: ['pageName'],
        message: 'Select or enter a module before creating a new page.',
      });
    }

    if (value.featureName && !value.featureId && !value.pageId && !value.pageName) {
      ctx.addIssue({
        code: 'custom',
        path: ['featureName'],
        message: 'Select or enter a page before creating a new feature.',
      });
    }
  });

export const manualExecutionImportBodySchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().max(200).optional(),
  dataUrl: z.string().trim().min(1).max(25_000_000),
});

export const manualExecutionRunRouteParamsSchema = z.object({
  runId: z.string().trim().min(1),
});

export const manualExecutionCaseRouteParamsSchema = manualExecutionRunRouteParamsSchema.extend({
  caseResultId: z.string().trim().min(1),
});

export const manualExecutionCaseUpdateBodySchema = z.object({
  status: z.enum(manualExecutionCaseStatusValues),
  comment: optionalTextSchema,
  defectLink: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('')),
});

export const manualExecutionRunSuiteSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['approvedSuite', 'uploadedDocument']),
  sourceDraftId: z.string().nullable(),
  sourceRunId: z.string().nullable(),
  sourceDraftVersion: z.number().int().min(1).nullable(),
  sourceFileName: z.string().nullable(),
  suiteTitle: z.string(),
  suiteSummary: z.string().nullable(),
  suitePath: z.string().nullable(),
  sourceProjectName: z.string().nullable(),
  sourceModuleName: z.string().nullable(),
  sourcePageName: z.string().nullable(),
  sourceFeatureId: z.string().nullable(),
  sourceFeatureName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  caseCount: z.number().int().min(0),
  orderIndex: z.number().int().min(0),
});

export const manualExecutionCaseSnapshotSchema = z.record(z.string(), z.unknown());

export const manualExecutionCaseResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  runSuiteId: z.string(),
  suiteTitle: z.string(),
  sourceCaseId: z.string(),
  orderIndex: z.number().int().min(0),
  title: z.string(),
  objective: z.string(),
  feature: z.string(),
  scenario: z.string(),
  testType: z.string(),
  priority: z.string(),
  severity: z.string(),
  automationCandidate: z.boolean(),
  tags: z.array(z.string()),
  sourceReferences: z.array(z.string()),
  notes: z.string().nullable(),
  caseSnapshot: manualExecutionCaseSnapshotSchema,
  status: z.enum(manualExecutionCaseStatusValues),
  comment: z.string().nullable(),
  defectLink: z.string().nullable(),
  executedAt: z.string().nullable(),
  executedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const manualExecutionRunTotalsSchema = z.object({
  total: z.number().int().min(0),
  untested: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  completionPercent: z.number().min(0).max(100),
});

export const manualExecutionRunSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(manualExecutionRunStatusValues),
  project: projectScopeSummarySchema,
  module: projectScopeSummarySchema.nullable(),
  page: projectScopeSummarySchema.nullable(),
  feature: projectScopeSummarySchema.nullable(),
  environment: z.string().nullable(),
  buildVersion: z.string().nullable(),
  assignedTester: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  completedBy: z.string().nullable(),
  suiteCount: z.number().int().min(0),
  totals: manualExecutionRunTotalsSchema,
});

export const manualExecutionRunDetailSchema = manualExecutionRunSummarySchema.extend({
  suites: z.array(manualExecutionRunSuiteSchema),
  caseResults: z.array(manualExecutionCaseResultSchema),
});

export const manualExecutionReportMetricSchema = z.object({
  label: z.string(),
  value: z.number().int().min(0),
  color: z.string(),
});

export const manualExecutionReportBreakdownSchema = z.object({
  label: z.string(),
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  untested: z.number().int().min(0),
});

export const manualExecutionReportValueSchema = z.object({
  label: z.string(),
  value: z.number().int().min(0),
});

export const manualExecutionReportResponseSchema = z.object({
  run: manualExecutionRunSummarySchema.extend({
    suites: z.array(manualExecutionRunSuiteSchema),
  }),
  charts: z.object({
    statusBreakdown: z.array(manualExecutionReportMetricSchema),
    bySuite: z.array(manualExecutionReportBreakdownSchema),
    failuresByFeature: z.array(manualExecutionReportValueSchema),
    failuresBySeverity: z.array(manualExecutionReportValueSchema),
  }),
  caseResults: z.array(manualExecutionCaseResultSchema),
});

export const paginatedManualExecutionRunsResponseSchema = z.object({
  items: z.array(manualExecutionRunSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const manualExecutionExportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
});

export const manualExecutionImportResponseSchema = z.object({
  suites: z.array(manualExecutionUploadedSuiteSchema),
});

export type ManualExecutionRunCreateBody = z.infer<typeof manualExecutionRunCreateBodySchema>;
export type ManualExecutionCaseStatus = (typeof manualExecutionCaseStatusValues)[number];
