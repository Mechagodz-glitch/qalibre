import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import type { CoverageAnalysis } from '../../core/models';

export type CoverageAnalysisDialogData = {
  suiteTitle: string;
  suitePath: string | null;
  coverageSummary: string[];
  analysis: CoverageAnalysis;
};

@Component({
  selector: 'app-coverage-analysis-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Coverage Analysis</h2>

    <mat-dialog-content class="coverage-dialog">
      <section class="coverage-hero">
        <div class="coverage-hero__copy">
          <p class="coverage-kicker">Coverage confidence</p>
          <h3>{{ scorePercent }}%</h3>
          <p>{{ quotaLabel }}</p>
          <strong>{{ data.suiteTitle }}</strong>
          @if (data.suitePath) {
            <span>{{ data.suitePath }}</span>
          }
        </div>
        <div class="coverage-hero__score">
          <strong>{{ scorePercent }}%</strong>
          <span>{{ quotaLabel }}</span>
        </div>
      </section>

      <section class="coverage-stats">
        <article>
          <strong>{{ data.analysis.unitsCovered }}</strong>
          <span>Units covered</span>
        </article>
        <article>
          <strong>{{ data.analysis.unitsIdentified }}</strong>
          <span>Units identified</span>
        </article>
        <article>
          <strong>{{ data.analysis.missingRequestedFeatures.length }}</strong>
          <span>Missing requested features</span>
        </article>
        <article>
          <strong>{{ data.analysis.unknownAreas.length }}</strong>
          <span>Unknown from weak input</span>
        </article>
      </section>

      @if (data.coverageSummary.length) {
        <section class="coverage-section">
          <h4>Planner summary</h4>
          <ul class="coverage-bullets">
            @for (line of data.coverageSummary; track line) {
              <li>{{ line }}</li>
            }
          </ul>
        </section>
      }

      @if (data.analysis.missingRequestedFeatures.length) {
        <section class="coverage-section">
          <h4>Missing requested features</h4>
          <div class="coverage-chip-row">
            @for (feature of data.analysis.missingRequestedFeatures; track feature) {
              <span class="coverage-chip">{{ feature }}</span>
            }
          </div>
        </section>
      }

      @if (data.analysis.missingBuckets.length) {
        <section class="coverage-section">
          <h4>Weak scenario buckets</h4>
          <div class="coverage-chip-row">
            @for (bucket of data.analysis.missingBuckets; track bucket.key) {
              <span class="coverage-chip">
                {{ bucket.label }}
                @if (bucket.expected != null && bucket.actual != null) {
                  <small>{{ bucket.actual }}/{{ bucket.expected }}</small>
                }
              </span>
            }
          </div>
        </section>
      }

      @if (data.analysis.underCoveredUnits.length) {
        <section class="coverage-section">
          <h4>Under-covered units</h4>
          <div class="coverage-chip-row">
            @for (unit of data.analysis.underCoveredUnits; track unit.key) {
              <span class="coverage-chip">
                {{ unit.label }}
                @if (unit.expected != null && unit.actual != null) {
                  <small>{{ unit.actual }}/{{ unit.expected }}</small>
                }
              </span>
            }
          </div>
        </section>
      }

      @if (data.analysis.missingScenarioTypesByUnit.length) {
        <section class="coverage-section">
          <h4>Missing scenario types by unit</h4>
          <div class="coverage-chip-row">
            @for (unit of data.analysis.missingScenarioTypesByUnit; track unit.key) {
              <span class="coverage-chip">
                {{ unit.label }}
                @if (unit.missingScenarioTypes?.length) {
                  <small>{{ unit.missingScenarioTypes!.join(', ') }}</small>
                }
              </span>
            }
          </div>
        </section>
      }

      @if (data.analysis.unknownAreas.length) {
        <section class="coverage-section">
          <h4>Unknown due to weak source evidence</h4>
          <div class="coverage-chip-row">
            @for (gap of data.analysis.unknownAreas; track gap) {
              <span class="coverage-chip coverage-chip--unknown">{{ gap }}</span>
            }
          </div>
        </section>
      }

      @if (data.analysis.retryTriggered || data.analysis.retryTriggeredForMissingFeatures) {
        <section class="coverage-note">
          @if (data.analysis.retryTriggered) {
            <span>Retry remediation ran for this suite.</span>
          }
          @if (data.analysis.retryTriggeredForMissingFeatures) {
            <span>Retry specifically targeted missing requested features.</span>
          }
        </section>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .coverage-dialog {
        display: grid;
        gap: 1rem;
        min-width: min(58rem, 92vw);
        padding-top: 0.25rem;
      }

      .coverage-hero {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
        padding: 1rem 1.05rem;
        border-radius: 1.15rem;
        background: linear-gradient(180deg, rgba(236, 248, 255, 0.96), rgba(247, 252, 255, 0.98));
        border: 1px solid rgba(18, 70, 89, 0.08);
      }

      .coverage-hero__copy {
        display: grid;
        gap: 0.18rem;
      }

      .coverage-kicker {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.72rem;
        color: #688394;
        font-weight: 700;
      }

      .coverage-hero__copy h3 {
        margin: 0;
        font-size: 1.15rem;
        color: #153b4c;
      }

      .coverage-hero__copy p,
      .coverage-hero__copy span {
        margin: 0;
        color: #5e7686;
      }

      .coverage-hero__copy strong {
        margin-top: 0.12rem;
        color: #153b4c;
        font-size: 0.98rem;
      }

      .coverage-hero__score {
        display: grid;
        gap: 0.2rem;
        min-width: 8.5rem;
        padding: 0.9rem 1rem;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(18, 70, 89, 0.08);
        text-align: right;
      }

      .coverage-hero__score strong {
        font-size: 1.6rem;
        line-height: 1;
        color: #0d5d63;
      }

      .coverage-hero__score span {
        color: #4f6c7a;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .coverage-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .coverage-stats article {
        display: grid;
        gap: 0.18rem;
        padding: 0.9rem 0.95rem;
        border-radius: 0.95rem;
        background: rgba(247, 251, 253, 0.92);
        border: 1px solid rgba(18, 70, 89, 0.08);
      }

      .coverage-stats strong {
        font-size: 1.2rem;
        color: #163f51;
      }

      .coverage-stats span {
        color: #607987;
        font-size: 0.8rem;
      }

      .coverage-section {
        display: grid;
        gap: 0.55rem;
      }

      .coverage-section h4 {
        margin: 0;
        font-size: 0.92rem;
        color: #1e4557;
      }

      .coverage-bullets {
        display: grid;
        gap: 0.35rem;
        margin: 0;
        padding-left: 1.1rem;
        color: #4f6876;
      }

      .coverage-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .coverage-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.42rem;
        min-height: 2rem;
        padding: 0.4rem 0.7rem;
        border-radius: 999px;
        background: rgba(226, 244, 252, 0.82);
        color: #224858;
        font-size: 0.82rem;
        font-weight: 600;
      }

      .coverage-chip small {
        color: #507081;
        font-size: 0.72rem;
        font-weight: 700;
      }

      .coverage-chip--unknown {
        background: rgba(255, 237, 208, 0.82);
      }

      .coverage-note {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.8rem 0.9rem;
        border-radius: 0.95rem;
        background: rgba(226, 244, 252, 0.72);
        color: #234657;
        font-size: 0.82rem;
        font-weight: 600;
      }

      @media (max-width: 840px) {
        .coverage-dialog {
          min-width: min(34rem, 92vw);
        }

        .coverage-hero {
          grid-template-columns: 1fr;
          display: grid;
        }

        .coverage-hero__score {
          text-align: left;
          min-width: 0;
        }

        .coverage-stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class CoverageAnalysisDialogComponent {
  readonly data = inject<CoverageAnalysisDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CoverageAnalysisDialogComponent>);

  get scorePercent() {
    return Math.round((this.data.analysis.overallScore || 0) * 100);
  }

  get quotaLabel() {
    if (this.data.analysis.quotaStatus === 'met') {
      return 'Covered';
    }
    if (this.data.analysis.quotaStatus === 'partially_met') {
      return 'Needs review';
    }
    return 'Missing areas';
  }

  close() {
    this.dialogRef.close();
  }
}
