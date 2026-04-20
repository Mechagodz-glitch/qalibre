import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import type { TestGenerationRunDetail, TestGenerationRunSummary } from './models';
import { WorkbenchApiService } from './workbench-api.service';

const STORAGE_KEY = 'qa-workbench-generation-runs';

@Injectable({ providedIn: 'root' })
export class GenerationMonitorService {
  private readonly api = inject(WorkbenchApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly trackedRuns = signal<TestGenerationRunSummary[]>(this.restoreRuns());
  readonly runDetails = signal<Record<string, TestGenerationRunDetail>>({});
  readonly pendingRunIds = signal<string[]>([]);
  readonly activeRuns = computed(() => {
    const pendingIds = new Set(this.pendingRunIds());
    return this.trackedRuns().filter((run) => run.status === 'pending' && pendingIds.has(run.id));
  });
  readonly activeCount = computed(() => this.activeRuns().length);

  private refreshInFlight = false;

  constructor() {
    window.setInterval(() => {
      if (!this.shouldPollPendingRuns()) {
        return;
      }
      void this.refresh();
    }, 2_000);

    if (this.shouldPollPendingRuns()) {
      void this.refresh();
    }
  }

  trackRun(run: TestGenerationRunSummary | TestGenerationRunDetail) {
    this.pendingRunIds.update((ids) =>
      run.status === 'pending'
        ? Array.from(new Set([...ids, run.id]))
        : ids.filter((id) => id !== run.id),
    );

    this.runDetails.update((details) => {
      if ('requestPayload' in run) {
        return {
          ...details,
          [run.id]: run,
        };
      }

      if (!details[run.id]) {
        return details;
      }

      return {
        ...details,
        [run.id]: {
          ...details[run.id],
          ...run,
        },
      };
    });

    this.trackedRuns.update((runs) => {
      const next = [run, ...runs.filter((item) => item.id !== run.id)].slice(0, 12);
      this.persistRuns(next);
      return next;
    });

    void this.refresh();
  }

  dismissRun(runId: string) {
    this.pendingRunIds.update((ids) => ids.filter((id) => id !== runId));

    this.runDetails.update((details) => {
      const next = { ...details };
      delete next[runId];
      return next;
    });

    this.trackedRuns.update((runs) => {
      const next = runs.filter((run) => run.id !== runId);
      this.persistRuns(next);
      return next;
    });
  }

  getRun(runId: string) {
    return this.trackedRuns().find((run) => run.id === runId) ?? null;
  }

  getRunDetail(runId: string) {
    return this.runDetails()[runId] ?? null;
  }

  private async refresh() {
    if (this.refreshInFlight) {
      return;
    }

    if (!this.shouldPollPendingRuns()) {
      this.pendingRunIds.set([]);
      return;
    }

    this.refreshInFlight = true;

    try {
      const trackedPendingRuns = this.trackedRuns().filter((run) => run.status === 'pending');
      let serverPendingRuns: TestGenerationRunSummary[] = [];

      try {
        const pendingResult = await firstValueFrom(
          this.api.listGenerationRuns({ page: 1, pageSize: 20, status: 'pending' }),
        );
        serverPendingRuns = pendingResult.items;
      } catch {
        serverPendingRuns = [];
      }

      const serverPendingIds = serverPendingRuns.map((run) => run.id);
      this.pendingRunIds.set(serverPendingIds);

      this.trackedRuns.update((runs) => {
        const merged = [
          ...serverPendingRuns,
          ...runs.filter((run) => !serverPendingIds.includes(run.id)),
        ].slice(0, 12);
        this.persistRuns(merged);
        return merged;
      });

      const refreshTargets = [
        ...serverPendingRuns,
        ...trackedPendingRuns.filter((run) => !serverPendingIds.includes(run.id)),
      ].filter(
        (run, index, items) => items.findIndex((candidate) => candidate.id === run.id) === index,
      );

      if (!refreshTargets.length) {
        return;
      }

      const updates = await Promise.all(
        refreshTargets.map(async (run) => {
          try {
            const result = await firstValueFrom(this.api.getGenerationRun(run.id));
            return { previous: run, current: result.run };
          } catch {
            return { previous: run, current: null };
          }
        }),
      );

      for (const update of updates) {
        if (!update) {
          continue;
        }

        if (!update.current) {
          this.dismissRun(update.previous.id);
          continue;
        }

        this.handleUpdatedRun(update.previous, update.current);
      }
    } finally {
      this.refreshInFlight = false;
    }
  }

  private handleUpdatedRun(previous: TestGenerationRunSummary, updated: TestGenerationRunDetail) {
    this.pendingRunIds.update((ids) =>
      updated.status === 'pending'
        ? Array.from(new Set([...ids, updated.id]))
        : ids.filter((id) => id !== updated.id),
    );

    this.runDetails.update((details) => ({
      ...details,
      [updated.id]: updated,
    }));

    this.trackedRuns.update((runs) => {
      const next = runs.map((run) => (run.id === updated.id ? updated : run));
      this.persistRuns(next);
      return next;
    });

    if (previous.status === 'pending' && updated.status === 'completed' && updated.draftId) {
      const ref = this.snackBar.open(
        `${updated.title} is ready for review.`,
        'Open review',
        { duration: 9000, panelClass: ['snackbar-success'] },
      );
      ref.onAction().subscribe(() => {
        void this.router.navigate(['/test-generator/review'], {
          queryParams: { draftId: updated.draftId },
        });
      });
    }

    if (previous.status === 'pending' && updated.status === 'failed') {
      this.snackBar.open(`${updated.title} failed. Open Generation Runs for details.`, 'Dismiss', {
        duration: 9000,
        panelClass: ['snackbar-error'],
      });
    }
  }

  private restoreRuns() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as TestGenerationRunSummary[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persistRuns(runs: TestGenerationRunSummary[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  }

  private shouldPollPendingRuns() {
    return this.trackedRuns().some((run) => run.status === 'pending');
  }
}
