import { useState } from 'react';
import type { SessionLabel } from '@shared/types';
import { nextLabelColor } from '@shared/session-labels';
import { randomUUID } from '../utils/uuid';

type Props = {
  labels: SessionLabel[];
  onChange: (labels: SessionLabel[]) => void;
};

export function SessionLabelsEditor({ labels, onChange }: Props) {
  const [newName, setNewName] = useState('');

  const addLabel = () => {
    const name = newName.trim();
    if (!name) return;
    const label: SessionLabel = {
      id: randomUUID(),
      name,
      color: nextLabelColor(labels),
    };
    onChange([...labels, label]);
    setNewName('');
  };

  const updateLabel = (id: string, patch: Partial<SessionLabel>) => {
    onChange(labels.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLabel = (id: string) => {
    onChange(labels.filter((l) => l.id !== id));
  };

  return (
    <div className="session-labels-editor">
      <p className="muted session-labels-editor-intro">
        Create custom labels with colours for sessions and to-do items. Labels appear in the session
        list and on the to-do board, where you can filter tasks by label.
      </p>
      <div className="session-labels-list">
        {labels.map((label) => (
          <div key={label.id} className="session-labels-row">
            <input
              type="color"
              className="session-labels-color"
              value={label.color}
              onChange={(e) => updateLabel(label.id, { color: e.target.value })}
              title="Label colour"
              aria-label={`Colour for ${label.name}`}
            />
            <input
              type="text"
              className="session-labels-name"
              value={label.name}
              onChange={(e) => updateLabel(label.id, { name: e.target.value })}
              aria-label="Label name"
            />
            <button
              type="button"
              className="icon-btn session-labels-remove"
              onClick={() => removeLabel(label.id)}
              title="Remove label"
              aria-label={`Remove ${label.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="session-labels-add">
        <input
          type="text"
          className="session-labels-name"
          placeholder="New label name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addLabel();
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={addLabel} disabled={!newName.trim()}>
          + Add Label
        </button>
      </div>
    </div>
  );
}
