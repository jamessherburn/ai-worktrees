export type AppShortcutId =
  | 'nextSession'
  | 'toggleTerminal'
  | 'toggleGit'
  | 'jumpFocus'
  | 'scrollToBottom'
  | 'openVSCode'
  | 'openFinder'
  | 'newSession';

export type AppShortcutReference = {
  id: AppShortcutId;
  keys: string;
  description: string;
};

export const APP_KEYBOARD_SHORTCUTS: AppShortcutReference[] = [
  { id: 'nextSession', keys: 'Shift+N', description: 'Next session in sidebar (skips muted)' },
  { id: 'toggleTerminal', keys: 'Shift+T', description: 'Toggle terminal panel (active session)' },
  { id: 'toggleGit', keys: 'Shift+G', description: 'Toggle git panel (active session)' },
  {
    id: 'jumpFocus',
    keys: 'Shift+J',
    description:
      'Cycle focus: agent terminal, shell panel (when open), and skills prompt (active session)',
  },
  {
    id: 'scrollToBottom',
    keys: 'Shift+↓',
    description: 'Scroll to the bottom of the active session agent terminal',
  },
  { id: 'openVSCode', keys: 'Shift+V', description: 'Open session in VS Code (active session)' },
  { id: 'openFinder', keys: 'Shift+F', description: 'Open session in Finder (active session)' },
  { id: 'newSession', keys: 'Shift+C', description: 'Create new session' },
];

type ShortcutLetter = 'n' | 't' | 'g' | 'j' | 'v' | 'f' | 'c';

function matchesShiftLetter(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>,
  letter: ShortcutLetter,
): boolean {
  if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  const code = `Key${letter.toUpperCase()}`;
  if (event.code === code) return true;
  return event.key.toLowerCase() === letter;
}

function matchesShiftArrowDown(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>,
): boolean {
  if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.key === 'ArrowDown' || event.code === 'ArrowDown';
}

export function matchAppShortcut(
  event: KeyboardEvent,
): AppShortcutId | null {
  if (matchesShiftLetter(event, 'n')) return 'nextSession';
  if (matchesShiftLetter(event, 't')) return 'toggleTerminal';
  if (matchesShiftLetter(event, 'g')) return 'toggleGit';
  if (matchesShiftLetter(event, 'j')) return 'jumpFocus';
  if (matchesShiftArrowDown(event)) return 'scrollToBottom';
  if (matchesShiftLetter(event, 'v')) return 'openVSCode';
  if (matchesShiftLetter(event, 'f')) return 'openFinder';
  if (matchesShiftLetter(event, 'c')) return 'newSession';
  return null;
}

/** Ignore app shortcuts while typing in regular form fields (not xterm). */
export function shouldIgnoreAppShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('.xterm, .terminal-host')) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
