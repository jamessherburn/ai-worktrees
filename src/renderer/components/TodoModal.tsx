import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionLabel, TaskItem } from '@shared/types';
import {
  TASK_SECTIONS,
  TASK_SECTION_DONE,
  TASK_SECTION_DOING,
  TASK_SECTION_TODO,
  type TaskSectionId,
  normalizeTaskSectionId,
  taskMatchesFilters,
  toggleTaskLabelIds,
} from '@shared/tasks';
import { sessionLabelMap } from '@shared/session-labels';
import { SessionLabelChips } from './SessionLabelChips';
import {
  clampModalSize,
  maxExpandedModalSize,
  shouldUseExpandedModalLayout,
  type ModalSize,
} from '../modal-layout';

type Props = {
  sessionLabels: SessionLabel[];
  onClose: () => void;
};

const TODO_SIZE_KEY = 'todo-modal-size';
const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 420;
const MIN_HEIGHT = 320;

function loadModalSize(): ModalSize {
  try {
    const raw = localStorage.getItem(TODO_SIZE_KEY);
    if (!raw) return clampModalSize(DEFAULT_WIDTH, DEFAULT_HEIGHT, MIN_WIDTH, MIN_HEIGHT);
    const parsed = JSON.parse(raw) as { width?: number; height?: number };
    return clampModalSize(Number(parsed.width), Number(parsed.height), MIN_WIDTH, MIN_HEIGHT);
  } catch {
    return clampModalSize(DEFAULT_WIDTH, DEFAULT_HEIGHT, MIN_WIDTH, MIN_HEIGHT);
  }
}

function persistModalSize(size: ModalSize) {
  localStorage.setItem(TODO_SIZE_KEY, JSON.stringify(size));
}

const SECTION_CYCLE: TaskSectionId[] = [
  TASK_SECTION_TODO,
  TASK_SECTION_DOING,
  TASK_SECTION_DONE,
];

function nextSection(sectionId: string): TaskSectionId {
  const current = normalizeTaskSectionId(sectionId);
  const index = SECTION_CYCLE.indexOf(current);
  return SECTION_CYCLE[(index + 1) % SECTION_CYCLE.length];
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0';
  el.style.height = `${el.scrollHeight}px`;
}

export function TodoModal({ sessionLabels, onClose }: Props) {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [size, setSize] = useState<ModalSize>(() => loadModalSize());
  const [sizeBeforeExpand, setSizeBeforeExpand] = useState<ModalSize | null>(null);

  const labelMap = useMemo(() => sessionLabelMap(sessionLabels), [sessionLabels]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) =>
        expanded
          ? maxExpandedModalSize()
          : clampModalSize(prev.width, prev.height, MIN_WIDTH, MIN_HEIGHT),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expanded]);

  const toggleExpanded = () => {
    if (expanded) {
      const restore = sizeBeforeExpand ?? loadModalSize();
      setSize(clampModalSize(restore.width, restore.height, MIN_WIDTH, MIN_HEIGHT));
      setExpanded(false);
      setSizeBeforeExpand(null);
    } else {
      setSizeBeforeExpand(size);
      setSize(maxExpandedModalSize());
      setExpanded(true);
    }
  };

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (expanded) {
        setExpanded(false);
        setSizeBeforeExpand(null);
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const start = size;
      document.body.classList.add('resizing-todo-modal');

      const onMove = (ev: MouseEvent) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        setSize(clampModalSize(start.width + dw, start.height + dh, MIN_WIDTH, MIN_HEIGHT));
      };

      const onUp = (ev: MouseEvent) => {
        document.body.classList.remove('resizing-todo-modal');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const next = clampModalSize(start.width + dw, start.height + dh, MIN_WIDTH, MIN_HEIGHT);
        setSize(next);
        persistModalSize(next);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [expanded, size],
  );

  const filteredItems = useMemo(
    () => items.filter((item) => taskMatchesFilters(item, labelFilter, dateFilter)),
    [items, labelFilter, dateFilter],
  );

  const itemsBySection = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const section of TASK_SECTIONS) map.set(section.id, []);
    for (const item of filteredItems) {
      const bucket = map.get(item.sectionId);
      if (bucket) bucket.push(item);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [filteredItems]);

  const toggleLabelFilter = (labelId: string) => {
    setLabelFilter((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
    );
  };

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
    const current = items.find((item) => item.id === id);
    if (current?.sectionId === sectionId) return;
    setError(null);
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const enteringDone = sectionId === TASK_SECTION_DONE;
        const leavingDone = item.sectionId === TASK_SECTION_DONE && sectionId !== TASK_SECTION_DONE;
        return {
          ...item,
          sectionId,
          doneAt: enteringDone && !item.doneAt
            ? new Date().toISOString()
            : leavingDone
              ? null
              : item.doneAt,
        };
      }),
    );
    try {
      await window.api.tasks.move(id, sectionId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      await refresh();
    }
  };

  const setCardLabels = async (id: string, labelIds: string[]) => {
    setError(null);
    try {
      await window.api.tasks.setLabels(id, labelIds);
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

  const fillWindow = shouldUseExpandedModalLayout(size, expanded);

  return (
    <div
      className={`modal-backdrop${fillWindow ? ' modal-backdrop-expanded' : ''}`}
      onMouseDown={onClose}
    >
      <div
        className={`modal modal-wide todo-modal${fillWindow ? ' todo-modal-expanded resizable-modal-expanded' : ''}`}
        style={fillWindow ? undefined : { width: size.width, height: size.height }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="todo-modal-title"
        aria-modal="true"
      >
        <div className="todo-modal-header">
          <div>
            <div className="modal-title" id="todo-modal-title">
              To Do
            </div>
            <div className="modal-subtitle">Tasks across all sessions</div>
          </div>
          <div className="todo-modal-header-actions">
            <button
              type="button"
              className="btn btn-ghost btn-small todo-modal-expand"
              onClick={toggleExpanded}
              title={expanded ? 'Restore previous size' : 'Expand to fill the window'}
            >
              {expanded ? 'Restore size' : 'Expand'}
            </button>
            <button
              type="button"
              className="icon-btn todo-modal-close"
              onClick={onClose}
              title="Close"
              aria-label="Close To Do"
            >
              ×
            </button>
          </div>
        </div>

        <div className="todo-filters todo-filters--modal">
          {sessionLabels.length > 0 && (
            <div className="todo-filter-group">
              <span className="todo-filter-label">Labels</span>
              <div className="todo-filter-chips">
                {sessionLabels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    className={`todo-filter-chip${labelFilter.includes(label.id) ? ' active' : ''}`}
                    style={{ ['--label-color' as string]: label.color }}
                    onClick={() => toggleLabelFilter(label.id)}
                  >
                    {label.name}
                  </button>
                ))}
                {labelFilter.length > 0 && (
                  <button
                    type="button"
                    className="todo-filter-clear"
                    onClick={() => setLabelFilter([])}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="todo-filter-group">
            <span className="todo-filter-label">Date</span>
            <input
              className="todo-filter-date"
              type="date"
              value={dateFilter ?? ''}
              onChange={(e) => setDateFilter(e.target.value || null)}
            />
            {dateFilter && (
              <button type="button" className="todo-filter-clear" onClick={() => setDateFilter(null)}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="modal-body todo-modal-body">
          {error && <div className="modal-error">{error}</div>}
          <div className="todo-doc">
            {TASK_SECTIONS.map((section) => (
              <TodoSection
                key={section.id}
                sectionId={section.id}
                title={section.name}
                items={itemsBySection.get(section.id) ?? []}
                sessionLabels={sessionLabels}
                labelMap={labelMap}
                busy={busy}
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onAdd={(text) => addCard(section.id, text)}
                onUpdate={updateCard}
                onMove={moveCard}
                onSetLabels={setCardLabels}
                onRemove={removeCard}
              />
            ))}
          </div>
        </div>
        <div
          className="todo-modal-resize-handle"
          onMouseDown={onResizeMouseDown}
          title="Drag to resize"
          aria-hidden
        />
      </div>
    </div>
  );
}

function TodoSection({
  sectionId,
  title,
  items,
  sessionLabels,
  labelMap,
  busy,
  draggingId,
  onDragStart,
  onDragEnd,
  onAdd,
  onUpdate,
  onMove,
  onSetLabels,
  onRemove,
}: {
  sectionId: string;
  title: string;
  items: TaskItem[];
  sessionLabels: SessionLabel[];
  labelMap: Map<string, SessionLabel>;
  busy: boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onMove: (id: string, sectionId: string) => void;
  onSetLabels: (id: string, labelIds: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autoResize(draftRef.current);
  }, [draft]);

  const commitDraft = () => {
    const text = draft;
    if (!text.trim()) return;
    setDraft('');
    onAdd(text);
  };

  const acceptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropActive(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const id = e.dataTransfer.getData('text/task-id');
    if (!id) return;
    onDragEnd();
    void onMove(id, sectionId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropActive(false);
  };

  const showDropTarget = dropActive && draggingId !== null;

  return (
    <section
      className={`todo-section${showDropTarget ? ' todo-section--drop-target' : ''}`}
      onDragOver={acceptDrop}
      onDragEnter={acceptDrop}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <h2 className="todo-section-heading">
        {title}
        <span className="todo-section-count">{items.length}</span>
      </h2>
      <ul className="todo-list">
        {items.map((item) => (
          <TodoRow
            key={item.id}
            item={item}
            sessionLabels={sessionLabels}
            labelMap={labelMap}
            dragging={draggingId === item.id}
            onDragStart={() => onDragStart(item.id)}
            onDragEnd={onDragEnd}
            onUpdate={(text) => onUpdate(item.id, text)}
            onCycleStatus={() => onMove(item.id, nextSection(item.sectionId))}
            onSetLabels={(labelIds) => onSetLabels(item.id, labelIds)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
        <li className="todo-row todo-row--phantom">
          <span className="todo-status todo-status--phantom" aria-hidden />
          <textarea
            ref={draftRef}
            className="todo-row-text todo-row-text--phantom"
            rows={1}
            placeholder={`Add to ${title.toLowerCase()}…`}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
          />
        </li>
      </ul>
    </section>
  );
}

function TodoRow({
  item,
  sessionLabels,
  labelMap,
  dragging,
  onDragStart,
  onDragEnd,
  onUpdate,
  onCycleStatus,
  onSetLabels,
  onRemove,
}: {
  item: TaskItem;
  sessionLabels: SessionLabel[];
  labelMap: Map<string, SessionLabel>;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUpdate: (text: string) => void;
  onCycleStatus: () => void;
  onSetLabels: (labelIds: string[]) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(item.text);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  const appliedLabels = useMemo(
    () =>
      (item.labelIds ?? [])
        .map((id) => labelMap.get(id))
        .filter((label): label is SessionLabel => label !== undefined),
    [item.labelIds, labelMap],
  );

  const isDone = item.sectionId === TASK_SECTION_DONE;
  const isDoing = item.sectionId === TASK_SECTION_DOING;

  useEffect(() => {
    setText(item.text);
  }, [item.text]);

  useEffect(() => {
    autoResize(textareaRef.current);
  }, [text]);

  useEffect(() => {
    if (!labelsOpen) return;
    const close = () => setLabelsOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [labelsOpen]);

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (!trimmed) {
      onRemove();
      return;
    }
    if (trimmed !== item.text) onUpdate(trimmed);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/task-id', item.id);
    e.dataTransfer.effectAllowed = 'move';
    if (rowRef.current) {
      e.dataTransfer.setDragImage(rowRef.current, 24, 16);
    }
    onDragStart();
  };

  const statusLabel = isDone ? 'Done' : isDoing ? 'Doing' : 'To do';

  return (
    <li
      ref={rowRef}
      className={`todo-row${isDone ? ' todo-row--done' : ''}${isDoing ? ' todo-row--doing' : ''}${dragging ? ' todo-row--dragging' : ''}`}
    >
      <button
        type="button"
        className="todo-row-drag"
        draggable={!editing}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        title="Drag to move"
        aria-label="Drag to move between sections"
        tabIndex={-1}
      >
        <DragHandleIcon />
      </button>
      <button
        type="button"
        className={`todo-status${isDone ? ' todo-status--done' : ''}${isDoing ? ' todo-status--doing' : ''}`}
        onClick={onCycleStatus}
        title={`Status: ${statusLabel}. Click to change.`}
        aria-label={`Status: ${statusLabel}. Click to change.`}
      />
      <textarea
        ref={textareaRef}
        className="todo-row-text"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onInput={(e) => autoResize(e.currentTarget)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setText(item.text);
            e.currentTarget.blur();
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
          if (e.key === 'Backspace' && text === '') {
            e.preventDefault();
            onRemove();
          }
        }}
      />
      <div className="todo-row-trailing">
        {appliedLabels.length > 0 && <SessionLabelChips labels={appliedLabels} compact />}
        {isDone && item.doneAt && (
          <span className="todo-row-done-at">{formatTime(item.doneAt)}</span>
        )}
        {sessionLabels.length > 0 && (
          <div className="todo-row-label-picker" ref={labelsRef}>
            <button
              type="button"
              className="todo-row-label-btn"
              title="Labels"
              onClick={(e) => {
                e.stopPropagation();
                setLabelsOpen((open) => !open);
              }}
            >
              ···
            </button>
            {labelsOpen && (
              <div className="todo-row-label-menu" onClick={(e) => e.stopPropagation()}>
                {sessionLabels.map((label) => {
                  const checked = (item.labelIds ?? []).includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className="context-menu-item context-menu-item--check"
                      onClick={() => onSetLabels(toggleTaskLabelIds(item.labelIds, label.id))}
                    >
                      <span
                        className="context-menu-check"
                        style={{ ['--label-color' as string]: label.color }}
                        aria-hidden
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <span>{label.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DragHandleIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="2.5" r="1.2" />
      <circle cx="7.5" cy="2.5" r="1.2" />
      <circle cx="2.5" cy="7" r="1.2" />
      <circle cx="7.5" cy="7" r="1.2" />
      <circle cx="2.5" cy="11.5" r="1.2" />
      <circle cx="7.5" cy="11.5" r="1.2" />
    </svg>
  );
}
