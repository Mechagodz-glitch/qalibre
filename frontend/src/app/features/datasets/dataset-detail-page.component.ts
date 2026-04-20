import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { forkJoin } from 'rxjs';

import { getEntityConfig } from '../../core/entity-config';
import type { ApprovalHistoryEntry, DatasetItem, DatasetItemType, DatasetVersion } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { JsonPanelComponent } from '../../shared/components/json-panel.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { RefinementModeDialogComponent } from '../../shared/components/refinement-mode-dialog.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

@Component({
  selector: 'app-dataset-detail-page',
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
      <section class="centered"><mat-spinner diameter="42"></mat-spinner></section>
    } @else if (item()) {
      <section class="page-stack">
        <app-page-header
          [title]="item()!.title"
          [description]="item()!.summary ?? config().description"
          [eyebrow]="config().label"
        >
          <app-status-badge [status]="item()!.status" [label]="item()!.status"></app-status-badge>
          <a mat-flat-button class="brand-button" [routerLink]="['/', config().route, item()!.id, 'edit']">Edit</a>
          <button mat-button type="button" (click)="refine()">Refine</button>
          <button mat-button type="button" (click)="clone()">Clone</button>
          @if (item()!.status === 'archived') {
            <button mat-button type="button" (click)="restore()">Restore</button>
          } @else {
            <button mat-button type="button" (click)="archive()">Archive</button>
          }
        </app-page-header>

        <section class="meta-grid">
          <mat-card>
            <mat-card-header>
              <mat-card-title>Record metadata</mat-card-title>
            </mat-card-header>
            <mat-card-content class="meta-content">
              <div><span>ID</span><strong>{{ item()!.id }}</strong></div>
              <div><span>Version</span><strong>v{{ item()!.version }}</strong></div>
              @if (item()!.scopeLevel) {
                <div><span>Scope</span><strong>{{ item()!.scopeLevel }}</strong></div>
              }
              @if (item()!.project) {
                <div><span>Project</span><strong>{{ item()!.project!.name }}</strong></div>
              }
              @if (item()!.module) {
                <div><span>Module</span><strong>{{ item()!.module!.name }}</strong></div>
              }
              @if (item()!.page) {
                <div><span>Page</span><strong>{{ item()!.page!.name }}</strong></div>
              }
              <div><span>Created</span><strong>{{ item()!.createdAt | date: 'medium' }}</strong></div>
              <div><span>Updated</span><strong>{{ item()!.updatedAt | date: 'medium' }}</strong></div>
            </mat-card-content>
          </mat-card>

          <mat-card>
            <mat-card-header>
              <mat-card-title>Tags</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (item()!.tags.length) {
                <div class="pill-list">
                  @for (tag of item()!.tags; track tag) {
                    <span class="pill">{{ tag }}</span>
                  }
                </div>
              } @else {
                <p>No tags defined.</p>
              }
            </mat-card-content>
          </mat-card>
        </section>

        <mat-card>
          <mat-card-content>
            <mat-tab-group>
              <mat-tab label="Overview">
                <div class="field-grid">
                  @for (field of config().fields; track field.key) {
                    <section class="field-card">
                      <p class="field-label">{{ field.label }}</p>
                      <div class="field-value">
                        @if (field.type === 'stringList') {
                          @if (readList(field.key).length) {
                            @if (rendersAsSentenceList(field.key)) {
                              <ol class="sentence-list">
                                @for (value of readList(field.key); track value) {
                                  <li>{{ value }}</li>
                                }
                              </ol>
                            } @else {
                              <div class="pill-list">
                                @for (value of readList(field.key); track value) {
                                  <span class="pill">{{ value }}</span>
                                }
                              </div>
                            }
                          } @else {
                            <span class="muted">No values</span>
                          }
                        } @else if (field.type === 'json') {
                          <pre>{{ pretty(readValue(field.key)) }}</pre>
                        } @else {
                          <span>{{ readValue(field.key) || 'No value' }}</span>
                        }
                      </div>
                    </section>
                  }
                </div>
              </mat-tab>

              <mat-tab label="JSON">
                <div class="json-grid">
                  <app-json-panel title="Payload" [value]="pretty(item()!.payload)"></app-json-panel>
                </div>
              </mat-tab>

              <mat-tab label="History">
                <section class="history-grid">
                  <div>
                    <h3>Versions</h3>
                    @if (versions().length) {
                      <div class="history-list">
                        @for (version of versions(); track version.id) {
                          <article class="history-card">
                            <strong>v{{ version.version }}</strong>
                            <span>{{ version.createdAt | date: 'medium' }} · {{ version.createdBy }}</span>
                          </article>
                        }
                      </div>
                    } @else {
                      <app-empty-state title="No versions" description="Version history will appear after changes are recorded." />
                    }
                  </div>

                  <div>
                    <h3>Approval history</h3>
                    @if (approvals().length) {
                      <div class="history-list">
                        @for (approval of approvals(); track approval.id) {
                          <article class="history-card">
                            <strong>{{ approval.action }}</strong>
                            <span>
                              v{{ approval.versionBefore }} → v{{ approval.versionAfter }} · {{ approval.actor }} ·
                              {{ approval.createdAt | date: 'medium' }}
                            </span>
                            @if (approval.notes) {
                              <p>{{ approval.notes }}</p>
                            }
                          </article>
                        }
                      </div>
                    } @else {
                      <app-empty-state title="No approvals" description="Approval decisions will show here as the dataset evolves." />
                    }
                  </div>
                </section>
              </mat-tab>
            </mat-tab-group>
          </mat-card-content>
        </mat-card>
      </section>
    } @else {
      <app-empty-state title="Record not found" description="The requested dataset record could not be loaded." />
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
        min-height: 20rem;
      }

      .meta-grid,
      .history-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }

      .meta-content {
        display: grid;
        gap: 0.8rem;
      }

      .meta-content div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }

      .meta-content span,
      .field-label {
        color: #607a98;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
        gap: 1rem;
        padding-top: 1rem;
      }

      .field-card {
        padding: 1rem;
        border-radius: 1rem;
        background: rgba(246, 249, 253, 0.92);
        border: 1px solid rgba(18, 53, 102, 0.08);
      }

      .field-label {
        margin: 0 0 0.4rem;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .field-value pre {
        margin: 0;
      }

      .pill-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }

      .pill {
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        background: rgba(18, 53, 102, 0.1);
      }

      .history-list {
        display: grid;
        gap: 0.75rem;
      }

      .sentence-list {
        margin: 0;
        padding-left: 1.2rem;
        display: grid;
        gap: 0.55rem;
      }

      .history-card {
        padding: 0.9rem 1rem;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(18, 53, 102, 0.08);
      }

      .history-card span,
      .history-card p,
      .muted {
        color: #607a98;
      }

      .json-grid {
        padding-top: 1rem;
      }

      @media (max-width: 900px) {
        .meta-grid,
        .history-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class DatasetDetailPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly itemType = this.route.snapshot.data['itemType'] as DatasetItemType;
  readonly itemId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly config = computed(() => getEntityConfig(this.itemType));
  readonly item = signal<DatasetItem | null>(null);
  readonly versions = signal<DatasetVersion[]>([]);
  readonly approvals = signal<ApprovalHistoryEntry[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.load();
  }

  readValue(key: string) {
    return this.item()?.payload[key];
  }

  readList(key: string) {
    const value = this.readValue(key);
    return Array.isArray(value) ? value : [];
  }

  rendersAsSentenceList(key: string) {
    return key === 'standardTestCases';
  }

  pretty(value: unknown) {
    return JSON.stringify(value, null, 2);
  }

  refine() {
    const dialogRef = this.dialog.open(RefinementModeDialogComponent, {
      data: { itemCount: 1 },
    });

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((mode) => {
      if (!mode || !this.item()) {
        return;
      }

      this.api
        .bulkRefine(this.itemType, [this.item()!.id], mode)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.notifications.success('Refinement draft created.');
            this.router.navigate(['/refinement/queue']);
          },
          error: () => this.notifications.error('Unable to start refinement.'),
        });
    });
  }

  clone() {
    this.api
      .cloneItem(this.itemType, this.itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifications.success('Record cloned.');
          this.router.navigate(['/', this.config().route, response.item.id]);
        },
        error: () => this.notifications.error('Clone failed.'),
      });
  }

  archive() {
    if (!window.confirm(`Archive "${this.item()?.title}"?`)) {
      return;
    }

    this.api
      .archiveItem(this.itemType, this.itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Record archived.');
          this.load();
        },
        error: () => this.notifications.error('Archive failed.'),
      });
  }

  restore() {
    this.api
      .restoreItem(this.itemType, this.itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Record restored.');
          this.load();
        },
        error: () => this.notifications.error('Restore failed.'),
      });
  }

  private load() {
    this.loading.set(true);

    forkJoin({
      item: this.api.getItem(this.itemType, this.itemId),
      versions: this.api.getVersions(this.itemType, this.itemId),
      approvals: this.api.getApprovals(this.itemType, this.itemId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.item.set(result.item.item);
          this.versions.set(result.versions.items);
          this.approvals.set(result.approvals.items);
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load record details.');
          this.loading.set(false);
        },
      });
  }
}
