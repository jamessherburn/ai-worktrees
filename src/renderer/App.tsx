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
import { GitPanel } from './components/GitPanel';
import { SessionPromptBar } from './components/SessionPromptBar';
import { TasksPanel } from './components/TasksPanel';
import { BuiltInTerminalPanel } from './components/BuiltInTerminalPanel';
import { BottomDock, type BottomDockPanelSpec } from './components/BottomDock';
import { Logo } from './components/Logo';
import { useResolvedTheme } from './theme';

const GIT_PANEL_COLLAPSED_KEY = 'git-panel-collapsed';
const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_UPGRADE_THRESHOLD = 340;
const MAIN_PANE_MIN_WIDTH = 80;
const TASKS_PANEL_COLLAPSED_KEY = 'tasks-panel-collapsed';
const BUILTIN_TERMINAL_COLLAPSED_KEY = 'builtin-terminal-collapsed';
const BOTTOM_DOCK_HEIGHT_KEY = 'bottom-dock-height';
const BOTTOM_DOCK_DEFAULT_HEIGHT = 280;
const BOTTOM_DOCK_MIN_HEIGHT = 160;
const MAIN_PANE_MIN_HEIGHT = 120;
const BOTTOM_ACTION_BAR_HEIGHT = 48;
const BOTTOM_TERMINAL_MIN_WIDTH = 220;
const BOTTOM_TASKS_MIN_WIDTH = 240;
const BOTTOM_GIT_MIN_WIDTH = 280;

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

function readInitialSidebarWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return SIDEBAR_DEFAULT_WIDTH;
  if (stored <= SIDEBAR_UPGRADE_THRESHOLD) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(stored);
}

function maxBottomDockHeight(): number {
  if (typeof window === 'undefined') return 600;
  return Math.max(
    BOTTOM_DOCK_MIN_HEIGHT,
    window.innerHeight - 56 - MAIN_PANE_MIN_HEIGHT - BOTTOM_ACTION_BAR_HEIGHT,
  );
}

function clampBottomDockHeight(value: number): number {
  if (!Number.isFinite(value)) return BOTTOM_DOCK_DEFAULT_HEIGHT;
  return Math.min(maxBottomDockHeight(), Math.max(BOTTOM_DOCK_MIN_HEIGHT, value));
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
  const [builtInTerminalCollapsed, setBuiltInTerminalCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(BUILTIN_TERMINAL_COLLAPSED_KEY) !== '0';
  });
  const [gitPanelCollapsed, setGitPanelCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(GIT_PANEL_COLLAPSED_KEY);
    if (stored !== null) return stored === '1';
    const legacyDev = localStorage.getItem('developer-panel-collapsed');
    if (legacyDev !== null) return legacyDev !== '0';
    return true;
  });
  const [bottomDockHeight, setBottomDockHeight] = useState<number>(() => {
    const stored = Number(
      localStorage.getItem(BOTTOM_DOCK_HEIGHT_KEY) ??
        localStorage.getItem('tasks-panel-height'),
    );
    return clampBottomDockHeight(stored);
  });
  const [pendingDelete, setPendingDelete] = useState<SessionWithStatus | null>(null);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [vscodeMissing, setVscodeMissing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readInitialSidebarWidth());
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
    if (!activeId) return;
    setGitPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(GIT_PANEL_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, [activeId]);

  const toggleTasksPanel = useCallback(() => {
    if (!activeId) return;
    setTasksPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(TASKS_PANEL_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, [activeId]);

  const toggleBuiltInTerminal = useCallback(() => {
    if (!activeId) return;
    setBuiltInTerminalCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(BUILTIN_TERMINAL_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, [activeId]);

  const onResizeBottomDock = useCallback((h: number) => {
    setBottomDockHeight(clampBottomDockHeight(h));
  }, []);

  const onResizeBottomDockEnd = useCallback((h: number) => {
    const clamped = clampBottomDockHeight(h);
    setBottomDockHeight(clamped);
    localStorage.setItem(BOTTOM_DOCK_HEIGHT_KEY, String(Math.round(clamped)));
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
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(stored) && stored > 0 && stored <= SIDEBAR_UPGRADE_THRESHOLD) {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH));
    }
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

  const openActiveInVSCode = useCallback(async () => {
    if (!activeSession) return;
    const result = await window.api.openInVSCode(activeSession.worktreePath);
    if (!result.ok && result.reason === 'not-installed') {
      setVscodeMissing(true);
    }
  }, [activeSession]);

  const openActiveInFileWindow = useCallback(async () => {
    if (!activeSession) return;
    await window.api.revealInFinder(activeSession.worktreePath);
  }, [activeSession]);

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
      const api = terminalApisRef.current.get(activeId);
      if (api) {
        api.submitPrompt(text);
        return;
      }
      let attempts = 0;
      const retry = () => {
        const next = terminalApisRef.current.get(activeId);
        if (next) {
          next.submitPrompt(text);
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

  const showTasksPanel = activeSession !== null && !tasksPanelCollapsed;
  const showBuiltInTerminal = activeSession !== null && !builtInTerminalCollapsed;
  const showGitPanel = activeSession !== null && !gitPanelCollapsed;
  const showBottomDock = showTasksPanel || showBuiltInTerminal || showGitPanel;
  const appClass = `app${showBottomDock ? ' with-bottom-dock' : ''}`;
  const appStyle = {
    ['--sidebar-width' as string]: `${sidebarWidth}px`,
    ['--bottom-action-bar-height' as string]: `${BOTTOM_ACTION_BAR_HEIGHT}px`,
    ...(showBottomDock ? { ['--bottom-dock-height' as string]: `${bottomDockHeight}px` } : {}),
  } as React.CSSProperties;

  const bottomDockPanels = useMemo((): BottomDockPanelSpec[] => {
    const panels: BottomDockPanelSpec[] = [];
    if (showBuiltInTerminal) {
      panels.push({
        id: 'terminal',
        minWidth: BOTTOM_TERMINAL_MIN_WIDTH,
        content: activeSession ? (
          <BuiltInTerminalPanel
            key={activeSession.id}
            sessionId={activeSession.id}
            worktreePath={activeSession.worktreePath}
            themeName={resolvedTheme}
            blurred={modalOpen}
            onHide={toggleBuiltInTerminal}
          />
        ) : (
          <section className="built-in-terminal-panel bottom-dock-panel built-in-terminal-placeholder">
            <div className="bottom-dock-panel-header">
              <div className="bottom-dock-panel-title">Terminal</div>
              <div className="bottom-dock-panel-header-actions">
                <button
                  className="icon-btn"
                  onClick={toggleBuiltInTerminal}
                  title="Hide Terminal panel"
                  aria-label="Hide Terminal panel"
                >
                  <ChevronDownIcon />
                </button>
              </div>
            </div>
            <div className="built-in-terminal-body built-in-terminal-empty">
              Select a session to open a shell at its worktree root.
            </div>
          </section>
        ),
      });
    }
    if (showTasksPanel) {
      panels.push({
        id: 'tasks',
        minWidth: BOTTOM_TASKS_MIN_WIDTH,
        content: <TasksPanel tasksConfig={tasksConfig} onHide={toggleTasksPanel} />,
      });
    }
    if (showGitPanel) {
      panels.push({
        id: 'git',
        minWidth: BOTTOM_GIT_MIN_WIDTH,
        content: activeSession ? (
          <GitPanel
            key={activeSession.id}
            sessionId={activeSession.id}
            onHide={toggleGitPanel}
          />
        ) : (
          <section className="git-dock-panel bottom-dock-panel bottom-dock-placeholder">
            <div className="bottom-dock-panel-header">
              <div className="bottom-dock-panel-title">Git</div>
              <div className="bottom-dock-panel-header-actions">
                <button
                  className="icon-btn"
                  onClick={toggleGitPanel}
                  title="Hide Git panel"
                  aria-label="Hide Git panel"
                >
                  <ChevronDownIcon />
                </button>
              </div>
            </div>
            <div className="bottom-dock-placeholder-body">
              Select a session to view git status and diffs.
            </div>
          </section>
        ),
      });
    }
    return panels;
  }, [
    showBuiltInTerminal,
    showTasksPanel,
    showGitPanel,
    activeSession,
    resolvedTheme,
    modalOpen,
    tasksConfig,
    toggleBuiltInTerminal,
    toggleTasksPanel,
    toggleGitPanel,
  ]);

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
          <PaneHeader session={activeSession} onPasteWizardBrief={pasteWizardBrief} />
        ) : (
          <EmptyHeader />
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
                    agentId={session.agentId}
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
          {showBottomDock && (
            <BottomDock
              height={bottomDockHeight}
              panels={bottomDockPanels}
              minHeight={BOTTOM_DOCK_MIN_HEIGHT}
              getMaxHeight={maxBottomDockHeight}
              onResizeHeight={onResizeBottomDock}
              onResizeHeightEnd={onResizeBottomDockEnd}
            />
          )}
        </div>
        <footer className="bottom-action-bar" aria-label="Panel shortcuts">
          <div className="bottom-action-bar-left">
            {sessionPrompts.length > 0 && (
              <SessionPromptBar
                prompts={sessionPrompts}
                disabled={!activeSession}
                onRun={runSessionPrompt}
                onScrollToBottom={scrollActiveTerminalToBottom}
              />
            )}
          </div>

          <div className="bottom-action-bar-right">
            {builtInTerminalCollapsed && (
              <button
                type="button"
                className="bottom-action-btn"
                onClick={toggleBuiltInTerminal}
                disabled={!activeSession}
                title={
                  activeSession
                    ? 'Show Terminal panel'
                    : 'Select a session to open the Terminal panel'
                }
              >
                <TerminalIcon />
                <span>Terminal</span>
              </button>
            )}
            {tasksPanelCollapsed && (
              <button
                type="button"
                className="bottom-action-btn"
                onClick={toggleTasksPanel}
                disabled={!activeSession}
                title={
                  activeSession ? 'Show Tasks panel' : 'Select a session to open the Tasks panel'
                }
              >
                <TasksIcon />
                <span>Tasks</span>
              </button>
            )}
            {gitPanelCollapsed && (
              <button
                type="button"
                className="bottom-action-btn"
                onClick={toggleGitPanel}
                disabled={!activeSession}
                title={activeSession ? 'Show Git panel' : 'Select a session to open the Git panel'}
              >
                <GitBranchIcon />
                <span>Git</span>
              </button>
            )}
            <button
              type="button"
              className="bottom-action-btn"
              onClick={() => void openActiveInVSCode()}
              disabled={!activeSession}
              title={
                activeSession
                  ? `Open ${activeSession.worktreePath} in VS Code`
                  : 'Select a session to open in VS Code'
              }
            >
              <VSCodeIcon />
              <span>Open In VSCode</span>
            </button>
            <button
              type="button"
              className="bottom-action-btn"
              onClick={() => void openActiveInFileWindow()}
              disabled={!activeSession}
              title={
                activeSession
                  ? `Open ${activeSession.worktreePath} in File Window`
                  : 'Select a session to open in File Window'
              }
            >
              <FileWindowIcon />
              <span>Open In File Window</span>
            </button>
          </div>
        </footer>
      </main>

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
  onPasteWizardBrief,
}: {
  session: SessionWithStatus;
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

function TerminalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function VSCodeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3 7 12l10 9V3z" />
      <line x1="7" y1="12" x2="3" y2="9" />
      <line x1="7" y1="12" x2="3" y2="15" />
    </svg>
  );
}

function FileWindowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15V6a2 2 0 0 0-2-2H8l-2 3H3v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z" />
      <path d="M3 10h18" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
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
