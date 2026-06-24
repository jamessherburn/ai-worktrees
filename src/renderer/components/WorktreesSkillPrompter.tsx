import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WorktreesSkill } from '@shared/types';
import {
  findActiveSlashIndex,
  formatSlashSkillDisplay,
  getSlashSkillTokenDisplayLength,
  isCompleteSlashSkillReference,
  matchWorktreesSkills,
  parseSlashSkillCommand,
  resolvePrompterSubmission,
} from '@shared/worktrees-skills';

type Props = {
  skills: WorktreesSkill[];
  disabled?: boolean;
  onRun: (prompt: string) => void;
  onRegisterFocus?: (focus: (() => void) | null) => void;
  onFocusPane?: () => void;
  onCycleFocus?: () => void;
};

function PrompterMirror({
  value,
  skills,
  activeSlashIndex,
}: {
  value: string;
  skills: WorktreesSkill[];
  activeSlashIndex: number;
}) {
  if (!value) return null;

  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < value.length) {
    if (value[i] === '/') {
      const segment = value.slice(i);
      const tokenLen = getSlashSkillTokenDisplayLength(segment, skills);
      if (tokenLen !== null) {
        parts.push(
          <span key={key++} className="worktrees-skill-prompter-token">
            {value.slice(i, i + tokenLen)}
          </span>,
        );
        i += tokenLen;
        continue;
      }

      if (i === activeSlashIndex) {
        parts.push(
          <span key={key++} className="worktrees-skill-prompter-slash">
            /
          </span>,
        );
        parts.push(
          <span key={key++} className="worktrees-skill-prompter-query">
            {value.slice(i + 1)}
          </span>,
        );
        return parts;
      }

      parts.push(
        <span key={key++} className="worktrees-skill-prompter-body">
          /
        </span>,
      );
      i++;
      continue;
    }

    let next = i + 1;
    while (next < value.length && value[next] !== '/') next++;
    parts.push(
      <span key={key++} className="worktrees-skill-prompter-body">
        {value.slice(i, next)}
      </span>,
    );
    i = next;
  }

  return parts;
}

function PrompterPrefixIcon() {
  return (
    <span className="worktrees-skill-prompter-prefix" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M9.25 2.75 4.75 11.25"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function WorktreesSkillPrompter({
  skills,
  disabled = false,
  onRun,
  onRegisterFocus,
  onFocusPane,
  onCycleFocus,
}: Props) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = 'worktrees-skill-prompter-list';
  const onRegisterFocusRef = useRef(onRegisterFocus);
  onRegisterFocusRef.current = onRegisterFocus;

  const slashIndex = findActiveSlashIndex(value);
  const slashSegment = slashIndex >= 0 ? value.slice(slashIndex) : '';
  const slashQueryActive =
    slashIndex >= 0 && !isCompleteSlashSkillReference(slashSegment, skills);
  const hasCommittedSkill = useMemo(() => {
    let i = 0;
    while (i < value.length) {
      if (value[i] === '/') {
        const tokenLen = getSlashSkillTokenDisplayLength(value.slice(i), skills);
        if (tokenLen !== null) return true;
      }
      i++;
    }
    return false;
  }, [value, skills]);
  const query = slashQueryActive ? slashSegment.slice(1) : '';

  const matches = useMemo(() => {
    if (!slashQueryActive || skills.length === 0) return [];
    return matchWorktreesSkills(query, skills);
  }, [slashQueryActive, query, skills]);

  useEffect(() => {
    if (!slashQueryActive) {
      setOpen(false);
      setHighlightIndex(0);
      return;
    }
    setOpen(matches.length > 0);
    setHighlightIndex(0);
  }, [slashQueryActive, matches.length]);

  useEffect(() => {
    onRegisterFocusRef.current?.(() => {
      inputRef.current?.focus();
    });
    return () => {
      onRegisterFocusRef.current?.(null);
    };
  }, []);

  const clear = useCallback(() => {
    setValue('');
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  const insertSkill = useCallback(
    (skill: WorktreesSkill, suffix = '') => {
      if (disabled || !skill.prompt.trim()) return;
      const prefix = slashIndex >= 0 ? value.slice(0, slashIndex) : '';
      setValue(prefix + formatSlashSkillDisplay(skill, suffix));
      setOpen(false);
      setHighlightIndex(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [disabled, slashIndex, value],
  );

  const commitFromInput = useCallback(() => {
    if (!slashQueryActive) return false;
    const highlighted = matches[highlightIndex] ?? matches[0] ?? null;
    const parsed = parseSlashSkillCommand(slashSegment, skills, highlighted);
    if (!parsed) return false;
    insertSkill(parsed.skill, parsed.suffix);
    return true;
  }, [slashQueryActive, matches, highlightIndex, slashSegment, skills, insertSkill]);

  const submitFromInput = useCallback(() => {
    if (disabled) return false;
    const submission = resolvePrompterSubmission(value, skills);
    if (!submission) return false;
    onRun(submission);
    clear();
    inputRef.current?.blur();
    return true;
  }, [disabled, value, skills, onRun, clear]);

  const handleCycleFocus = (e: React.KeyboardEvent) => {
    if (
      e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'j'
    ) {
      e.preventDefault();
      onCycleFocus?.();
      return true;
    }
    return false;
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleCycleFocus(e)) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (slashQueryActive) {
        commitFromInput();
      } else {
        submitFromInput();
      }
      return;
    }

    if (e.key === 'Escape' && value) {
      e.preventDefault();
      clear();
      return;
    }

    if (!slashQueryActive || !open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(matches.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(0, i - 1));
        break;
      case 'Tab': {
        const resolved = matches[highlightIndex] ?? matches[0];
        if (resolved) {
          e.preventDefault();
          insertSkill(resolved);
        }
        break;
      }
    }
  };

  if (skills.length === 0) return null;

  const fieldClass = [
    'worktrees-skill-prompter-field',
    open ? 'worktrees-skill-prompter-field--open' : '',
    hasCommittedSkill ? 'worktrees-skill-prompter-field--skill' : '',
    disabled ? 'worktrees-skill-prompter-field--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`worktrees-skill-prompter${open ? ' worktrees-skill-prompter--open' : ''}`}>
      <div className={fieldClass}>
        <PrompterPrefixIcon />
        <div
          className={`worktrees-skill-prompter-editor${value && !disabled ? ' worktrees-skill-prompter-editor--has-value' : ''}`}
        >
          <div className="worktrees-skill-prompter-mirror" aria-hidden="true">
            <PrompterMirror value={value} skills={skills} activeSlashIndex={slashIndex} />
          </div>
          <input
            ref={inputRef}
            type="text"
            className="worktrees-skill-prompter-input"
            value={value}
            disabled={disabled}
            placeholder={
              disabled
                ? 'Select a session to run skills'
                : 'Message the agent or type / for skills…'
            }
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onInputKeyDown}
            onFocus={() => {
              onFocusPane?.();
              if (slashQueryActive && matches.length > 0) setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
          />
          {value && !disabled ? (
            <button
              type="button"
              className="worktrees-skill-prompter-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                clear();
                inputRef.current?.focus();
              }}
              aria-label="Clear input"
              title="Clear (Esc)"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
      {open && (
        <ul id={listId} className="worktrees-skill-prompter-menu" role="listbox">
          {matches.map((skill, index) => (
            <li key={`${skill.name}-${index}`} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                className={`worktrees-skill-prompter-item${index === highlightIndex ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertSkill(skill)}
              >
                <span className="worktrees-skill-prompter-item-name">/{skill.name}</span>
                {skill.description ? (
                  <span className="worktrees-skill-prompter-item-description muted">
                    {skill.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
