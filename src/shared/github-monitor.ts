export type GitHubMonitorTimeRange = '7d' | '30d' | '90d';

export type GitHubMonitorRequest = {
  /** `owner/repo` slug, or omit for all tracked repos. */
  repo?: string;
  timeRange: GitHubMonitorTimeRange;
  /** Local git repo paths to resolve GitHub slugs from. */
  repoPaths: string[];
};

export type GitHubMonitorBucket = {
  /** Bucket label (YYYY-MM-DD or week start). */
  date: string;
  mergedPrs: number;
  commits: number;
  prApprovals: number;
  reviewComments: number;
};

export type GitHubMonitorTotals = {
  mergedPrs: number;
  commits: number;
  prApprovals: number;
  reviewComments: number;
};

export type GitHubMonitorRepo = {
  slug: string;
  name: string;
  path: string;
};

export type GitHubMonitorSkippedRepo = {
  path: string;
  label: string;
  reason: 'no-remote' | 'not-github' | 'fetch-failed';
};

export type GitHubMonitorStatus =
  | { ok: true; ready: true }
  | { ok: true; ready: false; reason: 'gh-not-installed' | 'gh-not-authenticated'; message: string };

export type GitHubMonitorResult =
  | {
      ok: true;
      repos: GitHubMonitorRepo[];
      skipped: GitHubMonitorSkippedRepo[];
      buckets: GitHubMonitorBucket[];
      totals: GitHubMonitorTotals;
      fetchedAt: string;
    }
  | { ok: false; reason: 'gh-not-installed'; message: string }
  | { ok: false; reason: 'gh-not-authenticated'; message: string }
  | { ok: false; reason: 'no-repos'; message: string }
  | { ok: false; reason: 'fetch-failed'; message: string };

export function timeRangeDays(range: GitHubMonitorTimeRange): number {
  switch (range) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
  }
}

export function rangeStartDate(range: GitHubMonitorTimeRange, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (timeRangeDays(range) - 1));
  return d;
}

export function bucketLabelsForRange(range: GitHubMonitorTimeRange, now = new Date()): string[] {
  const start = rangeStartDate(range, now);
  const labels: string[] = [];
  if (range === '90d') {
    const cursor = new Date(start);
    while (cursor <= now) {
      labels.push(weekStartKey(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return labels;
  }
  const days = timeRangeDays(range);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    labels.push(dayKey(d));
  }
  return labels;
}

export function emptyBuckets(range: GitHubMonitorTimeRange, now = new Date()): GitHubMonitorBucket[] {
  return bucketLabelsForRange(range, now).map((date) => ({
    date,
    mergedPrs: 0,
    commits: 0,
    prApprovals: 0,
    reviewComments: 0,
  }));
}

export function bucketIndexForDate(
  isoDate: string,
  range: GitHubMonitorTimeRange,
  labels: string[],
): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return -1;
  const key = range === '90d' ? weekStartKey(d) : dayKey(d);
  return labels.indexOf(key);
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekStartKey(d: Date): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return dayKey(copy);
}

export function parseGitHubRemoteSlug(url: string): string | null {
  const trimmed = url.trim();
  const ssh = trimmed.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  const https = trimmed.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (https) return `${https[1]}/${https[2]}`;
  return null;
}

export function emptyTotals(): GitHubMonitorTotals {
  return { mergedPrs: 0, commits: 0, prApprovals: 0, reviewComments: 0 };
}

export function sumTotals(buckets: GitHubMonitorBucket[]): GitHubMonitorTotals {
  return buckets.reduce(
    (acc, b) => ({
      mergedPrs: acc.mergedPrs + b.mergedPrs,
      commits: acc.commits + b.commits,
      prApprovals: acc.prApprovals + b.prApprovals,
      reviewComments: acc.reviewComments + b.reviewComments,
    }),
    emptyTotals(),
  );
}

export function isWithinRange(isoDate: string, range: GitHubMonitorTimeRange, now = new Date()): boolean {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  const start = rangeStartDate(range, now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}
