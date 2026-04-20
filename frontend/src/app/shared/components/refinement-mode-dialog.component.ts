import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { refinementModeOptions } from '../../core/entity-config';
import type { RefinementMode } from '../../core/models';

@Component({
  selector: 'app-refinement-mode-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Start AI Refinement</h2>
    <mat-dialog-content class="dialog-content">
      <p>
        Selected items: <strong>{{ data.itemCount }}</strong>
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Refinement mode</mat-label>
        <mat-select [formControl]="modeControl">
          @for (option of options; track option.value) {
            <mat-option [value]="option.value">
              {{ option.label }}: {{ option.description }}
            </mat-option>
          }
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button type="button" class="brand-button" [disabled]="modeControl.invalid" (click)="submit()">
        Run refinement
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: min(32rem, 90vw);
      }

      .full-width {
        width: 100%;
      }
    `,
  ],
})
export class RefinementModeDialogComponent {
  readonly dialogRef = inject(MatDialogRef<RefinementModeDialogComponent>);
  readonly data = inject<{ itemCount: number; mode?: RefinementMode }>(MAT_DIALOG_DATA);
  readonly options = refinementModeOptions;
  readonly modeControl = new FormControl<RefinementMode>(this.data.mode ?? 'normalize', {
    nonNullable: true,
    validators: [Validators.required],
  });

  submit() {
    if (this.modeControl.invalid) {
      return;
    }

    this.dialogRef.close(this.modeControl.getRawValue());
  }
}
