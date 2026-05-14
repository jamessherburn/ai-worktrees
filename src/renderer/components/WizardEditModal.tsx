import { useEffect, useState } from 'react';
import type { WizardConfig } from '@shared/wizard';
import { DEFAULT_WIZARD_CONFIG, parseWizardConfigJson, wizardConfigToJson } from '@shared/wizard';

type Props = {
  initial: WizardConfig;
  onClose: () => void;
  onSaved: (next: WizardConfig) => void;
};

export function WizardEditModal({ initial, onClose, onSaved }: Props) {
  const [json, setJson] = useState(() => wizardConfigToJson(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setJson(wizardConfigToJson(initial));
  }, [initial]);

  const resetDefaults = () => {
    setJson(wizardConfigToJson(DEFAULT_WIZARD_CONFIG));
    setError(null);
  };

  const save = async () => {
    const parsed = parseWizardConfigJson(json);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await window.api.updateSettings({ wizard: parsed.value });
      onSaved(parsed.value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Edit Wizard</div>
          <div className="modal-subtitle">
            Questions and the markdown template are stored as JSON. Use <code className="kbd">{'{{questionId}}'}</code>{' '}
            placeholders in <span className="kbd">promptTemplate</span>.
          </div>
        </div>
        <div className="modal-body wizard-edit-body">
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Wizard configuration (JSON)</label>
            <textarea
              className="wizard-json-editor"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={resetDefaults} disabled={busy}>
            Reset to defaults
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
