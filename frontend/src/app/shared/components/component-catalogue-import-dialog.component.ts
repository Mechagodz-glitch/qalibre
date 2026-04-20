import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import type { ComponentCatalogueImportSummary } from '../../core/models';
import { WorkbenchApiService } from '../../core/workbench-api.service';

type PreviewItem = {
  componentId: string;
  componentName: string;
  category: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof HttpErrorResponse) {
    const message = typeof error.error?.message === 'string' ? error.error.message : '';
    return message || error.message || 'Request failed.';
  }

  return error instanceof Error ? error.message : 'Request failed.';
}

@Component({
  selector: 'app-component-catalogue-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Import Component Catalogue</h2>
    <mat-dialog-content class="dialog-content">
      <p class="intro">
        Choose a JSON file or paste a component catalogue array. Preview runs validation and normalization without
        mutating the database.
      </p>

      <div class="upload-actions">
        <button mat-stroked-button type="button" (click)="fileInput.click()">Choose JSON file</button>
        <input #fileInput type="file" accept=".json,application/json" hidden (change)="onFileSelected($event)" />
        @if (selectedFileName()) {
          <span class="file-label">{{ selectedFileName() }}</span>
        }
        @if (jsonControl.getRawValue()) {
          <button mat-button type="button" (click)="clearInput()">Clear</button>
        }
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Catalogue JSON</mat-label>
        <textarea
          matInput
          rows="16"
          [formControl]="jsonControl"
          placeholder='[{"componentId":"cmp_dropdown_001","componentName":"Dropdown","category":"selection"}]'
        ></textarea>
        <mat-hint>Arrays and strings are normalized on the backend before storage.</mat-hint>
      </mat-form-field>

      @if (clientError()) {
        <section class="error-banner">{{ clientError() }}</section>
      }

      @if (previewItems().length) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>Local Preview</mat-card-title>
            <mat-card-subtitle>{{ previewCountLabel() }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <ul class="preview-list">
              @for (item of previewItems(); track item.componentId + item.componentName) {
                <li>
                  <strong>{{ item.componentName }}</strong>
                  <span>{{ item.componentId || 'No componentId' }} · {{ item.category || 'uncategorized' }}</span>
                </li>
              }
            </ul>
          </mat-card-content>
        </mat-card>
      }

      @if (summary()) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ summary()!.dryRun ? 'Dry Run Summary' : 'Import Summary' }}</mat-card-title>
            <mat-card-subtitle>Source: {{ summary()!.source }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="summary-grid">
            <div><strong>Total</strong><span>{{ summary()!.totalProcessed }}</span></div>
            <div><strong>Inserted</strong><span>{{ summary()!.inserted }}</span></div>
            <div><strong>Updated</strong><span>{{ summary()!.updated }}</span></div>
            <div><strong>Duplicates</strong><span>{{ summary()!.duplicates }}</span></div>
            <div><strong>Failed</strong><span>{{ summary()!.failed }}</span></div>
            <div><strong>Title Cased</strong><span>{{ summary()!.normalization.namesTitleCased }}</span></div>
            <div><strong>Categories Fixed</strong><span>{{ summary()!.normalization.categoriesNormalized }}</span></div>
            <div><strong>Test Types Fixed</strong><span>{{ summary()!.normalization.testTypesStandardized }}</span></div>
            <div><strong>Array Duplicates Removed</strong><span>{{ summary()!.normalization.arrayDuplicatesRemoved }}</span></div>
            <div><strong>Empty Values Removed</strong><span>{{ summary()!.normalization.emptyValuesRemoved }}</span></div>
          </mat-card-content>
        </mat-card>

        @if (summary()!.failures.length) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>Validation Failures</mat-card-title>
              <mat-card-subtitle>These entries were skipped.</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <ul class="failure-list">
                @for (failure of summary()!.failures; track failure.index) {
                  <li>
                    <strong>#{{ failure.index + 1 }}</strong>
                    <span>
                      {{ failure.componentName || failure.componentId || 'Unknown item' }}: {{ failure.message }}
                    </span>
                  </li>
                }
              </ul>
            </mat-card-content>
          </mat-card>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()" [disabled]="busy()">Cancel</button>
      <button mat-stroked-button type="button" (click)="previewImport()" [disabled]="busy() || !canSubmit()">
        Preview validation
      </button>
      <button mat-flat-button type="button" class="brand-button" (click)="runImport()" [disabled]="busy() || !canSubmit()">
        @if (busy()) {
          <mat-spinner diameter="18"></mat-spinner>
        } @else {
          <span>Import catalogue</span>
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-content {
        display: grid;
        gap: 1rem;
        min-width: min(52rem, 92vw);
        padding-top: 0.5rem;
      }

      .intro {
        margin: 0;
        color: #5a718d;
      }

      .upload-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }

      .file-label {
        color: #123566;
        font-weight: 600;
      }

      .full-width {
        width: 100%;
      }

      .error-banner {
        border-radius: 0.9rem;
        padding: 0.85rem 1rem;
        background: rgba(164, 40, 61, 0.08);
        color: #7f1d2d;
        border: 1px solid rgba(164, 40, 61, 0.18);
      }

      .preview-list,
      .failure-list {
        display: grid;
        gap: 0.75rem;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .preview-list li,
      .failure-list li {
        display: grid;
        gap: 0.2rem;
      }

      .preview-list span,
      .failure-list span {
        color: #5a718d;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
        gap: 0.85rem;
      }

      .summary-grid div {
        display: grid;
        gap: 0.2rem;
        padding: 0.8rem;
        border-radius: 0.9rem;
        background: #f5f7fb;
      }

      .summary-grid strong {
        color: #123566;
      }

      mat-dialog-actions {
        gap: 0.75rem;
      }

      mat-spinner {
        display: inline-block;
      }
    `,
  ],
})
export class ComponentCatalogueImportDialogComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dialogRef = inject(MatDialogRef<ComponentCatalogueImportDialogComponent, ComponentCatalogueImportSummary | undefined>);
  readonly data = inject<{ initialJson?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly jsonControl = new FormControl(this.data?.initialJson ?? '', { nonNullable: true });
  readonly busy = signal(false);
  readonly selectedFileName = signal('');
  readonly clientError = signal('');
  readonly previewItems = signal<PreviewItem[]>([]);
  readonly previewCount = signal(0);
  readonly summary = signal<ComponentCatalogueImportSummary | null>(null);
  readonly canSubmit = computed(() => Boolean(this.jsonControl.getRawValue().trim()));
  readonly previewCountLabel = computed(() => {
    const count = this.previewCount();
    const visibleCount = this.previewItems().length;
    return count > visibleCount ? `Showing ${visibleCount} of ${count} items` : `${count} item${count === 1 ? '' : 's'} detected`;
  });

  constructor() {
    this.refreshLocalPreview(this.jsonControl.getRawValue());
    this.jsonControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.summary.set(null);
      this.refreshLocalPreview(value);
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.selectedFileName.set(file.name);
    file.text()
      .then((value) => this.jsonControl.setValue(value))
      .catch(() => this.clientError.set('Unable to read the selected file.'));
    input.value = '';
  }

  clearInput() {
    this.selectedFileName.set('');
    this.summary.set(null);
    this.jsonControl.setValue('');
  }

  previewImport() {
    this.submit(true);
  }

  runImport() {
    this.submit(false);
  }

  private submit(dryRun: boolean) {
    const jsonText = this.jsonControl.getRawValue().trim();

    if (!jsonText) {
      this.clientError.set('Provide a component catalogue JSON array before continuing.');
      return;
    }

    this.busy.set(true);
    this.clientError.set('');

    this.api
      .importComponentCatalogue({ jsonText, dryRun })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary }) => {
          this.summary.set(summary);
          this.busy.set(false);

          if (!dryRun && summary.failed === 0) {
            this.dialogRef.close(summary);
          }
        },
        error: (error) => {
          this.busy.set(false);
          this.clientError.set(getErrorMessage(error));
        },
      });
  }

  private refreshLocalPreview(rawText: string) {
    const trimmed = rawText.trim();

    if (!trimmed) {
      this.clientError.set('');
      this.previewItems.set([]);
      this.previewCount.set(0);
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (!Array.isArray(parsed)) {
        this.clientError.set('Top-level JSON must be an array of components.');
        this.previewItems.set([]);
        this.previewCount.set(0);
        return;
      }

      const preview = parsed.slice(0, 6).map((item) => ({
        componentId: typeof item?.componentId === 'string' ? item.componentId.trim() : '',
        componentName: typeof item?.componentName === 'string' ? item.componentName.trim() : 'Unnamed component',
        category: typeof item?.category === 'string' ? item.category.trim() : '',
      }));

      this.clientError.set('');
      this.previewItems.set(preview);
      this.previewCount.set(parsed.length);
    } catch {
      this.clientError.set('JSON is not valid yet.');
      this.previewItems.set([]);
      this.previewCount.set(0);
    }
  }
}
