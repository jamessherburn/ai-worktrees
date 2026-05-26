export const SESSION_PROMPT_SUBMIT_DELAY_MS = 80;

export function normalizePromptText(text: string): string {
  return text.replace(/\r?\n$/, '');
}
