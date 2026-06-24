import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Session } from '@shared/types';

const requireElectron = createRequire(import.meta.url);

let userDataRootOverride: string | undefined;

/** @internal Test hook */
export function setUserDataRootForTests(root: string | undefined): void {
  userDataRootOverride = root;
}

function userDataRoot(): string {
  if (userDataRootOverride) return userDataRootOverride;
  const { app } = requireElectron('electron') as typeof import('electron');
  return app.getPath('userData');
}

/** Per-global-session directory under userData; symlinked to the code directory for agent cwd isolation. */
export function globalSessionCwdPath(sessionId: string): string {
  return join(userDataRoot(), 'global-sessions', sessionId);
}

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
      // Unexpected file type; leave it alone so we do not destroy user data.
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

/** Agent PTY cwd: unique per global session; worktree path for repo sessions. */
export async function resolveAgentCwd(session: Session): Promise<string> {
  if (session.global) {
    return ensureGlobalSessionCwd(session.id, session.repoPath);
  }
  return session.worktreePath;
}
