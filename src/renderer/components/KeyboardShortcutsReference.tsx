import { APP_KEYBOARD_SHORTCUTS } from '@shared/app-shortcuts';

function ShortcutKeys({ keys }: { keys: string }) {
  const parts = keys.split('+');
  return (
    <span className="app-shortcuts-reference-keys">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 && <span className="app-shortcuts-reference-plus">+</span>}
          <kbd className="kbd">{part}</kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcutsReference() {
  return (
    <>
      <p className="muted keyboard-shortcuts-settings-hint">
        Fixed shortcuts for quick navigation. They work from the main workspace, including while
        focus is in a terminal. Shift+N cycles every non-muted session in the sidebar — global and
        repo worktrees are treated the same.
      </p>
      <div className="app-shortcuts-reference">
        <ul className="app-shortcuts-reference-list">
          {APP_KEYBOARD_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.id} className="app-shortcuts-reference-row">
              <span className="app-shortcuts-reference-description">{shortcut.description}</span>
              <ShortcutKeys keys={shortcut.keys} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
