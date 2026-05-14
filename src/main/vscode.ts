import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import type { OpenInVSCodeResult } from '@shared/types';

const execFileAsync = promisify(execFile);

const VSCODE_CLI_CANDIDATES = [
  '/usr/local/bin/code',
  '/opt/homebrew/bin/code',
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
  '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code',
];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function findVSCodeCli(): Promise<string | null> {
  for (const candidate of VSCODE_CLI_CANDIDATES) {
    if (await pathExists(candidate)) return candidate;
  }
  try {
    const { stdout } = await execFileAsync('/usr/bin/which', ['code']);
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    // ignore
  }
  return null;
}

export async function openWorktreeInVSCode(path: string): Promise<OpenInVSCodeResult> {
  const cli = await findVSCodeCli();
  if (!cli) return { ok: false, reason: 'not-installed' };
  try {
    await execFileAsync(cli, ['--reuse-window', path]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'failed', error: (err as Error).message };
  }
}
