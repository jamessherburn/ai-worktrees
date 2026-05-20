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
];

export function normalizeSessionPrompts(raw: SessionPromptPreset[] | undefined): SessionPromptPreset[] {
  if (!raw?.length) return [...DEFAULT_SESSION_PROMPTS];
  const out = raw
    .filter((p) => p.title?.trim() && p.text?.trim())
    .map((p) => ({ title: p.title.trim(), text: p.text.trim() }));
  return out.length > 0 ? out : [...DEFAULT_SESSION_PROMPTS];
}
