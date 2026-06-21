import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorktreesSkill } from '@shared/types';
import {
  formatSlashSkillDisplay,
  isCompleteSlashSkillReference,
  matchWorktreesSkills,
  parseSlashSkillCommand,
  resolveSlashSkillSubmission,
} from '@shared/worktrees-skills';

type Props = {
  skills: WorktreesSkill[];
  disabled?: boolean;
  onRun: (prompt: string) => void;
  onRegisterFocus?: (focus: (() => void) | null) => void;
  onFocusPane?: () => void;
  onCycleFocus?: () => void;
};

type PrompterDisplay =
  | { kind: 'empty' }
  | { kind: 'skill'; token: string; suffix: string }
  | { kind: 'query'; text: string };

function getPrompterDisplay(value: string, skills: WorktreesSkill[]): PrompterDisplay {
  if (!value) return { kind: 'empty' };
  if (!value.startsWith('/')) return { kind: 'query', text: value };

  const parsed = parseSlashSkillCommand(value, skills);
  if (parsed && isCompleteSlashSkillReference(value, skills)) {
    const token = `/${parsed.skill.name}`;
    return { kind: 'skill', token, suffix: value.slice(token.length) };
  }

  return { kind: 'query', text: value };
}

function PrompterMirror({ display }: { display: PrompterDisplay }) {
  if (display.kind === 'empty' || display.kind === 'skill') return null;

  if (display.text.startsWith('/')) {
    return (
      <>
        <span className="worktrees-skill-prompter-slash">/</span>
        <span className="worktrees-skill-prompter-query">{display.text.slice(1)}</span>
      </>
    );
  }

  return <span className="worktrees-skill-prompter-body">{display.text}</span>;
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

  const slashActive = value.startsWith('/');
  const query = slashActive ? value.slice(1) : '';
  const skillCommitted = slashActive && isCompleteSlashSkillReference(value, skills);
  const committed = skillCommitted ? parseSlashSkillCommand(value, skills) : null;

  const matches = useMemo(() => {
    if (!slashActive || skills.length === 0 || skillCommitted) return [];
    return matchWorktreesSkills(query, skills);
  }, [slashActive, query, skills, skillCommitted]);

  useEffect(() => {
    if (!slashActive || skillCommitted) {
      setOpen(false);
      setHighlightIndex(0);
      return;
    }
    setOpen(matches.length > 0);
    setHighlightIndex(0);
  }, [slashActive, skillCommitted, matches.length]);

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
      setValue(formatSlashSkillDisplay(skill, suffix));
      setOpen(false);
      setHighlightIndex(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [disabled],
  );

  const submitFromInput = useCallback(() => {
    if (disabled) return false;
    const highlighted = matches[highlightIndex] ?? matches[0] ?? null;
    const submission = resolveSlashSkillSubmission(value, skills, highlighted);
    if (!submission) return false;
    onRun(submission);
    clear();
    inputRef.current?.blur();
    return true;
  }, [disabled, matches, highlightIndex, value, skills, onRun, clear]);

  const commitFromInput = useCallback(() => {
    if (!slashActive) return false;
    const highlighted = matches[highlightIndex] ?? matches[0] ?? null;
    const parsed = parseSlashSkillCommand(value, skills, highlighted);
    if (!parsed) return false;
    insertSkill(parsed.skill, parsed.suffix);
    return true;
  }, [slashActive, matches, highlightIndex, value, skills, insertSkill]);

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

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return false;
    e.preventDefault();
    if (slashActive) {
      if (skillCommitted) {
        submitFromInput();
        return true;
      }
      commitFromInput();
      return true;
    }
    return true;
  };

  const onQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleCycleFocus(e)) return;
    if (handleEnter(e)) return;

    if (!slashActive || !open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(matches.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(0, i - 1));
        break;
      case 'Escape':
        e.preventDefault();
        clear();
        break;
      case 'Tab': {
        const resolved = matches[highlightIndex] ?? matches[0];
        if (resolved) {
          e.preventDefault();
          setValue(`/${resolved.name}`);
        }
        break;
      }
    }
  };

  const onSuffixKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleCycleFocus(e)) return;
    if (handleEnter(e)) return;

    if (e.key === 'Backspace' && committed && value === formatSlashSkillDisplay(committed.skill)) {
      e.preventDefault();
      setValue(`/${committed.skill.name}`);
      return;
    }
  };

  if (skills.length === 0) return null;

  const display = getPrompterDisplay(value, skills);
  const fieldClass = [
    'worktrees-skill-prompter-field',
    open ? 'worktrees-skill-prompter-field--open' : '',
    skillCommitted ? 'worktrees-skill-prompter-field--skill' : '',
    disabled ? 'worktrees-skill-prompter-field--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`worktrees-skill-prompter${open ? ' worktrees-skill-prompter--open' : ''}`}>
      <div className={fieldClass}>
        <PrompterPrefixIcon />
        {skillCommitted && committed ? (
          <div className="worktrees-skill-prompter-composed">
            <span className="worktrees-skill-prompter-token-badge">/{committed.skill.name}</span>
            <input
              ref={inputRef}
              type="text"
              className="worktrees-skill-prompter-suffix-input"
              value={display.kind === 'skill' ? display.suffix : ''}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              aria-label="Skill follow-up text"
              onChange={(e) => setValue(formatSlashSkillDisplay(committed.skill, e.target.value))}
              onKeyDown={onSuffixKeyDown}
              onFocus={onFocusPane}
            />
          </div>
        ) : (
          <div className="worktrees-skill-prompter-editor">
            <div className="worktrees-skill-prompter-mirror" aria-hidden="true">
              <PrompterMirror display={display} />
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
                  : 'Type /skill-name, Enter to select, add text, Enter again to send…'
              }
              spellCheck={false}
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onQueryKeyDown}
              onFocus={() => {
                onFocusPane?.();
                if (slashActive && matches.length > 0) setOpen(true);
              }}
              onBlur={() => {
                window.setTimeout(() => setOpen(false), 120);
              }}
            />
          </div>
        )}
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
