import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Session } from '@shared/types';
import {
  claudeHasSavedConversation,
  clearAgentSessionData,
  codexHasSavedSession,
  copyAgentSessionDataBetweenRoots,
  cursorHasSavedSession,
  type AgentStorageRoots,
} from './agents.js';

const requireElectron = createRequire(import.meta.url);

const GLOBAL_CODE_LINK = 'code';

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

/** Legacy per-global-session symlink path (pre–workspace isolation). */
export function globalSessionCwdPath(sessionId: string): string {
  return join(userDataRoot(), 'global-sessions', sessionId);
}

/** Real per-global-session workspace root (Cursor keys chats by --workspace, not PTY cwd). */
export function globalWorkspacePath(sessionId: string): string {
  return join(userDataRoot(), 'global-workspaces', sessionId);
}

export function globalWorktreePath(sessionId: string): string {
  return join(globalWorkspacePath(sessionId), GLOBAL_CODE_LINK);
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

async function ensureSymlinkToTarget(linkPath: string, target: string): Promise<void> {
  await fs.mkdir(dirname(linkPath), { recursive: true });
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const current = await fs.readlink(linkPath);
      if (current === target) return;
      await fs.unlink(linkPath);
    } else {
      return;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await fs.symlink(target, linkPath);
}

/**
 * Per-session workspace: a real directory (unique Cursor project key) with `code` → codeDir.
 * Cursor resolves symlink cwds to the code directory for storage; --workspace must be this root.
 */
export async function ensureGlobalWorkspace(sessionId: string, codeDir: string): Promise<string> {
  const workspace = globalWorkspacePath(sessionId);
  await fs.mkdir(workspace, { recursive: true });
  await ensureSymlinkToTarget(globalWorktreePath(sessionId), codeDir);
  return workspace;
}

async function globalSessionHasSavedData(
  workspace: string,
  workCwd: string,
  storageRoots: AgentStorageRoots,
): Promise<boolean> {
  return (
    (await claudeHasSavedConversation(workCwd, storageRoots)) ||
    (await cursorHasSavedSession(workspace, storageRoots)) ||
    (await codexHasSavedSession(workCwd, storageRoots))
  );
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
  const workspace = await ensureGlobalWorkspace(sessionId, codeDir);
  const workCwd = globalWorktreePath(sessionId);
  if (await globalSessionHasSavedData(workspace, workCwd, storageRoots)) return;

  const canonicalCodeDir = await canonicalAgentCwd(codeDir);
  const legacyCwd = globalSessionCwdPath(sessionId);
  const sources: { fromCwd: string; fromRoots?: AgentStorageRoots; cursorCwd?: string }[] = [
    { fromCwd: workCwd, cursorCwd: workspace },
    { fromCwd: workCwd, fromRoots: storageRoots, cursorCwd: workspace },
    { fromCwd: legacyCwd, cursorCwd: legacyCwd },
    { fromCwd: legacyCwd, fromRoots: storageRoots, cursorCwd: legacyCwd },
  ];
  if (!opts?.agentStorageIsolated) {
    sources.unshift({ fromCwd: canonicalCodeDir, cursorCwd: canonicalCodeDir });
    sources.push({ fromCwd: canonicalCodeDir, fromRoots: storageRoots, cursorCwd: canonicalCodeDir });
  }

  for (const source of sources) {
    const fromCursorCwd = source.cursorCwd ?? source.fromCwd;
    const hasData =
      (await claudeHasSavedConversation(source.fromCwd, source.fromRoots)) ||
      (await cursorHasSavedSession(fromCursorCwd, source.fromRoots)) ||
      (await codexHasSavedSession(source.fromCwd, source.fromRoots));
    if (!hasData) continue;

    let copied = false;
    if (source.fromRoots) {
      copied =
        (await copyAgentSessionDataBetweenRoots(
          source.fromCwd,
          workCwd,
          source.fromRoots,
          storageRoots,
        )) || copied;
    }
    if (fromCursorCwd !== workspace) {
      copied =
        (await copyAgentSessionDataBetweenRoots(
          fromCursorCwd,
          workspace,
          source.fromRoots,
          undefined,
        )) || copied;
    }
    if (copied) return;
  }
}

/** Clear saved agent data for a global session (workspace, worktree link, per-session storage, legacy paths). */
export async function clearGlobalSessionAgentData(sessionId: string, codeDir: string): Promise<void> {
  const workspace = await ensureGlobalWorkspace(sessionId, codeDir);
  const workCwd = globalWorktreePath(sessionId);
  const storageRoots = globalAgentStoragePaths(sessionId);
  await clearAgentSessionData(workspace);
  await clearAgentSessionData(workCwd);
  await clearAgentSessionData(workCwd, { storageRoots });
  const canonicalCodeDir = await canonicalAgentCwd(codeDir);
  if (canonicalCodeDir !== workCwd) {
    await clearAgentSessionData(canonicalCodeDir);
    await clearAgentSessionData(canonicalCodeDir, { storageRoots });
  }
  await clearAgentSessionData(globalSessionCwdPath(sessionId));
}

export async function removeGlobalAgentStorage(sessionId: string): Promise<void> {
  await fs.rm(globalAgentDataRoot(sessionId), { recursive: true, force: true });
  await fs.rm(globalWorkspacePath(sessionId), { recursive: true, force: true });
  await removeGlobalSessionCwd(sessionId);
}

/** @deprecated Legacy symlink cwd; kept for cleaning up older agent data keyed by symlink path. */
export async function ensureGlobalSessionCwd(sessionId: string, codeDir: string): Promise<string> {
  const linkPath = globalSessionCwdPath(sessionId);
  await ensureSymlinkToTarget(linkPath, codeDir);
  return linkPath;
}

export async function removeGlobalSessionCwd(sessionId: string): Promise<void> {
  try {
    await fs.unlink(globalSessionCwdPath(sessionId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** PTY cwd: `global-workspaces/{id}/code` → codeDir. */
export async function resolveAgentCwd(session: Session): Promise<string> {
  if (session.global) {
    await ensureGlobalAgentStorage(session.id);
    await ensureGlobalWorkspace(session.id, session.repoPath);
    return globalWorktreePath(session.id);
  }
  return canonicalAgentCwd(session.worktreePath);
}

/** Cursor --workspace and resume probe path (real directory; not the code-dir symlink). */
export async function resolveAgentWorkspace(session: Session): Promise<string> {
  if (session.global) {
    return ensureGlobalWorkspace(session.id, session.repoPath);
  }
  return resolveAgentCwd(session);
}
