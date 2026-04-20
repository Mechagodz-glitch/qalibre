import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

import { createEmptyPayload, datasetStatusOptions, getEntityConfig } from '../../core/entity-config';
import type {
  DatasetItemType,
  DatasetStatus,
  KnowledgeScopeLevel,
  ProjectHierarchyModuleOption,
  ProjectHierarchyOption,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

@Component({
  selector: 'app-dataset-editor-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
    PageHeaderComponent,
  ],
  template: `
    @if (loading()) {
      <section class="centered"><mat-spinner diameter="40"></mat-spinner></section>
    } @else {
      <section class="page-stack">
        <app-page-header
          [title]="isEditMode() ? 'Edit ' + config().label : 'Create ' + config().label"
          [description]="config().description"
          eyebrow="Manual dataset authoring"
        >
          @if (itemId()) {
            <a mat-button [routerLink]="['/', config().route, itemId()]">View detail</a>
          }
        </app-page-header>

        <mat-card>
          <mat-card-content>
            <mat-tab-group (selectedIndexChange)="onTabChange($event)">
              <mat-tab label="Form view">
                <form class="editor-grid" [formGroup]="form" (ngSubmit)="save()">
                  <mat-form-field appearance="outline">
                    <mat-label>Status</mat-label>
                    <mat-select [formControl]="statusControl">
                      @for (status of statusOptions; track status.value) {
                        <mat-option [value]="status.value">{{ status.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  @if (isScopedItem()) {
                    <mat-form-field appearance="outline">
                      <mat-label>Project</mat-label>
                      <mat-select [formControl]="projectIdControl" (selectionChange)="onProjectChange($event.value)">
                        <mat-option value="">No project</mat-option>
                        @for (project of projectOptions(); track project.id) {
                          <mat-option [value]="project.id">{{ project.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Module</mat-label>
                      <mat-select [formControl]="moduleIdControl" (selectionChange)="onModuleChange($event.value)">
                        <mat-option value="">No module</mat-option>
                        @for (module of moduleOptions(); track module.id) {
                          <mat-option [value]="module.id">{{ module.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Page</mat-label>
                      <mat-select [formControl]="pageIdControl">
                        <mat-option value="">No page</mat-option>
                        @for (page of pageOptions(); track page.id) {
                          <mat-option [value]="page.id">{{ page.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }

                  @for (field of config().fields; track field.key) {
                    <mat-form-field appearance="outline" class="field-span">
                      <mat-label>{{ field.label }}</mat-label>
                      @if (field.type === 'textarea' || field.type === 'stringList' || field.type === 'json') {
                        <textarea
                          matInput
                          [rows]="field.rows ?? (field.type === 'stringList' ? 5 : 4)"
                          [formControl]="getControl(field.key)"
                        ></textarea>
                      } @else {
                        <input matInput [formControl]="getControl(field.key)" />
                      }
                      @if (field.hint) {
                        <mat-hint>{{ field.hint }}</mat-hint>
                      } @else if (field.type === 'stringList') {
                        <mat-hint>Enter one value per line.</mat-hint>
                      }
                      @if (field.required && getControl(field.key).invalid && getControl(field.key).touched) {
                        <mat-error>{{ field.label }} is required.</mat-error>
                      }
                    </mat-form-field>
                  }

                  <div class="editor-actions">
                    <button mat-flat-button class="brand-button" type="submit">{{ isEditMode() ? 'Save changes' : 'Create record' }}</button>
                    <a mat-button [routerLink]="isEditMode() ? ['/', config().route, itemId()] : ['/', config().route]">Cancel</a>
                  </div>
                </form>
              </mat-tab>

              <mat-tab label="JSON view">
                <section class="json-view">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Payload JSON</mat-label>
                    <textarea matInput rows="22" [formControl]="jsonControl"></textarea>
                  </mat-form-field>

                  <div class="editor-actions">
                    <button mat-flat-button class="brand-button" type="button" (click)="applyJson()">Apply JSON to form</button>
                    <button mat-button type="button" (click)="syncJsonFromForm()">Refresh from form</button>
                  </div>
                </section>
              </mat-tab>
            </mat-tab-group>
          </mat-card-content>
        </mat-card>
      </section>
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

      .editor-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        padding-top: 1rem;
      }

      .field-span,
      .full-width {
        width: 100%;
      }

      .json-view {
        padding-top: 1rem;
      }

      .editor-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        grid-column: 1 / -1;
      }

      @media (max-width: 900px) {
        .editor-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class DatasetEditorPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly itemType = this.route.snapshot.data['itemType'] as DatasetItemType;
  readonly config = computed(() => getEntityConfig(this.itemType));
  readonly itemId = signal(this.route.snapshot.paramMap.get('id'));
  readonly isEditMode = computed(() => Boolean(this.itemId()));
  readonly isScopedItem = computed(() => this.itemType === 'projectMemory');
  readonly statusOptions = datasetStatusOptions;
  readonly loading = signal(false);
  readonly projectHierarchy = signal<ProjectHierarchyOption[]>([]);

  readonly form = this.fb.group({});
  readonly statusControl = new FormControl<DatasetStatus>('draft', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly projectIdControl = new FormControl('', { nonNullable: true });
  readonly moduleIdControl = new FormControl('', { nonNullable: true });
  readonly pageIdControl = new FormControl('', { nonNullable: true });
  readonly scopeLevelControl = new FormControl<KnowledgeScopeLevel>('project', { nonNullable: true });
  readonly jsonControl = new FormControl('', { nonNullable: true });
  readonly projectOptions = computed(() => this.projectHierarchy());
  readonly selectedProject = computed(() => this.projectOptions().find((project) => project.id === this.projectIdControl.value) ?? null);
  readonly moduleOptions = computed<ProjectHierarchyModuleOption[]>(() => this.selectedProject()?.modules ?? []);
  readonly pageOptions = computed(() => this.moduleOptions().find((module) => module.id === this.moduleIdControl.value)?.pages ?? []);

  constructor() {
    this.initializeControls();
    this.loadProjectHierarchy();

    if (this.isEditMode()) {
      this.loadItem();
    } else {
      this.syncJsonFromForm();
    }
  }

  getControl(key: string) {
    return this.form.get(key) as FormControl<string>;
  }

  onTabChange(index: number) {
    if (index === 1) {
      this.syncJsonFromForm();
    }
  }

  onProjectChange(projectId: string) {
    this.projectIdControl.setValue(projectId);
    this.moduleIdControl.setValue('');
    this.pageIdControl.setValue('');
    this.scopeLevelControl.setValue(projectId ? 'project' : 'project');
  }

  onModuleChange(moduleId: string) {
    this.moduleIdControl.setValue(moduleId);
    this.pageIdControl.setValue('');
    this.scopeLevelControl.setValue(moduleId ? 'module' : this.projectIdControl.value ? 'project' : 'project');
  }

  applyJson() {
    try {
      const parsed = JSON.parse(this.jsonControl.getRawValue()) as Record<string, unknown>;
      this.patchFormFromPayload(parsed);
      this.notifications.success('JSON applied to form.');
    } catch {
      this.notifications.error('Payload JSON is invalid.');
    }
  }

  syncJsonFromForm() {
    this.jsonControl.setValue(JSON.stringify(this.buildPayloadFromForm(), null, 2));
  }

  save() {
    this.form.markAllAsTouched();
    this.statusControl.markAsTouched();

    if (this.form.invalid || this.statusControl.invalid) {
      this.notifications.error('Please resolve the validation errors before saving.');
      return;
    }

    let payload: Record<string, unknown>;

    try {
      payload = this.buildPayloadFromForm();
      this.jsonControl.setValue(JSON.stringify(payload, null, 2));
    } catch {
      this.notifications.error('One or more JSON fields are invalid.');
      return;
    }

    this.loading.set(true);

    const request$ = this.isEditMode()
      ? this.api.updateItem(this.itemType, this.itemId()!, payload, this.statusControl.getRawValue(), this.buildScopeInput())
      : this.api.createItem(this.itemType, payload, this.statusControl.getRawValue(), this.buildScopeInput());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.notifications.success(`Record ${this.isEditMode() ? 'updated' : 'created'} successfully.`);
        this.loading.set(false);
        this.router.navigate(['/', this.config().route, response.item.id]);
      },
      error: () => {
        this.notifications.error('Unable to save the record.');
        this.loading.set(false);
      },
    });
  }

  private initializeControls() {
    for (const field of this.config().fields) {
      const validators = field.required ? [Validators.required] : [];
      this.form.addControl(field.key, new FormControl<string>('', { nonNullable: true, validators }));
    }

    this.patchFormFromPayload(createEmptyPayload(this.itemType));
  }

  private loadItem() {
    this.loading.set(true);
    this.api
      .getItem(this.itemType, this.itemId()!)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.patchFormFromPayload(response.item.payload);
          this.statusControl.setValue(response.item.status === 'archived' ? 'draft' : response.item.status);
          this.projectIdControl.setValue(response.item.project?.id ?? '');
          this.moduleIdControl.setValue(response.item.module?.id ?? '');
          this.pageIdControl.setValue(response.item.page?.id ?? '');
          this.scopeLevelControl.setValue(
            response.item.scopeLevel ?? (response.item.page?.id ? 'page' : response.item.module?.id ? 'module' : 'project'),
          );
          this.syncJsonFromForm();
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load the record for editing.');
          this.loading.set(false);
        },
      });
  }

  private patchFormFromPayload(payload: Record<string, unknown>) {
    for (const field of this.config().fields) {
      const control = this.getControl(field.key);
      const value = payload[field.key];

      if (field.type === 'stringList') {
        control.setValue(Array.isArray(value) ? value.join('\n') : '');
      } else if (field.type === 'json') {
        control.setValue(JSON.stringify(value ?? [], null, 2));
      } else {
        control.setValue(typeof value === 'string' ? value : '');
      }
    }
  }

  private buildPayloadFromForm(): Record<string, unknown> {
    return Object.fromEntries(
      this.config().fields.map((field) => {
        const rawValue = this.getControl(field.key).getRawValue();

        if (field.type === 'stringList') {
          return [
            field.key,
            rawValue
              .split(/\r?\n|,/)
              .map((value) => value.trim())
              .filter(Boolean),
          ] as const;
        }

        if (field.type === 'json') {
          return [field.key, rawValue.trim() ? JSON.parse(rawValue) : []] as const;
        }

        return [field.key, rawValue.trim()] as const;
      }),
    );
  }

  private loadProjectHierarchy() {
    this.api
      .getKnowledgeBaseWorkspace(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (workspace) => this.projectHierarchy.set(workspace.projectHierarchy),
      });
  }

  private buildScopeInput() {
    if (!this.isScopedItem()) {
      return undefined;
    }

    const projectId = this.projectIdControl.getRawValue() || undefined;
    const moduleId = this.moduleIdControl.getRawValue() || undefined;
    const pageId = this.pageIdControl.getRawValue() || undefined;

    return {
      projectId,
      moduleId,
      pageId,
      scopeLevel: (pageId ? 'page' : moduleId ? 'module' : projectId ? 'project' : undefined) as
        | 'project'
        | 'module'
        | 'page'
        | undefined,
    };
  }
}
