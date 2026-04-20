import { firstValueFrom } from 'rxjs';

import type {
  ManualExecutionRunDetail,
  ManualExecutionRunSummary,
} from '../../core/models';
import type { WorkbenchApiService } from '../../core/workbench-api.service';

export type ManualExecutionDateFilter =
  | 'all'
  | 'today'
  | 'last7Days'
  | 'last30Days'
  | 'last90Days';

export const manualExecutionDateFilterOptions: Array<{
  value: ManualExecutionDateFilter;
  label: string;
}> = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'last7Days', label: 'Last 7 days' },
  { value: 'last30Days', label: 'Last 30 days' },
  { value: 'last90Days', label: 'Last 90 days' },
];

const manualExecutionRunFetchPageSize = 50;

export function formatManualExecutionDate(value: string | null) {
  if (!value) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function getManualExecutionRunStatusLabel(
  status: ManualExecutionRunSummary['status'],
) {
  switch (status) {
    case 'draft':
      return 'pending';
    case 'inProgress':
      return 'in progress';
    default:
      return 'completed';
  }
}

export function getManualExecutionRunBadgeStatus(
  status: ManualExecutionRunSummary['status'],
) {
  return status === 'draft' ? 'pending' : status;
}

export function getManualExecutionProgressWidth(
  run: Pick<ManualExecutionRunSummary, 'totals'>,
) {
  return Math.max(8, run.totals.completionPercent);
}

export function isManualExecutionRunCompleted(
  run: Pick<ManualExecutionRunSummary, 'status'>,
) {
  return run.status === 'completed';
}

export function matchesManualExecutionDateFilter(
  value: string | null,
  filter: ManualExecutionDateFilter,
) {
  if (filter === 'all') {
    return true;
  }

  if (!value) {
    return false;
  }

  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return false;
  }

  const now = new Date();
  const start = new Date(now);

  switch (filter) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'last7Days':
      start.setDate(start.getDate() - 7);
      break;
    case 'last30Days':
      start.setDate(start.getDate() - 30);
      break;
    case 'last90Days':
      start.setDate(start.getDate() - 90);
      break;
    default:
      break;
  }

  return candidate >= start && candidate <= now;
}

export function buildManualExecutionConicGradient(
  segments: Array<{ color: string; value: number }>,
  emptyColor = '#d7e8f1',
) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) {
    return `conic-gradient(${emptyColor} 0deg, ${emptyColor} 360deg)`;
  }

  let cursor = 0;
  const slices = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      const slice = (segment.value / total) * 360;
      cursor += slice;
      return `${segment.color} ${start}deg ${cursor}deg`;
    });

  return `conic-gradient(${slices.join(', ')})`;
}

export async function loadAllManualExecutionRuns(
  api: WorkbenchApiService,
  query: {
    projectId?: string;
    status?: ManualExecutionRunSummary['status'];
  } = {},
) {
  const firstPage = await firstValueFrom(
    api.listManualExecutionRuns({
      page: 1,
      pageSize: manualExecutionRunFetchPageSize,
      ...query,
    }),
  );

  if (firstPage.totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      firstValueFrom(
        api.listManualExecutionRuns({
          page: index + 2,
          pageSize: manualExecutionRunFetchPageSize,
          ...query,
        }),
      ),
    ),
  );

  return [
    ...firstPage.items,
    ...remainingPages.flatMap((page) => page.items),
  ];
}

export async function loadManualExecutionRunDetails(
  api: WorkbenchApiService,
  runs: ManualExecutionRunSummary[],
) {
  const detailEntries = await Promise.all(
    runs.map(async (run) => {
      const response = await firstValueFrom(api.getManualExecutionRun(run.id));
      return [run.id, response.run] as const;
    }),
  );

  return Object.fromEntries(detailEntries) as Record<
    string,
    ManualExecutionRunDetail
  >;
}

export function formatManualExecutionRunScope(
  run: Pick<ManualExecutionRunSummary, 'project' | 'module' | 'page' | 'feature'>,
) {
  return [run.project.name, run.module?.name ?? '', run.page?.name ?? '', run.feature?.name ?? '']
    .filter(Boolean)
    .join(' / ');
}
