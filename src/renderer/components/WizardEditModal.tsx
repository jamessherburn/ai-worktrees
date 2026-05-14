import { useEffect, useState } from 'react';
import type { WizardConfig } from '@shared/wizard';
import { DEFAULT_WIZARD_CONFIG, parseWizardConfigJson, wizardConfigToJson } from '@shared/wizard';
import { WizardConfigEditor } from './WizardConfigEditor';

type Props = {
  initial: WizardConfig;
  onClose: () => void;
  onSaved: (next: WizardConfig) => void;
};

export function WizardEditModal({ initial, onClose, onSaved }: Props) {
  const [config, setConfig] = useState<WizardConfig>(initial);
  const [rawJson, setRawJson] = useState(() => wizardConfigToJson(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConfig(initial);
    setRawJson(wizardConfigToJson(initial));
  }, [initial]);

  const resetDefaults = () => {
    setConfig(DEFAULT_WIZARD_CONFIG);
    setRawJson(wizardConfigToJson(DEFAULT_WIZARD_CONFIG));
    setError(null);
  };

  const applyRawJson = () => {
    const parsed = parseWizardConfigJson(rawJson);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setConfig(parsed.value);
    setRawJson(wizardConfigToJson(parsed.value));
  };

  const save = async () => {
    const parsed = parseWizardConfigJson(wizardConfigToJson(config));
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
            Design questions and the briefing template. Placeholders use <code className="kbd">{'{{questionId}}'}</code>{' '}
            syntax.
          </div>
        </div>
        <div className="modal-body wizard-edit-body">
          <WizardConfigEditor value={config} onChange={setConfig} />

          <details
            className="wizard-raw-json"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setRawJson(wizardConfigToJson(config));
              }
            }}
          >
            <summary>Advanced: raw JSON</summary>
            <p className="wizard-config-hint">
              Paste or edit the full config. Apply replaces the form above; Save still validates everything.
            </p>
            <textarea
              className="wizard-json-editor"
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="wizard-raw-json-actions">
              <button type="button" className="btn btn-ghost btn-small" onClick={applyRawJson} disabled={busy}>
                Apply JSON to form
              </button>
            </div>
          </details>

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
