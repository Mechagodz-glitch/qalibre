import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import type {
  TestcaseLibraryNode,
  TestcaseLibraryNodeKind,
  TestcaseLibraryResponse,
} from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

type LibraryFilterKind = 'all' | TestcaseLibraryNodeKind;

type TestcaseLibraryFlatRow = {
  node: TestcaseLibraryNode;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
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
  readonly kindFilter = signal<LibraryFilterKind>('all');
  readonly expandedIds = signal<string[]>([]);
  readonly exportingId = signal<string | 'all' | null>(null);

  readonly kindFilters: Array<{ value: LibraryFilterKind; label: string }> = [
    { value: 'all', label: 'All folders' },
    { value: 'client', label: 'Clients' },
    { value: 'module', label: 'Modules' },
    { value: 'page', label: 'Pages' },
    { value: 'feature', label: 'Features' },
  ];

  readonly summaryCards = computed(() => {
    const summary = this.library()?.summary;
    if (!summary) {
      return [];
    }

    return [
      { label: 'Clients', value: summary.clientCount },
      { label: 'Modules', value: summary.moduleCount },
      { label: 'Pages', value: summary.pageCount },
      { label: 'Features', value: summary.featureCount },
      { label: 'Approved suites', value: summary.approvedSuiteCount },
      { label: 'Approved cases', value: summary.approvedCaseCount },
    ];
  });

  readonly filteredItems = computed(() => this.filterTree(this.library()?.items ?? []));

  readonly visibleRows = computed(() => {
    const rows: TestcaseLibraryFlatRow[] = [];
    const revealAll = this.hasActiveFilters();

    const walk = (nodes: TestcaseLibraryNode[], depth: number) => {
      for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        const isExpanded = hasChildren && (revealAll || this.expandedIds().includes(node.id));

        rows.push({
          node,
          depth,
          hasChildren,
          isExpanded,
        });

        if (hasChildren && isExpanded) {
          walk(node.children, depth + 1);
        }
      }
    };

    walk(this.filteredItems(), 0);
    return rows;
  });

  readonly rowsInViewLabel = computed(() => {
    const count = this.visibleRows().length;
    return `${count} folder${count === 1 ? '' : 's'} in view`;
  });

  constructor() {
    this.loadLibrary();
  }

  setSearchTerm(value: string) {
    this.searchTerm.set(value);
  }

  setKindFilter(value: LibraryFilterKind) {
    this.kindFilter.set(value);
  }

  isKindFilterActive(value: LibraryFilterKind) {
    return this.kindFilter() === value;
  }

  toggleExpanded(nodeId: string) {
    this.expandedIds.update((current) =>
      current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId],
    );
  }

  rowIndent(depth: number) {
    return `${depth * 1.15}rem`;
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

  exportAll() {
    this.exportingId.set('all');
    this.api
      .exportGeneratedTestCases()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, 'testcase-library-approved.csv');
          this.exportingId.set(null);
        },
        error: () => {
          this.notifications.error('Unable to export the full testcase library.');
          this.exportingId.set(null);
        },
      });
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
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Unable to load the testcase library.');
          this.loading.set(false);
        },
      });
  }

  private hasActiveFilters() {
    return Boolean(this.searchTerm().trim()) || this.kindFilter() !== 'all';
  }

  private filterTree(nodes: TestcaseLibraryNode[]): TestcaseLibraryNode[] {
    return nodes.flatMap((node) => {
      const children = this.filterTree(node.children);
      const selfMatches = this.nodeMatches(node);

      if (!selfMatches && !children.length) {
        return [];
      }

      return [{ ...node, children }];
    });
  }

  private nodeMatches(node: TestcaseLibraryNode) {
    const search = this.searchTerm().trim().toLowerCase();
    const activeKind = this.kindFilter();
    const kindMatches = activeKind === 'all' || node.kind === activeKind;

    if (!kindMatches) {
      return false;
    }

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
