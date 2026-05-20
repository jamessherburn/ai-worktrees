import { useEffect, useRef, useState } from 'react';
import type { SessionPromptPreset } from '@shared/types';

type Props = {
  prompts: SessionPromptPreset[];
  onRun: (text: string) => void;
  onScrollToBottom: () => void;
};

export function SessionPromptBar({ prompts, onRun, onScrollToBottom }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (prompts.length === 0) return null;

  const run = (text: string) => {
    setOpen(false);
    onRun(text);
  };

  return (
    <div className="session-prompt-bar" ref={rootRef}>
      <div className="session-prompt-bar-actions">
        <button
          type="button"
          className="session-prompt-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          title="Send a pre-built message to this session"
        >
          <span>Quick message</span>
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small session-prompt-scroll-btn"
          onClick={onScrollToBottom}
          title="Scroll to the bottom of this session"
        >
          Scroll to bottom
        </button>
      </div>
      {open && (
        <div className="session-prompt-menu" role="menu">
          {prompts.map((p, i) => (
            <button
              key={`${p.title}-${i}`}
              type="button"
              className="session-prompt-menu-item"
              role="menuitem"
              title={p.text}
              onClick={() => run(p.text)}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
