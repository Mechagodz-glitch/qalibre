import { DraftReviewStatus, TestGenerationMode } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';

type RouteApp = FastifyInstance<any, any, any, any>;

const metricPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  accentColor: z.string().nullable().optional(),
  secondaryLabel: z.string().nullable().optional(),
});

const statusTrendPointSchema = z.object({
  date: z.string(),
  approved: z.number().int(),
  pending: z.number().int(),
  rejected: z.number().int(),
});

const suiteListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectName: z.string(),
  moduleName: z.string(),
  pageName: z.string(),
  contributorName: z.string(),
  caseCount: z.number().int(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']),
  mode: z.string(),
  createdAt: z.string(),
  approvedAt: z.string().nullable().optional(),
  confidence: z.number(),
  draftId: z.string().nullable(),
});

const reviewLoadSchema = z.object({
  projectName: z.string(),
  pendingDrafts: z.number().int(),
  pendingCases: z.number().int(),
});

const lowCoveragePageSchema = z.object({
  projectName: z.string(),
  moduleName: z.string(),
  pageName: z.string(),
  caseCount: z.number().int(),
});

const topContributorSchema = z.object({
  name: z.string(),
  caseCount: z.number().int(),
  suiteCount: z.number().int(),
  accentColor: z.string().nullable(),
});

const dashboardResponseSchema = z.object({
  kpis: z.object({
    totalTestSuites: z.number().int(),
    totalGeneratedTestCases: z.number().int(),
    approvedTestCases: z.number().int(),
    pendingReviewDrafts: z.number().int(),
    rejectedDrafts: z.number().int(),
    projectsCovered: z.number().int(),
    modulesCovered: z.number().int(),
    pagesCovered: z.number().int(),
    approvalRate: z.number(),
    averageConfidence: z.number(),
  }),
  charts: z.object({
    casesByProject: z.array(metricPointSchema),
    casesByContributor: z.array(metricPointSchema),
    suitesByProject: z.array(metricPointSchema),
    draftStatusDistribution: z.array(metricPointSchema),
    taxonomyDistribution: z.array(metricPointSchema),
    generationModeDistribution: z.array(metricPointSchema),
    topModules: z.array(metricPointSchema),
    topPages: z.array(metricPointSchema),
    statusTrend: z.array(statusTrendPointSchema),
  }),
  panels: z.object({
    recentSuites: z.array(suiteListItemSchema),
    recentApprovedSuites: z.array(suiteListItemSchema),
    reviewLoadByProject: z.array(reviewLoadSchema),
    lowCoveragePages: z.array(lowCoveragePageSchema),
    topContributors: z.array(topContributorSchema),
    actionItems: z.array(z.string()),
  }),
});

const modeLabelMap: Record<TestGenerationMode, string> = {
  [TestGenerationMode.PROCESS_ALPHA]: 'Process Alpha',
  [TestGenerationMode.PROCESS_BETA]: 'Process Beta',
  [TestGenerationMode.MANUAL_RECOVERY]: 'Manual Recovery',
};

const reviewStatusMap: Record<DraftReviewStatus, 'pending' | 'approved' | 'rejected'> = {
  [DraftReviewStatus.PENDING]: 'pending',
  [DraftReviewStatus.APPROVED]: 'approved',
  [DraftReviewStatus.REJECTED]: 'rejected',
};

type DraftRecord = Awaited<ReturnType<typeof loadDashboardDrafts>>[number];
type PageInventoryRecord = Awaited<ReturnType<typeof loadProjectPages>>[number];

function toSafeLabel(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value.trim() : fallback;
}

function toCaseCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function buildSuiteMeta(draft: DraftRecord) {
  const projectName = toSafeLabel(draft.run.page?.module.project.name, 'Unassigned Project');
  const moduleName = toSafeLabel(draft.run.page?.module.name, 'Unassigned Module');
  const pageName = toSafeLabel(draft.run.page?.name, 'Unassigned Page');
  const contributorName = toSafeLabel(draft.run.contributor?.name, 'Local Admin');
  const caseCount = toCaseCount(draft.generatedCases);

  return {
    id: draft.id,
    title: draft.title,
    projectName,
    moduleName,
    pageName,
    contributorName,
    caseCount,
    reviewStatus: reviewStatusMap[draft.reviewStatus],
    mode: modeLabelMap[draft.run.mode],
    createdAt: draft.createdAt.toISOString(),
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    confidence: draft.confidence,
    draftId: draft.id,
  };
}

async function loadDashboardDrafts() {
  return prisma.testCaseDraft.findMany({
    include: {
      run: {
        select: {
          mode: true,
          contributor: {
            select: {
              id: true,
              name: true,
              accentColor: true,
            },
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
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function loadProjectPages() {
  return prisma.projectPage.findMany({
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
    orderBy: [
      {
        module: {
          project: {
            name: 'asc',
          },
        },
      },
      {
        module: {
          name: 'asc',
        },
      },
      {
        name: 'asc',
      },
    ],
  });
}

function addMetric(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function toSortedMetricArray(
  metrics: Map<string, number>,
  options?: {
    limit?: number;
    accentLookup?: Map<string, string | null>;
    secondaryLabelLookup?: Map<string, string | null>;
  },
) {
  return Array.from(metrics.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, options?.limit ?? metrics.size)
    .map(([label, value]) => ({
      label,
      value,
      accentColor: options?.accentLookup?.get(label) ?? null,
      secondaryLabel: options?.secondaryLabelLookup?.get(label) ?? null,
    }));
}

function buildStatusTrend(drafts: DraftRecord[]) {
  const byDate = new Map<string, { approved: number; pending: number; rejected: number }>();

  for (const draft of drafts) {
    const date = draft.createdAt.toISOString().slice(0, 10);
    const current = byDate.get(date) ?? { approved: 0, pending: 0, rejected: 0 };

    if (draft.reviewStatus === DraftReviewStatus.APPROVED) {
      current.approved += 1;
    } else if (draft.reviewStatus === DraftReviewStatus.REJECTED) {
      current.rejected += 1;
    } else {
      current.pending += 1;
    }

    byDate.set(date, current);
  }

  return Array.from(byDate.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-10)
    .map(([date, counts]) => ({
      date,
      approved: counts.approved,
      pending: counts.pending,
      rejected: counts.rejected,
    }));
}

export async function registerDashboardRoutes(app: RouteApp) {
  app.get(
    '/dashboard',
    {
      schema: {
        tags: ['Dashboard'],
        response: {
          200: dashboardResponseSchema,
        },
      },
    },
    async () => {
      const [drafts, pages] = await Promise.all([loadDashboardDrafts(), loadProjectPages()]);

      const projectCaseCounts = new Map<string, number>();
      const contributorCaseCounts = new Map<string, number>();
      const contributorAccentMap = new Map<string, string | null>();
      const projectSuiteCounts = new Map<string, number>();
      const statusDistribution = new Map<string, number>();
      const taxonomyDistribution = new Map<string, number>();
      const generationModeDistribution = new Map<string, number>();
      const moduleCaseCounts = new Map<string, number>();
      const pageCaseCounts = new Map<string, number>();
      const pagesCovered = new Set<string>();
      const modulesCovered = new Set<string>();
      const projectsCovered = new Set<string>();

      let totalGeneratedTestCases = 0;
      let approvedTestCases = 0;
      let pendingReviewDrafts = 0;
      let rejectedDrafts = 0;
      let confidenceTotal = 0;

      for (const draft of drafts) {
        const meta = buildSuiteMeta(draft);
        const projectKey = meta.projectName;
        const moduleKey = `${meta.projectName} / ${meta.moduleName}`;
        const pageKey = `${meta.projectName} / ${meta.moduleName} / ${meta.pageName}`;

        totalGeneratedTestCases += meta.caseCount;
        confidenceTotal += draft.confidence;
        addMetric(projectCaseCounts, projectKey, meta.caseCount);
        addMetric(contributorCaseCounts, meta.contributorName, meta.caseCount);
        addMetric(projectSuiteCounts, projectKey, 1);
        addMetric(statusDistribution, meta.reviewStatus, 1);
        addMetric(generationModeDistribution, meta.mode, 1);
        addMetric(moduleCaseCounts, moduleKey, meta.caseCount);
        addMetric(pageCaseCounts, pageKey, meta.caseCount);
        contributorAccentMap.set(meta.contributorName, draft.run.contributor?.accentColor ?? null);

        if (draft.run.page?.id) {
          pagesCovered.add(draft.run.page.id);
          modulesCovered.add(draft.run.page.module.id);
          projectsCovered.add(draft.run.page.module.project.id);
        }

        if (draft.reviewStatus === DraftReviewStatus.APPROVED) {
          approvedTestCases += meta.caseCount;
        } else if (draft.reviewStatus === DraftReviewStatus.PENDING) {
          pendingReviewDrafts += 1;
        } else if (draft.reviewStatus === DraftReviewStatus.REJECTED) {
          rejectedDrafts += 1;
        }

        const cases = Array.isArray(draft.generatedCases) ? draft.generatedCases : [];
        for (const testCase of cases) {
          if (testCase && typeof testCase === 'object') {
            const taxonomyValues = Array.isArray((testCase as Record<string, unknown>).linkedTaxonomy)
              ? ((testCase as Record<string, unknown>).linkedTaxonomy as unknown[])
              : [];
            const fallbackType = typeof (testCase as Record<string, unknown>).testType === 'string'
              ? String((testCase as Record<string, unknown>).testType)
              : '';
            const labels = taxonomyValues.length
              ? taxonomyValues.map((value) => String(value))
              : fallbackType
                ? [fallbackType]
                : [];

            for (const label of labels) {
              addMetric(taxonomyDistribution, label, 1);
            }
          }
        }
      }

      const reviewLoadByProject = Array.from(projectSuiteCounts.keys())
        .map((projectName) => {
          const pendingProjectDrafts = drafts.filter(
            (draft) => buildSuiteMeta(draft).projectName === projectName && draft.reviewStatus === DraftReviewStatus.PENDING,
          );

          return {
            projectName,
            pendingDrafts: pendingProjectDrafts.length,
            pendingCases: pendingProjectDrafts.reduce((sum, draft) => sum + toCaseCount(draft.generatedCases), 0),
          };
        })
        .filter((entry) => entry.pendingDrafts > 0)
        .sort((left, right) => right.pendingDrafts - left.pendingDrafts || right.pendingCases - left.pendingCases)
        .slice(0, 6);

      const lowCoveragePages = pages
        .map((page) => ({
          projectName: page.module.project.name,
          moduleName: page.module.name,
          pageName: page.name,
          caseCount: pageCaseCounts.get(`${page.module.project.name} / ${page.module.name} / ${page.name}`) ?? 0,
        }))
        .sort((left, right) => left.caseCount - right.caseCount || left.projectName.localeCompare(right.projectName))
        .slice(0, 8);

      const recentSuites = drafts.slice(0, 6).map(buildSuiteMeta);
      const recentApprovedSuites = drafts
        .filter((draft) => draft.reviewStatus === DraftReviewStatus.APPROVED)
        .sort((left, right) => (right.approvedAt?.getTime() ?? 0) - (left.approvedAt?.getTime() ?? 0))
        .slice(0, 6)
        .map(buildSuiteMeta);

      const topContributors = Array.from(contributorCaseCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 6)
        .map(([name, caseCount]) => ({
          name,
          caseCount,
          suiteCount: drafts.filter((draft) => buildSuiteMeta(draft).contributorName === name).length,
          accentColor: contributorAccentMap.get(name) ?? null,
        }));

      const approvalRate = drafts.length ? Number((approvedTestCases / Math.max(totalGeneratedTestCases, 1)).toFixed(2)) : 0;
      const averageConfidence = drafts.length ? Number((confidenceTotal / drafts.length).toFixed(2)) : 0;

      const zeroCoverageCount = lowCoveragePages.filter((page) => page.caseCount === 0).length;
      const actionItems = [
        pendingReviewDrafts
          ? `${pendingReviewDrafts} generated suites are waiting for review approval.`
          : 'No suites are waiting for review right now.',
        zeroCoverageCount
          ? `${zeroCoverageCount} project pages still have zero generated coverage and need attention.`
          : 'Every seeded project page has at least some generated coverage.',
        topContributors[0]
          ? `${topContributors[0].name} currently leads generated coverage with ${topContributors[0].caseCount} cases.`
          : 'No contributor activity has been recorded yet.',
        generationModeDistribution.get('Process Alpha')
          ? `Process Alpha has been used ${generationModeDistribution.get('Process Alpha')} times so far.`
          : 'Process Alpha has not been used yet.',
      ];

      return {
        kpis: {
          totalTestSuites: drafts.length,
          totalGeneratedTestCases,
          approvedTestCases,
          pendingReviewDrafts,
          rejectedDrafts,
          projectsCovered: projectsCovered.size,
          modulesCovered: modulesCovered.size,
          pagesCovered: pagesCovered.size,
          approvalRate,
          averageConfidence,
        },
        charts: {
          casesByProject: toSortedMetricArray(projectCaseCounts, { limit: 8 }),
          casesByContributor: toSortedMetricArray(contributorCaseCounts, {
            limit: 8,
            accentLookup: contributorAccentMap,
          }),
          suitesByProject: toSortedMetricArray(projectSuiteCounts, { limit: 8 }),
          draftStatusDistribution: toSortedMetricArray(statusDistribution),
          taxonomyDistribution: toSortedMetricArray(taxonomyDistribution, { limit: 10 }),
          generationModeDistribution: toSortedMetricArray(generationModeDistribution),
          topModules: toSortedMetricArray(moduleCaseCounts, { limit: 6 }),
          topPages: toSortedMetricArray(pageCaseCounts, { limit: 6 }),
          statusTrend: buildStatusTrend(drafts),
        },
        panels: {
          recentSuites,
          recentApprovedSuites,
          reviewLoadByProject,
          lowCoveragePages,
          topContributors,
          actionItems,
        },
      };
    },
  );
}
