import { APP_KEYBOARD_SHORTCUTS } from '@shared/app-shortcuts';
import { DEFAULT_NVIM_CONFIG } from '@shared/nvim-config';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function NvimConfigSettingsEditor({ value, onChange }: Props) {
  const resetDefaults = () => onChange(DEFAULT_NVIM_CONFIG);

  return (
    <div className="nvim-config-settings">
      <div className="app-shortcuts-reference">
        <div className="app-shortcuts-reference-title">Keyboard shortcuts</div>
        <ul className="app-shortcuts-reference-list">
          {APP_KEYBOARD_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="app-shortcuts-reference-row">
              <span className="app-shortcuts-reference-keys">
                {shortcut.keys.split('+').map((part, index, parts) => (
                  <span key={`${shortcut.keys}-${part}`}>
                    {index > 0 ? <span className="app-shortcuts-reference-plus">+</span> : null}
                    <span className="kbd">{part}</span>
                  </span>
                ))}
              </span>
              <span className="app-shortcuts-reference-description">{shortcut.description}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted settings-field-hint">
        Lua config used by the Flight Deck editor. This is separate from your personal Neovim setup
        and is passed via <code className="kbd">nvim -u</code>. Plugins install into app data on first
        launch (NERDTree and Go/JS syntax via treesitter). Editor colors follow the app appearance
        setting.
      </p>
      <textarea
        className="nvim-config-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        aria-label="Neovim configuration"
      />
      <button type="button" className="btn btn-ghost btn-small" onClick={resetDefaults}>
        Reset editor config to defaults
      </button>
    </div>
  );
}
