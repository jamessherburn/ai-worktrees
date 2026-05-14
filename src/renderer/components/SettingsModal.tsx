import { useEffect, useState } from 'react';
import type { Settings, ThemePreference } from '@shared/types';
import type { WizardConfig } from '@shared/wizard';
import { WizardEditModal } from './WizardEditModal';

type Props = {
  current: Settings;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
};

export function SettingsModal({ current, onClose, onSaved }: Props) {
  const [codeDir, setCodeDir] = useState(current.codeDir);
  const [theme, setTheme] = useState<ThemePreference>(current.theme);
  const [wizard, setWizard] = useState<WizardConfig>(current.wizard);
  const [busy, setBusy] = useState(false);
  const [showWizardEdit, setShowWizardEdit] = useState(false);

  useEffect(() => {
    setCodeDir(current.codeDir);
    setTheme(current.theme);
    setWizard(current.wizard);
  }, [current]);

  const pick = async () => {
    const next = await window.api.pickDirectory(codeDir);
    if (next) setCodeDir(next);
  };

  const save = async () => {
    setBusy(true);
    const next = await window.api.updateSettings({ codeDir, theme, wizard });
    onSaved(next);
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Settings</div>
          </div>
          <div className="modal-body">
            <div className="field">
              <label className="field-label">Code directory</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ flex: 1 }} value={codeDir} onChange={(e) => setCodeDir(e.target.value)} />
                <button className="btn btn-ghost" onClick={pick}>Browse…</button>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                Where the "New Session" picker scans for git repositories.
              </div>
            </div>
            <div className="field">
              <label className="field-label">Appearance</label>
              <div className="theme-toggle">
                {(['system', 'light', 'dark'] as ThemePreference[]).map((opt) => (
                  <button
                    key={opt}
                    className={`theme-option${theme === opt ? ' active' : ''}`}
                    onClick={() => setTheme(opt)}
                    type="button"
                  >
                    {opt[0].toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field-label">Session wizard</label>
              <button type="button" className="btn btn-ghost" onClick={() => setShowWizardEdit(true)}>
                Edit Wizard…
              </button>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Configure questions and the markdown template used when "Use Wizard Mode" is enabled for a new session.
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !codeDir}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {showWizardEdit && (
        <WizardEditModal
          initial={wizard}
          onClose={() => setShowWizardEdit(false)}
          onSaved={(nextWizard) => {
            setWizard(nextWizard);
            setShowWizardEdit(false);
          }}
        />
      )}
    </>
  );
}
