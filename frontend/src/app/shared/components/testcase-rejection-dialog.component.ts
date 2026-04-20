import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import type { TestCaseFeedbackReason } from '../../core/models';

export type TestcaseRejectionDialogData = {
  caseTitle: string;
  reasons: Array<{ value: TestCaseFeedbackReason; label: string }>;
  initialValue: {
    reasonCode: TestCaseFeedbackReason;
    reasonDetails: string;
    replacementSummary: string;
    reviewerNotes: string;
  };
};

export type TestcaseRejectionDialogResult = {
  reasonCode: TestCaseFeedbackReason;
  reasonDetails: string;
  replacementSummary: string;
  reviewerNotes: string;
};

@Component({
  selector: 'app-testcase-rejection-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Reject Testcase</h2>
    <mat-dialog-content class="dialog-content">
      <p class="dialog-copy">
        Record the rejection reason for this testcase so the feedback loop can reuse it safely later.
      </p>

      <div class="case-title">{{ data.caseTitle }}</div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Rejection reason</mat-label>
        <mat-select [formControl]="form.controls.reasonCode">
          @for (reason of data.reasons; track reason.value) {
            <mat-option [value]="reason.value">{{ reason.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>What was wrong</mat-label>
        <textarea matInput rows="2" [formControl]="form.controls.reasonDetails"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>What should have happened instead</mat-label>
        <textarea matInput rows="2" [formControl]="form.controls.replacementSummary"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Reviewer note</mat-label>
        <textarea matInput rows="2" [formControl]="form.controls.reviewerNotes"></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button type="button" color="warn" [disabled]="form.invalid" (click)="submit()">
        Save rejection
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: min(32rem, 92vw);
      }

      .dialog-copy {
        margin: 0;
        color: rgba(27, 45, 64, 0.72);
      }

      .case-title {
        border-radius: 1rem;
        background: rgba(220, 235, 247, 0.55);
        padding: 0.9rem 1rem;
        color: #163548;
        font-weight: 600;
        line-height: 1.45;
      }

      .full-width {
        width: 100%;
      }
    `,
  ],
})
export class TestcaseRejectionDialogComponent {
  readonly dialogRef = inject(
    MatDialogRef<TestcaseRejectionDialogComponent, TestcaseRejectionDialogResult | undefined>,
  );
  readonly data = inject<TestcaseRejectionDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    reasonCode: [this.data.initialValue.reasonCode, [Validators.required]],
    reasonDetails: [this.data.initialValue.reasonDetails],
    replacementSummary: [this.data.initialValue.replacementSummary],
    reviewerNotes: [this.data.initialValue.reviewerNotes],
  });

  submit() {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      reasonCode: value.reasonCode,
      reasonDetails: value.reasonDetails.trim(),
      replacementSummary: value.replacementSummary.trim(),
      reviewerNotes: value.reviewerNotes.trim(),
    });
  }
}
