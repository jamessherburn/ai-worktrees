import { useState } from 'react';
import type { SessionWithStatus } from '@shared/types';
import { isCodeSession } from '@shared/code-sessions';

type Props = {
  session: SessionWithStatus;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

export function DeleteConfirmModal({ session, onClose, onDeleted }: Props) {
  const codeSession = isCodeSession(session);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.deleteSession({
        id: session.id,
        force,
        deleteBranch: codeSession ? false : deleteBranch,
      });
      if (result.ok) {
        onDeleted(session.id);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Delete session "{session.name}"?</div>
          <div className="modal-subtitle">
            {codeSession ? (
              <>
                This will remove the session folder at{' '}
                <span className="kbd">{session.worktreePath}</span> and clear saved agent
                conversations (Claude, Cursor, Codex, etc.) for this path. Git work in other repos
                is not affected.
              </>
            ) : (
              <>
                This will remove the worktree at <span className="kbd">{session.worktreePath}</span>{' '}
                and clear saved agent conversations (Claude, Cursor, Codex, etc.) for this path.
              </>
            )}
          </div>
        </div>
        <div className="modal-body">
          {!codeSession && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={deleteBranch}
                onChange={(e) => setDeleteBranch(e.target.checked)}
              />
              Also delete branch <span className="kbd">{session.branchName}</span>
            </label>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Force remove (discard uncommitted changes{codeSession ? ' in the session folder' : ''})
          </label>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
