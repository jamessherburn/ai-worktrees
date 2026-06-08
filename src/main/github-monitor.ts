import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  GitHubMonitorRepo,
  GitHubMonitorRequest,
  GitHubMonitorResult,
  GitHubMonitorSkippedRepo,
  GitHubMonitorStatus,
} from '@shared/github-monitor';
import type { GitHubMonitorBucket } from '@shared/github-monitor';
import {
  bucketIndexForDate,
  bucketLabelsForRange,
  emptyBuckets,
  emptyTotals,
  isWithinRange,
  parseGitHubRemoteSlug,
  rangeStartDate,
  sumTotals,
} from '@shared/github-monitor';

const execFileAsync = promisify(execFile);

const REPO_FETCH_CONCURRENCY = 4;
const REPO_FETCH_TIMEOUT_MS = 60_000;

function loginShell(): string {
  return process.env.SHELL || '/bin/zsh';
}

async function runInLoginShell(
  command: string,
  opts: { timeout: number; maxBuffer?: number },
): Promise<string> {
  const shell = loginShell();
  const { stdout } = await execFileAsync(shell, ['-lc', command], {
    timeout: opts.timeout,
    maxBuffer: opts.maxBuffer ?? 20 * 1024 * 1024,
    env: { ...process.env },
  });
  return stdout ?? '';
}

async function ghInstalled(): Promise<boolean> {
  try {
    const stdout = await runInLoginShell('command -v gh >/dev/null 2>&1 && gh version', {
      timeout: 20_000,
    });
    return /gh version/i.test(stdout);
  } catch {
    return false;
  }
}

async function ghAuthenticated(): Promise<boolean> {
  try {
    await runInLoginShell('command -v gh >/dev/null 2>&1 && gh auth status', { timeout: 25_000 });
    return true;
  } catch {
    return false;
  }
}

async function ghGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const inputPath = join(tmpdir(), `ai-worktrees-gh-${randomUUID()}.json`);
  await fs.writeFile(inputPath, JSON.stringify({ query, variables }), 'utf-8');
  try {
    const stdout = await runInLoginShell(
      `command -v gh >/dev/null 2>&1 && gh api graphql --input "${inputPath}"`,
      { timeout: 120_000 },
    );
    const parsed = JSON.parse(stdout) as { data?: T; errors?: { message: string }[] };
    if (parsed.errors?.length) {
      throw new Error(parsed.errors.map((e) => e.message).join('; '));
    }
    if (!parsed.data) throw new Error('GitHub GraphQL returned no data.');
    return parsed.data;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

type ResolveSlugResult =
  | { ok: true; slug: string }
  | { ok: false; reason: 'no-remote' | 'not-github' };

async function resolveSlugFromPath(repoPath: string): Promise<ResolveSlugResult> {
  for (const remote of ['origin', 'upstream']) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoPath, 'remote', 'get-url', remote],
        { timeout: 10_000 },
      );
      const slug = parseGitHubRemoteSlug(stdout.trim());
      if (slug) return { ok: true, slug };
      if (stdout.trim()) return { ok: false, reason: 'not-github' };
    } catch {
      // try next remote
    }
  }
  return { ok: false, reason: 'no-remote' };
}

function pathLabel(repoPath: string): string {
  const parts = repoPath.split(/[/\\]/);
  return parts[parts.length - 1] || repoPath;
}

const REPO_QUERY = `
query($owner: String!, $name: String!, $since: GitTimestamp!, $prCursor: String, $commitCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: 50, after: $prCursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        mergedAt
        reviews(first: 50) {
          nodes { state submittedAt }
        }
        reviewThreads(first: 50) {
          nodes {
            comments(first: 50) {
              nodes { createdAt }
            }
          }
        }
      }
    }
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100, since: $since, after: $commitCursor) {
            pageInfo { hasNextPage endCursor }
            nodes { committedDate }
          }
        }
      }
    }
  }
}`;

type PrNode = {
  mergedAt: string | null;
  reviews: { nodes: { state: string; submittedAt: string | null }[] };
  reviewThreads: { nodes: { comments: { nodes: { createdAt: string }[] } }[] };
};

type RepoQueryData = {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: PrNode[];
    };
    defaultBranchRef: {
      target: {
        history: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: { committedDate: string }[];
        };
      } | null;
    } | null;
  } | null;
};

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function mergeBuckets(target: GitHubMonitorBucket[], source: GitHubMonitorBucket[]): void {
  for (let i = 0; i < target.length; i++) {
    target[i].mergedPrs += source[i]?.mergedPrs ?? 0;
    target[i].commits += source[i]?.commits ?? 0;
    target[i].prApprovals += source[i]?.prApprovals ?? 0;
    target[i].reviewComments += source[i]?.reviewComments ?? 0;
  }
}

async function fetchRepoActivity(
  slug: string,
  range: GitHubMonitorRequest['timeRange'],
  labels: string[],
): Promise<GitHubMonitorBucket[]> {
  const buckets = emptyBuckets(range);
  const [owner, name] = slug.split('/');
  if (!owner || !name) return buckets;

  const since = rangeStartDate(range).toISOString();
  let prCursor: string | null = null;
  let commitCursor: string | null = null;
  let prPages = 0;
  let commitPages = 0;
  const maxPages = 8;

  let keepFetching = true;
  while (keepFetching && (prPages < maxPages || commitPages < maxPages)) {
    const pageData: RepoQueryData = await ghGraphql<RepoQueryData>(REPO_QUERY, {
      owner,
      name,
      since,
      prCursor,
      commitCursor,
    });

    const repo: NonNullable<RepoQueryData['repository']> | null = pageData.repository;
    if (!repo) return buckets;

    for (const pr of repo.pullRequests.nodes) {
      if (!pr.mergedAt || !isWithinRange(pr.mergedAt, range)) continue;
      const idx = bucketIndexForDate(pr.mergedAt, range, labels);
      if (idx >= 0) buckets[idx].mergedPrs += 1;

      for (const review of pr.reviews.nodes) {
        if (review.state !== 'APPROVED') continue;
        const at = review.submittedAt ?? pr.mergedAt;
        if (!isWithinRange(at, range)) continue;
        const ridx = bucketIndexForDate(at, range, labels);
        if (ridx >= 0) buckets[ridx].prApprovals += 1;
      }

      for (const thread of pr.reviewThreads.nodes) {
        for (const comment of thread.comments.nodes) {
          if (!isWithinRange(comment.createdAt, range)) continue;
          const cidx = bucketIndexForDate(comment.createdAt, range, labels);
          if (cidx >= 0) buckets[cidx].reviewComments += 1;
        }
      }
    }

    const history = repo.defaultBranchRef?.target?.history;
    if (history) {
      for (const commit of history.nodes) {
        if (!isWithinRange(commit.committedDate, range)) continue;
        const idx = bucketIndexForDate(commit.committedDate, range, labels);
        if (idx >= 0) buckets[idx].commits += 1;
      }
    }

    const prHasMore = repo.pullRequests.pageInfo.hasNextPage;
    const commitHasMore = history?.pageInfo.hasNextPage ?? false;

    if (!prHasMore && !commitHasMore) break;

    if (prHasMore && prPages < maxPages) {
      prCursor = repo.pullRequests.pageInfo.endCursor;
      prPages += 1;
    } else {
      prCursor = null;
    }

    if (commitHasMore && commitPages < maxPages) {
      commitCursor = history?.pageInfo.endCursor ?? null;
      commitPages += 1;
    } else {
      commitCursor = null;
    }

    if (!prCursor && !commitCursor) keepFetching = false;
  }

  return buckets;
}

export async function getGitHubMonitorStatus(): Promise<GitHubMonitorStatus> {
  if (!(await ghInstalled())) {
    return {
      ok: true,
      ready: false,
      reason: 'gh-not-installed',
      message:
        'GitHub CLI (gh) is not installed. The app can install it automatically on launch, or run: brew install gh',
    };
  }
  if (!(await ghAuthenticated())) {
    return {
      ok: true,
      ready: false,
      reason: 'gh-not-authenticated',
      message:
        'GitHub CLI is not signed in. Run gh auth login in a terminal and ensure your token has repo read access.',
    };
  }
  return { ok: true, ready: true };
}

export async function fetchGitHubMonitorStats(
  request: GitHubMonitorRequest,
): Promise<GitHubMonitorResult> {
  const status = await getGitHubMonitorStatus();
  if (status.ready === false) {
    return { ok: false, reason: status.reason, message: status.message };
  }

  const allPaths = [...new Set(request.repoPaths.filter(Boolean))];

  const slugByPath = new Map<string, string>();
  const skipped: GitHubMonitorSkippedRepo[] = [];
  const skippedPaths = new Set<string>();

  const resolveResults = await Promise.all(
    allPaths.map(async (path) => ({ path, resolved: await resolveSlugFromPath(path) })),
  );
  for (const { path, resolved } of resolveResults) {
    if (resolved.ok) {
      slugByPath.set(path, resolved.slug);
    } else if (!skippedPaths.has(path)) {
      skippedPaths.add(path);
      skipped.push({
        path,
        label: pathLabel(path),
        reason: resolved.reason,
      });
    }
  }

  const repos: GitHubMonitorRepo[] = [];
  const seenSlugs = new Set<string>();
  for (const [path, slug] of slugByPath) {
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    repos.push({ slug, name: slug.split('/')[1] ?? slug, path });
  }
  repos.sort((a, b) => a.slug.localeCompare(b.slug));

  if (repos.length === 0) {
    return {
      ok: false,
      reason: 'no-repos',
      message:
        'No GitHub repositories found. Sessions need a git remote pointing at github.com (origin).',
    };
  }

  const targetRepos = request.repo
    ? repos.filter((r) => r.slug === request.repo)
    : repos;

  if (targetRepos.length === 0) {
    return {
      ok: false,
      reason: 'no-repos',
      message: `Repository "${request.repo}" was not found among tracked session repos.`,
    };
  }

  const labels = bucketLabelsForRange(request.timeRange);
  const buckets = emptyBuckets(request.timeRange);

  const fetchErrors: string[] = [];
  await mapConcurrent(targetRepos, REPO_FETCH_CONCURRENCY, async (repo) => {
    try {
      const repoBuckets = await withTimeout(
        fetchRepoActivity(repo.slug, request.timeRange, labels),
        REPO_FETCH_TIMEOUT_MS,
        `Timed out after ${REPO_FETCH_TIMEOUT_MS / 1000}s`,
      );
      mergeBuckets(buckets, repoBuckets);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fetchErrors.push(`${repo.slug}: ${message}`);
      skipped.push({
        path: repo.path,
        label: repo.slug,
        reason: 'fetch-failed',
      });
    }
  });

  if (targetRepos.length > 0 && fetchErrors.length === targetRepos.length) {
    return {
      ok: false,
      reason: 'fetch-failed',
      message: fetchErrors.join('; '),
    };
  }

  return {
    ok: true,
    repos,
    skipped,
    buckets,
    totals: sumTotals(buckets),
    fetchedAt: new Date().toISOString(),
  };
}
