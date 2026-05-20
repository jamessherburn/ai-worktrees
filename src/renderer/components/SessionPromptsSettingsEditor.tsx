import type { SessionPromptPreset } from '@shared/types';
import { DEFAULT_SESSION_PROMPTS } from '@shared/session-prompts';

type Props = {
  value: SessionPromptPreset[];
  onChange: (next: SessionPromptPreset[]) => void;
};

export function SessionPromptsSettingsEditor({ value, onChange }: Props) {
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
    if (!window.confirm('Reset session prompts to defaults?')) return;
    onChange([...DEFAULT_SESSION_PROMPTS]);
  };

  return (
    <div className="session-prompts-settings">
      <p className="muted session-prompts-settings-hint">
        These appear in the prompt dropdown on each session. Choosing one pastes the text into the
        active session&apos;s terminal and presses Enter.
      </p>
      <ul className="session-prompts-settings-list">
        {value.map((preset, index) => (
          <li key={index} className="session-prompts-settings-row">
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
      <button type="button" className="btn btn-ghost btn-small" onClick={reset} style={{ marginLeft: 8 }}>
        Reset to defaults
      </button>
    </div>
  );
}
