import type { AgentId } from './agents';

// Ctrl+Enter sequences understood by multiline terminal agent composers.
const CTRL_ENTER = '\x1b[13;5~';

export function buildSessionPromptSubmitPayload(agentId: AgentId, text: string): string {
  const body = text.replace(/\r?\n$/, '');
  // Clear the current input line, insert the prompt, then submit.
  const clearLine = '\x15';
  switch (agentId) {
    case 'claude':
    case 'cursor':
    case 'codex':
    case 'gemini':
      return `${clearLine}${body}${CTRL_ENTER}`;
    default:
      return `${clearLine}${body}\r`;
  }
}
