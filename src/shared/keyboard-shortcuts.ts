export const KEYBOARD_SHORTCUT_ACTIONS = [
  'newSession',
  'nextSession',
  'scrollToBottom',
  'focusAgentInput',
  'modalExpand',
  'modalMinimize',
] as const;

export type KeyboardShortcutAction = (typeof KEYBOARD_SHORTCUT_ACTIONS)[number];

export type KeyboardShortcutBinding = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type KeyboardShortcutsConfig = Record<KeyboardShortcutAction, KeyboardShortcutBinding>;

/** Previous Command-based defaults; migrated automatically on load. */
export const LEGACY_META_KEYBOARD_SHORTCUTS: KeyboardShortcutsConfig = {
  newSession: { key: '+', meta: true },
  nextSession: { key: 'Tab', meta: true },
  scrollToBottom: { key: 'ArrowDown', meta: true },
  focusAgentInput: { key: 'i', meta: true },
  modalExpand: { key: 'Enter', meta: true },
  modalMinimize: { key: '-', meta: true },
};

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutsConfig = {
  newSession: { key: '+', shift: true },
  nextSession: { key: 'Tab', shift: true },
  scrollToBottom: { key: 'ArrowDown', shift: true },
  focusAgentInput: { key: 'i', shift: true },
  modalExpand: { key: 'Enter', shift: true },
  modalMinimize: { key: '-', shift: true },
};

export const KEYBOARD_SHORTCUT_LABELS: Record<KeyboardShortcutAction, string> = {
  newSession: 'Create new session',
  nextSession: 'Next session',
  scrollToBottom: 'Scroll agent to bottom',
  focusAgentInput: 'Focus agent input',
  modalExpand: 'Expand modal to full window',
  modalMinimize: 'Restore modal size',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bindingsEqual(a: KeyboardShortcutBinding, b: KeyboardShortcutBinding): boolean {
  return (
    a.key === b.key &&
    !!a.meta === !!b.meta &&
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt
  );
}

function normalizeBinding(
  raw: unknown,
  fallback: KeyboardShortcutBinding,
): KeyboardShortcutBinding {
  if (!isRecord(raw) || typeof raw.key !== 'string' || !raw.key.trim()) {
    return { ...fallback };
  }
  return {
    key: raw.key.trim(),
    meta: raw.meta === true,
    ctrl: raw.ctrl === true,
    shift: raw.shift === true,
    alt: raw.alt === true,
  };
}

export function normalizeKeyboardShortcuts(
  input?: Partial<KeyboardShortcutsConfig> | null,
): KeyboardShortcutsConfig {
  const next = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  if (!input) return next;
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    const raw = input[action];
    if (!raw) continue;
    let binding = normalizeBinding(raw, DEFAULT_KEYBOARD_SHORTCUTS[action]);
    if (bindingsEqual(binding, LEGACY_META_KEYBOARD_SHORTCUTS[action])) {
      binding = DEFAULT_KEYBOARD_SHORTCUTS[action];
    }
    next[action] = binding;
  }
  return next;
}

function modifierSuffix(binding: KeyboardShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  return parts.join('+');
}

function displayKey(key: string, binding?: KeyboardShortcutBinding): string {
  if (binding?.shift && key === '_') return '-';
  switch (key) {
    case ' ':
      return 'Space';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'Tab':
      return 'Tab';
    case 'Enter':
      return 'Enter';
    case 'Escape':
      return 'Esc';
    case 'Backspace':
      return 'Backspace';
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

export function formatKeyboardShortcut(binding: KeyboardShortcutBinding): string {
  const parts: string[] = [];
  if (binding.meta) parts.push('⌘');
  if (binding.shift) parts.push('⇧');
  const mods = modifierSuffix(binding);
  if (mods) parts.push(mods);
  parts.push(displayKey(binding.key, binding));
  return parts.join('+').replace(/\+\+/g, '+');
}

function normalizeEventKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function normalizeBindingKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function keysMatch(
  eventKey: string,
  binding: KeyboardShortcutBinding,
  eventCode?: string,
): boolean {
  const normalizedEvent = normalizeEventKey(eventKey);
  const normalizedBinding = normalizeBindingKey(binding.key);
  if (normalizedEvent === normalizedBinding) return true;
  // Shift+minus reports as '_' on US keyboards; match the physical key too.
  if (binding.shift && normalizedBinding === '-') {
    if (normalizedEvent === '_' || normalizedEvent === '-') return true;
    if (eventCode === 'Minus' || eventCode === 'NumpadSubtract') return true;
  }
  // Shift+plus is often Shift+= on US keyboards.
  if (binding.shift && normalizedBinding === '+') {
    if (eventCode === 'Equal' || eventCode === 'NumpadAdd') return true;
  }
  return false;
}

export type KeyboardInputLike = {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

function modifiersMatch(binding: KeyboardShortcutBinding, input: KeyboardInputLike): boolean {
  if (!!binding.meta !== !!input.metaKey) return false;
  if (!!binding.ctrl !== !!input.ctrlKey) return false;
  if (!!binding.shift !== !!input.shiftKey) return false;
  if (!!binding.alt !== !!input.altKey) return false;
  return true;
}

export function keyboardShortcutMatchesInput(
  input: KeyboardInputLike,
  binding: KeyboardShortcutBinding,
): boolean {
  if (!keysMatch(input.key, binding, input.code)) return false;
  return modifiersMatch(binding, input);
}

export function keyboardShortcutMatches(
  event: KeyboardEvent,
  binding: KeyboardShortcutBinding,
): boolean {
  return keyboardShortcutMatchesInput(
    {
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    },
    binding,
  );
}

/** True when the binding uses Tab and must be intercepted in the Electron main process. */
export function bindingUsesTab(binding: KeyboardShortcutBinding): boolean {
  return binding.key.toLowerCase() === 'tab';
}

function isXtermTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('.terminal-host, .xterm, .xterm-helper-textarea') !== null;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (isXtermTarget(target)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

export function shouldAllowShortcut(
  event: KeyboardEvent,
  action: KeyboardShortcutAction,
): boolean {
  if (!isFormFieldTarget(event.target)) return true;
  return (
    action === 'modalExpand' ||
    action === 'modalMinimize' ||
    action === 'newSession' ||
    action === 'nextSession'
  );
}

export function bindingFromKeyboardEvent(event: KeyboardEvent): KeyboardShortcutBinding | null {
  if (event.key === 'Escape') return null;
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) return null;
  return {
    key: event.key,
    meta: event.metaKey || undefined,
    ctrl: event.ctrlKey || undefined,
    shift: event.shiftKey || undefined,
    alt: event.altKey || undefined,
  };
}
