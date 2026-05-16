export type AgentId = 'claude' | 'cursor' | 'gemini' | 'codex' | 'aider';

export type AgentInstructionsLocation = {
  home: string;
  filename: string;
};

export type AgentDefinition = {
  id: AgentId;
  name: string;
  description: string;
  binary: string;
  instructions: AgentInstructionsLocation;
};

export const AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude Code',
    binary: 'claude',
    instructions: { home: '.claude', filename: 'CLAUDE.md' },
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    description: "Cursor's terminal agent",
    binary: 'cursor-agent',
    instructions: { home: '.cursor', filename: 'AGENTS.md' },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google Gemini CLI',
    binary: 'gemini',
    instructions: { home: '.gemini', filename: 'GEMINI.md' },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI Codex CLI',
    binary: 'codex',
    instructions: { home: '.codex', filename: 'AGENTS.md' },
  },
  {
    id: 'aider',
    name: 'Aider (Local)',
    description: 'Aider with local Ollama qwen2.5-coder',
    binary: 'aider',
    instructions: { home: '.aider', filename: 'AIDER.md' },
  },
];

export const DEFAULT_AGENT_ID: AgentId = 'claude';

export function getAgent(id: AgentId | undefined): AgentDefinition {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}

export function displayInstructionsPath(def: AgentDefinition): string {
  return `~/${def.instructions.home}/${def.instructions.filename}`;
}

export type AgentAvailability = Record<AgentId, boolean>;
