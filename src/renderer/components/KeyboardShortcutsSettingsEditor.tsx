import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  KEYBOARD_SHORTCUT_ACTIONS,
  KEYBOARD_SHORTCUT_LABELS,
  bindingFromKeyboardEvent,
  formatKeyboardShortcut,
  type KeyboardShortcutAction,
  type KeyboardShortcutBinding,
  type KeyboardShortcutsConfig,
} from '@shared/keyboard-shortcuts';

type Props = {
  value: KeyboardShortcutsConfig;
  onChange: (value: KeyboardShortcutsConfig) => void;
};

export function KeyboardShortcutsSettingsEditor({ value, onChange }: Props) {
  const [recording, setRecording] = useState<KeyboardShortcutAction | null>(null);

  const updateBinding = useCallback(
    (action: KeyboardShortcutAction, binding: KeyboardShortcutBinding) => {
      onChange({ ...value, [action]: binding });
    },
    [onChange, value],
  );

  const resetDefaults = () => {
    onChange({ ...DEFAULT_KEYBOARD_SHORTCUTS });
  };

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const binding = bindingFromKeyboardEvent(e);
      if (!binding) {
        setRecording(null);
        return;
      }
      updateBinding(recording, binding);
      setRecording(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, updateBinding]);

  return (
    <div className="keyboard-shortcuts-settings">
      <p className="muted keyboard-shortcuts-settings-hint">
        Defaults use Shift (⇧) to avoid conflicting with macOS Command shortcuts. Click a shortcut to
        change it, then press the new key combination. Press Esc to cancel recording.
      </p>
      <ul className="keyboard-shortcuts-settings-list">
        {KEYBOARD_SHORTCUT_ACTIONS.map((action) => (
          <li key={action} className="keyboard-shortcuts-settings-row">
            <span className="keyboard-shortcuts-settings-label">{KEYBOARD_SHORTCUT_LABELS[action]}</span>
            <button
              type="button"
              className={`keyboard-shortcuts-settings-binding${recording === action ? ' recording' : ''}`}
              onClick={() => setRecording(action)}
              aria-pressed={recording === action}
            >
              {recording === action ? 'Press keys…' : formatKeyboardShortcut(value[action])}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-small keyboard-shortcuts-settings-reset" onClick={resetDefaults}>
        Reset to defaults
      </button>
    </div>
  );
}
