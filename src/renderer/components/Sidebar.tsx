import { useEffect, useMemo, useState } from 'react';
import type { SessionLabel, SessionWithStatus } from '@shared/types';
import { isCodeSession } from '@shared/code-sessions';
import { getAgent } from '@shared/agents';
import {
  activityKindFor,
  labelsForSession,
  sessionLabelMap,
  statusDotClass,
} from '@shared/session-labels';
import { SessionLabelChips } from './SessionLabelChips';
import { SessionLabelMenu } from './SessionLabelMenu';

type Props = {
  sessions: SessionWithStatus[];
  sessionLabels: SessionLabel[];
  activeId: string | null;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onSelect: (id: string) => void;
  onDelete: (session: SessionWithStatus) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onOpenAgentData: () => void;
  onOpenCleanup: () => void;
  onSetSessionLabels: (session: SessionWithStatus, labelIds: string[]) => void;
  onToggleMuted: (session: SessionWithStatus, muted: boolean) => void;
  onManageLabels: () => void;
};

type ActivityGroup = 'working' | 'idle' | 'stopped';

const GROUP_ORDER: ActivityGroup[] = ['working', 'idle', 'stopped'];
const GROUP_LABELS: Record<ActivityGroup, string> = {
  working: 'Working',
  idle: 'Idle',
  stopped: 'Stopped',
};

type ContextMenuState = {
  session: SessionWithStatus;
  x: number;
  y: number;
};

export function Sidebar({
  sessions,
  sessionLabels,
  activeId,
  width,
  minWidth,
  maxWidth,
  onResize,
  onResizeEnd,
  onSelect,
  onDelete,
  onNewSession,
  onOpenSettings,
  onOpenAgentData,
  onOpenCleanup,
  onSetSessionLabels,
  onToggleMuted,
  onManageLabels,
}: Props) {
  const labelMap = useMemo(() => sessionLabelMap(sessionLabels), [sessionLabels]);
  const groups = groupByActivity(sessions);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.classList.add('resizing-sidebar');

    const clamp = (raw: number) => Math.min(maxWidth, Math.max(minWidth, raw));

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      onResize(clamp(startWidth + delta));
    };

    const onUp = (ev: MouseEvent) => {
      document.body.classList.remove('resizing-sidebar');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const delta = ev.clientX - startX;
      onResizeEnd(clamp(startWidth + delta));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-drag" aria-hidden />
        <div className="sidebar-header-main">
          <div className="sidebar-title">AI Worktrees</div>
        </div>
      </div>
      <div
        className="sidebar-resize"
        onMouseDown={onResizeMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
      <div className="sidebar-actions">
        <button className="btn btn-primary" onClick={onNewSession}>
          + New Session
        </button>
        <div className="sidebar-actions-icons">
          <button
            className="icon-btn"
            title="Agent Data"
            onClick={onOpenAgentData}
            aria-label="Agent Data"
          >
            <DocIcon />
          </button>
          <button
            className="icon-btn"
            title="Cleanup"
            onClick={onOpenCleanup}
            aria-label="Cleanup leftover worktrees and branches"
          >
            <CleanupIcon />
          </button>
          <button
            className="icon-btn"
            title="Settings"
            onClick={onOpenSettings}
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
      <div className="sessions-scroll">
        {sessions.length === 0 ? (
          <div className="repo-label" style={{ textAlign: 'center', marginTop: 24 }}>
            No sessions yet
          </div>
        ) : (
          GROUP_ORDER.map((group) => {
            const repos = groups[group];
            if (repos.length === 0) return null;
            return (
              <div key={group} className="activity-group">
                <div className="activity-label">{GROUP_LABELS[group]}</div>
                {repos.map(([repo, items]) => (
                  <div key={repo} className="repo-group">
                    <div className="repo-label">{repo}</div>
                    {items.map((s) => {
                      const appliedLabels = labelsForSession(s, labelMap);
                      const isActive = s.id === activeId;
                      return (
                      <div
                        key={s.id}
                        className={`session-row${isActive ? ' active' : ''}${s.muted ? ' session-row--muted' : ''}`}
                        onClick={() => onSelect(s.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenu({ session: s, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <span
                          className={`status-dot ${statusDotClass(s)}`}
                          title={statusDotClass(s)}
                          aria-hidden
                        />
                        <div className="session-card-content">
                          <div className="session-card-top">
                            <span className="session-name-primary" title={s.name}>
                              {s.name}
                            </span>
                          </div>
                          <div className="session-card-meta">
                            <span
                              className="session-agent-tag-group"
                              title={`Agent: ${getAgent(s.agentId).name}`}
                            >
                              <span className={`session-agent-tag agent-${s.agentId}`}>
                                {getAgent(s.agentId).name}
                              </span>
                            </span>
                            <span className="session-meta-sep" aria-hidden>
                              ·
                            </span>
                            {isCodeSession(s) ? (
                              <span className="session-branch-name" title={s.worktreePath}>
                                Code session
                              </span>
                            ) : (
                              <span className="session-branch-name" title={s.branchName}>
                                {s.branchName}
                              </span>
                            )}
                          </div>
                          {appliedLabels.length > 0 && (
                            <div className="session-row-labels">
                              <SessionLabelChips labels={appliedLabels} compact />
                            </div>
                          )}
                        </div>
                        <div className="session-row-actions">
                          <button
                            type="button"
                            className={`session-mute${s.muted ? ' session-mute--active' : ''}`}
                            title={s.muted ? 'Unmute session' : 'Mute session'}
                            aria-label={s.muted ? 'Unmute session' : 'Mute session'}
                            aria-pressed={s.muted === true}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleMuted(s, !s.muted);
                            }}
                          >
                            <MuteIcon muted={s.muted === true} />
                          </button>
                          <button
                            className="session-delete"
                            type="button"
                            title="Delete session"
                            aria-label="Delete session"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(s);
                            }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
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
          onManageLabels={() => {
            setMenu(null);
            onManageLabels();
          }}
        />
      )}
    </aside>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function CleanupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function activityGroupFor(s: SessionWithStatus): ActivityGroup {
  const kind = activityKindFor(s);
  if (kind === 'working') return 'working';
  if (kind === 'idle') return 'idle';
  return 'stopped';
}

function groupByActivity(sessions: SessionWithStatus[]): Record<ActivityGroup, [string, SessionWithStatus[]][]> {
  const buckets: Record<ActivityGroup, SessionWithStatus[]> = {
    working: [],
    idle: [],
    stopped: [],
  };
  for (const s of sessions) buckets[activityGroupFor(s)].push(s);
  return {
    working: groupByRepo(buckets.working),
    idle: groupByRepo(buckets.idle),
    stopped: groupByRepo(buckets.stopped),
  };
}

function groupByRepo(sessions: SessionWithStatus[]): [string, SessionWithStatus[]][] {
  const map = new Map<string, SessionWithStatus[]>();
  for (const s of sessions) {
    const list = map.get(s.repoName) ?? [];
    list.push(s);
    map.set(s.repoName, list);
  }
  return Array.from(map.entries())
    .map(([repo, items]) => [repo, items.sort((a, b) => a.name.localeCompare(b.name))] as [string, SessionWithStatus[]])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function MuteIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
