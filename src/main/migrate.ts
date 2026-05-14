import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILES_TO_MIGRATE = ['sessions.json', 'settings.json', 'diary.json'];

const LEGACY_USER_DATA_DIRS = ['Claude Worktrees', 'claude-worktrees-ui'];

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
