import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionWithStatus, Settings } from '@shared/types';
import { DEFAULT_SESSION_PROMPTS, resolveSessionPrompts } from '@shared/session-prompts';
import { DEFAULT_TASKS_CONFIG, normalizeTasksConfig } from '@shared/tasks';
import { DEFAULT_WIZARD_CONFIG } from '@shared/wizard';
import { Sidebar } from './components/Sidebar';
import { TerminalView, type TerminalApi } from './components/Terminal';
import { NewSessionModal } from './components/NewSessionModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { SettingsModal } from './components/SettingsModal';
import { AgentDataModal } from './components/AgentDataModal';
import { DeveloperPanel } from './components/DeveloperPanel';
import { SessionPromptBar } from './components/SessionPromptBar';
import { TasksPanel } from './components/TasksPanel';
import { Logo } from './components/Logo';
import { useResolvedTheme } from './theme';

const GIT_PANEL_COLLAPSED_KEY = 'git-panel-collapsed';
const GIT_PANEL_WIDTH_KEY = 'git-panel-width';
const GIT_PANEL_DEFAULT_WIDTH = 380;
const GIT_PANEL_MIN_WIDTH = 240;
const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const MAIN_PANE_MIN_WIDTH = 80;
const TASKS_PANEL_COLLAPSED_KEY = 'tasks-panel-collapsed';
const TASKS_PANEL_HEIGHT_KEY = 'tasks-panel-height';
const TASKS_PANEL_DEFAULT_HEIGHT = 280;
const TASKS_PANEL_MIN_HEIGHT = 160;
const MAIN_PANE_MIN_HEIGHT = 120;

const DEFAULT_SETTINGS: Settings = {
  codeDir: '',
  theme: 'system',
  wizard: DEFAULT_WIZARD_CONFIG,
  tasks: DEFAULT_TASKS_CONFIG,
  sessionPrompts: DEFAULT_SESSION_PROMPTS,
};


function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}

function maxGitPanelWidth(sidebarWidth: number): number {
  if (typeof window === 'undefined') return 4000;
  return Math.max(GIT_PANEL_MIN_WIDTH, window.innerWidth - sidebarWidth - MAIN_PANE_MIN_WIDTH);
}

function clampGitPanelWidth(value: number, sidebarWidth: number): number {
  if (!Number.isFinite(value)) return GIT_PANEL_DEFAULT_WIDTH;
  return Math.min(maxGitPanelWidth(sidebarWidth), Math.max(GIT_PANEL_MIN_WIDTH, value));
}

function maxTasksPanelHeight(): number {
  if (typeof window === 'undefined') return 600;
  return Math.max(TASKS_PANEL_MIN_HEIGHT, window.innerHeight - 56 - MAIN_PANE_MIN_HEIGHT);
}

function clampTasksPanelHeight(value: number): number {
  if (!Number.isFinite(value)) return TASKS_PANEL_DEFAULT_HEIGHT;
  return Math.min(maxTasksPanelHeight(), Math.max(TASKS_PANEL_MIN_HEIGHT, value));
}

export function App() {
  const [sessions, setSessions] = useState<SessionWithStatus[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentData, setShowAgentData] = useState(false);
  const [tasksPanelCollapsed, setTasksPanelCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(TASKS_PANEL_COLLAPSED_KEY) !== '0';
  });
  const [tasksPanelHeight, setTasksPanelHeight] = useState<number>(() => {
    const stored = Number(localStorage.getItem(TASKS_PANEL_HEIGHT_KEY));
    return clampTasksPanelHeight(stored);
  });
  const [pendingDelete, setPendingDelete] = useState<SessionWithStatus | null>(null);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [vscodeMissing, setVscodeMissing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return clampSidebarWidth(stored);
  });
  const [gitPanelCollapsed, setGitPanelCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(GIT_PANEL_COLLAPSED_KEY) === '1';
  });
  const [gitPanelWidth, setGitPanelWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(GIT_PANEL_WIDTH_KEY));
    return clampGitPanelWidth(stored, SIDEBAR_DEFAULT_WIDTH);
  });
  const [gitPanelFullscreen, setGitPanelFullscreen] = useState(false);
  const [ghApiBar, setGhApiBar] = useState<{
    message: string;
    tone: 'pending' | 'success' | 'error' | 'warning';
  } | null>(null);

  const onResizeSidebar = useCallback((width: number) => {
    setSidebarWidth(clampSidebarWidth(width));
  }, []);

  const onResizeSidebarEnd = useCallback((width: number) => {
    const clamped = clampSidebarWidth(width);
    setSidebarWidth(clamped);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(clamped)));
  }, []);

  const toggleGitPanel = useCallback(() => {
    setGitPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(GIT_PANEL_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
    setGitPanelFullscreen(false);
  }, []);

  const toggleGitPanelFullscreen = useCallback(() => {
    setGitPanelFullscreen((prev) => !prev);
  }, []);

  const onResizeGitPanel = useCallback(
    (width: number) => {
      setGitPanelWidth(clampGitPanelWidth(width, sidebarWidth));
    },
    [sidebarWidth],
  );

  const onResizeGitPanelEnd = useCallback(
    (width: number) => {
      const clamped = clampGitPanelWidth(width, sidebarWidth);
      setGitPanelWidth(clamped);
      localStorage.setItem(GIT_PANEL_WIDTH_KEY, String(Math.round(clamped)));
    },
    [sidebarWidth],
  );

  const getMaxGitPanelWidth = useCallback(() => maxGitPanelWidth(sidebarWidth), [sidebarWidth]);

  const toggleTasksPanel = useCallback(() => {
    setTasksPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(TASKS_PANEL_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const onResizeTasksPanel = useCallback((h: number) => {
    setTasksPanelHeight(clampTasksPanelHeight(h));
  }, []);

  const onResizeTasksPanelEnd = useCallback((h: number) => {
    const clamped = clampTasksPanelHeight(h);
    setTasksPanelHeight(clamped);
    localStorage.setItem(TASKS_PANEL_HEIGHT_KEY, String(Math.round(clamped)));
  }, []);

  const tasksConfig = useMemo(
    () => normalizeTasksConfig(settings.tasks ?? DEFAULT_TASKS_CONFIG),
    [settings.tasks],
  );

  const resolvedTheme = useResolvedTheme(settings.theme);
  const sessionPrompts = useMemo(
    () => resolveSessionPrompts(settings.sessionPrompts),
    [settings.sessionPrompts],
  );

  const modalOpen =
    showNew ||
    showSettings ||
    showAgentData ||
    pendingDelete !== null ||
    vscodeMissing;

  const refresh = useCallback(async () => {
    const list = await window.api.listSessions();
    setSessions(list);
    return list;
  }, []);

  useEffect(() => {
    let alive = true;
    const unsub = window.api.onGitHubApiSetupProgress((message) => {
      if (!alive) return;
      setGhApiBar({ message, tone: 'pending' });
    });
    let dismissTimer: number | undefined;
    void window.api
      .ensureGitHubApi()
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          if (result.needsGhAuth) {
            setGhApiBar({
              message: result.launchedAuthTerminal
                ? 'GitHub CLI needs sign-in — finish gh auth login in the Terminal window that opened.'
                : 'GitHub CLI needs sign-in — run gh auth login in a terminal, then dismiss this message.',
              tone: 'warning',
            });
          } else {
            setGhApiBar({
              message: result.outcome === 'already-installed' ? 'Already installed' : 'Installed',
              tone: 'success',
            });
            dismissTimer = window.setTimeout(() => {
              if (alive) setGhApiBar(null);
            }, 4200);
          }
        } else {
          setGhApiBar({
            message: result.error,
            tone: 'error',
          });
          dismissTimer = window.setTimeout(() => {
            if (alive) setGhApiBar(null);
          }, 12000);
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error ? err.message : String(err);
        setGhApiBar({ message: `GitHub API check failed: ${message}`, tone: 'error' });
        dismissTimer = window.setTimeout(() => {
          if (alive) setGhApiBar(null);
        }, 12000);
      });
    return () => {
      alive = false;
      unsub();
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
    };
  }, []);

  useEffect(() => {
    void window.api.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const unsub = window.api.pty.onActivity(({ sessionId, activity }) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, activity } : s)),
      );
    });
    return () => {
      unsub();
    };
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const terminalApisRef = useRef(new Map<string, TerminalApi>());

  const handleTerminalApi = useCallback((id: string, api: TerminalApi | null) => {
    if (api) terminalApisRef.current.set(id, api);
    else terminalApisRef.current.delete(id);
  }, []);

  const pasteWizardBrief = useCallback(() => {
    const s = activeSession;
    if (!s?.wizardBriefMarkdown) return;
    terminalApisRef.current.get(s.id)?.paste(s.wizardBriefMarkdown);
  }, [activeSession]);

  const scrollActiveTerminalToBottom = useCallback(() => {
    if (!activeId) return;
    const api = terminalApisRef.current.get(activeId);
    if (api) {
      api.scrollToBottom();
      return;
    }
    // Session selected but terminal still mounting — retry briefly.
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      terminalApisRef.current.get(activeId)?.scrollToBottom();
      if (attempts < 20) window.setTimeout(retry, 50);
    };
    window.setTimeout(retry, 50);
  }, [activeId]);

  const runSessionPrompt = useCallback(
    (text: string) => {
      if (!activeId) return;
      const payload = `${text}\r`;
      const api = terminalApisRef.current.get(activeId);
      if (api) {
        api.paste(payload);
        return;
      }
      let attempts = 0;
      const retry = () => {
        const next = terminalApisRef.current.get(activeId);
        if (next) {
          next.paste(payload);
          return;
        }
        attempts += 1;
        if (attempts < 30) window.setTimeout(retry, 50);
      };
      window.setTimeout(retry, 50);
    },
    [activeId],
  );

  const openSession = useCallback((id: string) => {
    setActiveId(id);
    setOpenedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const closeSessionTerminal = useCallback((id: string) => {
    setOpenedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const showGitPanel = activeSession !== null && !gitPanelCollapsed;
  const showTasksPanel = !tasksPanelCollapsed;
  const fullscreen = showGitPanel && gitPanelFullscreen;
  const appClass = `app${showGitPanel ? ' with-git-panel' : ''}${fullscreen ? ' git-panel-fullscreen' : ''}${showTasksPanel ? ' with-tasks-panel' : ''}`;
  const appStyle = {
    ['--sidebar-width' as string]: `${sidebarWidth}px`,
    ...(showGitPanel ? { ['--git-panel-width' as string]: `${gitPanelWidth}px` } : {}),
    ...(showTasksPanel ? { ['--tasks-panel-height' as string]: `${tasksPanelHeight}px` } : {}),
  } as React.CSSProperties;

  return (
    <div className={appClass} style={appStyle}>
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        width={sidebarWidth}
        minWidth={SIDEBAR_MIN_WIDTH}
        maxWidth={SIDEBAR_MAX_WIDTH}
        onResize={onResizeSidebar}
        onResizeEnd={onResizeSidebarEnd}
        onSelect={openSession}
        onDelete={(s) => setPendingDelete(s)}
        onNewSession={() => setShowNew(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAgentData={() => setShowAgentData(true)}
        onSetWaitingOnReview={async (s, value) => {
          setSessions((prev) =>
            prev.map((x) => (x.id === s.id ? { ...x, waitingOnReview: value } : x)),
          );
          await window.api.setWaitingOnReview(s.id, value);
          await refresh();
        }}
      />

      <main className="main-pane">
        {activeSession ? (
          <PaneHeader
            session={activeSession}
            gitPanelHidden={gitPanelCollapsed}
            onShowGitPanel={toggleGitPanel}
            onPasteWizardBrief={pasteWizardBrief}
          />
        ) : (
          <EmptyHeader />
        )}
        {activeSession && (
          <SessionPromptBar
            prompts={sessionPrompts}
            onRun={runSessionPrompt}
            onScrollToBottom={scrollActiveTerminalToBottom}
          />
        )}
        <div className="main-pane-body">
          <div className={`terminal-stack${modalOpen ? ' inert' : ''}`}>
            {openedIds.map((id) => {
              const session = sessions.find((s) => s.id === id);
              if (!session) return null;
              const visible = id === activeId;
              return (
                <div key={id} className={`terminal-slot${visible ? ' visible' : ''}`}>
                  <TerminalView
                    sessionId={id}
                    visible={visible}
                    blurred={modalOpen}
                    themeName={resolvedTheme}
                    onExit={() => closeSessionTerminal(id)}
                    onTerminalApi={handleTerminalApi}
                  />
                </div>
              );
            })}
            {!activeSession && openedIds.length === 0 && (
              <EmptyState onNewSession={() => setShowNew(true)} />
            )}
          </div>
          {showTasksPanel && (
            <TasksPanel
              tasksConfig={tasksConfig}
              height={tasksPanelHeight}
              minHeight={TASKS_PANEL_MIN_HEIGHT}
              getMaxHeight={maxTasksPanelHeight}
              onResize={onResizeTasksPanel}
              onResizeEnd={onResizeTasksPanelEnd}
              onHide={toggleTasksPanel}
            />
          )}
        </div>
        {tasksPanelCollapsed && (
          <button
            type="button"
            className="tasks-fab"
            onClick={toggleTasksPanel}
            title="Show Tasks panel"
          >
            <TasksIcon />
            <span>Tasks</span>
          </button>
        )}
      </main>

      {showGitPanel && activeSession && (
        <DeveloperPanel
          sessionId={activeSession.id}
          worktreePath={activeSession.worktreePath}
          width={gitPanelWidth}
          minWidth={GIT_PANEL_MIN_WIDTH}
          getMaxWidth={getMaxGitPanelWidth}
          fullscreen={fullscreen}
          onResize={onResizeGitPanel}
          onResizeEnd={onResizeGitPanelEnd}
          onHide={toggleGitPanel}
          onToggleFullscreen={toggleGitPanelFullscreen}
          onVSCodeNotInstalled={() => setVscodeMissing(true)}
        />
      )}

      {showNew && (
        <NewSessionModal
          onClose={() => setShowNew(false)}
          onCreated={async ({ session }) => {
            setShowNew(false);
            const list = await refresh();
            const created = list.find((s) => s.id === session.id);
            if (created) openSession(created.id);
          }}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          session={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDeleted={async (id) => {
            setPendingDelete(null);
            closeSessionTerminal(id);
            if (activeId === id) setActiveId(null);
            await refresh();
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          current={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(next) => {
            setSettings(next);
            setShowSettings(false);
          }}
        />
      )}

      {showAgentData && <AgentDataModal onClose={() => setShowAgentData(false)} />}

      {vscodeMissing && (
        <VSCodeMissingModal onClose={() => setVscodeMissing(false)} />
      )}

      {ghApiBar && (
        <div
          className={`gh-api-status-bar gh-api-status-bar--${ghApiBar.tone}`}
          role="status"
          onClick={() => setGhApiBar(null)}
          title="Dismiss"
        >
          {ghApiBar.tone === 'pending' && <span className="gh-api-status-bar__spinner" aria-hidden />}
          <span className="gh-api-status-bar__text">{ghApiBar.message}</span>
        </div>
      )}
    </div>
  );
}

function VSCodeMissingModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">VS Code Required</div>
          <div className="modal-subtitle">VS Code Must Be Installed First</div>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ margin: 0 }}>
            We couldn't find the <span className="kbd">code</span> CLI. Install VS Code, then run
            <span className="kbd"> Shell Command: Install 'code' command in PATH</span> from the
            VS Code command palette.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function PaneHeader({
  session,
  gitPanelHidden,
  onShowGitPanel,
  onPasteWizardBrief,
}: {
  session: SessionWithStatus;
  gitPanelHidden: boolean;
  onShowGitPanel: () => void;
  onPasteWizardBrief: () => void;
}) {
  return (
    <header className="pane-header">
      <div className="header-info">
        <div className="pane-title">{session.name}</div>
        <div className="pane-subtitle">
          {session.repoName} · {session.branchName} · {session.worktreePath}
        </div>
      </div>
      <div className="pane-actions">
        {session.wizardBriefMarkdown && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onPasteWizardBrief}
            title="Paste the wizard-generated briefing into the agent terminal at the cursor"
          >
            Allow Wizard Command
          </button>
        )}
        {gitPanelHidden && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onShowGitPanel}
            title="Show Developer Panel"
          >
            <GitBranchIcon />
            <span>Developer</span>
          </button>
        )}
      </div>
      <Logo />
    </header>
  );
}

function GitBranchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function EmptyHeader() {
  return (
    <header className="pane-header">
      <div className="header-info">
        <div className="pane-title">AI Worktrees</div>
        <div className="pane-subtitle">Manage AI coding-agent sessions across your repos.</div>
      </div>
      <Logo />
    </header>
  );
}

function TasksIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">⌥</div>
      <div className="empty-title">Start your first session</div>
      <div className="empty-body">
        Pick an AI agent and a repo, give the session a name, and we'll create a fresh worktree
        branched off the latest <span className="kbd">main</span> and open the agent inside it.
      </div>
      <button className="btn btn-primary" onClick={onNewSession} style={{ flex: 'none', padding: '10px 18px' }}>
        + New Session
      </button>
    </div>
  );
}
