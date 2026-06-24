import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AGENTS, type AgentId } from '@shared/agents';
import type {
  CleanupSnapshot,
  LeftoverAgentSession,
  LeftoverBranch,
  LeftoverWorktree,
} from '@shared/types';

type Props = {
  onClose: () => void;
};

type CleanupTab = 'branches' | 'worktrees' | 'agentSessions';

const TABS: { id: CleanupTab; label: string }[] = [
  { id: 'branches', label: 'Branches' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'agentSessions', label: 'Agent Sessions' },
];

export function CleanupModal({ onClose }: Props) {
  const [tab, setTab] = useState<CleanupTab>('branches');
  const [snapshot, setSnapshot] = useState<CleanupSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await window.api.listCleanupItems();
      setSnapshot(next);
      setSelected(new Set());
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelected(new Set());
    setActionError(null);
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const branches = snapshot?.branches ?? [];
  const worktrees = snapshot?.worktrees ?? [];
  const agentSessions = snapshot?.agentSessions ?? [];

  const tabItems = useMemo(() => {
    switch (tab) {
      case 'branches':
        return branches.map((b) => b.id);
      case 'worktrees':
        return worktrees.map((w) => w.id);
      case 'agentSessions':
        return agentSessions.map((a) => a.id);
    }
  }, [tab, branches, worktrees, agentSessions]);

  const tabCount = tabItems.length;
  const selectedInTab = tabItems.filter((id) => selected.has(id)).length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectIds = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  };

  const deselectIds = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  };

  const selectAllInTab = () => selectIds(tabItems);
  const clearTabSelection = () => deselectIds(tabItems);

  const deleteIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    setActionError(null);

    const worktreeIds = tab === 'worktrees' ? ids : [];
    const branchIds = tab === 'branches' ? ids : [];
    const agentSessionIds = tab === 'agentSessions' ? ids : [];

    const result = await window.api.deleteCleanupItems({
      worktreeIds,
      branchIds,
      agentSessionIds,
      force,
    });
    if (!result.ok) {
      setActionError(result.error);
      setBusy(false);
      return;
    }
    setBusy(false);
    await refresh();
  };

  const deleteSelectedInTab = () => {
    void deleteIds(tabItems.filter((id) => selected.has(id)));
  };

  const deleteAllInTab = () => {
    void deleteIds(tabItems);
  };

  const groupedBranches = useMemo(() => groupByName(branches), [branches]);
  const groupedWorktrees = useMemo(() => groupByName(worktrees), [worktrees]);
  const groupedAgentSessions = useMemo(() => groupByName(agentSessions), [agentSessions]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-wide cleanup-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header cleanup-modal-header">
          <div className="modal-title">Cleanup</div>
          <div className="modal-subtitle">
            Remove leftover branches, worktrees, and agent session data. Items are grouped by
            repository, Global sessions, or External projects.
          </div>
          <div className="cleanup-modal-tabs" role="tablist" aria-label="Cleanup categories">
            {TABS.map((t) => {
              const count =
                t.id === 'branches'
                  ? branches.length
                  : t.id === 'worktrees'
                    ? worktrees.length
                    : agentSessions.length;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`cleanup-modal-tab${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  <span className="cleanup-tab-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal-body">
          {loadError && <div className="modal-error">{loadError}</div>}
          {!loadError && snapshot === null && <div className="muted">Loading…</div>}

          {!loadError && snapshot !== null && tabCount === 0 && (
            <div className="cleanup-empty muted">
              No leftover {tabLabel(tab)} found.
            </div>
          )}

          {!loadError && tab === 'branches' && branches.length > 0 && (
            <CleanupGroups
              groups={groupedBranches}
              renderGroup={(groupName, items) => (
                <CleanupGroupPanel
                  key={groupName}
                  groupName={groupName}
                  count={items.length}
                  allSelected={items.every((i) => selected.has(i.id))}
                  someSelected={items.some((i) => selected.has(i.id))}
                  onSelectAll={() => selectIds(items.map((i) => i.id))}
                  onClear={() => deselectIds(items.map((i) => i.id))}
                  onDeleteAll={() => void deleteIds(items.map((i) => i.id))}
                  busy={busy}
                >
                  {items.map((item) => (
                    <CleanupBranchRow
                      key={item.id}
                      item={item}
                      checked={selected.has(item.id)}
                      onToggle={() => toggle(item.id)}
                    />
                  ))}
                </CleanupGroupPanel>
              )}
            />
          )}

          {!loadError && tab === 'worktrees' && worktrees.length > 0 && (
            <>
              <CleanupGroups
                groups={groupedWorktrees}
                renderGroup={(groupName, items) => (
                  <CleanupGroupPanel
                    key={groupName}
                    groupName={groupName}
                    count={items.length}
                    allSelected={items.every((i) => selected.has(i.id))}
                    someSelected={items.some((i) => selected.has(i.id))}
                    onSelectAll={() => selectIds(items.map((i) => i.id))}
                    onClear={() => deselectIds(items.map((i) => i.id))}
                    onDeleteAll={() => void deleteIds(items.map((i) => i.id))}
                    busy={busy}
                  >
                    {items.map((item) => (
                      <CleanupWorktreeRow
                        key={item.id}
                        item={item}
                        checked={selected.has(item.id)}
                        onToggle={() => toggle(item.id)}
                      />
                    ))}
                  </CleanupGroupPanel>
                )}
              />
              <label className="checkbox cleanup-force">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                Force remove worktrees (discard uncommitted changes)
              </label>
            </>
          )}

          {!loadError && tab === 'agentSessions' && agentSessions.length > 0 && (
            <CleanupGroups
              groups={groupedAgentSessions}
              renderGroup={(groupName, items) => (
                <CleanupGroupPanel
                  key={groupName}
                  groupName={groupName}
                  count={items.length}
                  allSelected={items.every((i) => selected.has(i.id))}
                  someSelected={items.some((i) => selected.has(i.id))}
                  onSelectAll={() => selectIds(items.map((i) => i.id))}
                  onClear={() => deselectIds(items.map((i) => i.id))}
                  onDeleteAll={() => void deleteIds(items.map((i) => i.id))}
                  busy={busy}
                >
                  {items.map((item) => (
                    <CleanupAgentSessionRow
                      key={item.id}
                      item={item}
                      checked={selected.has(item.id)}
                      onToggle={() => toggle(item.id)}
                    />
                  ))}
                </CleanupGroupPanel>
              )}
            />
          )}

          {actionError && <div className="modal-error">{actionError}</div>}
        </div>

        <div className="modal-footer cleanup-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          {tabCount > 0 && (
            <>
              <button className="btn btn-ghost" onClick={selectAllInTab} disabled={busy}>
                Select all
              </button>
              <button
                className="btn btn-ghost"
                onClick={clearTabSelection}
                disabled={busy || selectedInTab === 0}
              >
                Clear
              </button>
              <button
                className="btn btn-danger"
                onClick={deleteAllInTab}
                disabled={busy}
                title={`Delete all ${tabCount} ${tabLabel(tab).toLowerCase()}`}
              >
                {busy ? 'Removing…' : `Delete all (${tabCount})`}
              </button>
              <button
                className="btn btn-danger"
                onClick={deleteSelectedInTab}
                disabled={busy || selectedInTab === 0}
              >
                {busy ? 'Removing…' : `Delete selected (${selectedInTab})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function tabLabel(tab: CleanupTab): string {
  switch (tab) {
    case 'branches':
      return 'branches';
    case 'worktrees':
      return 'worktrees';
    case 'agentSessions':
      return 'agent sessions';
  }
}

function CleanupGroups<T extends { groupName: string }>({
  groups,
  renderGroup,
}: {
  groups: [string, T[]][];
  renderGroup: (groupName: string, items: T[]) => ReactNode;
}) {
  return <div className="cleanup-sections">{groups.map(([name, items]) => renderGroup(name, items))}</div>;
}

function CleanupGroupPanel({
  groupName,
  count,
  allSelected,
  someSelected,
  onSelectAll,
  onClear,
  onDeleteAll,
  busy,
  children,
}: {
  groupName: string;
  count: number;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleteAll: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <section className="cleanup-group">
      <div className="cleanup-group-header">
        <label className="cleanup-group-select">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => (allSelected ? onClear() : onSelectAll())}
            disabled={busy}
          />
          <span className="cleanup-group-label">{groupName}</span>
          <span className="cleanup-group-count">{count}</span>
        </label>
        <div className="cleanup-group-actions">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={onSelectAll}
            disabled={busy || allSelected}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small cleanup-group-delete"
            onClick={onDeleteAll}
            disabled={busy}
          >
            Delete all
          </button>
        </div>
      </div>
      <ul className="cleanup-list">{children}</ul>
    </section>
  );
}

function CleanupWorktreeRow({
  item,
  checked,
  onToggle,
}: {
  item: LeftoverWorktree;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="cleanup-row">
      <label className="cleanup-row-label">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="cleanup-row-main">
          <span className="cleanup-row-title">
            <span className="cleanup-row-name">{item.branchName}</span>
            <CleanupCreatedAt createdAt={item.createdAt} />
          </span>
          <span className="cleanup-row-path">{item.worktreePath}</span>
        </span>
        {!item.registered && <span className="cleanup-badge">Unregistered</span>}
      </label>
    </li>
  );
}

function CleanupBranchRow({
  item,
  checked,
  onToggle,
}: {
  item: LeftoverBranch;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="cleanup-row">
      <label className="cleanup-row-label">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="cleanup-row-main">
          <span className="cleanup-row-title">
            <span className="cleanup-row-name">{item.branchName}</span>
            <CleanupCreatedAt createdAt={item.createdAt} />
          </span>
        </span>
      </label>
    </li>
  );
}

function CleanupAgentSessionRow({
  item,
  checked,
  onToggle,
}: {
  item: LeftoverAgentSession;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="cleanup-row">
      <label className="cleanup-row-label">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="cleanup-row-main">
          <span className="cleanup-row-title">
            <span className="cleanup-row-name">{item.displayPath}</span>
            <CleanupCreatedAt createdAt={item.createdAt} />
          </span>
          <span className="cleanup-row-path">{item.cwd}</span>
          <span className="cleanup-row-agents">
            {item.agents.map((agentId) => (
              <AgentChip key={agentId} agentId={agentId} />
            ))}
          </span>
        </span>
        <StatusBadge status={item.status} />
      </label>
    </li>
  );
}

function CleanupCreatedAt({ createdAt }: { createdAt: string }) {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms) || ms <= 0) {
    return <span className="cleanup-row-created muted">Unknown</span>;
  }
  return (
    <time className="cleanup-row-created" dateTime={createdAt} title={createdAt}>
      {formatCleanupCreatedAt(createdAt)}
    </time>
  );
}

function formatCleanupCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AgentChip({ agentId }: { agentId: AgentId }) {
  const agent = AGENTS.find((a) => a.id === agentId);
  return <span className="cleanup-agent-chip">{agent?.name ?? agentId}</span>;
}

function StatusBadge({ status }: { status: LeftoverAgentSession['status'] }) {
  switch (status) {
    case 'active':
      return <span className="cleanup-badge cleanup-badge-active">Active session</span>;
    case 'external':
      return <span className="cleanup-badge cleanup-badge-external">External</span>;
    case 'orphaned':
      return <span className="cleanup-badge">Orphaned</span>;
  }
}

function groupByName<T extends { groupName: string; createdAt: string }>(items: T[]): [string, T[]][] {
  const sorted = [...items].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const map = new Map<string, T[]>();
  for (const item of sorted) {
    const list = map.get(item.groupName) ?? [];
    list.push(item);
    map.set(item.groupName, list);
  }
  return Array.from(map.entries()).sort((a, b) => {
    const aNewest = Math.max(...a[1].map((i) => Date.parse(i.createdAt)));
    const bNewest = Math.max(...b[1].map((i) => Date.parse(i.createdAt)));
    if (bNewest !== aNewest) return bNewest - aNewest;
    return sortGroupNames(a[0], b[0]);
  });
}

function sortGroupNames(a: string, b: string): number {
  const order = (name: string) => (name === 'Global' ? 0 : name === 'External' ? 2 : 1);
  const o = order(a) - order(b);
  if (o !== 0) return o;
  return a.localeCompare(b);
}
