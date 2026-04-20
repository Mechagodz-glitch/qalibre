import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import {
  approveRefinementDraft,
  bulkRefineItems,
  getRefinementDraft,
  getRefinementRun,
  listRefinementDrafts,
  listRefinementRuns,
  rejectRefinementDraft,
} from './refinement.service.js';
import {
  bulkRefinementBodySchema,
  bulkRefinementResponseSchema,
  paginatedRefinementDraftsResponseSchema,
  paginatedRefinementRunsResponseSchema,
  refinementDraftListQuerySchema,
  refinementDraftSchema,
  refinementRunDetailSchema,
  refinementRunListQuerySchema,
  reviewDraftBodySchema,
  reviewDraftResponseSchema,
} from './refinement.schemas.js';

type RouteApp = FastifyInstance<any, any, any, any>;

const runParamsSchema = z.object({
  runId: z.string(),
});

const draftParamsSchema = z.object({
  draftId: z.string(),
});

export async function registerRefinementRoutes(app: RouteApp) {
  app.post(
    '/refinement/bulk',
    {
      schema: {
        tags: ['Refinement'],
        body: bulkRefinementBodySchema,
        response: {
          200: bulkRefinementResponseSchema,
        },
      },
    },
    async (request) => {
      const body = bulkRefinementBodySchema.parse(request.body);
      request.log.info(
        {
          itemType: body.itemType,
          itemCount: body.itemIds.length,
          mode: body.mode,
          correlationId: request.id,
        },
        'Starting refinement batch',
      );

      return bulkRefineItems({
        ...body,
        requestCorrelationId: request.id,
      });
    },
  );

  app.get(
    '/refinement/runs',
    {
      schema: {
        tags: ['Refinement'],
        querystring: refinementRunListQuerySchema,
        response: {
          200: paginatedRefinementRunsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = refinementRunListQuerySchema.parse(request.query);
      return listRefinementRuns(query);
    },
  );

  app.get(
    '/refinement/runs/:runId',
    {
      schema: {
        tags: ['Refinement'],
        params: runParamsSchema,
        response: {
          200: z.object({
            run: refinementRunDetailSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = runParamsSchema.parse(request.params);
      const run = await getRefinementRun(params.runId);
      return { run };
    },
  );

  app.get(
    '/refinement/drafts',
    {
      schema: {
        tags: ['Refinement'],
        querystring: refinementDraftListQuerySchema,
        response: {
          200: paginatedRefinementDraftsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = refinementDraftListQuerySchema.parse(request.query);
      return listRefinementDrafts(query);
    },
  );

  app.get(
    '/refinement/drafts/:draftId',
    {
      schema: {
        tags: ['Refinement'],
        params: draftParamsSchema,
        response: {
          200: z.object({
            draft: refinementDraftSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = draftParamsSchema.parse(request.params);
      const draft = await getRefinementDraft(params.draftId);
      return { draft };
    },
  );

  app.post(
    '/refinement/drafts/:draftId/approve',
    {
      schema: {
        tags: ['Refinement'],
        params: draftParamsSchema,
        body: reviewDraftBodySchema,
        response: {
          200: reviewDraftResponseSchema,
        },
      },
    },
    async (request) => {
      const params = draftParamsSchema.parse(request.params);
      const body = reviewDraftBodySchema.parse(request.body ?? {});
      const actor = request.authUser?.name ?? env.DEFAULT_ACTOR;
      request.log.info(
        {
          draftId: params.draftId,
          actor,
          correlationId: request.id,
        },
        'Approving refinement draft',
      );

      return approveRefinementDraft(params.draftId, actor, body.notes);
    },
  );

  app.post(
    '/refinement/drafts/:draftId/reject',
    {
      schema: {
        tags: ['Refinement'],
        params: draftParamsSchema,
        body: reviewDraftBodySchema,
        response: {
          200: reviewDraftResponseSchema,
        },
      },
    },
    async (request) => {
      const params = draftParamsSchema.parse(request.params);
      const body = reviewDraftBodySchema.parse(request.body ?? {});
      const actor = request.authUser?.name ?? env.DEFAULT_ACTOR;
      request.log.info(
        {
          draftId: params.draftId,
          actor,
          correlationId: request.id,
        },
        'Rejecting refinement draft',
      );

      return rejectRefinementDraft(params.draftId, actor, body.notes);
    },
  );
}
