/** Wizard configuration stored in Settings and used when starting a session. */

export type WizardShowWhen = { questionId: string; equals: string };

export type WizardQuestionBase = {
  id: string;
  prompt: string;
  showWhen?: WizardShowWhen;
};

export type WizardSingleQuestion = WizardQuestionBase & {
  kind: 'single';
  options: { id: string; label: string }[];
};

export type WizardMultiQuestion = WizardQuestionBase & {
  kind: 'multi';
  options: { id: string; label: string }[];
};

export type WizardTextQuestion = WizardQuestionBase & {
  kind: 'text' | 'textarea';
  placeholder?: string;
};

export type WizardQuestion = WizardSingleQuestion | WizardMultiQuestion | WizardTextQuestion;

export type WizardConfig = {
  questions: WizardQuestion[];
  /** Markdown with `{{questionId}}` placeholders replaced by human-readable answers. */
  promptTemplate: string;
};

export type WizardAnswers = Record<string, string | string[]>;

export const DEFAULT_WIZARD_CONFIG: WizardConfig = {
  questions: [
    {
      id: 'intention',
      prompt: 'What is your intention for this session?',
      kind: 'single',
      options: [
        { id: 'build-new', label: 'Build something new' },
        { id: 'verify', label: 'Help me verify something' },
      ],
    },
    {
      id: 'verify_details',
      prompt: 'What do you want to verify?',
      kind: 'textarea',
      placeholder: 'Describe the behavior, change, or risk you want checked…',
      showWhen: { questionId: 'intention', equals: 'verify' },
    },
    {
      id: 'build_context',
      prompt: 'What are we building or changing? Add goals, constraints, and anything else to kick off the session.',
      kind: 'textarea',
      placeholder: 'Describe the feature, bugfix, or refactor; tech preferences; acceptance criteria…',
      showWhen: { questionId: 'intention', equals: 'build-new' },
    },
    {
      id: 'unit_tests_first',
      prompt: 'For this build, should we add unit tests first?',
      kind: 'single',
      options: [
        { id: 'yes', label: 'Yes — tests first' },
        { id: 'no', label: 'No — skip tests-first for now' },
      ],
      showWhen: { questionId: 'intention', equals: 'build-new' },
    },
    {
      id: 'execution_style',
      prompt: 'How should the agent proceed?',
      kind: 'single',
      options: [
        { id: 'plan-first', label: 'Use plan mode first, then implement' },
        { id: 'apply-straight', label: 'Apply changes straight away (no separate plan step)' },
      ],
      showWhen: { questionId: 'intention', equals: 'build-new' },
    },
    {
      id: 'auto_pr',
      prompt: 'When work is ready, should the agent automatically open or raise a pull request?',
      kind: 'single',
      options: [
        { id: 'yes', label: 'Yes — auto PR when appropriate' },
        { id: 'no', label: 'No — I will handle PRs myself' },
      ],
      showWhen: { questionId: 'intention', equals: 'build-new' },
    },
  ],
  promptTemplate: `## Session briefing (wizard)

**Intention:** {{intention}}

**What we're verifying**
{{verify_details}}

**What we're building or changing**
{{build_context}}

**Build preferences** (when starting new work)
- Unit tests first: {{unit_tests_first}}
- Execution style: {{execution_style}}
- Auto PR: {{auto_pr}}
`,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseShowWhen(raw: unknown): WizardShowWhen | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return undefined;
  const questionId = raw.questionId;
  const equals = raw.equals;
  if (typeof questionId !== 'string' || typeof equals !== 'string') return undefined;
  return { questionId, equals };
}

function parseOptions(raw: unknown): { id: string; label: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { id: string; label: string }[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== 'string' || typeof item.label !== 'string') return null;
    out.push({ id: item.id, label: item.label });
  }
  return out;
}

function parseQuestion(raw: unknown): WizardQuestion | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const prompt = raw.prompt;
  const kind = raw.kind;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof prompt !== 'string' || prompt.length === 0) return null;
  const showWhen = parseShowWhen(raw.showWhen);

  if (kind === 'single' || kind === 'multi') {
    const options = parseOptions(raw.options);
    if (!options || options.length === 0) return null;
    return { id, prompt, kind, options, showWhen };
  }
  if (kind === 'text' || kind === 'textarea') {
    const placeholder = typeof raw.placeholder === 'string' ? raw.placeholder : undefined;
    return { id, prompt, kind, placeholder, showWhen };
  }
  return null;
}

export function normalizeWizardConfig(raw: unknown): WizardConfig {
  if (raw === undefined || raw === null) return DEFAULT_WIZARD_CONFIG;
  const parsed = parseWizardConfigJson(JSON.stringify(raw));
  return parsed.ok ? parsed.value : DEFAULT_WIZARD_CONFIG;
}

export function parseWizardConfigJson(json: string): { ok: true; value: WizardConfig } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'Root must be an object.' };
  const questionsRaw = parsed.questions;
  const promptTemplate = parsed.promptTemplate;
  if (!Array.isArray(questionsRaw)) return { ok: false, error: '"questions" must be an array.' };
  if (typeof promptTemplate !== 'string') return { ok: false, error: '"promptTemplate" must be a string.' };

  const questions: WizardQuestion[] = [];
  const seen = new Set<string>();
  for (const q of questionsRaw) {
    const parsedQ = parseQuestion(q);
    if (!parsedQ) return { ok: false, error: 'Each question must have id, prompt, kind, and valid fields for that kind.' };
    if (seen.has(parsedQ.id)) return { ok: false, error: `Duplicate question id: ${parsedQ.id}` };
    seen.add(parsedQ.id);
    questions.push(parsedQ);
  }

  return { ok: true, value: { questions, promptTemplate } };
}

export function wizardConfigToJson(config: WizardConfig): string {
  return JSON.stringify({ questions: config.questions, promptTemplate: config.promptTemplate }, null, 2);
}

export function questionVisible(q: WizardQuestion, answers: WizardAnswers): boolean {
  if (!q.showWhen) return true;
  const v = answers[q.showWhen.questionId];
  return typeof v === 'string' && v === q.showWhen.equals;
}

function formatAnswerValue(q: WizardQuestion, raw: string | string[] | undefined): string {
  if (raw === undefined) return '';
  if (q.kind === 'single') {
    const id = typeof raw === 'string' ? raw : '';
    const opt = q.options.find((o) => o.id === id);
    return opt?.label ?? id;
  }
  if (q.kind === 'multi') {
    const ids = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    return ids
      .map((id) => q.options.find((o) => o.id === id)?.label ?? id)
      .filter(Boolean)
      .join(', ');
  }
  if (typeof raw === 'string') return raw.trim();
  return '';
}

/** Replace `{{id}}` in template using formatted answers; unknown ids become empty string. */
export function buildWizardMarkdown(config: WizardConfig, answers: WizardAnswers): string {
  const byId = new Map<string, WizardQuestion>();
  for (const q of config.questions) byId.set(q.id, q);

  const out = config.promptTemplate.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, id: string) => {
    const q = byId.get(id);
    if (!q) return '';
    if (!questionVisible(q, answers)) return '';
    return formatAnswerValue(q, answers[id]);
  });
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function validateWizardAnswers(
  config: WizardConfig,
  answers: WizardAnswers,
): { ok: true } | { ok: false; error: string } {
  for (const q of config.questions) {
    if (!questionVisible(q, answers)) continue;
    const v = answers[q.id];
    if (q.kind === 'single') {
      if (typeof v !== 'string' || !q.options.some((o) => o.id === v)) {
        return { ok: false, error: `Please answer: ${q.prompt}` };
      }
    } else if (q.kind === 'multi') {
      const ids = Array.isArray(v) ? v : [];
      if (ids.length === 0) return { ok: false, error: `Pick at least one option: ${q.prompt}` };
      for (const id of ids) {
        if (typeof id !== 'string' || !q.options.some((o) => o.id === id)) {
          return { ok: false, error: `Invalid selection for: ${q.prompt}` };
        }
      }
    } else {
      if (typeof v !== 'string' || !v.trim()) {
        return { ok: false, error: `Please fill in: ${q.prompt}` };
      }
    }
  }
  return { ok: true };
}
