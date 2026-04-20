import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import {
  archiveDatasetItem,
  cloneDatasetItem,
  createDatasetItem,
  deleteDatasetItem,
  getDatasetItem,
  listApprovalHistory,
  listDatasetItems,
  listDatasetVersions,
  restoreDatasetItem,
  updateDatasetItem,
} from './dataset.service.js';
import {
  approvalHistoryListResponseSchema,
  datasetItemResponseSchema,
  datasetListQuerySchema,
  datasetMutationBodySchema,
  datasetUpsertBodySchema,
  datasetVersionsListResponseSchema,
  paginatedDatasetItemsResponseSchema,
} from './dataset.schemas.js';
import { datasetEntityDefinitions, datasetItemTypeSchema } from './dataset.registry.js';

type RouteApp = FastifyInstance<any, any, any, any>;

const paramsSchema = z.object({
  itemType: datasetItemTypeSchema,
});

const itemParamsSchema = paramsSchema.extend({
  id: z.string(),
});

export async function registerDatasetRoutes(app: RouteApp) {
  app.get(
    '/datasets/definitions',
    {
      schema: {
        tags: ['Datasets'],
        response: {
          200: z.object({
            actor: z.string(),
            itemTypes: z.array(
              z.object({
                key: datasetItemTypeSchema,
                label: z.string(),
                pluralLabel: z.string(),
                description: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => ({
      actor: request.authUser?.name ?? env.DEFAULT_ACTOR,
      itemTypes: Object.values(datasetEntityDefinitions).map((definition) => ({
        key: definition.key,
        label: definition.label,
        pluralLabel: definition.pluralLabel,
        description: definition.description,
      })),
    }),
  );

  app.get(
    '/datasets/:itemType',
    {
      schema: {
        tags: ['Datasets'],
        params: paramsSchema,
        querystring: datasetListQuerySchema,
        response: {
          200: paginatedDatasetItemsResponseSchema,
        },
      },
    },
    async (request) => {
      const params = paramsSchema.parse(request.params);
      const query = datasetListQuerySchema.parse(request.query);
      return listDatasetItems(params.itemType, query);
    },
  );

  app.post(
    '/datasets/:itemType',
    {
      schema: {
        tags: ['Datasets'],
        params: paramsSchema,
        body: datasetUpsertBodySchema,
        response: {
          201: z.object({
            item: datasetItemResponseSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const params = paramsSchema.parse(request.params);
      const body = datasetUpsertBodySchema.parse(request.body);
      const item = await createDatasetItem(params.itemType, body, request.authUser?.name ?? env.DEFAULT_ACTOR);
      return reply.code(201).send({ item });
    },
  );

  app.get(
    '/datasets/:itemType/:id',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        response: {
          200: z.object({
            item: datasetItemResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      const item = await getDatasetItem(params.itemType, params.id);
      return { item };
    },
  );

  app.put(
    '/datasets/:itemType/:id',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        body: datasetUpsertBodySchema,
        response: {
          200: z.object({
            item: datasetItemResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      const body = datasetUpsertBodySchema.parse(request.body);
      const item = await updateDatasetItem(params.itemType, params.id, body, request.authUser?.name ?? env.DEFAULT_ACTOR);
      return { item };
    },
  );

  app.post(
    '/datasets/:itemType/:id/clone',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        response: {
          200: z.object({
            item: datasetItemResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      const item = await cloneDatasetItem(params.itemType, params.id, request.authUser?.name ?? env.DEFAULT_ACTOR);
      return { item };
    },
  );

  app.post(
    '/datasets/:itemType/:id/archive',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        body: datasetMutationBodySchema,
        response: {
          200: z.object({
            item: datasetItemResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      const body = datasetMutationBodySchema.parse(request.body ?? {});
      const item = await archiveDatasetItem(
        params.itemType,
        params.id,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
        body.notes,
      );
      return { item };
    },
  );

  app.post(
    '/datasets/:itemType/:id/restore',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        body: datasetMutationBodySchema,
        response: {
          200: z.object({
            item: datasetItemResponseSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      const body = datasetMutationBodySchema.parse(request.body ?? {});
      const item = await restoreDatasetItem(
        params.itemType,
        params.id,
        request.authUser?.name ?? env.DEFAULT_ACTOR,
        body.notes,
      );
      return { item };
    },
  );

  app.delete(
    '/datasets/:itemType/:id',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      await deleteDatasetItem(params.itemType, params.id);
      return { success: true as const };
    },
  );

  app.get(
    '/datasets/:itemType/:id/versions',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        response: {
          200: datasetVersionsListResponseSchema,
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      return listDatasetVersions(params.itemType, params.id);
    },
  );

  app.get(
    '/datasets/:itemType/:id/approvals',
    {
      schema: {
        tags: ['Datasets'],
        params: itemParamsSchema,
        response: {
          200: approvalHistoryListResponseSchema,
        },
      },
    },
    async (request) => {
      const params = itemParamsSchema.parse(request.params);
      return listApprovalHistory(params.itemType, params.id);
    },
  );
}
