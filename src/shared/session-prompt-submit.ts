export const SESSION_PROMPT_SUBMIT_DELAY_MS = 80;

/** After the agent PTY is up, wait before auto-pasting a wizard briefing. */
export const WIZARD_BRIEF_READY_DELAY_MS = 900;

export function normalizePromptText(text: string): string {
  return text.replace(/\r?\n$/, '');
}
