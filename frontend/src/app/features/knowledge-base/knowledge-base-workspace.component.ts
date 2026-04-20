import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom, forkJoin, startWith } from 'rxjs';

import { createEmptyPayload, entityConfigList, getEntityConfig } from '../../core/entity-config';
import type {
  DatasetItemType,
  DatasetStatus,
  KnowledgeAsset,
  KnowledgeAssetKind,
  KnowledgeAssetReviewStatus,
  KnowledgeBaseWorkspace,
  KnowledgeScopeLevel,
  KnowledgeSuggestion,
  ProjectHierarchyModuleOption,
  ProjectHierarchyOption,
  StructuredKnowledgeWorkspaceItem,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { ComponentCatalogueImportDialogComponent } from '../../shared/components/component-catalogue-import-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { RefinementModeDialogComponent } from '../../shared/components/refinement-mode-dialog.component';

type WorkspaceTab = 'all' | 'documents' | 'structured' | 'needsReview' | 'linked';
type WorkspaceEntry = {
  key: string;
  entryType: 'asset' | 'structured';
  title: string;
  summary: string | null;
  status: string;
  statusLabel: string;
  typeKey: string;
  typeLabel: string;
  tags: string[];
  updatedAt: string;
  linkedCount: number;
  projectId: string | null;
  moduleId: string | null;
  pageId: string | null;
  rawAsset?: KnowledgeAsset;
  rawStructured?: StructuredKnowledgeWorkspaceItem;
};

type InspectorMode =
  | { type: 'empty' }
  | { type: 'asset'; assetId: string | null; kind: KnowledgeAssetKind }
  | { type: 'structured'; itemId: string | null; itemType: DatasetItemType; seedAssetId: string | null };

type StructuredSearchResult = {
  item: StructuredKnowledgeWorkspaceItem;
  alreadyLinked: boolean;
};

type AssetSearchResult = {
  asset: KnowledgeAsset;
  alreadyLinked: boolean;
};

@Component({
  selector: 'app-knowledge-base-workspace',
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
    MatProgressSpinnerModule,
    MatSelectModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  templateUrl: './knowledge-base-workspace.component.html',
  styleUrl: './knowledge-base-workspace.component.scss',
})
export class KnowledgeBaseWorkspaceComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly workspace = signal<KnowledgeBaseWorkspace | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly learningSuggestions = signal<KnowledgeSuggestion[]>([]);
  readonly suggestionActionId = signal<string | null>(null);
  readonly activeTab = signal<WorkspaceTab>('all');
  readonly inspector = signal<InspectorMode>({ type: 'empty' });
  readonly selectedKeys = signal<string[]>([]);
  readonly assetFileBase64 = signal<string | null>(null);
  readonly assetPreviewDataUrl = signal<string | null>(null);
  readonly assetExtractedMetadata = signal<Record<string, unknown> | null>(null);
  readonly showAdvancedStructuredFields = signal(false);

  readonly filters = this.fb.nonNullable.group({
    search: [''],
    typeKey: [''],
    status: [''],
    tag: [''],
    projectId: [''],
    moduleId: [''],
    pageId: [''],
  });

  readonly assetForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    summary: [''],
    kind: ['pastedText' as KnowledgeAssetKind, Validators.required],
    sourceFormat: [''],
    fileName: [''],
    mimeType: [''],
    contentText: [''],
    tagsText: [''],
    reviewStatus: ['raw' as KnowledgeAssetReviewStatus, Validators.required],
    projectId: [''],
    moduleId: [''],
    pageId: [''],
  });

  readonly linkControl = new FormControl('', { nonNullable: true });
  readonly linkNotesControl = new FormControl('', { nonNullable: true });
  readonly structuredStatusControl = new FormControl<DatasetStatus>('draft', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly structuredItemTypeControl = new FormControl<DatasetItemType>('componentCatalogue', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly structuredScopeForm = this.fb.nonNullable.group({
    projectId: [''],
    moduleId: [''],
    pageId: [''],
    scopeLevel: ['project' as KnowledgeScopeLevel],
  });
  readonly structuredForm = this.fb.group({});
  readonly filterValues = toSignal(this.filters.valueChanges.pipe(startWith(this.filters.getRawValue())), {
    initialValue: this.filters.getRawValue(),
  });
  readonly assetFormValues = toSignal(this.assetForm.valueChanges.pipe(startWith(this.assetForm.getRawValue())), {
    initialValue: this.assetForm.getRawValue(),
  });
  readonly structuredScopeValues = toSignal(
    this.structuredScopeForm.valueChanges.pipe(startWith(this.structuredScopeForm.getRawValue())),
    { initialValue: this.structuredScopeForm.getRawValue() },
  );

  readonly tabOptions: Array<{ key: WorkspaceTab; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'documents', label: 'Documents' },
    { key: 'structured', label: 'Structured Knowledge' },
    { key: 'needsReview', label: 'Awaiting Approval' },
    { key: 'linked', label: 'Linked to Generator' },
  ];

  readonly assetKindOptions: Array<{ value: KnowledgeAssetKind; label: string }> = [
    { value: 'file', label: 'Uploaded document' },
    { value: 'pastedText', label: 'Pasted input' },
    { value: 'manualInput', label: 'Manual input' },
  ];

  readonly assetStatusOptions: Array<{ value: KnowledgeAssetReviewStatus; label: string }> = [
    { value: 'raw', label: 'Needs approval' },
    { value: 'reviewed', label: 'Approved source' },
    { value: 'linked', label: 'Approved & linked' },
    { value: 'archived', label: 'Archived' },
  ];

  readonly statusOptions = [
    { value: '', label: 'Any status' },
    { value: 'raw', label: 'Needs approval' },
    { value: 'reviewed', label: 'Approved source' },
    { value: 'linked', label: 'Approved & linked' },
    { value: 'draft', label: 'Draft' },
    { value: 'approved', label: 'Approved' },
    { value: 'archived', label: 'Archived' },
  ];

  readonly typeOptions = computed(() => [
    { value: '', label: 'All types' },
    { value: 'asset:file', label: 'Documents / files' },
    { value: 'asset:pastedText', label: 'Pasted inputs' },
    { value: 'asset:manualInput', label: 'Manual inputs' },
    ...entityConfigList.map((config) => ({
      value: `structured:${config.key}`,
      label: config.label,
    })),
  ]);

  readonly projectOptions = computed(() => this.workspace()?.projectHierarchy ?? []);
  readonly entityConfigs = entityConfigList;
  readonly selectedProject = computed(() =>
    this.projectOptions().find((project) => project.id === this.filterValues().projectId) ?? null,
  );
  readonly moduleOptions = computed<ProjectHierarchyModuleOption[]>(() => this.selectedProject()?.modules ?? []);
  readonly pageOptions = computed(() => {
    const selectedModuleId = this.filterValues().moduleId;
    const selectedModule = this.moduleOptions().find((module) => module.id === selectedModuleId);
    return selectedModule?.pages ?? [];
  });

  readonly assetProjectOptions = computed(() => this.projectOptions());
  readonly assetModuleOptions = computed(() => {
    const projectId = this.assetFormValues().projectId;
    const project = this.projectOptions().find((candidate) => candidate.id === projectId);
    return project?.modules ?? [];
  });
  readonly assetPageOptions = computed(() => {
    const moduleId = this.assetFormValues().moduleId;
    const module = this.assetModuleOptions().find((candidate) => candidate.id === moduleId);
    return module?.pages ?? [];
  });
  readonly structuredProjectOptions = computed<ProjectHierarchyOption[]>(() => this.projectOptions());
  readonly structuredSelectedProject = computed(
    () => this.structuredProjectOptions().find((project) => project.id === this.structuredScopeValues().projectId) ?? null,
  );
  readonly structuredModuleOptions = computed<ProjectHierarchyModuleOption[]>(() => this.structuredSelectedProject()?.modules ?? []);
  readonly structuredPageOptions = computed(() => {
    const moduleId = this.structuredScopeValues().moduleId;
    const module = this.structuredModuleOptions().find((candidate) => candidate.id === moduleId);
    return module?.pages ?? [];
  });

  readonly currentAsset = computed(() => {
    const inspector = this.inspector();
    if (inspector.type !== 'asset' || !inspector.assetId) {
      return null;
    }

    return this.workspace()?.assets.find((asset) => asset.id === inspector.assetId) ?? null;
  });

  readonly currentStructuredItem = computed(() => {
    const inspector = this.inspector();
    if (inspector.type !== 'structured' || !inspector.itemId) {
      return null;
    }

    return this.workspace()?.structuredItems.find((item) => item.id === inspector.itemId) ?? null;
  });

  readonly searchTerm = computed(() => (this.filterValues().search ?? '').trim().toLowerCase());

  constructor() {
    this.rebuildStructuredForm(this.structuredItemTypeControl.getRawValue());
    this.loadWorkspace();
  }

  isProjectMemoryType(itemType = this.structuredItemTypeControl.getRawValue()) {
    return itemType === 'projectMemory';
  }

  suggestionTargetLabel(suggestion: KnowledgeSuggestion) {
    switch (suggestion.targetType) {
      case 'projectMemory':
        return 'Project memory';
      case 'componentCatalogue':
        return 'Component baseline';
      case 'scenarioTemplate':
        return 'Scenario template';
      case 'rulePack':
        return 'Rule pack';
      default:
        return 'Reusable knowledge';
    }
  }

  suggestionScopeLabel(suggestion: KnowledgeSuggestion) {
    return suggestion.page?.name || suggestion.module?.name || suggestion.project?.name || 'Global scope';
  }

  approveSuggestion(suggestionId: string) {
    this.suggestionActionId.set(suggestionId);
    this.api
      .approveLearningSuggestion(suggestionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Learning suggestion approved and applied through the safe review flow.');
          this.loadWorkspace(this.inspector());
          this.suggestionActionId.set(null);
        },
        error: () => {
          this.notifications.error('Unable to approve the learning suggestion.');
          this.suggestionActionId.set(null);
        },
      });
  }

  rejectSuggestion(suggestionId: string) {
    this.suggestionActionId.set(suggestionId);
    this.api
      .rejectLearningSuggestion(suggestionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Learning suggestion rejected.');
          this.loadWorkspace(this.inspector());
          this.suggestionActionId.set(null);
        },
        error: () => {
          this.notifications.error('Unable to reject the learning suggestion.');
          this.suggestionActionId.set(null);
        },
      });
  }

  onStructuredProjectChange(projectId: string) {
    const currentProjectId = this.structuredScopeForm.controls.projectId.getRawValue();
    if (projectId === currentProjectId) {
      return;
    }

    this.structuredScopeForm.patchValue({
      projectId,
      moduleId: '',
      pageId: '',
      scopeLevel: projectId ? 'project' : 'project',
    });
  }

  onStructuredModuleChange(moduleId: string) {
    this.structuredScopeForm.patchValue({
      moduleId,
      pageId: '',
      scopeLevel: moduleId ? 'module' : this.structuredScopeForm.controls.projectId.getRawValue() ? 'project' : 'project',
    });
  }

  readonly filteredEntries = computed<WorkspaceEntry[]>(() => {
    const workspace = this.workspace();
    if (!workspace) {
      return [];
    }

    const search = this.searchTerm();
    const filterValues = this.filterValues();
    const typeKey = filterValues.typeKey;
    const status = filterValues.status;
    const tag = (filterValues.tag ?? '').trim().toLowerCase();
    const projectId = filterValues.projectId;
    const moduleId = filterValues.moduleId;
    const pageId = filterValues.pageId;

    const entries: WorkspaceEntry[] = [
      ...workspace.assets.map((asset) => ({
        key: `asset:${asset.id}`,
        entryType: 'asset' as const,
        title: asset.title,
        summary: asset.summary,
        status: asset.reviewStatus,
        statusLabel: this.getAssetStatusLabel(asset.reviewStatus),
        typeKey: `asset:${asset.kind}`,
        typeLabel:
          asset.kind === 'file'
            ? `Document${asset.sourceFormat ? ` | ${asset.sourceFormat.toUpperCase()}` : ''}`
            : asset.kind === 'pastedText'
              ? 'Pasted input'
              : 'Manual input',
        tags: asset.tags,
        updatedAt: asset.updatedAt,
        linkedCount: asset.links.length,
        projectId: asset.project?.id ?? null,
        moduleId: asset.module?.id ?? null,
        pageId: asset.page?.id ?? null,
        rawAsset: asset,
      })),
      ...workspace.structuredItems.map((item) => ({
        key: `structured:${item.id}`,
        entryType: 'structured' as const,
        title: item.title,
        summary: item.summary,
        status: item.status,
        statusLabel: this.toTitleCase(item.status),
        typeKey: `structured:${item.itemType}`,
        typeLabel: getEntityConfig(item.itemType).label,
        tags: item.tags,
        updatedAt: item.updatedAt,
        linkedCount: item.linkedAssetsCount,
        projectId: null,
        moduleId: null,
        pageId: null,
        rawStructured: item,
      })),
    ]
      .filter((entry) => {
        switch (this.activeTab()) {
          case 'documents':
            return entry.entryType === 'asset';
          case 'structured':
            return entry.entryType === 'structured';
          case 'needsReview':
            return entry.entryType === 'asset'
              ? entry.status === 'raw'
              : entry.status === 'draft';
          case 'linked':
            return entry.linkedCount > 0;
          default:
            return true;
        }
      })
      .filter((entry) => {
        if (search) {
          const linkedText =
            entry.entryType === 'asset'
              ? entry.rawAsset?.links
                  .map((link) => `${link.datasetItemTitle} ${link.notes ?? ''}`)
                  .join(' ') ?? ''
              : entry.rawStructured?.linkedAssetsPreview
                  .map((asset) => `${asset.title} ${asset.kind} ${asset.sourceFormat ?? ''}`)
                  .join(' ') ?? '';
          if (!this.matchesSearch(search, entry.title, entry.summary, entry.tags.join(' '), linkedText, entry.typeLabel)) {
            return false;
          }
        }

        if (typeKey && entry.typeKey !== typeKey) {
          return false;
        }

        if (status && entry.status !== status) {
          return false;
        }

        if (tag && !entry.tags.some((candidate) => candidate.toLowerCase().includes(tag))) {
          return false;
        }

        if (projectId && entry.projectId !== projectId) {
          return false;
        }

        if (moduleId && entry.moduleId !== moduleId) {
          return false;
        }

        if (pageId && entry.pageId !== pageId) {
          return false;
        }

        return true;
      })
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    return entries;
  });

  readonly availableLinkTargets = computed(() => {
    const asset = this.currentAsset();
    if (!asset) {
      return [];
    }

    const linkedIds = new Set(asset.links.map((link) => link.datasetItemId));
    return (this.workspace()?.structuredItems ?? []).filter((item) => item.status === 'approved' && !linkedIds.has(item.id));
  });

  readonly currentAssetLinks = computed(() => {
    const asset = this.currentAsset();
    const search = this.searchTerm();
    if (!asset) {
      return [];
    }

    return asset.links.filter((link) => {
      const linkedItem = this.workspace()?.structuredItems.find((item) => item.id === link.datasetItemId);
      if (!search) {
        return true;
      }

      return this.matchesSearch(
        search,
        link.datasetItemTitle,
        link.notes,
        linkedItem?.summary,
        linkedItem?.tags.join(' '),
        this.getEntityLabel(link.datasetItemType),
      );
    });
  });

  readonly currentStructuredLinkedAssets = computed(() => {
    const item = this.currentStructuredItem();
    const search = this.searchTerm();
    if (!item) {
      return [];
    }

    return item.linkedAssetsPreview.filter((asset) => {
      if (!search) {
        return true;
      }

      const fullAsset = this.workspace()?.assets.find((candidate) => candidate.id === asset.id);
      return this.matchesSearch(
        search,
        asset.title,
        asset.kind,
        asset.sourceFormat,
        fullAsset?.summary,
        fullAsset?.tags.join(' '),
      );
    });
  });

  readonly currentAssetSearchResults = computed<StructuredSearchResult[]>(() => {
    const asset = this.currentAsset();
    const search = this.searchTerm();
    if (!asset || !search) {
      return [];
    }

    const linkedIds = new Set(asset.links.map((link) => link.datasetItemId));
    return (this.workspace()?.structuredItems ?? [])
      .filter((item) => item.status === 'approved')
      .filter((item) => this.matchesSearch(search, item.title, item.summary, item.tags.join(' '), this.getEntityLabel(item.itemType)))
      .sort((left, right) => left.title.localeCompare(right.title))
      .slice(0, 24)
      .map((item) => ({
        item,
        alreadyLinked: linkedIds.has(item.id),
      }));
  });

  readonly currentStructuredSearchResults = computed<AssetSearchResult[]>(() => {
    const item = this.currentStructuredItem();
    const search = this.searchTerm();
    if (!item || !search) {
      return [];
    }

    const linkedIds = new Set(item.linkedAssetsPreview.map((asset) => asset.id));
    return (this.workspace()?.assets ?? [])
      .filter((asset) => this.isApprovedAsset(asset.reviewStatus))
      .filter((asset) => this.matchesSearch(search, asset.title, asset.summary, asset.tags.join(' '), asset.kind, asset.sourceFormat))
      .sort((left, right) => left.title.localeCompare(right.title))
      .slice(0, 24)
      .map((asset) => ({
        asset,
        alreadyLinked: linkedIds.has(asset.id),
      }));
  });

  readonly emptySearchResults = computed(() => {
    const search = this.searchTerm();
    if (!search || this.inspector().type !== 'empty') {
      return { structured: [] as StructuredKnowledgeWorkspaceItem[], assets: [] as KnowledgeAsset[] };
    }

    return {
      structured: (this.workspace()?.structuredItems ?? [])
        .filter((item) => item.status === 'approved')
        .filter((item) => this.matchesSearch(search, item.title, item.summary, item.tags.join(' '), this.getEntityLabel(item.itemType)))
        .slice(0, 16),
      assets: (this.workspace()?.assets ?? [])
        .filter((asset) => this.isApprovedAsset(asset.reviewStatus))
        .filter((asset) => this.matchesSearch(search, asset.title, asset.summary, asset.tags.join(' '), asset.kind, asset.sourceFormat))
        .slice(0, 16),
    };
  });

  readonly selectedEntries = computed(() =>
    this.filteredEntries().filter((entry) => this.selectedKeys().includes(entry.key)),
  );

  readonly canRunRefinement = computed(() => {
    const selectedStructured = this.selectedEntries()
      .filter((entry) => entry.entryType === 'structured')
      .map((entry) => entry.rawStructured!)
      .filter((item) => getEntityConfig(item.itemType).supportsBulkRefinement);

    if (!selectedStructured.length) {
      return false;
    }

    return new Set(selectedStructured.map((item) => item.itemType)).size === 1;
  });

  setTab(tab: WorkspaceTab) {
    this.activeTab.set(tab);
    this.selectedKeys.set([]);
  }

  resetFilters() {
    this.filters.reset({
      search: '',
      typeKey: '',
      status: '',
      tag: '',
      projectId: '',
      moduleId: '',
      pageId: '',
    });
  }

  onFilterProjectChange() {
    this.filters.patchValue({ moduleId: '', pageId: '' }, { emitEvent: false });
  }

  onFilterModuleChange() {
    this.filters.patchValue({ pageId: '' }, { emitEvent: false });
  }

  onAssetProjectChange() {
    this.assetForm.patchValue({ moduleId: '', pageId: '' }, { emitEvent: false });
  }

  onAssetModuleChange() {
    this.assetForm.patchValue({ pageId: '' }, { emitEvent: false });
  }

  openCreateAsset(kind: KnowledgeAssetKind) {
    this.inspector.set({ type: 'asset', assetId: null, kind });
    this.assetFileBase64.set(null);
    this.assetPreviewDataUrl.set(null);
    this.assetExtractedMetadata.set(null);
    this.assetForm.reset({
      title: '',
      summary: '',
      kind,
      sourceFormat: '',
      fileName: '',
      mimeType: '',
      contentText: '',
      tagsText: '',
      reviewStatus: 'raw',
      projectId: '',
      moduleId: '',
      pageId: '',
    });
  }

  openAsset(asset: KnowledgeAsset) {
    this.inspector.set({ type: 'asset', assetId: asset.id, kind: asset.kind });
    this.assetFileBase64.set(null);
    this.assetPreviewDataUrl.set(asset.previewDataUrl);
    this.assetExtractedMetadata.set(asset.extractedMetadata);
    this.assetForm.reset({
      title: asset.title,
      summary: asset.summary ?? '',
      kind: asset.kind,
      sourceFormat: asset.sourceFormat ?? '',
      fileName: asset.fileName ?? '',
      mimeType: asset.mimeType ?? '',
      contentText: asset.contentText ?? '',
      tagsText: asset.tags.join('\n'),
      reviewStatus: asset.reviewStatus,
      projectId: asset.project?.id ?? '',
      moduleId: asset.module?.id ?? '',
      pageId: asset.page?.id ?? '',
    });
  }

  openCreateStructured(itemType: DatasetItemType, seedAsset?: KnowledgeAsset | null) {
    this.inspector.set({
      type: 'structured',
      itemId: null,
      itemType,
      seedAssetId: seedAsset?.id ?? null,
    });
    this.structuredItemTypeControl.setValue(itemType);
    this.showAdvancedStructuredFields.set(false);
    this.rebuildStructuredForm(itemType, seedAsset ? this.buildStructuredSeed(itemType, seedAsset) : undefined);
    this.structuredStatusControl.setValue('draft');
    this.patchStructuredScope({
      projectId: seedAsset?.project?.id ?? '',
      moduleId: seedAsset?.module?.id ?? '',
      pageId: seedAsset?.page?.id ?? '',
      scopeLevel: seedAsset?.page?.id ? 'page' : seedAsset?.module?.id ? 'module' : 'project',
    });
  }

  openStructured(item: StructuredKnowledgeWorkspaceItem) {
    this.inspector.set({
      type: 'structured',
      itemId: item.id,
      itemType: item.itemType,
      seedAssetId: null,
    });
    this.structuredItemTypeControl.setValue(item.itemType);
    this.showAdvancedStructuredFields.set(false);
    this.rebuildStructuredForm(item.itemType, item.payload);
    this.structuredStatusControl.setValue(item.status === 'archived' ? 'draft' : item.status);
    this.patchStructuredScope({
      projectId: item.project?.id ?? '',
      moduleId: item.module?.id ?? '',
      pageId: item.page?.id ?? '',
      scopeLevel: item.scopeLevel ?? (item.page?.id ? 'page' : item.module?.id ? 'module' : 'project'),
    });
  }

  onStructuredTypeChange(itemType: DatasetItemType) {
    const inspector = this.inspector();
    if (inspector.type !== 'structured' || inspector.itemId) {
      return;
    }

    const seedAsset =
      inspector.seedAssetId != null
        ? this.workspace()?.assets.find((asset) => asset.id === inspector.seedAssetId) ?? null
        : null;

    this.inspector.set({
      type: 'structured',
      itemId: null,
      itemType,
      seedAssetId: inspector.seedAssetId,
    });
    this.showAdvancedStructuredFields.set(false);
    this.rebuildStructuredForm(itemType, seedAsset ? this.buildStructuredSeed(itemType, seedAsset) : undefined);
    this.patchStructuredScope({
      projectId: seedAsset?.project?.id ?? '',
      moduleId: seedAsset?.module?.id ?? '',
      pageId: seedAsset?.page?.id ?? '',
      scopeLevel: seedAsset?.page?.id ? 'page' : seedAsset?.module?.id ? 'module' : 'project',
    });
  }

  toggleSelection(entry: WorkspaceEntry) {
    const next = new Set(this.selectedKeys());
    if (next.has(entry.key)) {
      next.delete(entry.key);
    } else {
      next.add(entry.key);
    }
    this.selectedKeys.set([...next]);
  }

  isSelected(entry: WorkspaceEntry) {
    return this.selectedKeys().includes(entry.key);
  }

  triggerFileUpload() {
    this.fileInput()?.nativeElement.click();
  }

  async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) {
      return;
    }

    this.uploading.set(true);
    let lastCreatedAssetId: string | null = null;

    try {
      for (const file of files) {
        const fileBase64 = await this.readFileAsBase64(file);
        const previewDataUrl = file.type.startsWith('image/') ? await this.readFileAsDataUrl(file) : undefined;
        const response = await firstValueFrom(
          this.api.createKnowledgeAsset({
            title: file.name.replace(/\.[^.]+$/, ''),
            summary: '',
            kind: 'file',
            sourceFormat: this.getFileExtension(file.name),
            fileName: file.name,
            mimeType: file.type,
            contentText: '',
            previewDataUrl,
            tags: [],
            reviewStatus: 'raw',
            fileBase64,
          }),
        );

        lastCreatedAssetId = response?.asset.id ?? lastCreatedAssetId;
      }

      this.notifications.success(`${files.length} document${files.length === 1 ? '' : 's'} added to the workspace.`);
      this.loadWorkspace(
        lastCreatedAssetId ? { type: 'asset', assetId: lastCreatedAssetId, kind: 'file' } : undefined,
      );
    } catch {
      this.notifications.error('Unable to upload one or more documents.');
    } finally {
      input.value = '';
      this.uploading.set(false);
    }
  }

  saveAsset() {
    this.assetForm.markAllAsTouched();
    if (this.assetForm.invalid) {
      this.notifications.error('Please complete the knowledge-source details before saving.');
      return;
    }

    const inspector = this.inspector();
    const body = {
      title: this.assetForm.controls.title.getRawValue(),
      summary: this.assetForm.controls.summary.getRawValue(),
      kind: this.assetForm.controls.kind.getRawValue(),
      sourceFormat: this.assetForm.controls.sourceFormat.getRawValue(),
      fileName: this.assetForm.controls.fileName.getRawValue(),
      mimeType: this.assetForm.controls.mimeType.getRawValue(),
      contentText: this.assetForm.controls.contentText.getRawValue(),
      previewDataUrl: this.assetPreviewDataUrl() ?? undefined,
      extractedMetadata: this.assetExtractedMetadata() ?? undefined,
      tags: this.splitListField(this.assetForm.controls.tagsText.getRawValue()),
      reviewStatus: this.assetForm.controls.reviewStatus.getRawValue(),
      projectId: this.assetForm.controls.projectId.getRawValue() || undefined,
      moduleId: this.assetForm.controls.moduleId.getRawValue() || undefined,
      pageId: this.assetForm.controls.pageId.getRawValue() || undefined,
      fileBase64: this.assetFileBase64() ?? undefined,
    };

    this.saving.set(true);
    const request$ =
      inspector.type === 'asset' && inspector.assetId
        ? this.api.updateKnowledgeAsset(inspector.assetId, body)
        : this.api.createKnowledgeAsset(body);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.notifications.success(`Knowledge source ${inspector.type === 'asset' && inspector.assetId ? 'updated' : 'created'}.`);
        this.assetFileBase64.set(null);
        this.loadWorkspace({
          type: 'asset',
          assetId: response.asset.id,
          kind: response.asset.kind,
        });
        this.saving.set(false);
      },
      error: () => {
        this.notifications.error('Unable to save the knowledge source.');
        this.saving.set(false);
      },
    });
  }

  deleteAsset() {
    const asset = this.currentAsset();
    if (!asset) {
      return;
    }

    if (!window.confirm(`Delete "${asset.title}" from the workspace?`)) {
      return;
    }

    this.saving.set(true);
    this.api
      .deleteKnowledgeAsset(asset.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Knowledge source deleted.');
          this.inspector.set({ type: 'empty' });
          this.loadWorkspace();
          this.saving.set(false);
        },
        error: () => {
          this.notifications.error('Unable to delete the knowledge source.');
          this.saving.set(false);
        },
      });
  }

  addLinkToAsset(datasetItemId = this.linkControl.getRawValue()) {
    const asset = this.currentAsset();
    if (!asset || !datasetItemId) {
      this.notifications.error('Choose a structured knowledge item to link.');
      return;
    }

    if (!this.isApprovedAsset(asset.reviewStatus)) {
      this.notifications.error('Approve the source before linking it into reusable knowledge.');
      return;
    }

    this.saving.set(true);
    this.api
      .createKnowledgeAssetLink(asset.id, datasetItemId, this.linkNotesControl.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifications.success('Link created.');
          this.linkControl.setValue('');
          this.linkNotesControl.setValue('');
          this.loadWorkspace({
            type: 'asset',
            assetId: response.asset.id,
            kind: response.asset.kind,
          });
          this.saving.set(false);
        },
        error: () => {
          this.notifications.error('Unable to link the knowledge source.');
          this.saving.set(false);
        },
      });
  }

  removeLinkFromAsset(linkId: string) {
    const asset = this.currentAsset();
    if (!asset) {
      return;
    }

    this.saving.set(true);
    this.api
      .deleteKnowledgeAssetLink(asset.id, linkId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifications.success('Link removed.');
          this.loadWorkspace({
            type: 'asset',
            assetId: response.asset.id,
            kind: response.asset.kind,
          });
          this.saving.set(false);
        },
        error: () => {
          this.notifications.error('Unable to remove the link.');
          this.saving.set(false);
        },
      });
  }

  openSeededStructuredFromAsset() {
    const asset = this.currentAsset();
    if (!asset) {
      return;
    }

    this.openCreateStructured('componentCatalogue', asset);
  }

  saveStructured() {
    const inspector = this.inspector();
    if (inspector.type !== 'structured') {
      return;
    }

    this.structuredForm.markAllAsTouched();
    this.structuredStatusControl.markAsTouched();
    if (this.structuredForm.invalid || this.structuredStatusControl.invalid) {
      this.notifications.error('Please resolve the validation errors before saving.');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.buildStructuredPayload();
    } catch {
      this.notifications.error('One or more structured-item JSON fields are invalid.');
      return;
    }

    this.saving.set(true);
    const scopeInput = this.isProjectMemoryType(inspector.itemType) ? this.buildStructuredScopePayload() : {};
    const request$ = inspector.itemId
      ? this.api.updateItem(inspector.itemType, inspector.itemId, payload, this.structuredStatusControl.getRawValue(), scopeInput)
      : this.api.createItem(inspector.itemType, payload, this.structuredStatusControl.getRawValue(), scopeInput);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.notifications.success(`Structured knowledge ${inspector.itemId ? 'updated' : 'created'}.`);
        this.loadWorkspace({
          type: 'structured',
          itemId: response.item.id,
          itemType: response.item.itemType,
          seedAssetId: inspector.seedAssetId,
        });
        this.saving.set(false);
      },
      error: () => {
        this.notifications.error('Unable to save the structured item.');
        this.saving.set(false);
      },
    });
  }

  archiveStructured() {
    const item = this.currentStructuredItem();
    if (!item || !window.confirm(`Archive "${item.title}"?`)) {
      return;
    }

    this.saving.set(true);
    this.api
      .archiveItem(item.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Structured knowledge archived.');
          this.loadWorkspace({
            type: 'structured',
            itemId: item.id,
            itemType: item.itemType,
            seedAssetId: null,
          });
          this.saving.set(false);
        },
        error: () => {
          this.notifications.error('Unable to archive the structured item.');
          this.saving.set(false);
        },
      });
  }

  restoreStructured() {
    const item = this.currentStructuredItem();
    if (!item) {
      return;
    }

    this.saving.set(true);
    this.api
      .restoreItem(item.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Structured knowledge restored.');
          this.loadWorkspace({
            type: 'structured',
            itemId: item.id,
            itemType: item.itemType,
            seedAssetId: null,
          });
          this.saving.set(false);
        },
        error: () => {
          this.notifications.error('Unable to restore the structured item.');
          this.saving.set(false);
        },
      });
  }

  deleteStructured() {
    const item = this.currentStructuredItem();
    if (!item || !window.confirm(`Delete "${item.title}" permanently?`)) {
      return;
    }

    this.saving.set(true);
    this.api
      .deleteItem(item.itemType, item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.success('Structured knowledge deleted.');
          this.inspector.set({ type: 'empty' });
          this.loadWorkspace();
          this.saving.set(false);
        },
        error: () => {
          this.notifications.error('Unable to delete the structured item.');
          this.saving.set(false);
        },
      });
  }

  runRefinement() {
    const selectedStructured = this.selectedEntries()
      .filter((entry) => entry.entryType === 'structured')
      .map((entry) => entry.rawStructured!)
      .filter((item) => getEntityConfig(item.itemType).supportsBulkRefinement);

    if (!selectedStructured.length) {
      this.notifications.error('Select at least one compatible structured knowledge item to refine.');
      return;
    }

    const distinctTypes = [...new Set(selectedStructured.map((item) => item.itemType))];
    if (distinctTypes.length > 1) {
      this.notifications.error('Refinement can only run on selected items of the same knowledge type.');
      return;
    }

    const dialogRef = this.dialog.open(RefinementModeDialogComponent, {
      data: { itemCount: selectedStructured.length },
    });

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((mode) => {
      if (!mode) {
        return;
      }

      this.api
        .bulkRefine(
          distinctTypes[0],
          selectedStructured.map((item) => item.id),
          mode,
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.notifications.success(`Refinement started. ${result.completed} draft(s) created.`);
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
      this.loadWorkspace();
    });
  }

  openLinkedAssetPreview(assetId: string) {
    const asset = this.workspace()?.assets.find((candidate) => candidate.id === assetId);
    if (asset) {
      this.openAsset(asset);
    }
  }

  openLinkedStructuredPreview(datasetItemId: string) {
    const item = this.workspace()?.structuredItems.find((candidate) => candidate.id === datasetItemId);
    if (item) {
      this.openStructured(item);
    }
  }

  getAssetStatusLabel(status: KnowledgeAssetReviewStatus) {
    switch (status) {
      case 'raw':
        return 'Needs approval';
      case 'reviewed':
        return 'Approved source';
      case 'linked':
        return 'Approved & linked';
      default:
        return 'Archived';
    }
  }

  isApprovedAsset(status: KnowledgeAssetReviewStatus | null | undefined) {
    return status === 'reviewed' || status === 'linked';
  }

  getLinkedStructuredSummary(datasetItemId: string) {
    return this.workspace()?.structuredItems.find((item) => item.id === datasetItemId)?.summary ?? null;
  }

  getLinkedStructuredTags(datasetItemId: string) {
    return this.workspace()?.structuredItems.find((item) => item.id === datasetItemId)?.tags ?? [];
  }

  getStructuredWorkspaceFields(itemType: DatasetItemType) {
    const fields = this.getEntityFields(itemType);
    if (this.showAdvancedStructuredFields()) {
      return fields;
    }

    return fields.filter((field) => {
      if (field.required || this.isBasicStructuredField(field.key)) {
        return true;
      }

      return this.hasMeaningfulStructuredValue(field.key, field.type);
    });
  }

  hasAdvancedStructuredFields(itemType: DatasetItemType) {
    return this.getEntityFields(itemType).some((field) => !field.required && !this.isBasicStructuredField(field.key));
  }

  toggleStructuredFieldMode() {
    this.showAdvancedStructuredFields.update((value) => !value);
  }

  getStructuredControl(key: string) {
    return this.structuredForm.get(key) as FormControl<string>;
  }

  getStructuredRoute(itemType: DatasetItemType) {
    return getEntityConfig(itemType).route;
  }

  getEntityLabel(itemType: DatasetItemType) {
    return getEntityConfig(itemType).label;
  }

  getEntityFields(itemType: DatasetItemType) {
    return getEntityConfig(itemType).fields;
  }

  private loadWorkspace(nextInspector?: InspectorMode) {
    this.loading.set(true);
    forkJoin({
      workspace: this.api.getKnowledgeBaseWorkspace(true),
      suggestions: this.api.listLearningSuggestions({
        page: 1,
        pageSize: 8,
        status: 'pending',
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ workspace, suggestions }) => {
          this.workspace.set(workspace);
          this.learningSuggestions.set(suggestions.items);
          this.loading.set(false);
          this.selectedKeys.set([]);

          if (!nextInspector) {
            return;
          }

          if (nextInspector.type === 'asset' && nextInspector.assetId) {
            const asset = workspace.assets.find((candidate) => candidate.id === nextInspector.assetId);
            if (asset) {
              this.openAsset(asset);
            }
            return;
          }

          if (nextInspector.type === 'structured' && nextInspector.itemId) {
            const item = workspace.structuredItems.find((candidate) => candidate.id === nextInspector.itemId);
            if (item) {
              this.openStructured(item);
            }
            return;
          }

          this.inspector.set(nextInspector);
        },
        error: () => {
          this.notifications.error('Unable to load the knowledge base workspace.');
          this.loading.set(false);
        },
      });
  }

  private patchStructuredScope(scope: {
    projectId?: string;
    moduleId?: string;
    pageId?: string;
    scopeLevel?: KnowledgeScopeLevel | '';
  }) {
    this.structuredScopeForm.patchValue(
      {
        projectId: scope.projectId ?? '',
        moduleId: scope.moduleId ?? '',
        pageId: scope.pageId ?? '',
        scopeLevel:
          scope.scopeLevel ||
          (scope.pageId ? 'page' : scope.moduleId ? 'module' : scope.projectId ? 'project' : 'project'),
      },
      { emitEvent: false },
    );
  }

  private buildStructuredScopePayload() {
    const projectId = this.structuredScopeForm.controls.projectId.getRawValue() || undefined;
    const moduleId = this.structuredScopeForm.controls.moduleId.getRawValue() || undefined;
    const pageId = this.structuredScopeForm.controls.pageId.getRawValue() || undefined;
    const fallbackScopeLevel = pageId ? 'page' : moduleId ? 'module' : projectId ? 'project' : undefined;
    return {
      projectId,
      moduleId,
      pageId,
      scopeLevel: fallbackScopeLevel ?? undefined,
    };
  }

  private rebuildStructuredForm(itemType: DatasetItemType, payload?: Record<string, unknown>) {
    const config = getEntityConfig(itemType);
    const values = payload ?? createEmptyPayload(itemType);

    Object.keys(this.structuredForm.controls).forEach((key) => {
      this.structuredForm.removeControl(key);
    });

    for (const field of config.fields) {
      this.structuredForm.addControl(
        field.key,
        new FormControl<string>(this.stringifyFieldValue(field.type, values[field.key]), {
          nonNullable: true,
          validators: field.required ? [Validators.required] : [],
        }),
      );
    }
  }

  private stringifyFieldValue(fieldType: string, value: unknown) {
    if (fieldType === 'stringList') {
      return Array.isArray(value) ? value.join('\n') : '';
    }

    if (fieldType === 'json') {
      return JSON.stringify(value ?? [], null, 2);
    }

    return typeof value === 'string' ? value : '';
  }

  private buildStructuredPayload() {
    const config = getEntityConfig(this.structuredItemTypeControl.getRawValue());
    return Object.fromEntries(
      config.fields.map((field) => {
        const rawValue = this.getStructuredControl(field.key).getRawValue();

        if (field.type === 'stringList') {
          return [field.key, this.splitListField(rawValue)] as const;
        }

        if (field.type === 'json') {
          return [field.key, rawValue.trim() ? JSON.parse(rawValue) : []] as const;
        }

        return [field.key, rawValue.trim()] as const;
      }),
    );
  }

  private buildStructuredSeed(itemType: DatasetItemType, asset: KnowledgeAsset) {
    const payload = createEmptyPayload(itemType);
    const summarySeed = asset.summary || asset.contentText?.slice(0, 8000) || '';
    const examplesSeed = asset.contentText
      ? asset.contentText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    for (const field of getEntityConfig(itemType).fields) {
      if (field.key === 'name' || field.key === 'canonicalName') {
        payload[field.key] = asset.title;
      } else if (field.key === 'description' || field.key === 'notes') {
        payload[field.key] = summarySeed;
      } else if (field.key === 'examples' && examplesSeed.length) {
        payload[field.key] = examplesSeed;
      } else if ((field.key === 'tags' || field.key === 'aliases') && asset.tags.length) {
        payload[field.key] = [...asset.tags];
      } else if (field.key === 'sourceType') {
        payload[field.key] = asset.sourceFormat || asset.kind;
      }
    }

    return payload;
  }

  private splitListField(rawValue: string) {
    return rawValue
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private toTitleCase(value: string) {
    return value
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .trim()
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  private getFileExtension(fileName: string) {
    const match = /\.([^.]+)$/.exec(fileName);
    return match?.[1]?.toLowerCase() ?? '';
  }

  private readFileAsBase64(file: File) {
    return file.arrayBuffer().then((buffer) => {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;

      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
        binary += String.fromCharCode(...chunk);
      }

      return btoa(binary);
    });
  }

  private readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private matchesSearch(search: string, ...values: Array<string | null | undefined>) {
    if (!search) {
      return true;
    }

    const haystack = values
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .toLowerCase();

    return haystack.includes(search);
  }

  private isBasicStructuredField(fieldKey: string) {
    return new Set([
      'componentId',
      'name',
      'canonicalName',
      'sourceType',
      'scenarioType',
      'category',
      'description',
      'notes',
      'tags',
      'aliases',
      'examples',
      'standardTestCases',
    ]).has(fieldKey);
  }

  private hasMeaningfulStructuredValue(key: string, fieldType: string) {
    const control = this.structuredForm.get(key) as FormControl<string> | null;
    const value = control?.getRawValue() ?? '';
    if (!value.trim()) {
      return false;
    }

    if (fieldType === 'json') {
      return value.trim() !== '[]' && value.trim() !== '{}';
    }

    return true;
  }
}
