import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentId } from '@shared/agents';

export type LaunchCommand = {
  shellCommand: string;
};

export type LaunchOptions = {
  cwd: string;
  previouslyStarted: boolean;
};

function encodeProjectPath(absPath: string): string {
  return absPath.replace(/[/.]/g, '-');
}

async function claudeHasSavedConversation(cwd: string): Promise<boolean> {
  const projectDir = join(homedir(), '.claude', 'projects', encodeProjectPath(cwd));
  try {
    const entries = await fs.readdir(projectDir);
    return entries.some((e) => e.endsWith('.jsonl'));
  } catch {
    return false;
  }
}

async function buildClaudeCommand({ cwd, previouslyStarted }: LaunchOptions): Promise<LaunchCommand> {
  const canContinue = previouslyStarted || (await claudeHasSavedConversation(cwd));
  return { shellCommand: canContinue ? 'claude --continue' : 'claude' };
}

function buildResumable(base: string, resumeArgs: string | null, options: LaunchOptions): LaunchCommand {
  if (options.previouslyStarted && resumeArgs) {
    return { shellCommand: `${base} ${resumeArgs}`.trim() };
  }
  return { shellCommand: base };
}

export async function buildLaunchCommand(
  agentId: AgentId,
  options: LaunchOptions,
): Promise<LaunchCommand> {
  switch (agentId) {
    case 'claude':
      return buildClaudeCommand(options);
    case 'cursor':
      return buildResumable('cursor-agent', 'resume', options);
    case 'codex':
      return buildResumable('codex', 'resume --last', options);
    case 'gemini':
      return buildResumable('gemini', null, options);
  }
}
