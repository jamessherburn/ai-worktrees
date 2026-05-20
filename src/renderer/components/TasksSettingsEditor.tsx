import { useEffect, useMemo, useState } from 'react';
import type { TaskItem, TaskSectionConfig, TasksConfig } from '@shared/types';
import { DEFAULT_TASKS_CONFIG } from '@shared/tasks';

type Props = {
  value: TasksConfig;
  onChange: (next: TasksConfig) => void;
};

export function TasksSettingsEditor({ value, onChange }: Props) {
  const [orphanIds, setOrphanIds] = useState<string[]>([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void window.api.tasks.list().then((items: TaskItem[]) => {
      const configured = new Set(value.sections.map((s) => s.id));
      const ids = new Set<string>();
      for (const item of items) {
        if (!configured.has(item.sectionId)) ids.add(item.sectionId);
      }
      setOrphanIds(Array.from(ids).sort());
    });
  }, [value.sections]);

  const sectionOptions = useMemo(
    () => value.sections.map((s) => ({ id: s.id, label: s.hidden ? `${s.name} (hidden)` : s.name })),
    [value.sections],
  );

  const updateSection = (index: number, patch: Partial<TaskSectionConfig>) => {
    const sections = value.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...value, sections });
  };

  const addSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    const base = slugify(name);
    let id = base;
    let n = 2;
    const existing = new Set(value.sections.map((s) => s.id));
    while (existing.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    onChange({
      ...value,
      sections: [...value.sections, { id, name, hidden: false }],
    });
    setNewSectionName('');
  };

  const restoreOrphan = (sectionId: string) => {
    const existing = value.sections.find((s) => s.id === sectionId);
    if (existing) {
      updateSection(value.sections.indexOf(existing), { hidden: false });
      return;
    }
    onChange({
      ...value,
      sections: [...value.sections, { id: sectionId, name: sectionId, hidden: false }],
    });
  };

  const resetDefaults = () => {
    onChange({ ...DEFAULT_TASKS_CONFIG });
    setConfirmReset(false);
  };

  return (
    <div className="tasks-settings">
      <div className="field-label">Board sections</div>
      <p className="muted tasks-settings-hint">
        Hide a section to remove its column from the board. Cards stay saved and reappear when you show the section again.
      </p>
      <ul className="tasks-settings-sections">
        {value.sections.map((section, index) => (
          <li key={section.id} className="tasks-settings-section-row">
            <input
              className="tasks-settings-name"
              value={section.name}
              onChange={(e) => updateSection(index, { name: e.target.value })}
              aria-label={`Section name for ${section.id}`}
            />
            <label className="tasks-settings-hidden">
              <input
                type="checkbox"
                checked={section.hidden === true}
                onChange={(e) => updateSection(index, { hidden: e.target.checked })}
              />
              Hidden
            </label>
          </li>
        ))}
      </ul>
      <div className="tasks-settings-add-row">
        <input
          className="tasks-settings-name"
          type="text"
          placeholder="New section name"
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addSection();
          }}
          aria-label="New section name"
        />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={addSection}
          disabled={!newSectionName.trim()}
        >
          + Add section
        </button>
      </div>

      {orphanIds.length > 0 && (
        <div className="tasks-settings-orphans">
          <div className="field-label">Stored in hidden sections</div>
          <p className="muted tasks-settings-hint">
            These columns are not in your section list but still have cards. Restore to show them on the board again.
          </p>
          <ul className="tasks-settings-orphan-list">
            {orphanIds.map((id) => (
              <li key={id}>
                <code>{id}</code>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => restoreOrphan(id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field-label">What Did I Do shows</label>
        <select
          className="tasks-settings-select"
          value={value.whatDidIDoSectionId}
          onChange={(e) => onChange({ ...value, whatDidIDoSectionId: e.target.value })}
        >
          {sectionOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="tasks-settings-reset" style={{ marginTop: 8 }}>
        {confirmReset ? (
          <div className="tasks-settings-reset-confirm">
            <span className="muted">Reset sections to To Do, In Progress, and Done?</span>
            <button type="button" className="btn btn-danger btn-small" onClick={resetDefaults}>
              Reset
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </button>
        )}
      </div>
    </div>
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'section';
}
