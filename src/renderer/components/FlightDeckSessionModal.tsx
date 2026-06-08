import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionLabel, SessionPromptPreset, SessionWithStatus } from '@shared/types';
import { quickNotesForSession } from '@shared/session-quick-notes';
import { getAgent } from '@shared/agents';
import {
  activityLabelFor,
  activityKindFor,
  labelsForSession,
} from '@shared/session-labels';
import {
  loadVisiblePanels,
  PANEL_IDS,
  persistPanelLayout,
  persistVisiblePanels,
  rectToStyle,
  resolveLayout,
  SNAP_ZONES,
  snapZoneAt,
  type GridRect,
  type PanelId,
  type PanelLayout,
  type SnapZoneId,
} from '@shared/flight-deck-grid';
import { BuiltInTerminalPanel } from './BuiltInTerminalPanel';
import { GitPanel } from './GitPanel';
import { SessionQuickNotes } from './SessionQuickNotes';
import { SessionPromptDock } from './SessionPromptDock';
import { TerminalView, type TerminalApi } from './Terminal';
import { SessionLabelChips } from './SessionLabelChips';

const PANEL_META: Record<PanelId, { title: string; label: string }> = {
  agent: { title: 'Agent', label: 'Agent session' },
  shell: { title: 'Shell', label: 'Shell terminal' },
  git: { title: 'Git', label: 'Git diff' },
};

const WORKSPACE_SIZE_KEY = 'flight-deck-workspace-size';
const WORKSPACE_DEFAULT_WIDTH = 1520;
const WORKSPACE_DEFAULT_HEIGHT = 940;
const WORKSPACE_MIN_WIDTH = 720;
const WORKSPACE_MIN_HEIGHT = 480;
const WORKSPACE_VIEWPORT_MARGIN = 24;

type WorkspaceSize = { width: number; height: number };

function maxWorkspaceSize(): WorkspaceSize {
  if (typeof window === 'undefined') {
    return { width: WORKSPACE_DEFAULT_WIDTH, height: WORKSPACE_DEFAULT_HEIGHT };
  }
  return {
    width: window.innerWidth - WORKSPACE_VIEWPORT_MARGIN,
    height: window.innerHeight - WORKSPACE_VIEWPORT_MARGIN,
  };
}

function clampWorkspaceSize(width: number, height: number): WorkspaceSize {
  const max = maxWorkspaceSize();
  return {
    width: Math.min(max.width, Math.max(WORKSPACE_MIN_WIDTH, width)),
    height: Math.min(max.height, Math.max(WORKSPACE_MIN_HEIGHT, height)),
  };
}

function loadWorkspaceSize(): WorkspaceSize {
  try {
    const raw = localStorage.getItem(WORKSPACE_SIZE_KEY);
    if (!raw) return clampWorkspaceSize(WORKSPACE_DEFAULT_WIDTH, WORKSPACE_DEFAULT_HEIGHT);
    const parsed = JSON.parse(raw) as { width?: number; height?: number };
    return clampWorkspaceSize(Number(parsed.width), Number(parsed.height));
  } catch {
    return clampWorkspaceSize(WORKSPACE_DEFAULT_WIDTH, WORKSPACE_DEFAULT_HEIGHT);
  }
}

function persistWorkspaceSize(size: WorkspaceSize) {
  localStorage.setItem(WORKSPACE_SIZE_KEY, JSON.stringify(size));
}

type Props = {
  session: SessionWithStatus;
  sessionLabels: SessionLabel[];
  sessionPrompts: SessionPromptPreset[];
  themeName: 'dark' | 'light';
  blurred?: boolean;
  onClose: () => void;
  onOpenInWorkspace: () => void;
  onRunPrompt: (text: string) => void;
  onAddQuickNote: (sessionId: string, text: string) => void;
  onRemoveQuickNote: (sessionId: string, noteId: string) => void;
  onScrollToBottom: () => void;
  onTerminalApi?: (sessionId: string, api: TerminalApi | null) => void;
};

export function FlightDeckSessionModal({
  session,
  sessionLabels,
  sessionPrompts,
  themeName,
  blurred,
  onClose,
  onOpenInWorkspace,
  onRunPrompt,
  onAddQuickNote,
  onRemoveQuickNote,
  onScrollToBottom,
  onTerminalApi,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [visiblePanels, setVisiblePanels] = useState<Set<PanelId>>(() => loadVisiblePanels());
  const [layout, setLayout] = useState<PanelLayout>(() => {
    const visible = PANEL_IDS.filter((p) => loadVisiblePanels().has(p));
    return resolveLayout(session.id, visible);
  });
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapZoneId | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [workspaceSize, setWorkspaceSize] = useState<WorkspaceSize>(() => loadWorkspaceSize());

  const activePanelIds = useMemo(
    () => PANEL_IDS.filter((p) => visiblePanels.has(p)),
    [visiblePanels],
  );

  useEffect(() => {
    const visible = PANEL_IDS.filter((p) => visiblePanels.has(p));
    setLayout((cur) => {
      const next = resolveLayout(session.id, visible, cur);
      persistPanelLayout(session.id, next);
      return next;
    });
    setLayoutRevision((n) => n + 1);
  }, [session.id]);

  const applyLayout = useCallback(
    (next: PanelLayout) => {
      setLayout(next);
      persistPanelLayout(session.id, next);
      setLayoutRevision((n) => n + 1);
    },
    [session.id],
  );

  const togglePanel = useCallback(
    (id: PanelId) => {
      setVisiblePanels((prev) => {
        const nextVisible = new Set(prev);
        if (nextVisible.has(id)) {
          if (id === 'agent' && nextVisible.size === 1) return prev;
          nextVisible.delete(id);
        } else {
          nextVisible.add(id);
        }
        persistVisiblePanels(nextVisible);
        const ids = PANEL_IDS.filter((p) => nextVisible.has(p));
        setLayout((cur) => {
          const next = resolveLayout(session.id, ids, cur);
          persistPanelLayout(session.id, next);
          return next;
        });
        setLayoutRevision((n) => n + 1);
        return nextVisible;
      });
    },
    [session.id],
  );

  const snapPanel = useCallback(
    (panelId: PanelId, zone: SnapZoneId) => {
      const rect = SNAP_ZONES[zone];
      applyLayout({ ...layout, [panelId]: rect });
    },
    [applyLayout, layout],
  );

  const onDragMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const nx = (e.clientX - bounds.left) / bounds.width;
    const ny = (e.clientY - bounds.top) / bounds.height;
    setSnapPreview(snapZoneAt(nx, ny));
  }, []);

  const endDrag = useCallback(
    (panelId: PanelId, zone: SnapZoneId | null) => {
      document.body.classList.remove('flight-deck-snapping');
      window.removeEventListener('mousemove', onDragMove);
      if (zone) snapPanel(panelId, zone);
      setDragging(null);
      setSnapPreview(null);
    },
    [onDragMove, snapPanel],
  );

  const startDrag = useCallback(
    (panelId: PanelId, e: React.MouseEvent) => {
      e.preventDefault();
      document.body.classList.add('flight-deck-snapping');
      setDragging(panelId);
      setSnapPreview(null);

      const onMove = (ev: MouseEvent) => onDragMove(ev);
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mouseup', onUp);
        const canvas = canvasRef.current;
        let zone: SnapZoneId | null = null;
        if (canvas) {
          const bounds = canvas.getBoundingClientRect();
          const nx = (ev.clientX - bounds.left) / bounds.width;
          const ny = (ev.clientY - bounds.top) / bounds.height;
          zone = snapZoneAt(nx, ny);
        }
        endDrag(panelId, zone);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      onDragMove(e.nativeEvent);
    },
    [endDrag, onDragMove],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onWindowResize = () => {
      setWorkspaceSize((prev) => clampWorkspaceSize(prev.width, prev.height));
    };
    document.body.classList.add('flight-deck-workspace-open');
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWindowResize);
    const fitTimer = window.setTimeout(() => setLayoutRevision((n) => n + 1), 200);
    return () => {
      window.clearTimeout(fitTimer);
      document.body.classList.remove('flight-deck-workspace-open');
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [onClose]);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = workspaceSize;
      document.body.classList.add('resizing-flight-deck-workspace');

      const onMove = (ev: MouseEvent) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        setWorkspaceSize(clampWorkspaceSize(start.width + dw, start.height + dh));
      };

      const onUp = (ev: MouseEvent) => {
        document.body.classList.remove('resizing-flight-deck-workspace');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const next = clampWorkspaceSize(start.width + dw, start.height + dh);
        setWorkspaceSize(next);
        persistWorkspaceSize(next);
        setLayoutRevision((n) => n + 1);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [workspaceSize],
  );

  const kind = activityKindFor(session);
  const labels = labelsForSession(session, new Map(sessionLabels.map((l) => [l.id, l])));
  const quickNotes = useMemo(() => quickNotesForSession(session), [session]);

  return (
    <div className="flight-deck-workspace-backdrop" onMouseDown={onClose}>
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
            <div className="flight-deck-modal-panel-toggles" role="toolbar" aria-label="Panel visibility">
              {PANEL_IDS.map((id) => (
                <PanelToggle
                  key={id}
                  label={PANEL_META[id].label}
                  active={visiblePanels.has(id)}
                  disabled={id === 'agent' && visiblePanels.has('agent') && visiblePanels.size === 1}
                  onClick={() => togglePanel(id)}
                  icon={panelIcon(id)}
                />
              ))}
            </div>
            <button type="button" className="flight-deck-workspace-link-btn" onClick={onOpenInWorkspace}>
              Open in Workspace
            </button>
            <button type="button" className="flight-deck-workspace-icon-btn" onClick={onClose} title="Close" aria-label="Close workspace">
              <CloseIcon />
            </button>
          </div>
        </div>
      </header>

      <div className="flight-deck-workspace-canvas" ref={canvasRef}>
        {dragging && snapPreview && (
          <div
            className="flight-deck-snap-preview"
            style={rectToStyle(SNAP_ZONES[snapPreview])}
            aria-hidden
          />
        )}
        {activePanelIds.map((id) => {
          const rect = layout[id];
          if (!rect) return null;
          return (
            <GridWindow
              key={id}
              id={id}
              title={PANEL_META[id].title}
              rect={rect}
              dragging={dragging === id}
              canClose={visiblePanels.size > 1 && !(id === 'agent' && visiblePanels.size === 1)}
              onClose={() => togglePanel(id)}
              onSnap={(zone) => snapPanel(id, zone)}
              onDragStart={(e) => startDrag(id, e)}
              onScrollToBottom={id === 'agent' ? onScrollToBottom : undefined}
            >
              {id === 'agent' && (
                <TerminalView
                  sessionId={session.id}
                  agentId={session.agentId}
                  visible
                  blurred={blurred ?? false}
                  themeName={themeName}
                  embedded
                  layoutRevision={layoutRevision}
                  onTerminalApi={onTerminalApi}
                />
              )}
              {id === 'shell' && (
                <BuiltInTerminalPanel
                  sessionId={session.id}
                  worktreePath={session.worktreePath}
                  themeName={themeName}
                  blurred={blurred ?? false}
                  embedded
                  layoutRevision={layoutRevision}
                  onHide={() => togglePanel('shell')}
                />
              )}
              {id === 'git' && (
                <GitPanel sessionId={session.id} embedded onHide={() => togglePanel('git')} />
              )}
            </GridWindow>
          );
        })}
      </div>

      <footer className="flight-deck-workspace-bottom">
        <div className="flight-deck-workspace-bottom-prompts">
          {sessionPrompts.length > 0 ? (
            <SessionPromptDock prompts={sessionPrompts} onRun={onRunPrompt} />
          ) : (
            <span className="muted flight-deck-workspace-no-prompts">No quick prompts configured</span>
          )}
        </div>
        <SessionQuickNotes
          sessionId={session.id}
          notes={quickNotes}
          onAdd={onAddQuickNote}
          onRemove={onRemoveQuickNote}
        />
      </footer>
      <div
        className="flight-deck-workspace-resize-handle"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
        aria-hidden
      />
      </div>
    </div>
  );
}

function GridWindow({
  id,
  title,
  rect,
  dragging,
  canClose,
  onClose,
  onSnap,
  onDragStart,
  onScrollToBottom,
  children,
}: {
  id: PanelId;
  title: string;
  rect: GridRect;
  dragging: boolean;
  canClose: boolean;
  onClose: () => void;
  onSnap: (zone: SnapZoneId) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onScrollToBottom?: () => void;
  children: React.ReactNode;
}) {
  const style = rectToStyle(rect);

  return (
    <div
      className={`flight-deck-grid-window flight-deck-grid-window--${id}${dragging ? ' flight-deck-grid-window--dragging' : ''}`}
      style={style}
    >
      <div className="flight-deck-grid-window-card">
        <div className="flight-deck-grid-window-titlebar" onMouseDown={onDragStart}>
          <span className="flight-deck-grid-window-title">{title}</span>
          <div className="flight-deck-grid-window-titlebar-actions" onMouseDown={(e) => e.stopPropagation()}>
            {onScrollToBottom && (
              <button
                type="button"
                className="flight-deck-workspace-icon-btn flight-deck-grid-window-action"
                onClick={onScrollToBottom}
                title="Scroll to bottom"
                aria-label="Scroll agent terminal to bottom"
              >
                <ChevronDownIcon />
              </button>
            )}
            <SnapMenu onSnap={onSnap} />
            {canClose && (
              <button
                type="button"
                className="flight-deck-workspace-icon-btn flight-deck-grid-window-close"
                onClick={onClose}
                title={`Close ${title}`}
                aria-label={`Close ${title}`}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
        <div className="flight-deck-grid-window-body">{children}</div>
      </div>
    </div>
  );
}

function SnapMenu({ onSnap }: { onSnap: (zone: SnapZoneId) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const items: { zone: SnapZoneId; label: string }[] = [
    { zone: 'full', label: 'Fullscreen' },
    { zone: 'left', label: 'Left half' },
    { zone: 'right', label: 'Right half' },
    { zone: 'top', label: 'Top half' },
    { zone: 'bottom', label: 'Bottom half' },
    { zone: 'top-left', label: 'Top left' },
    { zone: 'top-right', label: 'Top right' },
    { zone: 'bottom-left', label: 'Bottom left' },
    { zone: 'bottom-right', label: 'Bottom right' },
  ];

  return (
    <div className="flight-deck-snap-menu">
      <button
        type="button"
        className="flight-deck-workspace-icon-btn flight-deck-snap-menu-trigger"
        title="Snap to grid"
        aria-label="Snap to grid"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <SnapIcon />
      </button>
      {open && (
        <div className="flight-deck-snap-menu-dropdown" onClick={(e) => e.stopPropagation()}>
          {items.map((item) => (
            <button
              key={item.zone}
              type="button"
              className="flight-deck-snap-menu-item"
              onClick={() => {
                onSnap(item.zone);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PanelToggle({
  label,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`flight-deck-workspace-icon-btn flight-deck-panel-toggle${active ? ' flight-deck-panel-toggle--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

function panelIcon(id: PanelId) {
  if (id === 'agent') return <AgentIcon />;
  if (id === 'shell') return <ShellIcon />;
  return <GitIcon />;
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
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

function SnapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function ShellIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function GitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}
