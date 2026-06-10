import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cachedShellPath: string | undefined;

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function enrichedPath(): string {
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${homedir()}/.local/bin`,
    process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
  ].join(':');
}

let cachedNvimPath: string | undefined;

/** Locate nvim when installed; returns null if not found. */
export async function findNvimPath(): Promise<string | null> {
  const candidates = [
    '/opt/homebrew/bin/nvim',
    '/usr/local/bin/nvim',
    '/usr/bin/nvim',
    `${homedir()}/.local/bin/nvim`,
  ];

  for (const path of candidates) {
    if (await isExecutable(path)) {
      return path;
    }
  }

  try {
    const { stdout } = await execFileAsync('which', ['nvim'], {
      env: { ...process.env, PATH: enrichedPath() },
    });
    const found = stdout.trim().split('\n')[0]?.trim();
    if (found && (await isExecutable(found))) {
      return found;
    }
  } catch {
    // nvim not installed
  }

  return null;
}

export function clearNvimPathCache(): void {
  cachedNvimPath = undefined;
}

/** Resolve nvim binary for embedded editor PTYs. */
export async function resolveNvimPath(): Promise<string | null> {
  if (cachedNvimPath) return cachedNvimPath;
  const nvim = await findNvimPath();
  if (nvim) cachedNvimPath = nvim;
  return nvim;
}

export function isFishPath(path: string): boolean {
  return path === 'fish' || path.endsWith('/fish');
}

/** Locate fish when installed; returns null if not found. */
export async function findFishPath(): Promise<string | null> {
  const loginShell = process.env.SHELL;
  if (loginShell && isFishPath(loginShell) && (await isExecutable(loginShell))) {
    return loginShell;
  }

  const candidates = [
    '/opt/homebrew/bin/fish',
    '/usr/local/bin/fish',
    '/usr/bin/fish',
    `${homedir()}/.local/bin/fish`,
  ];

  for (const path of candidates) {
    if (await isExecutable(path)) {
      return path;
    }
  }

  try {
    const { stdout } = await execFileAsync('which', ['fish'], {
      env: { ...process.env, PATH: enrichedPath() },
    });
    const found = stdout.trim().split('\n')[0]?.trim();
    if (found && (await isExecutable(found))) {
      return found;
    }
  } catch {
    // fish not installed
  }

  return null;
}

export function clearShellPathCache(): void {
  cachedShellPath = undefined;
}

/** Prefer fish when installed; fall back to the user's login shell. */
export async function resolveShellPath(): Promise<string> {
  if (cachedShellPath) return cachedShellPath;

  const fish = await findFishPath();
  if (fish) {
    cachedShellPath = fish;
    return fish;
  }

  cachedShellPath = process.env.SHELL || '/bin/zsh';
  return cachedShellPath;
}
