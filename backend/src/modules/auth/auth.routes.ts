import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  authConfigResponseSchema,
  authLoginResponseSchema,
  adminProjectCreateBodySchema,
  adminProjectModuleCreateBodySchema,
  adminProjectModuleSchema,
  adminProjectModuleUpdateBodySchema,
  adminProjectFeatureCreateBodySchema,
  adminProjectFeatureSchema,
  adminProjectFeatureUpdateBodySchema,
  adminProjectPageCreateBodySchema,
  adminProjectPageSchema,
  adminProjectPageUpdateBodySchema,
  adminProjectUpdateBodySchema,
  adminProjectSchema,
  authUserListResponseSchema,
  authUserListItemSchema,
  authUserRouteParamsSchema,
  authUserUpsertBodySchema,
  adminProjectQuarterAllocationListResponseSchema,
  adminProjectQuarterAllocationSchema,
  adminProjectQuarterAllocationSyncResponseSchema,
  adminProjectQuarterAllocationProjectSyncBodySchema,
  adminProjectQuarterAllocationUpsertBodySchema,
} from './auth.schemas.js';
import {
  createProject,
  createProjectModule,
  createProjectPage,
  createProjectFeature,
  createAppUser,
  getAuthConfig,
  getPageAccessDefinitions,
  listAppUsers,
  listProjectQuarterAllocations,
  updateProjectModule,
  updateProjectPage,
  updateProjectFeature,
  updateProject,
  deleteAppUser,
  deleteProject,
  deleteProjectModule,
  deleteProjectPage,
  deleteProjectFeature,
  toAdminUserResponse,
  updateAppUser,
  syncProjectQuarterAllocations,
  upsertProjectQuarterAllocation,
} from './auth.service.js';
import { badRequest, unauthorized } from '../../lib/errors.js';

type RouteApp = FastifyInstance<any, any, any, any>;

export async function registerAuthRoutes(app: RouteApp) {
  app.get(
    '/auth/config',
    {
      config: {
        public: true,
      },
      schema: {
        tags: ['Auth'],
        response: {
          200: authConfigResponseSchema,
        },
      },
    },
    async () => getAuthConfig(),
  );

  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['Auth'],
        response: {
          200: authLoginResponseSchema,
        },
      },
    },
    async (request) => {
      if (!request.authUser) {
        throw unauthorized('Authenticated user context is missing.');
      }

      return {
        user: request.authUser,
      };
    },
  );

  app.get(
    '/auth/page-accesses',
    {
      config: {
        public: true,
      },
      schema: {
        tags: ['Auth'],
        response: {
          200: z.object({
            items: z.array(
              z.object({
                key: z.string(),
                label: z.string(),
                route: z.string(),
                description: z.string(),
                adminOnly: z.boolean().optional(),
              }),
            ),
          }),
        },
      },
    },
    async () => ({
      items: getPageAccessDefinitions(),
    }),
  );

  app.get(
    '/admin/users',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        response: {
          200: authUserListResponseSchema,
        },
      },
    },
    async () => ({
      items: await listAppUsers(),
    }),
  );

  app.post(
    '/admin/users',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: authUserUpsertBodySchema,
        response: {
          201: z.object({
            user: authUserListItemSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = authUserUpsertBodySchema.parse(request.body);
      const user = await createAppUser(body);
      return reply.code(201).send({ user: toAdminUserResponse(user) });
    },
  );

  app.put(
    '/admin/users/:userId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: authUserRouteParamsSchema,
        body: authUserUpsertBodySchema,
        response: {
          200: z.object({
            user: authUserListItemSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = authUserRouteParamsSchema.parse(request.params);
      const body = authUserUpsertBodySchema.parse(request.body);
      const user = await updateAppUser(params.userId, body);
      return {
        user: toAdminUserResponse(user),
      };
    },
  );

  app.put(
    '/admin/projects/:projectId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          projectId: z.string().min(1),
        }),
        body: adminProjectUpdateBodySchema,
        response: {
          200: z.object({
            project: adminProjectSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const body = adminProjectUpdateBodySchema.parse(request.body);
      const project = await updateProject(params.projectId, body);
      return { project };
    },
  );

  app.delete(
    '/admin/users/:userId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: authUserRouteParamsSchema,
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = authUserRouteParamsSchema.parse(request.params);
      const currentUserId = request.authUser?.id ?? null;
      if (currentUserId && currentUserId === params.userId) {
        throw badRequest('You cannot delete your own account.');
      }

      return deleteAppUser(params.userId);
    },
  );

  app.get(
    '/admin/project-allocations',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        response: {
          200: adminProjectQuarterAllocationListResponseSchema,
        },
      },
    },
    async () => listProjectQuarterAllocations(),
  );

  app.post(
    '/admin/project-allocations',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: adminProjectQuarterAllocationUpsertBodySchema,
        response: {
          200: adminProjectQuarterAllocationSyncResponseSchema,
        },
      },
    },
    async (request) => {
      const body = adminProjectQuarterAllocationUpsertBodySchema.parse(request.body);
      const items = await upsertProjectQuarterAllocation(body);
      return {
        items,
      };
    },
  );

  app.post(
    '/admin/project-allocations/sync',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: adminProjectQuarterAllocationProjectSyncBodySchema,
        response: {
          200: adminProjectQuarterAllocationSyncResponseSchema,
        },
      },
    },
    async (request) => {
      const body = adminProjectQuarterAllocationProjectSyncBodySchema.parse(request.body);
      const items = await syncProjectQuarterAllocations(body);
      return {
        items,
      };
    },
  );

  app.post(
    '/admin/projects',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: adminProjectCreateBodySchema,
        response: {
          201: z.object({
            project: adminProjectSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = adminProjectCreateBodySchema.parse(request.body);
      const project = await createProject(body);
      return reply.code(201).send({ project });
    },
  );

  app.delete(
    '/admin/projects/:projectId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          projectId: z.string().min(1),
        }),
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ projectId: z.string().min(1) }).parse(request.params);
      return deleteProject(params.projectId);
    },
  );

  app.post(
    '/admin/modules',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: adminProjectModuleCreateBodySchema,
        response: {
          201: z.object({
            module: adminProjectModuleSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = adminProjectModuleCreateBodySchema.parse(request.body);
      const moduleItem = await createProjectModule(body);
      return reply.code(201).send({ module: moduleItem });
    },
  );

  app.put(
    '/admin/modules/:moduleId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          moduleId: z.string().min(1),
        }),
        body: adminProjectModuleUpdateBodySchema,
        response: {
          200: z.object({
            module: adminProjectModuleSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ moduleId: z.string().min(1) }).parse(request.params);
      const body = adminProjectModuleUpdateBodySchema.parse(request.body);
      const moduleItem = await updateProjectModule(params.moduleId, body);
      return { module: moduleItem };
    },
  );

  app.delete(
    '/admin/modules/:moduleId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          moduleId: z.string().min(1),
        }),
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ moduleId: z.string().min(1) }).parse(request.params);
      return deleteProjectModule(params.moduleId);
    },
  );

  app.post(
    '/admin/pages',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: adminProjectPageCreateBodySchema,
        response: {
          201: z.object({
            page: adminProjectPageSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = adminProjectPageCreateBodySchema.parse(request.body);
      const page = await createProjectPage(body);
      return reply.code(201).send({ page });
    },
  );

  app.put(
    '/admin/pages/:pageId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          pageId: z.string().min(1),
        }),
        body: adminProjectPageUpdateBodySchema,
        response: {
          200: z.object({
            page: adminProjectPageSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ pageId: z.string().min(1) }).parse(request.params);
      const body = adminProjectPageUpdateBodySchema.parse(request.body);
      const page = await updateProjectPage(params.pageId, body);
      return { page };
    },
  );

  app.delete(
    '/admin/pages/:pageId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          pageId: z.string().min(1),
        }),
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ pageId: z.string().min(1) }).parse(request.params);
      return deleteProjectPage(params.pageId);
    },
  );

  app.post(
    '/admin/features',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        body: adminProjectFeatureCreateBodySchema,
        response: {
          201: z.object({
            feature: adminProjectFeatureSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = adminProjectFeatureCreateBodySchema.parse(request.body);
      const feature = await createProjectFeature(body);
      return reply.code(201).send({ feature });
    },
  );

  app.put(
    '/admin/features/:featureId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          featureId: z.string().min(1),
        }),
        body: adminProjectFeatureUpdateBodySchema,
        response: {
          200: z.object({
            feature: adminProjectFeatureSchema,
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ featureId: z.string().min(1) }).parse(request.params);
      const body = adminProjectFeatureUpdateBodySchema.parse(request.body);
      const feature = await updateProjectFeature(params.featureId, body);
      return { feature };
    },
  );

  app.delete(
    '/admin/features/:featureId',
    {
      config: {
        pageKey: 'admin',
      },
      schema: {
        tags: ['Admin'],
        params: z.object({
          featureId: z.string().min(1),
        }),
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request) => {
      const params = z.object({ featureId: z.string().min(1) }).parse(request.params);
      return deleteProjectFeature(params.featureId);
    },
  );
}
