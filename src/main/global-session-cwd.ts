import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Session } from '@shared/types';
import {
  agentHasSavedSession,
  clearAgentSessionData,
  copyAgentSessionDataBetweenRoots,
  type AgentStorageRoots,
} from './agents.js';

const requireElectron = createRequire(import.meta.url);

let userDataRootOverride: string | undefined;

/** @internal Test hook */
export function setUserDataRootForTests(root: string | undefined): void {
  userDataRootOverride = root;
}

/** Used by cleanup to detect global-session agent data paths without loading Electron when testing. */
export function userDataRootForCleanup(): string {
  return userDataRoot();
}

function userDataRoot(): string {
  if (userDataRootOverride) return userDataRootOverride;
  const { app } = requireElectron('electron') as typeof import('electron');
  return app.getPath('userData');
}

/** Legacy per-global-session symlink path (pre–config-dir isolation). */
export function globalSessionCwdPath(sessionId: string): string {
  return join(userDataRoot(), 'global-sessions', sessionId);
}

/** Per-global-session agent config roots under userData. */
export function globalAgentDataRoot(sessionId: string): string {
  return join(userDataRoot(), 'global-agent-data', sessionId);
}

export function globalAgentStoragePaths(sessionId: string): AgentStorageRoots {
  const root = globalAgentDataRoot(sessionId);
  return {
    claudeConfigDir: join(root, 'claude'),
    cursorConfigDir: join(root, 'cursor'),
    codexHome: join(root, 'codex'),
  };
}

export function globalAgentEnv(sessionId: string): NodeJS.ProcessEnv {
  const { claudeConfigDir, cursorConfigDir, codexHome } = globalAgentStoragePaths(sessionId);
  return {
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    CURSOR_CONFIG_DIR: cursorConfigDir,
    CODEX_HOME: codexHome,
  };
}

export function globalAgentCleanupId(sessionId: string): string {
  return `agent::global::${sessionId}`;
}

export async function ensureGlobalAgentStorage(sessionId: string): Promise<void> {
  const { claudeConfigDir, cursorConfigDir, codexHome } = globalAgentStoragePaths(sessionId);
  await Promise.all([
    fs.mkdir(claudeConfigDir, { recursive: true }),
    fs.mkdir(cursorConfigDir, { recursive: true }),
    fs.mkdir(codexHome, { recursive: true }),
  ]);
}

async function canonicalAgentCwd(cwd: string): Promise<string> {
  try {
    return await fs.realpath(cwd);
  } catch {
    return cwd;
  }
}

/**
 * Move agent history into per-session storage when it was written to the default
 * agent config (e.g. before env vars took effect) or legacy symlink cwds.
 */
export async function migrateGlobalAgentDataIfNeeded(
  sessionId: string,
  codeDir: string,
  opts?: { agentStorageIsolated?: boolean },
): Promise<void> {
  await ensureGlobalAgentStorage(sessionId);
  const storageRoots = globalAgentStoragePaths(sessionId);
  const agentCwd = await ensureGlobalSessionCwd(sessionId, codeDir);
  if (await agentHasSavedSession(agentCwd, storageRoots)) return;

  const canonicalCodeDir = await canonicalAgentCwd(codeDir);
  const sources: { fromCwd: string; fromRoots?: AgentStorageRoots }[] = [
    { fromCwd: agentCwd },
    { fromCwd: agentCwd, fromRoots: storageRoots },
  ];
  // Pre-isolation sessions may have written to the default agent config before env vars applied.
  if (!opts?.agentStorageIsolated) {
    sources.unshift({ fromCwd: canonicalCodeDir });
    if (canonicalCodeDir !== agentCwd) {
      sources.push({ fromCwd: canonicalCodeDir, fromRoots: storageRoots });
    }
  }

  for (const source of sources) {
    if (!(await agentHasSavedSession(source.fromCwd, source.fromRoots))) continue;
    if (
      await copyAgentSessionDataBetweenRoots(
        source.fromCwd,
        agentCwd,
        source.fromRoots,
        storageRoots,
      )
    ) {
      return;
    }
  }
}

/** Clear saved agent data for a global session (symlink cwd + per-session storage + legacy code-dir keys). */
export async function clearGlobalSessionAgentData(sessionId: string, codeDir: string): Promise<void> {
  const agentCwd = await ensureGlobalSessionCwd(sessionId, codeDir);
  const storageRoots = globalAgentStoragePaths(sessionId);
  await clearAgentSessionData(agentCwd);
  await clearAgentSessionData(agentCwd, { storageRoots });
  const canonicalCodeDir = await canonicalAgentCwd(codeDir);
  if (canonicalCodeDir !== agentCwd) {
    await clearAgentSessionData(canonicalCodeDir);
    await clearAgentSessionData(canonicalCodeDir, { storageRoots });
  }
}

export async function removeGlobalAgentStorage(sessionId: string): Promise<void> {
  await fs.rm(globalAgentDataRoot(sessionId), { recursive: true, force: true });
  await removeGlobalSessionCwd(sessionId);
}

/** @deprecated Legacy symlink cwd; kept for cleaning up older agent data keyed by symlink path. */
export async function ensureGlobalSessionCwd(sessionId: string, codeDir: string): Promise<string> {
  const linkPath = globalSessionCwdPath(sessionId);
  await fs.mkdir(dirname(linkPath), { recursive: true });

  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(linkPath);
      if (target === codeDir) return linkPath;
      await fs.unlink(linkPath);
    } else {
      return linkPath;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  await fs.symlink(codeDir, linkPath);
  return linkPath;
}

export async function removeGlobalSessionCwd(sessionId: string): Promise<void> {
  try {
    await fs.unlink(globalSessionCwdPath(sessionId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/**
 * Agent PTY cwd: per-session symlink into the code directory for global sessions
 * (Cursor stores chats under ~/.cursor keyed by cwd — CURSOR_CONFIG_DIR does not
 * relocate them). Repo sessions use the worktree path.
 */
export async function resolveAgentCwd(session: Session): Promise<string> {
  if (session.global) {
    await ensureGlobalAgentStorage(session.id);
    return ensureGlobalSessionCwd(session.id, session.repoPath);
  }
  return canonicalAgentCwd(session.worktreePath);
}
