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
      id: 'work_mode',
      prompt: 'What kind of work is this session?',
      kind: 'single',
      options: [
        { id: 'investigate', label: 'Investigation — understand, trace, or find root cause' },
        { id: 'bugfix', label: 'Bug fix — incorrect behavior or regression' },
        { id: 'feature', label: 'Feature — new capability or intentional behavior change' },
        { id: 'verify', label: 'Verify — review, validate, or sanity-check existing work' },
        { id: 'refactor', label: 'Refactor — improve structure without changing behavior' },
        { id: 'spike', label: 'Spike — prototype or feasibility check' },
      ],
    },
    {
      id: 'urgency',
      prompt: 'How urgent is this?',
      kind: 'single',
      options: [
        { id: 'incident', label: 'Production incident / drop everything' },
        { id: 'blocking', label: 'Blocking someone else today' },
        { id: 'normal', label: 'Normal priority' },
        { id: 'background', label: 'Background / when you can' },
      ],
    },
    {
      id: 'goal',
      prompt: 'What should this session accomplish? (One clear outcome.)',
      kind: 'textarea',
      placeholder:
        'e.g. "Find why checkout fails for EU cards" or "Add rate limiting to the public API" or "Confirm the auth refactor is safe to ship"',
    },
    {
      id: 'success_criteria',
      prompt: 'Definition of done — how will we know this succeeded?',
      kind: 'textarea',
      placeholder:
        'List checkable outcomes: tests passing, metric restored, doc updated, PR opened, written findings with next steps…',
    },
    {
      id: 'has_context',
      prompt: 'Do you have context to attach (paths, links, logs, prior attempts)?',
      kind: 'single',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No — start from the codebase' },
      ],
    },
    {
      id: 'context_details',
      prompt: 'Paste context the agent should read first',
      kind: 'textarea',
      placeholder:
        'File paths, PR/issue links, error messages, stack traces, screenshots described, hypotheses already ruled out…',
      showWhen: { questionId: 'has_context', equals: 'yes' },
    },
    {
      id: 'investigate_focus',
      prompt: 'What question are we investigating?',
      kind: 'textarea',
      placeholder: 'The unknown: symptom, metric drop, flaky test, architectural question, "why does X happen when Y"…',
      showWhen: { questionId: 'work_mode', equals: 'investigate' },
    },
    {
      id: 'investigate_deliverable',
      prompt: 'What should the agent deliver?',
      kind: 'single',
      options: [
        { id: 'findings-only', label: 'Written findings and recommended next steps (no code changes)' },
        { id: 'fix-if-clear', label: 'Fix in-code if root cause is clear; otherwise report' },
        { id: 'fix-required', label: 'Root cause + fix required in this session' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'investigate' },
    },
    {
      id: 'investigate_constraints',
      prompt: 'Code change policy for this investigation',
      kind: 'single',
      options: [
        { id: 'read-only', label: 'Read-only — explore and explain; no edits unless I ask' },
        { id: 'instrument', label: 'Small instrumentation/logging OK; no functional changes' },
        { id: 'changes-ok', label: 'Changes OK when needed to prove or fix' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'investigate' },
    },
    {
      id: 'bug_details',
      prompt: 'Describe the bug',
      kind: 'textarea',
      placeholder:
        'Repro steps, expected vs actual, environment, frequency, when it started, errors/logs, and what is out of scope…',
      showWhen: { questionId: 'work_mode', equals: 'bugfix' },
    },
    {
      id: 'bug_fix_style',
      prompt: 'Fix approach',
      kind: 'single',
      options: [
        { id: 'minimal', label: 'Minimal patch — smallest correct change' },
        { id: 'root-cause', label: 'Root-cause fix — address underlying issue even if broader' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'bugfix' },
    },
    {
      id: 'regression_test',
      prompt: 'Regression test for this bug',
      kind: 'single',
      options: [
        { id: 'required', label: 'Required — add or extend a test that fails before the fix' },
        { id: 'if-easy', label: 'Add if straightforward; skip if disproportionately costly' },
        { id: 'skip', label: 'Skip tests for this fix' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'bugfix' },
    },
    {
      id: 'feature_spec',
      prompt: 'What are we building or changing?',
      kind: 'textarea',
      placeholder:
        'User story, acceptance criteria, constraints, out-of-scope areas, migrations, feature flags, rollout notes…',
      showWhen: { questionId: 'work_mode', equals: 'feature' },
    },
    {
      id: 'feature_risk',
      prompt: 'Blast radius if we get this wrong',
      kind: 'single',
      options: [
        { id: 'low', label: 'Low — isolated, easy to revert' },
        { id: 'medium', label: 'Medium — user-facing or shared code paths' },
        { id: 'high', label: 'High — data, auth, payments, or hard-to-revert' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'feature' },
    },
    {
      id: 'verify_target',
      prompt: 'What should be verified?',
      kind: 'textarea',
      placeholder:
        'PR link, branch, behavior to validate, risk you are worried about, or checklist you want run…',
      showWhen: { questionId: 'work_mode', equals: 'verify' },
    },
    {
      id: 'verify_lens',
      prompt: 'What lenses should the review prioritize?',
      kind: 'multi',
      options: [
        { id: 'correctness', label: 'Correctness & edge cases' },
        { id: 'security', label: 'Security & trust boundaries' },
        { id: 'tests', label: 'Test coverage & quality' },
        { id: 'perf', label: 'Performance & scalability' },
        { id: 'ops', label: 'Operability (logging, metrics, rollbacks)' },
        { id: 'maintainability', label: 'Maintainability & API design' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'verify' },
    },
    {
      id: 'verify_depth',
      prompt: 'How deep should verification go?',
      kind: 'single',
      options: [
        { id: 'quick-pass', label: 'Quick pass — obvious issues and smoke checks' },
        { id: 'thorough', label: 'Thorough — trace paths, run tests, challenge assumptions' },
        { id: 'pre-merge', label: 'Pre-merge bar — I would ship based on this review' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'verify' },
    },
    {
      id: 'refactor_scope',
      prompt: 'What should be refactored and why?',
      kind: 'textarea',
      placeholder: 'Target modules, pain points, constraints, and what must not change behaviorally…',
      showWhen: { questionId: 'work_mode', equals: 'refactor' },
    },
    {
      id: 'refactor_safety',
      prompt: 'Behavior change policy',
      kind: 'single',
      options: [
        { id: 'strict', label: 'Strict — zero intentional behavior change' },
        { id: 'incidental-ok', label: 'Incidental bug fixes OK if discovered' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'refactor' },
    },
    {
      id: 'spike_goal',
      prompt: 'What hypothesis are we testing?',
      kind: 'textarea',
      placeholder: 'What you need to learn, options to compare, and how you will judge success…',
      showWhen: { questionId: 'work_mode', equals: 'spike' },
    },
    {
      id: 'spike_quality',
      prompt: 'Expected quality bar for spike output',
      kind: 'single',
      options: [
        { id: 'throwaway', label: 'Throwaway — speed over polish; learn fast' },
        { id: 'prototype', label: 'Prototype — rough but presentable to the team' },
        { id: 'production-minded', label: 'Production-minded — likely to evolve into shipped code' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'spike' },
    },
    {
      id: 'execution_style_feature',
      prompt: 'How should the agent proceed?',
      kind: 'single',
      options: [
        { id: 'plan-first', label: 'Plan first — design approach, then implement' },
        { id: 'iterate', label: 'Iterate — small increments with checkpoints' },
        { id: 'direct', label: 'Direct — implement when the path is clear' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'feature' },
    },
    {
      id: 'testing_approach_feature',
      prompt: 'Testing approach',
      kind: 'single',
      options: [
        { id: 'tdd', label: 'Test-first where practical' },
        { id: 'with-impl', label: 'Tests alongside implementation' },
        { id: 'critical-only', label: 'Tests for critical paths only' },
        { id: 'skip', label: 'Skip new tests unless I ask' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'feature' },
    },
    {
      id: 'auto_pr_feature',
      prompt: 'Pull request when work is ready',
      kind: 'single',
      options: [
        { id: 'yes', label: 'Yes — open a PR when appropriate' },
        { id: 'ask', label: 'Ask me before opening a PR' },
        { id: 'no', label: 'No — I will handle PRs' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'feature' },
    },
    {
      id: 'execution_style_bugfix',
      prompt: 'How should the agent proceed?',
      kind: 'single',
      options: [
        { id: 'plan-first', label: 'Plan first — confirm repro and approach, then fix' },
        { id: 'direct', label: 'Direct — reproduce, fix, and validate' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'bugfix' },
    },
    {
      id: 'auto_pr_bugfix',
      prompt: 'Pull request when work is ready',
      kind: 'single',
      options: [
        { id: 'yes', label: 'Yes — open a PR when appropriate' },
        { id: 'ask', label: 'Ask me before opening a PR' },
        { id: 'no', label: 'No — I will handle PRs' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'bugfix' },
    },
    {
      id: 'execution_style_refactor',
      prompt: 'How should the agent proceed?',
      kind: 'single',
      options: [
        { id: 'plan-first', label: 'Plan first — map blast radius, then refactor in steps' },
        { id: 'direct', label: 'Direct — refactor with continuous test validation' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'refactor' },
    },
    {
      id: 'auto_pr_refactor',
      prompt: 'Pull request when work is ready',
      kind: 'single',
      options: [
        { id: 'yes', label: 'Yes — open a PR when appropriate' },
        { id: 'ask', label: 'Ask me before opening a PR' },
        { id: 'no', label: 'No — I will handle PRs' },
      ],
      showWhen: { questionId: 'work_mode', equals: 'refactor' },
    },
  ],
  promptTemplate: `## Session briefing

You are the engineering owner for this session. Work like a senior IC: clarify assumptions, favor evidence over guesses, keep diffs focused, and stop when the definition of done is met.

### Overview
| Field | Value |
| --- | --- |
| **Mode** | {{work_mode}} |
| **Urgency** | {{urgency}} |

### Goal
{{goal}}

### Definition of done
{{success_criteria}}

### Context
{{context_details}}

---

### Investigation
**Question:** {{investigate_focus}}
**Deliverable:** {{investigate_deliverable}}
**Change policy:** {{investigate_constraints}}

When investigating: reproduce or trace with concrete evidence (logs, tests, code paths). State what you ruled out. End with findings, confidence level, and recommended next steps.

---

### Bug fix
**Bug:** {{bug_details}}
**Fix style:** {{bug_fix_style}}
**Regression test:** {{regression_test}}
**Execution:** {{execution_style_bugfix}}
**PR:** {{auto_pr_bugfix}}

When fixing: reproduce first (or explain why you cannot). Prefer the smallest correct fix unless root-cause was requested. Run relevant tests before finishing.

---

### Feature
**Spec:** {{feature_spec}}
**Blast radius:** {{feature_risk}}
**Execution:** {{execution_style_feature}}
**Testing:** {{testing_approach_feature}}
**PR:** {{auto_pr_feature}}

When building: confirm understanding of acceptance criteria before large edits. Match existing conventions. Do not expand scope without calling it out.

---

### Verify
**Target:** {{verify_target}}
**Focus areas:** {{verify_lens}}
**Depth:** {{verify_depth}}

When verifying: cite file/line evidence. Separate must-fix vs nice-to-have. Run tests or commands when useful. Do not rewrite code unless asked.

---

### Refactor
**Scope:** {{refactor_scope}}
**Behavior policy:** {{refactor_safety}}
**Execution:** {{execution_style_refactor}}
**PR:** {{auto_pr_refactor}}

When refactoring: keep behavior identical unless incidental fixes were allowed. Refactor in reviewable steps; keep tests green.

---

### Spike
**Hypothesis:** {{spike_goal}}
**Quality bar:** {{spike_quality}}

When spiking: timebox exploration. Summarize what you learned, what you recommend, and what to throw away.

---

### Working agreements (all modes)
1. **Scope** — Stay inside goal and definition of done; defer out-of-scope work explicitly.
2. **Evidence** — Read code and run commands; do not invent APIs, files, or test results.
3. **Diff discipline** — No drive-by refactors, formatting sweeps, or unrelated fixes.
4. **Communication** — Short progress updates at phase boundaries; surface blockers and risks early.
5. **Completion** — When done, state what changed, how it was validated, and what remains.
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
