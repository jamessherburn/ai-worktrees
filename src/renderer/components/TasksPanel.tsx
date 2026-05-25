import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskItem, TasksConfig } from '@shared/types';
import { visibleSectionIds } from '@shared/tasks';

type Props = {
  tasksConfig: TasksConfig;
  onHide: () => void;
};

type Tab = 'board' | 'history';

export function TasksPanel({ tasksConfig, onHide }: Props) {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [tab, setTab] = useState<Tab>('board');
  const [error, setError] = useState<string | null>(null);
  const [historyDate, setHistoryDate] = useState<string>(() => isoLocalDate(addDays(new Date(), -1)));
  const [clearCutoff, setClearCutoff] = useState<string>(() => isoLocalDate(addDays(new Date(), -7)));
  const [busy, setBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const visibleIds = useMemo(() => new Set(visibleSectionIds(tasksConfig)), [tasksConfig]);
  const configuredIds = useMemo(
    () => new Set(tasksConfig.sections.map((s) => s.id)),
    [tasksConfig.sections],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.tasks.list();
      setItems(list);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const itemsBySection = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const id of visibleIds) map.set(id, []);
    for (const item of items) {
      if (!visibleIds.has(item.sectionId) || !configuredIds.has(item.sectionId)) continue;
      const list = map.get(item.sectionId) ?? [];
      list.push(item);
      map.set(item.sectionId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [items, visibleIds, configuredIds]);

  const historyItems = useMemo(() => {
    const sectionId = tasksConfig.whatDidIDoSectionId;
    return items
      .filter(
        (i) =>
          i.sectionId === sectionId &&
          i.doneAt &&
          isoLocalDate(new Date(i.doneAt)) === historyDate,
      )
      .sort((a, b) => (a.doneAt ?? '').localeCompare(b.doneAt ?? ''));
  }, [items, historyDate, tasksConfig.whatDidIDoSectionId]);

  const visibleSections = useMemo(
    () => tasksConfig.sections.filter((s) => !s.hidden),
    [tasksConfig.sections],
  );

  const addCard = async (sectionId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await window.api.tasks.add(trimmed, sectionId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateCard = async (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await window.api.tasks.update(id, trimmed);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const moveCard = async (id: string, sectionId: string) => {
    setError(null);
    try {
      await window.api.tasks.move(id, sectionId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeCard = async (id: string) => {
    setError(null);
    try {
      await window.api.tasks.remove(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const clearBefore = async () => {
    if (!clearCutoff) return;
    const label = formatHumanDate(clearCutoff);
    const confirmed = window.confirm(
      `Permanently delete all completed cards from What Did I Do on or before ${label}?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const cutoffISO = endOfLocalDayISO(clearCutoff);
      const removed = await window.api.tasks.clearDoneBefore(cutoffISO);
      await refresh();
      window.alert(removed === 1 ? '1 card cleared.' : `${removed} cards cleared.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const whatDidIDoSectionName =
    tasksConfig.sections.find((s) => s.id === tasksConfig.whatDidIDoSectionId)?.name ?? 'Done';

  return (
    <section className="tasks-panel bottom-dock-panel">
      <div className="bottom-dock-panel-header">
        <div className="bottom-dock-panel-title">Tasks</div>
        <div className="tasks-panel-tabs">
          <button
            type="button"
            className={`tasks-panel-tab${tab === 'board' ? ' active' : ''}`}
            onClick={() => setTab('board')}
          >
            Board
          </button>
          <button
            type="button"
            className={`tasks-panel-tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => setTab('history')}
          >
            What Did I Do
          </button>
        </div>
        <div className="bottom-dock-panel-header-actions">
          <button
            className="icon-btn"
            onClick={onHide}
            title="Hide Tasks panel"
            aria-label="Hide Tasks panel"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      <div className="tasks-panel-body">
        {error && <div className="tasks-panel-error">{error}</div>}

        {tab === 'board' && (
          <div className="tasks-board">
            {visibleSections.map((section) => (
              <KanbanColumn
                key={section.id}
                sectionId={section.id}
                title={section.name}
                items={itemsBySection.get(section.id) ?? []}
                busy={busy}
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onDrop={(id) => {
                  setDraggingId(null);
                  void moveCard(id, section.id);
                }}
                onAdd={(text) => addCard(section.id, text)}
                onUpdate={updateCard}
                onRemove={removeCard}
              />
            ))}
            {visibleSections.length === 0 && (
              <div className="tasks-board-empty">
                No sections visible. Open Settings to show task columns.
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="tasks-history">
            <div className="tasks-history-controls">
              <input
                className="tasks-date"
                type="date"
                value={historyDate}
                max={isoLocalDate(new Date())}
                onChange={(e) => setHistoryDate(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setHistoryDate(isoLocalDate(addDays(new Date(), -1)))}
              >
                Yesterday
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setHistoryDate(isoLocalDate(new Date()))}
              >
                Today
              </button>
            </div>
            <div className="tasks-history-label">
              From <strong>{whatDidIDoSectionName}</strong> on {formatHumanDate(historyDate)}
            </div>
            {historyItems.length === 0 ? (
              <div className="tasks-history-empty">No cards completed on this day.</div>
            ) : (
              <ul className="tasks-history-list">
                {historyItems.map((item) => (
                  <li key={item.id} className="tasks-history-row">
                    <span className="tasks-history-text">{item.text}</span>
                    <span className="tasks-history-time">{formatTime(item.doneAt!)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="tasks-history-divider" />

            <div className="tasks-clear">
              <div className="field-label">Clear Data</div>
              <div className="tasks-clear-row">
                <span className="muted">Delete completed cards on or before</span>
                <input
                  className="tasks-date"
                  type="date"
                  value={clearCutoff}
                  max={isoLocalDate(new Date())}
                  onChange={(e) => setClearCutoff(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={clearBefore}
                  disabled={busy || !clearCutoff}
                >
                  Clear Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function KanbanColumn({
  title,
  items,
  busy,
  draggingId,
  onDragStart,
  onDragEnd,
  onDrop,
  onAdd,
  onUpdate,
  onRemove,
}: {
  sectionId: string;
  title: string;
  items: TaskItem[];
  busy: boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/task-id');
    if (id) onDrop(id);
  };

  return (
    <div
      className="tasks-column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="tasks-column-header">
        <span className="tasks-column-title">{title}</span>
        <span className="tasks-column-count">{items.length}</span>
      </div>
      <div className="tasks-column-cards">
        {items.map((item) => (
          <TaskCard
            key={item.id}
            item={item}
            dragging={draggingId === item.id}
            onDragStart={() => onDragStart(item.id)}
            onDragEnd={onDragEnd}
            onUpdate={(text) => onUpdate(item.id, text)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>
      <div className="tasks-column-add">
        <textarea
          className="tasks-card-input"
          rows={2}
          placeholder="Add a card…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const text = draft;
              setDraft('');
              onAdd(text);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={busy || !draft.trim()}
          onClick={() => {
            const text = draft;
            setDraft('');
            onAdd(text);
          }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function TaskCard({
  item,
  dragging,
  onDragStart,
  onDragEnd,
  onUpdate,
  onRemove,
}: {
  item: TaskItem;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUpdate: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setText(item.text);
  }, [item.text, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (text.trim() !== item.text) onUpdate(text);
  };

  return (
    <article
      className={`task-card${dragging ? ' dragging' : ''}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', item.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="task-card-edit"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setText(item.text);
              setEditing(false);
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
          }}
        />
      ) : (
        <button type="button" className="task-card-body" onClick={() => setEditing(true)}>
          {item.text}
        </button>
      )}
      <button
        type="button"
        className="task-card-delete"
        onClick={onRemove}
        title="Delete card"
        aria-label="Delete card"
      >
        ×
      </button>
    </article>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function endOfLocalDayISO(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return end.toISOString();
}

function formatHumanDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
