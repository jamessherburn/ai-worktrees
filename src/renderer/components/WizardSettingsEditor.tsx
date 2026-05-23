import { useState } from 'react';
import type { WizardConfig } from '@shared/wizard';
import { DEFAULT_WIZARD_CONFIG, parseWizardConfigJson, wizardConfigToJson } from '@shared/wizard';
import { WizardConfigEditor } from './WizardConfigEditor';

type Props = {
  value: WizardConfig;
  onChange: (next: WizardConfig) => void;
};

export function WizardSettingsEditor({ value, onChange }: Props) {
  const [rawJson, setRawJson] = useState(() => wizardConfigToJson(value));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const resetDefaults = () => {
    onChange(DEFAULT_WIZARD_CONFIG);
    setRawJson(wizardConfigToJson(DEFAULT_WIZARD_CONFIG));
    setJsonError(null);
  };

  const applyRawJson = () => {
    const parsed = parseWizardConfigJson(rawJson);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return;
    }
    setJsonError(null);
    onChange(parsed.value);
    setRawJson(wizardConfigToJson(parsed.value));
  };

  return (
    <div className="wizard-settings-panel">
      <p className="muted wizard-config-hint wizard-settings-intro">
        Questions and briefing template used when &ldquo;Use Wizard Mode&rdquo; is enabled for a new session.
        Placeholders use <code className="kbd">{'{{questionId}}'}</code> syntax.
      </p>

      <WizardConfigEditor value={value} onChange={onChange} />

      <details
        className="wizard-raw-json"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) {
            setRawJson(wizardConfigToJson(value));
          }
        }}
      >
        <summary>Advanced: raw JSON</summary>
        <p className="wizard-config-hint">
          Paste or edit the full config. Apply replaces the form above.
        </p>
        <textarea
          className="wizard-json-editor"
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="wizard-raw-json-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={applyRawJson}>
            Apply JSON to form
          </button>
        </div>
      </details>

      {jsonError && <div className="modal-error">{jsonError}</div>}

      <button type="button" className="btn btn-ghost btn-small wizard-settings-reset" onClick={resetDefaults}>
        Reset wizard to defaults
      </button>
    </div>
  );
}
