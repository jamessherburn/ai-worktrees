import type { WebContents } from 'electron';
import { IPC } from '@shared/ipc-channels';
import {
  KEYBOARD_SHORTCUT_ACTIONS,
  bindingUsesTab,
  keyboardShortcutMatchesInput,
  normalizeKeyboardShortcuts,
  type KeyboardShortcutAction,
  type KeyboardShortcutsConfig,
} from '@shared/keyboard-shortcuts';

let shortcuts: KeyboardShortcutsConfig = normalizeKeyboardShortcuts();

export function setKeyboardShortcuts(
  config?: Partial<KeyboardShortcutsConfig> | null,
): void {
  shortcuts = normalizeKeyboardShortcuts(config);
}

export function registerKeyboardShortcutHandler(webContents: WebContents): void {
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const payload = {
      key: input.key,
      code: input.code,
      metaKey: input.meta,
      ctrlKey: input.control,
      shiftKey: input.shift,
      altKey: input.alt,
    };

    for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
      const binding = shortcuts[action];
      if (!bindingUsesTab(binding)) continue;
      if (!keyboardShortcutMatchesInput(payload, binding)) continue;
      event.preventDefault();
      webContents.send(IPC.ShortcutAction, action);
      return;
    }
  });
}
