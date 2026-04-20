import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import type {
  ApprovedExecutionSuite,
  ManualExecutionBootstrap,
  ManualExecutionSelectableCase,
  ManualExecutionUploadedSuite,
  ProjectHierarchyFeatureOption,
  ProjectHierarchyModuleOption,
  ProjectHierarchyOption,
  ProjectHierarchyPageOption,
  TestGenerationDraft,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { AuthService } from '../../core/auth.service';
import { formatManualExecutionDate } from './manual-execution.utils';

type ManualExecutionScopeInputMode = 'existing' | 'new';

@Component({
  selector: 'app-manual-execution-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manual-execution-page.component.html',
  styleUrl: './manual-execution-page.component.scss',
})
export class ManualExecutionPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly formRevision = signal(0);

  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly bootstrap = signal<ManualExecutionBootstrap | null>(null);
  readonly suites = signal<ApprovedExecutionSuite[]>([]);
  readonly uploadedSuites = signal<ManualExecutionUploadedSuite[]>([]);
  readonly suiteSearch = signal('');
  readonly selectedApprovedCaseIds = signal<Record<string, string[]>>({});
  readonly selectedUploadedCaseIds = signal<Record<string, string[]>>({});
  readonly expandedApprovedSuites = signal<string[]>([]);
  readonly expandedUploadedSuites = signal<string[]>([]);
  readonly importInProgress = signal(false);
  readonly approvedSuiteCaseLoading = signal<Record<string, boolean>>({});
  readonly projectInputMode = signal<ManualExecutionScopeInputMode>('existing');
  readonly moduleInputMode = signal<ManualExecutionScopeInputMode>('existing');
  readonly pageInputMode = signal<ManualExecutionScopeInputMode>('existing');
  readonly featureInputMode = signal<ManualExecutionScopeInputMode>('existing');

  readonly form = this.fb.nonNullable.group({
    projectId: [''],
    projectName: [''],
    moduleId: [''],
    moduleName: [''],
    pageId: [''],
    pageName: [''],
    featureId: [''],
    featureName: [''],
    name: ['Manual Execution Run', Validators.required],
    environment: [''],
    buildVersion: [''],
    assignedTester: [''],
    notes: [''],
  });

  readonly projects = computed(() => this.bootstrap()?.projectHierarchy ?? []);
  readonly testerOptions = computed(() => {
    const currentUser = this.auth.currentUser();
    if (currentUser) {
      return [
        {
          id: currentUser.id,
          name: currentUser.name,
          roleTitle: currentUser.role === 'ADMIN' ? 'Admin user' : 'Signed-in user',
        },
      ];
    }

    return this.bootstrap()?.testerOptions ?? [];
  });
  readonly currentUser = this.auth.currentUser;
  readonly selectedProject = computed<ProjectHierarchyOption | null>(() => {
    this.formRevision();
    if (this.projectInputMode() !== 'existing') {
      return null;
    }
    const projectId = this.form.controls.projectId.value;
    return this.projects().find((project) => project.id === projectId) ?? null;
  });
  readonly modules = computed<ProjectHierarchyModuleOption[]>(() => {
    this.formRevision();
    return this.selectedProject()?.modules ?? [];
  });
  readonly selectedModule = computed<ProjectHierarchyModuleOption | null>(() => {
    this.formRevision();
    if (this.moduleInputMode() !== 'existing') {
      return null;
    }
    const moduleId = this.form.controls.moduleId.value;
    return this.modules().find((moduleItem) => moduleItem.id === moduleId) ?? null;
  });
  readonly pages = computed<ProjectHierarchyPageOption[]>(() => {
    this.formRevision();
    return this.selectedModule()?.pages ?? [];
  });
  readonly selectedPage = computed<ProjectHierarchyPageOption | null>(() => {
    this.formRevision();
    if (this.pageInputMode() !== 'existing') {
      return null;
    }
    const pageId = this.form.controls.pageId.value;
    return this.pages().find((page) => page.id === pageId) ?? null;
  });
  readonly availableFeatures = computed<ProjectHierarchyFeatureOption[]>(() => {
    this.formRevision();
    return this.selectedPage()?.features ?? [];
  });
  readonly selectedFeature = computed<ProjectHierarchyFeatureOption | null>(() => {
    this.formRevision();
    if (this.featureInputMode() !== 'existing') {
      return null;
    }
    const featureId = this.form.controls.featureId.value;
    return this.availableFeatures().find((feature) => feature.id === featureId) ?? null;
  });
  readonly allowsApprovedSuiteSelection = computed(
    () =>
      this.projectInputMode() === 'existing' &&
      this.moduleInputMode() === 'existing' &&
      this.pageInputMode() === 'existing' &&
      this.featureInputMode() === 'existing' &&
      Boolean(this.form.controls.projectId.value),
  );
  readonly filteredSuites = computed(() => {
    if (!this.allowsApprovedSuiteSelection()) {
      return [];
    }

    const search = this.suiteSearch().trim().toLowerCase();
    if (!search) {
      return this.suites();
    }

    return this.suites().filter((suite) =>
      [suite.title, suite.summary ?? '', suite.suiteContext.path ?? ''].join(' ').toLowerCase().includes(search),
    );
  });
  readonly filteredUploadedSuites = computed(() => {
    const search = this.suiteSearch().trim().toLowerCase();
    if (!search) {
      return this.uploadedSuites();
    }

    return this.uploadedSuites().filter((suite) =>
      [suite.title, suite.summary ?? '', suite.sourceFileName].join(' ').toLowerCase().includes(search),
    );
  });
  readonly selectedSuiteCount = computed(
    () =>
      Object.values(this.selectedApprovedCaseIds()).filter((ids) => ids.length > 0).length +
      Object.values(this.selectedUploadedCaseIds()).filter((ids) => ids.length > 0).length,
  );
  readonly selectedCaseCount = computed(
    () =>
      Object.values(this.selectedApprovedCaseIds()).reduce((total, ids) => total + ids.length, 0) +
      Object.values(this.selectedUploadedCaseIds()).reduce((total, ids) => total + ids.length, 0),
  );
  readonly projectMetrics = computed(() => ({
    approvedSuites: this.suites().length,
    readyCases: this.suites().reduce((total, suite) => total + suite.caseCount, 0),
    selectedSuites: this.selectedSuiteCount(),
    selectedCases: this.selectedCaseCount(),
  }));
  readonly selectedScopePath = computed(() => {
    this.formRevision();
    return [
      this.effectiveProjectName(),
      this.effectiveModuleName(),
      this.effectivePageName(),
      this.effectiveFeatureName(),
    ]
      .filter(Boolean)
      .join(' / ');
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formRevision.update((value) => value + 1);
    });

    this.form.controls.projectId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((projectId) => {
      if (this.projectInputMode() !== 'existing') {
        return;
      }

      this.form.controls.moduleId.setValue('', { emitEvent: false });
      this.form.controls.pageId.setValue('', { emitEvent: false });
      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      } else {
        this.suites.set([]);
      }
    });

    this.form.controls.moduleId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.moduleInputMode() !== 'existing') {
        return;
      }

      this.form.controls.pageId.setValue('', { emitEvent: false });
      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      const projectId = this.form.controls.projectId.value;
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      }
    });

    this.form.controls.pageId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.pageInputMode() !== 'existing') {
        return;
      }

      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      const projectId = this.form.controls.projectId.value;
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      }
    });

    this.form.controls.featureId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.featureInputMode() !== 'existing') {
        return;
      }

      this.clearApprovedSelections();
      const projectId = this.form.controls.projectId.value;
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      }
    });

    this.loadBootstrap();
  }

  setProjectInputMode(mode: ManualExecutionScopeInputMode) {
    if (mode === this.projectInputMode()) {
      return;
    }

    this.projectInputMode.set(mode);

    if (mode === 'new') {
      this.form.controls.projectId.setValue('', { emitEvent: false });
      this.form.controls.moduleId.setValue('', { emitEvent: false });
      this.form.controls.pageId.setValue('', { emitEvent: false });
      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedScopeState();
    } else {
      this.form.controls.projectName.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      const nextProjectId = this.projects()[0]?.id ?? '';
      this.form.controls.projectId.setValue(nextProjectId, { emitEvent: false });
      if (nextProjectId) {
        void this.loadProjectData(nextProjectId);
      } else {
        this.suites.set([]);
      }
    }

    this.formRevision.update((value) => value + 1);
  }

  setModuleInputMode(mode: ManualExecutionScopeInputMode) {
    if (mode === this.moduleInputMode()) {
      return;
    }

    this.moduleInputMode.set(mode);

    if (mode === 'new') {
      this.form.controls.moduleId.setValue('', { emitEvent: false });
      this.form.controls.pageId.setValue('', { emitEvent: false });
      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedScopeState();
    } else {
      this.form.controls.moduleName.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      const projectId = this.form.controls.projectId.value;
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      } else {
        this.suites.set([]);
      }
    }

    this.formRevision.update((value) => value + 1);
  }

  setPageInputMode(mode: ManualExecutionScopeInputMode) {
    if (mode === this.pageInputMode()) {
      return;
    }

    this.pageInputMode.set(mode);

    if (mode === 'new') {
      this.form.controls.pageId.setValue('', { emitEvent: false });
      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedScopeState();
    } else {
      this.form.controls.pageName.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      const projectId = this.form.controls.projectId.value;
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      } else {
        this.suites.set([]);
      }
    }

    this.formRevision.update((value) => value + 1);
  }

  setFeatureInputMode(mode: ManualExecutionScopeInputMode) {
    if (mode === this.featureInputMode()) {
      return;
    }

    this.featureInputMode.set(mode);

    if (mode === 'new') {
      this.form.controls.featureId.setValue('', { emitEvent: false });
      this.clearApprovedScopeState();
    } else {
      this.form.controls.featureName.setValue('', { emitEvent: false });
      this.clearApprovedSelections();
      const projectId = this.form.controls.projectId.value;
      if (projectId && this.allowsApprovedSuiteSelection()) {
        void this.loadProjectData(projectId);
      } else {
        this.suites.set([]);
      }
    }

    this.formRevision.update((value) => value + 1);
  }

  effectiveProjectName() {
    return this.projectInputMode() === 'new'
      ? this.form.controls.projectName.value.trim()
      : (this.selectedProject()?.name ?? '').trim();
  }

  effectiveModuleName() {
    return this.moduleInputMode() === 'new'
      ? this.form.controls.moduleName.value.trim()
      : (this.selectedModule()?.name ?? '').trim();
  }

  effectivePageName() {
    if (this.pageInputMode() === 'new') {
      return this.form.controls.pageName.value.trim();
    }

    if (!this.form.controls.pageId.value) {
      return '';
    }

    return (this.pages().find((page) => page.id === this.form.controls.pageId.value)?.name ?? '').trim();
  }

  effectiveFeatureName() {
    if (this.featureInputMode() === 'new') {
      return this.form.controls.featureName.value.trim();
    }

    if (!this.form.controls.featureId.value) {
      return '';
    }

    return (this.availableFeatures().find((feature) => feature.id === this.form.controls.featureId.value)?.name ?? '').trim();
  }

  suiteSelected(suiteId: string) {
    return this.selectedCaseCountForSuite(suiteId) > 0;
  }

  toggleSuiteSelection(suiteId: string, checked: boolean) {
    const suite = this.suites().find((item) => item.id === suiteId);
    if (!suite) {
      return;
    }

    if (!checked) {
      this.setApprovedSuiteCaseSelection(suiteId, []);
      return;
    }

    void this.selectAllCasesForApprovedSuite(suiteId, suite);
  }

  uploadedSuiteSelected(tempId: string) {
    return this.selectedUploadedCaseCountForSuite(tempId) > 0;
  }

  toggleUploadedSuiteSelection(tempId: string, checked: boolean) {
    const suite = this.uploadedSuites().find((item) => item.tempId === tempId);
    if (!suite) {
      return;
    }

    this.setUploadedSuiteCaseSelection(
      tempId,
      checked ? suite.cases.map((testCase) => testCase.sourceCaseId) : [],
    );
  }

  async selectAllVisibleSuites() {
    const nextApproved = { ...this.selectedApprovedCaseIds() };
    for (const suite of this.filteredSuites()) {
      const resolvedSuite = await this.ensureApprovedSuiteCasesLoaded(suite.id);
      if (!resolvedSuite) {
        continue;
      }
      nextApproved[resolvedSuite.id] = resolvedSuite.cases.map((testCase) => testCase.sourceCaseId);
    }

    const nextUploaded = { ...this.selectedUploadedCaseIds() };
    for (const suite of this.filteredUploadedSuites()) {
      nextUploaded[suite.tempId] = suite.cases.map((testCase) => testCase.sourceCaseId);
    }

    this.selectedApprovedCaseIds.set(nextApproved);
    this.selectedUploadedCaseIds.set(nextUploaded);
  }

  clearSuiteSelection() {
    this.clearSelections();
  }

  canCreateRun() {
    return (
      this.hasValidScopeSelection() &&
      this.form.controls.name.valid &&
      this.selectedCaseCount() > 0
    );
  }

  formatDate(value: string | null) {
    return formatManualExecutionDate(value);
  }

  selectedCaseCountForSuite(suiteId: string) {
    return this.selectedApprovedCaseIds()[suiteId]?.length ?? 0;
  }

  availableCaseCountForSuite(suite: ApprovedExecutionSuite) {
    return suite.cases.length || suite.caseCount || 0;
  }

  selectedUploadedCaseCountForSuite(tempId: string) {
    return this.selectedUploadedCaseIds()[tempId]?.length ?? 0;
  }

  approvedCaseSelected(suiteId: string, sourceCaseId: string) {
    return (this.selectedApprovedCaseIds()[suiteId] ?? []).includes(sourceCaseId);
  }

  uploadedCaseSelected(tempId: string, sourceCaseId: string) {
    return (this.selectedUploadedCaseIds()[tempId] ?? []).includes(sourceCaseId);
  }

  toggleApprovedCaseSelection(suiteId: string, sourceCaseId: string, checked: boolean) {
    const selected = new Set(this.selectedApprovedCaseIds()[suiteId] ?? []);
    if (checked) {
      selected.add(sourceCaseId);
    } else {
      selected.delete(sourceCaseId);
    }

    this.setApprovedSuiteCaseSelection(suiteId, [...selected]);
  }

  toggleUploadedCaseSelection(tempId: string, sourceCaseId: string, checked: boolean) {
    const selected = new Set(this.selectedUploadedCaseIds()[tempId] ?? []);
    if (checked) {
      selected.add(sourceCaseId);
    } else {
      selected.delete(sourceCaseId);
    }

    this.setUploadedSuiteCaseSelection(tempId, [...selected]);
  }

  suiteCasesLoading(suiteId: string) {
    return this.approvedSuiteCaseLoading()[suiteId] ?? false;
  }

  async selectAllCasesForSuite(suiteId: string) {
    const suite = this.suites().find((item) => item.id === suiteId);
    if (!suite) {
      return;
    }
    await this.selectAllCasesForApprovedSuite(suiteId, suite);
  }

  clearCasesForSuite(suiteId: string) {
    this.setApprovedSuiteCaseSelection(suiteId, []);
  }

  selectAllCasesForUploadedSuite(tempId: string) {
    const suite = this.uploadedSuites().find((item) => item.tempId === tempId);
    if (!suite) {
      return;
    }
    this.setUploadedSuiteCaseSelection(tempId, suite.cases.map((testCase) => testCase.sourceCaseId));
  }

  clearCasesForUploadedSuite(tempId: string) {
    this.setUploadedSuiteCaseSelection(tempId, []);
  }

  approvedSuiteExpanded(suiteId: string) {
    return this.expandedApprovedSuites().includes(suiteId);
  }

  uploadedSuiteExpanded(tempId: string) {
    return this.expandedUploadedSuites().includes(tempId);
  }

  toggleApprovedSuiteExpansion(suiteId: string) {
    const isExpanded = this.expandedApprovedSuites().includes(suiteId);
    this.expandedApprovedSuites.update((current) =>
      isExpanded ? current.filter((id) => id !== suiteId) : [...current, suiteId],
    );

    if (!isExpanded) {
      void this.ensureApprovedSuiteCasesLoaded(suiteId);
    }
  }

  toggleUploadedSuiteExpansion(tempId: string) {
    this.expandedUploadedSuites.update((current) =>
      current.includes(tempId) ? current.filter((id) => id !== tempId) : [...current, tempId],
    );
  }

  stopEvent(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }

  async onTestcaseDocumentSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (!files.length) {
      return;
    }

    this.importInProgress.set(true);
    const importedSuites: ManualExecutionUploadedSuite[] = [];

    try {
      for (const file of files) {
        const dataUrl = await this.readFileAsDataUrl(file);
        const response = await firstValueFrom(
          this.api.importManualExecutionTestcases({
            fileName: file.name,
            mimeType: file.type || undefined,
            dataUrl,
          }),
        );

        if (response?.suites?.length) {
          importedSuites.push(...response.suites);
        }
      }

      if (importedSuites.length) {
        this.uploadedSuites.update((current) => [...current, ...importedSuites]);
        this.selectedUploadedCaseIds.update((current) => {
          const next = { ...current };
          for (const suite of importedSuites) {
            next[suite.tempId] = suite.cases.map((testCase) => testCase.sourceCaseId);
          }
          return next;
        });
        this.expandedUploadedSuites.update((current) => [
          ...current,
          ...importedSuites.map((suite) => suite.tempId).filter((id) => !current.includes(id)),
        ]);
        this.notifications.success('Uploaded testcase document parsed for manual execution.');
      }
    } catch (error: unknown) {
      const message =
        error instanceof HttpErrorResponse
          ? String(error.error?.message ?? error.error?.error ?? '').trim()
          : '';
      this.notifications.error(message || 'Unable to extract testcases from the uploaded execution document.');
    } finally {
      this.importInProgress.set(false);
      if (input) {
        input.value = '';
      }
    }
  }

  removeUploadedSuite(tempId: string) {
    this.uploadedSuites.update((suites) => suites.filter((suite) => suite.tempId !== tempId));
    this.selectedUploadedCaseIds.update((current) => {
      const next = { ...current };
      delete next[tempId];
      return next;
    });
    this.expandedUploadedSuites.update((current) => current.filter((id) => id !== tempId));
  }

  createRun() {
    this.form.markAllAsTouched();
    if (!this.canCreateRun()) {
      this.notifications.error(
        'Choose or create the client, module, page, or feature scope, enter a run name, and select at least one execution source.',
      );
      return;
    }

    this.creating.set(true);
    this.api
      .createManualExecutionRun({
        name: this.form.controls.name.getRawValue(),
        ...(this.projectInputMode() === 'existing'
          ? { projectId: this.form.controls.projectId.getRawValue() }
          : { projectName: this.form.controls.projectName.getRawValue().trim() }),
        ...(this.moduleInputMode() === 'existing'
          ? this.form.controls.moduleId.getRawValue()
            ? { moduleId: this.form.controls.moduleId.getRawValue() }
            : {}
          : this.form.controls.moduleName.getRawValue().trim()
            ? { moduleName: this.form.controls.moduleName.getRawValue().trim() }
            : {}),
        ...(this.pageInputMode() === 'existing'
          ? this.form.controls.pageId.getRawValue()
            ? { pageId: this.form.controls.pageId.getRawValue() }
            : {}
          : this.form.controls.pageName.getRawValue().trim()
            ? { pageName: this.form.controls.pageName.getRawValue().trim() }
            : {}),
        ...(this.featureInputMode() === 'existing'
          ? this.form.controls.featureId.getRawValue()
            ? { featureId: this.form.controls.featureId.getRawValue() }
            : {}
          : this.form.controls.featureName.getRawValue().trim()
            ? { featureName: this.form.controls.featureName.getRawValue().trim() }
            : {}),
        suiteIds: Object.entries(this.selectedApprovedCaseIds())
          .filter(([, caseIds]) => caseIds.length > 0)
          .map(([suiteId]) => suiteId),
        suiteSelections: Object.entries(this.selectedApprovedCaseIds())
          .filter(([, caseIds]) => caseIds.length > 0)
          .map(([suiteId, caseIds]) => ({
            suiteId,
            caseIds,
          })),
        uploadedSuites: this.uploadedSuites()
          .map((suite) => ({
            ...suite,
            cases: suite.cases.filter((testCase) =>
              (this.selectedUploadedCaseIds()[suite.tempId] ?? []).includes(testCase.sourceCaseId),
            ),
          }))
          .filter((suite) => suite.cases.length > 0)
          .map((suite) => ({
            ...suite,
            caseCount: suite.cases.length,
          })),
        environment: this.form.controls.environment.getRawValue(),
        buildVersion: this.form.controls.buildVersion.getRawValue(),
        assignedTester: this.currentUser()?.name || this.form.controls.assignedTester.getRawValue(),
        notes: this.form.controls.notes.getRawValue(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
        next: (response) => {
          this.notifications.success('Manual execution run created.');
          this.creating.set(false);
          this.clearSelections();
          void this.router.navigate(['/manual-execution/test-execution', response.run.id]);
        },
        error: () => {
          this.notifications.error('Unable to create the manual execution run.');
          this.creating.set(false);
        },
      });
  }

  private loadBootstrap() {
    this.loading.set(true);
    this.api
      .getManualExecutionBootstrap()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (bootstrap) => {
          this.bootstrap.set(bootstrap);
          const queryProjectId = this.route.snapshot.queryParamMap.get('projectId') ?? '';
          const queryModuleId = this.route.snapshot.queryParamMap.get('moduleId') ?? '';
          const queryPageId = this.route.snapshot.queryParamMap.get('pageId') ?? '';
          const queryFeatureId = this.route.snapshot.queryParamMap.get('featureId') ?? '';
          const selectedProject =
            bootstrap.projectHierarchy.find((project) => project.id === queryProjectId) ?? bootstrap.projectHierarchy[0] ?? null;

          if (!selectedProject) {
            this.loading.set(false);
            return;
          }

          const selectedModule =
            selectedProject.modules.find((moduleItem) => moduleItem.id === queryModuleId) ??
            selectedProject.modules.find((moduleItem) =>
              queryFeatureId ? moduleItem.pages.some((page) => page.features.some((feature) => feature.id === queryFeatureId)) : false,
            ) ??
            null;
          const selectedPage =
            selectedModule?.pages.find((page) => page.id === queryPageId) ??
            selectedModule?.pages.find((page) =>
              queryFeatureId ? page.features.some((feature) => feature.id === queryFeatureId) : false,
            ) ??
            null;
          const selectedFeature = selectedPage?.features.find((feature) => feature.id === queryFeatureId) ?? null;

          this.form.controls.projectId.setValue(selectedProject.id, { emitEvent: false });
          this.form.controls.projectName.setValue('', { emitEvent: false });
          this.form.controls.moduleId.setValue(selectedModule?.id ?? '', { emitEvent: false });
          this.form.controls.moduleName.setValue('', { emitEvent: false });
          this.form.controls.pageId.setValue(selectedPage?.id ?? '', { emitEvent: false });
          this.form.controls.pageName.setValue('', { emitEvent: false });
          this.form.controls.featureId.setValue(selectedFeature?.id ?? '', { emitEvent: false });
          this.form.controls.featureName.setValue('', { emitEvent: false });
          const currentUser = this.auth.currentUser();
          if (currentUser) {
            this.form.controls.assignedTester.setValue(currentUser.name, { emitEvent: false });
          }
          this.formRevision.update((value) => value + 1);
          void this.loadProjectData(selectedProject.id);
        },
        error: () => {
          this.notifications.error('Unable to load manual execution workspace.');
          this.loading.set(false);
        },
      });
  }

  private async loadProjectData(projectId: string) {
    this.loading.set(true);
    this.api
      .listApprovedExecutionSuites({
        projectId,
        ...(this.form.controls.moduleId.getRawValue() ? { moduleId: this.form.controls.moduleId.getRawValue() } : {}),
        ...(this.form.controls.pageId.getRawValue() ? { pageId: this.form.controls.pageId.getRawValue() } : {}),
        ...(this.form.controls.featureId.getRawValue() ? { featureId: this.form.controls.featureId.getRawValue() } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.suites.set(response.items.map((suite) => this.normalizeApprovedSuite(suite)));
          this.selectedApprovedCaseIds.update((current) => {
            const next: Record<string, string[]> = {};
            for (const suite of response.items.map((item) => this.normalizeApprovedSuite(item))) {
              if (current[suite.id]?.length) {
                next[suite.id] = current[suite.id].filter((caseId) =>
                  suite.cases.some((testCase) => testCase.sourceCaseId === caseId),
                );
              }
            }
            return next;
          });
          this.expandedApprovedSuites.update((current) =>
            current.filter((suiteId) => response.items.some((suite) => suite.id === suiteId)),
          );
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load approved suites for manual execution.');
          this.loading.set(false);
        },
      });
  }

  private readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private setApprovedSuiteCaseSelection(suiteId: string, caseIds: string[]) {
    this.selectedApprovedCaseIds.update((current) => ({
      ...current,
      [suiteId]: [...new Set(caseIds)],
    }));
  }

  private normalizeApprovedSuite(suite: ApprovedExecutionSuite) {
    const rawCases: unknown[] = Array.isArray((suite as { cases?: unknown[] }).cases)
      ? [...((suite as { cases?: unknown[] }).cases ?? [])]
      : [];
    const cases = rawCases
      .map((entry, index) => this.normalizeSelectableCase(entry, index))
      .filter((entry): entry is ManualExecutionSelectableCase => Boolean(entry));
    return {
      ...suite,
      caseCount: Math.max(suite.caseCount ?? 0, cases.length),
      cases,
    };
  }

  private normalizeSelectableCase(value: unknown, fallbackIndex: number): ManualExecutionSelectableCase | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const sourceCaseId = String(record['sourceCaseId'] ?? record['caseId'] ?? '').trim();
    const title = String(record['title'] ?? '').trim();
    if (!sourceCaseId || !title) {
      return null;
    }

    return {
      sourceCaseId,
      title,
      feature: String(record['feature'] ?? 'General').trim() || 'General',
      scenario: String(record['scenario'] ?? `Scenario ${fallbackIndex + 1}`).trim() || `Scenario ${fallbackIndex + 1}`,
      testType: String(record['testType'] ?? 'Functional').trim() || 'Functional',
      priority: String(record['priority'] ?? 'P2').trim() || 'P2',
      severity: String(record['severity'] ?? 'Medium').trim() || 'Medium',
      notes: String(record['notes'] ?? '').trim() || null,
    };
  }

  private async selectAllCasesForApprovedSuite(suiteId: string, suite: ApprovedExecutionSuite) {
    const resolvedSuite = await this.ensureApprovedSuiteCasesLoaded(suiteId) ?? suite;
    this.setApprovedSuiteCaseSelection(
      suiteId,
      resolvedSuite.cases.map((testCase) => testCase.sourceCaseId),
    );
  }

  private async ensureApprovedSuiteCasesLoaded(suiteId: string) {
    const suite = this.suites().find((item) => item.id === suiteId);
    if (!suite) {
      return null;
    }

    if (suite.cases.length || this.suiteCasesLoading(suiteId)) {
      return suite;
    }

    this.approvedSuiteCaseLoading.update((current) => ({
      ...current,
      [suiteId]: true,
    }));

    try {
      const response = await firstValueFrom(this.api.getGenerationDraft(suiteId));
      const approvedCases = (response.draft.testCases ?? [])
        .filter((testCase) => testCase.reviewStatus === 'approved')
        .map((testCase, index) => this.mapDraftCaseToSelectableCase(testCase, index));

      const updatedSuite = {
        ...suite,
        caseCount: Math.max(suite.caseCount ?? 0, approvedCases.length),
        cases: approvedCases,
      };

      this.suites.update((current) =>
        current.map((item) => (item.id === suiteId ? updatedSuite : item)),
      );

      this.selectedApprovedCaseIds.update((current) => {
        if (!current[suiteId]?.length) {
          return current;
        }

        const nextIds = current[suiteId].filter((caseId) =>
          approvedCases.some((testCase) => testCase.sourceCaseId === caseId),
        );
        return {
          ...current,
          [suiteId]: nextIds,
        };
      });

      return updatedSuite;
    } catch {
      this.notifications.error('Unable to load approved testcases for this suite.');
      return suite;
    } finally {
      this.approvedSuiteCaseLoading.update((current) => ({
        ...current,
        [suiteId]: false,
      }));
    }
  }

  private mapDraftCaseToSelectableCase(testCase: TestGenerationDraft['testCases'][number], index: number): ManualExecutionSelectableCase {
    return {
      sourceCaseId: testCase.caseId || `CASE-${String(index + 1).padStart(3, '0')}`,
      title: testCase.title || `Approved testcase ${index + 1}`,
      feature: testCase.feature || 'General',
      scenario: testCase.scenario || `Scenario ${index + 1}`,
      testType: testCase.testType || 'Functional',
      priority: testCase.priority || 'P2',
      severity: testCase.severity || 'Medium',
      notes: testCase.notes?.trim() ? testCase.notes : null,
    };
  }

  private setUploadedSuiteCaseSelection(tempId: string, caseIds: string[]) {
    this.selectedUploadedCaseIds.update((current) => ({
      ...current,
      [tempId]: [...new Set(caseIds)],
    }));
  }

  private hasValidScopeSelection() {
    const hasProject =
      this.projectInputMode() === 'existing'
        ? Boolean(this.form.controls.projectId.value)
        : Boolean(this.form.controls.projectName.value.trim());
    const hasModule =
      this.moduleInputMode() === 'existing'
        ? true
        : Boolean(this.form.controls.moduleName.value.trim());
    const hasPage =
      this.pageInputMode() === 'existing'
        ? true
        : Boolean(this.form.controls.pageName.value.trim());
    const hasFeature =
      this.featureInputMode() === 'existing'
        ? true
        : Boolean(this.form.controls.featureName.value.trim());
    const hasModuleContextForPage =
      this.pageInputMode() === 'existing'
        ? true
        : this.moduleInputMode() === 'existing'
          ? Boolean(this.form.controls.moduleId.value)
          : Boolean(this.form.controls.moduleName.value.trim());
    const hasPageContextForFeature =
      this.featureInputMode() === 'existing'
        ? true
        : this.pageInputMode() === 'existing'
          ? Boolean(this.form.controls.pageId.value)
          : Boolean(this.form.controls.pageName.value.trim());

    return hasProject && hasModule && hasPage && hasFeature && hasModuleContextForPage && hasPageContextForFeature;
  }

  private clearApprovedSelections() {
    this.selectedApprovedCaseIds.set({});
    this.expandedApprovedSuites.set([]);
  }

  private clearApprovedScopeState() {
    this.clearApprovedSelections();
    this.approvedSuiteCaseLoading.set({});
    this.suites.set([]);
  }

  private clearSelections() {
    this.clearApprovedSelections();
    this.selectedUploadedCaseIds.set({});
    this.expandedUploadedSuites.set([]);
  }
}
