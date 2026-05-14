import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GitFileChange,
  GitFileChangeKind,
  GitWorktreeStatus,
} from '@shared/types';

type Props = {
  sessionId: string;
  worktreePath: string;
  width: number;
  minWidth: number;
  getMaxWidth: () => number;
  fullscreen: boolean;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onHide: () => void;
  onToggleFullscreen: () => void;
  onVSCodeNotInstalled: () => void;
};

type Group = 'staged' | 'unstaged' | 'untracked';

type Selection = {
  path: string;
  oldPath?: string;
  group: Group;
};

const POLL_INTERVAL_MS = 3000;

const EMPTY_STATUS: GitWorktreeStatus = { staged: [], unstaged: [], untracked: [] };

export function DeveloperPanel({
  sessionId,
  worktreePath,
  width,
  minWidth,
  getMaxWidth,
  fullscreen,
  onResize,
  onResizeEnd,
  onHide,
  onToggleFullscreen,
  onVSCodeNotInstalled,
}: Props) {
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

  const latestStatusReq = useRef(0);
  const latestDiffReq = useRef(0);

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

  const openInVSCode = useCallback(async () => {
    const result = await window.api.openInVSCode(worktreePath);
    if (!result.ok && result.reason === 'not-installed') {
      onVSCodeNotInstalled();
    }
  }, [worktreePath, onVSCodeNotInstalled]);

  const openInTerminal = useCallback(() => {
    void window.api.openInTerminal(worktreePath).catch(() => {
      // Terminal.app missing or AppleScript denied — best-effort; no modal for now
    });
  }, [worktreePath]);

  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;

  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (fullscreen) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.classList.add('resizing-git-panel');

    const clamp = (raw: number) => Math.min(getMaxWidth(), Math.max(minWidth, raw));

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      onResize(clamp(startWidth + delta));
    };

    const onUp = (ev: MouseEvent) => {
      document.body.classList.remove('resizing-git-panel');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const delta = startX - ev.clientX;
      onResizeEnd(clamp(startWidth + delta));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <aside className="git-panel">
      <div
        className="git-panel-resize"
        onMouseDown={onResizeMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Developer Panel"
      />
      <div className="git-panel-header">
        <div className="git-panel-title">Developer Panel</div>
        <div className="git-panel-header-actions">
          <button
            className="icon-btn git-panel-collapse-btn"
            onClick={onToggleFullscreen}
            title={fullscreen ? 'Shrink Developer Panel' : 'Fullscreen Developer Panel'}
            aria-label={fullscreen ? 'Shrink Developer Panel' : 'Fullscreen Developer Panel'}
            aria-pressed={fullscreen}
          >
            {fullscreen ? <ContractIcon /> : <ExpandIcon />}
          </button>
          <button
            className="icon-btn git-panel-collapse-btn"
            onClick={onHide}
            title="Hide Developer Panel"
            aria-label="Hide Developer Panel"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className="dev-panel-toolbar">
        <button
          className="btn btn-ghost btn-small"
          onClick={openInVSCode}
          title={`Open ${worktreePath} in Visual Studio Code`}
        >
          <VSCodeIcon />
          <span>Open In Visual Studio Code</span>
        </button>
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
            onSelect={setSelection}
          />
          <FileGroup
            label="Unstaged"
            group="unstaged"
            files={status.unstaged}
            open={openSections.unstaged}
            onToggle={() => setOpenSections((s) => ({ ...s, unstaged: !s.unstaged }))}
            selection={selection}
            onSelect={setSelection}
          />
          <FileGroup
            label="Untracked"
            group="untracked"
            files={status.untracked}
            open={openSections.untracked}
            onToggle={() => setOpenSections((s) => ({ ...s, untracked: !s.untracked }))}
            selection={selection}
            onSelect={setSelection}
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
    </aside>
  );
}

function FileGroup({
  label,
  group,
  files,
  open,
  onToggle,
  selection,
  onSelect,
}: {
  label: string;
  group: Group;
  files: GitFileChange[];
  open: boolean;
  onToggle: () => void;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
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
                className={`git-file-row${active ? ' active' : ''}`}
                onClick={() =>
                  onSelect({ path: f.path, oldPath: f.oldPath, group })
                }
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

function VSCodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3 7 12l10 9V3z" />
      <line x1="7" y1="12" x2="3" y2="9" />
      <line x1="7" y1="12" x2="3" y2="15" />
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

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ContractIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}
