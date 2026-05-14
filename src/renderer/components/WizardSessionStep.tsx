import { useEffect, useMemo, useState } from 'react';
import type { WizardConfig, WizardAnswers, WizardQuestion } from '@shared/wizard';
import { buildWizardMarkdown, questionVisible, validateWizardAnswers } from '@shared/wizard';

type Props = {
  config: WizardConfig;
  onBack: () => void;
  onConfirm: (markdown: string) => void;
  busy: boolean;
};

function initAnswers(questions: WizardQuestion[]): WizardAnswers {
  const a: WizardAnswers = {};
  for (const q of questions) {
    if (q.kind === 'multi') a[q.id] = [];
    else a[q.id] = '';
  }
  return a;
}

export function WizardSessionStep({ config, onBack, onConfirm, busy }: Props) {
  const [answers, setAnswers] = useState<WizardAnswers>(() => initAnswers(config.questions));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnswers(initAnswers(config.questions));
    setError(null);
  }, [config]);

  const setSingle = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMulti = (id: string, optionId: string) => {
    setAnswers((prev) => {
      const cur = prev[id];
      const list = Array.isArray(cur) ? [...cur] : [];
      const i = list.indexOf(optionId);
      if (i >= 0) list.splice(i, 1);
      else list.push(optionId);
      return { ...prev, [id]: list };
    });
  };

  const setText = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const visibleQuestions = useMemo(
    () => config.questions.filter((q) => questionVisible(q, answers)),
    [config.questions, answers],
  );

  const submit = () => {
    const v = validateWizardAnswers(config, answers);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    onConfirm(buildWizardMarkdown(config, answers));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onBack();
  };

  return (
    <>
      <div className="modal-header">
        <div className="modal-title">Session wizard</div>
        <div className="modal-subtitle">
          Answer a few questions so we can generate a clear briefing for your agent.
        </div>
      </div>
      <div className="modal-body wizard-session-body" onKeyDown={onKeyDown}>
        {visibleQuestions.map((q) => (
          <div key={q.id} className="field wizard-field">
            <label className="field-label">{q.prompt}</label>
            {q.kind === 'single' && (
              <div className="wizard-options">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt.id;
                  return (
                    <label key={opt.id} className={`wizard-option${selected ? ' selected' : ''}`}>
                      <input
                        type="radio"
                        name={q.id}
                        checked={selected}
                        onChange={() => setSingle(q.id, opt.id)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {q.kind === 'multi' && (
              <div className="wizard-options">
                {q.options.map((opt) => {
                  const list = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                  const checked = list.includes(opt.id);
                  return (
                    <label key={opt.id} className={`wizard-option${checked ? ' selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMulti(q.id, opt.id)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {q.kind === 'text' && (
              <input
                value={typeof answers[q.id] === 'string' ? answers[q.id] : ''}
                onChange={(e) => setText(q.id, e.target.value)}
                placeholder={q.placeholder}
                autoComplete="off"
              />
            )}
            {q.kind === 'textarea' && (
              <textarea
                className="wizard-textarea"
                rows={4}
                value={typeof answers[q.id] === 'string' ? answers[q.id] : ''}
                onChange={(e) => setText(q.id, e.target.value)}
                placeholder={q.placeholder}
                spellCheck
              />
            )}
          </div>
        ))}
        {error && <div className="modal-error">{error}</div>}
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create Session'}
        </button>
      </div>
    </>
  );
}
