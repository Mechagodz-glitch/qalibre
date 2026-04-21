import { randomUUID } from 'node:crypto';

import {
  DraftReviewStatus,
  ManualExecutionCaseStatus as DbManualExecutionCaseStatus,
  ManualExecutionRunStatus as DbManualExecutionRunStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { slugify } from '../../lib/slug.js';
import { buildCsvBuffer, buildWorkbookBuffer } from '../export/export.utils.js';
import type { ManualExecutionRunCreateBody, ManualExecutionCaseStatus } from './manual-execution.schemas.js';
import { parseManualExecutionImport, type ImportedExecutionSuite } from './manual-execution-import.js';

const scopeSelect = {
  id: true,
  name: true,
} as const;

const approvedDraftInclude = Prisma.validator<Prisma.TestCaseDraftInclude>()({
  run: {
    select: {
      id: true,
      feature: {
        select: scopeSelect,
      },
      page: {
        select: {
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
        },
      },
    },
  },
});

const manualExecutionRunBaseInclude = Prisma.validator<Prisma.ManualExecutionRunInclude>()({
  project: { select: scopeSelect },
  module: { select: scopeSelect },
  page: { select: scopeSelect },
  feature: { select: scopeSelect },
  suites: {
    orderBy: {
      orderIndex: 'asc',
    },
  },
});

type ApprovedDraftWithContext = Prisma.TestCaseDraftGetPayload<{
  include: typeof approvedDraftInclude;
}>;

type ManualExecutionRunWithContext = Prisma.ManualExecutionRunGetPayload<{
  include: typeof manualExecutionRunBaseInclude;
}>;

type DbClient = Prisma.TransactionClient | typeof prisma;

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeOptionalString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

function normalizeApprovedCaseSnapshot(value: unknown, fallbackIndex: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const reviewStatus = normalizeString(record.reviewStatus).toLowerCase();
  if (reviewStatus !== 'approved') {
    return null;
  }

  const sourceCaseId = normalizeString(record.caseId) || `CASE-${String(fallbackIndex + 1).padStart(3, '0')}`;
  const title = normalizeString(record.title) || `Manual execution testcase ${fallbackIndex + 1}`;
  const objective = normalizeString(record.objective) || title;
  const feature = normalizeString(record.feature) || 'General';
  const scenario = normalizeString(record.scenario) || 'Execution';
  const testType = normalizeString(record.testType) || 'Functional';
  const priority = normalizeString(record.priority) || 'P2';
  const severity = normalizeString(record.severity) || 'Medium';

  return {
    sourceCaseId,
    title,
    objective,
    feature,
    scenario,
    testType,
    priority,
    severity,
    automationCandidate: Boolean(record.automationCandidate),
    tags: normalizeStringList(record.tags),
    sourceReferences: normalizeStringList(record.sourceReferences),
    notes: normalizeOptionalString(record.notes),
    caseSnapshot: record,
  };
}

function extractApprovedCases(draft: ApprovedDraftWithContext) {
  if (!Array.isArray(draft.generatedCases)) {
    return [];
  }

  return draft.generatedCases
    .map((testCase, index) => normalizeApprovedCaseSnapshot(testCase, index))
    .filter((testCase): testCase is NonNullable<typeof testCase> => Boolean(testCase));
}

function toApiCaseStatus(status: DbManualExecutionCaseStatus): ManualExecutionCaseStatus {
  switch (status) {
    case DbManualExecutionCaseStatus.PASSED:
      return 'passed';
    case DbManualExecutionCaseStatus.FAILED:
      return 'failed';
    case DbManualExecutionCaseStatus.SKIPPED:
      return 'skipped';
    default:
      return 'untested';
  }
}

function toDbCaseStatus(status: ManualExecutionCaseStatus) {
  switch (status) {
    case 'passed':
      return DbManualExecutionCaseStatus.PASSED;
    case 'failed':
      return DbManualExecutionCaseStatus.FAILED;
    case 'skipped':
      return DbManualExecutionCaseStatus.SKIPPED;
    default:
      return DbManualExecutionCaseStatus.UNTESTED;
  }
}

function toApiRunStatus(status: DbManualExecutionRunStatus) {
  switch (status) {
    case DbManualExecutionRunStatus.DRAFT:
      return 'draft' as const;
    case DbManualExecutionRunStatus.COMPLETED:
      return 'completed' as const;
    default:
      return 'inProgress' as const;
  }
}

function buildSuitePath(input: {
  projectName?: string | null;
  moduleName?: string | null;
  pageName?: string | null;
  featureName?: string | null;
}) {
  const parts = [input.projectName, input.moduleName, input.pageName, input.featureName]
    .map((value) => normalizeString(value))
    .filter(Boolean);
  return parts.length ? parts.join(' > ') : null;
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

async function resolveManualExecutionScope(
  client: DbClient,
  input: {
    projectId?: string;
    projectName?: string;
    moduleId?: string | null;
    moduleName?: string;
    pageId?: string | null;
    pageName?: string;
    featureId?: string | null;
    featureName?: string;
  },
  options: {
    allowCreate: boolean;
  },
) {
  let project =
    input.projectId && input.projectId.trim()
      ? await client.project.findUnique({
          where: { id: input.projectId.trim() },
          select: scopeSelect,
        })
      : null;

  if (!project && input.projectName?.trim()) {
    project = await client.project.findFirst({
      where: {
        name: {
          equals: input.projectName.trim(),
          mode: 'insensitive',
        },
      },
      select: scopeSelect,
    });
  }

  if (!project) {
    throw badRequest('Select an existing client before creating the execution run.');
  }

  let moduleItem =
    input.moduleId && input.moduleId.trim()
      ? await client.projectModule.findUnique({
          where: { id: input.moduleId.trim() },
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        })
      : null;

  if (moduleItem && moduleItem.projectId !== project.id) {
    throw badRequest('Selected module does not belong to the chosen client.');
  }

  if (!moduleItem && input.moduleName?.trim()) {
    moduleItem = await client.projectModule.findFirst({
      where: {
        projectId: project.id,
        name: {
          equals: input.moduleName.trim(),
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        projectId: true,
      },
    });
  }

  let page =
    input.pageId && input.pageId.trim()
      ? await client.projectPage.findUnique({
          where: { id: input.pageId.trim() },
          select: {
            id: true,
            name: true,
            module: {
              select: {
                id: true,
                name: true,
                projectId: true,
              },
            },
          },
        })
      : null;

  if (page && page.module.projectId !== project.id) {
    throw badRequest('Selected page does not belong to the chosen client.');
  }

  if (page && moduleItem && page.module.id !== moduleItem.id) {
    throw badRequest('Selected page does not belong to the chosen module.');
  }

  if (!moduleItem && page?.module) {
    moduleItem = page.module;
  }

  if (!page && input.pageName?.trim()) {
    if (!moduleItem) {
      throw badRequest('Select an existing module before creating a new page.');
    }

    page = await client.projectPage.findFirst({
      where: {
        moduleId: moduleItem.id,
        name: {
          equals: input.pageName.trim(),
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        module: {
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        },
      },
    });
  }

  let feature =
    input.featureId && input.featureId.trim()
      ? await client.projectFeature.findUnique({
          where: { id: input.featureId.trim() },
          select: {
            id: true,
            name: true,
            page: {
              select: {
                id: true,
                name: true,
                module: {
                  select: {
                    id: true,
                    name: true,
                    projectId: true,
                  },
                },
              },
            },
          },
        })
      : null;

  if (feature && feature.page.module.projectId !== project.id) {
    throw badRequest('Selected feature does not belong to the chosen client.');
  }

  if (feature && page && feature.page.id !== page.id) {
    throw badRequest('Selected feature does not belong to the chosen page.');
  }

  if (!page && feature?.page) {
    page = feature.page;
  }

  if (!moduleItem && page?.module) {
    moduleItem = page.module;
  }

  if (!page && input.pageName?.trim()) {
    if (!moduleItem) {
      throw badRequest('Select an existing module before creating a new page.');
    }

    if (!options.allowCreate) {
      throw badRequest('Selected page could not be found.');
    }

    page = await client.projectPage.create({
      data: {
        moduleId: moduleItem.id,
        name: input.pageName.trim(),
        slug: await ensureUniquePageSlug(client, moduleItem.id, input.pageName.trim()),
      },
      select: {
        id: true,
        name: true,
        module: {
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        },
      },
    });
  }

  if (!feature && input.featureName?.trim()) {
    if (!page) {
      throw badRequest('Select an existing page before creating a new feature.');
    }

    feature = await client.projectFeature.findFirst({
      where: {
        pageId: page.id,
        name: {
          equals: input.featureName.trim(),
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        page: {
          select: {
            id: true,
            name: true,
            module: {
              select: {
                id: true,
                name: true,
                projectId: true,
              },
            },
          },
        },
      },
    });
  }

  if (!feature && input.featureName?.trim()) {
    if (!page) {
      throw badRequest('Select an existing page before creating a new feature.');
    }

    if (!options.allowCreate) {
      throw badRequest('Selected feature could not be found.');
    }

    feature = await client.projectFeature.create({
      data: {
        pageId: page.id,
        name: input.featureName.trim(),
        slug: await ensureUniqueFeatureSlug(client, page.id, input.featureName.trim()),
      },
      select: {
        id: true,
        name: true,
        page: {
          select: {
            id: true,
            name: true,
            module: {
              select: {
                id: true,
                name: true,
                projectId: true,
              },
            },
          },
        },
      },
    });
  }

  return {
    project,
    module: moduleItem
      ? {
          id: moduleItem.id,
          name: moduleItem.name,
          projectId: moduleItem.projectId,
        }
      : null,
    page: page
      ? {
          id: page.id,
          name: page.name,
          moduleId: page.module.id,
        }
      : null,
    feature: feature
      ? {
          id: feature.id,
          name: feature.name,
          pageId: feature.page.id,
        }
      : null,
  };
}

function toScopeSummary(entity?: { id: string; name: string } | null) {
  return entity ? { id: entity.id, name: entity.name } : null;
}

function computeTotals(
  caseResults: Array<{
    status: DbManualExecutionCaseStatus;
  }>,
) {
  const totals = {
    total: caseResults.length,
    untested: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    completionPercent: 0,
  };

  for (const item of caseResults) {
    if (item.status === DbManualExecutionCaseStatus.PASSED) {
      totals.passed += 1;
    } else if (item.status === DbManualExecutionCaseStatus.FAILED) {
      totals.failed += 1;
    } else if (item.status === DbManualExecutionCaseStatus.SKIPPED) {
      totals.skipped += 1;
    } else {
      totals.untested += 1;
    }
  }

  const testedCount = totals.total - totals.untested;
  totals.completionPercent = totals.total ? Math.round((testedCount / totals.total) * 100) : 0;
  return totals;
}

function groupStatusRows<T extends { label: string }>(
  items: T[],
  caseResults: Array<{
    runSuiteId?: string;
    feature?: string;
    severity?: string;
    status: DbManualExecutionCaseStatus;
  }>,
  keyResolver: (item: T) => string,
  caseKeyResolver: (item: { runSuiteId?: string; feature?: string; severity?: string }) => string,
) {
  return items.map((item) => {
    const key = keyResolver(item);
    const matched = caseResults.filter((caseResult) => caseKeyResolver(caseResult) === key);
    return {
      label: item.label,
      total: matched.length,
      passed: matched.filter((entry) => entry.status === DbManualExecutionCaseStatus.PASSED).length,
      failed: matched.filter((entry) => entry.status === DbManualExecutionCaseStatus.FAILED).length,
      skipped: matched.filter((entry) => entry.status === DbManualExecutionCaseStatus.SKIPPED).length,
      untested: matched.filter((entry) => entry.status === DbManualExecutionCaseStatus.UNTESTED).length,
    };
  });
}

function buildFailureValueRows(values: string[]) {
  return [...new Set(values.filter(Boolean))]
    .map((value) => ({
      label: value,
      value: values.filter((entry) => entry === value).length,
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, 8);
}

async function loadRunCaseRows(runIds: string[]) {
  if (!runIds.length) {
    return [];
  }

  return prisma.manualExecutionCaseResult.findMany({
    where: {
      runId: {
        in: runIds,
      },
    },
    select: {
      id: true,
      runId: true,
      runSuiteId: true,
      feature: true,
      severity: true,
      status: true,
    },
  });
}

function toApprovedSuiteResponse(draft: ApprovedDraftWithContext) {
  const page = draft.run.page;
  const module = page?.module ?? null;
  const project = module?.project ?? null;
  const feature = draft.run.feature ?? null;
  const approvedCases = extractApprovedCases(draft);

  return {
    id: draft.id,
    runId: draft.runId,
    title: draft.title,
    summary: draft.summary ?? null,
    version: draft.version,
    caseCount: approvedCases.length,
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    approvedBy: draft.approvedBy ?? null,
    suiteContext: {
      project: toScopeSummary(project),
      module: toScopeSummary(module),
      page: toScopeSummary(page),
      feature: toScopeSummary(feature),
      path: buildSuitePath({
        projectName: project?.name,
        moduleName: module?.name,
        pageName: page?.name,
        featureName: feature?.name,
      }),
    },
    cases: approvedCases.map((testCase) => ({
      sourceCaseId: testCase.sourceCaseId,
      title: testCase.title,
      feature: testCase.feature,
      scenario: testCase.scenario,
      testType: testCase.testType,
      priority: testCase.priority,
      severity: testCase.severity,
      notes: testCase.notes ?? null,
    })),
  };
}

function toUploadedSuiteResponse(suite: ImportedExecutionSuite) {
  return {
    tempId: suite.tempId,
    sourceType: suite.sourceType,
    sourceFileName: suite.sourceFileName,
    title: suite.title,
    summary: suite.summary,
    caseCount: suite.caseCount,
    cases: suite.cases,
  };
}

function toRunSummaryResponse(
  run: ManualExecutionRunWithContext,
  caseRows: Array<{
    runId: string;
    status: DbManualExecutionCaseStatus;
  }>,
) {
  const totals = computeTotals(caseRows.filter((caseRow) => caseRow.runId === run.id));
  return {
    id: run.id,
    name: run.name,
    status: toApiRunStatus(run.status),
    project: { id: run.project.id, name: run.project.name },
    module: toScopeSummary(run.module),
    page: toScopeSummary(run.page),
    feature: toScopeSummary(run.feature),
    environment: run.environment ?? null,
    buildVersion: run.buildVersion ?? null,
    assignedTester: run.assignedTester ?? null,
    notes: run.notes ?? null,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    completedBy: run.completedBy ?? null,
    suiteCount: run.suites.length,
    totals,
  };
}

async function getRunWithDetails(runId: string) {
  const run = await prisma.manualExecutionRun.findUnique({
    where: { id: runId },
    include: manualExecutionRunBaseInclude,
  });

  if (!run) {
    throw notFound('Manual execution run not found');
  }

  const caseResults = await prisma.manualExecutionCaseResult.findMany({
    where: { runId },
    include: {
      runSuite: {
        select: {
          id: true,
          suiteTitle: true,
          orderIndex: true,
        },
      },
    },
    orderBy: [{ runSuite: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
  });

  return {
    run,
    caseResults,
  };
}

function toRunDetailResponse(
  run: ManualExecutionRunWithContext,
  caseResults: Array<
    Prisma.ManualExecutionCaseResultGetPayload<{
      include: {
        runSuite: {
          select: {
            id: true;
            suiteTitle: true;
            orderIndex: true;
          };
        };
      };
    }>
  >,
) {
  const summary = toRunSummaryResponse(
    run,
    caseResults.map((caseResult) => ({
      runId: caseResult.runId,
      status: caseResult.status,
    })),
  );

  return {
    ...summary,
    suites: run.suites.map((suite) => ({
      id: suite.id,
      sourceType: suite.sourceType === 'UPLOADED_DOCUMENT' ? 'uploadedDocument' : 'approvedSuite',
      sourceDraftId: suite.sourceDraftId ?? null,
      sourceRunId: suite.sourceRunId ?? null,
      sourceDraftVersion: suite.sourceDraftVersion ?? null,
      sourceFileName: suite.sourceFileName ?? null,
      suiteTitle: suite.suiteTitle,
      suiteSummary: suite.suiteSummary ?? null,
      suitePath: suite.suitePath ?? null,
      sourceProjectName: suite.sourceProjectName ?? null,
      sourceModuleName: suite.sourceModuleName ?? null,
      sourcePageName: suite.sourcePageName ?? null,
      sourceFeatureId: suite.sourceFeatureId ?? null,
      sourceFeatureName: suite.sourceFeatureName ?? null,
      approvedAt: suite.approvedAt?.toISOString() ?? null,
      approvedBy: suite.approvedBy ?? null,
      caseCount: suite.caseCount,
      orderIndex: suite.orderIndex,
    })),
    caseResults: caseResults.map((caseResult) => ({
      id: caseResult.id,
      runId: caseResult.runId,
      runSuiteId: caseResult.runSuiteId,
      suiteTitle: caseResult.runSuite.suiteTitle,
      sourceCaseId: caseResult.sourceCaseId,
      orderIndex: caseResult.orderIndex,
      title: caseResult.title,
      objective: caseResult.objective,
      feature: caseResult.feature,
      scenario: caseResult.scenario,
      testType: caseResult.testType,
      priority: caseResult.priority,
      severity: caseResult.severity,
      automationCandidate: caseResult.automationCandidate,
      tags: caseResult.tags,
      sourceReferences: caseResult.sourceReferences,
      notes: caseResult.notes ?? null,
      caseSnapshot:
        caseResult.caseSnapshot && typeof caseResult.caseSnapshot === 'object'
          ? (caseResult.caseSnapshot as Record<string, unknown>)
          : {},
      status: toApiCaseStatus(caseResult.status),
      comment: caseResult.comment ?? null,
      defectLink: caseResult.defectLink ?? null,
      executedAt: caseResult.executedAt?.toISOString() ?? null,
      executedBy: caseResult.executedBy ?? null,
      createdAt: caseResult.createdAt.toISOString(),
      updatedAt: caseResult.updatedAt.toISOString(),
    })),
  };
}

function buildExecutionReport(detail: ReturnType<typeof toRunDetailResponse>) {
  const statusBreakdown = [
    { label: 'Passed', value: detail.totals.passed, color: '#0b8a57' },
    { label: 'Failed', value: detail.totals.failed, color: '#cf405b' },
    { label: 'Skipped', value: detail.totals.skipped, color: '#d59a22' },
    { label: 'Untested', value: detail.totals.untested, color: '#7a90a0' },
  ];

  const bySuite = groupStatusRows(
    detail.suites.map((suite) => ({ label: suite.suiteTitle, key: suite.id })),
    detail.caseResults.map((caseResult) => ({
      runSuiteId: caseResult.runSuiteId,
      status: toDbCaseStatus(caseResult.status),
    })),
    (item) => item.key,
    (caseResult) => String(caseResult.runSuiteId ?? ''),
  );

  const failedCases = detail.caseResults.filter((caseResult) => caseResult.status === 'failed');
  const failuresByFeature = buildFailureValueRows(failedCases.map((caseResult) => caseResult.feature));
  const failuresBySeverity = buildFailureValueRows(failedCases.map((caseResult) => caseResult.severity));

  return {
    run: {
      ...detail,
      suites: detail.suites,
    },
    charts: {
      statusBreakdown,
      bySuite,
      failuresByFeature,
      failuresBySeverity,
    },
    caseResults: detail.caseResults,
  };
}

function assertRunCompletedForReporting(detail: ReturnType<typeof toRunDetailResponse>) {
  if (detail.status !== 'completed') {
    throw conflict(
      'Manual execution reports are available only after the run is completed.',
    );
  }

  return detail;
}

function buildSummarySheetRows(report: ReturnType<typeof buildExecutionReport>) {
  const run = report.run;
  return [
    { label: 'Run Name', value: run.name },
    { label: 'Project', value: run.project.name },
    { label: 'Module', value: run.module?.name ?? 'Mixed' },
    { label: 'Page', value: run.page?.name ?? 'Mixed' },
    { label: 'Feature', value: run.feature?.name ?? 'Mixed' },
    { label: 'Status', value: run.status },
    { label: 'Environment', value: run.environment ?? '' },
    { label: 'Build Version', value: run.buildVersion ?? '' },
    { label: 'Assigned Tester', value: run.assignedTester ?? '' },
    { label: 'Created By', value: run.createdBy },
    { label: 'Created At', value: run.createdAt },
    { label: 'Completed At', value: run.completedAt ?? '' },
    { label: 'Total Cases', value: run.totals.total },
    { label: 'Passed', value: run.totals.passed },
    { label: 'Failed', value: run.totals.failed },
    { label: 'Skipped', value: run.totals.skipped },
    { label: 'Untested', value: run.totals.untested },
    { label: 'Completion %', value: run.totals.completionPercent },
  ];
}

export async function getManualExecutionBootstrap() {
  const [projects, appUsers, approvedSuiteCount, inProgressRunCount, completedRunCount] = await Promise.all([
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
    prisma.appUser.findMany({
      where: {
        isActive: true,
        contributor: {
          is: {
            isActive: true,
            roleTitle: {
              not: null,
            },
          },
        },
      },
      select: {
        name: true,
        contributor: {
          select: {
            id: true,
            name: true,
            roleTitle: true,
          },
        },
      },
    }),
    prisma.testCaseDraft.count({
      where: {
        reviewStatus: DraftReviewStatus.APPROVED,
      },
    }),
    prisma.manualExecutionRun.count({
      where: {
        status: {
          in: [DbManualExecutionRunStatus.DRAFT, DbManualExecutionRunStatus.IN_PROGRESS],
        },
      },
    }),
    prisma.manualExecutionRun.count({
      where: {
        status: DbManualExecutionRunStatus.COMPLETED,
      },
    }),
  ]);

  return {
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
    testerOptions: appUsers
      .map((user) => user.contributor)
      .filter((contributor): contributor is NonNullable<(typeof appUsers)[number]['contributor']> => Boolean(contributor))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((contributor) => ({
        id: contributor.id,
        name: contributor.name,
        roleTitle: contributor.roleTitle ?? null,
      })),
    summary: {
      approvedSuiteCount,
      inProgressRunCount,
      completedRunCount,
    },
  };
}

export async function listApprovedExecutionSuites(query: {
  projectId: string;
  moduleId?: string;
  pageId?: string;
  featureId?: string;
}) {
  const where: Prisma.TestCaseDraftWhereInput = {
    reviewStatus: DraftReviewStatus.APPROVED,
    run: {
      ...(query.featureId ? { featureId: query.featureId } : {}),
      page: {
        module: {
          projectId: query.projectId,
          ...(query.moduleId ? { id: query.moduleId } : {}),
        },
        ...(query.pageId ? { id: query.pageId } : {}),
      },
    },
  };

  const drafts = await prisma.testCaseDraft.findMany({
    where,
    include: approvedDraftInclude,
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return {
    items: drafts
      .map(toApprovedSuiteResponse)
      .filter((draft) => draft.caseCount > 0),
  };
}

export async function listManualExecutionRuns(query: {
  page: number;
  pageSize: number;
  projectId?: string;
  status?: 'draft' | 'inProgress' | 'completed';
}) {
  const where: Prisma.ManualExecutionRunWhereInput = {
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.status
      ? {
          status:
            query.status === 'draft'
              ? DbManualExecutionRunStatus.DRAFT
              : query.status === 'completed'
                ? DbManualExecutionRunStatus.COMPLETED
                : DbManualExecutionRunStatus.IN_PROGRESS,
        }
      : {}),
  };

  const [runs, total] = await prisma.$transaction([
    prisma.manualExecutionRun.findMany({
      where,
      include: manualExecutionRunBaseInclude,
      orderBy: {
        updatedAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.manualExecutionRun.count({ where }),
  ]);

  const caseRows = await loadRunCaseRows(runs.map((run) => run.id));

  return {
    items: runs.map((run) => toRunSummaryResponse(run, caseRows)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function createManualExecutionRun(input: ManualExecutionRunCreateBody, actor: string) {
  const suiteSelections = input.suiteSelections.length
    ? input.suiteSelections
    : input.suiteIds.map((suiteId) => ({
        suiteId,
        caseIds: [],
      }));
  const selectedSuiteIds = [...new Set(suiteSelections.map((selection) => selection.suiteId))];

  const approvedDrafts = await prisma.testCaseDraft.findMany({
    where: {
      id: {
        in: selectedSuiteIds,
      },
    },
    include: approvedDraftInclude,
  });

  if (approvedDrafts.length !== selectedSuiteIds.length) {
    throw badRequest('One or more selected approved suites could not be found.');
  }

  if (approvedDrafts.some((draft) => draft.reviewStatus !== DraftReviewStatus.APPROVED)) {
    throw badRequest('Only approved suites can be added to a manual execution run.');
  }

  const usesNamedScope = Boolean(input.projectName || input.moduleName || input.pageName || input.featureName);
  if (usesNamedScope && approvedDrafts.length) {
    throw badRequest('New client, module, page, and feature entries are supported only for uploaded testcase documents.');
  }

  const commonModuleId =
    input.moduleId ||
    (() => {
      const moduleIds = [...new Set(approvedDrafts.map((draft) => draft.run.page?.module.id).filter(Boolean))];
      return moduleIds.length === 1 ? moduleIds[0] : null;
    })();
  const commonPageId =
    input.pageId ||
    (() => {
      const pageIds = [...new Set(approvedDrafts.map((draft) => draft.run.page?.id).filter(Boolean))];
      return pageIds.length === 1 ? pageIds[0] : null;
    })();
  const commonFeatureId =
    input.featureId ||
    (() => {
      const featureIds = approvedDrafts.map((draft) => draft.run.feature?.id).filter(Boolean);
      return approvedDrafts.length > 0 && featureIds.length === approvedDrafts.length && new Set(featureIds).size === 1
        ? featureIds[0]
        : null;
    })();

  const resolvedScope = await resolveManualExecutionScope(
    prisma,
    {
      projectId: input.projectId,
      projectName: input.projectName,
      moduleId: commonModuleId ?? input.moduleId ?? null,
      moduleName: input.moduleName,
      pageId: commonPageId ?? input.pageId ?? null,
      pageName: input.pageName,
      featureId: commonFeatureId ?? input.featureId ?? null,
      featureName: input.featureName,
    },
    {
      allowCreate: !approvedDrafts.length,
    },
  );

  if (approvedDrafts.length) {
    const projects = new Set(approvedDrafts.map((draft) => draft.run.page?.module.project.id).filter(Boolean));
    if (projects.size !== 1 || !projects.has(resolvedScope.project.id)) {
      throw badRequest('Selected suites must belong to the chosen project.');
    }
  }

  if (resolvedScope.module) {
    const invalidModule = approvedDrafts.some((draft) => draft.run.page?.module.id !== resolvedScope.module?.id);
    if (invalidModule) {
      throw badRequest('Selected suites do not all belong to the chosen module.');
    }
  }

  if (resolvedScope.page) {
    const invalidPage = approvedDrafts.some((draft) => draft.run.page?.id !== resolvedScope.page?.id);
    if (invalidPage) {
      throw badRequest('Selected suites do not all belong to the chosen page.');
    }
  }

  if (resolvedScope.feature) {
    const invalidFeature = approvedDrafts.some((draft) => draft.run.feature?.id !== resolvedScope.feature?.id);
    if (invalidFeature) {
      throw badRequest('Selected suites do not all belong to the chosen feature.');
    }
  }

  const suiteSelectionMap = new Map(
    suiteSelections.map((selection) => [
      selection.suiteId,
      new Set(selection.caseIds.map((caseId) => normalizeString(caseId)).filter(Boolean)),
    ]),
  );

  const suiteSnapshots = approvedDrafts.map((draft, draftIndex) => {
    const availableCases = extractApprovedCases(draft);
    const selectedCaseIds = suiteSelectionMap.get(draft.id) ?? new Set<string>();
    const approvedCases = selectedCaseIds.size
      ? availableCases.filter((testCase) => selectedCaseIds.has(testCase.sourceCaseId))
      : availableCases;
    if (!approvedCases.length) {
      throw badRequest(`Approved suite "${draft.title}" has no approved testcases available for execution.`);
    }

    if (selectedCaseIds.size && approvedCases.length !== selectedCaseIds.size) {
      throw badRequest(`One or more selected testcases for "${draft.title}" could not be found in the approved suite.`);
    }

    const page = draft.run.page;
    const module = page?.module ?? null;
    const project = module?.project ?? null;
    const feature = draft.run.feature ?? null;

    return {
      sourceType: 'approvedSuite' as const,
      draft,
      approvedCases,
      orderIndex: draftIndex,
      suitePath: buildSuitePath({
        projectName: project?.name,
        moduleName: module?.name,
        pageName: page?.name,
        featureName: feature?.name,
      }),
      project,
      module,
      page,
      feature,
    };
  });

  const uploadedSuites = input.uploadedSuites.map((suite, index) => {
    if (!suite.cases.length) {
      throw badRequest(`Uploaded testcase document "${suite.title}" does not contain any execution cases.`);
    }

    return {
      sourceType: 'uploadedDocument' as const,
      tempId: suite.tempId,
      sourceFileName: suite.sourceFileName,
      title: suite.title,
      summary: suite.summary ?? null,
      approvedCases: suite.cases,
      orderIndex: suiteSnapshots.length + index,
      suitePath: buildSuitePath({
        projectName: resolvedScope.project.name,
        moduleName: resolvedScope.module?.name ?? null,
        pageName: resolvedScope.page?.name ?? null,
        featureName: resolvedScope.feature?.name ?? null,
      }),
      project: resolvedScope.project,
      module: resolvedScope.module,
      page: resolvedScope.page,
      feature: resolvedScope.feature,
    };
  });

  const allSuiteSnapshots = [...suiteSnapshots, ...uploadedSuites];

  const created = await prisma.$transaction(async (transaction) => {
    const run = await transaction.manualExecutionRun.create({
      data: {
        name: input.name,
        projectId: resolvedScope.project.id,
        moduleId: resolvedScope.module?.id ?? null,
        pageId: resolvedScope.page?.id ?? null,
        featureId: resolvedScope.feature?.id ?? null,
        environment: normalizeOptionalString(input.environment) ?? undefined,
        buildVersion: normalizeOptionalString(input.buildVersion) ?? undefined,
        assignedTester: normalizeOptionalString(input.assignedTester) ?? undefined,
        notes: normalizeOptionalString(input.notes) ?? undefined,
        status: DbManualExecutionRunStatus.IN_PROGRESS,
        createdBy: actor,
      },
    });

    for (const suiteSnapshot of allSuiteSnapshots) {
      const createdSuite = await transaction.manualExecutionRunSuite.create({
        data: {
          runId: run.id,
          sourceType: suiteSnapshot.sourceType === 'uploadedDocument' ? 'UPLOADED_DOCUMENT' : 'APPROVED_SUITE',
          sourceDraftId: suiteSnapshot.sourceType === 'approvedSuite' ? suiteSnapshot.draft.id : null,
          sourceRunId: suiteSnapshot.sourceType === 'approvedSuite' ? suiteSnapshot.draft.runId : null,
          sourceDraftVersion: suiteSnapshot.sourceType === 'approvedSuite' ? suiteSnapshot.draft.version : null,
          sourceFileName: suiteSnapshot.sourceType === 'uploadedDocument' ? suiteSnapshot.sourceFileName : null,
          suiteTitle: suiteSnapshot.sourceType === 'approvedSuite' ? suiteSnapshot.draft.title : suiteSnapshot.title,
          suiteSummary:
            suiteSnapshot.sourceType === 'approvedSuite'
              ? suiteSnapshot.draft.summary ?? null
              : suiteSnapshot.summary,
          suitePath: suiteSnapshot.suitePath,
          sourceProjectId: suiteSnapshot.project?.id ?? null,
          sourceProjectName: suiteSnapshot.project?.name ?? null,
          sourceModuleId: suiteSnapshot.module?.id ?? null,
          sourceModuleName: suiteSnapshot.module?.name ?? null,
          sourcePageId: suiteSnapshot.page?.id ?? null,
          sourcePageName: suiteSnapshot.page?.name ?? null,
          sourceFeatureId: suiteSnapshot.feature?.id ?? null,
          sourceFeatureName: suiteSnapshot.feature?.name ?? null,
          approvedAt: suiteSnapshot.sourceType === 'approvedSuite' ? suiteSnapshot.draft.approvedAt ?? null : null,
          approvedBy: suiteSnapshot.sourceType === 'approvedSuite' ? suiteSnapshot.draft.approvedBy ?? null : null,
          caseCount: suiteSnapshot.approvedCases.length,
          orderIndex: suiteSnapshot.orderIndex,
        },
      });

      for (const [caseIndex, approvedCase] of suiteSnapshot.approvedCases.entries()) {
        await transaction.manualExecutionCaseResult.create({
          data: {
            runId: run.id,
            runSuiteId: createdSuite.id,
            sourceCaseId: approvedCase.sourceCaseId,
            orderIndex: caseIndex,
            title: approvedCase.title,
            objective: approvedCase.objective,
            feature: approvedCase.feature,
            scenario: approvedCase.scenario,
            testType: approvedCase.testType,
            priority: approvedCase.priority,
            severity: approvedCase.severity,
            automationCandidate: approvedCase.automationCandidate,
            tags: approvedCase.tags,
            sourceReferences: approvedCase.sourceReferences,
            notes: approvedCase.notes,
            caseSnapshot: toPrismaJson(approvedCase.caseSnapshot),
            status: DbManualExecutionCaseStatus.UNTESTED,
          },
        });
      }
    }

    return run.id;
  });

  return {
    run: await getManualExecutionRun(created),
  };
}

export async function getManualExecutionRun(runId: string) {
  const { run, caseResults } = await getRunWithDetails(runId);
  return toRunDetailResponse(run, caseResults);
}

export async function updateManualExecutionCaseResult(
  runId: string,
  caseResultId: string,
  actor: string,
  input: {
    status: ManualExecutionCaseStatus;
    comment?: string;
    defectLink?: string;
  },
) {
  const caseResult = await prisma.manualExecutionCaseResult.findUnique({
    where: { id: caseResultId },
    include: {
      run: true,
      runSuite: {
        select: {
          id: true,
          suiteTitle: true,
          orderIndex: true,
        },
      },
    },
  });

  if (!caseResult || caseResult.runId !== runId) {
    throw notFound('Manual execution testcase result not found');
  }

  if (caseResult.run.status === DbManualExecutionRunStatus.COMPLETED) {
    throw conflict('Completed manual execution runs cannot be edited');
  }

  const nextStatus = toDbCaseStatus(input.status);
  const executedAt = nextStatus === DbManualExecutionCaseStatus.UNTESTED ? null : new Date();

  await prisma.manualExecutionCaseResult.update({
    where: { id: caseResultId },
    data: {
      status: nextStatus,
      comment: normalizeOptionalString(input.comment) ?? null,
      defectLink: normalizeOptionalString(input.defectLink) ?? null,
      executedAt,
      executedBy: executedAt ? actor : null,
    },
  });

  const detail = await getManualExecutionRun(runId);
  const updatedCaseResult = detail.caseResults.find((entry) => entry.id === caseResultId);
  return {
    run: {
      id: detail.id,
      name: detail.name,
      status: detail.status,
      project: detail.project,
      module: detail.module,
      page: detail.page,
      feature: detail.feature,
      environment: detail.environment,
      buildVersion: detail.buildVersion,
      assignedTester: detail.assignedTester,
      notes: detail.notes,
      createdBy: detail.createdBy,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      completedAt: detail.completedAt,
      completedBy: detail.completedBy,
      suiteCount: detail.suiteCount,
      totals: detail.totals,
    },
    caseResult: updatedCaseResult ?? null,
  };
}

export async function completeManualExecutionRun(runId: string, actor: string) {
  const run = await prisma.manualExecutionRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw notFound('Manual execution run not found');
  }

  if (run.status === DbManualExecutionRunStatus.COMPLETED) {
    throw conflict('Manual execution run is already completed');
  }

  const caseResults = await prisma.manualExecutionCaseResult.findMany({
    where: { runId },
    select: {
      status: true,
    },
  });

  if (caseResults.some((caseResult) => caseResult.status === DbManualExecutionCaseStatus.UNTESTED)) {
    throw badRequest('All testcase results must be updated before completing the run.');
  }

  await prisma.manualExecutionRun.update({
    where: { id: runId },
    data: {
      status: DbManualExecutionRunStatus.COMPLETED,
      completedAt: new Date(),
      completedBy: actor,
    },
  });

  return {
    run: await getManualExecutionRun(runId),
  };
}

export async function deleteManualExecutionRun(runId: string) {
  const run = await prisma.manualExecutionRun.findUnique({
    where: { id: runId },
    select: { id: true },
  });

  if (!run) {
    throw notFound('Manual execution run not found');
  }

  await prisma.manualExecutionRun.delete({
    where: { id: runId },
  });

  return { success: true as const };
}

export async function getManualExecutionReport(runId: string) {
  const detail = assertRunCompletedForReporting(await getManualExecutionRun(runId));
  return buildExecutionReport(detail);
}

export async function exportManualExecutionRun(runId: string, format: 'csv' | 'xlsx') {
  const report = await getManualExecutionReport(runId);
  const filenameBase = `${slugify(report.run.name || 'manual-execution-run')}-manual-execution-report`;

  const caseRows = report.caseResults.map((caseResult) => ({
    suite: caseResult.suiteTitle,
    caseId: caseResult.sourceCaseId,
    title: caseResult.title,
    feature: caseResult.feature,
    scenario: caseResult.scenario,
    testType: caseResult.testType,
    status: caseResult.status,
    comment: caseResult.comment ?? '',
    defectLink: caseResult.defectLink ?? '',
    executedBy: caseResult.executedBy ?? '',
    executedAt: caseResult.executedAt ?? '',
  }));

  if (format === 'csv') {
    return {
      filenameBase,
      buffer: await buildCsvBuffer(caseRows),
    };
  }

  return {
    filenameBase,
    buffer: await buildWorkbookBuffer([
      {
        name: 'Run Summary',
        rows: buildSummarySheetRows(report),
        columnOrder: ['label', 'value'],
      },
      {
        name: 'Status Breakdown',
        rows: report.charts.statusBreakdown,
        columnOrder: ['label', 'value', 'color'],
      },
      {
        name: 'Suite Breakdown',
        rows: report.charts.bySuite,
        columnOrder: ['label', 'total', 'passed', 'failed', 'skipped', 'untested'],
      },
      {
        name: 'Failures by Feature',
        rows: report.charts.failuresByFeature,
        columnOrder: ['label', 'value'],
      },
      {
        name: 'Failures by Severity',
        rows: report.charts.failuresBySeverity,
        columnOrder: ['label', 'value'],
      },
      {
        name: 'Case Results',
        rows: caseRows,
        columnOrder: [
          'suite',
          'caseId',
          'title',
          'feature',
          'scenario',
          'testType',
          'status',
          'comment',
          'defectLink',
          'executedBy',
          'executedAt',
        ],
        columnWidths: {
          suite: 22,
          caseId: 18,
          title: 46,
          feature: 24,
          scenario: 28,
          testType: 16,
          status: 14,
          comment: 26,
          defectLink: 28,
          executedBy: 20,
          executedAt: 22,
        },
        wrapTextColumns: ['title', 'feature', 'scenario', 'comment', 'defectLink'],
      },
    ]),
  };
}

export async function importManualExecutionTestcases(body: {
  fileName: string;
  mimeType?: string;
  dataUrl: string;
}) {
  const parsed = await parseManualExecutionImport(body);
  return {
    suites: parsed.suites.map(toUploadedSuiteResponse),
  };
}
