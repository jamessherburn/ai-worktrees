import { useState } from 'react';
import type { SessionPromptPreset } from '@shared/types';
import { cloneDefaultSessionPrompts } from '@shared/session-prompts';

type Props = {
  value: SessionPromptPreset[];
  onChange: (next: SessionPromptPreset[]) => void;
};

export function SessionPromptsSettingsEditor({ value, onChange }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);

  const update = (index: number, patch: Partial<SessionPromptPreset>) => {
    onChange(value.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const add = () => {
    onChange([...value, { title: 'New prompt', text: '' }]);
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const reset = () => {
    onChange(cloneDefaultSessionPrompts());
    setConfirmReset(false);
  };

  return (
    <div className="session-prompts-settings">
      <p className="muted session-prompts-settings-hint">
        These appear in the prompt dropdown on each session. Choosing one pastes the text into the
        active session&apos;s terminal and presses Enter.
      </p>
      <ul className="session-prompts-settings-list">
        {value.map((preset, index) => (
          <li key={`${preset.title}-${index}`} className="session-prompts-settings-row">
            <input
              className="session-prompts-settings-title"
              value={preset.title}
              placeholder="Title"
              onChange={(e) => update(index, { title: e.target.value })}
              aria-label={`Prompt ${index + 1} title`}
            />
            <textarea
              className="session-prompts-settings-text"
              rows={2}
              value={preset.text}
              placeholder="Prompt text"
              onChange={(e) => update(index, { text: e.target.value })}
              aria-label={`Prompt ${index + 1} text`}
            />
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => remove(index)}
              disabled={value.length <= 1}
              title="Remove prompt"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-small" onClick={add}>
        + Add prompt
      </button>
      <div className="session-prompts-settings-reset">
        {confirmReset ? (
          <div className="session-prompts-settings-reset-confirm">
            <span className="muted">Reset quick prompts to the built-in defaults?</span>
            <button type="button" className="btn btn-danger btn-small" onClick={reset}>
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
