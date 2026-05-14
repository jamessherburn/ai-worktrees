import { useEffect, useState } from 'react';
import type { SessionWithStatus } from '@shared/types';
import { getAgent } from '@shared/agents';

type Props = {
  sessions: SessionWithStatus[];
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
  onOpenDiary: () => void;
  onSetWaitingOnReview: (session: SessionWithStatus, value: boolean) => void;
};

type ActivityGroup = 'working' | 'waiting-on-review' | 'idle' | 'stopped';

const GROUP_ORDER: ActivityGroup[] = ['working', 'waiting-on-review', 'idle', 'stopped'];
const GROUP_LABELS: Record<ActivityGroup, string> = {
  working: 'Working',
  'waiting-on-review': 'Waiting On Review',
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
  onOpenDiary,
  onSetWaitingOnReview,
}: Props) {
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
        <div className="sidebar-title">AI Worktrees</div>
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
        <button className="icon-btn" title="Settings" onClick={onOpenSettings} aria-label="Settings">
          <SettingsIcon />
        </button>
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
                    {items.map((s) => (
                      <div
                        key={s.id}
                        className={`session-row${s.id === activeId ? ' active' : ''}`}
                        onClick={() => onSelect(s.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenu({ session: s, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <span className={`status-dot ${dotClass(s)}`} title={dotClass(s)} />
                        <div className="session-name" title={s.name}>
                          {s.name}
                        <div className="session-branch">
                          <span
                            className={`session-agent-tag-wrap${s.wizardBriefMarkdown ? ' session-agent-tag-wrap--wizard' : ''}`}
                            title={
                              s.wizardBriefMarkdown
                                ? `Agent: ${getAgent(s.agentId).name} · Wizard briefing available`
                                : `Agent: ${getAgent(s.agentId).name}`
                            }
                          >
                            <span className={`session-agent-tag agent-${s.agentId}`}>
                              {getAgent(s.agentId).name}
                            </span>
                            {s.wizardBriefMarkdown ? (
                              <span className="session-agent-wizard-badge" aria-hidden>
                                <WizardHatIcon />
                              </span>
                            ) : null}
                          </span>
                          {s.branchName}
                        </div>
                        </div>
                        <button
                          className="session-delete"
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
                    ))}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
      <button
        className="sidebar-tool-btn"
        onClick={onOpenDiary}
        title="Open your diary"
      >
        <DiaryIcon />
        <span>Diary</span>
      </button>
      <button
        className="sidebar-tool-btn"
        onClick={onOpenAgentData}
        title="See spend and edit global instructions for every agent"
      >
        <DocIcon />
        <span>Agent Data</span>
      </button>
      {menu && (
        <SessionContextMenu
          session={menu.session}
          x={menu.x}
          y={menu.y}
          onSetWaitingOnReview={(value) => {
            onSetWaitingOnReview(menu.session, value);
            setMenu(null);
          }}
        />
      )}
    </aside>
  );
}

function SessionContextMenu({
  session,
  x,
  y,
  onSetWaitingOnReview,
}: {
  session: SessionWithStatus;
  x: number;
  y: number;
  onSetWaitingOnReview: (value: boolean) => void;
}) {
  const isWaiting = session.waitingOnReview === true;
  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isWaiting ? (
        <button className="context-menu-item" onClick={() => onSetWaitingOnReview(false)}>
          Mark As Active
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => onSetWaitingOnReview(true)}>
          Mark As Waiting On Review
        </button>
      )}
    </div>
  );
}

function WizardHatIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3 5 16h14L12 3z" />
      <path d="M4 16h16v2.5H4z" />
    </svg>
  );
}

function DiaryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
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

function dotClass(s: SessionWithStatus): string {
  if (s.waitingOnReview) return 'waiting-on-review';
  if (s.status !== 'running') return s.status;
  return s.activity ?? 'idle';
}

function activityGroupFor(s: SessionWithStatus): ActivityGroup {
  if (s.waitingOnReview) return 'waiting-on-review';
  if (s.status !== 'running') return 'stopped';
  return s.activity === 'working' ? 'working' : 'idle';
}

function groupByActivity(sessions: SessionWithStatus[]): Record<ActivityGroup, [string, SessionWithStatus[]][]> {
  const buckets: Record<ActivityGroup, SessionWithStatus[]> = {
    working: [],
    'waiting-on-review': [],
    idle: [],
    stopped: [],
  };
  for (const s of sessions) buckets[activityGroupFor(s)].push(s);
  return {
    working: groupByRepo(buckets.working),
    'waiting-on-review': groupByRepo(buckets['waiting-on-review']),
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
