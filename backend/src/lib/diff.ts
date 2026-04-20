type DiffEntry = {
  path: string;
  before?: unknown;
  after?: unknown;
};

export type DiffSummary = {
  added: DiffEntry[];
  removed: DiffEntry[];
  modified: DiffEntry[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function buildDiffSummary(before: unknown, after: unknown, basePath = ''): DiffSummary {
  const summary: DiffSummary = {
    added: [],
    removed: [],
    modified: [],
  };

  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      summary.modified.push({
        path: basePath || '$',
        before,
        after,
      });
    }

    return summary;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

    for (const key of keys) {
      const path = basePath ? `${basePath}.${key}` : key;
      const beforeValue = before[key];
      const afterValue = after[key];

      if (!(key in before)) {
        summary.added.push({
          path,
          after: afterValue,
        });
        continue;
      }

      if (!(key in after)) {
        summary.removed.push({
          path,
          before: beforeValue,
        });
        continue;
      }

      const childSummary = buildDiffSummary(beforeValue, afterValue, path);
      summary.added.push(...childSummary.added);
      summary.removed.push(...childSummary.removed);
      summary.modified.push(...childSummary.modified);
    }

    return summary;
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    summary.modified.push({
      path: basePath || '$',
      before,
      after,
    });
  }

  return summary;
}
