import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import type { TestcaseLibraryNode, TestcaseLibraryNodeKind, TestcaseLibraryResponse } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

type LibraryBreadcrumb = {
  id: string | null;
  label: string;
};

@Component({
  selector: 'app-test-generation-export-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './test-generation-export-page.component.html',
  styleUrl: './test-generation-export-page.component.scss',
})
export class TestGenerationExportPageComponent {
  private readonly api = inject(WorkbenchApiService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly library = signal<TestcaseLibraryResponse | null>(null);
  readonly searchTerm = signal('');
  readonly navigationPath = signal<string[]>([]);
  readonly exportingId = signal<string | null>(null);

  readonly breadcrumbNodes = computed(() => {
    const trail: TestcaseLibraryNode[] = [];
    let currentItems = this.library()?.items ?? [];

    for (const nodeId of this.navigationPath()) {
      const nextNode = currentItems.find((node) => node.id === nodeId);
      if (!nextNode) {
        break;
      }

      trail.push(nextNode);
      currentItems = nextNode.children;
    }

    return trail;
  });

  readonly breadcrumbs = computed<LibraryBreadcrumb[]>(() => [
    { id: null, label: 'Testcase Library' },
    ...this.breadcrumbNodes().map((node) => ({
      id: node.id,
      label: node.name,
    })),
  ]);

  readonly currentFolder = computed(() => {
    const trail = this.breadcrumbNodes();
    return trail.length ? trail[trail.length - 1] : null;
  });

  readonly currentItems = computed(() => this.filterCurrentLevelItems(this.currentFolder()?.children ?? this.library()?.items ?? []));

  readonly currentHeading = computed(() => this.currentFolder()?.name ?? 'Approved clients');

  readonly currentSubheading = computed(() => {
    const folder = this.currentFolder();
    if (!folder) {
      return 'Open a client folder to browse approved testcase paths.';
    }

    switch (folder.kind) {
      case 'client':
        return 'Browse the modules available under this client.';
      case 'module':
        return 'Open a page folder or export this module scope.';
      case 'page':
        return 'Open a feature folder or export the approved page scope.';
      case 'feature':
        return 'Feature scope is ready for export.';
      default:
        return 'Browse approved testcase paths.';
    }
  });

  constructor() {
    this.loadLibrary();
  }

  setSearchTerm(value: string) {
    this.searchTerm.set(value);
  }

  canOpenFolder(node: TestcaseLibraryNode) {
    return node.children.length > 0;
  }

  openFolder(node: TestcaseLibraryNode) {
    if (!this.canOpenFolder(node)) {
      return;
    }

    const currentPath = this.breadcrumbNodes().map((item) => item.id);
    this.navigationPath.set([...currentPath, node.id]);
    this.resetFilters();
  }

  navigateBack() {
    if (!this.breadcrumbNodes().length) {
      return;
    }

    this.navigationPath.update((current) => current.slice(0, -1));
    this.resetFilters();
  }

  navigateToBreadcrumb(index: number) {
    if (index <= 0) {
      this.navigationPath.set([]);
      this.resetFilters();
      return;
    }

    this.navigationPath.set(this.breadcrumbNodes().slice(0, index).map((node) => node.id));
    this.resetFilters();
  }

  isBreadcrumbActive(index: number) {
    return index === this.breadcrumbs().length - 1;
  }

  kindLabel(kind: TestcaseLibraryNodeKind) {
    switch (kind) {
      case 'client':
        return 'Client';
      case 'module':
        return 'Module';
      case 'page':
        return 'Page';
      case 'feature':
        return 'Feature';
      default:
        return kind;
    }
  }

  qaOwnersLabel(node: TestcaseLibraryNode) {
    return node.qaOwners.length ? node.qaOwners.join(', ') : '-';
  }

  exportNode(node: TestcaseLibraryNode) {
    this.exportingId.set(node.id);
    this.api
      .exportGeneratedTestCases({
        projectId: node.scope.projectId ?? undefined,
        moduleId: node.scope.moduleId ?? undefined,
        pageId: node.scope.pageId ?? undefined,
        featureId: node.scope.featureId ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, `${this.slugify(node.path || node.name)}-approved.csv`);
          this.exportingId.set(null);
        },
        error: () => {
          this.notifications.error(`Unable to export ${node.name}.`);
          this.exportingId.set(null);
        },
      });
  }

  isExporting(id: string | 'all') {
    return this.exportingId() === id;
  }

  private loadLibrary() {
    this.loading.set(true);
    this.api
      .getTestcaseLibrary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (library) => {
          this.library.set(library);
          this.navigationPath.set(this.trimNavigationPath(library.items, this.navigationPath()));
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load the testcase library.');
          this.loading.set(false);
        },
      });
  }

  private filterCurrentLevelItems(nodes: TestcaseLibraryNode[]) {
    return nodes.filter((node) => this.nodeMatches(node));
  }

  private nodeMatches(node: TestcaseLibraryNode) {
    const search = this.searchTerm().trim().toLowerCase();

    if (!search) {
      return true;
    }

    const haystack = [
      node.name,
      node.path,
      node.kind,
      ...node.qaOwners,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  }

  private trimNavigationPath(nodes: TestcaseLibraryNode[], currentPath: string[]) {
    const nextPath: string[] = [];
    let currentItems = nodes;

    for (const nodeId of currentPath) {
      const nextNode = currentItems.find((node) => node.id === nodeId);
      if (!nextNode) {
        break;
      }

      nextPath.push(nodeId);
      currentItems = nextNode.children;
    }

    return nextPath;
  }

  private resetFilters() {
    this.searchTerm.set('');
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

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'approved-testcases';
  }
}
