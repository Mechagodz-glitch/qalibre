import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import type {
  AdminProjectQuarterAllocation,
  AdminUserRecord,
  AppPageAccessDefinition,
  AppUserRole,
  ManualExecutionBootstrap,
  ManualExecutionRunSummary,
  ProjectHierarchyOption,
  ProjectHierarchyFeatureOption,
  ProjectQuarter,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { AuthService } from '../../core/auth.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { loadAllManualExecutionRuns } from '../manual-execution/manual-execution.utils';

type QuarterOption = {
  value: ProjectQuarter;
  label: string;
  range: string;
  monthSpan: string;
};

type AllocationGroup = {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  allocations: Array<{
    id: string;
    year: number;
    quarter: ProjectQuarter;
    quarterLabel: string;
    quarterYearLabel: string;
    quarterRange: string;
    testerId: string | null;
    testerName: string | null;
    testerDesignation: string | null;
    createdAt: string;
  }>;
};

type ProjectExecutionPageRow = {
  pageId: string;
  pageName: string;
  testerLabel: string;
  features: ProjectExecutionFeatureRow[];
};

type ProjectExecutionModuleRow = {
  moduleId: string;
  moduleName: string;
  testerLabel: string;
  pages: ProjectExecutionPageRow[];
};

type ProjectExecutionFeatureRow = {
  featureId: string;
  featureName: string;
};

function getExecutionRunOwner(run: Pick<ManualExecutionRunSummary, 'assignedTester' | 'createdBy'>) {
  return run.assignedTester?.trim() || run.createdBy?.trim() || '';
}

@Component({
  selector: 'app-admin-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.scss',
})
export class AdminPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly savingUser = signal(false);
  readonly savingProject = signal(false);
  readonly savingModule = signal(false);
  readonly savingFeature = signal(false);
  readonly savingAllocation = signal(false);
  readonly savingMapping = signal(false);
  readonly users = signal<AdminUserRecord[]>([]);
  readonly workspace = signal<ManualExecutionBootstrap | null>(null);
  readonly allocations = signal<AdminProjectQuarterAllocation[]>([]);
  readonly executionRuns = signal<ManualExecutionRunSummary[]>([]);
  readonly createdProjects = signal<ProjectHierarchyOption[]>([]);
  readonly selectedUserId = signal<string | null>(null);
  readonly editingProjectId = signal<string | null>(null);
  readonly editingModuleId = signal<string | null>(null);
  readonly editingPageId = signal<string | null>(null);
  readonly editingFeatureId = signal<string | null>(null);
  readonly expandedProjectId = signal<string | null>(null);
  readonly activeSection = signal<'uam' | 'mapping'>('uam');
  readonly userEditorOpen = signal(false);
  readonly mappingEditorOpen = signal(false);
  readonly mappingEditorMode = signal<'create' | 'edit'>('create');
  readonly userSearchTerm = signal('');
  readonly clientRegistrySearchTerm = signal('');
  readonly clientRegistryTypeFilter = signal<'all' | 'withModules' | 'withoutModules'>('all');
  readonly clientRegistryModuleFilter = signal('all');
  readonly mappingSelectionRevision = signal(0);
  readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? null);
  private readonly qaBootstrapProfiles = [
    {
      email: 'akshaya@detecttechnologies.com',
      name: 'Akshaya Kumar Vijayaganeshvara Moorthi',
      designation: 'QA Engineer (QA 2)',
    },
    {
      email: 'sakthivel@detecttechnologies.com',
      name: 'Sakthivel M',
      designation: 'Senior QA Engineer (QA 3)',
    },
    {
      email: 'sowndarya@detecttechnologies.com',
      name: 'Sowndarya Saravanan',
      designation: 'Senior QA Engineer (QA 3)',
    },
    {
      email: 'vaishnavi@detecttechnologies.com',
      name: 'Vaishnavi M',
      designation: 'Associate Manager QA (MQA1)',
    },
    {
      email: 'naren@detecttechnologies.com',
      name: 'Naren Vishwa Swaminathan',
      designation: 'QA Engineer (QA 2)',
    },
    {
      email: 'ruban@detecttechnologies.com',
      name: 'Ruban Chakravarthy V',
      designation: 'QA Engineer (QA 2)',
    },
  ];
  private qaBootstrapInitialized = false;

  readonly roleOptions: Array<{ value: AppUserRole; label: string; hint: string }> = [
    { value: 'USER', label: 'User', hint: 'Sees only assigned pages.' },
    { value: 'ADMIN', label: 'Admin', hint: 'Full access to all pages.' },
  ];

  readonly quarterOptions: QuarterOption[] = [
    { value: 'Q1', label: 'Q1', range: 'Apr - Jun', monthSpan: 'April to June' },
    { value: 'Q2', label: 'Q2', range: 'Jul - Sep', monthSpan: 'July to September' },
    { value: 'Q3', label: 'Q3', range: 'Oct - Dec', monthSpan: 'October to December' },
    { value: 'Q4', label: 'Q4', range: 'Jan - Mar', monthSpan: 'January to March' },
  ];
  readonly allocationYearOptions = computed(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => currentYear - 1 + index);
  });

  readonly userForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    role: this.fb.nonNullable.control<AppUserRole>('USER'),
    isActive: this.fb.nonNullable.control(true),
    pageAccesses: this.fb.nonNullable.control<string[]>(['dashboard']),
    qaTester: this.fb.nonNullable.control(false),
    designation: this.fb.nonNullable.control(''),
  });

  readonly allocationForm = this.fb.nonNullable.group({
    projectId: ['', [Validators.required]],
    years: this.fb.nonNullable.control<number[]>([]),
    quarters: this.fb.nonNullable.control<ProjectQuarter[]>([]),
    testerContributorIds: this.fb.nonNullable.control<string[]>([]),
  });

  readonly projectForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(500)]],
  });

  readonly moduleForm = this.fb.nonNullable.group({
    projectId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
  });

  readonly pageForm = this.fb.nonNullable.group({
    projectId: ['', [Validators.required]],
    moduleId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
  });

  readonly featureForm = this.fb.nonNullable.group({
    projectId: ['', [Validators.required]],
    moduleId: ['', [Validators.required]],
    pageId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
  });

  readonly pageAccessDefinitions = computed<AppPageAccessDefinition[]>(() => this.auth.pageAccessDefinitions());
  readonly editablePageAccesses = computed(() =>
    this.pageAccessDefinitions().filter((definition) => definition.key !== 'dashboard'),
  );
  readonly selectedUser = computed(() => this.users().find((user) => user.id === this.selectedUserId()) ?? null);
  readonly filteredUsers = computed(() => {
    const term = this.userSearchTerm().trim().toLowerCase();
    if (!term) {
      return this.users();
    }

    return this.users().filter((user) => {
      const name = user.name.toLowerCase();
      const email = user.email.toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  });
  readonly projectOptions = computed<ProjectHierarchyOption[]>(() => {
    const merged = new Map<string, ProjectHierarchyOption>();

    for (const project of this.workspace()?.projectHierarchy ?? []) {
      merged.set(project.id, project);
    }

    for (const project of this.createdProjects()) {
      if (!merged.has(project.id)) {
        merged.set(project.id, project);
      }
    }

    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
  });
  readonly moduleFilterOptions = computed(() => {
    const modules = new Map<string, { id: string; name: string }>();
    for (const project of this.projectOptions()) {
      for (const moduleItem of project.modules) {
        modules.set(moduleItem.id, { id: moduleItem.id, name: moduleItem.name });
      }
    }

    return [...modules.values()].sort((left, right) => left.name.localeCompare(right.name));
  });
  readonly filteredProjectOptions = computed(() => {
    const term = this.clientRegistrySearchTerm().trim().toLowerCase();
    const type = this.clientRegistryTypeFilter();
    const moduleFilter = this.clientRegistryModuleFilter();

    return this.projectOptions().filter((project) => {
      const matchesTerm =
        !term ||
        project.name.toLowerCase().includes(term) ||
        (project.description ?? '').toLowerCase().includes(term) ||
        project.modules.some(
          (moduleItem) =>
            moduleItem.name.toLowerCase().includes(term) ||
            moduleItem.pages.some(
              (pageItem) =>
                pageItem.name.toLowerCase().includes(term) ||
                pageItem.features.some((featureItem) => featureItem.name.toLowerCase().includes(term)),
            ),
        );
      const matchesType =
        type === 'all'
          ? true
          : type === 'withModules'
            ? project.modules.length > 0
            : project.modules.length === 0;
      const matchesModule =
        moduleFilter === 'all' ? true : project.modules.some((moduleItem) => moduleItem.id === moduleFilter);

      return matchesTerm && matchesType && matchesModule;
    });
  });
  readonly testerOptions = computed(() => this.workspace()?.testerOptions ?? []);
  readonly isScopedClientEdit = computed(() => this.mappingEditorMode() === 'edit' && Boolean(this.editingProjectId()));
  readonly mappingProject = computed(() => {
    this.mappingSelectionRevision();
    const scopedProjectId =
      this.editingProjectId() ||
      this.moduleForm.controls.projectId.value ||
      this.pageForm.controls.projectId.value ||
      this.featureForm.controls.projectId.value ||
      this.allocationForm.controls.projectId.value;

    return this.projectOptions().find((project) => project.id === scopedProjectId) ?? null;
  });
  readonly editingProject = computed(
    () => this.projectOptions().find((project) => project.id === this.editingProjectId()) ?? null,
  );
  readonly mappingModuleOptions = computed(() => this.mappingProject()?.modules ?? []);
  readonly pageModuleOptions = computed(() => this.mappingModuleOptions());
  readonly selectedPageModuleName = computed(() => {
    this.mappingSelectionRevision();
    const moduleId = this.pageForm.controls.moduleId.value || this.editingModuleId() || '';
    return this.pageModuleOptions().find((moduleItem) => moduleItem.id === moduleId)?.name ?? null;
  });
  readonly mappingPageOptions = computed(() => {
    this.mappingSelectionRevision();
    const moduleId = this.pageForm.controls.moduleId.value || this.editingModuleId() || '';
    const moduleItem = this.mappingModuleOptions().find((entry) => entry.id === moduleId) ?? null;
    return moduleItem?.pages ?? [];
  });
  readonly featureModuleOptions = computed(() => {
    this.mappingSelectionRevision();
    const projectId = this.featureForm.controls.projectId.value || this.editingProjectId() || '';
    return this.projectOptions().find((project) => project.id === projectId)?.modules ?? [];
  });
  readonly featurePageOptions = computed(() => {
    this.mappingSelectionRevision();
    const moduleId = this.featureForm.controls.moduleId.value || this.editingModuleId() || '';
    return this.featureModuleOptions().find((moduleItem) => moduleItem.id === moduleId)?.pages ?? [];
  });
  readonly mappingFeatureOptions = computed<ProjectHierarchyFeatureOption[]>(() => {
    this.mappingSelectionRevision();
    const pageId = this.featureForm.controls.pageId.value || this.editingPageId() || '';
    return this.featurePageOptions().find((pageItem) => pageItem.id === pageId)?.features ?? [];
  });
  readonly selectedFeaturePageName = computed(() => {
    this.mappingSelectionRevision();
    const pageId = this.featureForm.controls.pageId.value || this.editingPageId() || '';
    return this.featurePageOptions().find((pageItem) => pageItem.id === pageId)?.name ?? null;
  });
  readonly allocationGroups = computed<AllocationGroup[]>(() => {
    const quarterMeta = new Map<ProjectQuarter, QuarterOption>(
      this.quarterOptions.map((option) => [option.value, option]),
    );
    const projectMeta = new Map(this.projectOptions().map((project) => [project.id, project]));
    const groups = new Map<string, AllocationGroup>();

    for (const allocation of this.allocations()) {
      const project = projectMeta.get(allocation.project.id);
      const quarter = quarterMeta.get(allocation.quarter);
      const existing = groups.get(allocation.project.id) ?? {
        projectId: allocation.project.id,
        projectName: project?.name ?? allocation.project.name,
        projectDescription: project?.description ?? null,
        allocations: [],
      };

      existing.allocations.push({
        id: allocation.id,
        year: allocation.year,
        quarter: allocation.quarter,
        quarterLabel: quarter?.label ?? allocation.quarter,
        quarterYearLabel: `${quarter?.label ?? allocation.quarter} ${allocation.year}`,
        quarterRange: quarter?.range ?? allocation.quarter,
        testerId: allocation.tester?.id ?? null,
        testerName: allocation.tester?.name ?? null,
        testerDesignation: allocation.tester?.roleTitle ?? null,
        createdAt: allocation.createdAt,
      });

      groups.set(allocation.project.id, existing);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        allocations: group.allocations.sort((left, right) => {
          const order = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 } as const;
          const yearCompare = left.year - right.year;
          if (yearCompare !== 0) {
            return yearCompare;
          }
          const quarterCompare = order[left.quarter] - order[right.quarter];
          if (quarterCompare !== 0) {
            return quarterCompare;
          }

          return (left.testerName ?? '').localeCompare(right.testerName ?? '');
        }),
      }))
      .sort((left, right) => left.projectName.localeCompare(right.projectName));
  });
  constructor() {
    this.userForm.controls.role.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((role) => {
      this.syncAccessesForRole(role);
    });

    [
      this.moduleForm.controls.projectId,
      this.pageForm.controls.projectId,
      this.pageForm.controls.moduleId,
      this.featureForm.controls.projectId,
      this.featureForm.controls.moduleId,
      this.featureForm.controls.pageId,
    ].forEach((control) => {
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.mappingSelectionRevision.update((value) => value + 1);
      });
    });

    this.pageForm.controls.projectId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((projectId) => {
      const modules = this.projectOptions().find((project) => project.id === projectId)?.modules ?? [];
      const selectedModuleId = this.pageForm.controls.moduleId.value;
      if (!modules.some((moduleItem) => moduleItem.id === selectedModuleId)) {
        this.pageForm.controls.moduleId.setValue(modules[0]?.id ?? '', { emitEvent: false });
      }
    });

    this.featureForm.controls.projectId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((projectId) => {
      const modules = this.projectOptions().find((project) => project.id === projectId)?.modules ?? [];
      const selectedModuleId = this.featureForm.controls.moduleId.value;
      if (!modules.some((moduleItem) => moduleItem.id === selectedModuleId)) {
        this.featureForm.controls.moduleId.setValue(modules[0]?.id ?? '', { emitEvent: false });
      }
    });

    this.featureForm.controls.moduleId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((moduleId) => {
      const pages = this.featureModuleOptions().find((moduleItem) => moduleItem.id === moduleId)?.pages ?? [];
      const selectedPageId = this.featureForm.controls.pageId.value;
      if (!pages.some((pageItem) => pageItem.id === selectedPageId)) {
        this.featureForm.controls.pageId.setValue(pages[0]?.id ?? '', { emitEvent: false });
      }
    });

    void this.initializeWorkspace();
  }

  async initializeWorkspace() {
    await this.loadWorkspace();

    if (!this.qaBootstrapInitialized) {
      this.qaBootstrapInitialized = true;
      await this.seedKnownQaMembers();
      await this.loadWorkspace();
    }
  }

  async loadWorkspace() {
    this.loading.set(true);
    try {
      const [users, bootstrap, allocations, runs] = await Promise.all([
        firstValueFrom(this.api.listAdminUsers()),
        firstValueFrom(this.api.getManualExecutionBootstrap()),
        firstValueFrom(this.api.listProjectQuarterAllocations()),
        loadAllManualExecutionRuns(this.api),
      ]);

      this.users.set(users.items ?? []);
      this.workspace.set(bootstrap);
      this.allocations.set(allocations.items ?? []);
      this.executionRuns.set(runs);
      this.syncAllocationDefaults();
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to load admin workspace.'));
    } finally {
      this.loading.set(false);
    }
  }

  startNewUser() {
    this.setActiveSection('uam');
    this.selectedUserId.set(null);
    this.userEditorOpen.set(true);
    this.userForm.reset({
      email: '',
      name: '',
      role: 'USER',
      isActive: true,
      pageAccesses: ['dashboard'],
      qaTester: false,
      designation: '',
    });
    this.syncAccessesForRole('USER');
    this.scrollToSection('uam');
  }

  selectUser(user: AdminUserRecord) {
    this.setActiveSection('uam');
    this.selectedUserId.set(user.id);
    this.userEditorOpen.set(true);
    this.userForm.reset({
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      pageAccesses: this.normalizeAccessesForRole(user.role, user.pageAccesses),
      qaTester: this.isQaTesterUser(user),
      designation: user.contributor?.roleTitle ?? '',
    });
  }

  async deleteUser(user: AdminUserRecord, event?: Event) {
    event?.stopPropagation();

    if (user.id === this.currentUserId()) {
      this.notifications.error('You cannot delete your own account.');
      return;
    }

    const confirmed = typeof window === 'undefined' ? true : window.confirm(`Delete ${user.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(this.api.deleteAdminUser(user.id));
      this.notifications.success(`${user.name} removed.`);
      const wasSelected = this.selectedUserId() === user.id;
      await this.loadWorkspace();
      if (wasSelected) {
        this.closeUserEditor();
      }
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to delete user.'));
    }
  }

  async deleteProject(projectId: string, event?: Event) {
    event?.stopPropagation();

    const project = this.projectOptions().find((item) => item.id === projectId) ?? null;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`Delete client ${project?.name ?? 'this client'}? This will remove its modules, pages, and related allocations.`);
    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(this.api.deleteAdminProject(projectId));
      this.notifications.success(`${project?.name ?? 'Client'} removed.`);
      await this.loadWorkspace();
      if (this.editingProjectId() === projectId) {
        this.cancelProjectEdit();
      }
      if (this.pageForm.controls.projectId.value === projectId) {
        this.cancelPageEdit();
      }
      if (this.editingModuleId() && this.mappingProject()?.id === projectId) {
        this.cancelModuleEdit();
      }
      if (this.moduleForm.controls.projectId.value === projectId) {
        this.moduleForm.controls.projectId.setValue(this.projectOptions()[0]?.id ?? '');
      }
      if (this.allocationForm.controls.projectId.value === projectId) {
        this.syncAllocationDefaults();
      }
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to delete client.'));
    }
  }

  startProjectEdit(project: ProjectHierarchyOption, event?: Event) {
    event?.stopPropagation();
    this.setActiveSection('mapping');
    this.mappingEditorMode.set('edit');
    this.mappingEditorOpen.set(true);
    this.editingProjectId.set(project.id);
    this.projectForm.reset({
      name: project.name,
      description: project.description ?? '',
    });
    const firstModule = project.modules[0] ?? null;
    this.editingModuleId.set(firstModule?.id ?? null);
    this.moduleForm.reset({
      projectId: project.id,
      name: firstModule?.name ?? '',
    });

    const firstPage = firstModule?.pages[0] ?? null;
    const firstFeature = firstPage?.features[0] ?? null;
    this.editingPageId.set(firstPage?.id ?? null);
    this.pageForm.reset({
      projectId: project.id,
      moduleId: firstModule?.id ?? '',
      name: firstPage?.name ?? '',
    });
    this.editingFeatureId.set(firstFeature?.id ?? null);
    this.featureForm.reset({
      projectId: project.id,
      moduleId: firstModule?.id ?? '',
      pageId: firstPage?.id ?? '',
      name: firstFeature?.name ?? '',
    });

    this.allocationForm.reset({
      projectId: project.id,
      years: [
        ...new Set(
          this.allocations()
            .filter((allocation) => allocation.project.id === project.id)
            .map((allocation) => allocation.year),
        ),
      ].sort((left, right) => left - right),
      quarters: [
        ...new Set(
          this.allocations()
            .filter((allocation) => allocation.project.id === project.id)
            .map((allocation) => allocation.quarter),
        ),
      ],
      testerContributorIds: [
        ...new Set(
          this.allocations()
            .filter((allocation) => allocation.project.id === project.id)
            .map((allocation) => allocation.tester?.id ?? '')
            .filter(Boolean),
        ),
      ],
    });
    this.expandedProjectId.set(project.id);
  }

  cancelProjectEdit() {
    this.editingProjectId.set(null);
    this.projectForm.reset({
      name: '',
      description: '',
    });
  }

  startModuleEdit(project: ProjectHierarchyOption, moduleItem: ProjectHierarchyOption['modules'][number], event?: Event) {
    event?.stopPropagation();
    this.setActiveSection('mapping');
    this.mappingEditorMode.set('edit');
    this.mappingEditorOpen.set(true);
    this.editingProjectId.set(project.id);
    this.projectForm.reset({
      name: project.name,
      description: project.description ?? '',
    });
    this.editingModuleId.set(moduleItem.id);
    this.moduleForm.reset({
      projectId: project.id,
      name: moduleItem.name,
    });
    const firstPage = moduleItem.pages[0] ?? null;
    const firstFeature = firstPage?.features[0] ?? null;
    this.editingPageId.set(firstPage?.id ?? null);
    this.pageForm.reset({
      projectId: project.id,
      moduleId: moduleItem.id,
      name: firstPage?.name ?? '',
    });
    this.editingFeatureId.set(firstFeature?.id ?? null);
    this.featureForm.reset({
      projectId: project.id,
      moduleId: moduleItem.id,
      pageId: firstPage?.id ?? '',
      name: firstFeature?.name ?? '',
    });
  }

  cancelModuleEdit() {
    this.editingModuleId.set(null);
    this.moduleForm.reset({
      projectId: this.editingProjectId() ?? this.projectOptions()[0]?.id ?? '',
      name: '',
    });
  }

  startPageEdit(
    project: ProjectHierarchyOption,
    moduleItem: ProjectHierarchyOption['modules'][number],
    pageItem: ProjectHierarchyOption['modules'][number]['pages'][number],
    event?: Event,
  ) {
    event?.stopPropagation();
    this.setActiveSection('mapping');
    this.mappingEditorMode.set('edit');
    this.mappingEditorOpen.set(true);
    this.editingProjectId.set(project.id);
    this.projectForm.reset({
      name: project.name,
      description: project.description ?? '',
    });
    this.editingModuleId.set(moduleItem.id);
    this.moduleForm.reset({
      projectId: project.id,
      name: moduleItem.name,
    });
    this.editingPageId.set(pageItem.id);
    this.pageForm.reset({
      projectId: project.id,
      moduleId: moduleItem.id,
      name: pageItem.name,
    });
    const firstFeature = pageItem.features[0] ?? null;
    this.editingFeatureId.set(firstFeature?.id ?? null);
    this.featureForm.reset({
      projectId: project.id,
      moduleId: moduleItem.id,
      pageId: pageItem.id,
      name: firstFeature?.name ?? '',
    });
  }

  cancelPageEdit() {
    this.editingPageId.set(null);
    this.pageForm.reset({
      projectId: this.editingProjectId() ?? this.projectOptions()[0]?.id ?? '',
      moduleId: this.mappingModuleOptions()[0]?.id ?? this.projectOptions()[0]?.modules[0]?.id ?? '',
      name: '',
    });
  }

  startFeatureEdit(
    project: ProjectHierarchyOption,
    moduleItem: ProjectHierarchyOption['modules'][number],
    pageItem: ProjectHierarchyOption['modules'][number]['pages'][number],
    featureItem: ProjectHierarchyOption['modules'][number]['pages'][number]['features'][number],
    event?: Event,
  ) {
    event?.stopPropagation();
    this.setActiveSection('mapping');
    this.mappingEditorMode.set('edit');
    this.mappingEditorOpen.set(true);
    this.editingProjectId.set(project.id);
    this.projectForm.reset({
      name: project.name,
      description: project.description ?? '',
    });
    this.editingModuleId.set(moduleItem.id);
    this.moduleForm.reset({
      projectId: project.id,
      name: moduleItem.name,
    });
    this.editingPageId.set(pageItem.id);
    this.pageForm.reset({
      projectId: project.id,
      moduleId: moduleItem.id,
      name: pageItem.name,
    });
    this.editingFeatureId.set(featureItem.id);
    this.featureForm.reset({
      projectId: project.id,
      moduleId: moduleItem.id,
      pageId: pageItem.id,
      name: featureItem.name,
    });
  }

  cancelFeatureEdit() {
    this.editingFeatureId.set(null);
    this.featureForm.reset({
      projectId: this.editingProjectId() ?? this.projectOptions()[0]?.id ?? '',
      moduleId: this.featureModuleOptions()[0]?.id ?? this.projectOptions()[0]?.modules[0]?.id ?? '',
      pageId:
        this.featurePageOptions()[0]?.id ??
        this.projectOptions()[0]?.modules[0]?.pages[0]?.id ??
        '',
      name: '',
    });
  }

  prepareNewModule(event?: Event) {
    event?.stopPropagation();

    const projectId = this.editingProjectId() ?? this.moduleForm.controls.projectId.value ?? '';
    this.editingModuleId.set(null);
    this.moduleForm.reset({
      projectId,
      name: '',
    });

    const nextModuleId = this.pageForm.controls.moduleId.value || this.mappingModuleOptions()[0]?.id || '';
    this.prepareNewPage(undefined, projectId, nextModuleId);
  }

  prepareNewPage(event?: Event, projectIdOverride?: string, moduleIdOverride?: string) {
    event?.stopPropagation();

    const projectId =
      projectIdOverride ??
      this.editingProjectId() ??
      this.pageForm.controls.projectId.value ??
      this.moduleForm.controls.projectId.value ??
      '';
    const scopedProject = this.projectOptions().find((project) => project.id === projectId) ?? null;
    const scopedModules = scopedProject?.modules ?? [];
    const moduleId =
      moduleIdOverride ??
      this.pageForm.controls.moduleId.value ??
      this.editingModuleId() ??
      scopedModules[0]?.id ??
      '';

    this.editingPageId.set(null);
    this.pageForm.reset({
      projectId,
      moduleId,
      name: '',
    });

    this.prepareNewFeature(undefined, projectId, moduleId, '');
  }

  prepareNewFeature(event?: Event, projectIdOverride?: string, moduleIdOverride?: string, pageIdOverride?: string) {
    event?.stopPropagation();

    const projectId =
      projectIdOverride ??
      this.editingProjectId() ??
      this.featureForm.controls.projectId.value ??
      this.pageForm.controls.projectId.value ??
      this.moduleForm.controls.projectId.value ??
      '';
    const scopedProject = this.projectOptions().find((project) => project.id === projectId) ?? null;
    const scopedModules = scopedProject?.modules ?? [];
    const moduleId =
      moduleIdOverride ??
      this.featureForm.controls.moduleId.value ??
      this.pageForm.controls.moduleId.value ??
      this.editingModuleId() ??
      scopedModules[0]?.id ??
      '';
    const scopedPages = scopedModules.find((moduleItem) => moduleItem.id === moduleId)?.pages ?? [];
    const pageId =
      pageIdOverride ??
      this.featureForm.controls.pageId.value ??
      this.editingPageId() ??
      scopedPages[0]?.id ??
      '';

    this.editingFeatureId.set(null);
    this.featureForm.reset({
      projectId,
      moduleId,
      pageId,
      name: '',
    });
  }

  toggleAccess(definition: AppPageAccessDefinition, checked: boolean) {
    if (definition.key === 'dashboard') {
      return;
    }

    const current = new Set(this.userForm.controls.pageAccesses.value);

    if (definition.key === 'admin') {
      if (checked) {
        this.userForm.controls.role.setValue('ADMIN');
        this.syncAccessesForRole('ADMIN');
        return;
      }

      current.delete(definition.key);
      this.userForm.controls.role.setValue('USER');
      this.userForm.controls.pageAccesses.setValue(this.normalizeAccessList('USER', [...current]));
      return;
    }

    if (checked) {
      current.add(definition.key);
    } else {
      current.delete(definition.key);
    }

    this.userForm.controls.pageAccesses.setValue(this.normalizeAccessList(this.userForm.controls.role.value, [...current]));
  }

  isAccessSelected(key: string) {
    return this.userForm.controls.pageAccesses.value.includes(key);
  }

  async submitUser() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.savingUser.set(true);
    try {
      const payload = this.buildUserPayload();
      if (this.selectedUserId()) {
        await firstValueFrom(this.api.updateAdminUser(this.selectedUserId()!, payload));
        this.notifications.success('User updated.');
      } else {
        await firstValueFrom(this.api.createAdminUser(payload));
        this.notifications.success('User created.');
      }

      await this.loadWorkspace();
      this.closeUserEditor();
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to save user.'));
    } finally {
      this.savingUser.set(false);
    }
  }

  selectAllocationGroup(projectId: string, year: number, quarter: ProjectQuarter) {
    const group = this.allocationGroups().find((entry) => entry.projectId === projectId);
    const allocations = group?.allocations.filter((item) => item.year === year && item.quarter === quarter) ?? [];
    if (!allocations.length) {
      return;
    }

    this.allocationForm.reset({
      projectId,
      years: [year],
      quarters: [quarter],
      testerContributorIds: allocations
        .map((allocation) => allocation.testerId)
        .filter((testerId): testerId is string => Boolean(testerId)),
    });
  }

  quarterLabel(value: ProjectQuarter) {
    return this.quarterOptions.find((option) => option.value === value)?.label ?? value;
  }

  quarterRange(value: ProjectQuarter) {
    return this.quarterOptions.find((option) => option.value === value)?.range ?? value;
  }

  async submitAllocation() {
    if (this.allocationForm.invalid) {
      this.allocationForm.markAllAsTouched();
      return;
    }

    this.savingAllocation.set(true);
    try {
      await firstValueFrom(
        this.api.syncProjectQuarterAllocations({
          projectId: this.allocationForm.controls.projectId.value,
          years: this.allocationForm.controls.years.value,
          quarters: this.allocationForm.controls.quarters.value,
          testerContributorIds: this.allocationForm.controls.testerContributorIds.value,
        }),
      );
      this.notifications.success('Project allocation saved.');
      await this.loadWorkspace();
      this.syncAllocationDefaults();
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to save project allocation.'));
    } finally {
      this.savingAllocation.set(false);
    }
  }

  async saveClientSection() {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    this.savingProject.set(true);
    try {
      const payload = {
        name: this.projectForm.controls.name.value.trim(),
        description: this.projectForm.controls.description.value.trim() || null,
      };
      const existingProjectId = this.editingProjectId();
      const response = existingProjectId
        ? await firstValueFrom(this.api.updateAdminProject(existingProjectId, payload))
        : await firstValueFrom(this.api.createAdminProject(payload));

      const projectId = response.project.id;
      this.editingProjectId.set(projectId);
      this.mappingEditorMode.set('edit');
      this.moduleForm.controls.projectId.setValue(projectId);
      this.pageForm.controls.projectId.setValue(projectId);

      await firstValueFrom(
        this.api.syncProjectQuarterAllocations({
          projectId,
          years: this.allocationForm.controls.years.value,
          quarters: this.allocationForm.controls.quarters.value,
          testerContributorIds: this.allocationForm.controls.testerContributorIds.value,
        }),
      );

      await this.loadWorkspace();
      this.setActiveSection('mapping');
      this.reopenMappingEditor(projectId, this.editingModuleId(), this.editingPageId(), this.editingFeatureId());
      this.notifications.success(existingProjectId ? 'Client updated.' : 'Client created.');
    } catch (error) {
      this.notifications.error(
        this.extractMessage(error, this.editingProjectId() ? 'Unable to update client.' : 'Unable to create client.'),
      );
    } finally {
      this.savingProject.set(false);
    }
  }

  async saveModuleSection() {
    if (this.moduleForm.invalid) {
      this.moduleForm.markAllAsTouched();
      return;
    }

    this.savingModule.set(true);
    try {
      const payload = {
        projectId: this.moduleForm.controls.projectId.value,
        name: this.moduleForm.controls.name.value.trim(),
      };
      const existingModuleId = this.editingModuleId();
      const response = existingModuleId
        ? await firstValueFrom(this.api.updateAdminModule(existingModuleId, payload))
        : await firstValueFrom(this.api.createAdminModule(payload));

      this.editingProjectId.set(payload.projectId);
      this.editingModuleId.set(response.module.id);
      this.mappingEditorMode.set('edit');

      await this.loadWorkspace();
      this.setActiveSection('mapping');
      this.reopenMappingEditor(payload.projectId, response.module.id, this.editingPageId(), this.editingFeatureId());
      this.notifications.success(existingModuleId ? 'Module updated.' : 'Module created.');
    } catch (error) {
      this.notifications.error(
        this.extractMessage(error, this.editingModuleId() ? 'Unable to update module.' : 'Unable to create module.'),
      );
    } finally {
      this.savingModule.set(false);
    }
  }

  async savePageSection() {
    if (this.pageForm.invalid) {
      this.pageForm.markAllAsTouched();
      return;
    }

    this.savingModule.set(true);
    try {
      const projectId = this.pageForm.controls.projectId.value;
      const moduleId = this.pageForm.controls.moduleId.value;
      const payload = {
        moduleId,
        name: this.pageForm.controls.name.value.trim(),
      };
      const existingPageId = this.editingPageId();
      const response = existingPageId
        ? await firstValueFrom(this.api.updateAdminPage(existingPageId, payload))
        : await firstValueFrom(this.api.createAdminPage(payload));

      this.editingProjectId.set(projectId);
      this.editingModuleId.set(moduleId);
      this.editingPageId.set(response.page.id);
      this.mappingEditorMode.set('edit');

      await this.loadWorkspace();
      this.setActiveSection('mapping');
      this.reopenMappingEditor(projectId, moduleId, response.page.id, this.editingFeatureId());
      this.notifications.success(existingPageId ? 'Page updated.' : 'Page created.');
    } catch (error) {
      this.notifications.error(
        this.extractMessage(error, this.editingPageId() ? 'Unable to update page.' : 'Unable to create page.'),
      );
    } finally {
      this.savingModule.set(false);
    }
  }

  async saveFeatureSection() {
    if (this.featureForm.invalid) {
      this.featureForm.markAllAsTouched();
      return;
    }

    this.savingFeature.set(true);
    try {
      const projectId = this.featureForm.controls.projectId.value;
      const moduleId = this.featureForm.controls.moduleId.value;
      const pageId = this.featureForm.controls.pageId.value;
      const payload = {
        pageId,
        name: this.featureForm.controls.name.value.trim(),
      };
      const existingFeatureId = this.editingFeatureId();
      const response = existingFeatureId
        ? await firstValueFrom(this.api.updateAdminFeature(existingFeatureId, payload))
        : await firstValueFrom(this.api.createAdminFeature(payload));

      this.editingProjectId.set(projectId);
      this.editingModuleId.set(moduleId);
      this.editingPageId.set(pageId);
      this.editingFeatureId.set(response.feature.id);
      this.mappingEditorMode.set('edit');

      await this.loadWorkspace();
      this.setActiveSection('mapping');
      this.reopenMappingEditor(projectId, moduleId, pageId, response.feature.id);
      this.notifications.success(existingFeatureId ? 'Feature updated.' : 'Feature created.');
    } catch (error) {
      this.notifications.error(
        this.extractMessage(error, this.editingFeatureId() ? 'Unable to update feature.' : 'Unable to create feature.'),
      );
    } finally {
      this.savingFeature.set(false);
    }
  }

  openMappingCreate() {
    this.setActiveSection('mapping');
    this.mappingEditorMode.set('create');
    this.mappingEditorOpen.set(true);
    this.editingProjectId.set(null);
    this.editingModuleId.set(null);
    this.editingPageId.set(null);
    this.editingFeatureId.set(null);
    this.projectForm.reset({
      name: '',
      description: '',
    });
    this.moduleForm.reset({
      projectId: '',
      name: '',
    });
    this.pageForm.reset({
      projectId: '',
      moduleId: '',
      name: '',
    });
    this.featureForm.reset({
      projectId: '',
      moduleId: '',
      pageId: '',
      name: '',
    });
    this.allocationForm.reset({
      projectId: '',
      years: [],
      quarters: [],
      testerContributorIds: [],
    });
  }

  closeMappingEditor() {
    this.mappingEditorOpen.set(false);
    this.mappingEditorMode.set('create');
    this.cancelProjectEdit();
    this.cancelModuleEdit();
    this.cancelPageEdit();
    this.cancelFeatureEdit();
    this.syncAllocationDefaults();
  }

  onMappingModuleProjectChange(projectId: string) {
    if (!projectId) {
      return;
    }

    this.editingModuleId.set(null);
    this.moduleForm.patchValue(
      {
        projectId,
        name: '',
      },
      { emitEvent: false },
    );
    this.pageForm.patchValue(
      {
        projectId,
        moduleId: '',
        name: '',
      },
      { emitEvent: false },
    );
    this.featureForm.patchValue(
      {
        projectId,
        moduleId: '',
        pageId: '',
        name: '',
      },
      { emitEvent: false },
    );
    this.editingPageId.set(null);
    this.editingFeatureId.set(null);
  }

  onMappingModuleSelectionChange(moduleId: string) {
    if (!moduleId) {
      this.editingModuleId.set(null);
      this.moduleForm.patchValue({ name: '' }, { emitEvent: false });
      this.editingPageId.set(null);
      this.pageForm.patchValue({ moduleId: '', name: '' }, { emitEvent: false });
      return;
    }

    const moduleItem = this.mappingModuleOptions().find((entry) => entry.id === moduleId) ?? null;
    this.editingModuleId.set(moduleItem?.id ?? null);
    this.moduleForm.patchValue(
      {
        projectId: this.moduleForm.controls.projectId.value,
        name: moduleItem?.name ?? '',
      },
      { emitEvent: false },
    );

    const firstPage = moduleItem?.pages[0] ?? null;
    this.editingPageId.set(firstPage?.id ?? null);
    this.pageForm.patchValue(
      {
        projectId: this.mappingProject()?.id ?? this.moduleForm.controls.projectId.value,
        moduleId: moduleItem?.id ?? '',
        name: firstPage?.name ?? '',
      },
      { emitEvent: false },
    );
  }

  onMappingPageProjectChange(projectId: string) {
    if (!projectId) {
      return;
    }

    this.pageForm.patchValue(
      {
        projectId,
        moduleId: '',
        name: '',
      },
      { emitEvent: false },
    );
    this.editingPageId.set(null);
    this.featureForm.patchValue(
      {
        projectId,
        moduleId: '',
        pageId: '',
        name: '',
      },
      { emitEvent: false },
    );
    this.editingFeatureId.set(null);
  }

  onMappingPageModuleChange(moduleId: string) {
    if (!moduleId) {
      this.pageForm.patchValue(
        {
          moduleId: '',
          name: '',
        },
        { emitEvent: false },
      );
      this.editingPageId.set(null);
      this.featureForm.patchValue(
        {
          moduleId: '',
          pageId: '',
          name: '',
        },
        { emitEvent: false },
      );
      this.editingFeatureId.set(null);
      return;
    }

    const firstPage = this.mappingModuleOptions().find((entry) => entry.id === moduleId)?.pages[0] ?? null;
    this.pageForm.patchValue(
      {
        moduleId,
        name: firstPage?.name ?? '',
      },
      { emitEvent: false },
    );
    this.editingPageId.set(firstPage?.id ?? null);
    this.featureForm.patchValue(
      {
        projectId: this.pageForm.controls.projectId.value,
        moduleId,
        pageId: firstPage?.id ?? '',
        name: firstPage?.features[0]?.name ?? '',
      },
      { emitEvent: false },
    );
    this.editingFeatureId.set(firstPage?.features[0]?.id ?? null);
  }

  onMappingPageSelectionChange(pageId: string) {
    if (!pageId) {
      this.editingPageId.set(null);
      this.pageForm.patchValue({ name: '' }, { emitEvent: false });
      return;
    }

    const pageItem = this.mappingPageOptions().find((entry) => entry.id === pageId) ?? null;
    this.editingPageId.set(pageItem?.id ?? null);
    this.pageForm.patchValue(
      {
        name: pageItem?.name ?? '',
      },
      { emitEvent: false },
    );
    this.featureForm.patchValue(
      {
        projectId: this.pageForm.controls.projectId.value,
        moduleId: this.pageForm.controls.moduleId.value,
        pageId,
        name: pageItem?.features[0]?.name ?? '',
      },
      { emitEvent: false },
    );
    this.editingFeatureId.set(pageItem?.features[0]?.id ?? null);
  }

  onMappingFeatureProjectChange(projectId: string) {
    if (!projectId) {
      return;
    }

    this.featureForm.patchValue(
      {
        projectId,
        moduleId: '',
        pageId: '',
        name: '',
      },
      { emitEvent: false },
    );
    this.editingFeatureId.set(null);
  }

  onMappingFeatureModuleChange(moduleId: string) {
    if (!moduleId) {
      this.featureForm.patchValue(
        {
          moduleId: '',
          pageId: '',
          name: '',
        },
        { emitEvent: false },
      );
      this.editingFeatureId.set(null);
      return;
    }

    const firstPage = this.featureModuleOptions().find((moduleItem) => moduleItem.id === moduleId)?.pages[0] ?? null;
    const firstFeature = firstPage?.features[0] ?? null;
    this.featureForm.patchValue(
      {
        moduleId,
        pageId: firstPage?.id ?? '',
        name: firstFeature?.name ?? '',
      },
      { emitEvent: false },
    );
    this.editingFeatureId.set(firstFeature?.id ?? null);
  }

  onMappingFeaturePageChange(pageId: string) {
    if (!pageId) {
      this.featureForm.patchValue(
        {
          pageId: '',
          name: '',
        },
        { emitEvent: false },
      );
      this.editingFeatureId.set(null);
      return;
    }

    const firstFeature = this.featurePageOptions().find((pageItem) => pageItem.id === pageId)?.features[0] ?? null;
    this.featureForm.patchValue(
      {
        pageId,
        name: firstFeature?.name ?? '',
      },
      { emitEvent: false },
    );
    this.editingFeatureId.set(firstFeature?.id ?? null);
  }

  onMappingFeatureSelectionChange(featureId: string) {
    if (!featureId) {
      this.editingFeatureId.set(null);
      this.featureForm.patchValue({ name: '' }, { emitEvent: false });
      return;
    }

    const featureItem = this.mappingFeatureOptions().find((entry) => entry.id === featureId) ?? null;
    this.editingFeatureId.set(featureItem?.id ?? null);
    this.featureForm.patchValue(
      {
        name: featureItem?.name ?? '',
      },
      { emitEvent: false },
    );
  }

  async submitMappingEntity() {
    await this.saveClientSection();
    if (this.moduleForm.controls.projectId.value && this.moduleForm.controls.name.value.trim()) {
      await this.saveModuleSection();
    }
    if (
      this.pageForm.controls.projectId.value &&
      this.pageForm.controls.moduleId.value &&
      this.pageForm.controls.name.value.trim()
    ) {
      await this.savePageSection();
    }
    if (
      this.featureForm.controls.projectId.value &&
      this.featureForm.controls.moduleId.value &&
      this.featureForm.controls.pageId.value &&
      this.featureForm.controls.name.value.trim()
    ) {
      await this.saveFeatureSection();
    }
  }

  async submitProject() {
    await this.saveClientSection();
  }

  async submitModule() {
    await this.saveModuleSection();
  }

  async submitPage() {
    await this.savePageSection();
  }

  async submitFeature() {
    await this.saveFeatureSection();
  }

  async deleteModule(moduleId: string, moduleName: string, event?: Event) {
    event?.stopPropagation();

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`Delete module ${moduleName}? This will also remove its pages and related allocations.`);
    if (!confirmed) {
      return;
    }

    try {
      const projectId = this.editingProjectId() || this.moduleForm.controls.projectId.value || this.pageForm.controls.projectId.value;
      await firstValueFrom(this.api.deleteAdminModule(moduleId));
      this.notifications.success(`${moduleName} removed.`);
      await this.loadWorkspace();
      if (this.editingModuleId() === moduleId) {
        this.cancelModuleEdit();
      }
      if (this.pageForm.controls.moduleId.value === moduleId) {
        this.cancelPageEdit();
      }
      if (projectId) {
        this.reopenMappingEditor(projectId);
      }
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to delete module.'));
    }
  }

  async deletePage(pageId: string, pageName: string, event?: Event) {
    event?.stopPropagation();

    const confirmed = typeof window === 'undefined' ? true : window.confirm(`Delete page ${pageName}?`);
    if (!confirmed) {
      return;
    }

    try {
      const projectId = this.editingProjectId() || this.pageForm.controls.projectId.value;
      const moduleId = this.pageForm.controls.moduleId.value || this.editingModuleId();
      await firstValueFrom(this.api.deleteAdminPage(pageId));
      this.notifications.success(`${pageName} removed.`);
      await this.loadWorkspace();
      if (this.editingPageId() === pageId) {
        this.cancelPageEdit();
      }
      if (projectId) {
        this.reopenMappingEditor(projectId, moduleId);
      }
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to delete page.'));
    }
  }

  async deleteFeature(featureId: string, featureName: string, event?: Event) {
    event?.stopPropagation();

    const confirmed = typeof window === 'undefined' ? true : window.confirm(`Delete feature ${featureName}?`);
    if (!confirmed) {
      return;
    }

    try {
      const projectId = this.editingProjectId() || this.featureForm.controls.projectId.value;
      const moduleId = this.featureForm.controls.moduleId.value || this.editingModuleId();
      const pageId = this.featureForm.controls.pageId.value || this.editingPageId();
      await firstValueFrom(this.api.deleteAdminFeature(featureId));
      this.notifications.success(`${featureName} removed.`);
      await this.loadWorkspace();
      if (this.editingFeatureId() === featureId) {
        this.cancelFeatureEdit();
      }
      if (projectId) {
        this.reopenMappingEditor(projectId, moduleId, pageId);
      }
    } catch (error) {
      this.notifications.error(this.extractMessage(error, 'Unable to delete feature.'));
    }
  }

  async deleteEditingProject() {
    const projectId = this.editingProjectId();
    if (!projectId) {
      return;
    }

    await this.deleteProject(projectId);
    this.closeMappingEditor();
  }

  async deleteEditingModule() {
    const moduleId = this.editingModuleId();
    const moduleName = this.moduleForm.controls.name.value.trim();
    if (!moduleId || !moduleName) {
      return;
    }

    await this.deleteModule(moduleId, moduleName);
  }

  async deleteEditingPage() {
    const pageId = this.editingPageId();
    const pageName = this.pageForm.controls.name.value.trim();
    if (!pageId || !pageName) {
      return;
    }

    await this.deletePage(pageId, pageName);
  }

  async deleteEditingFeature() {
    const featureId = this.editingFeatureId();
    const featureName = this.featureForm.controls.name.value.trim();
    if (!featureId || !featureName) {
      return;
    }

    await this.deleteFeature(featureId, featureName);
  }

  private syncAccessesForRole(role: AppUserRole) {
    this.userForm.controls.pageAccesses.setValue(this.normalizeAccessList(role, this.userForm.controls.pageAccesses.value));
  }

  private normalizeAccessList(role: AppUserRole, accesses: string[]) {
    const next = new Set<string>();
    next.add('dashboard');

    if (role === 'ADMIN') {
      for (const definition of this.pageAccessDefinitions()) {
        next.add(definition.key);
      }
      return [...next];
    }

    for (const access of accesses) {
      if (access !== 'admin') {
        next.add(access);
      }
    }

    return [...next];
  }

  private normalizeAccessesForRole(role: AppUserRole, accesses: string[]) {
    return this.normalizeAccessList(role, accesses);
  }

  private buildUserPayload() {
    const qaTester = this.userForm.controls.qaTester.value;
    return {
      email: this.userForm.controls.email.value.trim(),
      name: this.userForm.controls.name.value.trim(),
      role: this.userForm.controls.role.value,
      isActive: this.userForm.controls.isActive.value,
      pageAccesses: this.normalizeAccessList(this.userForm.controls.role.value, this.userForm.controls.pageAccesses.value),
      designation: qaTester ? this.userForm.controls.designation.value.trim() || 'QA Tester' : null,
    };
  }

  isQaTesterUser(user: AdminUserRecord) {
    return Boolean(user.contributor?.roleTitle?.trim());
  }

  accessSummary(user: AdminUserRecord) {
    const definitions = new Map(this.pageAccessDefinitions().map((definition) => [definition.key, definition.label]));
    const labels = user.pageAccesses.map((key) => definitions.get(key) ?? key);
    const visible = labels.slice(0, 3);
    const remaining = Math.max(0, labels.length - visible.length);
    const suffix = remaining > 0 ? ` +${remaining}` : '';
    return `${visible.join(', ')}${suffix}`;
  }

  openSection(section: 'uam' | 'mapping') {
    this.setActiveSection(section);
    if (section === 'mapping') {
      this.closeUserEditor();
    } else {
      this.mappingEditorOpen.set(false);
    }
  }

  closeUserEditor() {
    this.selectedUserId.set(null);
    this.userEditorOpen.set(false);
    this.userForm.reset({
      email: '',
      name: '',
      role: 'USER',
      isActive: true,
      pageAccesses: ['dashboard'],
      qaTester: false,
      designation: '',
    });
    this.syncAccessesForRole('USER');
  }

  setUserSearchTerm(term: string) {
    this.userSearchTerm.set(term);
  }

  setClientRegistrySearchTerm(term: string) {
    this.clientRegistrySearchTerm.set(term);
  }

  setClientRegistryTypeFilter(value: 'all' | 'withModules' | 'withoutModules') {
    this.clientRegistryTypeFilter.set(value);
  }

  setClientRegistryModuleFilter(value: string) {
    this.clientRegistryModuleFilter.set(value);
  }

  toggleProjectExpansion(projectId: string, event?: Event) {
    event?.stopPropagation();
    this.expandedProjectId.update((current) => (current === projectId ? null : projectId));
  }

  isProjectExpanded(projectId: string) {
    return this.expandedProjectId() === projectId;
  }

  isMappingModuleSelected(moduleId: string) {
    return this.editingModuleId() === moduleId;
  }

  isMappingPageSelected(pageId: string) {
    return this.editingPageId() === pageId;
  }

  isMappingFeatureSelected(featureId: string) {
    return this.editingFeatureId() === featureId;
  }

  selectMappingModule(moduleId: string, event?: Event) {
    event?.stopPropagation();
    const project = this.mappingProject();
    const moduleItem = project?.modules.find((entry) => entry.id === moduleId) ?? null;
    if (!project || !moduleItem) {
      return;
    }

    this.startModuleEdit(project, moduleItem, event);
  }

  selectMappingPage(pageId: string, event?: Event) {
    event?.stopPropagation();
    const project = this.mappingProject();
    const moduleItem = this.mappingModuleOptions().find((entry) => entry.id === (this.pageForm.controls.moduleId.value || this.editingModuleId())) ?? null;
    const pageItem = moduleItem?.pages.find((entry) => entry.id === pageId) ?? null;
    if (!project || !moduleItem || !pageItem) {
      return;
    }

    this.startPageEdit(project, moduleItem, pageItem, event);
  }

  selectMappingFeature(featureId: string, event?: Event) {
    event?.stopPropagation();
    const projectId = this.featureForm.controls.projectId.value || this.editingProjectId();
    const moduleId = this.featureForm.controls.moduleId.value || this.editingModuleId();
    const pageId = this.featureForm.controls.pageId.value || this.editingPageId();
    const project = this.projectOptions().find((entry) => entry.id === projectId) ?? null;
    const moduleItem = project?.modules.find((entry) => entry.id === moduleId) ?? null;
    const pageItem = moduleItem?.pages.find((entry) => entry.id === pageId) ?? null;
    const featureItem = pageItem?.features.find((entry) => entry.id === featureId) ?? null;
    if (!project || !moduleItem || !pageItem || !featureItem) {
      return;
    }

    this.startFeatureEdit(project, moduleItem, pageItem, featureItem, event);
  }

  projectModuleCount(project: ProjectHierarchyOption) {
    return project.modules.length;
  }

  projectPageCount(project: ProjectHierarchyOption) {
    return project.modules.reduce((total, moduleItem) => total + moduleItem.pages.length, 0);
  }

  projectFeatureCount(project: ProjectHierarchyOption) {
    return project.modules.reduce(
      (total, moduleItem) =>
        total + moduleItem.pages.reduce((pageTotal, pageItem) => pageTotal + pageItem.features.length, 0),
      0,
    );
  }

  projectQuarterSummary(projectId: string) {
    const order = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 } as const;
    const items = this.allocations()
      .filter((allocation) => allocation.project.id === projectId)
      .map((allocation) => ({
        label: `${allocation.quarter} ${allocation.year}`,
        year: allocation.year,
        quarter: allocation.quarter,
      }))
      .sort((left, right) => {
        const yearCompare = left.year - right.year;
        if (yearCompare !== 0) {
          return yearCompare;
        }

        return order[left.quarter] - order[right.quarter];
      });

    const labels = [...new Set(items.map((item) => item.label))];
    return labels.length ? labels.join(', ') : '-';
  }

  projectTesterSummary(projectId: string) {
    return this.summarizeTesterNames(
      this.executionRuns()
        .filter((run) => run.status === 'completed' && run.project.id === projectId)
        .map((run) => getExecutionRunOwner(run)),
    );
  }

  projectExecutionRows(project: ProjectHierarchyOption): ProjectExecutionModuleRow[] {
    const completedRuns = this.executionRuns().filter((run) => run.status === 'completed' && run.project.id === project.id);

    return project.modules.map((moduleItem) => {
      const pageRows = moduleItem.pages.map((pageItem) => ({
        pageId: pageItem.id,
        pageName: pageItem.name,
        testerLabel: this.summarizeTesterNames(
          completedRuns
            .filter((run) => run.page?.id === pageItem.id)
            .map((run) => getExecutionRunOwner(run)),
        ),
        features: pageItem.features.map((featureItem) => ({
          featureId: featureItem.id,
          featureName: featureItem.name,
        })),
      }));

      const moduleRuns = completedRuns.filter((run) => {
        if (run.module?.id !== moduleItem.id) {
          return false;
        }

        if (!run.page) {
          return true;
        }

        return moduleItem.pages.some((pageItem) => pageItem.id === run.page?.id);
      });

      return {
        moduleId: moduleItem.id,
        moduleName: moduleItem.name,
        testerLabel: this.summarizeTesterNames(moduleRuns.map((run) => getExecutionRunOwner(run))),
        pages: pageRows,
      };
    });
  }

  private async seedKnownQaMembers() {
    const allAccesses = this.pageAccessDefinitions().map((definition) => definition.key);
    const existingUsers = this.users();
    for (const profile of this.qaBootstrapProfiles) {
      const matchingUser =
        existingUsers.find((user) => user.email.toLowerCase() === profile.email.toLowerCase()) ?? null;
      const payload = {
        email: profile.email,
        name: profile.name,
        role: 'USER' as const,
        isActive: true,
        pageAccesses: allAccesses,
        designation: profile.designation,
      };

      if (matchingUser) {
        await firstValueFrom(this.api.updateAdminUser(matchingUser.id, payload));
        continue;
      }

      await firstValueFrom(this.api.createAdminUser(payload));
    }
  }

  private syncAllocationDefaults() {
    const projectOptions = this.projectOptions();

    if (!this.allocationForm.controls.projectId.value && projectOptions.length) {
      this.allocationForm.controls.projectId.setValue(projectOptions[0].id);
    }

    if (!this.moduleForm.controls.projectId.value && projectOptions.length) {
      this.moduleForm.controls.projectId.setValue(projectOptions[0].id);
    }

    if (this.moduleForm.controls.projectId.value && !projectOptions.some((item) => item.id === this.moduleForm.controls.projectId.value)) {
      this.moduleForm.controls.projectId.setValue(projectOptions[0]?.id ?? '');
    }

    if (!this.pageForm.controls.projectId.value && projectOptions.length) {
      this.pageForm.controls.projectId.setValue(projectOptions[0].id);
    }

    if (this.pageForm.controls.projectId.value && !projectOptions.some((item) => item.id === this.pageForm.controls.projectId.value)) {
      this.pageForm.controls.projectId.setValue(projectOptions[0]?.id ?? '');
    }

    if (!this.featureForm.controls.projectId.value && projectOptions.length) {
      this.featureForm.controls.projectId.setValue(projectOptions[0].id);
    }

    if (
      this.featureForm.controls.projectId.value &&
      !projectOptions.some((item) => item.id === this.featureForm.controls.projectId.value)
    ) {
      this.featureForm.controls.projectId.setValue(projectOptions[0]?.id ?? '');
    }

    const pageProject = projectOptions.find((item) => item.id === this.pageForm.controls.projectId.value) ?? null;
    const pageModules = pageProject?.modules ?? [];
    if (!this.pageForm.controls.moduleId.value && pageModules.length) {
      this.pageForm.controls.moduleId.setValue(pageModules[0].id);
    }

    if (this.pageForm.controls.moduleId.value && !pageModules.some((item) => item.id === this.pageForm.controls.moduleId.value)) {
      this.pageForm.controls.moduleId.setValue(pageModules[0]?.id ?? '');
    }

    const featureProject = projectOptions.find((item) => item.id === this.featureForm.controls.projectId.value) ?? null;
    const featureModules = featureProject?.modules ?? [];
    if (!this.featureForm.controls.moduleId.value && featureModules.length) {
      this.featureForm.controls.moduleId.setValue(featureModules[0].id);
    }

    if (
      this.featureForm.controls.moduleId.value &&
      !featureModules.some((item) => item.id === this.featureForm.controls.moduleId.value)
    ) {
      this.featureForm.controls.moduleId.setValue(featureModules[0]?.id ?? '');
    }

    const featurePages =
      featureModules.find((item) => item.id === this.featureForm.controls.moduleId.value)?.pages ?? [];
    if (!this.featureForm.controls.pageId.value && featurePages.length) {
      this.featureForm.controls.pageId.setValue(featurePages[0].id);
    }

    if (
      this.featureForm.controls.pageId.value &&
      !featurePages.some((item) => item.id === this.featureForm.controls.pageId.value)
    ) {
      this.featureForm.controls.pageId.setValue(featurePages[0]?.id ?? '');
    }

    if (!Array.isArray(this.allocationForm.controls.quarters.value)) {
      this.allocationForm.controls.quarters.setValue([]);
    }

    if (!Array.isArray(this.allocationForm.controls.years.value)) {
      this.allocationForm.controls.years.setValue([]);
    }

    if (!Array.isArray(this.allocationForm.controls.testerContributorIds.value)) {
      this.allocationForm.controls.testerContributorIds.setValue([]);
    }
  }

  private summarizeTesterNames(names: string[]) {
    const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );

    return uniqueNames.length ? uniqueNames.join(', ') : '-';
  }

  private setActiveSection(section: 'uam' | 'mapping') {
    this.activeSection.set(section);
  }

  private reopenMappingEditor(projectId: string, moduleId?: string | null, pageId?: string | null, featureId?: string | null) {
    const project = this.projectOptions().find((entry) => entry.id === projectId) ?? null;
    if (!project) {
      return;
    }

    if (pageId && featureId) {
      for (const moduleItem of project.modules) {
        const pageItem = moduleItem.pages.find((entry) => entry.id === pageId) ?? null;
        const featureItem = pageItem?.features.find((entry) => entry.id === featureId) ?? null;
        if (pageItem && featureItem) {
          this.startFeatureEdit(project, moduleItem, pageItem, featureItem);
          return;
        }
      }
    }

    if (pageId) {
      for (const moduleItem of project.modules) {
        const pageItem = moduleItem.pages.find((entry) => entry.id === pageId) ?? null;
        if (pageItem) {
          this.startPageEdit(project, moduleItem, pageItem);
          return;
        }
      }
    }

    if (moduleId) {
      const moduleItem = project.modules.find((entry) => entry.id === moduleId) ?? null;
      if (moduleItem) {
        this.startModuleEdit(project, moduleItem);
        return;
      }
    }

    this.startProjectEdit(project);
  }

  private extractMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return fallback;
  }

  private scrollToSection(section: 'uam' | 'mapping') {
    if (typeof document === 'undefined') {
      return;
    }

    const targetId = section === 'uam' ? 'uam-section' : 'client-mapping-section';
    setTimeout(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

}

