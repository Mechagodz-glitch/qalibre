import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { datasetItemTypeSchema } from '../datasets/dataset.registry.js';
import { importDatasetPayloads } from './dataset-import.service.js';
import { importComponentCatalogue } from './import.service.js';
import {
  componentCatalogueImportRequestSchema,
  componentCatalogueImportSummarySchema,
  datasetImportRequestSchema,
  datasetImportSummarySchema,
} from './import.schemas.js';

type RouteApp = FastifyInstance<any, any, any, any>;

export async function registerImportRoutes(app: RouteApp) {
  app.post(
    '/import/datasets/:itemType',
    {
      schema: {
        tags: ['Import'],
        params: z.object({
          itemType: datasetItemTypeSchema,
        }),
        body: datasetImportRequestSchema,
        response: {
          200: z.object({
            summary: datasetImportSummarySchema,
          }),
        },
      },
    },
    async (request) => {
      const params = z
        .object({
          itemType: datasetItemTypeSchema,
        })
        .parse(request.params);
      const body = datasetImportRequestSchema.parse(request.body);
      const actor = request.authUser?.name ?? env.DEFAULT_ACTOR;
      request.log.info(
        {
          itemType: params.itemType,
          source: body.filePath ? 'filePath' : 'jsonText',
          dryRun: body.dryRun,
          actor,
          correlationId: request.id,
        },
        'Starting dataset import request',
      );

      const summary = await importDatasetPayloads(params.itemType, body, actor, request.log);
      return { summary };
    },
  );

  app.post(
    '/import/component-catalogue',
    {
      schema: {
        tags: ['Import'],
        body: componentCatalogueImportRequestSchema,
        response: {
          200: z.object({
            summary: componentCatalogueImportSummarySchema,
          }),
        },
      },
    },
    async (request) => {
      const body = componentCatalogueImportRequestSchema.parse(request.body);
      const actor = request.authUser?.name ?? env.DEFAULT_ACTOR;
      request.log.info(
        {
          source: body.filePath ? 'filePath' : 'jsonText',
          dryRun: body.dryRun,
          actor,
          correlationId: request.id,
        },
        'Starting component catalogue import request',
      );

      const summary = await importComponentCatalogue(body, actor, request.log);
      return { summary };
    },
  );
}
