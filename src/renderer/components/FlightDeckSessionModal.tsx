import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionLabel, SessionPromptPreset, SessionWithStatus } from '@shared/types';
import type { ResolvedTheme } from '../theme';
import { sessionNotesText } from '@shared/session-notes';
import { getAgent } from '@shared/agents';
import {
  activityLabelFor,
  activityKindFor,
  labelsForSession,
} from '@shared/session-labels';
import { BuiltInTerminalPanel } from './BuiltInTerminalPanel';
import { NvimEditorPanel } from './NvimEditorPanel';
import { SessionNotesButton } from './SessionNotesButton';
import { SessionPromptDock } from './SessionPromptDock';
import { TerminalView, type TerminalApi } from './Terminal';
import { SessionLabelChips } from './SessionLabelChips';
import { matchesShiftK, matchesShiftN, shouldIgnoreAppShortcut } from '@shared/app-shortcuts';

type FlightDeckPanel = 'editor' | 'agent' | 'shell';

const PANEL_CYCLE_ORDER: FlightDeckPanel[] = ['editor', 'agent', 'shell'];

/** Horizontal inset on each side when fullscreen. */
const WORKSPACE_VIEWPORT_MARGIN = 12;
/** Clearance below macOS traffic lights (hiddenInset title bar). */
const WORKSPACE_TOP_INSET = 56;
/** Bottom inset when fullscreen. */
const WORKSPACE_BOTTOM_MARGIN = 12;

type WorkspaceSize = { width: number; height: number };

function fullscreenWorkspaceSize(): WorkspaceSize {
  if (typeof window === 'undefined') {
    return { width: 1200, height: 800 };
  }
  return {
    width: window.innerWidth - WORKSPACE_VIEWPORT_MARGIN * 2,
    height: window.innerHeight - WORKSPACE_TOP_INSET - WORKSPACE_BOTTOM_MARGIN,
  };
}

type Props = {
  session: SessionWithStatus;
  sessionLabels: SessionLabel[];
  sessionPrompts: SessionPromptPreset[];
  themeName: ResolvedTheme;
  blurred?: boolean;
  onClose: () => void;
  onRunPrompt: (text: string) => void;
  onSaveNotes: (sessionId: string, text: string) => void;
  onTerminalApi?: (sessionId: string, api: TerminalApi | null) => void;
};

export function FlightDeckSessionModal({
  session,
  sessionLabels,
  sessionPrompts,
  themeName,
  blurred,
  onClose,
  onRunPrompt,
  onSaveNotes,
  onTerminalApi,
}: Props) {
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [workspaceSize, setWorkspaceSize] = useState<WorkspaceSize>(() => fullscreenWorkspaceSize());
  const [notesOpen, setNotesOpen] = useState(false);

  const panelFocusRef = useRef<Record<FlightDeckPanel, (() => void) | null>>({
    editor: null,
    agent: null,
    shell: null,
  });
  const activePanelRef = useRef<FlightDeckPanel>('agent');

  const registerPanelFocus = useCallback((panel: FlightDeckPanel, focus: (() => void) | null) => {
    panelFocusRef.current[panel] = focus;
  }, []);

  const lastCycleAtRef = useRef(0);
  const cyclePanel = useCallback(() => {
    const now = Date.now();
    if (now - lastCycleAtRef.current < 200) return;
    lastCycleAtRef.current = now;
    const idx = PANEL_CYCLE_ORDER.indexOf(activePanelRef.current);
    const next = PANEL_CYCLE_ORDER[(idx + 1) % PANEL_CYCLE_ORDER.length];
    activePanelRef.current = next;
    panelFocusRef.current[next]?.();
  }, []);

  const cyclePanelRef = useRef(cyclePanel);
  cyclePanelRef.current = cyclePanel;

  const registerEditorFocus = useCallback(
    (focus: (() => void) | null) => registerPanelFocus('editor', focus),
    [registerPanelFocus],
  );
  const registerAgentFocus = useCallback(
    (focus: (() => void) | null) => registerPanelFocus('agent', focus),
    [registerPanelFocus],
  );
  const registerShellFocus = useCallback(
    (focus: (() => void) | null) => registerPanelFocus('shell', focus),
    [registerPanelFocus],
  );

  useEffect(() => {
    setNotesOpen(false);
  }, [session.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onWindowResize = () => {
      setWorkspaceSize(fullscreenWorkspaceSize());
      setLayoutRevision((n) => n + 1);
    };
    document.body.classList.add('flight-deck-workspace-open');
    const onShortcutKey = (e: KeyboardEvent) => {
      if (matchesShiftK(e) && !shouldIgnoreAppShortcut(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        cyclePanelRef.current();
        return;
      }
      if (matchesShiftN(e) && !shouldIgnoreAppShortcut(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        setNotesOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onShortcutKey, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWindowResize);
    const fitTimer = window.setTimeout(() => setLayoutRevision((n) => n + 1), 200);
    const fitAgainTimer = window.setTimeout(() => setLayoutRevision((n) => n + 1), 700);
    return () => {
      window.clearTimeout(fitTimer);
      window.clearTimeout(fitAgainTimer);
      document.body.classList.remove('flight-deck-workspace-open');
      window.removeEventListener('keydown', onShortcutKey, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [onClose]);

  const kind = activityKindFor(session);
  const labels = labelsForSession(session, new Map(sessionLabels.map((l) => [l.id, l])));
  const notes = useMemo(() => sessionNotesText(session), [session]);

  return (
    <div
      className="flight-deck-workspace-backdrop flight-deck-workspace-backdrop--expanded"
      onMouseDown={onClose}
    >
      <div
        className="flight-deck-workspace"
        role="dialog"
        aria-modal="true"
        aria-label={`${session.name} workspace`}
        style={{ width: workspaceSize.width, height: workspaceSize.height }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flight-deck-workspace-top">
          <div className="flight-deck-workspace-top-row">
            <div className="flight-deck-workspace-top-main">
              <div className="flight-deck-modal-title">
                <span
                  className={`status-dot ${kind === 'orphaned' ? 'orphaned' : kind === 'stopped' ? 'stopped' : kind}`}
                />
                {session.name}
                {session.global ? <span className="pane-global-label">Global</span> : null}
              </div>
              <div className="flight-deck-modal-subtitle">
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
                <span className="flight-deck-modal-activity">{activityLabelFor(session)}</span>
                {!session.global && (
                  <span className="flight-deck-modal-repo">
                    {session.repoName} · {session.branchName}
                  </span>
                )}
              </div>
              <SessionLabelChips labels={labels} />
            </div>
            <div className="flight-deck-workspace-top-actions">
              {sessionPrompts.length > 0 ? (
                <div className="flight-deck-workspace-top-prompts">
                  <SessionPromptDock
                    prompts={sessionPrompts}
                    onRun={onRunPrompt}
                    flyoutPlacement="below"
                    className="session-prompt-dock-shell--header"
                  />
                </div>
              ) : null}
              <SessionNotesButton
                sessionId={session.id}
                notes={notes}
                onSave={onSaveNotes}
                open={notesOpen}
                onOpenChange={setNotesOpen}
              />
              <button
                type="button"
                className="flight-deck-workspace-icon-btn"
                onClick={onClose}
                title="Close"
                aria-label="Close workspace"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </header>

        <div className="flight-deck-workspace-layout">
          <section
            className="flight-deck-panel flight-deck-panel--editor"
            aria-label="Editor"
            onMouseDown={() => {
              activePanelRef.current = 'editor';
            }}
          >
            <div className="flight-deck-panel-body">
              <NvimEditorPanel
                sessionId={session.id}
                themeName={themeName}
                blurred={blurred ?? false}
                layoutRevision={layoutRevision}
                startDelayMs={800}
                onRegisterFocus={registerEditorFocus}
              />
            </div>
          </section>

          <div className="flight-deck-workspace-bottom-row">
            <section
              className="flight-deck-panel flight-deck-panel--agent"
              aria-label="Agent"
              onMouseDown={() => {
                activePanelRef.current = 'agent';
              }}
            >
              <div className="flight-deck-panel-body">
                <TerminalView
                  sessionId={session.id}
                  agentId={session.agentId}
                  visible
                  blurred={blurred ?? false}
                  themeName={themeName}
                  embedded
                  preferFocus
                  layoutRevision={layoutRevision}
                  onTerminalApi={onTerminalApi}
                  onRegisterFocus={registerAgentFocus}
                />
              </div>
            </section>

            <section
              className="flight-deck-panel flight-deck-panel--shell"
              aria-label="Terminal"
              onMouseDown={() => {
                activePanelRef.current = 'shell';
              }}
            >
              <div className="flight-deck-panel-body">
                <BuiltInTerminalPanel
                  sessionId={session.id}
                  worktreePath={session.worktreePath}
                  themeName={themeName}
                  blurred={blurred ?? false}
                  embedded
                  layoutRevision={layoutRevision}
                  startDelayMs={300}
                  onHide={() => {}}
                  onRegisterFocus={registerShellFocus}
                />
              </div>
            </section>
          </div>
        </div>

      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
