import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, interval } from 'rxjs';

import type { TestGenerationRunDetail, TestGenerationRunSummary } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { JsonPanelComponent } from '../../shared/components/json-panel.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

@Component({
  selector: 'app-test-generation-run-list-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    JsonPanelComponent,
    PageHeaderComponent,
  ],
  template: `
    <section class="runs-page">
      @if (loading()) {
        <section class="centered">
          <mat-spinner diameter="44"></mat-spinner>
        </section>
      } @else if (!runs().length) {
        <app-empty-state
          [title]="searchTerm() ? 'No runs match your search' : 'No generation runs yet'"
          [description]="
            searchTerm()
              ? 'Try a different keyword or clear the search to return to the full run ledger.'
              : 'Launch the generator to create the first monitored run.'
          "
        />
      } @else {
        <app-page-header
          title="Test Generation History"
          eyebrow="Generation history"
          description="Monitor active runs, inspect payloads, and work through draft generation from one streamlined workspace."
        >
          <button mat-stroked-button class="history-refresh-button" type="button" (click)="loadRuns()">
            Refresh history
          </button>
          <a mat-flat-button class="history-create-button" routerLink="/test-generator">Create suite</a>
        </app-page-header>

        <section class="metric-grid">
          <mat-card class="metric-card metric-card--sky">
            <mat-card-content>
              <span>Runs In View</span>
              <strong>{{ pageMetrics().visibleRuns }}</strong>
              <p>History rows shown on the current page.</p>
            </mat-card-content>
          </mat-card>

          <mat-card class="metric-card metric-card--mint">
            <mat-card-content>
              <span>Active Runs</span>
              <strong>{{ pageMetrics().activeRuns }}</strong>
              <p>Queued or actively generating right now.</p>
            </mat-card-content>
          </mat-card>

          <mat-card class="metric-card metric-card--slate">
            <mat-card-content>
              <span>Completed</span>
              <strong>{{ pageMetrics().completedRuns }}</strong>
              <p>Drafts ready for review or export.</p>
            </mat-card-content>
          </mat-card>

          <mat-card class="metric-card metric-card--warm">
            <mat-card-content>
              <span>Interrupted</span>
              <strong>{{ pageMetrics().interruptedRuns }}</strong>
              <p>Failed or user-stopped runs needing attention.</p>
            </mat-card-content>
          </mat-card>
        </section>

        <mat-card class="table-shell">
          <mat-card-content>
            <div class="table-toolbar">
              <div>
                <p class="table-eyebrow">Run ledger</p>
                <h2>Generation run inventory</h2>
              </div>

              <label class="toolbar-search table-search" aria-label="Search runs">
                <span class="field-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
                    />
                  </svg>
                </span>
                <input [formControl]="searchControl" placeholder="Search runs" aria-label="Search runs" />
              </label>

              <div class="table-toolbar__meta">
                <span>{{ totalRuns() }} total runs</span>
                <span>Page {{ currentPage() }} of {{ totalPages() }}</span>
              </div>
            </div>

            <div class="table-scroll">
              <table class="runs-table">
                <colgroup>
                  <col class="col-title" />
                  <col class="col-status" />
                  <col class="col-created" />
                  <col class="col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (run of runs(); track run.id) {
                    <tr class="run-row" [class.selected]="selectedRun()?.id === run.id" (click)="selectRun(run)">
                      <td>
                        <div class="title-cell">
                          <span
                            class="run-icon"
                            [class.pending]="statusTone(run) === 'pending'"
                            [class.completed]="statusTone(run) === 'completed'"
                            [class.failed]="statusTone(run) === 'failed'"
                            [class.stopped]="statusTone(run) === 'stopped'"
                          >
                            {{ runIcon(run) }}
                          </span>

                            <div class="title-copy">
                              <div class="title-heading">
                              <strong [attr.title]="run.title">{{ run.title }}</strong>
                              </div>
                            <span>{{ run.suiteContext.path || 'Unassigned suite path' }}</span>
                            <small>ID: {{ shortRunId(run.id) }}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div class="status-cell" [class]="'tone-' + statusTone(run)">
                          <span class="status-pill" [class]="'tone-' + statusTone(run)">{{ statusLabel(run) }}</span>
                          @if (run.progress) {
                            <div class="status-meta">
                              <strong>{{ run.progress.generatedCaseCount }} cases</strong>
                              <span>{{ run.progress.completedBatches }}/{{ run.progress.totalBatches || 0 }} batches</span>
                            </div>
                          } @else {
                            <div class="status-meta">
                              <strong>{{ statusHint(run) }}</strong>
                            </div>
                          }
                        </div>
                      </td>

                      <td>
                        <div class="created-cell">
                          <strong>{{ absoluteCreated(run.createdAt) }}</strong>
                          <span>{{ displayCreatedBy(run) }}</span>
                        </div>
                      </td>

                      <td>
                        <div class="actions-cell" (click)="$event.stopPropagation()">
                          <button
                            type="button"
                            class="kebab-button"
                            aria-label="Open run actions"
                            [attr.aria-expanded]="openActionRunId() === run.id"
                            (click)="toggleRunActions(run.id, $event)"
                          >
                            ⋮
                          </button>

                          @if (openActionRunId() === run.id) {
                            <div class="action-popover" [class.upward]="shouldOpenActionsUp(run.id)" (click)="$event.stopPropagation()">
                              <button type="button" class="action-chip action-chip-inspect" (click)="inspectRun(run, $event)">
                                Inspect
                              </button>

                              @if (run.draftId) {
                                <a
                                  class="action-chip action-chip-draft"
                                  [routerLink]="['/test-generator/review']"
                                  [queryParams]="{ draftId: run.draftId }"
                                  (click)="closeRunActions()"
                                >
                                  Open draft
                                </a>
                              }

                              @if (run.status === 'failed') {
                                <button type="button" class="action-chip action-chip-regenerate" (click)="regenerate(run)">
                                  Regenerate
                                </button>
                              }

                              @if (run.status === 'pending') {
                                <button type="button" class="action-chip action-chip-stop" (click)="stopRun(run, $event)">
                                  Stop generation
                                </button>
                              }
                            </div>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <footer class="table-pagination">
              <span>Showing {{ pageStart() }}-{{ pageEnd() }} of {{ totalRuns() }} runs</span>

              <div class="pagination-controls">
                <button type="button" class="page-button" [disabled]="currentPage() === 1" (click)="goToPage(currentPage() - 1)">
                  Prev
                </button>

                @for (page of visiblePages(); track page) {
                  <button
                    type="button"
                    class="page-button"
                    [class.active]="page === currentPage()"
                    (click)="goToPage(page)"
                  >
                    {{ page }}
                  </button>
                }

                <button
                  type="button"
                  class="page-button"
                  [disabled]="currentPage() === totalPages()"
                  (click)="goToPage(currentPage() + 1)"
                >
                  Next
                </button>
              </div>
            </footer>
          </mat-card-content>
        </mat-card>

        @if (selectedRun()) {
          <section class="detail-scroll">
            <section class="detail-shell">
              <header class="detail-hero">
                <div class="detail-copy">
                  <div class="detail-breadcrumb">Test Suites > {{ shortRunId(selectedRun()!.id) }} Detail</div>
                  <div class="detail-title-row">
                    <h2>{{ selectedRun()!.title }}</h2>
                    <span class="detail-status" [class]="'status-' + statusTone(selectedRun()!)">{{ statusLabel(selectedRun()!) }}</span>
                  </div>
                  <div class="detail-meta">
                    <span>Triggered by: {{ displayCreatedBy(selectedRun()!) }}</span>
                    <span>Generated: {{ absoluteCreated(selectedRun()!.createdAt) }}</span>
                    <span>UID: {{ shortRunId(selectedRun()!.id) }}</span>
                  </div>
                </div>

                <div class="detail-actions">
                  @if (selectedRun()!.status === 'pending') {
                    <button mat-stroked-button color="warn" type="button" (click)="stopRun(selectedRun()!)">Stop generation</button>
                  } @else {
                    <button mat-stroked-button type="button" (click)="regenerate(selectedRun()!)">Re-run generation</button>
                  }
                  <div class="health-index">
                    <span>Health Index</span>
                    <strong>{{ healthForRun(selectedRun()!) }}</strong>
                  </div>
                </div>
              </header>

              <section class="detail-cards">
                <mat-card class="detail-card execution-card">
                  <mat-card-content>
                    <h3>Execution Metrics</h3>
                    <div class="execution-line">
                      <div class="execution-chip">
                        <span>Gen time</span>
                        <strong>{{ durationLabel(selectedRun()!) }}</strong>
                      </div>
                      <div class="execution-chip">
                        <span>Cases</span>
                        <strong>{{ selectedRun()!.progress?.generatedCaseCount ?? 0 }}</strong>
                      </div>
                      <div class="execution-chip">
                        <span>Phase</span>
                        <strong>{{ selectedRun()!.progress?.phase || statusLabel(selectedRun()!) }}</strong>
                      </div>
                      <div class="execution-chip">
                        <span>Batches</span>
                        <strong>{{ selectedRun()!.progress?.completedBatches ?? 0 }}/{{ selectedRun()!.progress?.totalBatches || 0 }}</strong>
                      </div>
                    </div>
                  </mat-card-content>
                </mat-card>
              </section>

              <section class="detail-panels">
                <app-json-panel title="Request Payload" [value]="pretty(selectedRun()!.requestPayload)"></app-json-panel>
                <app-json-panel title="Source Summary" [value]="pretty(selectedRun()!.sourceSummary)"></app-json-panel>
                <app-json-panel title="Parsed Response" [value]="pretty(selectedRun()!.parsedResponse)"></app-json-panel>
                <app-json-panel title="Raw Response" [value]="pretty(selectedRun()!.rawResponse)"></app-json-panel>
              </section>
            </section>
          </section>
        }
      }
    </section>
  `,
  styles: [
    `
      .runs-page {
        display: grid;
        gap: 1.2rem;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.9rem;
      }

      .metric-card,
      .table-shell,
      .detail-shell,
      .detail-card {
        border: 1px solid rgba(13, 63, 75, 0.08);
        box-shadow: 0 16px 32px rgba(13, 63, 75, 0.05);
      }

      .metric-card {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 251, 255, 0.96)) !important;
      }

      .metric-card--sky {
        background: linear-gradient(180deg, rgba(236, 246, 255, 0.98), rgba(255, 255, 255, 0.95)) !important;
      }

      .metric-card--mint {
        background: linear-gradient(180deg, rgba(238, 250, 242, 0.98), rgba(255, 255, 255, 0.95)) !important;
      }

      .metric-card--slate {
        background: linear-gradient(180deg, rgba(246, 250, 253, 0.98), rgba(255, 255, 255, 0.95)) !important;
      }

      .metric-card--warm {
        background: linear-gradient(180deg, rgba(255, 249, 238, 0.98), rgba(255, 255, 255, 0.95)) !important;
      }

      .metric-card mat-card-content {
        display: grid;
        gap: 0.38rem;
        padding: 1rem 1.05rem !important;
      }

      .metric-card span {
        color: #647b89;
        font-size: 0.78rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .metric-card strong {
        font-size: clamp(1.7rem, 2vw, 2.35rem);
        color: #0d3f4b;
        line-height: 1;
      }

      .metric-card p {
        margin: 0;
        color: #5d7684;
      }

      .centered {
        display: grid;
        place-items: center;
        min-height: 18rem;
      }

      .detail-hero {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 1rem;
      }

      .detail-breadcrumb {
        margin: 0;
        color: #67818d;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .detail-copy h2 {
        margin: 0;
        color: #112f3d;
        line-height: 1.08;
      }

      .detail-meta span {
        color: #506874;
        font-size: 0.98rem;
        line-height: 1.55;
        margin: 0;
      }

      .detail-actions {
        display: flex;
        gap: 0.75rem;
        align-items: start;
        flex-wrap: wrap;
      }

      .history-refresh-button,
      .history-create-button {
        min-height: 2.85rem;
        min-width: 10.75rem;
        padding-inline: 1rem;
        border-radius: 0.9rem !important;
        font-weight: 700;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.75),
          0 12px 22px rgba(14, 52, 63, 0.08);
      }

      .history-refresh-button {
        border-color: rgba(193, 135, 45, 0.2) !important;
        background: linear-gradient(
          180deg,
          rgba(255, 239, 210, 0.96),
          rgba(255, 246, 227, 0.94)
        ) !important;
        color: #8b5b11 !important;
      }

      .history-create-button {
        background: linear-gradient(
          180deg,
          rgba(216, 247, 217, 0.95),
          rgba(234, 250, 232, 0.92)
        ) !important;
        color: #25713e !important;
      }

      .table-shell,
      .detail-card {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 251, 255, 0.95)) !important;
        overflow: visible;
      }

      .table-shell mat-card-content {
        display: grid;
        gap: 1rem;
        padding: 1rem !important;
        overflow: visible;
      }

      .table-toolbar {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: 0.35rem 0.3rem 0;
      }

      .toolbar-search {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.62rem;
        min-height: 3.05rem;
        padding: 0 0.95rem;
        border: 1px solid rgba(17, 71, 89, 0.22);
        border-radius: 0.92rem;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 251, 255, 0.96));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92);
      }

      .table-search {
        flex: 0 1 18rem;
        max-width: 18rem;
        min-width: 13rem;
        margin: 0 0 0 auto;
      }

      .field-icon {
        display: inline-grid;
        place-items: center;
        width: 1.1rem;
        height: 1.1rem;
        color: #718293;
        flex: 0 0 auto;
        line-height: 0;
      }

      .field-icon svg {
        display: block;
        width: 100%;
        height: 100%;
        fill: currentColor;
      }

      .toolbar-search input {
        width: 100%;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: 0;
        margin: 0;
        padding: 0;
        background: transparent;
        color: #163a47;
        font-size: 1rem;
        line-height: 1.1;
      }

      .toolbar-search input::placeholder {
        color: #6e8590;
        opacity: 1;
      }

      .table-eyebrow {
        margin: 0 0 0.25rem;
        color: #67818d;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .table-toolbar h2 {
        margin: 0;
        color: #123944;
        font-size: clamp(1.15rem, 1.8vw, 1.45rem);
      }

      .table-toolbar__meta {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .table-toolbar__meta span {
        display: inline-flex;
        align-items: center;
        min-height: 2rem;
        padding: 0.28rem 0.72rem;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(248, 252, 255, 0.98), rgba(238, 247, 251, 0.94));
        color: #52707f;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .table-scroll {
        overflow-x: auto;
        overflow-y: hidden;
        border-radius: 1.2rem 1.2rem 0 0;
      }

      .runs-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .col-title {
        width: 46%;
      }

      .col-status {
        width: 21%;
      }

      .col-created {
        width: 18%;
      }

      .col-actions {
        width: 15%;
      }

      .runs-table thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 1rem 1.1rem;
        text-align: left;
        background: rgba(242, 248, 252, 0.98);
        color: #667d8b;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .run-row {
        cursor: pointer;
        transition: background 160ms ease;
      }

      .run-row:hover,
      .run-row.selected {
        background: rgba(245, 251, 255, 0.92);
      }

      .run-row:nth-child(even) {
        background: rgba(250, 253, 255, 0.78);
      }

      .run-row.selected td:first-child {
        box-shadow: inset 4px 0 0 #0d5d63;
      }

      .runs-table tbody td {
        padding: 1rem 1.1rem;
        border-top: 1px solid rgba(210, 231, 240, 0.86);
        vertical-align: top;
        color: #203d49;
      }

      .title-cell,
      .status-cell,
      .detail-copy {
        display: grid;
        gap: 0.25rem;
      }

      .title-cell {
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        gap: 0.75rem;
      }

      .title-copy {
        min-width: 0;
      }

      .title-heading {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        min-width: 0;
      }

      .title-heading strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 1rem;
        color: #112f3d;
      }

      .run-icon {
        display: inline-grid;
        place-items: center;
        width: 2.4rem;
        height: 2.4rem;
        border-radius: 0.6rem;
        background: rgba(227, 240, 248, 0.9);
        color: #314b57;
        font-size: 0;
        font-weight: 800;
      }

      .run-icon::before {
        font-size: 1rem;
        line-height: 1;
      }

      .run-icon.pending {
        background: rgba(228, 235, 241, 0.95);
        color: #5a6d77;
      }

      .run-icon.pending::before {
        content: '•';
      }

      .run-icon.completed {
        background: rgba(226, 246, 226, 0.95);
        color: #1c6d25;
      }

      .run-icon.completed::before {
        content: '✓';
      }

      .run-icon.failed {
        background: rgba(251, 226, 227, 0.95);
        color: #b22c32;
      }

      .run-icon.failed::before {
        content: '!';
      }

      .run-icon.stopped {
        background: rgba(255, 228, 232, 0.95);
        color: #bb4354;
      }

      .run-icon.stopped::before {
        content: 'S';
      }

      .title-copy span,
      .title-copy small,
      .status-meta span,
      .created-cell span {
        color: #66808f;
        line-height: 1.35;
      }

      .title-copy span {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }

      .status-cell {
        gap: 0.45rem;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 1.7rem;
        width: fit-content;
        padding: 0.14rem 0.62rem;
        border-radius: 999px;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .status-pill.tone-pending {
        background: rgba(227, 234, 240, 0.96);
        color: #5c6c77;
      }

      .status-pill.tone-completed {
        background: rgba(20, 129, 41, 0.95);
        color: #f6fff7;
      }

      .status-pill.tone-failed {
        background: rgba(199, 28, 28, 0.95);
        color: #fff5f5;
      }

      .status-pill.tone-stopped {
        background: rgba(191, 74, 91, 0.95);
        color: #fff7f8;
      }

      .status-meta,
      .created-cell {
        display: grid;
        gap: 0.12rem;
      }

      .status-meta strong,
      .created-cell strong {
        font-size: 0.96rem;
        color: #183846;
      }

      .actions-cell {
        position: relative;
        display: flex;
        justify-content: flex-end;
      }

      .kebab-button {
        position: relative;
        display: inline-grid;
        place-items: center;
        width: 2.15rem;
        height: 2.15rem;
        border: 1px solid rgba(201, 220, 231, 0.92);
        border-radius: 0.7rem;
        background: rgba(255, 255, 255, 0.96);
        color: #37535f;
        font-size: 0;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 8px 22px rgba(13, 63, 75, 0.08);
      }

      .kebab-button::before {
        content: '';
        width: 0.2rem;
        height: 0.2rem;
        border-radius: 50%;
        background: #37535f;
        box-shadow:
          0 -0.35rem 0 #37535f,
          0 0.35rem 0 #37535f;
      }

      .kebab-dots {
        display: none;
      }

      .action-popover {
        position: absolute;
        top: calc(100% + 0.4rem);
        right: 0;
        z-index: 5;
        display: grid;
        gap: 0.4rem;
        min-width: 10.25rem;
        padding: 0.55rem;
        border: 1px solid rgba(201, 220, 231, 0.92);
        border-radius: 0.95rem;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 16px 28px rgba(13, 63, 75, 0.12);
      }

      .action-popover.upward {
        top: auto;
        bottom: calc(100% + 0.4rem);
      }

      .action-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2rem;
        padding: 0.25rem 0.8rem;
        border: 0;
        border-radius: 0.72rem;
        font-size: 0.84rem;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }

      .action-chip-inspect {
        background: rgba(52, 134, 255, 0.14);
        color: #1158c7;
      }

      .action-chip-draft {
        background: rgba(255, 221, 125, 0.35);
        color: #8d6400;
      }

      .action-chip-regenerate {
        background: rgba(16, 124, 95, 0.14);
        color: #0a6a55;
      }

      .action-chip-stop {
        background: rgba(255, 209, 213, 0.72);
        color: #b22735;
      }

      .table-pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 0.8rem 0.35rem 0.15rem;
        color: #607988;
        font-size: 0.86rem;
      }

      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }

      .page-button {
        min-width: 2.1rem;
        height: 2rem;
        padding: 0 0.7rem;
        border: 1px solid rgba(201, 220, 231, 0.92);
        border-radius: 0.65rem;
        background: rgba(255, 255, 255, 0.96);
        color: #30505b;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
      }

      .page-button.active {
        background: linear-gradient(135deg, #0b5d63, #0d4f55);
        color: white;
        border-color: transparent;
      }

      .page-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .detail-scroll {
        max-height: 48rem;
        overflow: auto;
        padding-right: 0.2rem;
      }

      .detail-shell {
        display: grid;
        gap: 1rem;
        padding: 1rem;
        border-radius: 1.25rem;
        background: linear-gradient(180deg, rgba(245, 251, 255, 0.98), rgba(255, 255, 255, 0.96));
      }

      .detail-status {
        display: inline-flex;
        align-items: center;
        min-height: 1.8rem;
        padding: 0.22rem 0.7rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        width: fit-content;
      }

      .detail-title-row {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        flex-wrap: wrap;
      }

      .status-pending {
        background: rgba(226, 234, 240, 0.92);
        color: #50626d;
      }

      .status-completed {
        background: rgba(185, 244, 186, 0.8);
        color: #136f1c;
      }

      .status-failed {
        background: rgba(249, 210, 212, 0.9);
        color: #ab242c;
      }

      .status-stopped {
        background: rgba(255, 227, 231, 0.95);
        color: #b5414f;
      }

      .detail-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.85rem 1.4rem;
      }

      .health-index {
        display: grid;
        justify-items: end;
        gap: 0.1rem;
        min-width: 9rem;
      }

      .health-index span {
        color: #6a818d;
        font-size: 0.82rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .health-index strong {
        color: #177a20;
        font-size: clamp(2rem, 3vw, 3rem);
        line-height: 1;
      }

      .detail-cards {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
        align-items: start;
      }

      .detail-card mat-card-content {
        display: grid;
        gap: 0.5rem;
        padding: 1rem !important;
      }

      .execution-card {
        overflow: hidden;
        background: linear-gradient(180deg, rgba(236, 247, 255, 0.98), rgba(255, 255, 255, 0.96)) !important;
      }

      .execution-card mat-card-content {
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 0.85rem;
      }

      .detail-card h3 {
        margin: 0;
        color: #112f3d;
        font-size: 1rem;
      }

      .execution-line {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.5rem;
      }

      .execution-chip {
        display: grid;
        gap: 0.14rem;
        padding: 0.62rem 0.78rem;
        border-radius: 0.85rem;
        background: rgba(241, 248, 252, 0.95);
      }

      .execution-chip span,
      .detail-stat span {
        color: #67808d;
        font-size: 0.74rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .execution-chip strong,
      .detail-stat strong {
        color: #163846;
        font-size: 0.95rem;
      }

      .detail-stat {
        display: grid;
        gap: 0.14rem;
      }

      .detail-panels {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }

      @media (max-width: 1080px) {
        .metric-grid,
        .detail-cards {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .execution-card mat-card-content {
          grid-template-columns: 1fr;
        }

        .execution-line {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .detail-panels {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 900px) {
        .page-hero,
        .detail-hero,
        .detail-meta,
        .table-pagination,
        .table-toolbar {
          flex-direction: column;
          align-items: flex-start;
        }

        .table-search {
          width: 100%;
          max-width: none;
          margin-left: 0;
        }

        .hero-actions,
        .detail-actions {
          justify-content: flex-start;
        }

        .table-scroll,
        .detail-scroll {
          overflow: auto;
        }
      }

      @media (max-width: 720px) {
        .metric-grid,
        .execution-line {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class TestGenerationRunListPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly runs = signal<TestGenerationRunSummary[]>([]);
  readonly selectedRun = signal<TestGenerationRunDetail | null>(null);
  readonly openActionRunId = signal<string | null>(null);
  readonly totalRuns = signal(0);
  readonly currentPage = signal(1);
  readonly searchTerm = signal('');
  readonly pageSize = 3;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly pageMetrics = computed(() => {
    const runs = this.runs();
    return {
      visibleRuns: runs.length,
      activeRuns: runs.filter((run) => this.statusTone(run) === 'pending').length,
      completedRuns: runs.filter((run) => this.statusTone(run) === 'completed').length,
      interruptedRuns: runs.filter((run) => {
        const tone = this.statusTone(run);
        return tone === 'failed' || tone === 'stopped';
      }).length,
    };
  });

  @HostListener('document:click')
  closeRunActions() {
    this.openActionRunId.set(null);
  }

  constructor() {
    this.loadRuns();

    this.searchControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        const normalized = term.trim();
        if (normalized === this.searchTerm()) {
          return;
        }

        this.searchTerm.set(normalized);
        this.currentPage.set(1);
        this.closeRunActions();
        this.loadRuns();
      });

    interval(1_500)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const hasPendingRuns = this.runs().some((run) => run.status === 'pending');
        const selectedPendingRun = this.selectedRun()?.status === 'pending';
        if ((!hasPendingRuns && !selectedPendingRun) || this.openActionRunId()) {
          return;
        }

        this.loadRuns({ silent: true });

        if (this.selectedRun()) {
          this.selectRun(this.selectedRun()!, undefined, { silent: true });
        }
      });
  }

  shortRunId(runId: string) {
    return `RUN-${runId.slice(-6).toUpperCase()}`;
  }

  runIcon(run: TestGenerationRunSummary) {
    if (this.statusTone(run) === 'stopped') {
      return '■';
    }

    if (run.status === 'completed') {
      return '✓';
    }

    if (run.status === 'failed') {
      return '!';
    }

    return '●';
  }

  durationLabel(run: TestGenerationRunDetail) {
    const completed = run.progress?.completedBatches ?? 0;
    const total = run.progress?.totalBatches ?? 0;
    return `${completed}/${total || completed} batches`;
  }

  healthForRun(run: TestGenerationRunDetail) {
    if (run.status === 'completed') {
      return '98.4%';
    }

    if (this.statusTone(run) === 'stopped') {
      return 'Stopped';
    }

    if (run.status === 'failed') {
      return '61.0%';
    }

    return 'In progress';
  }

  statusLabel(run: Pick<TestGenerationRunSummary, 'status' | 'errorMessage'>) {
    return run.status === 'failed' && run.errorMessage === 'Generation stopped by user.' ? 'Stopped' : run.status;
  }

  statusTone(run: Pick<TestGenerationRunSummary, 'status' | 'errorMessage'>) {
    return run.status === 'failed' && run.errorMessage === 'Generation stopped by user.' ? 'stopped' : run.status;
  }

  statusHint(run: Pick<TestGenerationRunSummary, 'status' | 'errorMessage'>) {
    if (this.statusTone(run) === 'completed') {
      return 'Draft ready';
    }

    if (this.statusTone(run) === 'failed') {
      return 'Generation failed';
    }

    if (this.statusTone(run) === 'stopped') {
      return 'Stopped by user';
    }

    return 'Queued and processing';
  }

  relativeCreated(value: string) {
    const createdAt = new Date(value).getTime();
    const diffMs = Date.now() - createdAt;
    const minuteMs = 60_000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    if (diffMs < minuteMs) {
      return 'Just now';
    }

    if (diffMs < hourMs) {
      const minutes = Math.max(1, Math.round(diffMs / minuteMs));
      return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
    }

    if (diffMs < dayMs) {
      const hours = Math.max(1, Math.round(diffMs / hourMs));
      return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  }

  absoluteCreated(value: string) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  }

  displayCreatedBy(run: TestGenerationRunSummary) {
    const actor = run.createdBy?.trim();
    if (actor && actor.toLowerCase() !== 'signed-in user') {
      return actor;
    }

    return run.suiteContext.contributor?.name?.trim() || actor || 'Signed-in user';
  }

  totalPages() {
    return Math.max(1, Math.ceil(this.totalRuns() / this.pageSize));
  }

  pageStart() {
    if (!this.totalRuns()) {
      return 0;
    }

    return (this.currentPage() - 1) * this.pageSize + 1;
  }

  pageEnd() {
    return Math.min(this.totalRuns(), this.currentPage() * this.pageSize);
  }

  visiblePages() {
    const total = this.totalPages();
    const current = this.currentPage();
    const start = Math.max(1, current - 1);
    const end = Math.min(total, start + 2);
    const adjustedStart = Math.max(1, end - 2);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }

  goToPage(page: number) {
    const nextPage = Math.min(this.totalPages(), Math.max(1, page));
    if (nextPage === this.currentPage()) {
      return;
    }

    this.currentPage.set(nextPage);
    this.loadRuns();
  }

  shouldOpenActionsUp(runId: string) {
    const items = this.runs();
    if (items.length < 2) {
      return false;
    }

    const index = items.findIndex((item) => item.id === runId);
    return index >= Math.max(0, items.length - 2);
  }

  toggleRunActions(runId: string, event: Event) {
    event.stopPropagation();
    this.openActionRunId.update((current) => (current === runId ? null : runId));
  }

  inspectRun(run: TestGenerationRunSummary, event: Event) {
    event.stopPropagation();
    this.closeRunActions();
    this.selectRun(run, undefined, { silent: true });
  }

  loadRuns(options?: { silent?: boolean }) {
    this.api
      .listGenerationRuns({ page: this.currentPage(), pageSize: this.pageSize, search: this.searchTerm() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.runs.set(result.items);
          this.totalRuns.set(result.total);
          this.loading.set(false);

          if (result.items.length === 0) {
            this.selectedRun.set(null);
            return;
          }

          if (!this.selectedRun()) {
            this.selectRun(result.items[0], undefined, { silent: true });
            return;
          }

          const selectedId = this.selectedRun()?.id;
          if (selectedId && !result.items.some((item) => item.id === selectedId) && result.items.length > 0) {
            this.selectRun(result.items[0], undefined, { silent: true });
          }
        },
        error: () => {
          if (!options?.silent) {
            this.notifications.error('Unable to load generation runs.');
          }
          this.loading.set(false);
        },
      });
  }

  selectRun(run: TestGenerationRunSummary, event?: Event, options?: { silent?: boolean }) {
    event?.stopPropagation();
    this.closeRunActions();

    this.api
      .getGenerationRun(run.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.selectedRun.set(result.run),
        error: () => {
          if (!options?.silent) {
            this.notifications.error('Unable to load run detail.');
          }
        },
      });
  }

  stopRun(run: TestGenerationRunSummary | TestGenerationRunDetail, event?: Event) {
    event?.stopPropagation();
    this.closeRunActions();

    this.api
      .stopGenerationRun(run.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ run: updatedRun }) => {
          this.notifications.success(`${updatedRun.title} was stopped.`);
          this.loadRuns({ silent: true });
          this.selectRun(updatedRun, undefined, { silent: true });
        },
        error: (error) => {
          const message =
            typeof error?.error?.message === 'string'
              ? error.error.message
              : 'Unable to stop generation right now.';
          this.notifications.error(message);
        },
      });
  }

  regenerate(run: TestGenerationRunSummary | TestGenerationRunDetail) {
    this.closeRunActions();

    this.api
      .regenerateGenerationRun(run.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ run: nextRun }) => {
          this.notifications.success(`${nextRun.title} has been queued again.`);
          this.loadRuns({ silent: true });
          this.selectRun(nextRun, undefined, { silent: true });
        },
        error: () => {
          this.notifications.error('Unable to re-run generation.');
        },
      });
  }

  pretty(value: unknown) {
    return JSON.stringify(value, null, 2);
  }
}
