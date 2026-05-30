import { useState } from 'react';
import type { SessionPromptChild, SessionPromptPreset } from '@shared/types';
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

  const updateChild = (presetIndex: number, childIndex: number, patch: Partial<SessionPromptChild>) => {
    const preset = value[presetIndex];
    if (!preset) return;
    const children = [...(preset.children ?? [])];
    children[childIndex] = { ...children[childIndex], ...patch };
    update(presetIndex, { children });
  };

  const addChild = (presetIndex: number) => {
    const preset = value[presetIndex];
    if (!preset) return;
    const children = [...(preset.children ?? []), { title: 'New child', text: '' }];
    update(presetIndex, { children });
  };

  const removeChild = (presetIndex: number, childIndex: number) => {
    const preset = value[presetIndex];
    if (!preset?.children?.length) return;
    update(presetIndex, {
      children: preset.children.filter((_, i) => i !== childIndex),
    });
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
        These appear in the quick-prompt dock on each session. Choosing one pastes the text into the
        active session&apos;s terminal and presses Enter. Parent prompts can group child prompts (one
        level only); the dock shows titles only.
      </p>
      <ul className="session-prompts-settings-list">
        {value.map((preset, index) => (
          <li key={index} className="session-prompts-settings-block">
            <div className="session-prompts-settings-row">
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
                placeholder={
                  preset.children?.length
                    ? 'Optional parent prompt text'
                    : 'Prompt text'
                }
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
            </div>
            <div className="session-prompts-settings-children">
              <div className="session-prompts-settings-children-label muted">Child prompts (optional)</div>
              {(preset.children ?? []).map((child, childIndex) => (
                <div key={childIndex} className="session-prompts-settings-child-row">
                  <input
                    className="session-prompts-settings-title"
                    value={child.title}
                    placeholder="Child title"
                    onChange={(e) => updateChild(index, childIndex, { title: e.target.value })}
                    aria-label={`Prompt ${index + 1} child ${childIndex + 1} title`}
                  />
                  <textarea
                    className="session-prompts-settings-text"
                    rows={2}
                    value={child.text}
                    placeholder="Child prompt text"
                    onChange={(e) => updateChild(index, childIndex, { text: e.target.value })}
                    aria-label={`Prompt ${index + 1} child ${childIndex + 1} text`}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => removeChild(index, childIndex)}
                    title="Remove child prompt"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => addChild(index)}
              >
                + Add child
              </button>
            </div>
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
