import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentId } from '@shared/agents';

export type LaunchCommand = {
  shellCommand: string;
};

export type LaunchOptions = {
  cwd: string;
  /** When set, skips the cwd probe (used for global sessions sharing one directory). */
  canResume?: boolean;
};

export type AgentLaunchSpec = {
  binary: string;
  resumeArgs: string | null;
};

export type AgentResumeProbe = (cwd: string) => Promise<boolean>;

export const AGENT_LAUNCH_SPECS: Record<AgentId, AgentLaunchSpec> = {
  claude: { binary: 'claude', resumeArgs: '--continue' },
  cursor: { binary: 'cursor-agent', resumeArgs: 'resume' },
  codex: { binary: 'codex', resumeArgs: 'resume --last' },
  gemini: { binary: 'gemini', resumeArgs: null },
};

function encodeProjectPath(absPath: string): string {
  return absPath.replace(/[/.]/g, '-');
}

async function dirHasEntries(path: string, predicate?: (name: string) => boolean): Promise<boolean> {
  try {
    const entries = await fs.readdir(path);
    if (!predicate) return entries.length > 0;
    return entries.some(predicate);
  } catch {
    return false;
  }
}

export async function claudeHasSavedConversation(cwd: string): Promise<boolean> {
  const projectDir = join(homedir(), '.claude', 'projects', encodeProjectPath(cwd));
  return dirHasEntries(projectDir, (e) => e.endsWith('.jsonl'));
}

export async function cursorHasSavedSession(cwd: string): Promise<boolean> {
  const encoded = encodeProjectPath(cwd);
  const candidates = [
    join(homedir(), '.cursor', 'projects', encoded),
    join(homedir(), '.cursor', 'chats', encoded),
    join(cwd, '.cursor'),
  ];
  for (const path of candidates) {
    if (await dirHasEntries(path)) return true;
  }
  return false;
}

export async function codexHasSavedSession(cwd: string): Promise<boolean> {
  const encoded = encodeProjectPath(cwd);
  const candidates = [
    join(homedir(), '.codex', 'sessions', encoded),
    join(homedir(), '.codex', 'projects', encoded),
    join(homedir(), '.codex', 'history'),
    join(cwd, '.codex'),
  ];
  for (const path of candidates) {
    if (await dirHasEntries(path)) return true;
  }
  return false;
}

export const AGENT_RESUME_PROBES: Record<AgentId, AgentResumeProbe> = {
  claude: claudeHasSavedConversation,
  cursor: cursorHasSavedSession,
  codex: codexHasSavedSession,
  gemini: async () => false,
};

/** Pure launch decision: only resume when a probe confirms saved state exists. */
export function composeLaunchCommand(agentId: AgentId, canResume: boolean): LaunchCommand {
  const spec = AGENT_LAUNCH_SPECS[agentId];
  if (canResume && spec.resumeArgs) {
    return { shellCommand: `${spec.binary} ${spec.resumeArgs}`.trim() };
  }
  return { shellCommand: spec.binary };
}

export async function buildLaunchCommand(
  agentId: AgentId,
  options: LaunchOptions,
): Promise<LaunchCommand> {
  const canResume =
    options.canResume ?? (await AGENT_RESUME_PROBES[agentId](options.cwd));
  return composeLaunchCommand(agentId, canResume);
}
