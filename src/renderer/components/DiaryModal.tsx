import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiaryItem } from '@shared/types';

type Props = {
  onClose: () => void;
};

type Tab = 'todo' | 'history';

export function DiaryModal({ onClose }: Props) {
  const [items, setItems] = useState<DiaryItem[]>([]);
  const [tab, setTab] = useState<Tab>('todo');
  const [newText, setNewText] = useState('');
  const [historyDate, setHistoryDate] = useState<string>(() => isoLocalDate(addDays(new Date(), -1)));
  const [clearCutoff, setClearCutoff] = useState<string>(() => isoLocalDate(addDays(new Date(), -7)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (tab === 'todo') inputRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = async () => {
    try {
      const list = await window.api.diary.list();
      setItems(list);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const active = useMemo(
    () =>
      items
        .filter((i) => !i.doneAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items],
  );

  const doneOnHistoryDate = useMemo(
    () =>
      items
        .filter((i) => i.doneAt && isoLocalDate(new Date(i.doneAt)) === historyDate)
        .sort((a, b) => (a.doneAt ?? '').localeCompare(b.doneAt ?? '')),
    [items, historyDate],
  );

  const addNew = async () => {
    const text = newText.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await window.api.diary.add(text);
      setNewText('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string) => {
    setError(null);
    try {
      await window.api.diary.toggleDone(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await window.api.diary.remove(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const clearBefore = async () => {
    if (!clearCutoff) return;
    const label = formatHumanDate(clearCutoff);
    const confirmed = window.confirm(
      `Permanently delete all done items completed on or before ${label}?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const cutoffISO = endOfLocalDayISO(clearCutoff);
      const removed = await window.api.diary.clearDoneBefore(cutoffISO);
      await refresh();
      window.alert(removed === 1 ? '1 item cleared.' : `${removed} items cleared.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setYesterday = () => setHistoryDate(isoLocalDate(addDays(new Date(), -1)));
  const setToday = () => setHistoryDate(isoLocalDate(new Date()));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Diary</div>
          <div className="modal-subtitle">Track what you're working on and look back at what you did.</div>
        </div>
        <div className="diary-tabs">
          <button
            className={`diary-tab${tab === 'todo' ? ' active' : ''}`}
            onClick={() => setTab('todo')}
          >
            To Do
            <span className="diary-tab-count">{active.length}</span>
          </button>
          <button
            className={`diary-tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
        </div>
        <div className="modal-body diary-body">
          {tab === 'todo' && (
            <>
              <div className="diary-add-row">
                <input
                  ref={inputRef}
                  className="diary-input"
                  type="text"
                  value={newText}
                  placeholder="What needs doing?"
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addNew();
                  }}
                  disabled={busy}
                />
                <button className="btn btn-primary" onClick={addNew} disabled={busy || !newText.trim()}>
                  + Add
                </button>
              </div>
              {active.length === 0 ? (
                <div className="diary-empty">Nothing on the list. Add something above.</div>
              ) : (
                <ul className="diary-list">
                  {active.map((item) => (
                    <DiaryRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              <div className="diary-history-controls">
                <input
                  className="diary-date"
                  type="date"
                  value={historyDate}
                  max={isoLocalDate(new Date())}
                  onChange={(e) => setHistoryDate(e.target.value)}
                />
                <button className="btn btn-ghost btn-small" onClick={setYesterday}>
                  Yesterday
                </button>
                <button className="btn btn-ghost btn-small" onClick={setToday}>
                  Today
                </button>
              </div>
              <div className="diary-history-label">
                What I did on {formatHumanDate(historyDate)}
              </div>
              {doneOnHistoryDate.length === 0 ? (
                <div className="diary-empty">No items completed on this day.</div>
              ) : (
                <ul className="diary-list">
                  {doneOnHistoryDate.map((item) => (
                    <li key={item.id} className="diary-row done">
                      <span className="diary-check done">✓</span>
                      <span className="diary-text">{item.text}</span>
                      <span className="diary-time">{formatTime(item.doneAt!)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="diary-divider" />

              <div className="diary-clear">
                <div className="field-label">Clear Data</div>
                <div className="diary-clear-row">
                  <span className="muted">Delete done items completed on or before</span>
                  <input
                    className="diary-date"
                    type="date"
                    value={clearCutoff}
                    max={isoLocalDate(new Date())}
                    onChange={(e) => setClearCutoff(e.target.value)}
                  />
                  <button
                    className="btn btn-danger btn-small"
                    onClick={clearBefore}
                    disabled={busy || !clearCutoff}
                  >
                    Clear Data
                  </button>
                </div>
              </div>
            </>
          )}

          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DiaryRow({
  item,
  onToggle,
  onRemove,
}: {
  item: DiaryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const done = item.doneAt !== null;
  return (
    <li className={`diary-row${done ? ' done' : ''}`}>
      <button
        className={`diary-check${done ? ' done' : ''}`}
        onClick={() => onToggle(item.id)}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
      >
        {done ? '✓' : ''}
      </button>
      <span className="diary-text">{item.text}</span>
      <button
        className="diary-row-delete"
        onClick={() => onRemove(item.id)}
        title="Delete item"
        aria-label="Delete item"
      >
        ×
      </button>
    </li>
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
