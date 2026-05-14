import { useMemo } from 'react';
import type {
  WizardConfig,
  WizardQuestion,
  WizardShowWhen,
  WizardSingleQuestion,
} from '@shared/wizard';

type Props = {
  value: WizardConfig;
  onChange: (next: WizardConfig) => void;
};

const KINDS: WizardQuestion['kind'][] = ['single', 'multi', 'text', 'textarea'];

function morphQuestionKind(q: WizardQuestion, kind: WizardQuestion['kind']): WizardQuestion {
  const base = { id: q.id, prompt: q.prompt, showWhen: q.showWhen };
  if (kind === 'single' || kind === 'multi') {
    const options =
      q.kind === 'single' || q.kind === 'multi'
        ? q.options
        : [
            { id: 'a', label: 'Option A' },
            { id: 'b', label: 'Option B' },
          ];
    return { ...base, kind, options };
  }
  const placeholder = q.kind === 'text' || q.kind === 'textarea' ? q.placeholder : undefined;
  return { ...base, kind, placeholder };
}

function newQuestion(): WizardSingleQuestion {
  return {
    id: `q_${Math.random().toString(36).slice(2, 9)}`,
    prompt: 'New question',
    kind: 'single',
    options: [
      { id: 'a', label: 'Option A' },
      { id: 'b', label: 'Option B' },
    ],
  };
}

export function WizardConfigEditor({ value, onChange }: Props) {
  const otherIds = useMemo(
    () => (idx: number) => value.questions.map((q) => q.id).filter((_, i) => i !== idx),
    [value.questions],
  );

  const setTemplate = (promptTemplate: string) => {
    onChange({ ...value, promptTemplate });
  };

  const replaceQuestion = (index: number, q: WizardQuestion) => {
    const questions = value.questions.slice();
    questions[index] = q;
    onChange({ ...value, questions });
  };

  const removeQuestion = (index: number) => {
    onChange({ ...value, questions: value.questions.filter((_, i) => i !== index) });
  };

  const moveQuestion = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= value.questions.length) return;
    const questions = value.questions.slice();
    const t = questions[index];
    questions[index] = questions[j];
    questions[j] = t;
    onChange({ ...value, questions });
  };

  const addQuestion = () => {
    onChange({ ...value, questions: [...value.questions, newQuestion()] });
  };

  const setShowWhen = (index: number, sw: WizardShowWhen | undefined) => {
    const q = value.questions[index];
    replaceQuestion(index, { ...q, showWhen: sw });
  };

  return (
    <div className="wizard-config-editor">
      <div className="wizard-config-section">
        <label className="field-label">Briefing template</label>
        <p className="wizard-config-hint">
          Markdown sent to the session. Use placeholders like <code className="kbd">{'{{questionId}}'}</code> — each id
          matches a question below. Empty sections collapse automatically.
        </p>
        <textarea
          className="wizard-template-editor"
          value={value.promptTemplate}
          onChange={(e) => setTemplate(e.target.value)}
          spellCheck={false}
          rows={12}
        />
      </div>

      <div className="wizard-config-section">
        <div className="wizard-config-section-head">
          <label className="field-label" style={{ marginBottom: 0 }}>
            Questions
          </label>
          <button type="button" className="btn btn-ghost btn-small" onClick={addQuestion}>
            Add question
          </button>
        </div>
        <p className="wizard-config-hint">Order matches the flow in the session wizard. Conditional steps use “Show when”.</p>

        <div className="wizard-question-list">
          {value.questions.map((q, index) => (
            <div key={index} className="wizard-question-card">
              <div className="wizard-question-card-toolbar">
                <span className="wizard-question-card-title">Question {index + 1}</span>
                <div className="wizard-question-card-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    disabled={index === value.questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => removeQuestion(index)}>
                    Remove
                  </button>
                </div>
              </div>

              <div className="wizard-question-grid">
                <div className="field wizard-question-field-span2">
                  <label className="field-label field-label-sm">Id (for template placeholders)</label>
                  <input
                    value={q.id}
                    onChange={(e) => replaceQuestion(index, { ...q, id: e.target.value })}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div className="field wizard-question-field-span2">
                  <label className="field-label field-label-sm">Prompt</label>
                  <input
                    value={q.prompt}
                    onChange={(e) => replaceQuestion(index, { ...q, prompt: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="field-label field-label-sm">Type</label>
                  <select
                    value={q.kind}
                    onChange={(e) =>
                      replaceQuestion(index, morphQuestionKind(q, e.target.value as WizardQuestion['kind']))
                    }
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k === 'single' ? 'Single choice' : k === 'multi' ? 'Multiple choice' : k === 'text' ? 'Short text' : 'Long text'}
                      </option>
                    ))}
                  </select>
                </div>
                {(q.kind === 'text' || q.kind === 'textarea') && (
                  <div className="field">
                    <label className="field-label field-label-sm">Placeholder (optional)</label>
                    <input
                      value={q.placeholder ?? ''}
                      onChange={(e) =>
                        replaceQuestion(index, {
                          ...q,
                          kind: q.kind,
                          placeholder: e.target.value || undefined,
                        })
                      }
                    />
                  </div>
                )}
              </div>

              {(q.kind === 'single' || q.kind === 'multi') && (
                <div className="wizard-options-editor">
                  <div className="field-label field-label-sm">Options</div>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="wizard-option-row">
                      <input
                        className="wizard-option-id"
                        value={opt.id}
                        onChange={(e) => {
                          const options = q.options.slice();
                          options[oi] = { ...opt, id: e.target.value };
                          replaceQuestion(index, { ...q, kind: q.kind, options });
                        }}
                        placeholder="id"
                        spellCheck={false}
                      />
                      <input
                        className="wizard-option-label"
                        value={opt.label}
                        onChange={(e) => {
                          const options = q.options.slice();
                          options[oi] = { ...opt, label: e.target.value };
                          replaceQuestion(index, { ...q, kind: q.kind, options });
                        }}
                        placeholder="Label"
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={q.options.length <= 1}
                        onClick={() => {
                          const options = q.options.filter((_, i) => i !== oi);
                          replaceQuestion(index, { ...q, kind: q.kind, options });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm wizard-add-option"
                    onClick={() => {
                      const n = q.options.length + 1;
                      replaceQuestion(index, {
                        ...q,
                        kind: q.kind,
                        options: [...q.options, { id: `opt_${n}`, label: `Option ${n}` }],
                      });
                    }}
                  >
                    Add option
                  </button>
                </div>
              )}

              <div className="wizard-show-when">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!q.showWhen}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const pick = otherIds(index)[0];
                        if (pick) setShowWhen(index, { questionId: pick, equals: '' });
                        else setShowWhen(index, { questionId: '', equals: '' });
                      } else setShowWhen(index, undefined);
                    }}
                  />
                  <span>Only show when another answer matches…</span>
                </label>
                {q.showWhen && (
                  <div className="wizard-show-when-fields">
                    <select
                      value={q.showWhen.questionId}
                      onChange={(e) =>
                        setShowWhen(index, { ...q.showWhen!, questionId: e.target.value, equals: q.showWhen!.equals })
                      }
                    >
                      <option value="">Pick question…</option>
                      {otherIds(index).map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                    <span className="wizard-show-when-eq">equals</span>
                    <input
                      value={q.showWhen.equals}
                      onChange={(e) =>
                        setShowWhen(index, { ...q.showWhen!, equals: e.target.value })
                      }
                      placeholder="option id (e.g. build-new)"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
