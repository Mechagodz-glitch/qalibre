import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import type {
  ApprovedExecutionSuite,
  ManualExecutionBootstrap,
  ManualExecutionRunSummary,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import {
  buildManualExecutionConicGradient,
  formatManualExecutionDate,
  getManualExecutionProgressWidth,
  getManualExecutionRunBadgeStatus,
  getManualExecutionRunStatusLabel,
  loadAllManualExecutionRuns,
  manualExecutionDateFilterOptions,
  matchesManualExecutionDateFilter,
  type ManualExecutionDateFilter,
} from './manual-execution.utils';

type DashboardDonutSegment = {
  label: string;
  value: number;
  color: string;
};

type DashboardProjectOption = {
  id: string;
  name: string;
};

type DashboardProjectComparisonRow = {
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
  totalLabel: string;
  runs: number;
  passed: number;
  failed: number;
  total: number;
};

function getManualExecutionRunOwner(
  run: Pick<ManualExecutionRunSummary, 'assignedTester' | 'createdBy'>,
) {
  return run.assignedTester?.trim() || run.createdBy || 'Unassigned QA';
}

@Component({
  selector: 'app-manual-execution-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manual-execution-dashboard-page.component.html',
  styleUrl: './manual-execution-dashboard-page.component.scss',
})
export class ManualExecutionDashboardPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  private suiteRequestVersion = 0;

  readonly loading = signal(true);
  readonly bootstrap = signal<ManualExecutionBootstrap | null>(null);
  readonly runs = signal<ManualExecutionRunSummary[]>([]);
  readonly suites = signal<ApprovedExecutionSuite[]>([]);
  readonly projectFilter = signal('all');
  readonly qaEngineerFilter = signal('all');
  readonly dateFilter = signal<ManualExecutionDateFilter>('all');

  readonly dateFilterOptions = manualExecutionDateFilterOptions;
  readonly projects = computed(() => this.bootstrap()?.projectHierarchy ?? []);
  readonly dashboardProjects = computed<DashboardProjectOption[]>(() => {
    const projects = new Map<string, DashboardProjectOption>();

    for (const run of this.runs()) {
      if (!projects.has(run.project.id)) {
        projects.set(run.project.id, {
          id: run.project.id,
          name: run.project.name,
        });
      }
    }

    return [...projects.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  });
  readonly selectedProjectName = computed(() => {
    const projectId = this.projectFilter();
    if (projectId === 'all') {
      return 'All projects';
    }

    return this.dashboardProjects().find((project) => project.id === projectId)?.name ?? 'Selected project';
  });
  readonly scopedRuns = computed(() => {
    const projectId = this.projectFilter();
    const dateFilter = this.dateFilter();

    return this.runs().filter((run) => {
      if (projectId !== 'all' && run.project.id !== projectId) {
        return false;
      }

      return matchesManualExecutionDateFilter(run.createdAt, dateFilter);
    });
  });
  readonly qaEngineerOptions = computed(() =>
    [...new Set(this.scopedRuns().map((run) => getManualExecutionRunOwner(run)))]
      .sort((left, right) => left.localeCompare(right)),
  );
  readonly filteredRuns = computed(() => {
    const qaEngineer = this.qaEngineerFilter();

    return this.scopedRuns().filter((run) => {
      if (qaEngineer === 'all') {
        return true;
      }

      return getManualExecutionRunOwner(run) === qaEngineer;
    });
  });
  readonly dashboardMetrics = computed(() => {
    const filteredRuns = this.filteredRuns();
    return {
      approvedSuites:
        this.projectFilter() === 'all'
          ? this.suites().length ||
            this.bootstrap()?.summary.approvedSuiteCount ||
            0
          : this.suites().length,
      inProgressRuns: filteredRuns.filter((run) => run.status !== 'completed')
        .length,
      completedRuns: filteredRuns.filter((run) => run.status === 'completed')
        .length,
      executedCases: filteredRuns.reduce(
        (total, run) => total + (run.totals.total - run.totals.untested),
        0,
      ),
    };
  });
  readonly runStatusBreakdown = computed<DashboardDonutSegment[]>(() => {
    const filteredRuns = this.filteredRuns();
    return [
      {
        label: 'Pending',
        value: filteredRuns.filter((run) => run.status === 'draft').length,
        color: '#4f80b8',
      },
      {
        label: 'In progress',
        value: filteredRuns.filter((run) => run.status === 'inProgress').length,
        color: '#0b5d63',
      },
      {
        label: 'Completed',
        value: filteredRuns.filter((run) => run.status === 'completed').length,
        color: '#0b8a57',
      },
    ];
  });
  readonly runStatusGradient = computed(() =>
    buildManualExecutionConicGradient(this.runStatusBreakdown()),
  );
  readonly executionOutcomeBreakdown = computed<DashboardDonutSegment[]>(() => {
    const totals = this.filteredRuns().reduce(
      (aggregate, run) => ({
        passed: aggregate.passed + run.totals.passed,
        failed: aggregate.failed + run.totals.failed,
        skipped: aggregate.skipped + run.totals.skipped,
        untested: aggregate.untested + run.totals.untested,
      }),
      { passed: 0, failed: 0, skipped: 0, untested: 0 },
    );

    return [
      { label: 'Passed', value: totals.passed, color: '#0b8a57' },
      { label: 'Failed', value: totals.failed, color: '#c63c56' },
      { label: 'Skipped', value: totals.skipped, color: '#d59a22' },
      { label: 'Untested', value: totals.untested, color: '#7a90a0' },
    ];
  });
  readonly executionOutcomeGradient = computed(() =>
    buildManualExecutionConicGradient(this.executionOutcomeBreakdown()),
  );
  readonly completedReportRuns = computed(() =>
    this.filteredRuns()
      .filter((run) => run.status === 'completed')
      .sort((left, right) =>
        String(right.completedAt ?? '').localeCompare(
          String(left.completedAt ?? ''),
        ),
      ),
  );
  readonly projectComparisonRows = computed<DashboardProjectComparisonRow[]>(() => {
    if (this.projectFilter() !== 'all') {
      return this.filteredRuns()
        .filter((run) => run.project.id === this.projectFilter())
        .map((run) => ({
          id: run.id,
          primaryLabel: run.name,
          secondaryLabel:
            [run.page?.name ?? '', run.feature?.name ?? '']
              .filter(Boolean)
              .join(' / ') || run.module?.name || run.project.name,
          totalLabel: `${run.totals.passed + run.totals.failed} total`,
          runs: 1,
          passed: run.totals.passed,
          failed: run.totals.failed,
          total: run.totals.passed + run.totals.failed,
        }))
        .filter((row) => row.total > 0)
        .sort((left, right) => {
          if (right.total !== left.total) {
            return right.total - left.total;
          }

          return left.primaryLabel.localeCompare(right.primaryLabel);
        });
    }

    const rows = new Map<string, DashboardProjectComparisonRow>();

    for (const run of this.filteredRuns()) {
      const current = rows.get(run.project.id) ?? {
        id: run.project.id,
        primaryLabel: run.project.name,
        secondaryLabel: '0 runs',
        totalLabel: '0 total',
        runs: 0,
        passed: 0,
        failed: 0,
        total: 0,
      };

      current.runs += 1;
      current.secondaryLabel = `${current.runs} run${current.runs === 1 ? '' : 's'}`;
      current.passed += run.totals.passed;
      current.failed += run.totals.failed;
      current.total = current.passed + current.failed;
      current.totalLabel = `${current.total} total`;
      rows.set(run.project.id, current);
    }

    return [...rows.values()]
      .filter((row) => row.total > 0)
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return left.primaryLabel.localeCompare(right.primaryLabel);
      });
  });
  readonly projectComparisonMaxValue = computed(() => {
    return Math.max(
      ...this.projectComparisonRows().map((row) => row.total),
      1,
    );
  });

  constructor() {
    void this.loadWorkspace();
  }

  formatDate(value: string | null) {
    return formatManualExecutionDate(value);
  }

  formatRunLocation(
    run: Pick<ManualExecutionRunSummary, 'module' | 'page' | 'feature'>,
  ) {
    return [run.module?.name ?? '', run.page?.name ?? '', run.feature?.name ?? '']
      .filter(Boolean)
      .join(' / ');
  }

  statusLabel(status: ManualExecutionRunSummary['status']) {
    return getManualExecutionRunStatusLabel(status);
  }

  statusTone(status: ManualExecutionRunSummary['status']) {
    return getManualExecutionRunBadgeStatus(status);
  }

  progressWidth(run: ManualExecutionRunSummary) {
    return getManualExecutionProgressWidth(run);
  }

  setProjectFilter(projectId: string) {
    this.projectFilter.set(projectId);
    this.syncQaEngineerFilter();
    void this.loadApprovedSuites(projectId);
  }

  setQaEngineerFilter(value: string) {
    this.qaEngineerFilter.set(value);
  }

  setDateFilter(value: ManualExecutionDateFilter) {
    this.dateFilter.set(value);
    this.syncQaEngineerFilter();
  }

  openCreatePage() {
    void this.router.navigate(['/manual-execution/test-run'], {
      queryParams:
        this.projectFilter() !== 'all'
          ? { projectId: this.projectFilter() }
          : {},
    });
  }

  openExecutionPage() {
    void this.router.navigate(['/manual-execution/test-execution']);
  }

  openReport(runId: string) {
    void this.router.navigate([
      '/manual-execution/test-execution',
      runId,
      'report',
    ]);
  }

  projectComparisonStackWidth(total: number) {
    if (!total) {
      return 0;
    }

    return Math.max(
      10,
      (total / this.projectComparisonMaxValue()) * 100,
    );
  }

  projectComparisonSegmentWidth(value: number, total: number) {
    if (!value || !total) {
      return 0;
    }

    return (value / total) * 100;
  }

  projectComparisonTooltip(
    row: DashboardProjectComparisonRow,
    metric: 'passed' | 'failed',
  ) {
    const value = metric === 'passed' ? row.passed : row.failed;
    return `${row.primaryLabel}: ${value} ${metric} cases out of ${row.total} total`;
  }

  private async loadWorkspace() {
    this.loading.set(true);

    try {
      const [bootstrap, runs] = await Promise.all([
        firstValueFrom(this.api.getManualExecutionBootstrap()),
        loadAllManualExecutionRuns(this.api),
      ]);
      this.bootstrap.set(bootstrap);
      this.runs.set(runs);
      this.syncQaEngineerFilter();
      await this.loadApprovedSuites('all');
      this.loading.set(false);
    } catch {
      this.notifications.error('Unable to load the execution dashboard.');
      this.loading.set(false);
    }
  }

  private async loadApprovedSuites(projectId: string) {
    const currentVersion = ++this.suiteRequestVersion;

    try {
      const projects = this.projects();
      const suites =
        projectId === 'all'
          ? (
              await Promise.all(
                projects.map(async (project) => {
                  const response = await firstValueFrom(
                    this.api.listApprovedExecutionSuites({
                      projectId: project.id,
                    }),
                  );
                  return response.items;
                }),
              )
            ).flat()
          : (
              await firstValueFrom(
                this.api.listApprovedExecutionSuites({
                  projectId,
                }),
              )
            ).items;

      if (currentVersion !== this.suiteRequestVersion) {
        return;
      }

      this.suites.set(suites);
    } catch {
      if (currentVersion === this.suiteRequestVersion) {
        this.notifications.error(
          'Unable to load approved suites for this scope.',
        );
      }
    }
  }

  private syncQaEngineerFilter() {
    const qaEngineerFilter = this.qaEngineerFilter();
    if (
      qaEngineerFilter !== 'all' &&
      !this.qaEngineerOptions().includes(qaEngineerFilter)
    ) {
      this.qaEngineerFilter.set('all');
    }
  }
}
