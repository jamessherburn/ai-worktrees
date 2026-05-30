import type { SessionPromptChild, SessionPromptPreset } from './types';

function normalizeChild(raw: SessionPromptChild): SessionPromptChild | null {
  const title = raw.title?.trim();
  const text = raw.text?.trim();
  if (!title || !text) return null;
  return { title, text };
}

function normalizePreset(raw: SessionPromptPreset): SessionPromptPreset | null {
  const title = raw.title?.trim();
  const text = raw.text?.trim() ?? '';
  const children = (raw.children ?? [])
    .map(normalizeChild)
    .filter((c): c is SessionPromptChild => c !== null);
  if (!title) return null;
  if (!text && children.length === 0) return null;
  return children.length > 0 ? { title, text, children } : { title, text };
}

/** Built-in defaults shipped before the curated six-prompt set. */
const LEGACY_TWO_PROMPT_DEFAULTS: SessionPromptPreset[] = [
  {
    title: 'Recap',
    text: 'Please help me to understand what we have discussed or actioned during this session',
  },
  {
    title: 'Simplify Last Response',
    text: 'Explain your last response again in simpler terms',
  },
];

/** Built-in defaults shipped with the third recap-style prompt. */
const LEGACY_THREE_PROMPT_DEFAULTS: SessionPromptPreset[] = [
  ...LEGACY_TWO_PROMPT_DEFAULTS,
  {
    title: 'What have we discussed',
    text: 'What have we discussed or changed so far in this session',
  },
];

/** Built-in defaults shipped before the grouped quick-response / git prompts. */
const LEGACY_SIX_PROMPT_DEFAULTS: SessionPromptPreset[] = [
  {
    title: 'Session recap',
    text: 'Summarize what we have done in this session, what is still open, and any decisions or blockers worth remembering.',
  },
  {
    title: "What's next?",
    text: 'Based on our goal and current progress, what is the single best next step? Keep it concrete and actionable.',
  },
  {
    title: 'Review changes',
    text: 'Review the current uncommitted changes (git diff). Call out bugs, missed edge cases, style issues, and anything we should fix before committing.',
  },
  {
    title: 'Run tests',
    text: 'Run the most relevant tests for the changes we have made and report the results. Fix straightforward failures.',
  },
  {
    title: 'Simplify last response',
    text: 'Explain your last response again in simpler terms.',
  },
  {
    title: 'Commit message',
    text: "Draft a concise commit message for the current changes. Match the repository's recent commit message style if you can infer it.",
  },
];

export const DEFAULT_SESSION_PROMPTS: SessionPromptPreset[] = [
  {
    title: 'Quick Responses',
    text: '',
    children: [
      { title: 'Yes', text: 'Yes' },
      { title: 'No', text: 'No' },
      {
        title: 'Simplify Response',
        text: 'Please simplify your last response.  I struggled to understand it.',
      },
    ],
  },
  {
    title: 'Git',
    text: '',
    children: [
      {
        title: 'Create Pull Request',
        text: 'Please can you create a pull request for the changes made here.',
      },
      {
        title: 'Stage Changes',
        text: 'Please can you merge this branch into the staging branch.  Be sure to checkout the latest staging branch first before attempting to merge.  Delete the current local staging branch and re-pull from origin if staging already exists locally and the branch is diverged.',
      },
    ],
  },
];

export function cloneDefaultSessionPrompts(): SessionPromptPreset[] {
  return DEFAULT_SESSION_PROMPTS.map((p) => ({
    title: p.title,
    text: p.text,
    ...(p.children?.length ? { children: p.children.map((c) => ({ ...c })) } : {}),
  }));
}

function matchesPresetList(
  prompts: SessionPromptPreset[],
  reference: SessionPromptPreset[],
): boolean {
  if (prompts.length !== reference.length) return false;
  return reference.every(
    (ref, i) => prompts[i]?.title === ref.title && prompts[i]?.text === ref.text,
  );
}

function isLegacyBuiltInDefaults(prompts: SessionPromptPreset[]): boolean {
  return (
    matchesPresetList(prompts, LEGACY_TWO_PROMPT_DEFAULTS) ||
    matchesPresetList(prompts, LEGACY_THREE_PROMPT_DEFAULTS) ||
    matchesPresetList(prompts, LEGACY_SIX_PROMPT_DEFAULTS)
  );
}

/** Upgrade settings saved before the third built-in prompt existed. */
export function resolveSessionPrompts(
  raw: SessionPromptPreset[] | undefined,
  legacyRecapPrompt?: string,
): SessionPromptPreset[] {
  if (!raw?.length) return cloneDefaultSessionPrompts();

  const out = raw
    .map((p) => normalizePreset(p))
    .filter((p): p is SessionPromptPreset => p !== null);

  if (out.length === 0) return cloneDefaultSessionPrompts();

  if (isLegacyBuiltInDefaults(out)) {
    return cloneDefaultSessionPrompts();
  }

  const legacyRecap = legacyRecapPrompt?.trim();
  if (legacyRecap && !out.some((p) => p.text === legacyRecap)) {
    return [...out, { title: 'Session recap', text: legacyRecap }];
  }

  return out;
}

export function normalizeSessionPrompts(raw: SessionPromptPreset[] | undefined): SessionPromptPreset[] {
  return resolveSessionPrompts(raw);
}
