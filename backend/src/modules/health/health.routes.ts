import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';

type RouteApp = FastifyInstance<any, any, any, any>;

export async function registerHealthRoutes(app: RouteApp) {
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        response: {
          200: z.object({
            status: z.literal('ok'),
            database: z.literal('up'),
            openAiConfigured: z.boolean(),
            timestamp: z.string(),
          }),
        },
      },
    },
    async () => {
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok' as const,
        database: 'up' as const,
        openAiConfigured: Boolean(env.OPENAI_API_KEY),
        timestamp: new Date().toISOString(),
      };
    },
  );
}
