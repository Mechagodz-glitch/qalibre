import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { getEntityConfig } from '../../core/entity-config';
import type { DatasetItem, DatasetItemType, DatasetStatus } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { ComponentCatalogueImportDialogComponent } from '../../shared/components/component-catalogue-import-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { RefinementModeDialogComponent } from '../../shared/components/refinement-mode-dialog.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

@Component({
  selector: 'app-dataset-list-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  template: `
    <section class="page-stack">
      <app-page-header
        [title]="config().pluralLabel"
        [description]="config().description"
        eyebrow="Dataset authoring"
      >
        @if (supportsImport()) {
          <button mat-stroked-button type="button" (click)="openImportDialog()">Import catalogue</button>
        }
        <a mat-flat-button class="brand-button" [routerLink]="['/', config().route, 'new']">Create item</a>
        @if (config().supportsBulkRefinement) {
          <button mat-button type="button" (click)="bulkRefine()" [disabled]="selection.isEmpty()">Refine selected</button>
        }
      </app-page-header>

      <mat-card>
        <mat-card-content>
          <form class="filter-grid" [formGroup]="filters" (ngSubmit)="applyFilters()">
            <mat-form-field appearance="outline">
              <mat-label>Search</mat-label>
              <input matInput formControlName="search" placeholder="Search title or summary" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                <mat-option value="">All active</mat-option>
                <mat-option value="draft">Draft</mat-option>
                <mat-option value="approved">Approved</mat-option>
                <mat-option value="archived">Archived</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-checkbox formControlName="includeArchived">Include archived</mat-checkbox>

            <div class="filter-actions">
              <button mat-flat-button class="brand-button" type="submit">Apply filters</button>
              <button mat-button type="button" (click)="resetFilters()">Reset</button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          @if (loading()) {
            <section class="centered"><mat-spinner diameter="40"></mat-spinner></section>
          } @else if (!items().length) {
            <app-empty-state
              title="No records found"
              description="Create a new record or widen your filters to see more results."
            />
          } @else {
            <div class="table-shell">
              <table mat-table [dataSource]="items()" class="dataset-table">
                <ng-container matColumnDef="select">
                  <th mat-header-cell *matHeaderCellDef>
                    <mat-checkbox
                      [checked]="selection.hasValue() && isAllSelected()"
                      [indeterminate]="selection.hasValue() && !isAllSelected()"
                      (change)="toggleAll()"
                    />
                  </th>
                  <td mat-cell *matCellDef="let item">
                    <mat-checkbox
                      [checked]="selection.isSelected(item)"
                      (click)="$event.stopPropagation()"
                      (change)="selection.toggle(item)"
                    />
                  </td>
                </ng-container>

                <ng-container matColumnDef="title">
                  <th mat-header-cell *matHeaderCellDef>Title</th>
                  <td mat-cell *matCellDef="let item">
                    <a class="title-link" [routerLink]="['/', config().route, item.id]">{{ item.title }}</a>
                    @if (item.summary) {
                      <p>{{ item.summary }}</p>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let item">
                    <app-status-badge [status]="item.status" [label]="item.status"></app-status-badge>
                  </td>
                </ng-container>

                <ng-container matColumnDef="version">
                  <th mat-header-cell *matHeaderCellDef>Version</th>
                  <td mat-cell *matCellDef="let item">v{{ item.version }}</td>
                </ng-container>

                <ng-container matColumnDef="updatedAt">
                  <th mat-header-cell *matHeaderCellDef>Updated</th>
                  <td mat-cell *matCellDef="let item">{{ item.updatedAt | date: 'mediumDate' }}</td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let item">
                    <div class="row-actions">
                      <a mat-button [routerLink]="['/', config().route, item.id, 'edit']">Edit</a>
                      <button mat-button type="button" (click)="clone(item)">Clone</button>
                      @if (item.status === 'archived') {
                        <button mat-button type="button" (click)="restore(item)">Restore</button>
                      } @else {
                        <button mat-button type="button" (click)="archive(item)">Archive</button>
                      }
                      <button mat-button type="button" class="danger-text" (click)="remove(item)">Delete</button>
                    </div>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
              </table>
            </div>

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
        grid-template-columns: 2fr 1fr auto auto;
        gap: 1rem;
        align-items: center;
      }

      .filter-actions,
      .row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .centered {
        display: grid;
        place-items: center;
        min-height: 18rem;
      }

      .table-shell {
        overflow: auto;
      }

      .dataset-table {
        width: 100%;
      }

      .title-link {
        color: #123566;
        font-weight: 700;
        text-decoration: none;
      }

      td p {
        margin: 0.3rem 0 0;
        color: #5a718d;
      }

      .danger-text {
        color: #a4283d;
      }

      @media (max-width: 900px) {
        .filter-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class DatasetListPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly itemType = this.route.snapshot.data['itemType'] as DatasetItemType;
  readonly config = computed(() => getEntityConfig(this.itemType));
  readonly items = signal<DatasetItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(12);
  readonly supportsImport = computed(() => this.itemType === 'componentCatalogue');
  readonly displayedColumns = ['select', 'title', 'status', 'version', 'updatedAt', 'actions'];
  readonly selection = new SelectionModel<DatasetItem>(true, []);

  readonly filters = this.fb.nonNullable.group({
    search: [''],
    status: [''],
    includeArchived: [false],
  });

  constructor() {
    this.load();
  }

  applyFilters() {
    this.pageIndex.set(0);
    this.load();
  }

  resetFilters() {
    this.filters.reset({
      search: '',
      status: '',
      includeArchived: false,
    });
    this.pageIndex.set(0);
    this.load();
  }

  onPageChange(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  isAllSelected() {
    return this.selection.selected.length === this.items().length;
  }

  toggleAll() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }

    this.selection.select(...this.items());
  }

  bulkRefine() {
    const dialogRef = this.dialog.open(RefinementModeDialogComponent, {
      data: { itemCount: this.selection.selected.length },
    });

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((mode) => {
      if (!mode) {
        return;
      }

      this.api
        .bulkRefine(
          this.itemType,
          this.selection.selected.map((item) => item.id),
          mode,
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.notifications.success(`Refinement started. ${result.completed} draft(s) created.`);
            this.selection.clear();
            this.router.navigate(['/refinement/queue']);
          },
          error: () => this.notifications.error('Unable to start AI refinement.'),
        });
    });
  }

  openImportDialog() {
    const dialogRef = this.dialog.open(ComponentCatalogueImportDialogComponent);

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((summary) => {
      if (!summary) {
        return;
      }

      this.notifications.success(
        `Import completed. ${summary.inserted} inserted, ${summary.updated} updated, ${summary.failed} failed.`,
      );
      this.load();
    });
  }

  clone(item: DatasetItem) {
    this.api
      .cloneItem(this.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifications.success(`${response.item.title} created.`);
          this.load();
        },
        error: () => this.notifications.error('Clone failed.'),
      });
  }

  archive(item: DatasetItem) {
    if (!window.confirm(`Archive "${item.title}"?`)) {
      return;
    }

    this.api
      .archiveItem(this.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Item archived.');
          this.load();
        },
        error: () => this.notifications.error('Archive failed.'),
      });
  }

  restore(item: DatasetItem) {
    this.api
      .restoreItem(this.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Item restored.');
          this.load();
        },
        error: () => this.notifications.error('Restore failed.'),
      });
  }

  remove(item: DatasetItem) {
    if (!window.confirm(`Delete "${item.title}" permanently?`)) {
      return;
    }

    this.api
      .deleteItem(this.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Item deleted.');
          this.load();
        },
        error: () => this.notifications.error('Delete failed.'),
      });
  }

  private load() {
    this.loading.set(true);
    this.selection.clear();

    this.api
      .listItems(this.itemType, {
        page: this.pageIndex() + 1,
        pageSize: this.pageSize(),
        search: this.filters.controls.search.getRawValue(),
        status: (this.filters.controls.status.getRawValue() || undefined) as DatasetStatus | undefined,
        includeArchived: this.filters.controls.includeArchived.getRawValue(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.total.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Failed to load dataset records.');
          this.loading.set(false);
        },
      });
  }
}
