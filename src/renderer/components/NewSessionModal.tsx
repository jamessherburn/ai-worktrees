import { useEffect, useRef, useState } from 'react';
import type { CreateSessionResult, RepoInfo, SessionLabel } from '@shared/types';
import { AGENTS, DEFAULT_AGENT_ID, type AgentAvailability, type AgentId } from '@shared/agents';
import { toggleTaskLabelIds } from '@shared/tasks';
import { SessionLabelChips } from './SessionLabelChips';

type Props = {
  sessionLabels: SessionLabel[];
  onClose: () => void;
  onCreated: (result: Extract<CreateSessionResult, { ok: true }>) => void;
};

type ScopeKind = 'repo' | 'global';

const STEPS = [
  { id: 'scope', label: 'Type' },
  { id: 'agent', label: 'Agent' },
  { id: 'details', label: 'Details' },
] as const;

export function NewSessionModal({ sessionLabels, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [availability, setAvailability] = useState<AgentAvailability | null>(null);
  const [scope, setScope] = useState<ScopeKind>('repo');
  const [agentId, setAgentId] = useState<AgentId>(DEFAULT_AGENT_ID);
  const [repoPath, setRepoPath] = useState('');
  const [name, setName] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeDir, setCodeDir] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.api.getSettings().then((s) => setCodeDir(s.codeDir));
  }, []);

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
    if (step === 2) nameInputRef.current?.focus();
  }, [step]);

  const isGlobalSession = scope === 'global';
  const selectedAvailable = availability ? availability[agentId] : true;
  const anyAvailable = availability ? AGENTS.some((a) => availability[a.id]) : true;

  const selectedLabels = sessionLabels.filter((l) => labelIds.includes(l.id));

  const canAdvanceFromScope =
    scope === 'global' || (repos !== null && repos.length > 0 && repoPath.length > 0);
  const canAdvanceFromAgent = selectedAvailable;
  const canSubmit = name.trim().length > 0 && !busy && canAdvanceFromAgent;

  const canGoNext =
    step === 0 ? canAdvanceFromScope : step === 1 ? canAdvanceFromAgent : canSubmit;

  const createSession = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.createSession({
        ...(isGlobalSession ? { global: true } : { repoPath }),
        name: name.trim(),
        agentId,
        labelIds: labelIds.length ? labelIds : undefined,
      });
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

  const goNext = () => {
    if (step < STEPS.length - 1 && canGoNext) {
      setError(null);
      setStep((s) => s + 1);
    } else if (step === STEPS.length - 1) {
      void createSession();
    }
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canGoNext && step < STEPS.length - 1) {
      e.preventDefault();
      goNext();
    }
    if (e.key === 'Enter' && step === STEPS.length - 1 && canSubmit) {
      e.preventDefault();
      void createSession();
    }
  };

  const onNameChange = (raw: string) => {
    setName(raw.replace(/\s+/g, '-'));
  };

  const toggleLabel = (id: string) => {
    setLabelIds((prev) => toggleTaskLabelIds(prev, id));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide new-session-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-labelledby="new-session-title"
        aria-modal="true"
      >
        <div className="modal-header new-session-header">
          <div className="modal-title" id="new-session-title">
            New Session
          </div>
          <div className="modal-subtitle">Step {step + 1} of {STEPS.length} — {STEPS[step].label}</div>
          <ol className="new-session-steps" aria-label="Progress">
            {STEPS.map((s, index) => (
              <li
                key={s.id}
                className={`new-session-step${index === step ? ' active' : ''}${index < step ? ' done' : ''}`}
              >
                <span className="new-session-step-index">{index + 1}</span>
                <span className="new-session-step-label">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="modal-body new-session-body">
          {step === 0 && (
            <div className="new-session-panel">
              <p className="new-session-intro muted">
                Choose where this session runs. Repository sessions get an isolated git worktree;
                global sessions run directly in your code directory.
              </p>
              <div className="new-session-scope-grid">
                <button
                  type="button"
                  className={`new-session-scope-card${scope === 'repo' ? ' selected' : ''}`}
                  onClick={() => setScope('repo')}
                >
                  <span className="new-session-scope-icon" aria-hidden>
                    ⎇
                  </span>
                  <span className="new-session-scope-title">Repository</span>
                  <span className="new-session-scope-desc">
                    New worktree branched from origin/main in a selected repo.
                  </span>
                </button>
                <button
                  type="button"
                  className={`new-session-scope-card${scope === 'global' ? ' selected' : ''}`}
                  onClick={() => setScope('global')}
                >
                  <span className="new-session-scope-icon" aria-hidden>
                    ◉
                  </span>
                  <span className="new-session-scope-title">Global</span>
                  <span className="new-session-scope-desc">
                    Run at your code directory — no worktree or branch is created.
                  </span>
                </button>
              </div>
              {scope === 'repo' ? (
                <div className="field new-session-repo-field">
                  <label className="field-label" htmlFor="new-session-repo">
                    Repository
                  </label>
                  {repos === null ? (
                    <div className="muted">Scanning repos…</div>
                  ) : repos.length === 0 ? (
                    <div className="modal-warn">
                      No git repos found in your code directory. Update the code directory in Settings.
                    </div>
                  ) : (
                    <select
                      id="new-session-repo"
                      value={repoPath}
                      onChange={(e) => setRepoPath(e.target.value)}
                    >
                      {repos.map((r) => (
                        <option key={r.path} value={r.path}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="new-session-code-dir muted">
                  Code directory
                  {codeDir ? `: ${codeDir}` : ' — set in Settings'}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="new-session-panel">
              <p className="new-session-intro muted">
                Pick the AI agent CLI for this session. Only installed agents can be selected.
              </p>
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
          )}

          {step === 2 && (
            <div className="new-session-panel">
              <p className="new-session-intro muted">
                Name your session and optionally tag it with labels so it stands out in the sidebar.
              </p>
              <div className="field">
                <label className="field-label" htmlFor="new-session-name">
                  Session name
                </label>
                <input
                  id="new-session-name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="e.g. feature-auth"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="muted new-session-name-hint">
                  {isGlobalSession
                    ? 'Letters, numbers, dot, underscore, slash, dash. Spaces become dashes.'
                    : 'Also used as the branch name. Spaces become dashes as you type.'}
                </div>
              </div>
              {sessionLabels.length > 0 && (
                <div className="field">
                  <span className="field-label">Labels</span>
                  <div className="new-session-label-grid">
                    {sessionLabels.map((label) => {
                      const checked = labelIds.includes(label.id);
                      return (
                        <button
                          key={label.id}
                          type="button"
                          className={`new-session-label-option${checked ? ' active' : ''}`}
                          style={{ ['--label-color' as string]: label.color }}
                          onClick={() => toggleLabel(label.id)}
                        >
                          <span className="new-session-label-check" aria-hidden>
                            {checked ? '✓' : ''}
                          </span>
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                  {selectedLabels.length > 0 && (
                    <div className="new-session-label-preview">
                      <SessionLabelChips labels={selectedLabels} compact />
                    </div>
                  )}
                </div>
              )}
              <div className="new-session-summary">
                <div className="new-session-summary-row">
                  <span className="new-session-summary-key">Type</span>
                  <span>{isGlobalSession ? 'Global' : 'Repository worktree'}</span>
                </div>
                {!isGlobalSession && repoPath && (
                  <div className="new-session-summary-row">
                    <span className="new-session-summary-key">Repo</span>
                    <span>{repos?.find((r) => r.path === repoPath)?.name ?? repoPath}</span>
                  </div>
                )}
                <div className="new-session-summary-row">
                  <span className="new-session-summary-key">Agent</span>
                  <span>{AGENTS.find((a) => a.id === agentId)?.name ?? agentId}</span>
                </div>
              </div>
            </div>
          )}

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer new-session-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <div className="new-session-footer-actions">
            {step > 0 && (
              <button className="btn btn-ghost" onClick={goBack} disabled={busy}>
                Back
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() => (step < STEPS.length - 1 ? goNext() : void createSession())}
              disabled={!canGoNext}
            >
              {busy ? 'Creating…' : step < STEPS.length - 1 ? 'Continue' : 'Create Session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
