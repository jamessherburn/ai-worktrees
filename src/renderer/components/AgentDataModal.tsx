import { useEffect, useRef, useState } from 'react';
import {
  AGENTS,
  displayInstructionsPath,
  type AgentAvailability,
  type AgentDefinition,
  type AgentId,
} from '@shared/agents';
import type { AgentBillingMode, AgentSpendInfo } from '@shared/types';

type Props = {
  onClose: () => void;
};

type SpendMap = Partial<Record<AgentId, AgentSpendInfo>>;

export function AgentDataModal({ onClose }: Props) {
  const [availability, setAvailability] = useState<AgentAvailability | null>(null);
  const [spend, setSpend] = useState<SpendMap>({});
  const [editingAgent, setEditingAgent] = useState<AgentId | null>(null);

  useEffect(() => {
    void window.api.detectAgents().then(setAvailability);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      AGENTS.map(async (a) => [a.id, await window.api.getAgentSpend(a.id)] as const),
    ).then((entries) => {
      if (cancelled) return;
      const next: SpendMap = {};
      for (const [id, info] of entries) next[id] = info;
      setSpend(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingAgent) setEditingAgent(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingAgent, onClose]);

  if (editingAgent) {
    return (
      <EditAgentInstructionsView
        agentId={editingAgent}
        onBack={() => setEditingAgent(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Agent Data</div>
          <div className="modal-subtitle">
            Spend and global instructions per agent. Greyed-out rows are not installed.
          </div>
        </div>
        <div className="modal-body">
          <div className="agent-data-list">
            {AGENTS.map((a) => {
              const known = availability !== null;
              const installed = known ? availability[a.id] : true;
              const info = spend[a.id];
              return (
                <AgentDataRow
                  key={a.id}
                  agent={a}
                  installed={installed}
                  spend={info}
                  onEdit={() => setEditingAgent(a.id)}
                />
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentDataRow({
  agent,
  installed,
  spend,
  onEdit,
}: {
  agent: AgentDefinition;
  installed: boolean;
  spend: AgentSpendInfo | undefined;
  onEdit: () => void;
}) {
  return (
    <div className={`agent-data-row${installed ? '' : ' disabled'}`}>
      <div className="agent-data-row-head">
        <span
          className={`agent-dot ${installed ? 'available' : 'unavailable'}`}
          title={installed ? 'Installed' : 'Not installed'}
        />
        <div className="agent-data-row-name">
          <div className="agent-name">{agent.name}</div>
          <div className="agent-desc">{agent.description}</div>
        </div>
        <button
          className="btn btn-ghost btn-small"
          onClick={onEdit}
          disabled={!installed}
          title={installed ? `Edit ${agent.instructions.filename}` : 'Agent not installed'}
        >
          Edit {agent.instructions.filename}
        </button>
      </div>
      <div className="agent-data-row-meta">
        <div className="agent-data-spend">{renderSpend(spend)}</div>
        <div className="agent-data-path">{displayInstructionsPath(agent)}</div>
      </div>
    </div>
  );
}

function renderSpend(info: AgentSpendInfo | undefined): React.ReactNode {
  if (!info) return <span className="muted">Loading…</span>;
  if (info.kind === 'error') return <span className="usage-error">Error: {info.message}</span>;
  return (
    <span className="agent-spend-line">
      <BillingChip billing={info.billing} />
      <span className="agent-spend-note">{info.note}</span>
      {info.kind === 'cost' && (info.cost > 0 || info.tokens > 0) && (
        <span className="agent-spend-cost">
          · <span className="usage-cost">{formatCost(info.cost)}</span>{' '}
          <span className="usage-tokens">{formatTokens(info.tokens)} tokens today</span>
        </span>
      )}
      {info.kind === 'cost' && info.cost === 0 && info.tokens === 0 && (
        <span className="agent-spend-cost muted">· No usage today</span>
      )}
    </span>
  );
}

function BillingChip({ billing }: { billing: AgentBillingMode }) {
  return (
    <span className={`billing-chip billing-${billing}`} title={describeBilling(billing)}>
      {labelBilling(billing)}
    </span>
  );
}

function labelBilling(b: AgentBillingMode): string {
  switch (b) {
    case 'metered':
      return 'Metered';
    case 'subscription':
      return 'Subscription';
    case 'free':
      return 'Free tier';
    case 'unknown':
      return 'Unknown';
  }
}

function describeBilling(b: AgentBillingMode): string {
  switch (b) {
    case 'metered':
      return 'You are charged per token of usage';
    case 'subscription':
      return 'Flat subscription fee — no per-use charge';
    case 'free':
      return 'Free tier usage allowance — no charge';
    case 'unknown':
      return 'Billing mode could not be determined';
  }
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '$0.00';
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function EditAgentInstructionsView({
  agentId,
  onBack,
  onClose,
}: {
  agentId: AgentId;
  onBack: () => void;
  onClose: () => void;
}) {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const text = await window.api.readAgentInstructions(agentId);
        setContent(text);
        setOriginal(text);
      } catch (err) {
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  useEffect(() => {
    if (!loading && !loadError) textareaRef.current?.focus();
  }, [loading, loadError]);

  const dirty = content !== original;

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      await window.api.writeAgentInstructions(agentId, content);
      onBack();
    } catch (err) {
      setSaveError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Edit {agent.instructions.filename}</div>
          <div className="modal-subtitle">
            Global instructions at <span className="kbd">{displayInstructionsPath(agent)}</span> for {agent.name}
          </div>
        </div>
        <div className="modal-body">
          {loading && <div className="muted">Loading…</div>}
          {loadError && <div className="modal-error">Failed to load: {loadError}</div>}
          {!loading && !loadError && (
            <>
              <textarea
                ref={textareaRef}
                className="claudemd-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                placeholder={`# Your global instructions for ${agent.name}…`}
              />
              {saveError && <div className="modal-error">{saveError}</div>}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={busy || loading || !!loadError || !dirty}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
