import type { SessionPromptPreset } from './types';

export const DEFAULT_SESSION_PROMPTS: SessionPromptPreset[] = [
  {
    title: 'Recap',
    text: 'Please help me to understand what we have discussed or actioned during this session',
  },
  {
    title: 'Simplify Last Response',
    text: 'Explain your last response again in simpler terms',
  },
  {
    title: 'What have we discussed',
    text: 'What have we discussed or changed so far in this session',
  },
];

export function cloneDefaultSessionPrompts(): SessionPromptPreset[] {
  return DEFAULT_SESSION_PROMPTS.map((p) => ({ title: p.title, text: p.text }));
}

function isOldTwoPromptDefaults(prompts: SessionPromptPreset[]): boolean {
  if (prompts.length !== 2) return false;
  return (
    prompts[0]?.title === DEFAULT_SESSION_PROMPTS[0].title &&
    prompts[1]?.title === DEFAULT_SESSION_PROMPTS[1].title
  );
}

/** Upgrade settings saved before the third built-in prompt existed. */
export function resolveSessionPrompts(
  raw: SessionPromptPreset[] | undefined,
  legacyRecapPrompt?: string,
): SessionPromptPreset[] {
  if (!raw?.length) return cloneDefaultSessionPrompts();

  const out = raw
    .filter((p) => p.title?.trim() && p.text?.trim())
    .map((p) => ({ title: p.title.trim(), text: p.text.trim() }));

  if (out.length === 0) return cloneDefaultSessionPrompts();

  if (isOldTwoPromptDefaults(out)) {
    return cloneDefaultSessionPrompts();
  }

  const legacyRecap = legacyRecapPrompt?.trim();
  const thirdDefault = DEFAULT_SESSION_PROMPTS[2];
  if (legacyRecap && !out.some((p) => p.text === legacyRecap)) {
    return [...out, { title: thirdDefault.title, text: legacyRecap }];
  }

  return out;
}

export function normalizeSessionPrompts(raw: SessionPromptPreset[] | undefined): SessionPromptPreset[] {
  return resolveSessionPrompts(raw);
}
