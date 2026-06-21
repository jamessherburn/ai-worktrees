import { useEffect, useMemo, useState } from 'react';
import type { WorktreesSkill } from '@shared/types';
import { cloneDefaultWorktreesSkills } from '@shared/worktrees-skills';

type Props = {
  value: WorktreesSkill[];
  onChange: (next: WorktreesSkill[]) => void;
};

export function WorktreesSkillsEditor({ value, onChange }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (value.length === 0) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= value.length) {
      setSelectedIndex(value.length - 1);
    }
  }, [value.length, selectedIndex]);

  const selectedSkill = value[selectedIndex] ?? null;

  const updateSelected = (patch: Partial<WorktreesSkill>) => {
    if (selectedIndex < 0 || selectedIndex >= value.length) return;
    onChange(value.map((skill, i) => (i === selectedIndex ? { ...skill, ...patch } : skill)));
  };

  const add = () => {
    const next = [...value, { name: 'New skill', prompt: '' }];
    onChange(next);
    setSelectedIndex(next.length - 1);
  };

  const removeSelected = () => {
    if (value.length <= 1 || selectedIndex < 0) return;
    const next = value.filter((_, i) => i !== selectedIndex);
    onChange(next);
    setSelectedIndex(Math.min(selectedIndex, next.length - 1));
  };

  const reset = () => {
    onChange(cloneDefaultWorktreesSkills());
    setSelectedIndex(0);
    setConfirmReset(false);
  };

  const listItems = useMemo(
    () =>
      value.map((skill, index) => ({
        index,
        label: skill.name.trim() || 'Untitled skill',
      })),
    [value],
  );

  return (
    <div className="worktrees-skills-editor">
      <p className="muted worktrees-skills-editor-hint">
        Worktrees Skills work across any agent session. Type <span className="kbd">/</span> plus a
        skill name in the bottom bar to launch one into the active session.
      </p>
      <div className="worktrees-skills-editor-layout">
        <aside className="worktrees-skills-editor-list" aria-label="Skills">
          <ul className="worktrees-skills-editor-list-items">
            {listItems.map(({ index, label }) => (
              <li key={index}>
                <button
                  type="button"
                  className={`worktrees-skills-editor-list-item${index === selectedIndex ? ' active' : ''}`}
                  onClick={() => setSelectedIndex(index)}
                  aria-current={index === selectedIndex ? 'true' : undefined}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-small worktrees-skills-editor-add" onClick={add}>
            + Add skill
          </button>
        </aside>

        <section className="worktrees-skills-editor-detail" aria-label="Skill editor">
          {selectedSkill ? (
            <>
              <div className="worktrees-skills-editor-detail-header">
                <label className="worktrees-skills-editor-field">
                  <span className="worktrees-skills-editor-field-label">Name</span>
                  <input
                    className="worktrees-skills-editor-name"
                    value={selectedSkill.name}
                    placeholder="Skill name"
                    onChange={(e) => updateSelected({ name: e.target.value })}
                  />
                </label>
                <label className="worktrees-skills-editor-field worktrees-skills-editor-field--grow">
                  <span className="worktrees-skills-editor-field-label">Description</span>
                  <input
                    className="worktrees-skills-editor-description"
                    value={selectedSkill.description ?? ''}
                    placeholder="Optional — for your reference only"
                    onChange={(e) => updateSelected({ description: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={removeSelected}
                  disabled={value.length <= 1}
                  title="Remove skill"
                >
                  Remove
                </button>
              </div>
              <label className="worktrees-skills-editor-field worktrees-skills-editor-field--prompt">
                <span className="worktrees-skills-editor-field-label">Prompt</span>
                <textarea
                  className="worktrees-skills-editor-prompt"
                  value={selectedSkill.prompt}
                  placeholder="Prompt text sent to the agent when this skill is launched"
                  onChange={(e) => updateSelected({ prompt: e.target.value })}
                />
              </label>
            </>
          ) : (
            <div className="worktrees-skills-editor-empty muted">Add a skill to get started.</div>
          )}
        </section>
      </div>

      <div className="worktrees-skills-editor-reset">
        {confirmReset ? (
          <div className="worktrees-skills-editor-reset-confirm">
            <span className="muted">Reset skills to the built-in defaults?</span>
            <button type="button" className="btn btn-danger btn-small" onClick={reset}>
              Reset
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setConfirmReset(true)}
          >
            Reset to defaults
          </button>
        )}
      </div>
    </div>
  );
}
