import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GitFileAction,
  GitFileChange,
  GitFileChangeKind,
  GitWorktreeStatus,
} from '@shared/types';

type Props = {
  sessionId: string;
  worktreePath: string;
  onHide: () => void;
};

type Group = 'staged' | 'unstaged' | 'untracked';

type Selection = {
  path: string;
  oldPath?: string;
  group: Group;
};

const POLL_INTERVAL_MS = 3000;

const EMPTY_STATUS: GitWorktreeStatus = { staged: [], unstaged: [], untracked: [] };

const GROUP_ORDER: Group[] = ['staged', 'unstaged', 'untracked'];

type ContextMenuState = {
  selection: Selection;
  x: number;
  y: number;
};

export function GitPanel({ sessionId, worktreePath, onHide }: Props) {
  const [status, setStatus] = useState<GitWorktreeStatus>(EMPTY_STATUS);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<Group, boolean>>({
    staged: true,
    unstaged: true,
    untracked: true,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const latestStatusReq = useRef(0);
  const latestDiffReq = useRef(0);

  const navigableFiles = useMemo(
    () => buildFlatFileList(status, openSections),
    [status, openSections],
  );

  const refreshStatus = useCallback(async () => {
    const reqId = ++latestStatusReq.current;
    const result = await window.api.git.status(sessionId);
    if (reqId !== latestStatusReq.current) return;
    if (!result.ok) {
      setError(result.error);
      setStatus(EMPTY_STATUS);
      return;
    }
    setError(null);
    setStatus(result.status);
  }, [sessionId]);

  useEffect(() => {
    setStatus(EMPTY_STATUS);
    setSelection(null);
    setDiff('');
    setDiffError(null);
    setError(null);
    void refreshStatus();
  }, [sessionId, refreshStatus]);

  useEffect(() => {
    const interval = setInterval(refreshStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    if (!selection) {
      setDiff('');
      setDiffError(null);
      return;
    }
    const exists = listForGroup(status, selection.group).some(
      (f) => f.path === selection.path,
    );
    if (!exists) {
      setSelection(null);
      setDiff('');
      setDiffError(null);
    }
  }, [status, selection]);

  useEffect(() => {
    if (!selection) return;
    const reqId = ++latestDiffReq.current;
    setDiffLoading(true);
    void window.api.git
      .diff({
        sessionId,
        path: selection.path,
        oldPath: selection.oldPath,
        staged: selection.group === 'staged',
        untracked: selection.group === 'untracked',
      })
      .then((result) => {
        if (reqId !== latestDiffReq.current) return;
        setDiffLoading(false);
        if (!result.ok) {
          setDiffError(result.error);
          setDiff('');
          return;
        }
        setDiffError(null);
        setDiff(result.diff);
      });
  }, [sessionId, selection, status]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const selectFile = useCallback((sel: Selection) => {
    setSelection(sel);
    setOpenSections((s) => ({ ...s, [sel.group]: true }));
  }, []);

  const moveSelection = useCallback(
    (delta: -1 | 1) => {
      if (navigableFiles.length === 0) return;
      const idx = selection
        ? navigableFiles.findIndex(
            (f) => f.group === selection.group && f.path === selection.path,
          )
        : -1;
      const nextIdx =
        idx === -1
          ? delta === 1
            ? 0
            : navigableFiles.length - 1
          : Math.min(navigableFiles.length - 1, Math.max(0, idx + delta));
      const next = navigableFiles[nextIdx];
      if (next) selectFile(next);
    },
    [navigableFiles, selection, selectFile],
  );

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (target?.closest('.xterm')) return;
      e.preventDefault();
      moveSelection(e.key === 'ArrowUp' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, moveSelection]);

  useEffect(() => {
    if (!selection) return;
    document.querySelector('.git-file-row.active')?.scrollIntoView({ block: 'nearest' });
  }, [selection]);

  const runFileAction = useCallback(
    async (action: GitFileAction, sel: Selection) => {
      setContextMenu(null);
      setActionBusy(true);
      setError(null);
      const prevIndex = navigableFiles.findIndex(
        (f) => f.group === sel.group && f.path === sel.path,
      );
      try {
        const result = await window.api.git.fileAction({
          sessionId,
          path: sel.path,
          oldPath: sel.oldPath,
          group: sel.group,
          action,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const reqId = ++latestStatusReq.current;
        const statusResult = await window.api.git.status(sessionId);
        if (reqId !== latestStatusReq.current) return;
        if (!statusResult.ok) {
          setError(statusResult.error);
          setStatus(EMPTY_STATUS);
          setSelection(null);
          return;
        }
        setStatus(statusResult.status);
        const nextList = buildFlatFileList(statusResult.status, openSections);
        if (action === 'stage') {
          const file = statusResult.status.staged.find((f) => f.path === sel.path);
          setSelection(
            file
              ? { path: file.path, oldPath: file.oldPath, group: 'staged' }
              : nextList[prevIndex] ?? nextList[0] ?? null,
          );
        } else if (action === 'unstage') {
          const file = statusResult.status.unstaged.find((f) => f.path === sel.path);
          setSelection(
            file
              ? { path: file.path, oldPath: file.oldPath, group: 'unstaged' }
              : nextList[prevIndex] ?? nextList[0] ?? null,
          );
        } else {
          const neighbor =
            nextList[prevIndex] ?? nextList[prevIndex - 1] ?? nextList[0] ?? null;
          setSelection(neighbor);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setActionBusy(false);
      }
    },
    [sessionId, navigableFiles, openSections],
  );

  const openInTerminal = useCallback(() => {
    void window.api.openInTerminal(worktreePath).catch(() => {
      // Terminal.app missing or AppleScript denied — best-effort; no modal for now
    });
  }, [worktreePath]);

  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;

  return (
    <section className="git-dock-panel bottom-dock-panel">
      <div className="bottom-dock-panel-header">
        <div className="bottom-dock-panel-title">Git</div>
        <div className="bottom-dock-panel-header-actions">
          <button
            className="icon-btn"
            onClick={onHide}
            title="Hide Git panel"
            aria-label="Hide Git panel"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      <div className="dev-panel-toolbar">
        <button
          className="btn btn-ghost btn-small"
          onClick={openInTerminal}
          title={`Open ${worktreePath} in Terminal`}
        >
          <TerminalAppIcon />
          <span>Open In Terminal</span>
        </button>
      </div>

      <div className="dev-panel-body">
        {error && <div className="git-panel-error">{error}</div>}
        <div className="git-panel-files">
          <FileGroup
            label="Staged"
            group="staged"
            files={status.staged}
            open={openSections.staged}
            onToggle={() => setOpenSections((s) => ({ ...s, staged: !s.staged }))}
            selection={selection}
            disabled={actionBusy}
            onSelect={selectFile}
            onContextMenu={(sel, e) => {
              e.preventDefault();
              e.stopPropagation();
              selectFile(sel);
              setContextMenu({ selection: sel, x: e.clientX, y: e.clientY });
            }}
          />
          <FileGroup
            label="Unstaged"
            group="unstaged"
            files={status.unstaged}
            open={openSections.unstaged}
            onToggle={() => setOpenSections((s) => ({ ...s, unstaged: !s.unstaged }))}
            selection={selection}
            disabled={actionBusy}
            onSelect={selectFile}
            onContextMenu={(sel, e) => {
              e.preventDefault();
              e.stopPropagation();
              selectFile(sel);
              setContextMenu({ selection: sel, x: e.clientX, y: e.clientY });
            }}
          />
          <FileGroup
            label="Untracked"
            group="untracked"
            files={status.untracked}
            open={openSections.untracked}
            onToggle={() => setOpenSections((s) => ({ ...s, untracked: !s.untracked }))}
            selection={selection}
            disabled={actionBusy}
            onSelect={selectFile}
            onContextMenu={(sel, e) => {
              e.preventDefault();
              e.stopPropagation();
              selectFile(sel);
              setContextMenu({ selection: sel, x: e.clientX, y: e.clientY });
            }}
          />
          {totalChanges === 0 && !error && (
            <div className="git-panel-empty">Working tree clean</div>
          )}
        </div>
        <div className="git-panel-diff">
          {selection ? (
            <DiffView diff={diff} error={diffError} loading={diffLoading} selection={selection} />
          ) : (
            <div className="git-panel-diff-empty">
              {totalChanges === 0 ? 'No changes to show.' : 'Select a file to view its diff.'}
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <GitFileContextMenu
          selection={contextMenu.selection}
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={(action) => void runFileAction(action, contextMenu.selection)}
        />
      )}
    </section>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function GitFileContextMenu({
  selection,
  x,
  y,
  onAction,
}: {
  selection: Selection;
  x: number;
  y: number;
  onAction: (action: GitFileAction) => void;
}) {
  const items: { action: GitFileAction; label: string; danger?: boolean }[] = [];
  if (selection.group === 'staged') {
    items.push({ action: 'unstage', label: 'Unstage' });
    items.push({ action: 'discard', label: 'Discard Changes', danger: true });
  } else if (selection.group === 'unstaged') {
    items.push({ action: 'stage', label: 'Stage' });
    items.push({ action: 'discard', label: 'Discard Changes', danger: true });
  } else {
    items.push({ action: 'stage', label: 'Stage' });
    items.push({ action: 'discard', label: 'Delete Untracked File', danger: true });
  }

  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          className={`context-menu-item${item.danger ? ' context-menu-item--danger' : ''}`}
          onClick={() => onAction(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function FileGroup({
  label,
  group,
  files,
  open,
  onToggle,
  selection,
  disabled,
  onSelect,
  onContextMenu,
}: {
  label: string;
  group: Group;
  files: GitFileChange[];
  open: boolean;
  onToggle: () => void;
  selection: Selection | null;
  disabled: boolean;
  onSelect: (s: Selection) => void;
  onContextMenu: (s: Selection, e: React.MouseEvent) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="git-file-group">
      <button className="git-file-group-header" onClick={onToggle}>
        <span className={`git-disclosure${open ? ' open' : ''}`}>
          <ChevronRightIcon />
        </span>
        <span className="git-file-group-label">{label}</span>
        <span className="git-file-group-count">{files.length}</span>
      </button>
      {open && (
        <ul className="git-file-list">
          {files.map((f) => {
            const active =
              selection !== null &&
              selection.group === group &&
              selection.path === f.path;
            return (
              <li
                key={`${group}-${f.path}`}
                className={`git-file-row${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                onClick={() => {
                  if (disabled) return;
                  onSelect({ path: f.path, oldPath: f.oldPath, group });
                }}
                onContextMenu={(e) => {
                  if (disabled) return;
                  onContextMenu({ path: f.path, oldPath: f.oldPath, group }, e);
                }}
                title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
              >
                <span className={`git-file-kind ${f.kind}`}>{kindLetter(f.kind)}</span>
                <span className="git-file-path">
                  <span className="git-file-name">{basename(f.path)}</span>
                  <span className="git-file-dir">{dirname(f.path)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DiffView({
  diff,
  error,
  loading,
  selection,
}: {
  diff: string;
  error: string | null;
  loading: boolean;
  selection: Selection;
}) {
  const lines = useMemo(() => parseDiffLines(diff), [diff]);

  if (error) {
    return <div className="git-panel-error">{error}</div>;
  }
  if (loading && diff === '') {
    return <div className="git-panel-diff-empty">Loading diff…</div>;
  }
  if (lines.length === 0) {
    return (
      <div className="git-panel-diff-empty">
        No textual diff available for {selection.path}.
      </div>
    );
  }

  return (
    <div className="diff-view">
      {lines.map((line, idx) => (
        <div key={idx} className={`diff-line ${line.type}`}>
          <span className="diff-line-text">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

type DiffLineType = 'meta' | 'hunk' | 'add' | 'del' | 'ctx';

function parseDiffLines(diff: string): { type: DiffLineType; text: string }[] {
  if (!diff) return [];
  const out: { type: DiffLineType; text: string }[] = [];
  for (const raw of diff.split('\n')) {
    if (raw === '' && out.length === 0) continue;
    let type: DiffLineType = 'ctx';
    if (raw.startsWith('@@')) type = 'hunk';
    else if (
      raw.startsWith('diff ') ||
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('new file mode') ||
      raw.startsWith('deleted file mode') ||
      raw.startsWith('rename from') ||
      raw.startsWith('rename to') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('Binary files')
    ) {
      type = 'meta';
    } else if (raw.startsWith('+')) type = 'add';
    else if (raw.startsWith('-')) type = 'del';
    out.push({ type, text: raw });
  }
  return out;
}

function listForGroup(status: GitWorktreeStatus, group: Group): GitFileChange[] {
  if (group === 'staged') return status.staged;
  if (group === 'unstaged') return status.unstaged;
  return status.untracked;
}

function buildFlatFileList(
  status: GitWorktreeStatus,
  openSections: Record<Group, boolean>,
): Selection[] {
  const out: Selection[] = [];
  for (const group of GROUP_ORDER) {
    if (!openSections[group]) continue;
    for (const f of listForGroup(status, group)) {
      out.push({ path: f.path, oldPath: f.oldPath, group });
    }
  }
  return out;
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function kindLetter(kind: GitFileChangeKind): string {
  switch (kind) {
    case 'modified': return 'M';
    case 'added': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    case 'untracked': return 'U';
    case 'typechange': return 'T';
    case 'unmerged': return '!';
  }
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TerminalAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 8h6M7 12h10" />
      <polyline points="9 16 7 14 9 12" />
    </svg>
  );
}

