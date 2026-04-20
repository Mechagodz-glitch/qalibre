import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import {
  approveKnowledgeSuggestion,
  listKnowledgeSuggestions,
  rejectKnowledgeSuggestion,
} from './learning.service.js';
import {
  knowledgeSuggestionResponseSchema,
  learningSuggestionQuerySchema,
  learningSuggestionReviewBodySchema,
  learningSuggestionRouteParamsSchema,
  paginatedKnowledgeSuggestionsResponseSchema,
} from './learning.schemas.js';

type RouteApp = FastifyInstance<any, any, any, any>;

export async function registerLearningRoutes(app: RouteApp) {
  app.get(
    '/learning/suggestions',
    {
      schema: {
        tags: ['Learning'],
        querystring: learningSuggestionQuerySchema,
        response: {
          200: paginatedKnowledgeSuggestionsResponseSchema,
        },
      },
    },
    async (request) => {
      const query = learningSuggestionQuerySchema.parse(request.query);
      return listKnowledgeSuggestions(query);
    },
  );

  app.post(
    '/learning/suggestions/:suggestionId/approve',
    {
      schema: {
        tags: ['Learning'],
        params: learningSuggestionRouteParamsSchema,
        body: learningSuggestionReviewBodySchema,
        response: {
          200: z.object({
            suggestion: knowledgeSuggestionResponseSchema,
            item: z.record(z.string(), z.unknown()).nullable().optional(),
          }),
        },
      },
    },
    async (request) => {
      const params = learningSuggestionRouteParamsSchema.parse(request.params);
      const body = learningSuggestionReviewBodySchema.parse(request.body ?? {});
      return approveKnowledgeSuggestion(params.suggestionId, request.authUser?.name ?? env.DEFAULT_ACTOR, body.notes);
    },
  );

  app.post(
    '/learning/suggestions/:suggestionId/reject',
    {
      schema: {
        tags: ['Learning'],
        params: learningSuggestionRouteParamsSchema,
        body: learningSuggestionReviewBodySchema,
        response: {
          200: z.object({
            suggestion: knowledgeSuggestionResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = learningSuggestionRouteParamsSchema.parse(request.params);
      const body = learningSuggestionReviewBodySchema.parse(request.body ?? {});
      return rejectKnowledgeSuggestion(params.suggestionId, request.authUser?.name ?? env.DEFAULT_ACTOR, body.notes);
    },
  );
}
