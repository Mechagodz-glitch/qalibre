import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { switchMap } from 'rxjs/operators';

import type {
  ManualExecutionCaseResult,
  ManualExecutionCaseStatus,
  ManualExecutionRunDetail,
  ManualExecutionRunSummary,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import {
  formatManualExecutionDate,
  formatManualExecutionRunScope,
  getManualExecutionRunStatusLabel,
  isManualExecutionRunCompleted,
} from './manual-execution.utils';

type CaseDraftBuffer = {
  comment: string;
  defectLink: string;
};

@Component({
  selector: 'app-manual-execution-run-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manual-execution-run-page.component.html',
  styleUrl: './manual-execution-run-page.component.scss',
})
export class ManualExecutionRunPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly completing = signal(false);
  readonly updatingCaseId = signal<string | null>(null);
  readonly run = signal<ManualExecutionRunDetail | null>(null);
  readonly selectedCaseId = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | ManualExecutionCaseStatus>('all');
  readonly suiteFilter = signal<'all' | string>('all');
  readonly severityFilter = signal<'all' | string>('all');
  readonly caseDrafts = signal<Record<string, CaseDraftBuffer>>({});

  readonly suiteOptions = computed(() => this.run()?.suites ?? []);
  readonly severityOptions = computed(() =>
    [...new Set((this.run()?.caseResults ?? []).map((caseResult) => caseResult.severity).filter(Boolean))].sort(),
  );
  readonly filteredCases = computed(() => {
    const currentRun = this.run();
    if (!currentRun) {
      return [];
    }

    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();
    const suiteId = this.suiteFilter();
    const severity = this.severityFilter();
    const suiteMap = new Map(currentRun.suites.map((suite) => [suite.id, suite.suiteTitle]));

    return currentRun.caseResults.filter((caseResult) => {
      if (status !== 'all' && caseResult.status !== status) {
        return false;
      }

      if (suiteId !== 'all' && caseResult.runSuiteId !== suiteId) {
        return false;
      }

      if (severity !== 'all' && caseResult.severity !== severity) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        caseResult.sourceCaseId,
        caseResult.title,
        caseResult.feature,
        caseResult.scenario,
        suiteMap.get(caseResult.runSuiteId) ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  });
  readonly canComplete = computed(() => {
    const run = this.run();
    return Boolean(run && run.status !== 'completed' && run.totals.untested === 0 && !this.completing());
  });
  readonly canViewReport = computed(() =>
    this.run() ? isManualExecutionRunCompleted(this.run()!) : false,
  );

  constructor() {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => this.api.getManualExecutionRun(params.get('runId') ?? '')),
      )
      .subscribe({
        next: (response) => {
          this.run.set(response.run);
          this.caseDrafts.set(
            Object.fromEntries(
              response.run.caseResults.map((caseResult) => [
                caseResult.id,
                {
                  comment: caseResult.comment ?? '',
                  defectLink: caseResult.defectLink ?? '',
                },
              ]),
            ),
          );
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load the manual execution run.');
          this.loading.set(false);
        },
      });
  }

  formatDate(value: string | null) {
    return formatManualExecutionDate(value);
  }

  formatScope(run: ManualExecutionRunDetail) {
    return formatManualExecutionRunScope(run);
  }

  toggleCase(caseId: string) {
    this.selectedCaseId.update((current) => (current === caseId ? null : caseId));
  }

  isExpanded(caseId: string) {
    return this.selectedCaseId() === caseId;
  }

  updateBuffer(caseId: string, field: keyof CaseDraftBuffer, value: string) {
    this.caseDrafts.update((drafts) => ({
      ...drafts,
      [caseId]: {
        ...(drafts[caseId] ?? { comment: '', defectLink: '' }),
        [field]: value,
      },
    }));
  }

  currentBuffer(caseId: string) {
    return this.caseDrafts()[caseId] ?? { comment: '', defectLink: '' };
  }

  statusClass(status: ManualExecutionCaseStatus) {
    return status;
  }

  statusLabel(status: ManualExecutionCaseStatus) {
    return status;
  }

  resultPillLabel(run: ManualExecutionRunSummary['status']) {
    return getManualExecutionRunStatusLabel(run);
  }

  snapshotSteps(caseResult: ManualExecutionCaseResult) {
    const steps = caseResult.caseSnapshot['steps'];
    if (!Array.isArray(steps)) {
      return [];
    }

    return steps
      .filter((step) => step && typeof step === 'object' && !Array.isArray(step))
      .map((step) => step as { step?: number; action?: string; expectedResult?: string });
  }

  snapshotPreconditions(caseResult: ManualExecutionCaseResult) {
    return this.snapshotStringList(caseResult.caseSnapshot['preconditions']);
  }

  snapshotTestData(caseResult: ManualExecutionCaseResult) {
    return this.snapshotStringList(caseResult.caseSnapshot['testData']);
  }

  snapshotLinkedTaxonomy(caseResult: ManualExecutionCaseResult) {
    return this.snapshotString(caseResult.caseSnapshot['linkedTaxonomy']);
  }

  snapshotSourceReviewStatus(caseResult: ManualExecutionCaseResult) {
    return this.snapshotString(caseResult.caseSnapshot['reviewStatus']) ?? 'approved';
  }

  snapshotTags(caseResult: ManualExecutionCaseResult) {
    return caseResult.tags.length ? caseResult.tags : this.snapshotStringList(caseResult.caseSnapshot['tags']);
  }

  snapshotSourceReferences(caseResult: ManualExecutionCaseResult) {
    return caseResult.sourceReferences.length
      ? caseResult.sourceReferences
      : this.snapshotStringList(caseResult.caseSnapshot['sourceReferences']);
  }

  automationCandidateLabel(caseResult: ManualExecutionCaseResult) {
    return caseResult.automationCandidate ? 'Yes' : 'No';
  }

  updateCaseStatus(caseResult: ManualExecutionCaseResult, status: ManualExecutionCaseStatus) {
    const currentRun = this.run();
    if (!currentRun || currentRun.status === 'completed') {
      return;
    }

    const buffer = this.currentBuffer(caseResult.id);
    this.updatingCaseId.set(caseResult.id);
    this.api
      .updateManualExecutionCaseResult(currentRun.id, caseResult.id, {
        status,
        comment: buffer.comment,
        defectLink: buffer.defectLink,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.run.update((current) => {
            if (!current || !response.caseResult) {
              return current;
            }

            return {
              ...current,
              ...response.run,
              suites: current.suites,
              caseResults: current.caseResults.map((entry) =>
                entry.id === response.caseResult!.id ? response.caseResult! : entry,
              ),
            };
          });
          this.updatingCaseId.set(null);
        },
        error: () => {
          this.notifications.error('Unable to update the testcase result.');
          this.updatingCaseId.set(null);
        },
      });
  }

  completeRun() {
    const currentRun = this.run();
    if (!currentRun || !this.canComplete()) {
      return;
    }

    this.completing.set(true);
    this.api
      .completeManualExecutionRun(currentRun.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.run.set(response.run);
          this.completing.set(false);
          this.notifications.success('Manual execution run marked as completed.');
        },
        error: () => {
          this.notifications.error('Unable to complete the run until every testcase is executed.');
          this.completing.set(false);
        },
      });
  }

  exportWorkbook() {
    const currentRun = this.run();
    if (!currentRun || currentRun.status !== 'completed') {
      return;
    }

    this.api
      .exportManualExecutionRun(currentRun.id, 'xlsx')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => this.downloadBlob(blob, `${currentRun.name.replace(/\s+/g, '-').toLowerCase()}-execution-report.xlsx`),
        error: () => this.notifications.error('Unable to export the execution workbook.'),
      });
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  private snapshotString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private snapshotStringList(value: unknown) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? '').trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(/\r?\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }
}
