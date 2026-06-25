import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILES_TO_MIGRATE = ['sessions.json', 'settings.json', 'diary.json'];

const LEGACY_USER_DATA_DIRS = ['Claude Worktrees', 'claude-worktrees-ui'];

const REMOVED_GLOBAL_DATA_DIRS = ['global-sessions', 'global-workspaces', 'global-agent-data'];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function newDirHasData(newDir: string): Promise<boolean> {
  for (const file of FILES_TO_MIGRATE) {
    if (await pathExists(join(newDir, file))) return true;
  }
  return false;
}

async function findLegacyDir(appSupport: string): Promise<string | null> {
  for (const name of LEGACY_USER_DATA_DIRS) {
    const dir = join(appSupport, name);
    if (!(await pathExists(dir))) continue;
    for (const file of FILES_TO_MIGRATE) {
      if (await pathExists(join(dir, file))) return dir;
    }
  }
  return null;
}

export async function migrateLegacyUserData(): Promise<void> {
  const newDir = app.getPath('userData');
  if (await newDirHasData(newDir)) return;

  const appSupport = join(homedir(), 'Library', 'Application Support');
  const legacyDir = await findLegacyDir(appSupport);
  if (!legacyDir) return;

  await fs.mkdir(newDir, { recursive: true });
  for (const file of FILES_TO_MIGRATE) {
    const src = join(legacyDir, file);
    if (!(await pathExists(src))) continue;
    await fs.copyFile(src, join(newDir, file));
    console.log(`[migrate] copied ${file} from ${legacyDir}`);
  }
}

/** Remove deprecated global sessions and their on-disk storage. */
export async function purgeRemovedGlobalSessions(): Promise<void> {
  const userData = app.getPath('userData');
  const sessionsPath = join(userData, 'sessions.json');

  if (await pathExists(sessionsPath)) {
    try {
      const raw = await fs.readFile(sessionsPath, 'utf8');
      const parsed = JSON.parse(raw) as { sessions?: Array<Record<string, unknown>> };
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      const kept = sessions.filter((session) => !session.global);
      if (kept.length !== sessions.length) {
        await fs.writeFile(
          sessionsPath,
          `${JSON.stringify({ sessions: kept }, null, 2)}\n`,
        );
        console.log(`[migrate] removed ${sessions.length - kept.length} global session(s)`);
      }
    } catch (err) {
      console.warn('[migrate] failed to strip global sessions:', (err as Error).message);
    }
  }

  for (const dir of REMOVED_GLOBAL_DATA_DIRS) {
    const path = join(userData, dir);
    try {
      await fs.rm(path, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[migrate] failed to remove ${dir}:`, (err as Error).message);
    }
  }
}
