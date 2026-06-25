import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { AgentId } from '@shared/agents';
import { getCursorLaunchBinary } from './cursor-binary.js';

export type LaunchCommand = {
  shellCommand: string;
};

export type AgentStorageRoots = {
  claudeConfigDir?: string;
  cursorConfigDir?: string;
  codexHome?: string;
};

export type LaunchOptions = {
  cwd: string;
  /** Cursor --workspace path when it differs from the PTY cwd (global sessions). */
  workspaceCwd?: string;
  /** Pass --trust for fresh global workspace roots (no .workspace-trusted yet). */
  cursorTrustWorkspace?: boolean;
  /** When set, skips the cwd probe (used when resume eligibility is known out-of-band). */
  canResume?: boolean;
  storageRoots?: AgentStorageRoots;
  /** Inline env vars for the agent shell (global sessions). */
  agentEnv?: NodeJS.ProcessEnv;
};

export type ComposeLaunchOptions = {
  cwd?: string;
  cursorTrustWorkspace?: boolean;
};

export type AgentLaunchSpec = {
  binary: string;
  resumeArgs: string | null;
};

export type AgentResumeProbe = (
  cwd: string,
  storageRoots?: AgentStorageRoots,
) => Promise<boolean>;

export const AGENT_LAUNCH_SPECS: Record<AgentId, AgentLaunchSpec> = {
  claude: { binary: 'claude', resumeArgs: '--continue' },
  cursor: { binary: 'cursor-agent', resumeArgs: 'resume' },
  codex: { binary: 'codex', resumeArgs: 'resume --last' },
  gemini: { binary: 'gemini', resumeArgs: null },
};

/** Claude Code: every `/` and `.` in the absolute path becomes `-` (leading `/` included). */
function encodeClaudeProjectPath(absPath: string): string {
  return absPath.replace(/[/.]/g, '-');
}

/** Cursor CLI: leading `/` is dropped; `/`, `.`, and spaces become `-`. */
function encodeCursorProjectPath(absPath: string): string {
  return absPath.replace(/^\//, '').replace(/[/. ]/g, '-');
}

/** Exported for tests. */
export function encodeProjectPath(absPath: string): string {
  return encodeCursorProjectPath(absPath);
}

export { encodeClaudeProjectPath, encodeCursorProjectPath };

function claudeConfigRoot(storageRoots?: AgentStorageRoots): string {
  return storageRoots?.claudeConfigDir ?? join(homedir(), '.claude');
}

function cursorConfigRoot(storageRoots?: AgentStorageRoots): string {
  return storageRoots?.cursorConfigDir ?? join(homedir(), '.cursor');
}

function codexConfigRoot(storageRoots?: AgentStorageRoots): string {
  return storageRoots?.codexHome ?? join(homedir(), '.codex');
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

/** Cursor runtime IPC sockets are not persisted session data. */
function isCursorSessionEntry(name: string): boolean {
  return name !== 'worker.sock' && !name.endsWith('.sock');
}

/** Copy agent session trees without sockets/FIFOs (fs.cp cannot copy them). */
export async function copyAgentPathSkippingSpecialFiles(src: string, dest: string): Promise<void> {
  if (src === dest) return;
  const stat = await fs.lstat(src);
  if (stat.isSocket() || stat.isFIFO()) return;
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyAgentPathSkippingSpecialFiles(join(src, entry), join(dest, entry));
    }
    return;
  }
  if (stat.isFile()) {
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

export async function claudeHasSavedConversation(
  cwd: string,
  storageRoots?: AgentStorageRoots,
): Promise<boolean> {
  const projectDir = join(
    claudeConfigRoot(storageRoots),
    'projects',
    encodeClaudeProjectPath(cwd),
  );
  return dirHasEntries(projectDir, (e) => e.endsWith('.jsonl'));
}

export async function cursorHasSavedSession(
  cwd: string,
  storageRoots?: AgentStorageRoots,
): Promise<boolean> {
  const encoded = encodeCursorProjectPath(cwd);
  const legacyEncoded = encodeClaudeProjectPath(cwd);
  const cursorRoots = new Set<string>([cursorConfigRoot(storageRoots)]);
  // CURSOR_CONFIG_DIR only relocates cli-config.json; chats still land in ~/.cursor.
  if (storageRoots?.cursorConfigDir) {
    cursorRoots.add(join(homedir(), '.cursor'));
  }
  const candidates: string[] = [join(cwd, '.cursor')];
  for (const cursorRoot of cursorRoots) {
    candidates.push(
      join(cursorRoot, 'projects', encoded),
      join(cursorRoot, 'chats', encoded),
      join(cursorRoot, 'projects', legacyEncoded),
      join(cursorRoot, 'chats', legacyEncoded),
    );
  }
  for (const path of candidates) {
    if (await dirHasEntries(path, isCursorSessionEntry)) return true;
  }
  return false;
}

export async function codexHasSavedSession(
  cwd: string,
  storageRoots?: AgentStorageRoots,
): Promise<boolean> {
  const encoded = encodeClaudeProjectPath(cwd);
  const codexRoot = codexConfigRoot(storageRoots);
  const candidates = [
    join(codexRoot, 'sessions', encoded),
    join(codexRoot, 'projects', encoded),
    join(codexRoot, 'history'),
    join(codexRoot, 'history.jsonl'),
    join(cwd, '.codex'),
  ];
  if (!storageRoots?.codexHome) {
    candidates.push(join(homedir(), '.codex', 'history'));
  }
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

export type ClearAgentSessionDataOptions = {
  /** When true, also remove agent dirs inside the session cwd (safe for dedicated worktrees). */
  includeLocalAgentDirs?: boolean;
  storageRoots?: AgentStorageRoots;
};

/** Paths where agents store per-project session data for a given cwd. */
export function agentSessionDataPaths(
  cwd: string,
  options: ClearAgentSessionDataOptions = {},
): string[] {
  const storageRoots = options.storageRoots;
  const encodedClaude = encodeClaudeProjectPath(cwd);
  const encodedCursor = encodeCursorProjectPath(cwd);
  const claudeRoot = claudeConfigRoot(storageRoots);
  const cursorRoot = cursorConfigRoot(storageRoots);
  const codexRoot = codexConfigRoot(storageRoots);
  const paths = [
    join(claudeRoot, 'projects', encodedClaude),
    join(cursorRoot, 'projects', encodedCursor),
    join(cursorRoot, 'chats', encodedCursor),
    join(cursorRoot, 'projects', encodedClaude),
    join(cursorRoot, 'chats', encodedClaude),
    join(codexRoot, 'sessions', encodedClaude),
    join(codexRoot, 'projects', encodedClaude),
    join(codexRoot, 'history'),
    join(codexRoot, 'history.jsonl'),
  ];
  if (!storageRoots?.codexHome) {
    paths.push(join(homedir(), '.codex', 'history'));
  }
  if (options.includeLocalAgentDirs) {
    paths.push(join(cwd, '.cursor'), join(cwd, '.codex'));
  }
  return paths;
}

/** Remove explicit on-disk agent data directories (e.g. from cleanup scan). */
export async function removeAgentDataPaths(paths: Iterable<string>): Promise<void> {
  const seen = new Set<string>();
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    try {
      await fs.rm(path, { recursive: true, force: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
}

/** Remove saved agent conversations for a session cwd so a new session does not resume. */
export async function clearAgentSessionData(
  cwd: string,
  options: ClearAgentSessionDataOptions = {},
): Promise<void> {
  for (const path of agentSessionDataPaths(cwd, options)) {
    try {
      await fs.rm(path, { recursive: true, force: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
}

/** Quote a value for POSIX single-quoted shell strings. */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function cursorWorkspaceArgs(cwd: string | undefined, trustWorkspace?: boolean): string {
  if (!cwd) return '';
  const trust = trustWorkspace ? ' --trust' : '';
  return ` --workspace ${shellSingleQuote(cwd)}${trust}`;
}

/** Pure launch decision: only resume when a probe confirms saved state exists. */
export function composeLaunchCommand(
  agentId: AgentId,
  canResume: boolean,
  options: ComposeLaunchOptions = {},
): LaunchCommand {
  const spec = AGENT_LAUNCH_SPECS[agentId];
  const binary = agentId === 'cursor' ? getCursorLaunchBinary() : spec.binary;
  const workspace =
    agentId === 'cursor' ? cursorWorkspaceArgs(options.cwd, options.cursorTrustWorkspace) : '';
  if (canResume && spec.resumeArgs) {
    return { shellCommand: `${binary}${workspace} ${spec.resumeArgs}`.trim() };
  }
  return { shellCommand: `${binary}${workspace}`.trim() };
}

export function formatPtyShellCommand(shellCommand: string, agentEnv?: NodeJS.ProcessEnv): string {
  if (!agentEnv) return shellCommand;
  const prefix = Object.entries(agentEnv)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([key, value]) => `${key}=${shellSingleQuote(value)}`)
    .join(' ');
  return prefix ? `${prefix} ${shellCommand}` : shellCommand;
}

export async function agentHasSavedSession(
  cwd: string,
  storageRoots?: AgentStorageRoots,
): Promise<boolean> {
  return (
    (await claudeHasSavedConversation(cwd, storageRoots)) ||
    (await cursorHasSavedSession(cwd, storageRoots)) ||
    (await codexHasSavedSession(cwd, storageRoots))
  );
}

/** Copy saved agent session dirs when data landed outside per-session storage. */
export async function copyAgentSessionDataBetweenRoots(
  fromCwd: string,
  toCwd: string,
  fromRoots: AgentStorageRoots | undefined,
  toRoots: AgentStorageRoots | undefined,
): Promise<boolean> {
  const fromPaths = agentSessionDataPaths(fromCwd, { storageRoots: fromRoots });
  const toPaths = agentSessionDataPaths(toCwd, { storageRoots: toRoots });
  let copied = false;
  for (let i = 0; i < fromPaths.length; i++) {
    if (fromPaths[i] === toPaths[i]) continue;
    try {
      await fs.stat(fromPaths[i]);
      await copyAgentPathSkippingSpecialFiles(fromPaths[i], toPaths[i]);
      copied = true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  return copied;
}

export async function buildLaunchCommand(
  agentId: AgentId,
  options: LaunchOptions,
): Promise<LaunchCommand> {
  const probeCwd =
    agentId === 'cursor' ? (options.workspaceCwd ?? options.cwd) : options.cwd;
  const canResume =
    options.canResume ??
    (await AGENT_RESUME_PROBES[agentId](probeCwd, options.storageRoots));
  const launch = composeLaunchCommand(agentId, canResume, {
    cwd: agentId === 'cursor' ? probeCwd : options.cwd,
    cursorTrustWorkspace:
      options.cursorTrustWorkspace ??
      (agentId === 'cursor' && options.workspaceCwd !== undefined),
  });
  return {
    shellCommand: formatPtyShellCommand(launch.shellCommand, options.agentEnv),
  };
}
