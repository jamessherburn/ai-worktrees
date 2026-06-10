import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type PanelAnchor = {
  top: number;
  right: number;
};

type Props = {
  sessionId: string;
  notes: string;
  onSave: (sessionId: string, text: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SessionNotesButton({
  sessionId,
  notes,
  onSave,
  open: openProp,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const openRef = useRef(open);
  openRef.current = open;

  const setOpen = useCallback(
    (next: boolean | ((value: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(openRef.current) : next;
      if (onOpenChange) onOpenChange(resolved);
      else setInternalOpen(resolved);
    },
    [onOpenChange],
  );

  const [draft, setDraft] = useState(notes);
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<number | undefined>();

  useEffect(() => {
    setDraft(notes);
  }, [sessionId, notes]);

  useEffect(() => {
    setOpen(false);
  }, [sessionId, setOpen]);

  const updateAnchor = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    return () => window.removeEventListener('resize', updateAnchor);
  }, [open, updateAnchor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    if (draft === notes) return;
    onSave(sessionId, draft);
  }, [draft, notes, onSave, sessionId]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined;
      if (draft !== notes) onSave(sessionId, draft);
    }, 400);
  }, [draft, notes, onSave, sessionId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((value) => {
      if (value) flushSave();
      return !value;
    });
  }, [flushSave, setOpen]);

  const hasNotes = notes.trim().length > 0;

  return (
    <div className="session-notes-button" ref={rootRef}>
      <button
        type="button"
        className={`flight-deck-workspace-link-btn session-notes-button-trigger${open ? ' session-notes-button-trigger--open' : ''}${hasNotes ? ' session-notes-button-trigger--filled' : ''}`}
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Notes
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={panelRef}
            className="session-notes-panel session-notes-panel--floating"
            role="dialog"
            aria-label="Session notes"
            style={{ top: anchor.top, right: anchor.right }}
          >
            <textarea
              ref={textareaRef}
              className="session-notes-textarea"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                scheduleSave();
              }}
              onBlur={flushSave}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  flushSave();
                  setOpen(false);
                }
              }}
              placeholder="Session notes…"
              spellCheck
              rows={8}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
