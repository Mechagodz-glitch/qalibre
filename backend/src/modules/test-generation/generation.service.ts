import { randomUUID } from 'node:crypto';

import {
  DatasetStatus,
  DraftReviewStatus,
  KnowledgeScopeLevel,
  Prisma,
  TestCaseFeedbackReason,
  TestGenerationMode,
  TestGenerationRunStatus,
  type DatasetItem,
} from '@prisma/client';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { slugify } from '../../lib/slug.js';
import { getDefaultComponentStandardTestCases } from '../datasets/component-standard-test-cases.js';
import { parsePayloadForItemType } from '../datasets/dataset.mapper.js';
import { toApiDatasetItemType } from '../datasets/dataset.registry.js';
import type { ApiDatasetItemType } from '../datasets/dataset.schemas.js';
import {
  createPromotionSuggestionFromTestCase,
  triggerAutoStrengtheningForApprovedDraft,
  triggerAutoStrengtheningForCoverageAnalysis,
  triggerAutoStrengtheningForFeedback,
} from '../learning/learning.service.js';
import { buildCoveragePlan, buildCoverageSummaryLines, validateCoveragePlan, type CoverageValidationSummary } from './coverage-planner.js';
import {
  coverageAnalysisSchema,
  generationStoredRequestPayloadSchema,
  preparedSourceInputSchema,
  testCaseFeedbackReasonValues,
  type ApiGenerationMode,
  type CoverageAnalysis,
  type GenerationCreateBody,
  type GenerationDraftUpdateBody,
} from './generation.schemas.js';
import {
  runTestGenerationWithOpenAi,
  type GenerationRunProgressUpdate,
} from './openai.service.js';
import { prepareSourceInputs, type PreparedSourceInput } from './source-parser.js';

const apiToDbModeMap: Record<ApiGenerationMode, TestGenerationMode> = {
  processAlpha: TestGenerationMode.PROCESS_ALPHA,
  processBeta: TestGenerationMode.PROCESS_BETA,
  manualRecovery: TestGenerationMode.MANUAL_RECOVERY,
};

const dbToApiModeMap: Record<TestGenerationMode, ApiGenerationMode> = {
  [TestGenerationMode.PROCESS_ALPHA]: 'processAlpha',
  [TestGenerationMode.PROCESS_BETA]: 'processBeta',
  [TestGenerationMode.MANUAL_RECOVERY]: 'manualRecovery',
};

const dbToApiStatusMap: Record<TestGenerationRunStatus, 'pending' | 'completed' | 'failed'> = {
  [TestGenerationRunStatus.PENDING]: 'pending',
  [TestGenerationRunStatus.COMPLETED]: 'completed',
  [TestGenerationRunStatus.FAILED]: 'failed',
};

const dbToApiDraftStatusMap: Record<DraftReviewStatus, 'pending' | 'approved' | 'rejected'> = {
  [DraftReviewStatus.PENDING]: 'pending',
  [DraftReviewStatus.APPROVED]: 'approved',
  [DraftReviewStatus.REJECTED]: 'rejected',
};

const severityMap: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const priorityMap: Record<string, string> = {
  p0: 'P0',
  critical: 'P0',
  blocker: 'P0',
  highest: 'P0',
  p1: 'P1',
  high: 'P1',
  major: 'P1',
  p2: 'P2',
  medium: 'P2',
  normal: 'P2',
  moderate: 'P2',
  p3: 'P3',
  low: 'P3',
  minor: 'P3',
};

const testTypeMap: Record<string, string> = {
  smoke: 'Smoke',
  functional: 'Functional',
  integration: 'Integration',
  api: 'API',
  regression: 'Regression',
  e2e: 'E2E',
  performance: 'Performance',
  security: 'Security',
  accessibility: 'Accessibility',
  usability: 'Usability',
  compatibility: 'Compatibility',
  responsiveness: 'Responsiveness',
  'data integrity': 'Data Integrity',
  recovery: 'Recovery',
};

type CompactKnowledgeBaseItem = {
  id: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  project?: { id: string; name: string } | null;
  module?: { id: string; name: string } | null;
  page?: { id: string; name: string } | null;
  scopeLevel?: 'project' | 'module' | 'page' | null;
};

type GroupedKnowledgeBase = Record<ApiDatasetItemType, CompactKnowledgeBaseItem[]>;

type StoredGenerationRequest = Prisma.JsonValue & {
  title: string;
  description: string;
  requestedBy: string;
  mode: ApiGenerationMode;
  userFeatures: string[];
  suiteContext: GenerationCreateBody['suiteContext'];
  selectedDatasetIds: Record<string, string[]>;
  generationOptions: Record<string, unknown>;
  sources: PreparedSourceInput[];
};

type QueuedGenerationExecution = {
  runId: string;
  title: string;
  description: string;
  mode: ApiGenerationMode;
  userFeatures: string[];
  suiteContext: GenerationCreateBody['suiteContext'];
  selectedDatasetIds: GenerationCreateBody['selectedDatasetIds'];
  generationOptions: GenerationCreateBody['generationOptions'];
  preparedSources: PreparedSourceInput[];
  correlationId: string;
  storedRequest: StoredGenerationRequest;
  sourceSummary: Record<string, unknown>;
  contributorId: string | null;
  pageId: string;
  featureId: string | null;
};

type ActiveGenerationJob = {
  promise: Promise<void>;
  controller: AbortController;
};

const activeGenerationJobs = new Map<string, ActiveGenerationJob>();

const contributorCardSelect = Prisma.validator<Prisma.ContributorSelect>()({
  id: true,
  name: true,
  roleTitle: true,
  accentColor: true,
});

const suitePageSelect = Prisma.validator<Prisma.ProjectPageSelect>()({
  id: true,
  name: true,
  module: {
    select: {
      id: true,
      name: true,
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
});

const suiteFeatureSelect = Prisma.validator<Prisma.ProjectFeatureSelect>()({
  id: true,
  name: true,
});

const generationRunInclude = Prisma.validator<Prisma.TestGenerationRunInclude>()({
  draft: {
    select: {
      id: true,
    },
  },
  contributor: {
    select: contributorCardSelect,
  },
  page: {
    select: suitePageSelect,
  },
  feature: {
    select: suiteFeatureSelect,
  },
});

const generationDraftInclude = Prisma.validator<Prisma.TestCaseDraftInclude>()({
  run: {
    select: {
      mode: true,
      model: true,
      requestPayload: true,
      contributor: {
        select: contributorCardSelect,
      },
      page: {
        select: suitePageSelect,
      },
      feature: {
        select: suiteFeatureSelect,
      },
    },
  },
  testCaseFeedback: {
    orderBy: {
      createdAt: 'desc',
    },
  },
});

type RunWithContext = Prisma.TestGenerationRunGetPayload<{
  include: typeof generationRunInclude;
}>;

type DraftWithContext = Prisma.TestCaseDraftGetPayload<{
  include: typeof generationDraftInclude;
}>;

type SuiteHierarchyPage = NonNullable<RunWithContext['page']>;
type SuiteContextResponse = {
  contributor: {
    id: string;
    name: string;
    roleTitle: string | null;
    accentColor: string | null;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
  module: {
    id: string;
    name: string;
  } | null;
  page: {
    id: string;
    name: string;
  } | null;
  feature: {
    id: string;
    name: string;
  } | null;
  path: string | null;
};

type TestcaseLibraryNode = {
  id: string;
  name: string;
  kind: 'client' | 'module' | 'page' | 'feature';
  path: string;
  qaOwners: string[];
  approvedSuiteCount: number;
  approvedCaseCount: number;
  scope: {
    projectId: string | null;
    moduleId: string | null;
    pageId: string | null;
    featureId: string | null;
  };
  children: TestcaseLibraryNode[];
};

type InternalTestcaseLibraryNode = Omit<TestcaseLibraryNode, 'qaOwners' | 'children'> & {
  qaOwnerSet: Set<string>;
  children: InternalTestcaseLibraryNode[];
};

const knowledgeBaseLimits: Record<ApiDatasetItemType, number> = {
  componentCatalogue: 10,
  featureType: 6,
  rulePack: 8,
  testTaxonomy: 8,
  scenarioTemplate: 5,
  projectMemory: 4,
  priorityMapping: 1,
  severityMapping: 1,
  synonymAlias: 8,
};

const searchStopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'will',
  'into',
  'also',
  'over',
  'when',
  'where',
  'have',
  'has',
  'had',
  'been',
  'being',
  'user',
  'users',
  'page',
  'module',
  'released',
  'testing',
  'validation',
  'should',
  'using',
  'allows',
  'allow',
  'display',
  'displays',
  'shows',
  'showing',
  'data',
  'view',
  'views',
  'work',
  'works',
  'correctly',
]);

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

const screenSizeResolutionMap: Record<string, string> = {
  mobile: '390 x 844 px',
  tablet: '768 x 1024 px',
  laptop: '1366 x 768 px',
  desktop: '1920 x 1080 px',
  '4K TV': '3840 x 2160 px',
};

type ResolvedScreenSizeEntry = {
  label: string;
  resolution: string | null;
  slug: string;
};

function resolveScreenSizeEntries(screenSizes: unknown): ResolvedScreenSizeEntry[] {
  if (!Array.isArray(screenSizes)) {
    return [];
  }

  const seen = new Set<string>();
  const entries: ResolvedScreenSizeEntry[] = [];

  for (const value of screenSizes) {
    const label = normalizeWhitespace(String(value ?? ''));
    if (!label) {
      continue;
    }

    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push({
      label,
      resolution: screenSizeResolutionMap[label] ?? null,
      slug: slugify(label) || 'screen-size',
    });
  }

  return entries;
}

function formatResolvedScreenSizeLabel(entry: ResolvedScreenSizeEntry) {
  return entry.resolution ? `${entry.label} (${entry.resolution})` : entry.label;
}

function buildScreenSizeCoverageNote(screenSizes: unknown) {
  const entries = dedupeStrings(resolveScreenSizeEntries(screenSizes).map((entry) => formatResolvedScreenSizeLabel(entry)));

  if (!entries.length) {
    return '';
  }

  return `Responsive execution targets: ${entries.join('; ')}.`;
}

function appendScreenSizeCoverageNote(existingNotes: string, screenSizeCoverageNote: string) {
  const normalizedExisting = normalizeWhitespace(existingNotes);
  const normalizedNote = normalizeWhitespace(screenSizeCoverageNote);
  if (!normalizedNote) {
    return normalizedExisting;
  }

  if (normalizedExisting.toLowerCase().includes(normalizedNote.toLowerCase())) {
    return normalizedExisting;
  }

  if (!normalizedExisting) {
    return normalizedNote;
  }

  return `${normalizedExisting}\n${normalizedNote}`;
}

function toJsonRecord(value: Prisma.JsonValue): Prisma.JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Prisma.JsonObject) : null;
}

function toTitleCase(value: string) {
  return normalizeWhitespace(value)
    .split(' ')
    .map((token) => {
      if (/^[A-Z0-9]{2,5}$/.test(token)) {
        return token.toUpperCase();
      }

      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

function stripLeadingVerify(value: string) {
  return normalizeWhitespace(value).replace(/^verify\b[:\-\s]*/i, '').trim();
}

function ensureVerifyTitle(value: string, fallback: string) {
  const normalized = stripLeadingVerify(value) || stripLeadingVerify(fallback);
  const titled = toTitleCase(normalized || 'Generated Test Case');
  return `Verify ${titled}`;
}

function ensureVerifyObjective(value: string, fallback: string) {
  const normalized = normalizeWhitespace(value || fallback);
  if (!normalized) {
    return 'Verify that the expected product behavior is observed.';
  }

  if (/^verify\b/i.test(normalized)) {
    return normalized;
  }

  return `Verify that ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
}

function dedupeStrings(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function truncateText(value: string, maxLength = 320) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactStringList(value: unknown, maxItems = 6, maxLength = 160) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(
    value
      .map((entry) => truncateText(String(entry), maxLength))
      .filter(Boolean),
  ).slice(0, maxItems);
}

function compactObjectPreview(value: unknown, maxEntries = 6) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries: Array<[string, string | number | boolean | string[]]> = [];

  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>).slice(0, maxEntries)) {
    if (typeof entryValue === 'string') {
      const compacted = truncateText(entryValue, 140);
      if (compacted) {
        entries.push([key, compacted]);
      }
      continue;
    }

    if (typeof entryValue === 'number' || typeof entryValue === 'boolean') {
      entries.push([key, entryValue]);
      continue;
    }

    if (Array.isArray(entryValue)) {
      const compacted = compactStringList(entryValue, 4, 120);
      if (compacted.length > 0) {
        entries.push([key, compacted]);
      }
    }
  }

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function compactUnknownList(value: unknown, maxItems = 4) {
  if (!Array.isArray(value)) {
    return [];
  }

  const compacted: Array<string | Record<string, string | number | boolean | string[]>> = [];

  for (const entry of value.slice(0, maxItems)) {
    if (typeof entry === 'string') {
      const preview = truncateText(entry, 140);
      if (preview) {
        compacted.push(preview);
      }
      continue;
    }

    const preview = compactObjectPreview(entry, 5);
    if (preview) {
      compacted.push(preview);
    }
  }

  return compacted;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

function buildSuitePath(
  projectName: string | null,
  moduleName: string | null,
  pageName: string | null,
  featureName?: string | null,
) {
  const segments = [projectName, moduleName, pageName, featureName ?? null].filter(
    (segment): segment is string => Boolean(segment && normalizeWhitespace(segment)),
  );
  return segments.length ? segments.join(' > ') : null;
}

function toSuiteContextResponse(input: {
  contributor: RunWithContext['contributor'] | DraftWithContext['run']['contributor'] | null;
  page: SuiteHierarchyPage | DraftWithContext['run']['page'] | null;
  feature?: RunWithContext['feature'] | DraftWithContext['run']['feature'] | null;
}): SuiteContextResponse {
  const page = input.page;
  const project = page?.module.project ?? null;
  const moduleItem = page?.module ?? null;
  const feature = input.feature ?? null;

  return {
    contributor: input.contributor
      ? {
          id: input.contributor.id,
          name: input.contributor.name,
          roleTitle: input.contributor.roleTitle ?? null,
          accentColor: input.contributor.accentColor ?? null,
        }
      : null,
    project: project
      ? {
          id: project.id,
          name: project.name,
        }
      : null,
    module: moduleItem
      ? {
          id: moduleItem.id,
          name: moduleItem.name,
        }
      : null,
    page: page
      ? {
          id: page.id,
          name: page.name,
        }
      : null,
    feature: feature
      ? {
          id: feature.id,
          name: feature.name,
        }
      : null,
    path: buildSuitePath(project?.name ?? null, moduleItem?.name ?? null, page?.name ?? null, feature?.name ?? null),
  };
}

function toLearningSuiteContext(input: {
  page: SuiteHierarchyPage | DraftWithContext['run']['page'] | null;
}) {
  const page = input.page;
  const project = page?.module.project ?? null;
  const moduleItem = page?.module ?? null;

  return {
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    moduleId: moduleItem?.id ?? null,
    moduleName: moduleItem?.name ?? null,
    pageId: page?.id ?? null,
    pageName: page?.name ?? null,
    path: buildSuitePath(project?.name ?? null, moduleItem?.name ?? null, page?.name ?? null),
  };
}

function buildSlugFallback(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function ensureUniqueProjectSlug(client: DbClient, name: string) {
  const base = slugify(name) || buildSlugFallback('project');
  let candidate = base;
  let suffix = 2;

  while (await client.project.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniqueContributorSlug(client: DbClient, name: string) {
  const base = slugify(name) || buildSlugFallback('contributor');
  let candidate = base;
  let suffix = 2;

  while (await client.contributor.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniqueModuleSlug(client: DbClient, projectId: string, name: string) {
  const base = slugify(name) || buildSlugFallback('module');
  let candidate = base;
  let suffix = 2;

  while (await client.projectModule.findUnique({ where: { projectId_slug: { projectId, slug: candidate } } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniquePageSlug(client: DbClient, moduleId: string, name: string) {
  const base = slugify(name) || buildSlugFallback('page');
  let candidate = base;
  let suffix = 2;

  while (await client.projectPage.findUnique({ where: { moduleId_slug: { moduleId, slug: candidate } } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureUniqueFeatureSlug(client: DbClient, pageId: string, name: string) {
  const base = slugify(name) || buildSlugFallback('feature');
  let candidate = base;
  let suffix = 2;

  while (await client.projectFeature.findUnique({ where: { pageId_slug: { pageId, slug: candidate } } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function resolveContributor(client: DbClient, contributorId?: string, contributorName?: string) {
  if (contributorId) {
    const contributor = await client.contributor.findUnique({
      where: { id: contributorId },
      select: contributorCardSelect,
    });

    if (!contributor) {
      throw badRequest('Selected contributor was not found.');
    }

    return contributor;
  }

  const normalizedName = normalizeWhitespace(contributorName ?? '');
  if (!normalizedName) {
    return null;
  }

  const existingContributor = await client.contributor.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: 'insensitive',
      },
    },
    select: contributorCardSelect,
  });

  if (existingContributor) {
    return existingContributor;
  }

  return client.contributor.create({
    data: {
      name: normalizedName,
      slug: await ensureUniqueContributorSlug(client, normalizedName),
    },
    select: contributorCardSelect,
  });
}

async function loadSuitePageById(client: DbClient, pageId: string) {
  return client.projectPage.findUnique({
    where: { id: pageId },
    select: suitePageSelect,
  });
}

async function loadFeatureById(client: DbClient, featureId: string) {
  return client.projectFeature.findUnique({
    where: { id: featureId },
    include: {
      page: {
        select: suitePageSelect,
      },
    },
  });
}

async function loadProjectById(client: DbClient, projectId: string) {
  return client.project.findUnique({
    where: { id: projectId },
  });
}

async function loadModuleById(client: DbClient, moduleId: string) {
  return client.projectModule.findUnique({
    where: { id: moduleId },
    include: {
      project: true,
    },
  });
}

async function resolveSuitePage(client: DbClient, input: GenerationCreateBody['suiteContext']) {
  if (input.pageId) {
    const page = await loadSuitePageById(client, input.pageId);
    if (!page) {
      throw badRequest('Selected page was not found.');
    }

    if (input.moduleId && page.module.id !== input.moduleId) {
      throw badRequest('Selected page does not belong to the selected module.');
    }

    if (input.projectId && page.module.project.id !== input.projectId) {
      throw badRequest('Selected page does not belong to the selected project.');
    }

    return page;
  }

  let project =
    input.projectId && input.projectId.trim()
      ? await loadProjectById(client, input.projectId.trim())
      : await client.project.findFirst({
          where: {
            name: {
              equals: input.projectName.trim(),
              mode: 'insensitive',
            },
          },
        });

  if (!project) {
    throw badRequest('Select an existing client before creating a generation run.');
  }

  let moduleItem =
    input.moduleId && input.moduleId.trim()
      ? await loadModuleById(client, input.moduleId.trim())
      : await client.projectModule.findFirst({
          where: {
            projectId: project.id,
            name: {
              equals: input.moduleName.trim(),
              mode: 'insensitive',
            },
          },
          include: {
            project: true,
          },
        });

  if (moduleItem && moduleItem.projectId !== project.id) {
    throw badRequest('Selected module does not belong to the selected project.');
  }

  if (!moduleItem) {
    throw badRequest('Select an existing module before creating a generation run.');
  }

  const existingPage = await client.projectPage.findFirst({
    where: {
      moduleId: moduleItem.id,
      name: {
        equals: input.pageName.trim(),
        mode: 'insensitive',
      },
    },
    select: suitePageSelect,
  });

  if (existingPage) {
    return existingPage;
  }

  return client.projectPage.create({
    data: {
      moduleId: moduleItem.id,
      name: input.pageName.trim(),
      slug: await ensureUniquePageSlug(client, moduleItem.id, input.pageName.trim()),
    },
    select: suitePageSelect,
  });
}

async function resolveSuiteFeature(
  client: DbClient,
  page: SuiteHierarchyPage,
  input: GenerationCreateBody['suiteContext'],
) {
  const featureId = input.featureId?.trim();
  const featureName = normalizeWhitespace(input.featureName ?? '');

  if (!featureId && !featureName) {
    return null;
  }

  if (featureId) {
    const feature = await loadFeatureById(client, featureId);
    if (!feature) {
      throw badRequest('Selected feature was not found.');
    }

    if (feature.page.id !== page.id) {
      throw badRequest('Selected feature does not belong to the selected page.');
    }

    return {
      id: feature.id,
      name: feature.name,
      description: feature.description ?? null,
    };
  }

  const existingFeature = await client.projectFeature.findFirst({
    where: {
      pageId: page.id,
      name: {
        equals: featureName,
        mode: 'insensitive',
      },
    },
    select: suiteFeatureSelect,
  });

  if (existingFeature) {
    return {
      id: existingFeature.id,
      name: existingFeature.name,
      description: null,
    };
  }

  return client.projectFeature.create({
    data: {
      pageId: page.id,
      name: featureName,
      slug: await ensureUniqueFeatureSlug(client, page.id, featureName),
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });
}

function tokenizeSearchText(value: string) {
  return dedupeStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !searchStopWords.has(token)),
  );
}

function collectSearchTerms(input: {
  title: string;
  description: string;
  suiteContext?: GenerationCreateBody['suiteContext'];
  userFeatures?: string[];
  preparedSources: PreparedSourceInput[];
}) {
  const rawText = [
    input.title,
    input.description,
    input.suiteContext?.projectName ?? '',
    input.suiteContext?.moduleName ?? '',
    input.suiteContext?.pageName ?? '',
    input.suiteContext?.featureName ?? '',
    ...(input.userFeatures ?? []),
    ...input.preparedSources.flatMap((source) => [
      source.label,
      source.filename ?? '',
      source.notes ?? '',
      source.url ?? '',
      source.contentText.slice(0, 8_000),
    ]),
  ]
    .filter(Boolean)
    .join(' ');

  return tokenizeSearchText(rawText).slice(0, 80);
}

function normalizeScopedFeatureName(suiteContext: GenerationCreateBody['suiteContext']) {
  return normalizeWhitespace(suiteContext.featureName ?? '');
}

function isFeatureScopedSuite(suiteContext: GenerationCreateBody['suiteContext']) {
  return Boolean(suiteContext.featureId?.trim() || normalizeScopedFeatureName(suiteContext));
}

function getEffectiveGenerationFeatures(
  suiteContext: GenerationCreateBody['suiteContext'],
  userFeatures: string[],
) {
  const scopedFeatureName = normalizeScopedFeatureName(suiteContext);
  return scopedFeatureName ? [scopedFeatureName] : dedupeStrings(userFeatures.map((value) => normalizeWhitespace(value)));
}

function matchesScope(item: CompactKnowledgeBaseItem, suiteContext: GenerationCreateBody['suiteContext']) {
  if (!item.scopeLevel) {
    return false;
  }

  const projectId = suiteContext.projectId?.trim();
  const moduleId = suiteContext.moduleId?.trim();
  const pageId = suiteContext.pageId?.trim();

  if (item.scopeLevel === 'page') {
    return Boolean(pageId && item.page?.id === pageId);
  }

  if (item.scopeLevel === 'module') {
    return Boolean(moduleId && item.module?.id === moduleId);
  }

  return Boolean(projectId && item.project?.id === projectId);
}

function pickScopedProjectMemory(
  grouped: GroupedKnowledgeBase,
  suiteContext: GenerationCreateBody['suiteContext'],
  selectedIds: Set<string>,
) {
  const pageScoped = grouped.projectMemory.filter(
    (item) => item.scopeLevel === 'page' && !selectedIds.has(item.id) && matchesScope(item, suiteContext),
  );
  const moduleScoped = grouped.projectMemory.filter(
    (item) =>
      item.scopeLevel === 'module' &&
      !selectedIds.has(item.id) &&
      matchesScope(item, suiteContext) &&
      !pageScoped.some((candidate) => candidate.id === item.id),
  );
  const projectScoped = grouped.projectMemory.filter(
    (item) =>
      item.scopeLevel === 'project' &&
      !selectedIds.has(item.id) &&
      matchesScope(item, suiteContext) &&
      !pageScoped.some((candidate) => candidate.id === item.id) &&
      !moduleScoped.some((candidate) => candidate.id === item.id),
  );

  return [...pageScoped, ...moduleScoped, ...projectScoped].slice(0, knowledgeBaseLimits.projectMemory);
}

function flattenPayloadText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => flattenPayloadText(entry)).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => flattenPayloadText(entry))
      .join(' ');
  }

  return '';
}

function scoreKnowledgeBaseItem(item: CompactKnowledgeBaseItem, searchTerms: string[]) {
  if (searchTerms.length === 0) {
    return 0;
  }

  const title = item.title.toLowerCase();
  const summary = (item.summary ?? '').toLowerCase();
  const payload = flattenPayloadText(item.payload).toLowerCase();

  return searchTerms.reduce((score, term) => {
    if (title.includes(term)) {
      return score + 6;
    }

    if (summary.includes(term)) {
      return score + 3;
    }

    if (payload.includes(term)) {
      return score + 1;
    }

    return score;
  }, 0);
}

function countGroupedItems(grouped: GroupedKnowledgeBase) {
  return Object.fromEntries(
    Object.entries(grouped).map(([itemType, items]) => [itemType, Array.isArray(items) ? items.length : 0]),
  ) as Record<ApiDatasetItemType, number>;
}

function pickRelevantItems(
  grouped: GroupedKnowledgeBase,
  selected: GroupedKnowledgeBase,
  searchTerms: string[],
  suiteContext?: GenerationCreateBody['suiteContext'],
) {
  const relevant = {} as GroupedKnowledgeBase;
  const allowLooseFallback = searchTerms.length === 0;
  const safeFallbackTypes = new Set<ApiDatasetItemType>(['priorityMapping', 'severityMapping']);

  for (const itemType of Object.keys(grouped) as ApiDatasetItemType[]) {
    const selectedIds = new Set(selected[itemType].map((item) => item.id));

    if (itemType === 'projectMemory') {
      relevant[itemType] = suiteContext ? pickScopedProjectMemory(grouped, suiteContext, selectedIds) : [];
      continue;
    }

    const ranked = grouped[itemType]
      .filter((item) => !selectedIds.has(item.id))
      .map((item) => ({
        item,
        score: scoreKnowledgeBaseItem(item, searchTerms),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
      .slice(0, knowledgeBaseLimits[itemType])
      .map((entry) => entry.item);

    if (ranked.length > 0) {
      relevant[itemType] = ranked;
      continue;
    }

    if (!allowLooseFallback && !safeFallbackTypes.has(itemType)) {
      relevant[itemType] = [];
      continue;
    }

    const fallbackCount = Math.min(knowledgeBaseLimits[itemType], itemType === 'componentCatalogue' ? 4 : 2);
    relevant[itemType] = grouped[itemType]
      .filter((item) => !selectedIds.has(item.id))
      .slice(0, fallbackCount);
  }

  return relevant;
}

function normalizeSeverity(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return severityMap[normalized] ?? 'Medium';
}

function normalizePriority(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return priorityMap[normalized] ?? 'P2';
}

function normalizeTestType(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return testTypeMap[normalized] ?? toTitleCase(normalized || 'Functional');
}

function normalizeCaseReviewStatus(value: unknown): 'pending' | 'approved' | 'rejected' {
  const normalized = typeof value === 'string' ? normalizeWhitespace(value).toLowerCase() : '';
  if (normalized === 'approved' || normalized === 'rejected') {
    return normalized;
  }

  return 'pending';
}

function normalizeFeedbackReason(value: unknown): (typeof testCaseFeedbackReasonValues)[number] | null {
  const normalized = typeof value === 'string' ? normalizeWhitespace(value).toLowerCase() : '';
  return (testCaseFeedbackReasonValues as readonly string[]).includes(normalized)
    ? (normalized as (typeof testCaseFeedbackReasonValues)[number])
    : null;
}

function buildTestCaseFeedbackFingerprint(testCase: Record<string, unknown>, reasonCode: string | null) {
  const component = Array.isArray(testCase.linkedComponents) ? String(testCase.linkedComponents[0] ?? '') : '';
  const feature = String(testCase.feature ?? '');
  const scenario = String(testCase.scenario ?? '');
  return [reasonCode ?? 'approved', component || feature, scenario]
    .map((value) => slugify(String(value ?? '')) || 'na')
    .join(':');
}

function extractDraftCases(draft: { generatedCases: Prisma.JsonValue | null }) {
  return Array.isArray(draft.generatedCases)
    ? draft.generatedCases
        .map((testCase) => toJsonRecord(testCase))
        .filter((testCase): testCase is Prisma.JsonObject => Boolean(testCase))
        .map((testCase) => ({ ...(testCase as Record<string, unknown>) }))
    : [];
}

function findDraftCaseById(testCases: Array<Record<string, unknown>>, caseId: string) {
  return testCases.find((testCase) => normalizeWhitespace(String(testCase.caseId ?? '')) === normalizeWhitespace(caseId));
}

const genericScenarioPatterns = [
  /^primary workflow validation$/i,
  /^workflow validation$/i,
  /^workflow test(?:ing)?$/i,
  /^functional(?:ity)? test(?:ing)?$/i,
  /^feature validation$/i,
  /^general validation$/i,
  /^scenario validation$/i,
  /^default scenario$/i,
  /^validation$/i,
  /^verification$/i,
];

const testTypeSortWeight: Record<string, number> = {
  Functional: 1,
  Smoke: 2,
  Integration: 3,
  API: 4,
  E2E: 5,
  'Data Integrity': 6,
  Regression: 7,
  Usability: 8,
  Accessibility: 9,
  Compatibility: 10,
  Responsiveness: 11,
  Performance: 12,
  Security: 13,
  Recovery: 14,
};

const scenarioTypeSortWeight: Record<string, number> = {
  positive: 1,
  edge: 2,
  boundary: 2,
  negative: 3,
  consistency: 4,
  empty_state: 5,
  partial_data: 6,
  malformed_data: 7,
  stale_data: 8,
  loading: 9,
  error: 10,
  accessibility: 11,
  usability: 12,
  performance: 13,
  regression: 14,
  resilience: 15,
  access_control: 16,
};

function humanizeStructuredText(value: string) {
  return normalizeWhitespace(value)
    .replace(/[_/]+/g, ' ')
    .replace(/\s*[-:]\s*/g, ' ')
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIgnoreCase(haystack: string, needle: string) {
  if (!haystack || !needle) {
    return false;
  }

  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function dedupeOrderedClauses(clauses: string[]) {
  const result: string[] = [];

  for (const clause of clauses) {
    const normalized = normalizeWhitespace(clause);
    if (!normalized) {
      continue;
    }

    const isDuplicate = result.some((existing) => {
      const left = existing.toLowerCase();
      const right = normalized.toLowerCase();
      return left === right || left.includes(right) || right.includes(left);
    });

    if (!isDuplicate) {
      result.push(normalized);
    }
  }

  return result;
}

function simplifyGeneratedTitleText(value: string) {
  const normalized = normalizeWhitespace(value)
    .replace(/[·•]+/g, ' - ')
    .replace(/\b(page-area|unit|unit-type|scenario-type|coverage-bucket):[^\s]+/gi, ' ')
    .replace(/\b[a-z]+(?:_[a-z]+)+:[a-z0-9-]+:?/gi, ' ')
    .replace(/\b[a-z]+:[a-z0-9-]{4,}:?/gi, ' ');

  const clauses = dedupeOrderedClauses(
    humanizeStructuredText(normalized)
      .split(/\s+-\s+/)
      .map((entry) => normalizeWhitespace(entry)),
  );

  return clauses.slice(0, 2).join(' - ');
}

function chooseTitleSubject(feature: string, component: string) {
  if (component && component.length > 3 && !containsIgnoreCase(feature, component)) {
    return toTitleCase(component);
  }

  return toTitleCase(feature || component || 'Generated Test Case');
}

function buildDescriptiveVerifyTitle(options: {
  rawTitle: string;
  fallbackTitle: string;
  feature: string;
  scenario: string;
  component?: string;
}) {
  const rawTitle = ensureVerifyTitle(options.rawTitle, options.fallbackTitle);
  const strippedTitle = simplifyGeneratedTitleText(stripLeadingVerify(rawTitle));
  const feature = normalizeWhitespace(options.feature);
  const scenario = normalizeWhitespace(options.scenario);
  const component = normalizeWhitespace(options.component ?? '');
  const titleCore = toTitleCase(humanizeStructuredText(strippedTitle || options.fallbackTitle || 'Generated Test Case'));
  const subject = chooseTitleSubject(feature, component);
  const featureContext = component && component.toLowerCase() !== feature.toLowerCase() ? `${feature} ${component}` : feature;
  const readableScenario = scenario && !isGenericScenarioLabel(scenario) ? toTitleCase(scenario) : '';
  const readableFeature = toTitleCase(featureContext || feature || subject);
  const prefersScenarioClause =
    /(?:page level|unit type|coverage bucket|scenario type)/i.test(titleCore) ||
    /[_:()]/.test(options.rawTitle) ||
    /(?:\.\.\.|…)$/.test(options.rawTitle) ||
    (/^verify\s+/i.test(options.rawTitle) && !/^verify that\s+/i.test(options.rawTitle)) ||
    (Boolean(readableFeature) && Boolean(readableScenario) && containsIgnoreCase(titleCore, readableFeature) && containsIgnoreCase(titleCore, readableScenario));
  const clause = normalizeWhitespace(
    (prefersScenarioClause ? readableScenario || readableFeature || titleCore : titleCore)
      .replace(/^verify that\s+/i, '')
      .replace(/^verify\s+/i, '')
      .replace(/[.\u2026]+/g, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\bpage[_\s-]?level\b/gi, 'page level')
      .replace(/\bunit[_\s-]?type\b/gi, '')
      .replace(/\bcoverage[_\s-]?bucket\b/gi, '')
      .replace(/\bpage[_\s-]?area\b/gi, '')
      .replace(/\bscenario[_\s-]?type\b/gi, '')
      .replace(/\b[a-z]+(?:_[a-z]+)+:[a-z0-9-]+\b/gi, ' ')
      .replace(/\b[a-z]+:[a-z0-9-]{4,}\b/gi, ' '),
  );
  const sentenceTitle = buildSentenceStyleVerifyTitle(clause || readableScenario || readableFeature, readableFeature, readableScenario);
  return sentenceTitle || `Verify that ${lowercaseFirst(titleCore)} works correctly.`;
}

function looksStructuredGeneratedTitle(value: string, feature: string, scenario: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  const readableFeature = toTitleCase(humanizeStructuredText(feature));
  const readableScenario = toTitleCase(humanizeStructuredText(scenario));
  const comparisonValue = humanizeStructuredText(normalized);

  return (
    /(?:\.\.\.|\u2026)$/.test(normalized) ||
    /[_:()]/.test(normalized) ||
    (/^verify\s+/i.test(normalized) && !/^verify that\b/i.test(normalized)) ||
    /\b(page[_\s-]?area|page[_\s-]?level|unit(?:[_\s-]?type)?|coverage[_\s-]?bucket|scenario[_\s-]?type)\b/i.test(
      normalized,
    ) ||
    /\b[a-z]+(?:_[a-z]+)+:[a-z0-9-]+\b/i.test(normalized) ||
    /\b[a-z]+:[a-z0-9-]{4,}\b/i.test(normalized) ||
    (Boolean(readableFeature) &&
      Boolean(readableScenario) &&
      containsIgnoreCase(comparisonValue, readableFeature) &&
      containsIgnoreCase(comparisonValue, readableScenario))
  );
}

function normalizePreservedGeneratedTitle(options: {
  rawTitle: string;
  fallbackTitle: string;
  feature: string;
  scenario: string;
  component?: string;
}) {
  const rawTitle = normalizeWhitespace(options.rawTitle);
  if (!rawTitle) {
    return buildDescriptiveVerifyTitle(options);
  }

  if (!looksStructuredGeneratedTitle(rawTitle, options.feature, options.scenario)) {
    return rawTitle;
  }

  return buildDescriptiveVerifyTitle(options);
}

function lowercaseFirst(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1).toLowerCase();
}

function withLeadingDeterminer(value: string) {
  const normalized = lowercaseFirst(value);
  if (!normalized) {
    return '';
  }

  if (/^(the|a|an|this|that|these|those|selected|current|new)\b/i.test(normalized)) {
    return normalized;
  }

  return `the ${normalized}`;
}

function buildSentenceStyleVerifyTitle(clause: string, feature: string, scenario: string) {
  const cleanedClause = normalizeWhitespace(humanizeStructuredText(clause).replace(/[.]{3,}/g, ' '));
  const cleanedFeature = normalizeWhitespace(humanizeStructuredText(feature));
  const cleanedScenario = normalizeWhitespace(humanizeStructuredText(scenario));
  const subject = cleanedFeature
    ? `the ${lowercaseFirst(cleanedFeature)}`
    : cleanedScenario
      ? `the ${lowercaseFirst(cleanedScenario)}`
      : 'the feature';
  const clauseToUse = cleanedClause || cleanedScenario || cleanedFeature;

  if (!clauseToUse) {
    return '';
  }

  const selectionRefreshMatch = clauseToUse.match(/^(.+?) selection refresh and reconciliation$/i);
  if (selectionRefreshMatch?.[1]) {
    return `Verify that selecting ${withLeadingDeterminer(selectionRefreshMatch[1])} refreshes and reconciles the page correctly.`;
  }

  const refreshAfterMatch = clauseToUse.match(/^widget refresh after (.+)$/i);
  if (refreshAfterMatch?.[1]) {
    return `Verify that widgets refresh correctly after ${lowercaseFirst(refreshAfterMatch[1])}.`;
  }

  const refreshOnMatch = clauseToUse.match(/^widget refresh on (.+)$/i);
  if (refreshOnMatch?.[1]) {
    return `Verify that widgets refresh correctly when ${lowercaseFirst(refreshOnMatch[1])}.`;
  }

  const resilienceMatch = clauseToUse.match(/^(.+?) resilience (?:against|during|under) (.+)$/i);
  if (resilienceMatch?.[2]) {
    return `Verify that ${subject} handles ${lowercaseFirst(resilienceMatch[2])} correctly.`;
  }

  const switchingMatch = clauseToUse.match(/^(.+?) switching$/i);
  if (switchingMatch?.[1]) {
    return `Verify that ${lowercaseFirst(switchingMatch[1])} can be switched correctly.`;
  }

  const persistenceMatch = clauseToUse.match(/^state persistence after (.+)$/i);
  if (persistenceMatch?.[1]) {
    return `Verify that state persists correctly after ${lowercaseFirst(persistenceMatch[1])}.`;
  }

  const keyboardMatch = clauseToUse.match(/^keyboard (.+)$/i);
  if (keyboardMatch?.[1]) {
    return `Verify that ${subject} supports keyboard ${lowercaseFirst(keyboardMatch[1])} correctly.`;
  }

  const layoutMatch = clauseToUse.match(/^(.+?) (?:responsiveness and )?layout stability$/i);
  if (layoutMatch) {
    return `Verify that ${subject} remains responsive and layout stays stable.`;
  }

  if (/^(when|if|while|after|before|once)\b/i.test(clauseToUse)) {
    return `Verify that ${lowercaseFirst(clauseToUse)}.`;
  }

  return `Verify that ${lowercaseFirst(clauseToUse)} works correctly.`;
}

function normalizeFeatureLabel(value: string, fallback: string) {
  const normalized = humanizeStructuredText(value || fallback || 'General Feature');
  return toTitleCase(normalized || 'General Feature');
}

function isGenericScenarioLabel(value: string) {
  const normalized = humanizeStructuredText(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return genericScenarioPatterns.some((pattern) => pattern.test(normalized));
}

function normalizeScenarioLabel(value: string, title: string, feature: string) {
  const normalized = humanizeStructuredText(value);
  if (normalized && !isGenericScenarioLabel(normalized)) {
    return toTitleCase(normalized);
  }

  const strippedTitle = stripLeadingVerify(title);
  const withoutFeature = strippedTitle.replace(
    new RegExp(`^${escapeRegExp(feature)}\\b[:\\-\\s]*`, 'i'),
    '',
  );
  const derived = humanizeStructuredText(withoutFeature) || `${feature} Behavior`;
  return toTitleCase(derived);
}

function normalizeStoredStringList(
  value: unknown,
  formatter: (input: string) => string = (input) => normalizeWhitespace(input),
  maxLength = 300,
) {
  return dedupeStrings(
    Array.isArray(value)
      ? value
          .map((entry) => truncateText(formatter(String(entry ?? '')), maxLength))
          .filter((entry) => Boolean(normalizeWhitespace(entry)))
      : [],
  );
}

function clampShortText(value: string, fallback: string, maxLength = 200) {
  return truncateText(value || fallback, maxLength) || truncateText(fallback, maxLength) || 'Generated Value';
}

function clampMediumText(value: string, fallback: string, maxLength = 8_000) {
  return truncateText(value || fallback, maxLength) || truncateText(fallback, maxLength) || 'Generated text.';
}

function compareEncounterOrder(map: Map<string, number>, left: string, right: string) {
  return (map.get(left) ?? Number.MAX_SAFE_INTEGER) - (map.get(right) ?? Number.MAX_SAFE_INTEGER);
}

function extractStructuredTagValue(tags: string[], prefix: string) {
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? '';
}

function isOverallPageResponsivenessCase(testCase: ReturnType<typeof normalizeGeneratedCase>) {
  return testCase.tags.includes('generated:overall-page-responsiveness');
}

function deriveFeatureClusterKey(testCase: ReturnType<typeof normalizeGeneratedCase>) {
  const pageArea = normalizeWhitespace(extractStructuredTagValue(testCase.tags, 'page-area:'));
  if (pageArea) {
    return pageArea.toLowerCase();
  }

  const component = normalizeWhitespace(testCase.linkedComponents[0] ?? '');
  if (component) {
    return component.toLowerCase();
  }

  return normalizeWhitespace(testCase.feature).toLowerCase();
}

function buildSuiteCasePrefix(title: string) {
  const base = slugify(title)
    .split('-')
    .filter(Boolean)
    .slice(0, 4)
    .join('_')
    .toUpperCase();

  return base || 'GENERATED_SUITE';
}

function shouldRenumberCaseId(value: string) {
  const normalized = normalizeWhitespace(value);
  return !normalized || /^TC[-_ ]?\d+$/i.test(normalized);
}

function sortAndNumberGeneratedCases(
  testCases: Array<ReturnType<typeof normalizeGeneratedCase>>,
  suiteTitle: string,
) {
  const featureOrder = new Map<string, number>();
  const unitOrder = new Map<string, Map<string, number>>();

  for (const testCase of testCases) {
    const featureKey = deriveFeatureClusterKey(testCase);
    if (!featureOrder.has(featureKey)) {
      featureOrder.set(featureKey, featureOrder.size);
    }

    const featureUnits = unitOrder.get(featureKey) ?? new Map<string, number>();
    const unitKey =
      extractStructuredTagValue(testCase.tags, 'unit:') ||
      testCase.linkedComponents[0]?.toLowerCase() ||
      testCase.feature.toLowerCase();
    if (!featureUnits.has(unitKey)) {
      featureUnits.set(unitKey, featureUnits.size);
    }
    unitOrder.set(featureKey, featureUnits);
  }

  const sorted = [...testCases].sort((left, right) => {
    const leftIsOverallResponsiveness = isOverallPageResponsivenessCase(left);
    const rightIsOverallResponsiveness = isOverallPageResponsivenessCase(right);
    if (leftIsOverallResponsiveness !== rightIsOverallResponsiveness) {
      return leftIsOverallResponsiveness ? 1 : -1;
    }

    const leftFeatureKey = deriveFeatureClusterKey(left);
    const rightFeatureKey = deriveFeatureClusterKey(right);
    const featureDiff = compareEncounterOrder(featureOrder, leftFeatureKey, rightFeatureKey);
    if (featureDiff !== 0) {
      return featureDiff;
    }

    const featureUnits = unitOrder.get(leftFeatureKey) ?? new Map<string, number>();
    const leftUnitKey =
      extractStructuredTagValue(left.tags, 'unit:') ||
      left.linkedComponents[0]?.toLowerCase() ||
      left.feature.toLowerCase();
    const rightUnitKey =
      extractStructuredTagValue(right.tags, 'unit:') ||
      right.linkedComponents[0]?.toLowerCase() ||
      right.feature.toLowerCase();
    const unitDiff = compareEncounterOrder(featureUnits, leftUnitKey, rightUnitKey);
    if (unitDiff !== 0) {
      return unitDiff;
    }

    const leftScenarioType = extractStructuredTagValue(left.tags, 'scenario-type:');
    const rightScenarioType = extractStructuredTagValue(right.tags, 'scenario-type:');
    const leftScenarioWeight = scenarioTypeSortWeight[leftScenarioType] ?? 50;
    const rightScenarioWeight = scenarioTypeSortWeight[rightScenarioType] ?? 50;
    if (leftScenarioWeight !== rightScenarioWeight) {
      return leftScenarioWeight - rightScenarioWeight;
    }

    const leftTypeWeight = testTypeSortWeight[left.testType] ?? 50;
    const rightTypeWeight = testTypeSortWeight[right.testType] ?? 50;
    if (leftTypeWeight !== rightTypeWeight) {
      return leftTypeWeight - rightTypeWeight;
    }

    const scenarioDiff = left.scenario.localeCompare(right.scenario);
    if (scenarioDiff !== 0) {
      return scenarioDiff;
    }

    const featureLabelDiff = left.feature.localeCompare(right.feature);
    if (featureLabelDiff !== 0) {
      return featureLabelDiff;
    }

    return left.title.localeCompare(right.title);
  });

  const suitePrefix = buildSuiteCasePrefix(suiteTitle);

  return sorted.map((testCase, index) => ({
    ...testCase,
    caseId: shouldRenumberCaseId(testCase.caseId)
      ? `TC_${suitePrefix}_${String(index + 1).padStart(3, '0')}`
      : testCase.caseId,
    steps: testCase.steps.map((step, stepIndex) => ({
      ...step,
      step: stepIndex + 1,
    })),
  }));
}

function normalizeGeneratedCase(
  testCase: Record<string, unknown>,
  index: number,
  fallbackContext: {
    components: string[];
    featureTypes: string[];
    rulePacks: string[];
    taxonomy: string[];
  },
  options?: {
    preserveInputTitle?: boolean;
    titleMaxLength?: number;
    screenSizeCoverageNote?: string;
  },
) {
  const providedCaseId = typeof testCase.caseId === 'string' ? normalizeWhitespace(testCase.caseId) : '';
  const stepsInput = Array.isArray(testCase.steps) ? testCase.steps : [];
  const inputTags = normalizeStoredStringList(testCase.tags, (value) => normalizeWhitespace(value).toLowerCase());
  const taggedPageArea = extractStructuredTagValue(inputTags, 'page-area:');
  const feature = normalizeFeatureLabel(
    String(testCase.feature ?? taggedPageArea ?? fallbackContext.featureTypes[0] ?? 'General Feature'),
    taggedPageArea || fallbackContext.featureTypes[0] || 'General Feature',
  );
  const linkedComponents = normalizeStoredStringList(
    Array.isArray(testCase.linkedComponents) && testCase.linkedComponents.length > 0
      ? testCase.linkedComponents
      : fallbackContext.components,
    (value) => toTitleCase(value),
  );
  const scenario = normalizeScenarioLabel(String(testCase.scenario ?? ''), String(testCase.title ?? ''), feature);
  const titleMaxLength = options?.titleMaxLength ?? 500;
  const rawTitle = normalizeWhitespace(String(testCase.title ?? ''));
  const titleBuilderInput = {
    rawTitle,
    fallbackTitle: `Generated Test Case ${index + 1}`,
    feature,
    scenario,
    component: linkedComponents[0],
  };
  const title = options?.preserveInputTitle
    ? normalizePreservedGeneratedTitle(titleBuilderInput)
    : buildDescriptiveVerifyTitle(titleBuilderInput);
  const steps = stepsInput
    .map((step, stepIndex) => ({
      step: stepIndex + 1,
      action: clampMediumText(
        normalizeWhitespace(String((step as Record<string, unknown>).action ?? 'Perform the intended action.')),
        'Perform the intended action.',
      ),
      expectedResult: clampMediumText(
        normalizeWhitespace(
        String((step as Record<string, unknown>).expectedResult ?? 'The system responds as expected.'),
      ),
        'The system responds as expected.',
      ),
    }))
    .filter((step) => Boolean(step.action) && Boolean(step.expectedResult));

  return {
    caseId: truncateText(providedCaseId || `TC-${String(index + 1).padStart(3, '0')}`, 100),
    title: clampShortText(title, `Verify Generated Test Case ${index + 1}`, titleMaxLength),
    objective: clampMediumText(
      ensureVerifyObjective(
      String(testCase.objective ?? ''),
      'the expected product behavior is observed.',
    ),
      'Verify that the expected product behavior is observed.',
    ),
    feature: clampShortText(feature, 'General Feature'),
    scenario: clampShortText(scenario, 'General Scenario'),
    testType: clampShortText(
      normalizeTestType(String(testCase.testType ?? fallbackContext.taxonomy[0] ?? 'Functional')),
      'Functional',
    ),
    priority: truncateText(normalizePriority(String(testCase.priority ?? 'P2')), 20),
    severity: truncateText(normalizeSeverity(String(testCase.severity ?? 'Medium')), 50),
    automationCandidate: Boolean(testCase.automationCandidate),
    preconditions: normalizeStoredStringList(testCase.preconditions),
    testData: normalizeStoredStringList(testCase.testData),
    steps:
      steps.length > 0
        ? steps
        : [
            {
              step: 1,
              action: clampMediumText('Perform the intended action.', 'Perform the intended action.'),
              expectedResult: clampMediumText('The system responds as expected.', 'The system responds as expected.'),
            },
          ],
    tags: inputTags,
    linkedComponents,
    linkedFeatureTypes: normalizeStoredStringList(
      Array.isArray(testCase.linkedFeatureTypes) && testCase.linkedFeatureTypes.length > 0
        ? testCase.linkedFeatureTypes
        : fallbackContext.featureTypes,
      (value) => toTitleCase(value),
    ),
    linkedRulePacks: normalizeStoredStringList(
      Array.isArray(testCase.linkedRulePacks) && testCase.linkedRulePacks.length > 0
        ? testCase.linkedRulePacks
        : fallbackContext.rulePacks,
      (value) => toTitleCase(value),
    ),
    linkedTaxonomy: normalizeStoredStringList(
      Array.isArray(testCase.linkedTaxonomy) && testCase.linkedTaxonomy.length > 0
        ? testCase.linkedTaxonomy
        : fallbackContext.taxonomy,
      (value) => toTitleCase(value),
    ),
    sourceReferences: normalizeStoredStringList(testCase.sourceReferences),
    notes: truncateText(
      appendScreenSizeCoverageNote(
        normalizeWhitespace(String(testCase.notes ?? '')),
        options?.screenSizeCoverageNote ?? '',
      ),
      20_000,
    ),
    reviewStatus: normalizeCaseReviewStatus(testCase.reviewStatus),
    entrySource: String(testCase.entrySource ?? '').trim().toLowerCase() === 'manual' ? 'manual' : 'generated',
  };
}

function dedupeGeneratedCases(testCases: Array<ReturnType<typeof normalizeGeneratedCase>>) {
  const seen = new Set<string>();
  const deduped: Array<ReturnType<typeof normalizeGeneratedCase>> = [];

  for (const testCase of testCases) {
    const unitKey =
      extractStructuredTagValue(testCase.tags, 'unit:') ||
      testCase.linkedComponents.join('|').toLowerCase() ||
      testCase.feature.toLowerCase();
    const scenarioType = extractStructuredTagValue(testCase.tags, 'scenario-type:');
    const key = [testCase.title, testCase.feature, testCase.scenario, unitKey, scenarioType]
      .map((value) => value.trim().toLowerCase())
      .join('::');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(testCase);
  }

  return deduped;
}

function ensureOverallPageResponsivenessCases(
  testCases: Array<ReturnType<typeof normalizeGeneratedCase>>,
  fallbackContext: {
    components: string[];
    featureTypes: string[];
    rulePacks: string[];
    taxonomy: string[];
  },
  options?: {
    pageLabel?: string;
    suiteTitle?: string;
    titleMaxLength?: number;
    screenSizes?: unknown;
    disableOverallPageResponsiveness?: boolean;
  },
) {
  if (options?.disableOverallPageResponsiveness) {
    return testCases;
  }

  const screenSizes = resolveScreenSizeEntries(options?.screenSizes);
  if (!screenSizes.length) {
    return testCases;
  }

  const existingScreenSizes = new Set(
    testCases
      .filter((testCase) => isOverallPageResponsivenessCase(testCase))
      .map((testCase) => normalizeWhitespace(extractStructuredTagValue(testCase.tags, 'screen-size:')).toLowerCase())
      .filter(Boolean),
  );

  const pageLabel = normalizeWhitespace(options?.pageLabel || options?.suiteTitle || 'the page');
  const pageReference = pageLabel ? `the ${pageLabel}` : 'the page';

  const appendedCases = screenSizes
    .filter((entry) => !existingScreenSizes.has(entry.label.toLowerCase()))
    .map((entry, index) =>
      normalizeGeneratedCase(
        {
          title: `Verify overall page responsiveness on ${formatResolvedScreenSizeLabel(entry)}`,
          objective: `Validate that ${pageReference} remains fully usable, readable, and aligned on ${formatResolvedScreenSizeLabel(entry)}.`,
          feature: 'Overall Page Responsiveness',
          scenario: `${entry.label} layout stability`,
          testType: 'Responsiveness',
          priority: 'P2',
          severity: 'Medium',
          preconditions: ['Open the target page with stable test data available.'],
          testData: [formatResolvedScreenSizeLabel(entry)],
          steps: [
            {
              action: `Open ${pageReference} and set the viewport to ${formatResolvedScreenSizeLabel(entry)}.`,
              expectedResult: 'The page loads completely with no clipped containers, overlays, or broken alignment.',
            },
            {
              action: 'Review the full page layout, including headers, filters, widgets, tables, charts, drawers, and action controls.',
              expectedResult:
                'All page sections remain visible, readable, and consistently aligned without overlaps, overflow, or collapsed content.',
            },
            {
              action: 'Interact with the primary controls and scroll through the page from top to bottom.',
              expectedResult:
                'Interactive elements remain usable, focusable, and stable during scrolling and interaction at the selected viewport.',
            },
          ],
          tags: [
            'page-area:overall-page-responsiveness',
            `unit:overall-page-responsiveness-${entry.slug}`,
            'unit-type:page',
            'scenario-type:responsiveness',
            'coverage-bucket:responsiveness',
            `screen-size:${entry.label.toLowerCase()}`,
            'generated:overall-page-responsiveness',
          ],
          linkedComponents: ['Page Layout'],
          linkedFeatureTypes: ['Responsiveness'],
          linkedRulePacks: [],
          linkedTaxonomy: ['Responsiveness'],
          notes: `Execute this page-level responsiveness check on ${formatResolvedScreenSizeLabel(entry)} after validating the primary feature-level coverage.`,
        },
        testCases.length + index,
        fallbackContext,
        {
          preserveInputTitle: true,
          titleMaxLength: options?.titleMaxLength,
          screenSizeCoverageNote: '',
        },
      ),
    );

  return [...testCases, ...appendedCases];
}

function normalizeGeneratedDraft(
  parsedResponse: Record<string, unknown>,
  options?: {
    preserveInputTitles?: boolean;
    titleMaxLength?: number;
    preserveInputOrder?: boolean;
    screenSizes?: unknown;
    pageLabel?: string;
    disableOverallPageResponsiveness?: boolean;
  },
) {
  const inferredContext = {
    components: dedupeStrings(
      Array.isArray(parsedResponse.inferredComponents)
        ? parsedResponse.inferredComponents.map((value) => toTitleCase(String(value)))
        : [],
    ),
    featureTypes: dedupeStrings(
      Array.isArray(parsedResponse.inferredFeatureTypes)
        ? parsedResponse.inferredFeatureTypes.map((value) => toTitleCase(String(value)))
        : [],
    ),
    rulePacks: dedupeStrings(
      Array.isArray(parsedResponse.inferredRulePacks)
        ? parsedResponse.inferredRulePacks.map((value) => toTitleCase(String(value)))
        : [],
    ),
    taxonomy: dedupeStrings(
      Array.isArray(parsedResponse.inferredTaxonomy)
        ? parsedResponse.inferredTaxonomy.map((value) => toTitleCase(String(value)))
        : [],
    ),
    scenarios: dedupeStrings(
      Array.isArray(parsedResponse.inferredScenarios)
        ? parsedResponse.inferredScenarios.map((value) => normalizeWhitespace(String(value)))
        : [],
    ),
    integrations: dedupeStrings(
      Array.isArray(parsedResponse.inferredIntegrations)
        ? parsedResponse.inferredIntegrations.map((value) => normalizeWhitespace(String(value)))
        : [],
    ),
    assumptions: dedupeStrings(
      Array.isArray(parsedResponse.assumptions)
        ? parsedResponse.assumptions.map((value) => normalizeWhitespace(String(value)))
        : [],
    ),
    gaps: dedupeStrings(
      Array.isArray(parsedResponse.gaps) ? parsedResponse.gaps.map((value) => normalizeWhitespace(String(value))) : [],
    ),
  };

  const testCasesInput = Array.isArray(parsedResponse.testCases)
    ? parsedResponse.testCases.map((value) => value as Record<string, unknown>)
    : [];
  const screenSizeCoverageNote = buildScreenSizeCoverageNote(options?.screenSizes);

  const normalizedCases = testCasesInput.map((testCase, index) =>
    normalizeGeneratedCase(
      testCase,
      index,
      {
        components: inferredContext.components,
        featureTypes: inferredContext.featureTypes,
        rulePacks: inferredContext.rulePacks,
        taxonomy: inferredContext.taxonomy,
      },
      {
        preserveInputTitle: options?.preserveInputTitles,
        titleMaxLength: options?.titleMaxLength,
        screenSizeCoverageNote,
      },
    ),
  );
  const normalizedCasesWithResponsiveness = ensureOverallPageResponsivenessCases(normalizedCases, {
    components: inferredContext.components,
    featureTypes: inferredContext.featureTypes,
    rulePacks: inferredContext.rulePacks,
    taxonomy: inferredContext.taxonomy,
  }, {
    pageLabel: options?.pageLabel,
    suiteTitle: String(parsedResponse.suiteTitle ?? 'Generated Test Suite'),
    titleMaxLength: options?.titleMaxLength,
    screenSizes: options?.screenSizes,
    disableOverallPageResponsiveness: options?.disableOverallPageResponsiveness,
  });

  return {
    title: toTitleCase(String(parsedResponse.suiteTitle ?? 'Generated Test Suite')),
    summary: normalizeWhitespace(String(parsedResponse.suiteSummary ?? '')),
    confidence: typeof parsedResponse.confidence === 'number' ? parsedResponse.confidence : 0.72,
    inferredContext,
    coverageSummary: dedupeStrings(
      Array.isArray(parsedResponse.coverageSummary)
        ? parsedResponse.coverageSummary.map((value) => normalizeWhitespace(String(value)))
        : [],
    ),
    testCases: options?.preserveInputOrder
      ? normalizedCasesWithResponsiveness
      : sortAndNumberGeneratedCases(
          dedupeGeneratedCases(normalizedCasesWithResponsiveness),
          toTitleCase(String(parsedResponse.suiteTitle ?? 'Generated Test Suite')),
        ),
  };
}

function toRunSummary(run: RunWithContext) {
  const progress = extractRunProgress(run);

  return {
    id: run.id,
    title: run.title,
    mode: dbToApiModeMap[run.mode],
    model: run.model,
    status: dbToApiStatusMap[run.status],
    errorMessage: run.errorMessage ?? null,
    correlationId: run.correlationId,
    createdBy: resolveRunActor(run),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    draftId: run.draft?.id ?? null,
    suiteContext: toSuiteContextResponse({
      contributor: run.contributor,
      page: run.page,
      feature: run.feature,
    }),
    progress,
  };
}

function toRunDetail(run: RunWithContext) {
  return {
    ...toRunSummary(run),
    requestPayload: (run.requestPayload ?? {}) as Record<string, unknown>,
    sourceSummary: (run.sourceSummary ?? {}) as Record<string, unknown>,
    rawResponse: run.rawResponse ?? null,
    parsedResponse: run.parsedResponse ?? null,
  };
}

function resolveRunActor(run: RunWithContext) {
  const payload = toJsonRecord(run.requestPayload);
  const requestedBy = typeof payload?.requestedBy === 'string' ? payload.requestedBy.trim() : '';
  const suiteContextValue = payload?.suiteContext;
  const suiteContext = suiteContextValue ? toJsonRecord(suiteContextValue) : null;
  const contributorName =
    typeof suiteContext?.contributorName === 'string' ? suiteContext.contributorName.trim() : '';

  return run.contributor?.name?.trim() || requestedBy || contributorName || 'Signed-in user';
}

function isGenerationAbortError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return error.name === 'AbortError' || message.includes('stopped by user') || message.includes('aborted');
  }

  return false;
}

function buildStoppedRunRawResponse(run: RunWithContext) {
  const existingRaw = toJsonRecord(run.rawResponse) ?? {};
  const progress = extractRunProgress(run);

  return {
    ...existingRaw,
    stopReason: 'user_requested',
    progress: {
      phase: 'failed',
      completedBatches: progress?.completedBatches ?? 0,
      totalBatches: progress?.totalBatches ?? 0,
      generatedCaseCount: progress?.generatedCaseCount ?? 0,
      retryTriggered: progress?.retryTriggered ?? false,
      previewTitles: progress?.previewTitles ?? [],
      stoppedByUser: true,
    },
  } as Record<string, unknown>;
}

function getFailureRawResponse(error: unknown) {
  if (typeof error !== 'object' || !error) {
    return null;
  }

  if ('rawResponse' in error) {
    const rawResponse = (error as { rawResponse?: unknown }).rawResponse;
    if (rawResponse && typeof rawResponse === 'object') {
      return rawResponse as Record<string, unknown>;
    }
  }

  if (!('details' in error)) {
    return null;
  }

  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object') {
    return null;
  }

  return details as Record<string, unknown>;
}

function extractRunProgress(run: Pick<RunWithContext, 'status' | 'rawResponse' | 'parsedResponse'>) {
  const rawResponse =
    run.rawResponse && typeof run.rawResponse === 'object' && !Array.isArray(run.rawResponse)
      ? (run.rawResponse as Record<string, unknown>)
      : null;
  const parsedResponse =
    run.parsedResponse && typeof run.parsedResponse === 'object' && !Array.isArray(run.parsedResponse)
      ? (run.parsedResponse as Record<string, unknown>)
      : null;
  const progressCandidate =
    rawResponse && rawResponse.progress && typeof rawResponse.progress === 'object' && !Array.isArray(rawResponse.progress)
      ? (rawResponse.progress as Record<string, unknown>)
      : null;
  const previewTitles =
    progressCandidate && Array.isArray(progressCandidate.previewTitles)
      ? progressCandidate.previewTitles.map((value) => normalizeWhitespace(String(value))).filter(Boolean).slice(0, 12)
      : parsedResponse && Array.isArray(parsedResponse.testCases)
        ? parsedResponse.testCases
            .map((entry) =>
              entry && typeof entry === 'object' && 'title' in entry
                ? normalizeWhitespace(String((entry as Record<string, unknown>).title ?? ''))
                : '',
            )
            .filter(Boolean)
            .slice(0, 12)
        : [];

  if (!progressCandidate && run.status === TestGenerationRunStatus.PENDING && !previewTitles.length) {
    return {
      phase: 'queued',
      completedBatches: 0,
      totalBatches: 0,
      generatedCaseCount: 0,
      retryTriggered: false,
      previewTitles: [] as string[],
    };
  }

  if (!progressCandidate) {
    return null;
  }

  const phase =
    typeof progressCandidate.phase === 'string'
      ? progressCandidate.phase
      : run.status === TestGenerationRunStatus.COMPLETED
        ? 'completed'
        : run.status === TestGenerationRunStatus.FAILED
          ? 'failed'
          : 'queued';
  const generatedCaseCount =
    typeof progressCandidate.generatedCaseCount === 'number'
      ? progressCandidate.generatedCaseCount
      : parsedResponse && Array.isArray(parsedResponse.testCases)
        ? parsedResponse.testCases.length
        : 0;

  return {
    phase,
    completedBatches:
      typeof progressCandidate.completedBatches === 'number' ? progressCandidate.completedBatches : 0,
    totalBatches: typeof progressCandidate.totalBatches === 'number' ? progressCandidate.totalBatches : 0,
    generatedCaseCount,
    retryTriggered: Boolean(progressCandidate.retryTriggered),
    previewTitles,
  };
}

function toDraftResponse(draft: DraftWithContext) {
  const inferredContext = (draft.inferredContext ?? {}) as Record<string, unknown>;
  const parsedCoverageAnalysis =
    draft.coverageAnalysis && typeof draft.coverageAnalysis === 'object'
      ? coverageAnalysisSchema.safeParse(draft.coverageAnalysis)
      : null;
  const coverageAnalysis = parsedCoverageAnalysis?.success ? parsedCoverageAnalysis.data : null;
  const normalizedCases = Array.isArray(draft.generatedCases)
    ? draft.generatedCases
        .map((testCase) => toJsonRecord(testCase))
        .filter((testCase): testCase is Prisma.JsonObject => Boolean(testCase))
        .map((testCase, index) =>
          normalizeGeneratedCase(testCase as Record<string, unknown>, index, {
            components: Array.isArray(inferredContext.components) ? inferredContext.components : [],
            featureTypes: Array.isArray(inferredContext.featureTypes) ? inferredContext.featureTypes : [],
            rulePacks: Array.isArray(inferredContext.rulePacks) ? inferredContext.rulePacks : [],
            taxonomy: Array.isArray(inferredContext.taxonomy) ? inferredContext.taxonomy : [],
          }, {
            preserveInputTitle: true,
            titleMaxLength: 500,
          }),
        )
    : [];

  return {
    id: draft.id,
    runId: draft.runId,
    title: draft.title,
    summary: draft.summary ?? null,
    version: draft.version,
    mode: dbToApiModeMap[draft.run.mode],
    model: draft.run.model,
    reviewStatus: dbToApiDraftStatusMap[draft.reviewStatus],
    confidence: draft.confidence,
    reviewerNotes: draft.reviewerNotes ?? null,
    suiteContext: toSuiteContextResponse({
      contributor: draft.run.contributor,
      page: draft.run.page,
      feature: draft.run.feature,
    }),
    inferredContext: {
      components: normalizeStoredStringList(inferredContext.components, (value) => toTitleCase(value)),
      featureTypes: normalizeStoredStringList(inferredContext.featureTypes, (value) => toTitleCase(value)),
      rulePacks: normalizeStoredStringList(inferredContext.rulePacks, (value) => toTitleCase(value)),
      taxonomy: normalizeStoredStringList(inferredContext.taxonomy, (value) => toTitleCase(value)),
      scenarios: normalizeStoredStringList(inferredContext.scenarios),
      integrations: normalizeStoredStringList(inferredContext.integrations),
      assumptions: normalizeStoredStringList(inferredContext.assumptions),
      gaps: normalizeStoredStringList(inferredContext.gaps),
    },
    coverageSummary: normalizeStoredStringList(draft.coverageSummary),
    coverageAnalysis,
    testCases: normalizedCases,
    testCaseFeedback: draft.testCaseFeedback.map((feedback) => ({
      id: feedback.id,
      draftId: feedback.draftId,
      runId: feedback.runId,
      caseId: feedback.caseId,
      draftVersion: feedback.draftVersion,
      action: feedback.action === 'APPROVED' ? 'approved' : 'rejected',
      reasonCode: feedback.reasonCode ? String(feedback.reasonCode).toLowerCase() : null,
      reasonDetails: feedback.reasonDetails ?? null,
      replacementSummary: feedback.replacementSummary ?? null,
      caseTitle: feedback.caseTitle,
      caseSnapshot:
        feedback.caseSnapshot && typeof feedback.caseSnapshot === 'object'
          ? (feedback.caseSnapshot as Record<string, unknown>)
          : {},
      reviewerNotes: feedback.reviewerNotes ?? null,
      usedForLearning: feedback.usedForLearning,
      createdBy: feedback.createdBy,
      createdAt: feedback.createdAt.toISOString(),
    })),
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    approvedBy: draft.approvedBy ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function toApprovedDraftExportPayload(draft: DraftWithContext) {
  const response = toDraftResponse(draft);
  return {
    ...response,
    testCases: response.testCases.filter((testCase) => testCase.reviewStatus === 'approved'),
  };
}

function createInternalTestcaseLibraryNode(input: {
  id: string;
  name: string;
  kind: 'client' | 'module' | 'page' | 'feature';
  path: string;
  projectId?: string | null;
  moduleId?: string | null;
  pageId?: string | null;
  featureId?: string | null;
}) {
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    path: input.path,
    qaOwnerSet: new Set<string>(),
    approvedSuiteCount: 0,
    approvedCaseCount: 0,
    scope: {
      projectId: input.projectId ?? null,
      moduleId: input.moduleId ?? null,
      pageId: input.pageId ?? null,
      featureId: input.featureId ?? null,
    },
    children: [],
  } satisfies InternalTestcaseLibraryNode;
}

function applyTestcaseLibraryMetrics(
  node: InternalTestcaseLibraryNode,
  approvedCaseCount: number,
  approvedBy: string | null,
) {
  node.approvedSuiteCount += 1;
  node.approvedCaseCount += approvedCaseCount;
  if (approvedBy?.trim()) {
    node.qaOwnerSet.add(approvedBy.trim());
  }
}

function sortTestcaseLibraryNodes(nodes: TestcaseLibraryNode[]): TestcaseLibraryNode[] {
  return [...nodes]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((node) => ({
      ...node,
      children: sortTestcaseLibraryNodes(node.children),
    }));
}

function finalizeTestcaseLibraryNode(node: InternalTestcaseLibraryNode): TestcaseLibraryNode {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    path: node.path,
    qaOwners: [...node.qaOwnerSet].sort((left, right) => left.localeCompare(right)),
    approvedSuiteCount: node.approvedSuiteCount,
    approvedCaseCount: node.approvedCaseCount,
    scope: node.scope,
    children: sortTestcaseLibraryNodes(node.children.map((child) => finalizeTestcaseLibraryNode(child))),
  };
}

function buildApprovedGenerationDraftWhere(scope: {
  projectId?: string;
  moduleId?: string;
  pageId?: string;
  featureId?: string;
} = {}) {
  const runWhere: Prisma.TestGenerationRunWhereInput = {};

  if (scope.featureId) {
    runWhere.featureId = scope.featureId;
  }

  if (scope.projectId || scope.moduleId || scope.pageId) {
    runWhere.page = {
      ...(scope.pageId ? { id: scope.pageId } : {}),
      ...(scope.projectId || scope.moduleId
        ? {
            module: {
              ...(scope.moduleId ? { id: scope.moduleId } : {}),
              ...(scope.projectId ? { projectId: scope.projectId } : {}),
            },
          }
        : {}),
    };
  }

  return {
    reviewStatus: DraftReviewStatus.APPROVED,
    ...(Object.keys(runWhere).length ? { run: runWhere } : {}),
  } satisfies Prisma.TestCaseDraftWhereInput;
}

function buildTestcaseLibraryTree(drafts: DraftWithContext[]) {
  const projectMap = new Map<string, InternalTestcaseLibraryNode>();
  const moduleMap = new Map<string, InternalTestcaseLibraryNode>();
  const pageMap = new Map<string, InternalTestcaseLibraryNode>();
  const featureMap = new Map<string, InternalTestcaseLibraryNode>();
  let approvedSuiteCount = 0;
  let approvedCaseCount = 0;

  for (const draft of drafts) {
    const approvedDraft = toApprovedDraftExportPayload(draft);
    const project = approvedDraft.suiteContext.project;
    const moduleItem = approvedDraft.suiteContext.module;
    const page = approvedDraft.suiteContext.page;
    const feature = approvedDraft.suiteContext.feature;

    if (!project || !moduleItem || !page || !approvedDraft.testCases.length) {
      continue;
    }

    const suiteCaseCount = approvedDraft.testCases.length;
    approvedSuiteCount += 1;
    approvedCaseCount += suiteCaseCount;

    let projectNode = projectMap.get(project.id);
    if (!projectNode) {
      projectNode = createInternalTestcaseLibraryNode({
        id: project.id,
        name: project.name,
        kind: 'client',
        path: project.name,
        projectId: project.id,
      });
      projectMap.set(project.id, projectNode);
    }
    applyTestcaseLibraryMetrics(projectNode, suiteCaseCount, approvedDraft.approvedBy);

    const moduleKey = `${project.id}:${moduleItem.id}`;
    let moduleNode = moduleMap.get(moduleKey);
    if (!moduleNode) {
      moduleNode = createInternalTestcaseLibraryNode({
        id: moduleItem.id,
        name: moduleItem.name,
        kind: 'module',
        path: `${project.name} / ${moduleItem.name}`,
        projectId: project.id,
        moduleId: moduleItem.id,
      });
      moduleMap.set(moduleKey, moduleNode);
      projectNode.children.push(moduleNode);
    }
    applyTestcaseLibraryMetrics(moduleNode, suiteCaseCount, approvedDraft.approvedBy);

    const pageKey = `${moduleItem.id}:${page.id}`;
    let pageNode = pageMap.get(pageKey);
    if (!pageNode) {
      pageNode = createInternalTestcaseLibraryNode({
        id: page.id,
        name: page.name,
        kind: 'page',
        path: `${project.name} / ${moduleItem.name} / ${page.name}`,
        projectId: project.id,
        moduleId: moduleItem.id,
        pageId: page.id,
      });
      pageMap.set(pageKey, pageNode);
      moduleNode.children.push(pageNode);
    }
    applyTestcaseLibraryMetrics(pageNode, suiteCaseCount, approvedDraft.approvedBy);

    if (feature) {
      const featureKey = `${page.id}:${feature.id}`;
      let featureNode = featureMap.get(featureKey);
      if (!featureNode) {
        featureNode = createInternalTestcaseLibraryNode({
          id: feature.id,
          name: feature.name,
          kind: 'feature',
          path: `${project.name} / ${moduleItem.name} / ${page.name} / ${feature.name}`,
          projectId: project.id,
          moduleId: moduleItem.id,
          pageId: page.id,
          featureId: feature.id,
        });
        featureMap.set(featureKey, featureNode);
        pageNode.children.push(featureNode);
      }
      applyTestcaseLibraryMetrics(featureNode, suiteCaseCount, approvedDraft.approvedBy);
    }
  }

  const items = sortTestcaseLibraryNodes(
    [...projectMap.values()].map((projectNode) => finalizeTestcaseLibraryNode(projectNode)),
  );

  return {
    summary: {
      clientCount: projectMap.size,
      moduleCount: moduleMap.size,
      pageCount: pageMap.size,
      featureCount: featureMap.size,
      approvedSuiteCount,
      approvedCaseCount,
    },
    items,
  };
}

function compactPayload(itemType: ApiDatasetItemType, payload: Record<string, unknown>) {
  switch (itemType) {
    case 'componentCatalogue':
      return {
        name: payload.name,
        aliases: compactStringList(payload.aliases, 6, 80),
        category: payload.category,
        description: truncateText(String(payload.description ?? ''), 220),
        states: compactStringList(payload.states, 6, 80),
        commonRisks: compactStringList(payload.commonRisks, 5, 120),
        applicableTestTypes: compactStringList(payload.applicableTestTypes, 6, 60),
        smokeScenarios: compactStringList(payload.smokeScenarios, 4, 120),
        standardTestCases: compactStringList(
          Array.isArray(payload.standardTestCases) && payload.standardTestCases.length > 0
            ? payload.standardTestCases
            : getDefaultComponentStandardTestCases(payload.name, payload.aliases),
          40,
          260,
        ),
      };
    case 'featureType':
      return {
        name: payload.name,
        description: truncateText(String(payload.description ?? ''), 220),
        applicableComponents: compactStringList(payload.applicableComponents, 6, 80),
        applicableRulePacks: compactStringList(payload.applicableRulePacks, 6, 80),
        applicableTestTypes: compactStringList(payload.applicableTestTypes, 6, 60),
        defaultScenarioBuckets: compactStringList(payload.defaultScenarioBuckets, 6, 80),
      };
    case 'rulePack':
      return {
        name: payload.name,
        description: truncateText(String(payload.description ?? ''), 220),
        appliesToFeatureTypes: compactStringList(payload.appliesToFeatureTypes, 6, 80),
        appliesToComponents: compactStringList(payload.appliesToComponents, 6, 80),
        mandatoryScenarios: compactStringList(payload.mandatoryScenarios, 5, 120),
        negativeHeuristics: compactStringList(payload.negativeHeuristics, 4, 120),
        edgeHeuristics: compactStringList(payload.edgeHeuristics, 4, 120),
        securityHeuristics: compactStringList(payload.securityHeuristics, 3, 120),
        performanceHeuristics: compactStringList(payload.performanceHeuristics, 3, 120),
        accessibilityHeuristics: compactStringList(payload.accessibilityHeuristics, 3, 120),
        defaultPriority: payload.defaultPriority,
      };
    case 'testTaxonomy':
      return {
        name: payload.name,
        description: truncateText(String(payload.description ?? ''), 220),
        whenApplicable: compactStringList(payload.whenApplicable, 4, 120),
        whenNotApplicable: compactStringList(payload.whenNotApplicable, 4, 120),
        defaultPriority: payload.defaultPriority,
      };
    case 'scenarioTemplate':
      return {
        name: payload.name,
        scenarioType: payload.scenarioType,
        description: truncateText(String(payload.description ?? ''), 220),
        preconditionPattern: truncateText(String(payload.preconditionPattern ?? ''), 180),
        stepPattern: truncateText(String(payload.stepPattern ?? ''), 180),
        expectedResultPattern: truncateText(String(payload.expectedResultPattern ?? ''), 180),
        examples: compactUnknownList(payload.examples, 3),
      };
    case 'projectMemory':
      return {
        name: payload.name,
        overview: truncateText(String(payload.overview ?? ''), 260),
        businessTerminology: compactStringList(payload.businessTerminology, 8, 100),
        workflows: compactStringList(payload.workflows, 6, 120),
        widgetRelationships: compactStringList(payload.widgetRelationships, 6, 120),
        knownRules: compactStringList(payload.knownRules, 6, 140),
        knownRisks: compactStringList(payload.knownRisks, 6, 140),
        goldenScenarios: compactStringList(payload.goldenScenarios, 8, 160),
        exclusions: compactStringList(payload.exclusions, 5, 140),
        linkedReusableComponents: compactStringList(payload.linkedReusableComponents, 8, 100),
      };
    case 'priorityMapping':
    case 'severityMapping':
      return {
        name: payload.name,
        description: truncateText(String(payload.description ?? ''), 220),
        rules: compactUnknownList(payload.rules, 4),
      };
    case 'synonymAlias':
      return {
        sourceType: payload.sourceType,
        canonicalName: payload.canonicalName,
        aliases: compactStringList(payload.aliases, 8, 80),
      };
  }
}

function toCompactKnowledgeBaseItem(
  record: DatasetItem & {
    project?: { id: string; name: string } | null;
    module?: { id: string; name: string } | null;
    page?: { id: string; name: string } | null;
    scopeLevel?: KnowledgeScopeLevel | null;
  },
): CompactKnowledgeBaseItem {
  const itemType = toApiDatasetItemType(record.itemType) as ApiDatasetItemType;
  const payload = parsePayloadForItemType<Record<string, unknown>>(itemType, record.data);

  return {
    id: record.id,
    title: record.title,
    summary: record.summary ?? null,
    payload: compactPayload(itemType, payload),
    project: record.project ? { id: record.project.id, name: record.project.name } : null,
    module: record.module ? { id: record.module.id, name: record.module.name } : null,
    page: record.page ? { id: record.page.id, name: record.page.name } : null,
    scopeLevel: record.scopeLevel ? (record.scopeLevel.toLowerCase() as 'project' | 'module' | 'page') : null,
  };
}

async function loadApprovedKnowledgeBase() {
  const items = await prisma.datasetItem.findMany({
    where: {
      status: DatasetStatus.APPROVED,
    },
    include: {
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
    orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
  });

  const grouped: GroupedKnowledgeBase = {
    componentCatalogue: [],
    featureType: [],
    rulePack: [],
    testTaxonomy: [],
    scenarioTemplate: [],
    projectMemory: [],
    priorityMapping: [],
    severityMapping: [],
    synonymAlias: [],
  };

  for (const item of items) {
    const itemType = toApiDatasetItemType(item.itemType) as ApiDatasetItemType;
    grouped[itemType].push(toCompactKnowledgeBaseItem(item));
  }

  return grouped;
}

function pickSelectedItems(
  grouped: GroupedKnowledgeBase,
  selectedIds: GenerationCreateBody['selectedDatasetIds'],
) {
  return {
    componentCatalogue: grouped.componentCatalogue.filter((item) => selectedIds.componentCatalogue.includes(item.id)),
    featureType: grouped.featureType.filter((item) => selectedIds.featureType.includes(item.id)),
    rulePack: grouped.rulePack.filter((item) => selectedIds.rulePack.includes(item.id)),
    testTaxonomy: grouped.testTaxonomy.filter((item) => selectedIds.testTaxonomy.includes(item.id)),
    scenarioTemplate: grouped.scenarioTemplate.filter((item) => selectedIds.scenarioTemplate.includes(item.id)),
    projectMemory: grouped.projectMemory.filter((item) => selectedIds.projectMemory.includes(item.id)),
    priorityMapping: grouped.priorityMapping.filter((item) => selectedIds.priorityMapping.includes(item.id)),
    severityMapping: grouped.severityMapping.filter((item) => selectedIds.severityMapping.includes(item.id)),
    synonymAlias: grouped.synonymAlias.filter((item) => selectedIds.synonymAlias.includes(item.id)),
  };
}

async function buildKnowledgeBaseContext(
  selectedIds: GenerationCreateBody['selectedDatasetIds'],
  promptInput: {
    title: string;
    description: string;
    suiteContext: GenerationCreateBody['suiteContext'];
    userFeatures: string[];
    preparedSources: PreparedSourceInput[];
  },
) {
  const grouped = await loadApprovedKnowledgeBase();
  const selected = pickSelectedItems(grouped, selectedIds);
  const searchTerms = collectSearchTerms(promptInput);
  const relevant = pickRelevantItems(grouped, selected, searchTerms, promptInput.suiteContext);
  const autoLoadedProjectMemory = relevant.projectMemory;

  return {
    selected,
    relevant,
    autoLoadedProjectMemory,
    coverage: {
      availableCounts: countGroupedItems(grouped),
      selectedCounts: countGroupedItems(selected),
      relevantCounts: countGroupedItems(relevant),
      searchTerms,
    },
  };
}

function buildSourceSummary(
  input: Pick<GenerationCreateBody, 'title' | 'description' | 'mode' | 'selectedDatasetIds' | 'suiteContext' | 'userFeatures'>,
  preparedSources: PreparedSourceInput[],
  resolvedContext: {
    contributor: RunWithContext['contributor'] | null;
    page: SuiteHierarchyPage | null;
    feature: RunWithContext['feature'] | null;
  },
) {
  const suiteContext = toSuiteContextResponse(resolvedContext);

  return {
    title: input.title,
    description: input.description,
    mode: input.mode,
    userFeatures: input.userFeatures,
    userFeatureCount: input.userFeatures.length,
    suiteContext,
    sourceCount: preparedSources.length,
    sources: preparedSources.map((source) => ({
      kind: source.kind,
      label: source.label,
      filename: source.filename ?? null,
      mimeType: source.mimeType ?? null,
      url: source.url ?? null,
      parseStatus: source.parseStatus,
      hasImage: Boolean(source.imageDataUrl),
      hasText: Boolean(source.contentText),
    })),
    selectedDatasetCounts: Object.fromEntries(
      Object.entries(input.selectedDatasetIds).map(([key, ids]) => [key, Array.isArray(ids) ? ids.length : 0]),
    ),
  };
}

async function createDraftVersion(
  transaction: Prisma.TransactionClient,
  draftId: string,
  version: number,
  snapshot: Record<string, unknown>,
  actor: string,
) {
  await transaction.testCaseDraftVersion.create({
    data: {
      draftId,
      version,
      snapshot: toPrismaJson(snapshot),
      createdBy: actor,
    },
  });
}

function buildDraftSnapshot(input: {
  title: string;
  summary: string | null;
  version: number;
  inferredContext: Record<string, unknown>;
  coverageSummary: string[];
  coverageAnalysis?: CoverageAnalysis | null;
  confidence: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewerNotes: string | null;
  testCases: Array<Record<string, unknown>>;
}) {
  return {
    title: input.title,
    summary: input.summary,
    version: input.version,
    inferredContext: input.inferredContext,
    coverageSummary: input.coverageSummary,
    coverageAnalysis: input.coverageAnalysis ?? null,
    confidence: input.confidence,
    reviewStatus: input.reviewStatus,
    reviewerNotes: input.reviewerNotes,
    testCases: input.testCases,
  };
}

function toCoverageGapEntries(
  entries: Array<
    | { bucket: string; expected: number; actual: number }
    | { unitId: string; unitName: string; expected: number; actual: number }
    | { unitId: string; unitName: string; missingScenarioTypes: string[] }
  >,
) {
  return entries.map((entry) => ({
    key: 'bucket' in entry ? entry.bucket : entry.unitId,
    label: 'bucket' in entry ? entry.bucket : entry.unitName,
    expected: 'expected' in entry ? entry.expected : undefined,
    actual: 'actual' in entry ? entry.actual : undefined,
    missingScenarioTypes: 'missingScenarioTypes' in entry ? entry.missingScenarioTypes : [],
  }));
}

function buildCoverageAnalysis(summary: CoverageValidationSummary, options?: { unknownAreas?: string[] }): CoverageAnalysis {
  const bucketEntries = summary.missingBuckets.map((entry) => ({
    bucket: entry.bucket,
    expected: entry.expected,
    actual: entry.actual,
  }));
  const underCoveredUnits = summary.underCoveredUnits.map((entry) => ({
    unitId: entry.unitId,
    unitName: entry.unitName,
    expected: entry.expected,
    actual: entry.actual,
  }));
  const missingScenarioTypesByUnit = summary.missingScenarioTypesByUnit.map((entry) => ({
    unitId: entry.unitId,
    unitName: entry.unitName,
    missingScenarioTypes: entry.missingScenarioTypes,
  }));

  const bucketScoreEntries = Object.entries(summary.coverageByBucket).map(([bucket, actual]) => {
    const expected = bucketEntries.find((entry) => entry.bucket === bucket)?.expected ?? actual;
    const denominator = Math.max(1, expected);
    return [bucket, Math.max(0, Math.min(1, actual / denominator))] as const;
  });
  const scoreByBucket = Object.fromEntries(bucketScoreEntries) as Record<string, number>;
  const scoreByUnit = Object.fromEntries(
    underCoveredUnits.map((entry) => [entry.unitId, Math.max(0, Math.min(1, entry.actual / Math.max(1, entry.expected)))]),
  );
  const coveredFeatures = new Set(summary.coveredFeatures.map((value) => value.toLowerCase()));
  const scoreByFeature = Object.fromEntries(
    summary.mergedFeatureSet.map((feature) => [feature, coveredFeatures.has(feature.toLowerCase()) ? 1 : 0]),
  );
  const unitScore =
    summary.unitsIdentified > 0 ? summary.unitsCovered / Math.max(1, summary.unitsIdentified) : 1;
  const featureScore =
    summary.requestedUserFeatures.length > 0
      ? 1 - summary.missingRequestedFeatures.length / Math.max(1, summary.requestedUserFeatures.length)
      : 1;
  const bucketScore =
    bucketScoreEntries.length > 0
      ? bucketScoreEntries.reduce((total, [, value]) => total + value, 0) / bucketScoreEntries.length
      : 1;
  const overallScore = Math.max(0, Math.min(1, unitScore * 0.4 + featureScore * 0.3 + bucketScore * 0.3));

  return coverageAnalysisSchema.parse({
    overallScore,
    quotaStatus: summary.quotaStatus,
    unitsIdentified: summary.unitsIdentified,
    unitsCovered: summary.unitsCovered,
    missingRequestedFeatures: summary.missingRequestedFeatures,
    missingBuckets: toCoverageGapEntries(bucketEntries),
    underCoveredUnits: toCoverageGapEntries(underCoveredUnits),
    missingScenarioTypesByUnit: toCoverageGapEntries(missingScenarioTypesByUnit),
    scoreByBucket,
    scoreByFeature,
    scoreByUnit,
    unknownAreas: dedupeStrings(options?.unknownAreas ?? []),
    retryTriggered: summary.retryTriggered,
    retryTriggeredForMissingFeatures: summary.retryTriggeredForMissingFeatures,
  });
}

function inferUnknownCoverageAreas(input: {
  storedRequest: StoredGenerationRequest;
  selectedDatasetIds: GenerationCreateBody['selectedDatasetIds'];
}) {
  const unknownAreas: string[] = [];
  const referenceOnlySources = input.storedRequest.sources.filter((source) => source.parseStatus === 'reference-only');
  if (referenceOnlySources.length > 0) {
    unknownAreas.push(
      `Reference-only sources limited direct evidence for: ${referenceOnlySources.map((source) => source.label).join(', ')}.`,
    );
  }

  if (input.storedRequest.sources.length === 0 && countSelectedDatasetIds(input.selectedDatasetIds) === 0) {
    unknownAreas.push('No persisted source evidence or selected reusable knowledge was available for coverage validation.');
  }

  return dedupeStrings(unknownAreas);
}

async function buildDraftCoverageState(input: {
  runRequestPayload: Prisma.JsonValue;
  draft: {
    title: string;
    summary: string | null;
    inferredContext?: Record<string, unknown>;
    testCases: Array<Record<string, unknown>>;
  };
}) {
  const parsedStoredRequest = generationStoredRequestPayloadSchema.safeParse(input.runRequestPayload);
  if (!parsedStoredRequest.success) {
    return {
      coverageSummary: [],
      coverageAnalysis: coverageAnalysisSchema.parse({
        overallScore: 0.5,
        quotaStatus: 'partially_met',
        unitsIdentified: 0,
        unitsCovered: 0,
        missingRequestedFeatures: [],
        missingBuckets: [],
        underCoveredUnits: [],
        missingScenarioTypesByUnit: [],
        scoreByBucket: {},
        scoreByFeature: {},
        scoreByUnit: {},
        unknownAreas: ['Coverage analysis could not be recalculated because the original generation request payload is unavailable.'],
        retryTriggered: false,
        retryTriggeredForMissingFeatures: false,
      }),
    };
  }
  const storedRequest = parsedStoredRequest.data as StoredGenerationRequest;
  const preparedSources = Array.isArray(storedRequest.sources)
    ? storedRequest.sources.map((source) => preparedSourceInputSchema.parse(source))
    : [];
  const knowledgeBaseContext = await buildKnowledgeBaseContext(
    storedRequest.selectedDatasetIds as GenerationCreateBody['selectedDatasetIds'],
    {
      title: storedRequest.title,
      description: storedRequest.description,
      suiteContext: storedRequest.suiteContext as GenerationCreateBody['suiteContext'],
      userFeatures: Array.isArray(storedRequest.userFeatures) ? storedRequest.userFeatures.map(String) : [],
      preparedSources,
    },
  );
  const coveragePlan = buildCoveragePlan({
    title: storedRequest.title,
    description: storedRequest.description,
    userFeatures: getEffectiveGenerationFeatures(
      storedRequest.suiteContext as GenerationCreateBody['suiteContext'],
      Array.isArray(storedRequest.userFeatures) ? storedRequest.userFeatures.map(String) : [],
    ),
    scopeFeatureName: normalizeScopedFeatureName(storedRequest.suiteContext as GenerationCreateBody['suiteContext']) || undefined,
    sourceInputs: preparedSources,
    knowledgeBaseContext,
  });
  const validation = validateCoveragePlan(coveragePlan, input.draft.testCases);
  return {
    coverageSummary: buildCoverageSummaryLines(validation),
    coverageAnalysis: buildCoverageAnalysis(validation, {
      unknownAreas: inferUnknownCoverageAreas({
        storedRequest,
        selectedDatasetIds: storedRequest.selectedDatasetIds as GenerationCreateBody['selectedDatasetIds'],
      }),
    }),
  };
}

function countSelectedDatasetIds(selectedDatasetIds: GenerationCreateBody['selectedDatasetIds']) {
  return Object.values(selectedDatasetIds).reduce((total, ids) => total + ids.length, 0);
}

function hasUsableSourceMaterial(preparedSources: PreparedSourceInput[]) {
  return preparedSources.some((source) => {
    const hasText = Boolean(source.contentText.trim());
    const hasImage = Boolean(source.imageDataUrl);
    return hasText || hasImage;
  });
}

function hasReferenceOnlyFigmaSource(preparedSources: PreparedSourceInput[]) {
  return preparedSources.some(
    (source) => source.parseStatus === 'reference-only' && typeof source.url === 'string' && source.url.includes('figma.com'),
  );
}

function validateQueuedGenerationInput(options: {
  mode: ApiGenerationMode;
  preparedSources: PreparedSourceInput[];
  selectedDatasetIds: GenerationCreateBody['selectedDatasetIds'];
}) {
  if (options.mode !== 'processAlpha') {
    return;
  }

  if (hasUsableSourceMaterial(options.preparedSources)) {
    return;
  }

  if (countSelectedDatasetIds(options.selectedDatasetIds) > 0) {
    return;
  }

  if (hasReferenceOnlyFigmaSource(options.preparedSources)) {
    throw badRequest(
      'This Figma source could not be ingested into usable screen context. Configure FIGMA_ACCESS_TOKEN for backend Figma ingestion, or add screenshots / pasted mockup notes, or switch to Process Beta with manual knowledge-base selections.',
    );
  }

  throw badRequest(
    'Process Alpha requires at least one usable source with extractable text or an uploaded image/file. A plain reference URL is not enough by itself. Add screenshots, paste the story/PRD text, or switch to Process Beta with manual knowledge-base selections.',
  );
}

async function executeQueuedGenerationRun(job: QueuedGenerationExecution, controller: AbortController) {
  try {
    const effectiveUserFeatures = getEffectiveGenerationFeatures(job.suiteContext, job.userFeatures);
    const featureScopeName = normalizeScopedFeatureName(job.suiteContext) || undefined;

    const knowledgeBaseContext = await buildKnowledgeBaseContext(job.selectedDatasetIds, {
      title: job.title,
      description: job.description,
      suiteContext: job.suiteContext,
      userFeatures: effectiveUserFeatures,
      preparedSources: job.preparedSources,
    });
    const coveragePlan = buildCoveragePlan({
      title: job.title,
      description: job.description,
      userFeatures: effectiveUserFeatures,
      scopeFeatureName: featureScopeName,
      sourceInputs: job.preparedSources,
      knowledgeBaseContext,
    });

    const result = await runTestGenerationWithOpenAi({
      mode: job.mode,
      title: job.title,
      description: job.description,
      sourceInputs: job.preparedSources,
      generationOptions: job.generationOptions as Record<string, unknown>,
      knowledgeBaseContext,
      coveragePlan,
      suiteScope: {
        path: buildSuitePath(
          job.suiteContext.projectName ?? null,
          job.suiteContext.moduleName ?? null,
          job.suiteContext.pageName ?? null,
          featureScopeName ?? null,
        ),
        featureName: featureScopeName ?? null,
      },
      correlationId: job.correlationId,
      abortSignal: controller.signal,
      onProgress: async (progress) => {
        await persistGenerationRunProgress(job, progress);
      },
    });

    const normalizedDraft = normalizeGeneratedDraft(result.parsedResponse as Record<string, unknown>, {
      pageLabel: featureScopeName || job.suiteContext.pageName || job.title,
      screenSizes: job.generationOptions.screenSizes,
      disableOverallPageResponsiveness: Boolean(featureScopeName),
    });
    const coverageValidation = validateCoveragePlan(coveragePlan, normalizedDraft.testCases, {
      retryTriggered: Boolean((result.rawResponse as Record<string, unknown> | null)?.retryTriggered),
    });
    const coverageSummary = buildCoverageSummaryLines(coverageValidation);
    const coverageAnalysis = buildCoverageAnalysis(coverageValidation, {
      unknownAreas: inferUnknownCoverageAreas({
        storedRequest: job.storedRequest,
        selectedDatasetIds: job.selectedDatasetIds,
      }),
    });

    await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.testGenerationRun.update({
        where: { id: job.runId },
        data: {
          model: result.model,
          contributorId: job.contributorId,
          pageId: job.pageId,
          featureId: job.featureId,
          requestPayload: toPrismaJson(job.storedRequest),
          sourceSummary: toPrismaJson(job.sourceSummary),
          rawResponse: toPrismaJson(result.rawResponse),
          parsedResponse: toPrismaJson(result.parsedResponse),
          status: TestGenerationRunStatus.COMPLETED,
          errorMessage: null,
        },
      });

      const draft = await transaction.testCaseDraft.create({
        data: {
          runId: job.runId,
          title: normalizedDraft.title,
          summary: normalizedDraft.summary || null,
          inferredContext: toPrismaJson(normalizedDraft.inferredContext),
          generatedCases: toPrismaJson(normalizedDraft.testCases),
          coverageSummary: toPrismaJson(coverageSummary),
          coverageAnalysis: toPrismaJson(coverageAnalysis),
          confidence: normalizedDraft.confidence,
          reviewStatus: DraftReviewStatus.PENDING,
        },
      });

      await createDraftVersion(
        transaction,
        draft.id,
        1,
        buildDraftSnapshot({
          title: draft.title,
          summary: draft.summary ?? null,
          version: 1,
          inferredContext: normalizedDraft.inferredContext,
          coverageSummary,
          coverageAnalysis,
          confidence: normalizedDraft.confidence,
          reviewStatus: 'pending',
          reviewerNotes: null,
          testCases: normalizedDraft.testCases,
        }),
        'system',
      );
    });
  } catch (error) {
    const rawResponse = getFailureRawResponse(error);
    const aborted = controller.signal.aborted || isGenerationAbortError(error);

    await prisma.testGenerationRun.update({
      where: { id: job.runId },
      data: {
        status: TestGenerationRunStatus.FAILED,
        errorMessage: aborted ? 'Generation stopped by user.' : error instanceof Error ? error.message : 'Unknown generation error',
        ...(rawResponse ? { rawResponse: toPrismaJson(rawResponse) } : {}),
      },
    });
  }
}

async function persistGenerationRunProgress(job: QueuedGenerationExecution, progress: GenerationRunProgressUpdate) {
  await prisma.testGenerationRun.update({
    where: { id: job.runId },
    data: {
      model: progress.model,
      contributorId: job.contributorId,
      pageId: job.pageId,
      featureId: job.featureId,
      requestPayload: toPrismaJson(job.storedRequest),
      sourceSummary: toPrismaJson(job.sourceSummary),
      rawResponse: toPrismaJson(progress.rawResponse),
      parsedResponse: toPrismaJson(progress.parsedResponse),
      status: TestGenerationRunStatus.PENDING,
      errorMessage: null,
    },
  });
}

function queueGenerationRun(job: QueuedGenerationExecution) {
  const controller = new AbortController();
  const task = executeQueuedGenerationRun(job, controller).finally(() => {
    activeGenerationJobs.delete(job.runId);
  });

  activeGenerationJobs.set(job.runId, { promise: task, controller });
}

async function createPendingGenerationRun(options: {
  title: string;
  description: string;
  requestedBy?: string;
  mode: ApiGenerationMode;
  userFeatures: string[];
  suiteContext: GenerationCreateBody['suiteContext'];
  selectedDatasetIds: GenerationCreateBody['selectedDatasetIds'];
  generationOptions: GenerationCreateBody['generationOptions'];
  preparedSources: PreparedSourceInput[];
  correlationId: string;
}) {
  validateQueuedGenerationInput({
    mode: options.mode,
    preparedSources: options.preparedSources,
    selectedDatasetIds: options.selectedDatasetIds,
  });

  const [contributor, page] = await Promise.all([
    resolveContributor(prisma, options.suiteContext.contributorId, options.suiteContext.contributorName),
    resolveSuitePage(prisma, options.suiteContext),
  ]);
  const feature = await resolveSuiteFeature(prisma, page, options.suiteContext);

  const sourceSummary = buildSourceSummary(
    {
      title: options.title,
      description: options.description,
      mode: options.mode,
      userFeatures: options.userFeatures,
      suiteContext: options.suiteContext,
      selectedDatasetIds: options.selectedDatasetIds,
    },
    options.preparedSources,
    {
      contributor,
      page,
      feature,
    },
  );

  const storedRequest = generationStoredRequestPayloadSchema.parse({
    title: options.title,
    description: options.description,
    requestedBy: options.requestedBy ?? '',
    mode: options.mode,
    userFeatures: options.userFeatures,
    suiteContext: options.suiteContext,
    selectedDatasetIds: options.selectedDatasetIds,
    generationOptions: options.generationOptions,
    sources: options.preparedSources.map((source) => preparedSourceInputSchema.parse(source)),
  }) as StoredGenerationRequest;

  const run = await prisma.testGenerationRun.create({
    data: {
      title: options.title,
      mode: apiToDbModeMap[options.mode],
      model: env.OPENAI_MODEL,
      contributorId: contributor?.id ?? null,
      pageId: page.id,
      featureId: feature?.id ?? null,
      requestPayload: toPrismaJson(storedRequest),
      sourceSummary: toPrismaJson(sourceSummary),
      status: TestGenerationRunStatus.PENDING,
      correlationId: options.correlationId,
    },
    include: generationRunInclude,
  });

  queueGenerationRun({
    runId: run.id,
    title: options.title,
    description: options.description,
    mode: options.mode,
    userFeatures: options.userFeatures,
    suiteContext: options.suiteContext,
    selectedDatasetIds: options.selectedDatasetIds,
    generationOptions: options.generationOptions,
    preparedSources: options.preparedSources,
    correlationId: options.correlationId,
    storedRequest,
    sourceSummary,
    contributorId: contributor?.id ?? null,
    pageId: page.id,
    featureId: feature?.id ?? null,
  });

  return {
    run: toRunSummary(run),
  };
}

export async function getGenerationKnowledgeBaseOptions() {
  const [grouped, contributors, projects] = await Promise.all([
    loadApprovedKnowledgeBase(),
    prisma.contributor.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.project.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        modules: {
          orderBy: {
            name: 'asc',
          },
          include: {
            pages: {
              orderBy: {
                name: 'asc',
              },
              include: {
                features: {
                  orderBy: {
                    name: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    componentCatalogue: grouped.componentCatalogue.map(({ id, title, summary }) => ({ id, title, summary })),
    featureType: grouped.featureType.map(({ id, title, summary }) => ({ id, title, summary })),
    rulePack: grouped.rulePack.map(({ id, title, summary }) => ({ id, title, summary })),
    testTaxonomy: grouped.testTaxonomy.map(({ id, title, summary }) => ({ id, title, summary })),
    scenarioTemplate: grouped.scenarioTemplate.map(({ id, title, summary }) => ({ id, title, summary })),
    projectMemory: grouped.projectMemory.map(({ id, title, summary, project, module, page, scopeLevel }) => ({
      id,
      title,
      summary,
      project: project ?? null,
      module: module ?? null,
      page: page ?? null,
      scopeLevel: scopeLevel ?? null,
    })),
    priorityMapping: grouped.priorityMapping.map(({ id, title, summary }) => ({ id, title, summary })),
    severityMapping: grouped.severityMapping.map(({ id, title, summary }) => ({ id, title, summary })),
    synonymAlias: grouped.synonymAlias.map(({ id, title, summary }) => ({ id, title, summary })),
    contributors: contributors.map((contributor) => ({
      id: contributor.id,
      name: contributor.name,
      roleTitle: contributor.roleTitle ?? null,
      department: contributor.department ?? null,
      location: contributor.location ?? null,
      accentColor: contributor.accentColor ?? null,
      avatarUrl: contributor.avatarUrl ?? null,
    })),
    projectHierarchy: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      modules: project.modules.map((moduleItem) => ({
        id: moduleItem.id,
        name: moduleItem.name,
        description: moduleItem.description ?? null,
        pages: moduleItem.pages.map((page) => ({
          id: page.id,
          name: page.name,
          description: page.description ?? null,
          features: page.features.map((feature) => ({
            id: feature.id,
            name: feature.name,
            description: feature.description ?? null,
          })),
        })),
      })),
    })),
  };
}

export async function createGenerationRun(input: GenerationCreateBody, requestCorrelationId?: string, actor?: string) {
  let prepared;

  try {
    prepared = await prepareSourceInputs(input.sourceInputs);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Unable to prepare generation sources.');
  }

  return createPendingGenerationRun({
    title: input.title,
    description: input.description,
    requestedBy: actor,
    mode: input.mode,
    userFeatures: input.userFeatures,
    suiteContext: input.suiteContext,
    selectedDatasetIds: input.selectedDatasetIds,
    generationOptions: input.generationOptions,
    preparedSources: prepared.prepared,
    correlationId: requestCorrelationId ?? randomUUID(),
  });
}

export async function regenerateGenerationRun(runId: string, requestCorrelationId?: string, actor?: string) {
  const run = await prisma.testGenerationRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw notFound('Generation run not found');
  }

  if (run.mode === TestGenerationMode.MANUAL_RECOVERY) {
    throw badRequest('Manual recovery drafts cannot be regenerated directly.');
  }

  const payload = generationStoredRequestPayloadSchema.parse(run.requestPayload) as StoredGenerationRequest;

  return createPendingGenerationRun({
    title: payload.title,
    description: payload.description,
    requestedBy: actor ?? payload.requestedBy,
    mode: payload.mode,
    userFeatures: Array.isArray(payload.userFeatures) ? payload.userFeatures.map((value) => String(value)) : [],
    suiteContext: payload.suiteContext as GenerationCreateBody['suiteContext'],
    selectedDatasetIds: payload.selectedDatasetIds as GenerationCreateBody['selectedDatasetIds'],
    generationOptions: payload.generationOptions as GenerationCreateBody['generationOptions'],
    preparedSources: payload.sources.map((source: PreparedSourceInput) => preparedSourceInputSchema.parse(source)),
    correlationId: requestCorrelationId ?? `${run.correlationId}:regenerate`,
  });
}

export async function stopGenerationRun(runId: string) {
  const run = await prisma.testGenerationRun.findUnique({
    where: { id: runId },
    include: generationRunInclude,
  });

  if (!run) {
    throw notFound('Generation run not found.');
  }

  if (run.status !== TestGenerationRunStatus.PENDING) {
    throw conflict('Only pending generation runs can be stopped.');
  }

  const activeJob = activeGenerationJobs.get(runId);
  activeJob?.controller.abort();

  const updatedRun = await prisma.testGenerationRun.update({
    where: { id: runId },
    data: {
      status: TestGenerationRunStatus.FAILED,
      errorMessage: 'Generation stopped by user.',
      rawResponse: toPrismaJson(buildStoppedRunRawResponse(run)),
    },
    include: generationRunInclude,
  });

  return {
    run: toRunSummary(updatedRun),
  };
}

export async function createManualRecoveryDraft(draftId: string, actor: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
    include: {
      run: true,
    },
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  const run = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const recoveryRun = await transaction.testGenerationRun.create({
      data: {
        title: `${draft.title} Manual Recovery`,
        mode: TestGenerationMode.MANUAL_RECOVERY,
        model: 'manual-editor',
        contributorId: draft.run.contributorId,
        pageId: draft.run.pageId,
        requestPayload:
          draft.run.requestPayload && typeof draft.run.requestPayload === 'object'
            ? toPrismaJson({
                ...(draft.run.requestPayload as Record<string, unknown>),
                manualRecoverySourceDraftId: draft.id,
                manualRecoverySourceRunId: draft.runId,
                manualRecoveryActor: actor,
              })
            : toPrismaJson({
                sourceDraftId: draft.id,
                sourceRunId: draft.runId,
                recoveryActor: actor,
              }),
        sourceSummary: toPrismaJson({
          createdFromDraftId: draft.id,
          createdFromRunId: draft.runId,
          reviewStatus: dbToApiDraftStatusMap[draft.reviewStatus],
        }),
        status: TestGenerationRunStatus.COMPLETED,
        correlationId: `${draft.run.correlationId}:manual-recovery:${randomUUID()}`,
      },
      include: generationRunInclude,
    });

    const recoveryDraft = await transaction.testCaseDraft.create({
      data: {
        runId: recoveryRun.id,
        title: `${draft.title} Manual Recovery`,
        summary: draft.summary,
        inferredContext: toPrismaJson(draft.inferredContext ?? {}),
        generatedCases: toPrismaJson(draft.generatedCases ?? []),
        coverageSummary: toPrismaJson(draft.coverageSummary ?? []),
        coverageAnalysis:
          draft.coverageAnalysis && typeof draft.coverageAnalysis === 'object'
            ? toPrismaJson(draft.coverageAnalysis as Record<string, unknown>)
            : undefined,
        confidence: draft.confidence,
        reviewStatus: DraftReviewStatus.PENDING,
        reviewerNotes: null,
      },
      include: generationDraftInclude,
    });

    await createDraftVersion(
      transaction,
      recoveryDraft.id,
      1,
      buildDraftSnapshot({
        title: recoveryDraft.title,
        summary: recoveryDraft.summary ?? null,
        version: 1,
        inferredContext: (recoveryDraft.inferredContext ?? {}) as Record<string, unknown>,
        coverageSummary: Array.isArray(recoveryDraft.coverageSummary) ? (recoveryDraft.coverageSummary as string[]) : [],
        coverageAnalysis:
          recoveryDraft.coverageAnalysis && typeof recoveryDraft.coverageAnalysis === 'object'
            ? (recoveryDraft.coverageAnalysis as CoverageAnalysis)
            : null,
        confidence: recoveryDraft.confidence,
        reviewStatus: 'pending',
        reviewerNotes: null,
        testCases: Array.isArray(recoveryDraft.generatedCases)
          ? (recoveryDraft.generatedCases as Array<Record<string, unknown>>)
          : [],
      }),
      actor,
    );

    return {
      run: recoveryRun,
      draft: recoveryDraft,
    };
  });

  const refreshedRun = await getGenerationRun(run.run.id);
  const refreshedDraft = await getGenerationDraft(run.draft.id);

  return {
    run: refreshedRun,
    draft: refreshedDraft,
  };
}

export async function listGenerationRuns(query: {
  page: number;
  pageSize: number;
  status?: 'pending' | 'completed' | 'failed';
  mode?: ApiGenerationMode;
  search?: string;
}) {
  const search = query.search?.trim();
  const where: Prisma.TestGenerationRunWhereInput = {
    ...(query.status
      ? {
          status:
            query.status === 'pending'
              ? TestGenerationRunStatus.PENDING
              : query.status === 'completed'
                ? TestGenerationRunStatus.COMPLETED
                : TestGenerationRunStatus.FAILED,
        }
      : {}),
    ...(query.mode
      ? {
          mode: apiToDbModeMap[query.mode],
        }
      : {}),
    ...(search
      ? {
          OR: [
            {
              title: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              page: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              page: {
                module: {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
            },
            {
              page: {
                module: {
                  project: {
                    name: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.testGenerationRun.findMany({
      where,
      include: generationRunInclude,
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.testGenerationRun.count({ where }),
  ]);

  return {
    items: items.map(toRunSummary),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getGenerationRun(runId: string) {
  const run = await prisma.testGenerationRun.findUnique({
    where: { id: runId },
    include: generationRunInclude,
  });

  if (!run) {
    throw notFound('Generation run not found');
  }

  return toRunDetail(run);
}

export async function listGenerationDrafts(query: {
  page: number;
  pageSize: number;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
}) {
  const where: Prisma.TestCaseDraftWhereInput = {
    ...(query.reviewStatus
      ? {
          reviewStatus:
            query.reviewStatus === 'pending'
              ? DraftReviewStatus.PENDING
              : query.reviewStatus === 'approved'
                ? DraftReviewStatus.APPROVED
                : DraftReviewStatus.REJECTED,
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.testCaseDraft.findMany({
      where,
      include: generationDraftInclude,
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.testCaseDraft.count({ where }),
  ]);

  return {
    items: items.map(toDraftResponse),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getGenerationDraft(draftId: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
    include: generationDraftInclude,
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  return toDraftResponse(draft);
}

export async function updateGenerationDraft(draftId: string, input: GenerationDraftUpdateBody, actor: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
    include: generationDraftInclude,
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  const storedRequestParse = generationStoredRequestPayloadSchema.safeParse(draft.run.requestPayload);
  const storedSuiteContext = storedRequestParse.success
    ? (storedRequestParse.data.suiteContext as GenerationCreateBody['suiteContext'])
    : undefined;
  const featureScopeName = storedSuiteContext ? normalizeScopedFeatureName(storedSuiteContext) : '';

  const normalized = normalizeGeneratedDraft(
    {
      suiteTitle: input.suiteTitle,
      suiteSummary: input.suiteSummary,
      inferredComponents: input.inferredComponents,
      inferredFeatureTypes: input.inferredFeatureTypes,
      inferredRulePacks: input.inferredRulePacks,
      inferredTaxonomy: input.inferredTaxonomy,
      inferredScenarios: input.inferredScenarios,
      inferredIntegrations: input.inferredIntegrations,
      assumptions: input.assumptions,
      gaps: input.gaps,
      coverageSummary: input.coverageSummary,
      confidence: input.confidence,
      testCases: input.testCases,
    },
    {
      preserveInputTitles: true,
      titleMaxLength: 500,
      preserveInputOrder: true,
      pageLabel: featureScopeName || draft.run.page?.name || input.suiteTitle,
      screenSizes:
        draft.run.requestPayload && typeof draft.run.requestPayload === 'object'
          ? (draft.run.requestPayload as Record<string, unknown>)['generationOptions'] &&
            typeof (draft.run.requestPayload as Record<string, unknown>)['generationOptions'] === 'object'
            ? ((draft.run.requestPayload as Record<string, unknown>)['generationOptions'] as Record<string, unknown>)
                .screenSizes
            : []
          : [],
      disableOverallPageResponsiveness: Boolean(featureScopeName),
    },
  );

  const nextVersion = draft.version + 1;
  const coverageState = await buildDraftCoverageState({
    runRequestPayload: draft.run.requestPayload ?? {},
    draft: {
      title: normalized.title,
      summary: normalized.summary || null,
      inferredContext: normalized.inferredContext,
      testCases: normalized.testCases,
    },
  });

  const updated = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const saved = await transaction.testCaseDraft.update({
      where: { id: draftId },
      data: {
        title: normalized.title,
        summary: normalized.summary || null,
        version: nextVersion,
        inferredContext: toPrismaJson(normalized.inferredContext),
        generatedCases: toPrismaJson(normalized.testCases),
        coverageSummary: toPrismaJson(coverageState.coverageSummary),
        coverageAnalysis: toPrismaJson(coverageState.coverageAnalysis),
        confidence: normalized.confidence,
        reviewerNotes: input.reviewerNotes || null,
        reviewStatus: DraftReviewStatus.PENDING,
        approvedAt: null,
        approvedBy: null,
      },
      include: generationDraftInclude,
    });

    await createDraftVersion(
      transaction,
      draftId,
      nextVersion,
      buildDraftSnapshot({
        title: saved.title,
        summary: saved.summary ?? null,
        version: nextVersion,
        inferredContext: normalized.inferredContext,
        coverageSummary: coverageState.coverageSummary,
        coverageAnalysis: coverageState.coverageAnalysis,
        confidence: normalized.confidence,
        reviewStatus: 'pending',
        reviewerNotes: input.reviewerNotes || null,
        testCases: normalized.testCases,
      }),
      actor,
    );

    return saved;
  });

  return {
    draft: toDraftResponse(updated),
  };
}

export async function approveGenerationDraft(draftId: string, actor: string, notes?: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
    include: generationDraftInclude,
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  if (draft.reviewStatus === DraftReviewStatus.APPROVED) {
    throw conflict('Draft is already approved');
  }

  const generatedCases = Array.isArray(draft.generatedCases)
    ? draft.generatedCases
        .map((testCase) => toJsonRecord(testCase))
        .filter((testCase): testCase is Prisma.JsonObject => Boolean(testCase))
    : [];
  const pendingCaseCount = generatedCases.filter(
    (testCase) => normalizeCaseReviewStatus(testCase.reviewStatus as unknown) === 'pending',
  ).length;
  const approvedCaseCount = generatedCases.filter(
    (testCase) => normalizeCaseReviewStatus(testCase.reviewStatus as unknown) === 'approved',
  ).length;

  if (pendingCaseCount > 0) {
    throw badRequest('Review every test case before approving the draft.');
  }

  if (approvedCaseCount === 0) {
    throw badRequest('At least one test case must be approved before finalizing the draft.');
  }

  const updated = await prisma.testCaseDraft.update({
    where: { id: draftId },
    data: {
      reviewStatus: DraftReviewStatus.APPROVED,
      reviewerNotes: notes || draft.reviewerNotes || null,
      approvedAt: new Date(),
      approvedBy: actor,
    },
    include: generationDraftInclude,
  });

  void triggerAutoStrengtheningForApprovedDraft({
    actor,
    draftId,
    suiteContext: toLearningSuiteContext({ page: updated.run.page }),
  });

  void triggerAutoStrengtheningForCoverageAnalysis({
    actor,
    draftId,
    suiteContext: toLearningSuiteContext({ page: updated.run.page }),
  });

  return {
    draft: toDraftResponse(updated),
  };
}

export async function rejectGenerationDraft(draftId: string, notes?: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
    include: generationDraftInclude,
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  if (draft.reviewStatus === DraftReviewStatus.APPROVED) {
    throw conflict('Approved drafts cannot be rejected');
  }

  const updated = await prisma.testCaseDraft.update({
    where: { id: draftId },
    data: {
      reviewStatus: DraftReviewStatus.REJECTED,
      reviewerNotes: notes || null,
    },
    include: generationDraftInclude,
  });

  return {
    draft: toDraftResponse(updated),
  };
}

export async function listGenerationTestCaseFeedback(draftId: string, caseId: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  const items = await prisma.testCaseFeedback.findMany({
    where: {
      draftId,
      caseId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    items: items.map((feedback) => ({
      id: feedback.id,
      draftId: feedback.draftId,
      runId: feedback.runId,
      caseId: feedback.caseId,
      draftVersion: feedback.draftVersion,
      action: feedback.action === 'APPROVED' ? 'approved' : 'rejected',
      reasonCode: feedback.reasonCode ? String(feedback.reasonCode).toLowerCase() : null,
      reasonDetails: feedback.reasonDetails ?? null,
      replacementSummary: feedback.replacementSummary ?? null,
      caseTitle: feedback.caseTitle,
      caseSnapshot:
        feedback.caseSnapshot && typeof feedback.caseSnapshot === 'object'
          ? (feedback.caseSnapshot as Record<string, unknown>)
          : {},
      reviewerNotes: feedback.reviewerNotes ?? null,
      usedForLearning: feedback.usedForLearning,
      createdBy: feedback.createdBy,
      createdAt: feedback.createdAt.toISOString(),
    })),
  };
}

async function updateCaseReviewStatusAndCaptureFeedback(input: {
  draftId: string;
  caseId: string;
  actor: string;
  action: 'approved' | 'rejected';
  reasonCode?: (typeof testCaseFeedbackReasonValues)[number];
  reasonDetails?: string;
  replacementSummary?: string;
  reviewerNotes?: string;
}) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: input.draftId },
    include: generationDraftInclude,
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  if (draft.reviewStatus === DraftReviewStatus.APPROVED) {
    throw conflict('Approved drafts cannot be modified.');
  }

  const testCases = extractDraftCases(draft);
  const targetCase = findDraftCaseById(testCases, input.caseId);

  if (!targetCase) {
    throw notFound('Test case not found in draft.');
  }

  const normalizedStatus = input.action === 'approved' ? 'approved' : 'rejected';
  targetCase.reviewStatus = normalizedStatus;

  const updated = await prisma.$transaction(async (transaction) => {
    const savedDraft = await transaction.testCaseDraft.update({
      where: { id: input.draftId },
      data: {
        generatedCases: toPrismaJson(testCases),
        reviewStatus: DraftReviewStatus.PENDING,
      },
      include: generationDraftInclude,
    });

    const feedback = await transaction.testCaseFeedback.create({
      data: {
        draftId: input.draftId,
        runId: draft.runId,
        caseId: input.caseId,
        draftVersion: draft.version,
        action: input.action === 'approved' ? 'APPROVED' : 'REJECTED',
        reasonCode: normalizeFeedbackReason(input.reasonCode)?.toUpperCase() as TestCaseFeedbackReason | undefined,
        reasonDetails: input.reasonDetails?.trim() || null,
        replacementSummary: input.replacementSummary?.trim() || null,
        caseTitle: String(targetCase.title ?? '').trim() || String(targetCase.caseId ?? ''),
        caseSnapshot: toPrismaJson(targetCase),
        reviewerNotes: input.reviewerNotes?.trim() || null,
        createdBy: input.actor,
      },
    });

    return { savedDraft, feedback };
  });

  if (updated.feedback.action === 'REJECTED') {
    void triggerAutoStrengtheningForFeedback({
      actor: input.actor,
      feedbackId: updated.feedback.id,
      suiteContext: toLearningSuiteContext({ page: draft.run.page }),
    });
  }

  return {
    draft: toDraftResponse(updated.savedDraft),
    feedback: {
      id: updated.feedback.id,
      draftId: updated.feedback.draftId,
      runId: updated.feedback.runId,
      caseId: updated.feedback.caseId,
      draftVersion: updated.feedback.draftVersion,
      action: updated.feedback.action === 'APPROVED' ? 'approved' : 'rejected',
      reasonCode: updated.feedback.reasonCode ? String(updated.feedback.reasonCode).toLowerCase() : null,
      reasonDetails: updated.feedback.reasonDetails ?? null,
      replacementSummary: updated.feedback.replacementSummary ?? null,
      caseTitle: updated.feedback.caseTitle,
      caseSnapshot:
        updated.feedback.caseSnapshot && typeof updated.feedback.caseSnapshot === 'object'
          ? (updated.feedback.caseSnapshot as Record<string, unknown>)
          : {},
      reviewerNotes: updated.feedback.reviewerNotes ?? null,
      usedForLearning: updated.feedback.usedForLearning,
      createdBy: updated.feedback.createdBy,
      createdAt: updated.feedback.createdAt.toISOString(),
    },
  };
}

export async function approveGenerationTestCase(
  draftId: string,
  caseId: string,
  actor: string,
  input?: { reviewerNotes?: string },
) {
  return updateCaseReviewStatusAndCaptureFeedback({
    draftId,
    caseId,
    actor,
    action: 'approved',
    reviewerNotes: input?.reviewerNotes,
  });
}

export async function rejectGenerationTestCase(
  draftId: string,
  caseId: string,
  actor: string,
  input: {
    reasonCode: (typeof testCaseFeedbackReasonValues)[number];
    reasonDetails?: string;
    replacementSummary?: string;
    reviewerNotes?: string;
  },
) {
  return updateCaseReviewStatusAndCaptureFeedback({
    draftId,
    caseId,
    actor,
    action: 'rejected',
    reasonCode: input.reasonCode,
    reasonDetails: input.reasonDetails,
    replacementSummary: input.replacementSummary,
    reviewerNotes: input.reviewerNotes,
  });
}

export async function promoteGenerationTestCase(
  draftId: string,
  caseId: string,
  actor: string,
  input: {
    targetType: 'projectMemory' | 'componentCatalogue' | 'scenarioTemplate' | 'rulePack';
    notes?: string;
  },
) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
    include: generationDraftInclude,
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  const cases = extractDraftCases(draft);
  const targetCase = findDraftCaseById(cases, caseId);
  if (!targetCase) {
    throw notFound('Test case not found in draft.');
  }

  if (normalizeCaseReviewStatus(targetCase.reviewStatus) !== 'approved') {
    throw badRequest('Only approved testcases can be promoted into reusable knowledge.');
  }

  const suggestion = await createPromotionSuggestionFromTestCase({
    actor,
    draftId,
    runId: draft.runId,
    caseId,
    caseData: targetCase,
    suiteContext: toLearningSuiteContext({ page: draft.run.page }),
    targetType: input.targetType,
    notes: input.notes,
  });

  return { suggestion: suggestion.suggestion };
}

export async function listGenerationDraftVersions(draftId: string) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Generation draft not found');
  }

  const versions = await prisma.testCaseDraftVersion.findMany({
    where: {
      draftId,
    },
    orderBy: {
      version: 'desc',
    },
  });

  return {
    items: versions.map((version) => ({
      id: version.id,
      version: version.version,
      snapshot: version.snapshot as Record<string, unknown>,
      createdAt: version.createdAt.toISOString(),
      createdBy: version.createdBy,
    })),
  };
}

export async function getTestcaseLibrary() {
  const drafts = await prisma.testCaseDraft.findMany({
    where: buildApprovedGenerationDraftWhere(),
    include: generationDraftInclude,
    orderBy: [
      {
        run: {
          page: {
            module: {
              project: {
                name: 'asc',
              },
            },
          },
        },
      },
      {
        run: {
          page: {
            module: {
              name: 'asc',
            },
          },
        },
      },
      {
        run: {
          page: {
            name: 'asc',
          },
        },
      },
      {
        run: {
          feature: {
            name: 'asc',
          },
        },
      },
      {
        updatedAt: 'desc',
      },
    ],
  });

  return buildTestcaseLibraryTree(drafts);
}

export async function exportApprovedGenerationDrafts(options?: {
  draftId?: string;
  projectId?: string;
  moduleId?: string;
  pageId?: string;
  featureId?: string;
}) {
  if (options?.draftId) {
    const draft = await prisma.testCaseDraft.findUnique({
      where: { id: options.draftId },
      include: generationDraftInclude,
    });

    if (!draft) {
      throw notFound('Generation draft not found');
    }

    if (draft.reviewStatus !== DraftReviewStatus.APPROVED) {
      throw badRequest('Only approved drafts can be exported');
    }

    return toApprovedDraftExportPayload(draft);
  }

  const drafts = await prisma.testCaseDraft.findMany({
    where: buildApprovedGenerationDraftWhere({
      projectId: options?.projectId,
      moduleId: options?.moduleId,
      pageId: options?.pageId,
      featureId: options?.featureId,
    }),
    include: generationDraftInclude,
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return drafts.map((draft) => toApprovedDraftExportPayload(draft));
}
