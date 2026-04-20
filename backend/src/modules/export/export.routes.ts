import { DatasetStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { badRequest } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { buildOrderedExportObject, toDatasetItemResponse } from '../datasets/dataset.mapper.js';
import { getDatasetEntityDefinition } from '../datasets/dataset.registry.js';
import { apiDatasetItemTypeValues } from '../datasets/dataset.schemas.js';
import {
  buildCsvBuffer,
  buildWorkbookBuffer,
  exportFormatSchema,
  setAttachmentHeaders,
} from './export.utils.js';

type RouteApp = FastifyInstance<any, any, any, any>;

const exportQuerySchema = z.object({
  itemType: z.enum(apiDatasetItemTypeValues).optional(),
  format: exportFormatSchema.default('json'),
});

export async function registerExportRoutes(app: RouteApp) {
  app.get(
    '/export',
    {
      schema: {
        tags: ['Export'],
        querystring: exportQuerySchema,
      },
    },
    async (request, reply) => {
      const query = exportQuerySchema.parse(request.query);

      if (query.itemType) {
        const definition = getDatasetEntityDefinition(query.itemType);
        const items = await prisma.datasetItem.findMany({
          where: {
            itemType: definition.dbType,
            status: DatasetStatus.APPROVED,
          },
          orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
        });

        const payload = items.map((item) => buildOrderedExportObject(query.itemType!, toDatasetItemResponse(item)));
        const filenameBase = `${slugify(query.itemType)}-approved-datasets`;

        if (query.format === 'json') {
          setAttachmentHeaders(reply, { format: 'json', filenameBase });
          return payload;
        }

        if (query.format === 'csv') {
          setAttachmentHeaders(reply, { format: 'csv', filenameBase });
          return buildCsvBuffer(payload, definition.exportFieldOrder);
        }

        setAttachmentHeaders(reply, { format: 'xlsx', filenameBase });
        return buildWorkbookBuffer([
          {
            name: query.itemType,
            rows: payload,
            columnOrder: definition.exportFieldOrder,
          },
        ]);
      }

      const grouped = await Promise.all(
        apiDatasetItemTypeValues.map(async (itemType) => {
          const definition = getDatasetEntityDefinition(itemType);
          const items = await prisma.datasetItem.findMany({
            where: {
              itemType: definition.dbType,
              status: DatasetStatus.APPROVED,
            },
            orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
          });

          return {
            itemType,
            columnOrder: definition.exportFieldOrder,
            rows: items.map((item) => buildOrderedExportObject(itemType, toDatasetItemResponse(item))),
          };
        }),
      );

      if (query.format === 'csv') {
        throw badRequest('Full dataset CSV export is not supported. Choose an entity type or use XLSX.');
      }

      if (query.format === 'json') {
        setAttachmentHeaders(reply, { format: 'json', filenameBase: 'qa-dataset-workbench' });
        return Object.fromEntries(grouped.map((entry) => [entry.itemType, entry.rows]));
      }

      setAttachmentHeaders(reply, { format: 'xlsx', filenameBase: 'qa-dataset-workbench' });
      return buildWorkbookBuffer(
        grouped.map((entry) => ({
          name: entry.itemType,
          rows: entry.rows,
          columnOrder: entry.columnOrder,
        })),
      );
    },
  );
}
