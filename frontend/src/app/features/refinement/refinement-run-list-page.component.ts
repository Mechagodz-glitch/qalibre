import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { entityConfigList } from '../../core/entity-config';
import type { RefinementRunSummary } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

@Component({
  selector: 'app-refinement-run-list-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    EmptyStateComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  template: `
    <section class="page-stack">
      <app-page-header
        title="Refinement Run History"
        description="Review completed, pending, and failed refinement runs with full request/response traceability."
        eyebrow="AI traceability"
      />

      <mat-card>
        <mat-card-content>
          <form class="filter-grid" [formGroup]="filters" (ngSubmit)="applyFilters()">
            <mat-form-field appearance="outline">
              <mat-label>Entity type</mat-label>
              <mat-select formControlName="itemType">
                <mat-option value="">All</mat-option>
                @for (entity of entities; track entity.key) {
                  <mat-option [value]="entity.key">{{ entity.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                <mat-option value="">All</mat-option>
                <mat-option value="pending">Pending</mat-option>
                <mat-option value="completed">Completed</mat-option>
                <mat-option value="failed">Failed</mat-option>
              </mat-select>
            </mat-form-field>

            <div class="filter-actions">
              <button mat-flat-button class="brand-button" type="submit">Apply</button>
              <button mat-button type="button" (click)="reset()">Reset</button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          @if (loading()) {
            <section class="centered"><mat-spinner diameter="40"></mat-spinner></section>
          } @else if (!runs().length) {
            <app-empty-state title="No refinement runs" description="Start a refinement from a dataset list to create run history." />
          } @else {
            <table mat-table [dataSource]="runs()" class="full-table">
              <ng-container matColumnDef="item">
                <th mat-header-cell *matHeaderCellDef>Item</th>
                <td mat-cell *matCellDef="let run">
                  <a [routerLink]="['/refinement/runs', run.id]">{{ run.itemTitle }}</a>
                  <p>{{ run.mode }} · {{ run.model || 'model pending' }}</p>
                </td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let run">
                  <app-status-badge [status]="run.status" [label]="run.status"></app-status-badge>
                </td>
              </ng-container>

              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Created</th>
                <td mat-cell *matCellDef="let run">{{ run.createdAt | date: 'medium' }}</td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
            </table>

            <mat-paginator
              [length]="total()"
              [pageIndex]="pageIndex()"
              [pageSize]="pageSize()"
              [pageSizeOptions]="[12, 24, 36]"
              (page)="onPageChange($event)"
            />
          }
        </mat-card-content>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .page-stack {
        display: grid;
        gap: 1.5rem;
      }

      .filter-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
      }

      .filter-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .centered {
        display: grid;
        place-items: center;
        min-height: 18rem;
      }

      .full-table {
        width: 100%;
      }

      td p {
        margin: 0.35rem 0 0;
        color: #5a718d;
      }

      @media (max-width: 900px) {
        .filter-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class RefinementRunListPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly entities = entityConfigList;
  readonly runs = signal<RefinementRunSummary[]>([]);
  readonly loading = signal(true);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(12);
  readonly displayedColumns = ['item', 'status', 'createdAt'];

  readonly filters = this.fb.nonNullable.group({
    itemType: [''],
    status: [''],
  });

  constructor() {
    this.load();
  }

  applyFilters() {
    this.pageIndex.set(0);
    this.load();
  }

  reset() {
    this.filters.reset({ itemType: '', status: '' });
    this.pageIndex.set(0);
    this.load();
  }

  onPageChange(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api
      .listRuns({
        page: this.pageIndex() + 1,
        pageSize: this.pageSize(),
        itemType: (this.filters.controls.itemType.getRawValue() || undefined) as any,
        status: this.filters.controls.status.getRawValue() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.runs.set(response.items);
          this.total.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Failed to load refinement runs.');
          this.loading.set(false);
        },
      });
  }
}
