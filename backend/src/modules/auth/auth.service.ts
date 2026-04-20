import { AppUserRole, Prisma, ProjectQuarter } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, unauthorized } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import {
  appPageAccessDefinitions,
  appPageAccessKeys,
  type AppPageAccessKey,
} from './auth.constants.js';
import type { AuthenticatedAppUser } from './auth.types.js';

const microsoftIssuer = `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`;
const microsoftJwks = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`),
);

type MicrosoftIdTokenClaims = Prisma.JsonObject & {
  oid?: string;
  tid?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
};

type AppUserWithContributor = Prisma.AppUserGetPayload<{
  include: {
    contributor: {
      select: {
        id: true;
        name: true;
        roleTitle: true;
      };
    };
  };
}>;

type ProjectWithSummary = Prisma.ProjectGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
  };
}>;

type ProjectModuleWithSummary = Prisma.ProjectModuleGetPayload<{
  select: {
    id: true;
    projectId: true;
    name: true;
    description: true;
  };
}>;

type ProjectPageWithSummary = Prisma.ProjectPageGetPayload<{
  select: {
    id: true;
    moduleId: true;
    name: true;
    description: true;
  };
}>;

type ProjectFeatureWithSummary = Prisma.ProjectFeatureGetPayload<{
  select: {
    id: true;
    pageId: true;
    name: true;
    description: true;
  };
}>;

type ProjectQuarterAllocationWithRelations = Prisma.ProjectQuarterAllocationGetPayload<{
  include: {
    project: {
      select: {
        id: true;
        name: true;
      };
    };
    tester: {
      select: {
        id: true;
        name: true;
        roleTitle: true;
      };
    };
  };
}>;

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function buildSlugFallback(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim() ?? '';
  return normalized || fallback;
}

function parseScopeList(value: string | undefined) {
  const scopes = value
    ?.split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

  return [...new Set(['openid', 'profile', ...scopes])];
}

function normalizePageAccesses(pageAccesses: string[], role: AppUserRole) {
  if (role === AppUserRole.ADMIN) {
    return [...appPageAccessKeys];
  }

  const allowed = new Set<AppPageAccessKey>(appPageAccessKeys);
  const next = new Set<AppPageAccessKey>();
  next.add('dashboard');

  for (const pageAccess of pageAccesses) {
    if (pageAccess === 'admin') {
      continue;
    }

    if (allowed.has(pageAccess as AppPageAccessKey)) {
      next.add(pageAccess as AppPageAccessKey);
    }
  }

  return [...next];
}

function toAuthenticatedUser(user: AppUserWithContributor): AuthenticatedAppUser {
  const pageAccesses = normalizePageAccesses(user.pageAccesses, user.role);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    pageAccesses,
    contributor: user.contributor
      ? {
          id: user.contributor.id,
          name: user.contributor.name,
          roleTitle: user.contributor.roleTitle ?? null,
        }
      : null,
    contributorId: user.contributorId ?? null,
    contributorName: user.contributor?.name ?? null,
    accessiblePages: pageAccesses,
    isAdmin: user.role === AppUserRole.ADMIN,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function extractEmail(claims: MicrosoftIdTokenClaims) {
  return normalizeEmail(
    claims.preferred_username ??
      claims.email ??
      claims.upn ??
      null,
  );
}

async function loadAuthenticatedUser(userId: string) {
  return prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });
}

async function ensureContributorForUser(user: AppUserWithContributor) {
  if (user.contributor) {
    return user.contributor;
  }

  const existing = await prisma.contributor.findFirst({
    where: {
      name: {
        equals: user.name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      roleTitle: true,
    },
  });

  if (existing) {
    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        contributorId: existing.id,
      },
    });
    return existing;
  }

  const contributor = await prisma.contributor.create({
    data: {
      name: user.name,
      slug: await ensureUniqueContributorSlug(user.name),
      isActive: user.isActive,
    },
    select: {
      id: true,
      name: true,
    },
  });

  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      contributorId: contributor.id,
    },
  });

  return contributor;
}

async function findReusableContributorForUser(userId: string, name: string) {
  return prisma.contributor.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
      OR: [
        {
          appUser: {
            is: null,
          },
        },
        {
          appUser: {
            is: {
              id: userId,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      roleTitle: true,
    },
  });
}

async function deactivateContributorIfUnused(contributorId: string) {
  const [appUserCount, runCount, allocationCount] = await Promise.all([
    prisma.appUser.count({
      where: {
        contributorId,
      },
    }),
    prisma.testGenerationRun.count({
      where: {
        contributorId,
      },
    }),
    prisma.projectQuarterAllocation.count({
      where: {
        testerContributorId: contributorId,
      },
    }),
  ]);

  if (appUserCount === 0 && runCount === 0 && allocationCount === 0) {
    await prisma.contributor.update({
      where: { id: contributorId },
      data: {
        isActive: false,
      },
    });
  }
}

async function createBootstrapUserFromMicrosoftAccount(args: {
  email: string;
  name: string;
  azureOid: string;
}) {
  const bootstrapUser = await prisma.appUser.create({
    data: {
      email: args.email,
      name: args.name,
      azureOid: args.azureOid || undefined,
      role: AppUserRole.ADMIN,
      pageAccesses: normalizePageAccesses([], AppUserRole.ADMIN),
      isActive: true,
    },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  await ensureContributorForUser(bootstrapUser);

  return bootstrapUser;
}

async function ensureUniqueContributorSlug(name: string) {
  const base = slugify(name) || 'contributor';
  let candidate = base;
  let suffix = 2;

  while (await prisma.contributor.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniqueProjectSlug(name: string) {
  const base = slugify(name) || buildSlugFallback('client');
  let candidate = base;
  let suffix = 2;

  while (await prisma.project.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniqueModuleSlug(projectId: string, name: string) {
  const base = slugify(name) || buildSlugFallback('module');
  let candidate = base;
  let suffix = 2;

  while (await prisma.projectModule.findUnique({ where: { projectId_slug: { projectId, slug: candidate } } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniquePageSlug(moduleId: string, name: string) {
  const base = slugify(name) || buildSlugFallback('page');
  let candidate = base;
  let suffix = 2;

  while (await prisma.projectPage.findUnique({ where: { moduleId_slug: { moduleId, slug: candidate } } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniqueFeatureSlug(pageId: string, name: string) {
  const base = slugify(name) || buildSlugFallback('feature');
  let candidate = base;
  let suffix = 2;

  while (await prisma.projectFeature.findUnique({ where: { pageId_slug: { pageId, slug: candidate } } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function verifyMicrosoftIdToken(token: string) {
  try {
    const verified = await jwtVerify(token, microsoftJwks, {
      issuer: microsoftIssuer,
      audience: env.AZURE_CLIENT_ID,
    });

    return verified.payload as MicrosoftIdTokenClaims;
  } catch (error) {
    throw unauthorized(
      error instanceof Error && error.message
        ? `Microsoft sign-in could not be verified: ${error.message}`
        : 'Microsoft sign-in could not be verified.',
    );
  }
}

export async function getAuthConfig() {
  return {
    clientId: env.AZURE_CLIENT_ID,
    tenantId: env.AZURE_TENANT_ID,
    authority: microsoftIssuer.replace('/v2.0', ''),
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '/login',
    scopes: parseScopeList(env.MICROSOFT_SCOPE || 'email'),
    pageAccessDefinitions: appPageAccessDefinitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      route: definition.route,
      description: definition.description,
      ...(definition.key === 'admin' ? { adminOnly: true } : {}),
    })),
  };
}

export async function resolveAuthenticatedUser(token: string) {
  const claims = await verifyMicrosoftIdToken(token);
  const email = extractEmail(claims);
  const name = normalizeName(claims.name, email || 'Unassigned User');
  const azureOid = normalizeName(claims.oid, '');
  const bootstrapAdminEmail = normalizeEmail(env.APP_BOOTSTRAP_ADMIN_EMAIL);

  if (!email) {
    throw unauthorized('Microsoft sign-in did not provide an email address.');
  }

  const existingUserCount = await prisma.appUser.count();
  if (existingUserCount === 0) {
    const bootstrapUser = await createBootstrapUserFromMicrosoftAccount({
      email,
      name: normalizeName(claims.name, email),
      azureOid,
    });

    const refreshedBootstrap = await loadAuthenticatedUser(bootstrapUser.id);

    if (!refreshedBootstrap) {
      throw unauthorized('Unable to resolve your QAlibre profile.');
    }

    await prisma.appUser.update({
      where: { id: refreshedBootstrap.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    const finalBootstrap = await loadAuthenticatedUser(refreshedBootstrap.id);
    if (!finalBootstrap) {
      throw unauthorized('Unable to resolve your QAlibre profile.');
    }

    return toAuthenticatedUser(finalBootstrap);
  }

  const user = await prisma.appUser.findFirst({
    where: {
      OR: [
        azureOid ? { azureOid } : undefined,
        { email: { equals: email, mode: 'insensitive' } },
      ].filter(Boolean) as Prisma.AppUserWhereInput[],
    },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  if (!user) {
    if (bootstrapAdminEmail && email === bootstrapAdminEmail) {
      const bootstrapUser = await prisma.appUser.create({
        data: {
          email,
          name: normalizeName(env.APP_BOOTSTRAP_ADMIN_NAME, name),
          azureOid: azureOid || undefined,
          role: AppUserRole.ADMIN,
          pageAccesses: normalizePageAccesses(env.APP_BOOTSTRAP_ADMIN_PAGE_ACCESSES, AppUserRole.ADMIN),
          isActive: true,
        },
        include: {
          contributor: {
            select: {
              id: true,
              name: true,
              roleTitle: true,
            },
          },
        },
      });

      await ensureContributorForUser(bootstrapUser);

      const refreshedBootstrap = await loadAuthenticatedUser(bootstrapUser.id);

      if (!refreshedBootstrap) {
        throw unauthorized('Unable to resolve your QAlibre profile.');
      }

      await prisma.appUser.update({
        where: { id: refreshedBootstrap.id },
        data: {
          lastLoginAt: new Date(),
        },
      });

      const finalBootstrap = await loadAuthenticatedUser(refreshedBootstrap.id);
      if (!finalBootstrap) {
        throw unauthorized('Unable to resolve your QAlibre profile.');
      }

      return toAuthenticatedUser(finalBootstrap);
    }

    throw forbidden('Your Microsoft account is not enabled in QAlibre. Contact an administrator.');
  }

  if (!user.isActive) {
    throw forbidden('Your QAlibre account is inactive. Contact an administrator.');
  }

  const updates: Prisma.AppUserUpdateInput = {};
  if (azureOid && user.azureOid !== azureOid) {
    updates.azureOid = azureOid;
  }

  if (normalizeName(claims.name, user.name) !== user.name) {
    updates.name = normalizeName(claims.name, user.name);
  }

  if (Object.keys(updates).length) {
    await prisma.appUser.update({
      where: { id: user.id },
      data: updates,
    });
  }

  const nextUser = await loadAuthenticatedUser(user.id);

  if (!nextUser) {
    throw unauthorized('Unable to resolve your QAlibre profile.');
  }

  if (!nextUser.contributorId) {
    await ensureContributorForUser(nextUser);
  }

  const refreshed = await loadAuthenticatedUser(user.id);

  if (!refreshed) {
    throw unauthorized('Unable to resolve your QAlibre profile.');
  }

  await prisma.appUser.update({
    where: { id: refreshed.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  const finalUser = await loadAuthenticatedUser(refreshed.id);
  if (!finalUser) {
    throw unauthorized('Unable to resolve your QAlibre profile.');
  }

  return toAuthenticatedUser(finalUser);
}

export async function getAuthenticatedUser(token: string) {
  const user = await resolveAuthenticatedUser(token);
  return {
    user,
  };
}

export async function listAppUsers() {
  const users = await prisma.appUser.findMany({
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
    orderBy: [
      { role: 'asc' },
      { isActive: 'desc' },
      { name: 'asc' },
    ],
  });

  return users.map((user) => ({
    ...toAuthenticatedUser(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }));
}

function toProjectResponse(project: ProjectWithSummary) {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
  };
}

function toProjectModuleResponse(module: ProjectModuleWithSummary) {
  return {
    id: module.id,
    projectId: module.projectId,
    name: module.name,
    description: module.description ?? null,
  };
}

function toProjectPageResponse(page: ProjectPageWithSummary) {
  return {
    id: page.id,
    moduleId: page.moduleId,
    name: page.name,
    description: page.description ?? null,
  };
}

function toProjectFeatureResponse(feature: ProjectFeatureWithSummary) {
  return {
    id: feature.id,
    pageId: feature.pageId,
    name: feature.name,
    description: feature.description ?? null,
  };
}

async function syncContributorForUser(
  userId: string,
  name: string,
  isActive: boolean,
  designation?: string | null,
) {
  const normalizedName = name.trim();
  const normalizedDesignation = designation !== undefined ? designation?.trim() || null : undefined;
  const existingUser = await prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  if (!existingUser) {
    throw badRequest('User not found.');
  }

  const reusableContributor = await findReusableContributorForUser(userId, normalizedName);

  if (existingUser.contributor) {
    if (reusableContributor && reusableContributor.id !== existingUser.contributor.id) {
      await prisma.contributor.update({
        where: { id: reusableContributor.id },
        data: {
          isActive,
          ...(normalizedDesignation !== undefined ? { roleTitle: normalizedDesignation } : {}),
        },
      });

      await prisma.appUser.update({
        where: { id: userId },
        data: {
          contributorId: reusableContributor.id,
        },
      });

      await deactivateContributorIfUnused(existingUser.contributor.id);
      return reusableContributor.id;
    }

    const contributorUpdate: Prisma.ContributorUpdateInput = {
      name: normalizedName,
      isActive,
      ...(normalizedDesignation !== undefined ? { roleTitle: normalizedDesignation } : {}),
    };

    if (existingUser.contributor.name !== normalizedName) {
      contributorUpdate.slug = await ensureUniqueContributorSlug(normalizedName);
    }

    await prisma.contributor.update({
      where: { id: existingUser.contributor.id },
      data: contributorUpdate,
    });

    return existingUser.contributor.id;
  }

  if (reusableContributor) {
    await prisma.contributor.update({
      where: { id: reusableContributor.id },
      data: {
        isActive,
        ...(normalizedDesignation !== undefined ? { roleTitle: normalizedDesignation } : {}),
      },
    });

    await prisma.appUser.update({
      where: { id: userId },
      data: {
        contributorId: reusableContributor.id,
      },
    });

    return reusableContributor.id;
  }

  const contributor = await prisma.contributor.create({
    data: {
      name: normalizedName,
      slug: await ensureUniqueContributorSlug(normalizedName),
      isActive,
      ...(normalizedDesignation !== undefined ? { roleTitle: normalizedDesignation } : {}),
    },
    select: {
      id: true,
    },
  });

  await prisma.appUser.update({
    where: { id: userId },
    data: {
      contributorId: contributor.id,
    },
  });

  return contributor.id;
}

function normalizePageAccessInput(role: AppUserRole, pageAccesses: string[]) {
  return normalizePageAccesses(pageAccesses, role);
}

export async function createAppUser(input: {
  email: string;
  name: string;
  role: AppUserRole;
  pageAccesses: string[];
  isActive: boolean;
  designation?: string | null;
}) {
  const existing = await prisma.appUser.findFirst({
    where: {
      email: {
        equals: input.email.trim(),
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    throw badRequest('A user with that email already exists.');
  }

  const pageAccesses = normalizePageAccessInput(input.role, input.pageAccesses);
  const contributorId = await syncContributorForUser(
    await prisma.appUser
      .create({
        data: {
          email: input.email.trim(),
          name: input.name.trim(),
          role: input.role,
          pageAccesses,
          isActive: input.isActive,
        },
      })
      .then((user) => user.id),
    input.name.trim(),
    input.isActive,
    input.designation,
  );

  const user = await prisma.appUser.findUnique({
    where: { email: input.email.trim() },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  if (!user) {
    throw badRequest('Unable to create user.');
  }

  if (!user.contributorId && contributorId) {
    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        contributorId,
      },
    });
  }

  return user;
}

export async function updateAppUser(
  userId: string,
  input: {
    email: string;
    name: string;
    role: AppUserRole;
    pageAccesses: string[];
    isActive: boolean;
    designation?: string | null;
  },
) {
  const existing = await prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  if (!existing) {
    throw badRequest('User not found.');
  }

  const pageAccesses = normalizePageAccessInput(input.role, input.pageAccesses);
  const email = input.email.trim();
  const name = input.name.trim();
  const updates: Prisma.AppUserUpdateInput = {
    email,
    name,
    role: input.role,
    pageAccesses,
    isActive: input.isActive,
  };

  if (existing.azureOid) {
    updates.azureOid = existing.azureOid;
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: updates,
  });

  await syncContributorForUser(userId, name, input.isActive, input.designation);

  const updated = await prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  if (!updated) {
    throw badRequest('Unable to update user.');
  }

  return updated;
}

export async function deleteAppUser(userId: string) {
  const existing = await prisma.appUser.findUnique({
    where: { id: userId },
    include: {
      contributor: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  if (!existing) {
    throw badRequest('User not found.');
  }

  await prisma.$transaction(async (transaction) => {
    if (existing.contributorId) {
      await transaction.contributor.update({
        where: { id: existing.contributorId },
        data: {
          isActive: false,
        },
      });
    }

    await transaction.appUser.delete({
      where: { id: userId },
    });
  });

  return {
    success: true as const,
  };
}

export async function createProject(input: { name: string; description?: string | null }) {
  const name = input.name.trim();
  if (!name) {
    throw badRequest('Project name is required.');
  }

  const existing = await prisma.project.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw badRequest('A project with that name already exists.');
  }

  const project = await prisma.project.create({
    data: {
      name,
      slug: await ensureUniqueProjectSlug(name),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  return toProjectResponse(project);
}

export async function updateProject(projectId: string, input: { name: string; description?: string | null }) {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  if (!existing) {
    throw badRequest('Client not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Client name is required.');
  }

  const duplicate = await prisma.project.findFirst({
    where: {
      id: {
        not: projectId,
      },
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw badRequest('A client with that name already exists.');
  }

  const nextSlug =
    existing.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
      ? undefined
      : await ensureUniqueProjectSlug(name);

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      ...(nextSlug ? { slug: nextSlug } : {}),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  return toProjectResponse(project);
}

export async function deleteProject(projectId: string) {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!existing) {
    throw badRequest('Client not found.');
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  return {
    success: true as const,
  };
}

export async function createProjectModule(input: { projectId: string; name: string; description?: string | null }) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!project) {
    throw badRequest('Client not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Module name is required.');
  }

  const existing = await prisma.projectModule.findFirst({
    where: {
      projectId: input.projectId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw badRequest('A module with that name already exists for this client.');
  }

  const moduleItem = await prisma.projectModule.create({
    data: {
      projectId: input.projectId,
      name,
      slug: await ensureUniqueModuleSlug(input.projectId, name),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      projectId: true,
      name: true,
      description: true,
    },
  });

  return toProjectModuleResponse(moduleItem);
}

export async function updateProjectModule(
  moduleId: string,
  input: { projectId: string; name: string; description?: string | null },
) {
  const existing = await prisma.projectModule.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      projectId: true,
      name: true,
      description: true,
    },
  });

  if (!existing) {
    throw badRequest('Module not found.');
  }

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
    },
  });

  if (!project) {
    throw badRequest('Client not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Module name is required.');
  }

  const duplicate = await prisma.projectModule.findFirst({
    where: {
      id: {
        not: moduleId,
      },
      projectId: input.projectId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw badRequest('A module with that name already exists for this client.');
  }

  const projectChanged = existing.projectId !== input.projectId;
  const nameChanged = existing.name.localeCompare(name, undefined, { sensitivity: 'accent' }) !== 0;
  const nextSlug = projectChanged || nameChanged ? await ensureUniqueModuleSlug(input.projectId, name) : undefined;

  const moduleItem = await prisma.projectModule.update({
    where: { id: moduleId },
    data: {
      projectId: input.projectId,
      name,
      ...(nextSlug ? { slug: nextSlug } : {}),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      projectId: true,
      name: true,
      description: true,
    },
  });

  return toProjectModuleResponse(moduleItem);
}

export async function deleteProjectModule(moduleId: string) {
  const existing = await prisma.projectModule.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw badRequest('Module not found.');
  }

  await prisma.projectModule.delete({
    where: { id: moduleId },
  });

  return {
    success: true as const,
  };
}

export async function createProjectPage(input: { moduleId: string; name: string; description?: string | null }) {
  const moduleItem = await prisma.projectModule.findUnique({
    where: { id: input.moduleId },
    select: {
      id: true,
    },
  });

  if (!moduleItem) {
    throw badRequest('Module not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Page name is required.');
  }

  const existing = await prisma.projectPage.findFirst({
    where: {
      moduleId: input.moduleId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw badRequest('A page with that name already exists for this module.');
  }

  const page = await prisma.projectPage.create({
    data: {
      moduleId: input.moduleId,
      name,
      slug: await ensureUniquePageSlug(input.moduleId, name),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      moduleId: true,
      name: true,
      description: true,
    },
  });

  return toProjectPageResponse(page);
}

export async function updateProjectPage(
  pageId: string,
  input: { moduleId: string; name: string; description?: string | null },
) {
  const existing = await prisma.projectPage.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      moduleId: true,
      name: true,
      description: true,
    },
  });

  if (!existing) {
    throw badRequest('Page not found.');
  }

  const moduleItem = await prisma.projectModule.findUnique({
    where: { id: input.moduleId },
    select: {
      id: true,
    },
  });

  if (!moduleItem) {
    throw badRequest('Module not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Page name is required.');
  }

  const duplicate = await prisma.projectPage.findFirst({
    where: {
      id: {
        not: pageId,
      },
      moduleId: input.moduleId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw badRequest('A page with that name already exists for this module.');
  }

  const moduleChanged = existing.moduleId !== input.moduleId;
  const nameChanged = existing.name.localeCompare(name, undefined, { sensitivity: 'accent' }) !== 0;
  const nextSlug = moduleChanged || nameChanged ? await ensureUniquePageSlug(input.moduleId, name) : undefined;

  const page = await prisma.projectPage.update({
    where: { id: pageId },
    data: {
      moduleId: input.moduleId,
      name,
      ...(nextSlug ? { slug: nextSlug } : {}),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      moduleId: true,
      name: true,
      description: true,
    },
  });

  return toProjectPageResponse(page);
}

export async function deleteProjectPage(pageId: string) {
  const existing = await prisma.projectPage.findUnique({
    where: { id: pageId },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw badRequest('Page not found.');
  }

  await prisma.projectPage.delete({
    where: { id: pageId },
  });

  return {
    success: true as const,
  };
}

export async function createProjectFeature(input: { pageId: string; name: string; description?: string | null }) {
  const page = await prisma.projectPage.findUnique({
    where: { id: input.pageId },
    select: {
      id: true,
    },
  });

  if (!page) {
    throw badRequest('Page not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Feature name is required.');
  }

  const existing = await prisma.projectFeature.findFirst({
    where: {
      pageId: input.pageId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw badRequest('A feature with that name already exists for this page.');
  }

  const feature = await prisma.projectFeature.create({
    data: {
      pageId: input.pageId,
      name,
      slug: await ensureUniqueFeatureSlug(input.pageId, name),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      pageId: true,
      name: true,
      description: true,
    },
  });

  return toProjectFeatureResponse(feature);
}

export async function updateProjectFeature(
  featureId: string,
  input: { pageId: string; name: string; description?: string | null },
) {
  const existing = await prisma.projectFeature.findUnique({
    where: { id: featureId },
    select: {
      id: true,
      pageId: true,
      name: true,
      description: true,
    },
  });

  if (!existing) {
    throw badRequest('Feature not found.');
  }

  const page = await prisma.projectPage.findUnique({
    where: { id: input.pageId },
    select: {
      id: true,
    },
  });

  if (!page) {
    throw badRequest('Page not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw badRequest('Feature name is required.');
  }

  const duplicate = await prisma.projectFeature.findFirst({
    where: {
      id: {
        not: featureId,
      },
      pageId: input.pageId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw badRequest('A feature with that name already exists for this page.');
  }

  const pageChanged = existing.pageId !== input.pageId;
  const nameChanged = existing.name.localeCompare(name, undefined, { sensitivity: 'accent' }) !== 0;
  const nextSlug = pageChanged || nameChanged ? await ensureUniqueFeatureSlug(input.pageId, name) : undefined;

  const feature = await prisma.projectFeature.update({
    where: { id: featureId },
    data: {
      pageId: input.pageId,
      name,
      ...(nextSlug ? { slug: nextSlug } : {}),
      description: input.description?.trim() || null,
    },
    select: {
      id: true,
      pageId: true,
      name: true,
      description: true,
    },
  });

  return toProjectFeatureResponse(feature);
}

export async function deleteProjectFeature(featureId: string) {
  const existing = await prisma.projectFeature.findUnique({
    where: { id: featureId },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw badRequest('Feature not found.');
  }

  await prisma.projectFeature.delete({
    where: { id: featureId },
  });

  return {
    success: true as const,
  };
}

export function getPageAccessDefinitions() {
  return appPageAccessDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    route: definition.route,
    description: definition.description,
    ...(definition.key === 'admin' ? { adminOnly: true } : {}),
  }));
}

export function toAdminUserResponse(user: AppUserWithContributor) {
  const current = toAuthenticatedUser(user);
  return {
    ...current,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function toProjectQuarterAllocationResponse(allocation: ProjectQuarterAllocationWithRelations) {
  return {
    id: allocation.id,
    project: {
      id: allocation.project.id,
      name: allocation.project.name,
    },
    year: allocation.year,
    quarter: allocation.quarter,
    tester: allocation.tester
      ? {
          id: allocation.tester.id,
          name: allocation.tester.name,
          roleTitle: allocation.tester.roleTitle ?? null,
        }
      : null,
    createdAt: allocation.createdAt.toISOString(),
    updatedAt: allocation.updatedAt.toISOString(),
  };
}

export async function listProjectQuarterAllocations() {
  const allocations = await prisma.projectQuarterAllocation.findMany({
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      tester: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  const quarterOrder: Record<ProjectQuarter, number> = {
    Q1: 1,
    Q2: 2,
    Q3: 3,
    Q4: 4,
  };

  return {
    items: allocations
      .sort((left, right) => {
        const projectCompare = left.project.name.localeCompare(right.project.name);
        if (projectCompare !== 0) {
          return projectCompare;
        }

        const yearCompare = left.year - right.year;
        if (yearCompare !== 0) {
          return yearCompare;
        }

        const quarterCompare = quarterOrder[left.quarter] - quarterOrder[right.quarter];
        if (quarterCompare !== 0) {
          return quarterCompare;
        }

        return (left.tester?.name ?? '').localeCompare(right.tester?.name ?? '');
      })
      .map(toProjectQuarterAllocationResponse),
  };
}

export async function upsertProjectQuarterAllocation(input: {
  projectId: string;
  year: number;
  quarter: ProjectQuarter;
  testerContributorIds: string[];
}) {
  const testerContributorIds = [...new Set(input.testerContributorIds.map((testerId) => testerId.trim()).filter(Boolean))];

  const [project, testers] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, name: true },
    }),
    prisma.contributor.findMany({
      where: {
        id: {
          in: testerContributorIds,
        },
      },
      select: { id: true, name: true, roleTitle: true },
    }),
  ]);

  if (!project) {
    throw badRequest('Selected project was not found.');
  }

  if (testers.length !== testerContributorIds.length) {
    throw badRequest('One or more selected QA testers were not found.');
  }

  const allocations = await prisma.$transaction(async (transaction) => {
    await transaction.projectQuarterAllocation.deleteMany({
      where: {
        projectId: input.projectId,
        year: input.year,
        quarter: input.quarter,
      },
    });

    if (!testerContributorIds.length) {
      return [
        await transaction.projectQuarterAllocation.create({
          data: {
            year: input.year,
            quarter: input.quarter,
            project: {
              connect: { id: input.projectId },
            },
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            tester: {
              select: {
                id: true,
                name: true,
                roleTitle: true,
              },
            },
          },
        }),
      ] as ProjectQuarterAllocationWithRelations[];
    }

    return Promise.all(
      testerContributorIds.map((testerContributorId) =>
        transaction.projectQuarterAllocation.create({
          data: {
            year: input.year,
            quarter: input.quarter,
            project: {
              connect: { id: input.projectId },
            },
            tester: {
              connect: { id: testerContributorId },
            },
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            tester: {
              select: {
                id: true,
                name: true,
                roleTitle: true,
              },
            },
          },
        }),
      ),
    );
  });

  return allocations
    .sort((left, right) => (left.tester?.name ?? '').localeCompare(right.tester?.name ?? ''))
    .map(toProjectQuarterAllocationResponse);
}

export async function syncProjectQuarterAllocations(input: {
  projectId: string;
  years: number[];
  quarters: ProjectQuarter[];
  testerContributorIds: string[];
}) {
  const years = [...new Set(input.years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100))].sort(
    (left, right) => left - right,
  );
  const quarters = [...new Set(input.quarters)];
  const testerContributorIds = [...new Set(input.testerContributorIds.map((testerId) => testerId.trim()).filter(Boolean))];

  const [project, testers] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, name: true },
    }),
    prisma.contributor.findMany({
      where: {
        id: {
          in: testerContributorIds,
        },
      },
      select: { id: true, name: true, roleTitle: true },
    }),
  ]);

  if (!project) {
    throw badRequest('Selected project was not found.');
  }

  if (testers.length !== testerContributorIds.length) {
    throw badRequest('One or more selected QA testers were not found.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.projectQuarterAllocation.deleteMany({
      where: {
        projectId: input.projectId,
      },
    });

    if (!years.length || !quarters.length) {
      return;
    }

    const selectedCombos = years.flatMap((year) => quarters.map((quarter) => ({ year, quarter })));

    for (const combo of selectedCombos) {
      if (!testerContributorIds.length) {
        await transaction.projectQuarterAllocation.create({
          data: {
            year: combo.year,
            quarter: combo.quarter,
            project: {
              connect: { id: input.projectId },
            },
          },
        });
        continue;
      }

      for (const testerContributorId of testerContributorIds) {
        await transaction.projectQuarterAllocation.create({
          data: {
            year: combo.year,
            quarter: combo.quarter,
            project: {
              connect: { id: input.projectId },
            },
            tester: {
              connect: { id: testerContributorId },
            },
          },
        });
      }
    }
  });

  const allocations = await prisma.projectQuarterAllocation.findMany({
    where: {
      projectId: input.projectId,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      tester: {
        select: {
          id: true,
          name: true,
          roleTitle: true,
        },
      },
    },
  });

  const quarterOrder: Record<ProjectQuarter, number> = {
    Q1: 1,
    Q2: 2,
    Q3: 3,
    Q4: 4,
  };

  return allocations
    .sort((left, right) => {
      const yearCompare = left.year - right.year;
      if (yearCompare !== 0) {
        return yearCompare;
      }

      const quarterCompare = quarterOrder[left.quarter] - quarterOrder[right.quarter];
      if (quarterCompare !== 0) {
        return quarterCompare;
      }

      return (left.tester?.name ?? '').localeCompare(right.tester?.name ?? '');
    })
    .map(toProjectQuarterAllocationResponse);
}
