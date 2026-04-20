import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError, jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { AppError } from './lib/errors.js';
import { registerDashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerDatasetRoutes } from './modules/datasets/dataset.routes.js';
import { registerExportRoutes } from './modules/export/export.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerImportRoutes } from './modules/import/import.routes.js';
import { registerKnowledgeBaseRoutes } from './modules/knowledge-base/knowledge-base.routes.js';
import { registerLearningRoutes } from './modules/learning/learning.routes.js';
import { registerManualExecutionRoutes } from './modules/manual-execution/manual-execution.routes.js';
import { registerRefinementRoutes } from './modules/refinement/refinement.routes.js';
import { registerGenerationRoutes } from './modules/test-generation/generation.routes.js';
import { resolveAuthenticatedUser } from './modules/auth/auth.service.js';
import type { AppPageAccessKey } from './modules/auth/auth.constants.js';
import { forbidden, unauthorized } from './lib/errors.js';

function isPrivateIpv4Host(hostname: string) {
  const segments = hostname.split('.').map((segment) => Number(segment));
  if (segments.length !== 4 || segments.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)) {
    return false;
  }

  const first = segments[0] ?? -1;
  const second = segments[1] ?? -1;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isAllowedDevOrigin(origin: string, configuredOrigins: Set<string>) {
  if (configuredOrigins.has(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    if (parsed.port !== '4200') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '[::1]' || isPrivateIpv4Host(hostname);
  } catch {
    return false;
  }
}

export async function buildApp() {
  const logger =
    process.env.NODE_ENV === 'production'
      ? {
          level: 'info',
        }
      : {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        };

  const app = Fastify({
    logger,
    bodyLimit: 25 * 1024 * 1024,
  });

  app.decorateRequest('authUser', null);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const configuredOrigins = new Set(
    env.CORS_ORIGIN.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || isAllowedDevOrigin(origin, configuredOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed'), false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'QA Dataset Workbench API',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.addHook('preHandler', async (request, reply) => {
    const routeConfig = (request.routeOptions.config ?? {}) as {
      public?: boolean;
      pageKey?: AppPageAccessKey;
      adminOnly?: boolean;
    };

    if (
      routeConfig.public === true ||
      request.method === 'OPTIONS' ||
      request.raw.url?.startsWith('/health') ||
      request.raw.url?.startsWith('/docs')
    ) {
      return;
    }

    if (!request.raw.url?.startsWith('/api/')) {
      return;
    }

    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
      throw unauthorized('Authentication required.');
    }

    const authUser = await resolveAuthenticatedUser(token);
    request.authUser = authUser;

    if (routeConfig.adminOnly && authUser.role !== 'ADMIN') {
      throw forbidden('Admin access is required to view this page.');
    }

    if (routeConfig.pageKey && authUser.role !== 'ADMIN' && !authUser.pageAccesses.includes(routeConfig.pageKey)) {
      throw forbidden('You do not have access to this page.');
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-correlation-id', request.id);
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, correlationId: request.id }, 'Request failed');

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details ?? null,
      });
    }

    if (error instanceof ZodError || hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error instanceof ZodError ? error.flatten() : error.validation,
      });
    }

    if (isResponseSerializationError(error)) {
      return reply.status(500).send({
        error: 'SERIALIZATION_ERROR',
        message: 'Response serialization failed',
      });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message,
    });
  });

  await registerHealthRoutes(app);
  await app.register(async (api) => {
    await registerAuthRoutes(api);
    await registerDashboardRoutes(api);
    await registerDatasetRoutes(api);
    await registerKnowledgeBaseRoutes(api);
    await registerRefinementRoutes(api);
    await registerLearningRoutes(api);
    await registerGenerationRoutes(api);
    await registerManualExecutionRoutes(api);
    await registerImportRoutes(api);
    await registerExportRoutes(api);
  }, { prefix: '/api' });

  return app;
}
