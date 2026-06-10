export type AppShortcutReference = {
  keys: string;
  description: string;
};

export const APP_KEYBOARD_SHORTCUTS: AppShortcutReference[] = [
  { keys: 'Shift+L', description: 'Next session (skips muted)' },
  { keys: 'Shift+K', description: 'Cycle panels (editor → agent → terminal)' },
  { keys: 'Shift+N', description: 'Toggle session notes' },
  { keys: 'Shift+J', description: 'Toggle file tree ↔ editor (Neovim only)' },
];

function shiftKeyMatches(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>,
  letter: 'j' | 'k' | 'l' | 'n',
): boolean {
  if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  const lower = event.key.toLowerCase();
  if (lower === letter) return true;
  const code =
    letter === 'j' ? 'KeyJ' : letter === 'k' ? 'KeyK' : letter === 'l' ? 'KeyL' : 'KeyN';
  return event.code === code;
}

export function matchesShiftL(event: KeyboardEvent): boolean {
  return shiftKeyMatches(event, 'l');
}

export function matchesShiftK(event: KeyboardEvent): boolean {
  return shiftKeyMatches(event, 'k');
}

export function matchesShiftN(event: KeyboardEvent): boolean {
  return shiftKeyMatches(event, 'n');
}

/** Ignore app shortcuts while typing in regular form fields (not xterm). */
export function shouldIgnoreAppShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('.session-notes-textarea')) return false;
  if (target.closest('.xterm, .terminal-host')) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
