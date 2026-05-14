import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GhSetupResult } from '@shared/types';

const execFileAsync = promisify(execFile);

function loginShell(): string {
  return process.env.SHELL || '/bin/zsh';
}

async function runInLoginShell(
  command: string,
  opts: { timeout: number; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  const shell = loginShell();
  const { stdout, stderr } = await execFileAsync(shell, ['-lic', command], {
    timeout: opts.timeout,
    maxBuffer: opts.maxBuffer ?? 10 * 1024 * 1024,
    env: { ...process.env },
  });
  return { stdout: stdout ?? '', stderr: stderr ?? '' };
}

async function gitAvailable(): Promise<boolean> {
  try {
    const { stdout } = await runInLoginShell('command -v git >/dev/null 2>&1 && git --version', {
      timeout: 20_000,
    });
    return /git version/i.test(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync('git', ['--version'], { timeout: 8000 });
      return /git version/i.test(stdout);
    } catch {
      return false;
    }
  }
}

async function ghAvailable(): Promise<boolean> {
  try {
    const { stdout } = await runInLoginShell('command -v gh >/dev/null 2>&1 && gh version', {
      timeout: 20_000,
    });
    return /gh version/i.test(stdout);
  } catch {
    return false;
  }
}

async function brewInstall(
  send: (m: string) => void,
  formula: string,
  progressLabel: string,
  verify: () => Promise<boolean>,
): Promise<boolean> {
  send(progressLabel);
  try {
    await runInLoginShell(`command -v brew >/dev/null 2>&1 && brew install ${formula}`, {
      timeout: 600_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return verify();
  } catch (err) {
    console.error(`[gh-cli] brew install ${formula} failed:`, (err as Error).message);
    return verify();
  }
}

async function wingetInstall(
  send: (m: string) => void,
  wingetId: string,
  progressLabel: string,
  verify: () => Promise<boolean>,
): Promise<boolean> {
  send(progressLabel);
  try {
    await execFileAsync(
      'winget',
      [
        'install',
        '--id',
        wingetId,
        '-e',
        '--source',
        'winget',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ],
      { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 },
    );
    return verify();
  } catch (err) {
    console.error(`[gh-cli] winget install ${wingetId} failed:`, (err as Error).message);
    return verify();
  }
}

async function ensureGit(send: (m: string) => void): Promise<boolean> {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return brewInstall(send, 'git', 'Installing Git via Homebrew...', gitAvailable);
  }
  if (process.platform === 'win32') {
    return wingetInstall(send, 'Git.Git', 'Installing Git via winget...', gitAvailable);
  }
  return false;
}

async function ensureGh(send: (m: string) => void): Promise<boolean> {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return brewInstall(send, 'gh', 'Installing GitHub CLI via Homebrew...', ghAvailable);
  }
  if (process.platform === 'win32') {
    return wingetInstall(send, 'GitHub.cli', 'Installing GitHub CLI via winget...', ghAvailable);
  }
  return false;
}

export async function ensureGitHubCli(send: (message: string) => void): Promise<GhSetupResult> {
  send('Checking if Git is installed...');
  if (!(await gitAvailable())) {
    send('Installing Git...');
    const gitOk = await ensureGit(send);
    if (!gitOk || !(await gitAvailable())) {
      send('Could not install Git automatically.');
      const hint =
        process.platform === 'darwin'
          ? 'Install manually: brew install git (https://git-scm.com)'
          : process.platform === 'win32'
            ? 'Install manually: winget install Git.Git (https://git-scm.com)'
            : 'Install manually — see https://git-scm.com/downloads';
      return { ok: false, error: `Git is not available. ${hint}` };
    }
  }

  send('Checking if GitHub API is installed...');
  if (await ghAvailable()) {
    return { ok: true, outcome: 'already-installed' };
  }

  send('Installing GitHub API...');
  const ghOk = await ensureGh(send);
  if (ghOk) {
    return { ok: true, outcome: 'installed' };
  }

  const hint =
    process.platform === 'darwin'
      ? 'Install manually: brew install gh (https://cli.github.com)'
      : process.platform === 'win32'
        ? 'Install manually: winget install GitHub.cli (https://cli.github.com)'
        : 'Install manually — see https://cli.github.com/manual/installation';

  send('Could not install automatically.');
  return {
    ok: false,
    error: `Automatic GitHub CLI install failed. ${hint}`,
  };
}
