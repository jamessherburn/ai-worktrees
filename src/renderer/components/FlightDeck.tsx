import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SessionLabel, SessionWithStatus } from '@shared/types';
import { getAgent } from '@shared/agents';
import {
  activityKindFor,
  activityLabelFor,
  labelsForSession,
  sessionLabelMap,
  statusDotClass,
} from '@shared/session-labels';
import { GitHubStatsModal } from './GitHubStatsModal';
import { SessionLabelChips } from './SessionLabelChips';
import { SessionLabelMenu } from './SessionLabelMenu';

type ActivityFilter = 'all' | 'working' | 'idle' | 'stopped';

type Props = {
  sessions: SessionWithStatus[];
  sessionLabels: SessionLabel[];
  onSelectSession: (id: string) => void;
  onSetSessionLabels: (session: SessionWithStatus, labelIds: string[]) => void;
  onToggleMuted: (session: SessionWithStatus, muted: boolean) => void;
  onRevealInFinder: (session: SessionWithStatus) => void;
  onOpenInVSCode: (session: SessionWithStatus) => void;
  onDelete: (session: SessionWithStatus) => void;
  onManageLabels: () => void;
};

type ContextMenuState = {
  session: SessionWithStatus;
  x: number;
  y: number;
};

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'working', label: 'Working' },
  { id: 'idle', label: 'Idle' },
  { id: 'stopped', label: 'Stopped' },
];

export function FlightDeck({
  sessions,
  sessionLabels,
  onSelectSession,
  onSetSessionLabels,
  onToggleMuted,
  onRevealInFinder,
  onOpenInVSCode,
  onDelete,
  onManageLabels,
}: Props) {
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const labelMap = useMemo(() => sessionLabelMap(sessionLabels), [sessionLabels]);

  const githubRepoPathsKey = useMemo(() => {
    const paths = new Set<string>();
    for (const s of sessions) {
      if (s.global) continue;
      paths.add(s.repoPath);
      if (s.worktreePath !== s.repoPath) paths.add(s.worktreePath);
    }
    return [...paths].sort().join('\n');
  }, [sessions]);

  const filtered = useMemo(() => {
    let list = sessions;
    if (activityFilter !== 'all') {
      list = list.filter((s) => {
        const kind = activityKindFor(s);
        if (activityFilter === 'stopped') return kind === 'stopped' || kind === 'orphaned';
        return kind === activityFilter;
      });
    }
    if (labelFilter) {
      list = list.filter((s) => (s.labelIds ?? []).includes(labelFilter));
    }
    return [...list].sort((a, b) => {
      const priority = (s: SessionWithStatus) => {
        const k = activityKindFor(s);
        if (k === 'idle') return 0;
        if (k === 'working') return 1;
        if (k === 'orphaned') return 2;
        return 3;
      };
      const pd = priority(a) - priority(b);
      if (pd !== 0) return pd;
      if (a.muted !== b.muted) return a.muted ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [sessions, activityFilter, labelFilter]);

  const counts = useMemo(() => {
    let working = 0;
    let idle = 0;
    let stopped = 0;
    for (const s of sessions) {
      const k = activityKindFor(s);
      if (k === 'working') working += 1;
      else if (k === 'idle') idle += 1;
      else stopped += 1;
    }
    return { working, idle, stopped, total: sessions.length };
  }, [sessions]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      grid.style.removeProperty('--flight-card-height');
      const frames = grid.querySelectorAll<HTMLElement>('.flight-instrument-frame');
      if (frames.length === 0) return;
      let max = 140;
      frames.forEach((el) => {
        max = Math.max(max, el.getBoundingClientRect().height);
      });
      grid.style.setProperty('--flight-card-height', `${Math.ceil(max)}px`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    grid.querySelectorAll('.flight-instrument-frame').forEach((el) => ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [filtered, sessionLabels]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <div className="flight-deck">
      <header className="flight-deck-header">
        <div className="flight-deck-header-main">
          <div className="flight-deck-brand">
            <div className="flight-deck-title">Flight Deck</div>
            <div className="flight-deck-subtitle">
              Monitor all agent sessions — {counts.total} total
            </div>
          </div>
          <div className="flight-deck-instruments-summary" aria-label="Session status summary">
            <InstrumentGauge label="Working" value={counts.working} tone="working" />
            <InstrumentGauge label="Idle" value={counts.idle} tone="idle" highlight={counts.idle > 0} />
            <InstrumentGauge label="Stopped" value={counts.stopped} tone="stopped" />
          </div>
        </div>
        <div className="flight-deck-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setShowStats(true)}
          >
            GitHub Stats
          </button>
        </div>
      </header>

      <div className="flight-deck-filters">
        <div className="flight-deck-filter-group">
          <span className="flight-deck-filter-label">Activity</span>
          <div className="flight-deck-filter-chips">
            {ACTIVITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`flight-deck-filter-chip${activityFilter === f.id ? ' active' : ''}`}
                onClick={() => setActivityFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flight-deck-filter-group">
          <span className="flight-deck-filter-label">Labels</span>
          <div className="flight-deck-filter-chips">
            <button
              type="button"
              className={`flight-deck-filter-chip${labelFilter === null ? ' active' : ''}`}
              onClick={() => setLabelFilter(null)}
            >
              All
            </button>
            {sessionLabels.map((label) => (
              <button
                key={label.id}
                type="button"
                className={`flight-deck-filter-chip flight-deck-label-filter${labelFilter === label.id ? ' active' : ''}`}
                style={{ ['--label-color' as string]: label.color }}
                onClick={() => setLabelFilter(labelFilter === label.id ? null : label.id)}
              >
                {label.name}
              </button>
            ))}
            <button type="button" className="flight-deck-filter-chip flight-deck-manage-labels" onClick={onManageLabels}>
              + Labels
            </button>
          </div>
        </div>
      </div>

      <div className="flight-deck-body">
      <div className="flight-deck-grid" ref={gridRef}>
        {filtered.length === 0 ? (
          <div className="flight-deck-empty">
            <div className="empty-title">No sessions match</div>
            <div className="empty-body muted">
              {sessions.length === 0
                ? 'Create a session to populate the Flight Deck.'
                : 'Try changing your filters or create a new session.'}
            </div>
            {sessions.length === 0 && (
              <p className="muted">Use <span className="kbd">+ New Session</span> in the sidebar to get started.</p>
            )}
          </div>
        ) : (
          filtered.map((session) => (
            <FlightInstrument
              key={session.id}
              session={session}
              labels={labelsForSession(session, labelMap)}
              onClick={() => onSelectSession(session.id)}
              onToggleMuted={() => onToggleMuted(session, !session.muted)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ session, x: e.clientX, y: e.clientY });
              }}
            />
          ))
        )}
      </div>
      </div>

      {showStats && (
        <GitHubStatsModal
          repoPathsKey={githubRepoPathsKey}
          onClose={() => setShowStats(false)}
        />
      )}

      {menu && (
        <SessionLabelMenu
          session={menu.session}
          labels={sessionLabels}
          x={menu.x}
          y={menu.y}
          onToggleLabel={(s, labelIds) => {
            onSetSessionLabels(s, labelIds);
            setMenu(null);
          }}
          onToggleMuted={(s, muted) => {
            onToggleMuted(s, muted);
            setMenu(null);
          }}
          onRevealInFinder={(s) => {
            onRevealInFinder(s);
            setMenu(null);
          }}
          onOpenInVSCode={(s) => {
            onOpenInVSCode(s);
            setMenu(null);
          }}
          onDelete={(s) => {
            onDelete(s);
            setMenu(null);
          }}
          onManageLabels={() => {
            setMenu(null);
            onManageLabels();
          }}
        />
      )}
    </div>
  );
}

function FlightInstrument({
  session,
  labels,
  onClick,
  onToggleMuted,
  onContextMenu,
}: {
  session: SessionWithStatus;
  labels: SessionLabel[];
  onClick: () => void;
  onToggleMuted: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const kind = activityKindFor(session);
  const dot = statusDotClass(session);
  const isMuted = session.muted === true;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`flight-instrument flight-instrument--${kind}${isMuted ? ' flight-instrument--muted' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flight-instrument-heat" aria-hidden />
      <div className="flight-instrument-frame">
        <div className="flight-instrument-header">
          <span className={`status-dot ${dot}`} title={activityLabelFor(session)} />
          <span className="flight-instrument-name" title={session.name}>
            {session.name}
          </span>
          <button
            type="button"
            className={`icon-btn flight-instrument-mute${isMuted ? ' active' : ''}`}
            title={isMuted ? 'Unmute session' : 'Mute session'}
            aria-label={isMuted ? 'Unmute session' : 'Mute session'}
            aria-pressed={isMuted}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMuted();
            }}
          >
            <MuteIcon muted={isMuted} />
          </button>
        </div>
        <div className="flight-instrument-meta">
          <span className="session-agent-tag-group">
            <span className={`session-agent-tag agent-${session.agentId}`}>
              {getAgent(session.agentId).name}
            </span>
            {session.external ? (
              <span className="session-external-label" title="External session">
                External Session
              </span>
            ) : null}
          </span>
          <span className="flight-instrument-activity">{activityLabelFor(session)}</span>
        </div>
        {!session.global && (
          <div className="flight-instrument-repo muted">
            {session.repoName} · {session.branchName}
          </div>
        )}
        <div className="flight-instrument-labels">
          <SessionLabelChips labels={labels} compact />
        </div>
        <div className="flight-instrument-footer">
          <span className="flight-instrument-hint">Click to expand</span>
        </div>
      </div>
    </div>
  );
}

function InstrumentGauge({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  tone: 'working' | 'idle' | 'stopped';
  highlight?: boolean;
}) {
  return (
    <div className={`flight-gauge flight-gauge--${tone}${highlight ? ' flight-gauge--highlight' : ''}`}>
      <div className="flight-gauge-value">{value}</div>
      <div className="flight-gauge-label">{label}</div>
    </div>
  );
}

function MuteIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
