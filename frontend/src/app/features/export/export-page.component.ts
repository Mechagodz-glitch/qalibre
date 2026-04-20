import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

import { entityConfigList } from '../../core/entity-config';
import type { DatasetItemType, ExportFormat } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

@Component({
  selector: 'app-export-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, PageHeaderComponent],
  template: `
    <section class="page-stack">
      <div class="page-breadcrumbs">
        <span>Dashboard</span>
        <span>Knowledge Base</span>
        <strong>Dataset Export</strong>
      </div>

      <app-page-header
        title="Dataset Export"
        description="Export approved datasets as CSV or Excel. Full bundled exports are delivered as a multi-sheet Excel workbook."
        eyebrow="Spreadsheet outputs"
      >
        <button mat-flat-button class="brand-button" type="button" [disabled]="downloading()" (click)="download(undefined, 'xlsx')">
          Download full workbook
        </button>
      </app-page-header>

      <mat-card class="hero-card">
        <mat-card-content class="hero-grid">
          <div>
            <p class="section-eyebrow">Export workspace</p>
            <h2>Approved dataset exports</h2>
            <p>Download individual CSVs or a single workbook for the approved knowledge base.</p>
          </div>

          <div class="hero-pills">
            <span>{{ entities.length }} dataset types</span>
            <span>Workbook + CSV</span>
          </div>
        </mat-card-content>
      </mat-card>

      <section class="export-grid">
        @for (entity of entities; track entity.key) {
          <mat-card class="export-card">
            <mat-card-header>
              <mat-card-title>{{ entity.label }}</mat-card-title>
              <mat-card-subtitle>{{ entity.description }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content class="action-row">
              <button mat-stroked-button type="button" [disabled]="downloading()" (click)="download(entity.key, 'csv')">
                Export CSV
              </button>
              <button mat-flat-button class="brand-button" type="button" [disabled]="downloading()" (click)="download(entity.key, 'xlsx')">
                Export Excel
              </button>
            </mat-card-content>
          </mat-card>
        }
      </section>
    </section>
  `,
  styles: [
    `
      .page-stack {
        display: grid;
        gap: 1.5rem;
      }

      .page-breadcrumbs {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        align-items: center;
        color: #6d829a;
        font-weight: 600;
      }

      .page-breadcrumbs span::after {
        content: '›';
        margin-left: 0.75rem;
        color: #9fb2c4;
      }

      .hero-card {
        background:
          radial-gradient(circle at top left, rgba(132, 218, 220, 0.22), transparent 13rem),
          linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(236, 245, 255, 0.94)) !important;
        border: 1px solid rgba(18, 53, 102, 0.08);
        box-shadow: 0 18px 38px rgba(18, 53, 102, 0.08);
      }

      .hero-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: minmax(0, 1.4fr) auto;
        align-items: center;
      }

      .hero-grid h2 {
        margin: 0.25rem 0 0.45rem;
        font-size: clamp(1.5rem, 2vw, 2.15rem);
      }

      .hero-pills {
        display: flex;
        gap: 0.65rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .hero-pills span {
        padding: 0.55rem 0.8rem;
        border-radius: 999px;
        background: rgba(18, 53, 102, 0.08);
        color: var(--text-strong);
        font-weight: 600;
      }

      .export-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
        gap: 1rem;
      }

      .export-card {
        border: 1px solid rgba(18, 53, 102, 0.08);
        background: linear-gradient(180deg, rgba(248, 251, 255, 0.94), rgba(255, 255, 255, 0.96));
        box-shadow: 0 12px 24px rgba(18, 53, 102, 0.05);
      }

      .action-row {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .section-eyebrow {
        margin: 0;
        color: #5d7692;
      }

      @media (max-width: 1100px) {
        .hero-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class ExportPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);

  readonly entities = entityConfigList;
  readonly downloading = signal(false);

  download(itemType?: DatasetItemType, format: ExportFormat = 'xlsx') {
    this.downloading.set(true);
    this.api.exportDataset(itemType, format).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const extension = format === 'xlsx' ? 'xlsx' : format;
        anchor.href = url;
        anchor.download = itemType
          ? `${itemType}-approved.${extension}`
          : `qa-dataset-workbench.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
      },
      error: () => {
        this.notifications.error('Export failed.');
        this.downloading.set(false);
      },
    });
  }
}
