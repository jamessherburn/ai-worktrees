import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SessionWithStatus, Settings } from '@shared/types';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from '@shared/session-labels';
import { normalizeWorktreesSkills } from '@shared/worktrees-skills';
import { matchAppShortcut, shouldIgnoreAppShortcut } from '@shared/app-shortcuts';
import { sessionsInSidebarOrder } from '@shared/session-sidebar-order';
import { Sidebar } from './components/Sidebar';
import { TerminalView, type TerminalApi } from './components/Terminal';
import { NewSessionModal } from './components/NewSessionModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { SettingsModal } from './components/SettingsModal';
import { AgentDataModal } from './components/AgentDataModal';
import { GitPanel } from './components/GitPanel';
import { TodoModal } from './components/TodoModal';
import { BuiltInTerminalPanel } from './components/BuiltInTerminalPanel';
import { BottomDock, type BottomDockPanelSpec } from './components/BottomDock';
import { WorktreesSkillPrompter } from './components/WorktreesSkillPrompter';
import { Logo } from './components/Logo';
import { useResolvedTheme, type ResolvedTheme } from './theme';

const GIT_PANEL_COLLAPSED_KEY = 'git-panel-collapsed';
const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_UPGRADE_THRESHOLD = 340;
const MAIN_PANE_MIN_WIDTH = 80;
const BUILTIN_TERMINAL_COLLAPSED_KEY = 'builtin-terminal-collapsed';
const SESSION_PANEL_PREFS_KEY = 'session-panel-prefs';
const BOTTOM_DOCK_HEIGHT_KEY = 'bottom-dock-height';
const BOTTOM_DOCK_DEFAULT_HEIGHT = 280;
const BOTTOM_DOCK_MIN_HEIGHT = 160;
const MAIN_PANE_MIN_HEIGHT = 120;
const BOTTOM_ACTION_BAR_HEIGHT = 64;
const BOTTOM_TERMINAL_MIN_WIDTH = 220;
const BOTTOM_GIT_MIN_WIDTH = 280;

const DEFAULT_SETTINGS: Settings = {
  codeDir: '',
  theme: 'system',
  sessionLabels: DEFAULT_SESSION_LABELS,
};

type SettingsTab = 'general' | 'skills' | 'labels' | 'shortcuts';

type SessionPanelPrefs = {
  terminalCollapsed: boolean;
  gitCollapsed: boolean;
};

type SessionPanelPrefsMap = Record<string, SessionPanelPrefs>;

function defaultSessionPanelPrefs(): SessionPanelPrefs {
  const terminalCollapsed = localStorage.getItem(BUILTIN_TERMINAL_COLLAPSED_KEY) !== '0';
  const gitStored = localStorage.getItem(GIT_PANEL_COLLAPSED_KEY);
  let gitCollapsed = true;
  if (gitStored !== null) gitCollapsed = gitStored === '1';
  else {
    const legacyDev = localStorage.getItem('developer-panel-collapsed');
    if (legacyDev !== null) gitCollapsed = legacyDev !== '0';
  }
  return { terminalCollapsed, gitCollapsed };
}

function readSessionPanelPrefsMap(): SessionPanelPrefsMap {
  try {
    const raw = localStorage.getItem(SESSION_PANEL_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionPanelPrefsMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeSessionPanelPrefsMap(map: SessionPanelPrefsMap): void {
  localStorage.setItem(SESSION_PANEL_PREFS_KEY, JSON.stringify(map));
}

function sessionPanelPrefs(map: SessionPanelPrefsMap, sessionId: string): SessionPanelPrefs {
  return map[sessionId] ?? defaultSessionPanelPrefs();
}

function removeSessionPanelPrefs(map: SessionPanelPrefsMap, sessionId: string): SessionPanelPrefsMap {
  if (!(sessionId in map)) return map;
  const next = { ...map };
  delete next[sessionId];
  return next;
}


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
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionWithStatus[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentData, setShowAgentData] = useState(false);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [panelPrefsBySession, setPanelPrefsBySession] = useState<SessionPanelPrefsMap>(() =>
    readSessionPanelPrefsMap(),
  );
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

  const activePanelPrefs = useMemo(
    () => (activeId ? sessionPanelPrefs(panelPrefsBySession, activeId) : null),
    [activeId, panelPrefsBySession],
  );
  const builtInTerminalCollapsed = activePanelPrefs?.terminalCollapsed ?? true;
  const gitPanelCollapsed = activePanelPrefs?.gitCollapsed ?? true;

  const toggleGitPanel = useCallback(() => {
    if (!activeId) return;
    setPanelPrefsBySession((prev) => {
      const current = sessionPanelPrefs(prev, activeId);
      const next = {
        ...prev,
        [activeId]: { ...current, gitCollapsed: !current.gitCollapsed },
      };
      writeSessionPanelPrefsMap(next);
      return next;
    });
  }, [activeId]);

  const toggleTodoModal = useCallback(() => {
    setShowTodoModal((prev) => !prev);
  }, []);

  const toggleBuiltInTerminal = useCallback(() => {
    if (!activeId) return;
    setPanelPrefsBySession((prev) => {
      const current = sessionPanelPrefs(prev, activeId);
      const next = {
        ...prev,
        [activeId]: { ...current, terminalCollapsed: !current.terminalCollapsed },
      };
      writeSessionPanelPrefsMap(next);
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

  const resolvedTheme = useResolvedTheme(settings.theme);
  const sessionLabels = useMemo(
    () => normalizeSessionLabels(settings.sessionLabels ?? DEFAULT_SESSION_LABELS),
    [settings.sessionLabels],
  );
  const worktreesSkills = useMemo(
    () => normalizeWorktreesSkills(settings.worktreesSkills),
    [settings.worktreesSkills],
  );

  const modalOpen =
    showNew ||
    showSettings ||
    showAgentData ||
    showTodoModal ||
    pendingDelete !== null ||
    vscodeMissing;

  const refresh = useCallback(async () => {
    const list = await window.api.listSessions();
    setSessions(list);
    return list;
  }, []);

  useEffect(() => {
    let alive = true;
    const unsubGh = window.api.onGitHubApiSetupProgress((message) => {
      if (!alive) return;
      setGhApiBar({ message, tone: 'pending' });
    });
    const unsubFish = window.api.onFishSetupProgress((message) => {
      if (!alive) return;
      setGhApiBar({ message, tone: 'pending' });
    });
    let dismissTimer: number | undefined;

    const scheduleDismiss = (ms: number) => {
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => {
        if (alive) setGhApiBar(null);
      }, ms);
    };

    void (async () => {
      try {
        const ghResult = await window.api.ensureGitHubApi();
        if (!alive) return;
        if (ghResult.ok) {
          if (ghResult.needsGhAuth) {
            setGhApiBar({
              message: ghResult.launchedAuthTerminal
                ? 'GitHub CLI needs sign-in — finish gh auth login in the Terminal window that opened.'
                : 'GitHub CLI needs sign-in — run gh auth login in a terminal, then dismiss this message.',
              tone: 'warning',
            });
          } else {
            setGhApiBar({
              message: ghResult.outcome === 'already-installed' ? 'Already installed' : 'Installed',
              tone: 'success',
            });
            scheduleDismiss(4200);
          }
        } else {
          setGhApiBar({
            message: ghResult.error,
            tone: 'error',
          });
          scheduleDismiss(12000);
        }

        const ghNeedsAuth = ghResult.ok && ghResult.needsGhAuth;
        const fishResult = await window.api.ensureFishShell();
        if (!alive) return;
        if (fishResult.ok) {
          if (fishResult.outcome === 'skipped' || ghNeedsAuth) return;
          setGhApiBar({
            message:
              fishResult.outcome === 'already-installed'
                ? 'Fish shell ready'
                : 'Fish shell installed',
            tone: 'success',
          });
          scheduleDismiss(4200);
        } else {
          setGhApiBar({
            message: fishResult.error,
            tone: 'error',
          });
          scheduleDismiss(12000);
        }
      } catch (err: unknown) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : String(err);
        setGhApiBar({ message: `Startup dependency check failed: ${message}`, tone: 'error' });
        scheduleDismiss(12000);
      }
    })();

    return () => {
      alive = false;
      unsubGh();
      unsubFish();
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
  const shellFocusRef = useRef<(() => void) | null>(null);
  const skillPrompterFocusRef = useRef<(() => void) | null>(null);
  const focusPaneRef = useRef<'agent' | 'shell' | 'skills'>('agent');
  const suppressArrowUntilRef = useRef(0);
  const handleTerminalApi = useCallback((id: string, api: TerminalApi | null) => {
    if (api) {
      terminalApisRef.current.set(id, api);
    } else {
      terminalApisRef.current.delete(id);
    }
  }, []);

  const openSession = useCallback((id: string) => {
    setActiveId(id);
    setOpenedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

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

  const submitPromptToSession = useCallback((sessionId: string, text: string) => {
    const api = terminalApisRef.current.get(sessionId);
    if (api) {
      api.submitPrompt(text);
      return;
    }
    let attempts = 0;
    const retry = () => {
      const next = terminalApisRef.current.get(sessionId);
      if (next) {
        next.submitPrompt(text);
        return;
      }
      attempts += 1;
      if (attempts < 20) window.setTimeout(retry, 50);
    };
    window.setTimeout(retry, 50);
  }, []);

  const runWorktreesSkill = useCallback(
    (prompt: string) => {
      if (!activeId) return;
      submitPromptToSession(activeId, prompt);
    },
    [activeId, submitPromptToSession],
  );

  const setSessionLabels = useCallback(
    async (sessionId: string, labelIds: string[]) => {
      setSessions((prev) =>
        prev.map((x) => (x.id === sessionId ? { ...x, labelIds } : x)),
      );
      await window.api.setSessionLabels(sessionId, labelIds);
      await refresh();
    },
    [refresh],
  );

  const setSessionMuted = useCallback(
    async (sessionId: string, muted: boolean) => {
      setSessions((prev) =>
        prev.map((x) => (x.id === sessionId ? { ...x, muted: muted || undefined } : x)),
      );
      await window.api.setSessionMuted(sessionId, muted);
      await refresh();
    },
    [refresh],
  );

  const goToNextOpenSession = useCallback(() => {
    const ordered = sessionsInSidebarOrder(sessions).filter((s) => !s.muted);
    if (ordered.length <= 1) return;

    const currentIndex = activeId ? ordered.findIndex((s) => s.id === activeId) : -1;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % ordered.length;
    openSession(ordered[nextIndex].id);
  }, [sessions, activeId, openSession]);

  const focusSkillsPrompter = useCallback(() => {
    if (!activeId || worktreesSkills.length === 0) {
      focusPaneRef.current = 'agent';
      if (!activeId) return;
      const focusAgent = () => terminalApisRef.current.get(activeId)?.focus();
      focusAgent();
      let attempts = 0;
      const retry = () => {
        if (terminalApisRef.current.get(activeId)) {
          focusAgent();
          return;
        }
        attempts += 1;
        if (attempts < 20) window.setTimeout(retry, 50);
      };
      window.setTimeout(retry, 50);
      return;
    }

    focusPaneRef.current = 'skills';
    const focusSkills = () => skillPrompterFocusRef.current?.();
    focusSkills();
    let attempts = 0;
    const retry = () => {
      if (skillPrompterFocusRef.current) {
        skillPrompterFocusRef.current();
        return;
      }
      attempts += 1;
      if (attempts < 20) window.setTimeout(retry, 50);
    };
    window.setTimeout(retry, 50);
  }, [activeId, worktreesSkills.length]);

  const jumpFocusBetweenPanes = useCallback(() => {
    if (!activeId) return;

    if (builtInTerminalCollapsed) {
      if (focusPaneRef.current === 'agent') {
        focusSkillsPrompter();
        return;
      }
      terminalApisRef.current.get(activeId)?.focus();
      focusPaneRef.current = 'agent';
      return;
    }

    if (focusPaneRef.current === 'agent') {
      shellFocusRef.current?.();
      focusPaneRef.current = 'shell';
      return;
    }
    if (focusPaneRef.current === 'shell') {
      focusSkillsPrompter();
      return;
    }
    terminalApisRef.current.get(activeId)?.focus();
    focusPaneRef.current = 'agent';
  }, [activeId, builtInTerminalCollapsed, focusSkillsPrompter]);

  const goToNextOpenSessionRef = useRef(goToNextOpenSession);
  goToNextOpenSessionRef.current = goToNextOpenSession;

  const jumpFocusBetweenPanesRef = useRef(jumpFocusBetweenPanes);
  jumpFocusBetweenPanesRef.current = jumpFocusBetweenPanes;

  const scrollActiveTerminalToBottomRef = useRef(scrollActiveTerminalToBottom);
  scrollActiveTerminalToBottomRef.current = scrollActiveTerminalToBottom;

  const toggleBuiltInTerminalRef = useRef(toggleBuiltInTerminal);
  toggleBuiltInTerminalRef.current = toggleBuiltInTerminal;

  const toggleGitPanelRef = useRef(toggleGitPanel);
  toggleGitPanelRef.current = toggleGitPanel;

  const openActiveInVSCodeRef = useRef(openActiveInVSCode);
  openActiveInVSCodeRef.current = openActiveInVSCode;

  const openActiveInFileWindowRef = useRef(openActiveInFileWindow);
  openActiveInFileWindowRef.current = openActiveInFileWindow;

  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;

  const setShowNewRef = useRef(setShowNew);
  setShowNewRef.current = setShowNew;

  const openManageLabels = useCallback(() => {
    setSettingsInitialTab('labels');
    setShowSettings(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (Date.now() < suppressArrowUntilRef.current) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      if (shouldIgnoreAppShortcut(e.target)) return;
      const shortcut = matchAppShortcut(e);
      if (!shortcut) return;
      if (modalOpenRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      switch (shortcut) {
        case 'nextSession':
          goToNextOpenSessionRef.current();
          break;
        case 'toggleTerminal':
          if (!activeSessionRef.current) return;
          toggleBuiltInTerminalRef.current();
          break;
        case 'toggleGit':
          if (!activeSessionRef.current) return;
          toggleGitPanelRef.current();
          break;
        case 'jumpFocus':
          if (!activeSessionRef.current) return;
          jumpFocusBetweenPanesRef.current();
          break;
        case 'scrollToBottom':
          if (!activeSessionRef.current) return;
          suppressArrowUntilRef.current = Date.now() + 500;
          scrollActiveTerminalToBottomRef.current();
          break;
        case 'openVSCode':
          if (!activeSessionRef.current) return;
          void openActiveInVSCodeRef.current();
          break;
        case 'openFinder':
          if (!activeSessionRef.current) return;
          void openActiveInFileWindowRef.current();
          break;
        case 'newSession':
          setShowNewRef.current(true);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const closeSessionTerminal = useCallback((id: string) => {
    setOpenedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const showBuiltInTerminal = activeSession !== null && !builtInTerminalCollapsed;
  const showGitPanel = activeSession !== null && !gitPanelCollapsed;
  const showBottomDock = showBuiltInTerminal || showGitPanel;
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
            onRegisterFocus={(focus) => {
              shellFocusRef.current = focus;
            }}
            onFocusPane={() => {
              focusPaneRef.current = 'shell';
            }}
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
    showGitPanel,
    activeSession,
    resolvedTheme,
    modalOpen,
    toggleBuiltInTerminal,
    toggleGitPanel,
  ]);

  return (
    <div className={appClass} style={appStyle}>
      <Sidebar
        sessions={sessions}
        sessionLabels={sessionLabels}
        activeId={activeId}
        width={sidebarWidth}
        minWidth={SIDEBAR_MIN_WIDTH}
        maxWidth={SIDEBAR_MAX_WIDTH}
        onResize={onResizeSidebar}
        onResizeEnd={onResizeSidebarEnd}
        onSelect={openSession}
        onDelete={(s) => setPendingDelete(s)}
        onNewSession={() => setShowNew(true)}
        onOpenSettings={() => {
          setSettingsInitialTab(undefined);
          setShowSettings(true);
        }}
        onOpenAgentData={() => setShowAgentData(true)}
        onSetSessionLabels={(s, labelIds) => void setSessionLabels(s.id, labelIds)}
        onToggleMuted={(s, muted) => void setSessionMuted(s.id, muted)}
        onManageLabels={openManageLabels}
      />

      <main className="main-pane">
        {activeSession ? (
          <PaneHeader session={activeSession} theme={resolvedTheme}>
            <PaneToolbar
              activeSession={activeSession}
              builtInTerminalCollapsed={builtInTerminalCollapsed}
              gitPanelCollapsed={gitPanelCollapsed}
              onToggleBuiltInTerminal={toggleBuiltInTerminal}
              onToggleGitPanel={toggleGitPanel}
              onScrollToBottom={scrollActiveTerminalToBottom}
              onOpenInVSCode={() => void openActiveInVSCode()}
              onOpenInFileWindow={() => void openActiveInFileWindow()}
            />
          </PaneHeader>
        ) : (
          <EmptyHeader theme={resolvedTheme}>
            <PaneToolbar
              activeSession={null}
              builtInTerminalCollapsed={builtInTerminalCollapsed}
              gitPanelCollapsed={gitPanelCollapsed}
              onToggleBuiltInTerminal={toggleBuiltInTerminal}
              onToggleGitPanel={toggleGitPanel}
              onScrollToBottom={scrollActiveTerminalToBottom}
              onOpenInVSCode={() => void openActiveInVSCode()}
              onOpenInFileWindow={() => void openActiveInFileWindow()}
            />
          </EmptyHeader>
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
                    onFocusPane={() => {
                      focusPaneRef.current = 'agent';
                    }}
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
        <footer className="bottom-action-bar" aria-label="Agent actions">
          <div className="bottom-action-bar-leading">
            <WorktreesSkillPrompter
              skills={worktreesSkills}
              disabled={!activeSession}
              onRun={runWorktreesSkill}
              onRegisterFocus={(focus) => {
                skillPrompterFocusRef.current = focus;
              }}
              onFocusPane={() => {
                focusPaneRef.current = 'skills';
              }}
              onCycleFocus={jumpFocusBetweenPanes}
            />
          </div>
          <div className="bottom-action-bar-trailing">
            <button
              type="button"
              className={`bottom-action-bar-todo${showTodoModal ? ' bottom-action-bar-todo--active' : ''}`}
              onClick={toggleTodoModal}
              title={showTodoModal ? 'Close To Do' : 'To Do'}
              aria-label="To Do"
              aria-pressed={showTodoModal}
            >
              <TasksIcon />
              <span>To Do</span>
            </button>
          </div>
        </footer>
      </main>

      {showNew && (
        <NewSessionModal
          sessionLabels={sessionLabels}
          onClose={() => setShowNew(false)}
          onCreated={async ({ session }) => {
            setShowNew(false);
            const list = await refresh();
            const created = list.find((s) => s.id === session.id);
            if (!created) return;
            openSession(created.id);
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
            setPanelPrefsBySession((prev) => {
              const next = removeSessionPanelPrefs(prev, id);
              if (next === prev) return prev;
              writeSessionPanelPrefsMap(next);
              return next;
            });
            if (activeId === id) setActiveId(null);
            await refresh();
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          current={settings}
          initialTab={settingsInitialTab}
          onClose={() => {
            setShowSettings(false);
            setSettingsInitialTab(undefined);
          }}
          onSettingsChange={setSettings}
          onSaved={(next) => {
            setSettings(next);
            setShowSettings(false);
            setSettingsInitialTab(undefined);
          }}
        />
      )}

      {showTodoModal && (
        <TodoModal sessionLabels={sessionLabels} onClose={() => setShowTodoModal(false)} />
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

type PaneToolbarProps = {
  activeSession: SessionWithStatus | null;
  builtInTerminalCollapsed: boolean;
  gitPanelCollapsed: boolean;
  onToggleBuiltInTerminal: () => void;
  onToggleGitPanel: () => void;
  onScrollToBottom: () => void;
  onOpenInVSCode: () => void;
  onOpenInFileWindow: () => void;
};

function PaneToolbar({
  activeSession,
  builtInTerminalCollapsed,
  gitPanelCollapsed,
  onToggleBuiltInTerminal,
  onToggleGitPanel,
  onScrollToBottom,
  onOpenInVSCode,
  onOpenInFileWindow,
}: PaneToolbarProps) {
  const hasSession = activeSession !== null;

  const terminalOpen = hasSession && !builtInTerminalCollapsed;
  const gitOpen = hasSession && !gitPanelCollapsed;

  return (
    <div className="pane-toolbar" role="toolbar" aria-label="Session tools">
      <button
        type="button"
        className={`icon-btn pane-toolbar-btn${terminalOpen ? ' pane-toolbar-btn--active' : ''}`}
        onClick={onToggleBuiltInTerminal}
        disabled={!hasSession}
        title={
          hasSession
            ? terminalOpen
              ? 'Hide Terminal'
              : 'Terminal'
            : 'Select a session for Terminal'
        }
        aria-label={hasSession ? 'Terminal' : 'Terminal (select a session)'}
        aria-pressed={terminalOpen}
      >
        <TerminalIcon />
      </button>
      <button
        type="button"
        className={`icon-btn pane-toolbar-btn${gitOpen ? ' pane-toolbar-btn--active' : ''}`}
        onClick={onToggleGitPanel}
        disabled={!hasSession}
        title={hasSession ? (gitOpen ? 'Hide Git' : 'Git') : 'Select a session for Git'}
        aria-label={hasSession ? 'Git' : 'Git (select a session)'}
        aria-pressed={gitOpen}
      >
        <GitBranchIcon />
      </button>
      <button
        type="button"
        className="icon-btn pane-toolbar-btn"
        onClick={onOpenInVSCode}
        disabled={!hasSession}
        title={hasSession ? 'Open In VSCode' : 'Select a session to open in VS Code'}
        aria-label={hasSession ? 'Open In VSCode' : 'Open In VSCode (select a session)'}
      >
        <VSCodeIcon />
      </button>
      <button
        type="button"
        className="icon-btn pane-toolbar-btn"
        onClick={onOpenInFileWindow}
        disabled={!hasSession}
        title={hasSession ? 'Open In File Window' : 'Select a session to open in File Window'}
        aria-label={hasSession ? 'Open In File Window' : 'Open In File Window (select a session)'}
      >
        <FileWindowIcon />
      </button>
      <button
        type="button"
        className="icon-btn pane-toolbar-btn"
        onClick={onScrollToBottom}
        disabled={!hasSession}
        title={hasSession ? 'Scroll to bottom' : 'Select a session to scroll the terminal'}
        aria-label={hasSession ? 'Scroll to bottom' : 'Scroll to bottom (select a session)'}
      >
        <ChevronDownIcon />
      </button>
    </div>
  );
}

function PaneHeader({
  session,
  theme,
  children,
}: {
  session: SessionWithStatus;
  theme: ResolvedTheme;
  children: ReactNode;
}) {
  return (
    <header className="pane-header">
      <div className="header-info">
        <div className="pane-title">
          {session.name}
          {session.global ? (
            <span className="pane-global-label" title="Global session">
              Global
            </span>
          ) : null}
        </div>
        <div className="pane-subtitle">
          {session.global
            ? session.worktreePath
            : `${session.repoName} · ${session.branchName} · ${session.worktreePath}`}
        </div>
      </div>
      <div className="pane-header-trailing">
        {children}
        <Logo theme={theme} />
      </div>
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

function EmptyHeader({ theme, children }: { theme: ResolvedTheme; children: ReactNode }) {
  return (
    <header className="pane-header">
      <div className="header-info">
        <div className="pane-title">AI Worktrees</div>
        <div className="pane-subtitle">Manage AI coding-agent sessions across your repos.</div>
      </div>
      <div className="pane-header-trailing">
        {children}
        <Logo theme={theme} />
      </div>
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
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
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
