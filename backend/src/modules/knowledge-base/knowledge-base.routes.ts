import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  createKnowledgeAsset,
  createKnowledgeAssetLink,
  deleteKnowledgeAsset,
  deleteKnowledgeAssetLink,
  getKnowledgeBaseWorkspace,
  updateKnowledgeAsset,
} from './knowledge-base.service.js';
import {
  knowledgeAssetLinkCreateBodySchema,
  knowledgeAssetResponseSchema,
  knowledgeAssetUpsertBodySchema,
  knowledgeBaseWorkspaceQuerySchema,
  knowledgeBaseWorkspaceResponseSchema,
} from './knowledge-base.schemas.js';

type RouteApp = FastifyInstance<any, any, any, any>;

const assetParamsSchema = z.object({
  assetId: z.string(),
});

const assetLinkParamsSchema = assetParamsSchema.extend({
  linkId: z.string(),
});

export async function registerKnowledgeBaseRoutes(app: RouteApp) {
  app.get(
    '/knowledge-base/workspace',
    {
      schema: {
        tags: ['Knowledge Base'],
        querystring: knowledgeBaseWorkspaceQuerySchema,
        response: {
          200: knowledgeBaseWorkspaceResponseSchema,
        },
      },
    },
    async (request) => {
      const query = knowledgeBaseWorkspaceQuerySchema.parse(request.query);
      return getKnowledgeBaseWorkspace(query);
    },
  );

  app.post(
    '/knowledge-base/assets',
    {
      schema: {
        tags: ['Knowledge Base'],
        body: knowledgeAssetUpsertBodySchema,
        response: {
          201: z.object({
            asset: knowledgeAssetResponseSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = knowledgeAssetUpsertBodySchema.parse(request.body);
      const asset = await createKnowledgeAsset(body);
      return reply.code(201).send({ asset });
    },
  );

  app.put(
    '/knowledge-base/assets/:assetId',
    {
      schema: {
        tags: ['Knowledge Base'],
        params: assetParamsSchema,
        body: knowledgeAssetUpsertBodySchema,
        response: {
          200: z.object({
            asset: knowledgeAssetResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = assetParamsSchema.parse(request.params);
      const body = knowledgeAssetUpsertBodySchema.parse(request.body);
      const asset = await updateKnowledgeAsset(params.assetId, body);
      return { asset };
    },
  );

  app.delete(
    '/knowledge-base/assets/:assetId',
    {
      schema: {
        tags: ['Knowledge Base'],
        params: assetParamsSchema,
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = assetParamsSchema.parse(request.params);
      await deleteKnowledgeAsset(params.assetId);
      return { success: true as const };
    },
  );

  app.post(
    '/knowledge-base/assets/:assetId/links',
    {
      schema: {
        tags: ['Knowledge Base'],
        params: assetParamsSchema,
        body: knowledgeAssetLinkCreateBodySchema,
        response: {
          200: z.object({
            asset: knowledgeAssetResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = assetParamsSchema.parse(request.params);
      const body = knowledgeAssetLinkCreateBodySchema.parse(request.body);
      const asset = await createKnowledgeAssetLink(params.assetId, body.datasetItemId, body.notes);
      return { asset };
    },
  );

  app.delete(
    '/knowledge-base/assets/:assetId/links/:linkId',
    {
      schema: {
        tags: ['Knowledge Base'],
        params: assetLinkParamsSchema,
        response: {
          200: z.object({
            asset: knowledgeAssetResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = assetLinkParamsSchema.parse(request.params);
      const asset = await deleteKnowledgeAssetLink(params.assetId, params.linkId);
      return { asset };
    },
  );
}
