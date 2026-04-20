import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { setAttachmentHeaders } from '../export/export.utils.js';
import {
  completeManualExecutionRun,
  createManualExecutionRun,
  deleteManualExecutionRun,
  exportManualExecutionRun,
  getManualExecutionBootstrap,
  getManualExecutionReport,
  getManualExecutionRun,
  importManualExecutionTestcases,
  listApprovedExecutionSuites,
  listManualExecutionRuns,
  updateManualExecutionCaseResult,
} from './manual-execution.service.js';
import {
  approvedExecutionSuiteSchema,
  manualExecutionApprovedSuitesQuerySchema,
  manualExecutionBootstrapResponseSchema,
  manualExecutionCaseResultSchema,
  manualExecutionCaseRouteParamsSchema,
  manualExecutionCaseUpdateBodySchema,
  manualExecutionImportBodySchema,
  manualExecutionImportResponseSchema,
  manualExecutionExportQuerySchema,
  manualExecutionReportResponseSchema,
  manualExecutionRunCreateBodySchema,
  manualExecutionRunDetailSchema,
  manualExecutionRunListQuerySchema,
  manualExecutionRunRouteParamsSchema,
  manualExecutionRunSummarySchema,
  paginatedManualExecutionRunsResponseSchema,
} from './manual-execution.schemas.js';

type RouteApp = FastifyInstance<any, any, any, any>;

export async function registerManualExecutionRoutes(app: RouteApp) {
  app.get(
    '/manual-execution/bootstrap',
    {
      schema: {
        tags: ['Manual Execution'],
        response: {
          200: manualExecutionBootstrapResponseSchema,
        },
      },
    },
    async () => getManualExecutionBootstrap(),
  );

  app.get(
    '/manual-execution/approved-suites',
    {
      schema: {
        tags: ['Manual Execution'],
        querystring: manualExecutionApprovedSuitesQuerySchema,
        response: {
          200: z.object({
            items: z.array(approvedExecutionSuiteSchema),
          }),
        },
      },
    },
    async (request) => {
      const query = manualExecutionApprovedSuitesQuerySchema.parse(request.query);
      return listApprovedExecutionSuites(query);
    },
  );

  app.get(
    '/manual-execution/runs',
    {
      schema: {
        tags: ['Manual Execution'],
        querystring: manualExecutionRunListQuerySchema,
        response: {
          200: paginatedManualExecutionRunsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = manualExecutionRunListQuerySchema.parse(request.query);
      return listManualExecutionRuns(query);
    },
  );

  app.post(
    '/manual-execution/import-testcases',
    {
      schema: {
        tags: ['Manual Execution'],
        body: manualExecutionImportBodySchema,
        response: {
          200: manualExecutionImportResponseSchema,
        },
      },
    },
    async (request) => {
      const body = manualExecutionImportBodySchema.parse(request.body);
      return importManualExecutionTestcases(body);
    },
  );

  app.post(
    '/manual-execution/runs',
    {
      schema: {
        tags: ['Manual Execution'],
        body: manualExecutionRunCreateBodySchema,
        response: {
          201: z.object({
            run: manualExecutionRunDetailSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = manualExecutionRunCreateBodySchema.parse(request.body);
      const actor = request.authUser?.name ?? env.DEFAULT_ACTOR;
      const response = await createManualExecutionRun(
        {
          ...body,
          assignedTester: request.authUser?.name ?? body.assignedTester,
        },
        actor,
      );
      return reply.code(201).send(response);
    },
  );

  app.get(
    '/manual-execution/runs/:runId',
    {
      schema: {
        tags: ['Manual Execution'],
        params: manualExecutionRunRouteParamsSchema,
        response: {
          200: z.object({
            run: manualExecutionRunDetailSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = manualExecutionRunRouteParamsSchema.parse(request.params);
      return {
        run: await getManualExecutionRun(params.runId),
      };
    },
  );

  app.delete(
    '/manual-execution/runs/:runId',
    {
      schema: {
        tags: ['Manual Execution'],
        params: manualExecutionRunRouteParamsSchema,
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = manualExecutionRunRouteParamsSchema.parse(request.params);
      return deleteManualExecutionRun(params.runId);
    },
  );

  app.patch(
    '/manual-execution/runs/:runId/cases/:caseResultId',
    {
      schema: {
        tags: ['Manual Execution'],
        params: manualExecutionCaseRouteParamsSchema,
        body: manualExecutionCaseUpdateBodySchema,
        response: {
          200: z.object({
            run: manualExecutionRunSummarySchema,
            caseResult: manualExecutionCaseResultSchema.nullable(),
          }),
        },
      },
    },
    async (request) => {
      const params = manualExecutionCaseRouteParamsSchema.parse(request.params);
      const body = manualExecutionCaseUpdateBodySchema.parse(request.body);
      return updateManualExecutionCaseResult(
        params.runId,
        params.caseResultId,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
        body,
      );
    },
  );

  app.post(
    '/manual-execution/runs/:runId/complete',
    {
      schema: {
        tags: ['Manual Execution'],
        params: manualExecutionRunRouteParamsSchema,
        response: {
          200: z.object({
            run: manualExecutionRunDetailSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = manualExecutionRunRouteParamsSchema.parse(request.params);
      return completeManualExecutionRun(params.runId, request.authUser?.name ?? env.DEFAULT_ACTOR);
    },
  );

  app.get(
    '/manual-execution/runs/:runId/report',
    {
      schema: {
        tags: ['Manual Execution'],
        params: manualExecutionRunRouteParamsSchema,
        response: {
          200: manualExecutionReportResponseSchema,
        },
      },
    },
    async (request) => {
      const params = manualExecutionRunRouteParamsSchema.parse(request.params);
      return getManualExecutionReport(params.runId);
    },
  );

  app.get(
    '/manual-execution/runs/:runId/export',
    {
      schema: {
        tags: ['Manual Execution'],
        params: manualExecutionRunRouteParamsSchema,
        querystring: manualExecutionExportQuerySchema,
      },
    },
    async (request, reply) => {
      const params = manualExecutionRunRouteParamsSchema.parse(request.params);
      const query = manualExecutionExportQuerySchema.parse(request.query);
      const exported = await exportManualExecutionRun(params.runId, query.format);
      setAttachmentHeaders(reply, { format: query.format, filenameBase: exported.filenameBase });
      return exported.buffer;
    },
  );
}
