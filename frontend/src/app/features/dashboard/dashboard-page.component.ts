import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import type {
  DashboardSummary,
  ManualExecutionBootstrap,
  ManualExecutionRunSummary,
  TestGenerationDraft,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import {
  formatManualExecutionDate,
  getManualExecutionRunBadgeStatus,
  getManualExecutionRunStatusLabel,
  loadAllManualExecutionRuns,
  manualExecutionDateFilterOptions,
  matchesManualExecutionDateFilter,
  type ManualExecutionDateFilter,
} from '../manual-execution/manual-execution.utils';

type HeroChip = {
  label: string;
  value: number;
};

type MetricTone = 'sky' | 'warm' | 'mint' | 'slate';
type MetricBadgeTone = 'positive' | 'warning' | 'neutral' | 'accent';
type MetricIcon = 'suite' | 'review' | 'run' | 'success';

type DashboardMetricCard = {
  label: string;
  value: string;
  description: string;
  tone: MetricTone;
  badge: string;
  badgeTone: MetricBadgeTone;
  icon: MetricIcon;
  route?: string[];
};

type PerformanceBreakdownRow = {
  projectName: string;
  generated: number;
  approved: number;
  executed: number;
};

type ProjectSyncRow = {
  projectId: string;
  projectName: string;
  qaLabel: string;
  qaTooltip: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  untested: number;
};

type QaMetricsRow = {
  name: string;
  roleTitle: string | null;
  totalProjects: number;
  totalGenerations: number;
  totalExecutions: number;
  isActive: boolean;
};

function normalizeQaOwnerName(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return null;
  }

  if (normalized.toLowerCase() === 'local-admin') {
    return null;
  }

  return normalized;
}

function getRunOwner(
  run: Pick<ManualExecutionRunSummary, 'assignedTester' | 'createdBy'>,
) {
  return normalizeQaOwnerName(run.assignedTester) ?? normalizeQaOwnerName(run.createdBy) ?? 'Unassigned QA';
}

function getRunActivityTimestamp(run: ManualExecutionRunSummary) {
  return run.completedAt ?? run.updatedAt ?? run.createdAt;
}

function getDraftOwner(draft: Pick<TestGenerationDraft, 'suiteContext'>) {
  return normalizeQaOwnerName(draft.suiteContext.contributor?.name) ?? 'Unassigned QA';
}

function getDraftApprovalTimestamp(
  draft: Pick<TestGenerationDraft, 'approvedAt' | 'updatedAt' | 'createdAt'>,
) {
  return draft.approvedAt ?? draft.updatedAt ?? draft.createdAt;
}

const generationDraftPageSize = 50;

async function loadAllGenerationDrafts(
  api: WorkbenchApiService,
  reviewStatus?: string,
) {
  const firstPage = await firstValueFrom(
    api.listGenerationDrafts({
      page: 1,
      pageSize: generationDraftPageSize,
      ...(reviewStatus ? { reviewStatus } : {}),
    }),
  );

  if (firstPage.totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      firstValueFrom(
        api.listGenerationDrafts({
          page: index + 2,
          pageSize: generationDraftPageSize,
          ...(reviewStatus ? { reviewStatus } : {}),
        }),
      ),
    ),
  );

  return [
    ...firstPage.items,
    ...remainingPages.flatMap((page) => page.items),
  ];
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    EmptyStateComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);

  readonly loading = signal(true);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly bootstrap = signal<ManualExecutionBootstrap | null>(null);
  readonly manualRuns = signal<ManualExecutionRunSummary[]>([]);
  readonly generationDrafts = signal<TestGenerationDraft[]>([]);
  readonly dateFilter = signal<ManualExecutionDateFilter>('last30Days');
  readonly dateFilterOptions = manualExecutionDateFilterOptions;

  readonly heroChips = computed<HeroChip[]>(() => {
    const summary = this.summary();
    return [
      { label: 'Clients', value: summary?.kpis.projectsCovered ?? 0 },
      { label: 'Modules', value: summary?.kpis.modulesCovered ?? 0 },
      { label: 'Pages', value: summary?.kpis.pagesCovered ?? 0 },
    ];
  });

  readonly dateFilterLabel = computed(
    () =>
      this.dateFilterOptions.find((option) => option.value === this.dateFilter())
        ?.label ?? 'Last 30 days',
  );

  readonly filteredGenerationDrafts = computed(() =>
    this.generationDrafts().filter((draft) =>
      matchesManualExecutionDateFilter(draft.createdAt, this.dateFilter()),
    ),
  );

  readonly filteredApprovedDrafts = computed(() =>
    this.generationDrafts().filter(
      (draft) =>
        draft.reviewStatus === 'approved' &&
        matchesManualExecutionDateFilter(
          getDraftApprovalTimestamp(draft),
          this.dateFilter(),
        ),
    ),
  );

  readonly filteredPendingDrafts = computed(() =>
    this.generationDrafts().filter(
      (draft) =>
        draft.reviewStatus === 'pending' &&
        matchesManualExecutionDateFilter(draft.updatedAt, this.dateFilter()),
    ),
  );

  readonly filteredRejectedDrafts = computed(() =>
    this.generationDrafts().filter(
      (draft) =>
        draft.reviewStatus === 'rejected' &&
        matchesManualExecutionDateFilter(draft.updatedAt, this.dateFilter()),
    ),
  );

  readonly filteredManualRuns = computed(() =>
    this.manualRuns().filter((run) =>
      matchesManualExecutionDateFilter(getRunActivityTimestamp(run), this.dateFilter()),
    ),
  );

  readonly manualInsights = computed(() => {
    const runs = this.filteredManualRuns();
    const activeRuns = runs.filter((run) => run.status !== 'completed').length;
    const completedRuns = runs.filter((run) => run.status === 'completed').length;
    const executedSuites = runs.reduce((sum, run) => {
      const executedCases = run.totals.total - run.totals.untested;
      return executedCases > 0 ? sum + run.suiteCount : sum;
    }, 0);
    const executedProjects = new Set(
      runs
        .filter((run) => run.totals.total - run.totals.untested > 0)
        .map((run) => run.project.name),
    ).size;
    const passed = runs.reduce((sum, run) => sum + run.totals.passed, 0);
    const failed = runs.reduce((sum, run) => sum + run.totals.failed, 0);
    const skipped = runs.reduce((sum, run) => sum + run.totals.skipped, 0);
    const executedCases = runs.reduce(
      (sum, run) => sum + (run.totals.total - run.totals.untested),
      0,
    );
    const successRate = executedCases ? (passed / executedCases) * 100 : 0;

    return {
      activeRuns,
      completedRuns,
      executedSuites,
      executedProjects,
      passed,
      failed,
      skipped,
      executedCases,
      successRate,
    };
  });

  readonly metricCards = computed<DashboardMetricCard[]>(() => {
    const pendingDrafts = this.filteredPendingDrafts();
    const rejectedDrafts = this.filteredRejectedDrafts();
    const insights = this.manualInsights();

    return [
      {
        label: 'Executed Suites',
        value: this.formatInteger(insights.executedSuites),
        description: 'Suites already touched by manual execution.',
        tone: 'sky',
        badge: `${insights.executedProjects} projects`,
        badgeTone: 'positive',
        icon: 'suite',
      },
      {
        label: 'Pending Reviews',
        value: this.formatInteger(pendingDrafts.length),
        description: 'Draft suites still waiting on reviewer approval.',
        tone: 'warm',
        badge: `${rejectedDrafts.length} rejected`,
        badgeTone: 'warning',
        icon: 'review',
        route: ['/test-generator/review'],
      },
      {
        label: 'Active Manual Runs',
        value: this.formatInteger(insights.activeRuns),
        description:
          'Draft and in-progress manual runs still moving through execution.',
        tone: 'mint',
        badge: `${insights.completedRuns} completed`,
        badgeTone: 'neutral',
        icon: 'run',
        route: ['/manual-execution/test-execution'],
      },
      {
        label: 'Execution Success',
        value: `${insights.successRate.toFixed(1)}%`,
        description: 'Passed share across all executed manual cases.',
        tone: 'slate',
        badge: `${this.formatInteger(insights.executedCases)} executed`,
        badgeTone: 'positive',
        icon: 'success',
      },
    ];
  });

  readonly recentExecutions = computed(() =>
    [...this.filteredManualRuns()].sort((left, right) =>
      getRunActivityTimestamp(right).localeCompare(getRunActivityTimestamp(left)),
    ),
  );

  readonly performanceBreakdownRows = computed<PerformanceBreakdownRow[]>(() => {
    const generatedByProject = new Map<string, number>();
    const approvedByProject = new Map<string, number>();
    const executedByProject = new Map<string, number>();
    const allProjects = new Set<string>();

    for (const draft of this.filteredGenerationDrafts()) {
      const projectName = draft.suiteContext.project?.name?.trim();
      if (!projectName) {
        continue;
      }

      generatedByProject.set(
        projectName,
        (generatedByProject.get(projectName) ?? 0) + draft.testCases.length,
      );
      allProjects.add(projectName);
    }

    for (const draft of this.filteredApprovedDrafts()) {
      const projectName = draft.suiteContext.project?.name?.trim();
      if (!projectName) {
        continue;
      }

      approvedByProject.set(
        projectName,
        (approvedByProject.get(projectName) ?? 0) + draft.testCases.length,
      );
      allProjects.add(projectName);
    }

    for (const run of this.filteredManualRuns()) {
      const projectName = run.project.name;
      executedByProject.set(
        projectName,
        (executedByProject.get(projectName) ?? 0) +
          (run.totals.total - run.totals.untested),
      );
      allProjects.add(projectName);
    }

    return [...allProjects]
      .map((projectName) => ({
        projectName,
        generated: generatedByProject.get(projectName) ?? 0,
        approved: approvedByProject.get(projectName) ?? 0,
        executed: executedByProject.get(projectName) ?? 0,
      }))
      .filter((row) => row.generated || row.approved || row.executed)
      .sort((left, right) => {
        const rightMax = Math.max(right.generated, right.approved, right.executed);
        const leftMax = Math.max(left.generated, left.approved, left.executed);
        if (rightMax !== leftMax) {
          return rightMax - leftMax;
        }

        return left.projectName.localeCompare(right.projectName);
      });
  });

  readonly performanceChartScrollable = computed(
    () => this.performanceBreakdownRows().length > 5,
  );

  readonly performanceChartContentWidth = computed<number | null>(() => {
    if (!this.performanceChartScrollable()) {
      return null;
    }

    return this.performanceBreakdownRows().length * 156;
  });

  readonly performanceChartStep = computed(() => {
    const maxValue = Math.max(
      ...this.performanceBreakdownRows().flatMap((row) => [
        row.generated,
        row.approved,
        row.executed,
      ]),
      0,
    );
    if (maxValue <= 0) {
      return 200;
    }

    const roughStep = maxValue / 5;
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;

    if (normalized <= 1) {
      return magnitude;
    }
    if (normalized <= 2) {
      return 2 * magnitude;
    }
    if (normalized <= 5) {
      return 5 * magnitude;
    }

    return 10 * magnitude;
  });

  readonly performanceChartMax = computed(() => this.performanceChartStep() * 5);

  readonly performanceChartTicks = computed(() =>
    Array.from({ length: 6 }, (_, index) => {
      const value = this.performanceChartMax() - this.performanceChartStep() * index;
      return {
        value,
        label: this.formatInteger(value),
        position: 100 - index * 20,
      };
    }),
  );

  readonly qaRoster = computed(() => {
    if (this.bootstrap()?.testerOptions?.length) {
      return [...(this.bootstrap()?.testerOptions ?? [])]
        .map((tester) => ({
          name: tester.name.trim(),
          roleTitle: tester.roleTitle,
        }))
        .filter((tester) => Boolean(tester.name))
        .sort((left, right) => left.name.localeCompare(right.name));
    }

    const roster = new Map<string, { name: string; roleTitle: string | null }>();

    for (const tester of this.bootstrap()?.testerOptions ?? []) {
      const name = tester.name.trim();
      if (!name) {
        continue;
      }

      roster.set(name.toLowerCase(), {
        name,
        roleTitle: tester.roleTitle,
      });
    }

    for (const draft of this.generationDrafts()) {
      const name = getDraftOwner(draft);
      if (name === 'Unassigned QA') {
        continue;
      }

      const key = name.toLowerCase();
      const current = roster.get(key);
      roster.set(key, {
        name,
        roleTitle: current?.roleTitle ?? draft.suiteContext.contributor?.roleTitle ?? null,
      });
    }

    for (const run of this.manualRuns()) {
      const name = getRunOwner(run);
      if (name === 'Unassigned QA') {
        continue;
      }

      const key = name.toLowerCase();
      const current = roster.get(key);
      roster.set(key, {
        name,
        roleTitle: current?.roleTitle ?? null,
      });
    }

    return [...roster.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  });

  readonly qaMetricsRows = computed<QaMetricsRow[]>(() => {
    const rows = new Map<string, QaMetricsRow & { projectNames: Set<string> }>();

    for (const member of this.qaRoster()) {
      rows.set(member.name.toLowerCase(), {
        name: member.name,
        roleTitle: member.roleTitle,
        totalProjects: 0,
        totalGenerations: 0,
        totalExecutions: 0,
        isActive: false,
        projectNames: new Set<string>(),
      });
    }

    for (const draft of this.filteredGenerationDrafts()) {
      const owner = getDraftOwner(draft);
      if (owner === 'Unassigned QA') {
        continue;
      }

      const key = owner.toLowerCase();
      const current = rows.get(key);
      if (!current) {
        continue;
      }

      current.totalGenerations += draft.testCases.length;
      if (draft.suiteContext.project?.name) {
        current.projectNames.add(draft.suiteContext.project.name);
      }
      rows.set(key, current);
    }

    for (const run of this.filteredManualRuns()) {
      const owner = getRunOwner(run);
      if (owner === 'Unassigned QA') {
        continue;
      }

      const key = owner.toLowerCase();
      const current = rows.get(key);
      if (!current) {
        continue;
      }

      if (run.status === 'completed') {
        current.totalExecutions += 1;
      }
      current.projectNames.add(run.project.name);
      current.isActive = true;
      rows.set(key, current);
    }

    return [...rows.values()]
      .map((row) => ({
        name: row.name,
        roleTitle: row.roleTitle,
        totalProjects: row.projectNames.size,
        totalGenerations: row.totalGenerations,
        totalExecutions: row.totalExecutions,
        isActive: row.totalGenerations > 0 || row.totalExecutions > 0,
      }))
      .sort((left, right) => {
        if (Number(right.isActive) !== Number(left.isActive)) {
          return Number(right.isActive) - Number(left.isActive);
        }
        if (right.totalExecutions !== left.totalExecutions) {
          return right.totalExecutions - left.totalExecutions;
        }
        if (right.totalGenerations !== left.totalGenerations) {
          return right.totalGenerations - left.totalGenerations;
        }

        return left.name.localeCompare(right.name);
      });
  });

  readonly qaMetricsGenerationMax = computed(() =>
    Math.max(...this.qaMetricsRows().map((row) => row.totalGenerations), 1),
  );

  readonly projectSyncRows = computed<ProjectSyncRow[]>(() => {
    const rows = new Map<
      string,
      ProjectSyncRow & {
        qaVolumes: Map<string, number>;
        pageVolumes: Map<string, Map<string, number>>;
      }
    >();

    for (const run of this.filteredManualRuns()) {
      const projectId = run.project.id;
      const owner = getRunOwner(run);
      const executedVolume =
        run.totals.passed + run.totals.failed + run.totals.skipped;
      const pageLabel = run.page?.name?.trim() || run.module?.name?.trim() || 'Project scope';
      const current = rows.get(projectId) ?? {
        projectId,
        projectName: run.project.name,
        qaLabel: owner,
        qaTooltip: '',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        untested: 0,
        qaVolumes: new Map<string, number>(),
        pageVolumes: new Map<string, Map<string, number>>(),
      };

      current.total += run.totals.total;
      current.passed += run.totals.passed;
      current.failed += run.totals.failed;
      current.skipped += run.totals.skipped;
      current.untested += run.totals.untested;
      current.qaVolumes.set(
        owner,
        (current.qaVolumes.get(owner) ?? 0) + executedVolume,
      );
      const pageOwners = current.pageVolumes.get(pageLabel) ?? new Map<string, number>();
      pageOwners.set(owner, (pageOwners.get(owner) ?? 0) + executedVolume);
      current.pageVolumes.set(pageLabel, pageOwners);

      rows.set(projectId, current);
    }

    return [...rows.values()]
      .map((row) => {
        const qaNames =
          [...row.qaVolumes.entries()]
            .sort((left, right) => {
              if (right[1] !== left[1]) {
                return right[1] - left[1];
              }

              return left[0].localeCompare(right[0]);
            })
            .map(([name]) => name);
        const qaTooltip = [...row.pageVolumes.entries()]
          .sort((left, right) => {
            const rightTotal = [...right[1].values()].reduce((sum, value) => sum + value, 0);
            const leftTotal = [...left[1].values()].reduce((sum, value) => sum + value, 0);
            if (rightTotal !== leftTotal) {
              return rightTotal - leftTotal;
            }

            return left[0].localeCompare(right[0]);
          })
          .map(([pageName, owners]) => {
            const ownerSummary = [...owners.entries()]
              .sort((left, right) => {
                if (right[1] !== left[1]) {
                  return right[1] - left[1];
                }

                return left[0].localeCompare(right[0]);
              })
              .map(([name, count]) => `${name} (${this.formatInteger(count)})`)
              .join(', ');

            return `${pageName}: ${ownerSummary}`;
          })
          .join('\n');

        return {
          projectId: row.projectId,
          projectName: row.projectName,
          qaLabel: qaNames.length ? qaNames.join(', ') : row.qaLabel,
          qaTooltip,
          total: row.total,
          passed: row.passed,
          failed: row.failed,
          skipped: row.skipped,
          untested: row.untested,
        };
      })
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return left.projectName.localeCompare(right.projectName);
      });
  });

  constructor() {
    void this.load();
  }

  formatDate(value: string | null) {
    return formatManualExecutionDate(value);
  }

  formatInteger(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
  }

  setDateFilter(value: ManualExecutionDateFilter) {
    this.dateFilter.set(value);
  }

  statusLabel(status: ManualExecutionRunSummary['status']) {
    return getManualExecutionRunStatusLabel(status);
  }

  statusTone(status: ManualExecutionRunSummary['status']) {
    return getManualExecutionRunBadgeStatus(status);
  }

  runOwner(run: Pick<ManualExecutionRunSummary, 'assignedTester' | 'createdBy'>) {
    return getRunOwner(run);
  }

  recentExecutionTimestamp(run: ManualExecutionRunSummary) {
    if (run.status === 'completed' && run.completedAt) {
      return `Completed ${this.formatDate(run.completedAt)}`;
    }

    if (run.status === 'inProgress') {
      return `Updated ${this.formatDate(run.updatedAt)}`;
    }

    return `Created ${this.formatDate(run.createdAt)}`;
  }

  recentExecutionActionLabel(run: ManualExecutionRunSummary) {
    return run.status === 'completed' ? 'View Report' : 'Open Run';
  }

  recentExecutionActionLink(run: ManualExecutionRunSummary) {
    return run.status === 'completed'
      ? ['/manual-execution/test-execution', run.id, 'report']
      : ['/manual-execution/test-execution', run.id];
  }

  qaInitials(label: string) {
    return label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  performanceBarHeight(value: number) {
    if (!value) {
      return 0;
    }

    return (value / this.performanceChartMax()) * 100;
  }

  performanceTooltip(
    row: PerformanceBreakdownRow,
    metric: 'generated' | 'approved' | 'executed',
  ) {
    return `${row.projectName}: ${this.formatInteger(row[metric])} ${metric} cases`;
  }

  projectSyncSegmentWidth(
    value: number,
    row: Pick<ProjectSyncRow, 'total'>,
  ) {
    if (!value || !row.total) {
      return 0;
    }

    return (value / row.total) * 100;
  }

  projectSyncTooltip(
    row: ProjectSyncRow,
    metric: 'passed' | 'failed' | 'skipped',
  ) {
    return `${row.projectName}: ${this.formatInteger(row[metric])} ${metric} cases out of ${this.formatInteger(row.total)} total`;
  }

  qaMetricsGenerationWidth(value: number) {
    if (!value) {
      return 0;
    }

    return Math.max(10, (value / this.qaMetricsGenerationMax()) * 100);
  }

  private async load() {
    this.loading.set(true);

    try {
      const [summary, bootstrap, manualRuns, generationDrafts] = await Promise.all([
        firstValueFrom(this.api.getDashboard()),
        firstValueFrom(this.api.getManualExecutionBootstrap()),
        loadAllManualExecutionRuns(this.api),
        loadAllGenerationDrafts(this.api),
      ]);

      this.summary.set(summary);
      this.bootstrap.set(bootstrap);
      this.manualRuns.set(manualRuns);
      this.generationDrafts.set(generationDrafts);
      this.loading.set(false);
    } catch {
      this.notifications.error('Unable to load the command dashboard.');
      this.loading.set(false);
    }
  }
}
