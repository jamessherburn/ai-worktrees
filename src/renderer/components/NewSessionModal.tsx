import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateSessionResult, RepoInfo } from '@shared/types';
import { AGENTS, DEFAULT_AGENT_ID, type AgentAvailability, type AgentId } from '@shared/agents';

type Props = {
  onClose: () => void;
  onCreated: (result: Extract<CreateSessionResult, { ok: true }>) => void;
};

export function NewSessionModal({ onClose, onCreated }: Props) {
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [availability, setAvailability] = useState<AgentAvailability | null>(null);
  const [agentId, setAgentId] = useState<AgentId>(DEFAULT_AGENT_ID);
  const [repoPath, setRepoPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.api.listRepos().then((items) => {
      setRepos(items);
      if (items[0]) setRepoPath(items[0].path);
    });
  }, []);

  useEffect(() => {
    void window.api.detectAgents().then((avail) => {
      setAvailability(avail);
      if (!avail[agentId]) {
        const firstAvailable = AGENTS.find((a) => avail[a.id]);
        if (firstAvailable) setAgentId(firstAvailable.id);
      }
    });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [repos]);

  const selectedAvailable = availability ? availability[agentId] : true;
  const anyAvailable = availability ? AGENTS.some((a) => availability[a.id]) : true;

  const canSubmit = useMemo(
    () => selectedAvailable && repoPath && name.trim().length > 0 && !busy,
    [selectedAvailable, repoPath, name, busy],
  );

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.createSession({ repoPath, name: name.trim(), agentId });
      if (result.ok) {
        onCreated(result);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="modal-header">
          <div className="modal-title">New Session</div>
          <div className="modal-subtitle">Creates a new git worktree branched off the latest origin/main.</div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">AI Agent</label>
            <div className="agent-grid">
              {AGENTS.map((a) => {
                const known = availability !== null;
                const available = known ? availability[a.id] : true;
                const isSelected = agentId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`agent-card${isSelected ? ' selected' : ''}${!available ? ' disabled' : ''}`}
                    disabled={!available}
                    onClick={() => available && setAgentId(a.id)}
                  >
                    <div className="agent-card-header">
                      <span
                        className={`agent-dot ${known ? (available ? 'available' : 'unavailable') : 'unknown'}`}
                        title={known ? (available ? 'Installed' : 'Not installed') : 'Checking…'}
                      />
                      <span className="agent-name">{a.name}</span>
                    </div>
                    <div className="agent-desc">{a.description}</div>
                    {known && !available && <div className="agent-missing">Not installed</div>}
                  </button>
                );
              })}
            </div>
            {availability !== null && !anyAvailable && (
              <div className="modal-warn">
                No supported agent CLIs were found on your PATH. Install one and try again.
              </div>
            )}
          </div>
          <div className="field">
            <label className="field-label">Repository</label>
            {repos === null ? (
              <div className="muted">Scanning repos…</div>
            ) : repos.length === 0 ? (
              <div className="modal-warn">No git repos found in your code directory. Update the code directory in Settings.</div>
            ) : (
              <select value={repoPath} onChange={(e) => setRepoPath(e.target.value)}>
                {repos.map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="field">
            <label className="field-label">Session name</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. feature-1"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="muted" style={{ fontSize: 11 }}>
              This is also the branch name. Letters, numbers, dot, underscore, slash, dash.
            </div>
          </div>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
