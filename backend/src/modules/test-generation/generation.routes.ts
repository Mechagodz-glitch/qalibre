import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { slugify } from '../../lib/slug.js';
import {
  buildCsvBuffer,
  setAttachmentHeaders,
} from '../export/export.utils.js';
import {
  approveGenerationDraft,
  approveGenerationTestCase,
  createGenerationRun,
  deleteGenerationDraft,
  createManualRecoveryDraft,
  exportApprovedGenerationDrafts,
  getTestcaseLibrary,
  getGenerationDraft,
  getGenerationKnowledgeBaseOptions,
  getGenerationRun,
  listGenerationTestCaseFeedback,
  listGenerationDraftVersions,
  listGenerationDrafts,
  listGenerationRuns,
  promoteGenerationTestCase,
  regenerateGenerationRun,
  rejectGenerationTestCase,
  stopGenerationRun,
  rejectGenerationDraft,
  updateGenerationDraft,
} from './generation.service.js';
import {
  generationCaseFeedbackBodySchema,
  generationCasePromoteBodySchema,
  generationCaseRejectBodySchema,
  generationCaseRouteParamsSchema,
  draftRouteParamsSchema,
  generationCreateBodySchema,
  generationDraftListQuerySchema,
  generationDraftResponseSchema,
  generationDraftUpdateBodySchema,
  generationDraftVersionResponseSchema,
  generationKnowledgeBaseResponseSchema,
  generationReviewBodySchema,
  generationRouteParamsSchema,
  generationRunDetailResponseSchema,
  generationRunListQuerySchema,
  generationRunResponseSchema,
  testCaseFeedbackSchema,
  paginatedGenerationDraftsResponseSchema,
  paginatedGenerationRunsResponseSchema,
  testcaseLibraryResponseSchema,
} from './generation.schemas.js';

type RouteApp = FastifyInstance<any, any, any, any>;

const generationExportFormatSchema = z.enum(['csv']);

const exportQuerySchema = z.object({
  draftId: z.string().optional(),
  projectId: z.string().optional(),
  moduleId: z.string().optional(),
  pageId: z.string().optional(),
  featureId: z.string().optional(),
  format: generationExportFormatSchema.default('csv'),
});

type GeneratedTestCaseExport = {
  caseId: string;
  title: string;
  objective: string;
  feature: string;
  scenario: string;
  testType: string;
  priority: string;
  severity: string;
  automationCandidate: boolean;
  preconditions: string[];
  testData: string[];
  steps: Array<{ step: number; action: string; expectedResult: string }>;
  tags: string[];
  linkedComponents: string[];
  linkedFeatureTypes: string[];
  linkedRulePacks: string[];
  linkedTaxonomy: string[];
  sourceReferences: string[];
  notes: string;
};

type TestGenerationDraftExport = {
  id: string;
  runId: string;
  title: string;
  summary: string | null;
  version: number;
  mode: string;
  model: string;
  reviewStatus: string;
  confidence: number;
  reviewerNotes: string | null;
  inferredContext: {
    components: string[];
    featureTypes: string[];
    rulePacks: string[];
    taxonomy: string[];
    scenarios: string[];
    integrations: string[];
    assumptions: string[];
    gaps: string[];
  };
  coverageSummary: string[];
  testCases: GeneratedTestCaseExport[];
  suiteContext: {
    contributor: {
      id: string;
      name: string;
      roleTitle: string | null;
      accentColor: string | null;
    } | null;
    project: {
      id: string;
      name: string;
    } | null;
    module: {
      id: string;
      name: string;
    } | null;
    page: {
      id: string;
      name: string;
    } | null;
    path: string | null;
  };
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function flattenDraftCaseRows(drafts: TestGenerationDraftExport[]) {
  return drafts.flatMap((draft) =>
    draft.testCases.map((testCase) => ({
      caseId: testCase.caseId,
      title: testCase.title,
      objective: testCase.objective,
      feature: testCase.feature,
      scenario: testCase.scenario,
      testType: testCase.testType,
      priority: testCase.priority,
      severity: testCase.severity,
      automation: testCase.automationCandidate ? 'Yes' : 'No',
      preconditions: testCase.preconditions,
      steps: testCase.steps.map((step) => `${step.step}. ${step.action} => ${step.expectedResult}`),
      notes: testCase.notes,
    })),
  );
}

export async function registerGenerationRoutes(app: RouteApp) {
  app.get(
    '/test-generation/knowledge-base',
    {
      schema: {
        tags: ['Test Generation'],
        response: {
          200: generationKnowledgeBaseResponseSchema,
        },
      },
    },
    async () => getGenerationKnowledgeBaseOptions(),
  );

  app.post(
    '/test-generation/runs',
    {
      schema: {
        tags: ['Test Generation'],
        body: generationCreateBodySchema,
        response: {
          202: z.object({
            run: generationRunResponseSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = generationCreateBodySchema.parse(request.body);
      const currentUser = request.authUser;
      const suiteContext = currentUser
        ? {
            ...body.suiteContext,
            contributorId: currentUser.contributorId ?? body.suiteContext.contributorId,
            contributorName: currentUser.contributorName ?? currentUser.name,
          }
        : body.suiteContext;
      const result = await createGenerationRun(
        {
          ...body,
          suiteContext,
        },
        request.id,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
      );
      return reply.code(202).send(result);
    },
  );

  app.get(
    '/test-generation/runs',
    {
      schema: {
        tags: ['Test Generation'],
        querystring: generationRunListQuerySchema,
        response: {
          200: paginatedGenerationRunsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = generationRunListQuerySchema.parse(request.query);
      return listGenerationRuns(query);
    },
  );

  app.get(
    '/test-generation/runs/:runId',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationRouteParamsSchema,
        response: {
          200: z.object({
            run: generationRunDetailResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = generationRouteParamsSchema.parse(request.params);
      return {
        run: await getGenerationRun(params.runId),
      };
    },
  );

  app.post(
    '/test-generation/runs/:runId/stop',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationRouteParamsSchema,
        response: {
          200: z.object({
            run: generationRunResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = generationRouteParamsSchema.parse(request.params);
      return stopGenerationRun(params.runId);
    },
  );

  app.post(
    '/test-generation/runs/:runId/regenerate',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationRouteParamsSchema,
        response: {
          202: z.object({
            run: generationRunResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = generationRouteParamsSchema.parse(request.params);
      return regenerateGenerationRun(params.runId, request.id, request.authUser?.name ?? env.DEFAULT_ACTOR);
    },
  );

  app.get(
    '/test-generation/drafts',
    {
      schema: {
        tags: ['Test Generation'],
        querystring: generationDraftListQuerySchema,
        response: {
          200: paginatedGenerationDraftsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = generationDraftListQuerySchema.parse(request.query);
      return listGenerationDrafts(query);
    },
  );

  app.get(
    '/test-generation/drafts/:draftId',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        response: {
          200: z.object({
            draft: generationDraftResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      return {
        draft: await getGenerationDraft(params.draftId),
      };
    },
  );

  app.put(
    '/test-generation/drafts/:draftId',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        body: generationDraftUpdateBodySchema,
        response: {
          200: z.object({
            draft: generationDraftResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      const body = generationDraftUpdateBodySchema.parse(request.body);
      return updateGenerationDraft(params.draftId, body, request.authUser?.name ?? env.DEFAULT_ACTOR);
    },
  );

  app.delete(
    '/test-generation/drafts/:draftId',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      return deleteGenerationDraft(params.draftId);
    },
  );

  app.post(
    '/test-generation/drafts/:draftId/test-cases/:caseId/approve',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationCaseRouteParamsSchema,
        body: generationCaseFeedbackBodySchema,
        response: {
          200: z.object({
            draft: generationDraftResponseSchema,
            feedback: testCaseFeedbackSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = generationCaseRouteParamsSchema.parse(request.params);
      const body = generationCaseFeedbackBodySchema.parse(request.body ?? {});
      return approveGenerationTestCase(
        params.draftId,
        params.caseId,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
        body,
      );
    },
  );

  app.post(
    '/test-generation/drafts/:draftId/test-cases/:caseId/reject',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationCaseRouteParamsSchema,
        body: generationCaseRejectBodySchema,
        response: {
          200: z.object({
            draft: generationDraftResponseSchema,
            feedback: testCaseFeedbackSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = generationCaseRouteParamsSchema.parse(request.params);
      const body = generationCaseRejectBodySchema.parse(request.body ?? {});
      return rejectGenerationTestCase(
        params.draftId,
        params.caseId,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
        body,
      );
    },
  );

  app.get(
    '/test-generation/drafts/:draftId/test-cases/:caseId/feedback',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationCaseRouteParamsSchema,
        response: {
          200: z.object({
            items: z.array(testCaseFeedbackSchema),
          }),
        },
      },
    },
    async (request) => {
      const params = generationCaseRouteParamsSchema.parse(request.params);
      return listGenerationTestCaseFeedback(params.draftId, params.caseId);
    },
  );

  app.post(
    '/test-generation/drafts/:draftId/test-cases/:caseId/promote',
    {
      schema: {
        tags: ['Test Generation'],
        params: generationCaseRouteParamsSchema,
        body: generationCasePromoteBodySchema,
        response: {
          200: z.object({
            suggestion: z.record(z.string(), z.unknown()),
          }),
        },
      },
    },
    async (request) => {
      const params = generationCaseRouteParamsSchema.parse(request.params);
      const body = generationCasePromoteBodySchema.parse(request.body ?? {});
      return promoteGenerationTestCase(
        params.draftId,
        params.caseId,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
        body,
      );
    },
  );

  app.post(
    '/test-generation/drafts/:draftId/approve',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        body: generationReviewBodySchema,
        response: {
          200: z.object({
            draft: generationDraftResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      const body = generationReviewBodySchema.parse(request.body ?? {});
      return approveGenerationDraft(params.draftId, request.authUser?.name ?? env.DEFAULT_ACTOR, body.notes);
    },
  );

  app.post(
    '/test-generation/drafts/:draftId/reject',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        body: generationReviewBodySchema,
        response: {
          200: z.object({
            draft: generationDraftResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      const body = generationReviewBodySchema.parse(request.body ?? {});
      return rejectGenerationDraft(params.draftId, body.notes);
    },
  );

  app.post(
    '/test-generation/drafts/:draftId/manual-recovery',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        response: {
          200: z.object({
            run: generationRunResponseSchema,
            draft: generationDraftResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      return createManualRecoveryDraft(params.draftId, request.authUser?.name ?? env.DEFAULT_ACTOR);
    },
  );

  app.get(
    '/test-generation/drafts/:draftId/versions',
    {
      schema: {
        tags: ['Test Generation'],
        params: draftRouteParamsSchema,
        response: {
          200: z.object({
            items: z.array(generationDraftVersionResponseSchema),
          }),
        },
      },
    },
    async (request) => {
      const params = draftRouteParamsSchema.parse(request.params);
      return listGenerationDraftVersions(params.draftId);
    },
  );

  app.get(
    '/test-generation/library',
    {
      schema: {
        tags: ['Test Generation'],
        response: {
          200: testcaseLibraryResponseSchema,
        },
      },
    },
    async () => getTestcaseLibrary(),
  );

  app.get(
    '/test-generation/export',
    {
      schema: {
        tags: ['Test Generation'],
        querystring: exportQuerySchema,
      },
    },
    async (request, reply) => {
      const query = exportQuerySchema.parse(request.query);
      const payload = await exportApprovedGenerationDrafts({
        draftId: query.draftId,
        projectId: query.projectId,
        moduleId: query.moduleId,
        pageId: query.pageId,
        featureId: query.featureId,
      });
      const drafts = Array.isArray(payload) ? (payload as TestGenerationDraftExport[]) : [payload as TestGenerationDraftExport];
      let filenameBase = 'approved-generated-test-cases';
      if (query.projectId) {
        filenameBase = 'client-approved-test-cases';
      }
      if (query.moduleId) {
        filenameBase = 'module-approved-test-cases';
      }
      if (query.pageId) {
        filenameBase = 'page-approved-test-cases';
      }
      if (query.featureId) {
        filenameBase = 'feature-approved-test-cases';
      }
      if (query.draftId) {
        filenameBase = `${slugify(drafts[0]?.title ?? 'generated-test-cases')}-approved-test-cases`;
      }

      const caseRows = flattenDraftCaseRows(drafts);
      setAttachmentHeaders(reply, { format: 'csv', filenameBase });
      return buildCsvBuffer(caseRows);
    },
  );
}
