import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { switchMap } from 'rxjs/operators';

import type { ManualExecutionReport } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import {
  formatManualExecutionDate,
  formatManualExecutionRunScope,
  getManualExecutionRunStatusLabel,
} from './manual-execution.utils';

@Component({
  selector: 'app-manual-execution-report-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manual-execution-report-page.component.html',
  styleUrl: './manual-execution-report-page.component.scss',
})
export class ManualExecutionReportPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly report = signal<ManualExecutionReport | null>(null);
  readonly donutGradient = computed(() => {
    const report = this.report();
    if (!report) {
      return 'conic-gradient(#d7e8f1 0deg, #d7e8f1 360deg)';
    }

    const total = Math.max(report.run.totals.total, 1);
    let cursor = 0;
    const segments = report.charts.statusBreakdown.map((item) => {
      const slice = (item.value / total) * 360;
      const start = cursor;
      const end = cursor + slice;
      cursor = end;
      return `${item.color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });

  constructor() {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => this.api.getManualExecutionReport(params.get('runId') ?? '')),
      )
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.notifications.error('Complete the run before viewing or exporting its report.');
            const runId = this.route.snapshot.paramMap.get('runId');
            if (runId) {
              void this.router.navigate(['/manual-execution/test-execution', runId]);
            }
          } else {
            this.notifications.error('Unable to load the manual execution report.');
          }
          this.loading.set(false);
        },
      });
  }

  formatDate(value: string | null) {
    return formatManualExecutionDate(value);
  }

  formatScope(run: ManualExecutionReport['run']) {
    return formatManualExecutionRunScope(run);
  }

  statusLabel(status: ManualExecutionReport['run']['status']) {
    return getManualExecutionRunStatusLabel(status);
  }

  caseStatusLabel(status: ManualExecutionReport['caseResults'][number]['status']) {
    return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  }

  maxBreakdownTotal(values: Array<{ total: number }>) {
    return Math.max(...values.map((item) => item.total), 1);
  }

  maxValue(values: Array<{ value: number }>) {
    return Math.max(...values.map((item) => item.value), 1);
  }

  exportWorkbook() {
    const report = this.report();
    if (!report) {
      return;
    }

    this.api
      .exportManualExecutionRun(report.run.id, 'xlsx')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => this.downloadBlob(blob, `${report.run.name.replace(/\s+/g, '-').toLowerCase()}-execution-report.xlsx`),
        error: () => this.notifications.error('Unable to export the execution workbook.'),
      });
  }

  async printReport() {
    const report = this.report();
    if (!report) {
      return;
    }

    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable =
        (autoTableModule as { default?: unknown; autoTable?: unknown }).default ??
        (autoTableModule as { default?: unknown; autoTable?: unknown }).autoTable;
      if (typeof autoTable !== 'function') {
        throw new Error('PDF table renderer unavailable.');
      }
      const autoTableFn = autoTable as (doc: InstanceType<(typeof import('jspdf'))['jsPDF']>, options: unknown) => void;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        putOnlyUsedFonts: true,
        compress: true,
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 38;
      const pageContentWidth = pageWidth - marginX * 2;
      const tableMarginX = 30;
      const tableContentWidth = pageWidth - tableMarginX * 2;
      let cursorY = 54;

      this.drawPdfSummaryHeading(doc, pageWidth, cursorY);
      cursorY += 36;
      cursorY = this.drawPdfRunContextCard(doc, report, marginX, cursorY, pageContentWidth);
      cursorY += 16;
      this.drawPdfExecutionOverviewCard(doc, report, marginX, cursorY, pageContentWidth);

      doc.addPage();
      this.drawPdfDetailedResultsHeading(doc, marginX, 58);

      autoTableFn(doc, {
        startY: 88,
        margin: { top: 88, right: tableMarginX, bottom: 36, left: tableMarginX },
        tableWidth: tableContentWidth,
        head: [[
          'Suite',
          'Case ID',
          'Title',
          'Feature',
          'Scenario',
          'Test Type',
          'Status',
          'Comment',
          'Defect Link',
          'Executed By',
          'Executed At',
        ]],
        body: report.caseResults.map((caseResult) => [
          caseResult.suiteTitle,
          caseResult.sourceCaseId,
          caseResult.title,
          caseResult.feature,
          caseResult.scenario,
          caseResult.testType,
          this.caseStatusLabel(caseResult.status),
          caseResult.comment || '-',
          caseResult.defectLink || '-',
          caseResult.executedBy || '-',
          this.formatDate(caseResult.executedAt),
        ]),
        styles: {
          font: 'helvetica',
          fontSize: 7,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          lineColor: [221, 229, 238],
          lineWidth: 0.6,
          textColor: [21, 59, 71],
          overflow: 'linebreak',
          valign: 'top',
        },
        headStyles: {
          fillColor: [241, 246, 252],
          textColor: [88, 117, 138],
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'left',
        },
        alternateRowStyles: {
          fillColor: [250, 252, 255],
        },
        columnStyles: {
          0: { cellWidth: 42 },
          1: { cellWidth: 40 },
          2: { cellWidth: 110 },
          3: { cellWidth: 42 },
          4: { cellWidth: 44 },
          5: { cellWidth: 38 },
          6: { cellWidth: 34 },
          7: { cellWidth: 58 },
          8: { cellWidth: 40 },
          9: { cellWidth: 38 },
          10: { cellWidth: 49 },
        },
        didDrawPage: (_data: unknown) => {
          if (
            typeof _data === 'object' &&
            _data &&
            'pageNumber' in _data &&
            typeof (_data as { pageNumber: unknown }).pageNumber === 'number' &&
            (_data as { pageNumber: number }).pageNumber > 1
          ) {
            this.drawPdfDetailedResultsHeading(doc, marginX, 58);
          }
        },
      });

      this.downloadBlob(
        doc.output('blob'),
        `${report.run.name.replace(/\s+/g, '-').toLowerCase()}-execution-summary.pdf`,
      );
      this.notifications.success('PDF report downloaded.');
    } catch {
      this.notifications.error('Unable to generate the PDF report.');
    }
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }

  private drawPdfSummaryHeading(doc: InstanceType<(typeof import('jspdf'))['jsPDF']>, pageWidth: number, y: number) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(12, 32, 74);
    const heading = 'Test Execution Summary';
    doc.text(heading, pageWidth / 2, y, { align: 'center' });
    const headingWidth = doc.getTextWidth(heading);
    doc.setDrawColor(12, 32, 74);
    doc.setLineWidth(1);
    doc.line((pageWidth - headingWidth) / 2, y + 5, (pageWidth + headingWidth) / 2, y + 5);
  }

  private drawPdfRunContextCard(
    doc: InstanceType<(typeof import('jspdf'))['jsPDF']>,
    report: ManualExecutionReport,
    x: number,
    y: number,
    width: number,
  ) {
    const cardHeight = 188;
    this.drawPdfCard(doc, x, y, width, cardHeight, [248, 251, 255], [220, 230, 239]);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(103, 128, 144);
    doc.text('RUN CONTEXT', x + 18, y + 20);

    doc.setFontSize(15);
    doc.setTextColor(16, 58, 69);
    doc.text('Execution details', x + 18, y + 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(88, 113, 129);
    doc.text(
      doc.splitTextToSize(this.formatScope(report.run) || report.run.project.name, width - 36),
      x + 18,
      y + 56,
      {
        maxWidth: width - 36,
      },
    );

    const tileGap = 10;
    const tileWidth = (width - tileGap * 2 - 36) / 3;
    const tileY = y + 74;
    const tileHeight = 42;
    const tiles: Array<{ label: string; value: string; tone: [number, number, number][] }> = [
      { label: 'Project', value: report.run.project.name, tone: [[247, 250, 255], [236, 245, 255]] },
      { label: 'Module', value: report.run.module?.name ?? 'Mixed selection', tone: [[247, 250, 255], [240, 246, 253]] },
      { label: 'Page', value: report.run.page?.name ?? 'Mixed selection', tone: [[247, 250, 255], [240, 246, 253]] },
      { label: 'Feature', value: report.run.feature?.name ?? 'Mixed selection', tone: [[247, 250, 255], [240, 246, 253]] },
      { label: 'Created', value: this.formatDate(report.run.createdAt), tone: [[247, 250, 255], [240, 246, 253]] },
      { label: 'Completed', value: this.formatDate(report.run.completedAt), tone: [[247, 250, 255], [240, 246, 253]] },
      { label: 'Run status', value: this.statusLabel(report.run.status), tone: [[235, 249, 240], [245, 252, 247]] },
    ];

    tiles.forEach((tile, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      const tileX = x + 18 + column * (tileWidth + tileGap);
      const currentTileY = tileY + row * (tileHeight + tileGap);
      this.drawPdfCard(doc, tileX, currentTileY, tileWidth, tileHeight, tile.tone[0], [224, 232, 239], 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(104, 129, 145);
      doc.text(tile.label.toUpperCase(), tileX + 12, currentTileY + 14);
      doc.setFontSize(9.5);
      doc.setTextColor(18, 58, 69);
      doc.text(doc.splitTextToSize(tile.value, tileWidth - 24), tileX + 12, currentTileY + 27, {
        maxWidth: tileWidth - 24,
      });
    });

    return y + cardHeight;
  }

  private drawPdfExecutionOverviewCard(
    doc: InstanceType<(typeof import('jspdf'))['jsPDF']>,
    report: ManualExecutionReport,
    x: number,
    y: number,
    width: number,
  ) {
    const cardHeight = 242;
    this.drawPdfCard(doc, x, y, width, cardHeight, [251, 252, 255], [220, 230, 239]);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(103, 128, 144);
    doc.text('EXECUTION OVERVIEW', x + 18, y + 20);

    const ringCenterX = x + 82;
    const ringCenterY = y + 96;
    doc.setDrawColor(214, 225, 235);
    doc.setLineWidth(11);
    doc.circle(ringCenterX, ringCenterY, 34, 'S');
    doc.setDrawColor(37, 99, 235);
    doc.circle(ringCenterX, ringCenterY, 34, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(16, 58, 69);
    doc.text(`${report.run.totals.completionPercent}%`, ringCenterX, ringCenterY - 4, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(103, 128, 144);
    doc.text('COMPLETE', ringCenterX, ringCenterY + 12, { align: 'center' });

    let legendY = y + 60;
    report.charts.statusBreakdown.forEach((item) => {
      const color = this.hexToRgb(item.color);
      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(x + 150, legendY - 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(21, 59, 71);
      doc.text(item.label, x + 160, legendY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 124, 139);
      doc.text(`${item.value} cases`, x + 225, legendY);
      legendY += 18;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(16, 58, 69);
    doc.text(`${report.run.suiteCount} suites | ${report.run.totals.total} cases`, x + 270, y + 34);

    const metricTileWidth = 120;
    const metricTileHeight = 46;
    const metricGap = 10;
    const metricStartX = x + 270;
    const metricStartY = y + 56;
    const metricTones: Array<[number, number, number]> = [
      [235, 249, 240],
      [255, 245, 247],
      [255, 249, 237],
      [246, 249, 252],
    ];
    const metrics = [
      { label: 'Passed', value: `${report.run.totals.passed}` },
      { label: 'Failed', value: `${report.run.totals.failed}` },
      { label: 'Skipped', value: `${report.run.totals.skipped}` },
      { label: 'Untested', value: `${report.run.totals.untested}` },
    ];

    metrics.forEach((metric, index) => {
      const tileX = metricStartX + (index % 2) * (metricTileWidth + metricGap);
      const tileY = metricStartY + Math.floor(index / 2) * (metricTileHeight + metricGap);
      this.drawPdfCard(doc, tileX, tileY, metricTileWidth, metricTileHeight, metricTones[index], [224, 232, 239], 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(16, 58, 69);
      doc.text(metric.value, tileX + 12, tileY + 20);
      doc.setFontSize(7);
      doc.setTextColor(103, 128, 144);
      doc.text(metric.label.toUpperCase(), tileX + 12, tileY + 35);
    });

    const suitesText = report.run.suites.map((suite) => suite.suiteTitle).join(' | ');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(23, 61, 87);
    doc.text('SUITES', x + 18, y + 168);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(78, 104, 120);
    doc.text(doc.splitTextToSize(suitesText, width - 36), x + 18, y + 186, {
      maxWidth: width - 36,
    });
  }

  private drawPdfDetailedResultsHeading(
    doc: InstanceType<(typeof import('jspdf'))['jsPDF']>,
    x: number,
    y: number,
  ) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(12, 32, 74);
    doc.text('Detailed Results', x, y);
    doc.setDrawColor(12, 32, 74);
    doc.setLineWidth(0.8);
    doc.line(x, y + 6, x + 94, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(103, 128, 144);
    doc.text('Executed testcase outcomes', x, y + 20);
  }

  private drawPdfCard(
    doc: InstanceType<(typeof import('jspdf'))['jsPDF']>,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: [number, number, number],
    stroke: [number, number, number],
    radius = 14,
  ) {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, width, height, radius, radius, 'FD');
  }

  private hexToRgb(value: string): [number, number, number] {
    const normalized = value.replace('#', '').trim();
    if (normalized.length !== 6) {
      return [37, 99, 235];
    }

    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ];
  }
}
