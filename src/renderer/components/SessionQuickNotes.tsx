import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionQuickNote } from '@shared/types';
import { formatQuickNoteTime } from '@shared/session-quick-notes';

type Props = {
  sessionId: string;
  notes: SessionQuickNote[];
  onAdd: (sessionId: string, text: string) => void;
  onRemove: (sessionId: string, noteId: string) => void;
};

export function SessionQuickNotes({ sessionId, notes, onAdd, onRemove }: Props) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft('');
    setOpen(false);
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onAdd(sessionId, text);
    setDraft('');
  }, [draft, onAdd, sessionId]);

  return (
    <div className="session-quick-notes" ref={rootRef}>
      <div className="session-quick-notes-input-row">
        <input
          className="session-quick-notes-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Quick note — press Enter to save"
          spellCheck
        />
        <button
          type="button"
          className={`session-quick-notes-toggle${open ? ' session-quick-notes-toggle--open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title={notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : 'No notes yet'}
          aria-label={notes.length ? `View ${notes.length} notes` : 'View notes'}
          aria-expanded={open}
        >
          <NotesIcon />
          {notes.length > 0 && <span className="session-quick-notes-count">{notes.length}</span>}
        </button>
      </div>

      {open && (
        <div className="session-quick-notes-panel" role="region" aria-label="Session notes">
          {notes.length === 0 ? (
            <div className="session-quick-notes-empty muted">No notes yet. Add one above.</div>
          ) : (
            <ul className="session-quick-notes-list">
              {[...notes].reverse().map((note) => (
                <li key={note.id} className="session-quick-notes-item">
                  <div className="session-quick-notes-item-main">
                    <span className="session-quick-notes-text">{note.text}</span>
                    <time className="session-quick-notes-time muted" dateTime={note.createdAt}>
                      {formatQuickNoteTime(note.createdAt)}
                    </time>
                  </div>
                  <button
                    type="button"
                    className="session-quick-notes-remove"
                    onClick={() => onRemove(sessionId, note.id)}
                    title="Remove note"
                    aria-label="Remove note"
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
