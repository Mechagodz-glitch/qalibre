import { z } from 'zod';

import { appPageAccessDefinitions, appPageAccessKeys } from './auth.constants.js';

export const appUserRoleSchema = z.enum(['ADMIN', 'USER']);
export const appPageAccessKeySchema = z.enum(appPageAccessKeys as [string, ...string[]]);

export const appPageAccessDefinitionSchema = z.object({
  key: appPageAccessKeySchema,
  label: z.string(),
  route: z.string(),
  description: z.string(),
  adminOnly: z.boolean().optional(),
});

export const authConfigResponseSchema = z.object({
  clientId: z.string(),
  tenantId: z.string(),
  authority: z.string(),
  redirectPath: z.string(),
  postLogoutRedirectPath: z.string(),
  scopes: z.array(z.string()),
  pageAccessDefinitions: z.array(appPageAccessDefinitionSchema),
});

export const authUserContributorSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleTitle: z.string().nullable(),
});

export const authUserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: appUserRoleSchema,
  isActive: z.boolean(),
  pageAccesses: z.array(appPageAccessKeySchema),
  contributor: authUserContributorSchema.nullable(),
  contributorId: z.string().nullable(),
  contributorName: z.string().nullable(),
  accessiblePages: z.array(appPageAccessKeySchema),
  isAdmin: z.boolean(),
  lastLoginAt: z.string().nullable(),
});

export const authUserListItemSchema = authUserResponseSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const authUserUpsertBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(150),
  role: appUserRoleSchema,
  pageAccesses: z.array(appPageAccessKeySchema),
  isActive: z.boolean(),
  designation: z.string().trim().min(1).max(120).optional().nullable(),
});

export const authUserListResponseSchema = z.object({
  items: z.array(authUserListItemSchema),
});

export const authUserRouteParamsSchema = z.object({
  userId: z.string().min(1),
});

export const authLoginResponseSchema = z.object({
  user: authUserResponseSchema,
});

export const projectQuarterSchema = z.enum(['Q1', 'Q2', 'Q3', 'Q4']);

export const adminProjectQuarterAllocationSchema = z.object({
  id: z.string(),
  project: z.object({
    id: z.string(),
    name: z.string(),
  }),
  year: z.number().int(),
  quarter: projectQuarterSchema,
  tester: z
    .object({
      id: z.string(),
      name: z.string(),
      roleTitle: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminProjectQuarterAllocationListResponseSchema = z.object({
  items: z.array(adminProjectQuarterAllocationSchema),
});

export const adminProjectQuarterAllocationSyncResponseSchema = z.object({
  items: z.array(adminProjectQuarterAllocationSchema),
});

export const adminProjectQuarterAllocationUpsertBodySchema = z.object({
  projectId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: projectQuarterSchema,
  testerContributorIds: z.array(z.string().min(1)).default([]),
});

export const adminProjectQuarterAllocationProjectSyncBodySchema = z.object({
  projectId: z.string().min(1),
  years: z.array(z.coerce.number().int().min(2000).max(2100)).default([]),
  quarters: z.array(projectQuarterSchema).default([]),
  testerContributorIds: z.array(z.string().min(1)).default([]),
});

export const adminProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const adminProjectCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional().nullable(),
});

export const adminProjectUpdateBodySchema = adminProjectCreateBodySchema;

export const adminProjectModuleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const adminProjectModuleCreateBodySchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional().nullable(),
});

export const adminProjectModuleUpdateBodySchema = adminProjectModuleCreateBodySchema;

export const adminProjectPageSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const adminProjectPageCreateBodySchema = z.object({
  moduleId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional().nullable(),
});

export const adminProjectPageUpdateBodySchema = adminProjectPageCreateBodySchema;

export const adminProjectFeatureSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const adminProjectFeatureCreateBodySchema = z.object({
  pageId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional().nullable(),
});

export const adminProjectFeatureUpdateBodySchema = adminProjectFeatureCreateBodySchema;

export type AuthUserUpsertBody = z.infer<typeof authUserUpsertBodySchema>;

export function buildAuthConfigResponse(tenantId: string, clientId: string) {
  return {
    clientId,
    tenantId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/login',
    scopes: ['openid', 'profile', 'email'],
    pageAccessDefinitions: appPageAccessDefinitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      route: definition.route,
      description: definition.description,
      ...(definition.key === 'admin' ? { adminOnly: true } : {}),
    })),
  } satisfies z.infer<typeof authConfigResponseSchema>;
}
