import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';

import type { RefinementRunDetail } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { JsonPanelComponent } from '../../shared/components/json-panel.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

@Component({
  selector: 'app-refinement-run-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    EmptyStateComponent,
    JsonPanelComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  template: `
    @if (loading()) {
      <section class="centered"><mat-spinner diameter="40"></mat-spinner></section>
    } @else if (run()) {
      <section class="page-stack">
        <app-page-header
          [title]="run()!.itemTitle"
          description="Inspect the request payload, raw model response, parsed response, and final status for this refinement run."
          eyebrow="Refinement run detail"
        >
          <app-status-badge [status]="run()!.status" [label]="run()!.status"></app-status-badge>
          @if (run()!.draftId) {
            <a mat-button [routerLink]="['/refinement/queue']" [queryParams]="{ draftId: run()!.draftId }">Open draft</a>
          }
        </app-page-header>

        <mat-card>
          <mat-card-content class="run-meta">
            <div><span>Mode</span><strong>{{ run()!.mode }}</strong></div>
            <div><span>Model</span><strong>{{ run()!.model || 'Pending' }}</strong></div>
            <div><span>Correlation ID</span><strong>{{ run()!.correlationId }}</strong></div>
            <div><span>Created</span><strong>{{ run()!.createdAt | date: 'medium' }}</strong></div>
            @if (run()!.errorMessage) {
              <div class="error-banner">{{ run()!.errorMessage }}</div>
            }
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-content>
            <mat-tab-group>
              <mat-tab label="Request payload">
                <div class="panel-pad">
                  <app-json-panel [value]="pretty(run()!.requestPayload)"></app-json-panel>
                </div>
              </mat-tab>
              <mat-tab label="Raw response">
                <div class="panel-pad">
                  <app-json-panel [value]="pretty(run()!.rawResponse)"></app-json-panel>
                </div>
              </mat-tab>
              <mat-tab label="Parsed response">
                <div class="panel-pad">
                  <app-json-panel [value]="pretty(run()!.parsedResponse)"></app-json-panel>
                </div>
              </mat-tab>
            </mat-tab-group>
          </mat-card-content>
        </mat-card>
      </section>
    } @else {
      <app-empty-state title="Run not found" description="The requested refinement run could not be loaded." />
    }
  `,
  styles: [
    `
      .page-stack {
        display: grid;
        gap: 1.5rem;
      }

      .centered {
        display: grid;
        place-items: center;
        min-height: 18rem;
      }

      .run-meta {
        display: grid;
        gap: 0.85rem;
      }

      .run-meta div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }

      .run-meta span {
        color: #5a718d;
      }

      .panel-pad {
        padding-top: 1rem;
      }

      .error-banner {
        padding: 0.75rem 1rem;
        border-radius: 0.9rem;
        background: rgba(164, 40, 61, 0.1);
        color: #8a2436;
      }
    `,
  ],
})
export class RefinementRunDetailPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly run = signal<RefinementRunDetail | null>(null);
  readonly loading = signal(true);

  constructor() {
    const runId = this.route.snapshot.paramMap.get('runId') ?? '';
    this.api
      .getRun(runId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.run.set(response.run);
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load refinement run.');
          this.loading.set(false);
        },
      });
  }

  pretty(value: unknown) {
    return JSON.stringify(value, null, 2);
  }
}
