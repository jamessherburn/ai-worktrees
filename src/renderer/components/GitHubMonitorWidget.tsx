import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GitHubMonitorBucket,
  GitHubMonitorSkippedRepo,
  GitHubMonitorTimeRange,
} from '@shared/github-monitor';

type Props = {
  /** Stable serialized repo paths (newline-separated); avoids refetch on every session poll. */
  repoPathsKey: string;
};

const TIME_RANGES: { id: GitHubMonitorTimeRange; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string; reason: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      repos: { slug: string; name: string }[];
      skipped: GitHubMonitorSkippedRepo[];
      buckets: GitHubMonitorBucket[];
      totals: {
        mergedPrs: number;
        commits: number;
        prApprovals: number;
        reviewComments: number;
      };
      fetchedAt: string;
    };

function pathsFromKey(key: string): string[] {
  if (!key) return [];
  return key.split('\n').filter(Boolean);
}

export function GitHubMonitorWidget({ repoPathsKey }: Props) {
  const [timeRange, setTimeRange] = useState<GitHubMonitorTimeRange>('30d');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    const uniquePaths = pathsFromKey(repoPathsKey);

    setState({ kind: 'loading' });
    const status = await window.api.githubMonitor.status();
    if (fetchId !== fetchIdRef.current) return;

    if (status.ready === false) {
      setState({
        kind: 'unavailable',
        message: status.message,
        reason: status.reason,
      });
      return;
    }

    if (uniquePaths.length === 0) {
      setState({
        kind: 'unavailable',
        message:
          'No local git repositories to monitor. Create a worktree session with a GitHub remote (origin).',
        reason: 'no-repos',
      });
      return;
    }

    const result = await window.api.githubMonitor.fetch({
      timeRange,
      repoPaths: uniquePaths,
      repo: repoFilter === 'all' ? undefined : repoFilter,
    });
    if (fetchId !== fetchIdRef.current) return;

    if (!result.ok) {
      if (result.reason === 'gh-not-installed' || result.reason === 'gh-not-authenticated') {
        setState({
          kind: 'unavailable',
          message: result.message,
          reason: result.reason,
        });
        return;
      }
      setState({ kind: 'error', message: result.message });
      return;
    }

    setState({
      kind: 'ready',
      repos: result.repos.map((r) => ({ slug: r.slug, name: r.name })),
      skipped: result.skipped,
      buckets: result.buckets,
      totals: result.totals,
      fetchedAt: result.fetchedAt,
    });
  }, [timeRange, repoFilter, repoPathsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state.kind !== 'ready' || repoFilter === 'all') return;
    if (!state.repos.some((r) => r.slug === repoFilter)) {
      setRepoFilter('all');
    }
  }, [state, repoFilter]);

  return (
    <section className="gh-monitor" aria-label="GitHub activity">
      <div className="gh-monitor-header">
        <div className="gh-monitor-title-block">
          <h2 className="gh-monitor-title">GitHub Activity</h2>
          <p className="gh-monitor-subtitle muted">
            Aggregated across your code directory and session repos with a GitHub origin
          </p>
        </div>
        <div className="gh-monitor-controls">
          <label className="gh-monitor-control">
            <span className="gh-monitor-control-label">Repository</span>
            <select
              className="gh-monitor-select"
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              disabled={state.kind === 'loading'}
            >
              <option value="all">All repos</option>
              {state.kind === 'ready' &&
                state.repos.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.slug}
                  </option>
                ))}
            </select>
          </label>
          <div className="gh-monitor-control">
            <span className="gh-monitor-control-label">Time range</span>
            <div className="flight-deck-filter-chips">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`flight-deck-filter-chip${timeRange === r.id ? ' active' : ''}`}
                  onClick={() => setTimeRange(r.id)}
                  disabled={state.kind === 'loading'}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small gh-monitor-refresh"
            onClick={() => void load()}
            disabled={state.kind === 'loading'}
          >
            {state.kind === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {state.kind === 'loading' && (
        <div className="gh-monitor-status gh-monitor-status--loading">
          <span className="gh-api-status-bar__spinner" aria-hidden />
          Fetching GitHub activity…
        </div>
      )}

      {state.kind === 'unavailable' && (
        <div className="gh-monitor-status gh-monitor-status--unavailable" role="status">
          <div className="gh-monitor-status-title">GitHub data unavailable</div>
          <p className="gh-monitor-status-message">{state.message}</p>
          {state.reason === 'gh-not-authenticated' && (
            <p className="gh-monitor-status-hint muted">
              Run <span className="kbd">gh auth login</span> in a terminal. Your token needs{' '}
              <span className="kbd">repo</span> read scope for private repositories.
            </p>
          )}
          {state.reason === 'gh-not-installed' && (
            <p className="gh-monitor-status-hint muted">
              Install the GitHub CLI with <span className="kbd">brew install gh</span>, or restart the
              app to trigger automatic installation.
            </p>
          )}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="gh-monitor-status gh-monitor-status--error" role="alert">
          <div className="gh-monitor-status-title">Could not load GitHub data</div>
          <p className="gh-monitor-status-message">{state.message}</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <div className="gh-monitor-totals">
            <TotalPill label="Merged PRs" value={state.totals.mergedPrs} tone="accent" />
            <TotalPill label="Commits" value={state.totals.commits} tone="success" />
            <TotalPill label="PR approvals" value={state.totals.prApprovals} tone="warning" />
            <TotalPill label="Review comments" value={state.totals.reviewComments} tone="danger" />
          </div>
          <div className="gh-monitor-charts">
            <MetricChart
              title="Merged PRs"
              buckets={state.buckets}
              color="var(--accent)"
              value={(b) => b.mergedPrs}
            />
            <MetricChart
              title="Commits"
              buckets={state.buckets}
              color="var(--success)"
              value={(b) => b.commits}
            />
            <MetricChart
              title="PR approvals"
              buckets={state.buckets}
              color="var(--warning)"
              value={(b) => b.prApprovals}
            />
            <MetricChart
              title="Review comments"
              buckets={state.buckets}
              color="var(--danger)"
              value={(b) => b.reviewComments}
            />
          </div>
          <div className="gh-monitor-foot">
            <div className="muted">
              Updated {formatFetchedAt(state.fetchedAt)}
              {repoFilter !== 'all'
                ? ` · ${repoFilter}`
                : state.repos.length > 0
                  ? ` · ${state.repos.map((r) => r.slug).join(', ')}`
                  : ''}
            </div>
            {state.skipped.length > 0 && (
              <div className="gh-monitor-skipped muted">
                Not on GitHub:{' '}
                {state.skipped.map((s) => `${s.label} (${skippedReasonLabel(s.reason)})`).join(', ')}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function TotalPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'accent' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={`gh-monitor-total gh-monitor-total--${tone}`}>
      <span className="gh-monitor-total-value">{value}</span>
      <span className="gh-monitor-total-label">{label}</span>
    </div>
  );
}

function MetricChart({
  title,
  buckets,
  color,
  value,
}: {
  title: string;
  buckets: GitHubMonitorBucket[];
  color: string;
  value: (b: GitHubMonitorBucket) => number;
}) {
  const max = Math.max(1, ...buckets.map(value));
  const showLabels = buckets.length <= 14;

  return (
    <div className="gh-metric-chart">
      <div className="gh-metric-chart-header">
        <span className="gh-metric-chart-title">{title}</span>
        <span className="gh-metric-chart-max muted">max {max}</span>
      </div>
      <div className="gh-metric-chart-bars" role="img" aria-label={`${title} over time`}>
        {buckets.map((bucket) => {
          const v = value(bucket);
          const height = Math.round((v / max) * 100);
          return (
            <div
              key={bucket.date}
              className="gh-metric-bar-col"
              title={`${bucket.date}: ${v}`}
            >
              <div className="gh-metric-bar-stack">
                <span
                  className={`gh-metric-bar-value${v === 0 ? ' gh-metric-bar-value--zero' : ''}`}
                >
                  {v}
                </span>
                <div className="gh-metric-bar-track">
                  <div
                    className="gh-metric-bar"
                    style={{
                      height: `${Math.max(v > 0 ? 10 : 0, height)}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
              {showLabels && (
                <span className="gh-metric-bar-label">{shortDateLabel(bucket.date)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function skippedReasonLabel(reason: GitHubMonitorSkippedRepo['reason']): string {
  switch (reason) {
    case 'no-remote':
      return 'no origin remote';
    case 'not-github':
      return 'not github.com';
    case 'fetch-failed':
      return 'API error';
  }
}

function formatFetchedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'recently';
  }
}
