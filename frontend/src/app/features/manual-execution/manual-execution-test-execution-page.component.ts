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
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import type {
  ManualExecutionBootstrap,
  ManualExecutionRunSummary,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import {
  formatManualExecutionDate,
  formatManualExecutionRunScope,
  getManualExecutionProgressWidth,
  getManualExecutionRunBadgeStatus,
  getManualExecutionRunStatusLabel,
  isManualExecutionRunCompleted,
  loadAllManualExecutionRuns,
  manualExecutionDateFilterOptions,
  matchesManualExecutionDateFilter,
  type ManualExecutionDateFilter,
} from './manual-execution.utils';

@Component({
  selector: 'app-manual-execution-test-execution-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manual-execution-test-execution-page.component.html',
  styleUrl: './manual-execution-test-execution-page.component.scss',
})
export class ManualExecutionTestExecutionPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly bootstrap = signal<ManualExecutionBootstrap | null>(null);
  readonly runs = signal<ManualExecutionRunSummary[]>([]);
  readonly projectFilter = signal('all');
  readonly statusFilter = signal<'all' | ManualExecutionRunSummary['status']>('all');
  readonly dateFilter = signal<ManualExecutionDateFilter>('all');
  readonly searchTerm = signal('');
  readonly deletingRunIds = signal<Record<string, boolean>>({});

  readonly dateFilterOptions = manualExecutionDateFilterOptions;
  readonly projects = computed(() => this.bootstrap()?.projectHierarchy ?? []);
  readonly filteredRuns = computed(() => {
    const projectId = this.projectFilter();
    const status = this.statusFilter();
    const dateFilter = this.dateFilter();
    const search = this.searchTerm().trim().toLowerCase();

    return this.runs().filter((run) => {
      if (projectId !== 'all' && run.project.id !== projectId) {
        return false;
      }

      if (status !== 'all' && run.status !== status) {
        return false;
      }

      if (!matchesManualExecutionDateFilter(run.createdAt, dateFilter)) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        run.name,
        formatManualExecutionRunScope(run),
        run.assignedTester ?? '',
        run.createdBy,
        run.environment ?? '',
        run.buildVersion ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  });
  readonly summaryMetrics = computed(() => {
    const filteredRuns = this.filteredRuns();
    return {
      totalRuns: filteredRuns.length,
      activeRuns: filteredRuns.filter((run) => run.status !== 'completed').length,
      completedRuns: filteredRuns.filter((run) => run.status === 'completed').length,
      executedCases: filteredRuns.reduce(
        (total, run) => total + (run.totals.total - run.totals.untested),
        0,
      ),
    };
  });

  constructor() {
    void this.loadWorkspace();
  }

  formatDate(value: string | null) {
    return formatManualExecutionDate(value);
  }

  formatScope(run: ManualExecutionRunSummary) {
    return formatManualExecutionRunScope(run);
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

  isCompleted(run: ManualExecutionRunSummary) {
    return isManualExecutionRunCompleted(run);
  }

  openRun(runId: string) {
    void this.router.navigate(['/manual-execution/test-execution', runId]);
  }

  openReport(runId: string) {
    void this.router.navigate([
      '/manual-execution/test-execution',
      runId,
      'report',
    ]);
  }

  async deleteRun(run: ManualExecutionRunSummary, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.deletingRunIds()[run.id]) {
      return;
    }

    const confirmed = window.confirm(`Delete "${run.name}"? This removes the run and its execution results.`);
    if (!confirmed) {
      return;
    }

    this.deletingRunIds.update((current) => ({
      ...current,
      [run.id]: true,
    }));

    try {
      await firstValueFrom(this.api.deleteManualExecutionRun(run.id));
      this.runs.update((current) => current.filter((item) => item.id !== run.id));
      this.notifications.success('Test run deleted.');
    } catch {
      this.notifications.error('Unable to delete the selected test run.');
    } finally {
      this.deletingRunIds.update((current) => {
        const next = { ...current };
        delete next[run.id];
        return next;
      });
    }
  }

  stopEvent(event: Event) {
    event.stopPropagation();
  }

  onRunCardKeydown(event: KeyboardEvent, runId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.openRun(runId);
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
    } catch {
      this.notifications.error('Unable to load the test execution workspace.');
    } finally {
      this.loading.set(false);
    }
  }
}
