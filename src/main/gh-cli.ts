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
    const { stdout } = await execFileAsync('git', ['--version'], { timeout: 8000 });
    return /git version/i.test(stdout);
  } catch {
    return false;
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

async function installWithBrew(send: (m: string) => void): Promise<boolean> {
  send('Installing via Homebrew...');
  try {
    await runInLoginShell('command -v brew >/dev/null 2>&1 && brew install gh', {
      timeout: 600_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return ghAvailable();
  } catch (err) {
    console.error('[gh-cli] brew install failed:', (err as Error).message);
    return false;
  }
}

async function installWindows(send: (m: string) => void): Promise<boolean> {
  send('Installing via winget...');
  try {
    await execFileAsync(
      'winget',
      [
        'install',
        '--id',
        'GitHub.cli',
        '-e',
        '--source',
        'winget',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ],
      { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 },
    );
    return ghAvailable();
  } catch (err) {
    console.error('[gh-cli] winget install failed:', (err as Error).message);
    return false;
  }
}

export async function ensureGitHubCli(send: (message: string) => void): Promise<GhSetupResult> {
  send('Checking if GitHub API is installed...');

  if (!(await gitAvailable())) {
    send('Git not found — install Git first.');
    return { ok: false, error: 'Git is not installed or not on PATH.' };
  }

  if (await ghAvailable()) {
    return { ok: true, outcome: 'already-installed' };
  }

  send('Installing GitHub API...');

  let installed = false;
  if (process.platform === 'darwin' || process.platform === 'linux') {
    installed = await installWithBrew(send);
  } else if (process.platform === 'win32') {
    installed = await installWindows(send);
  }

  if (installed) {
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
    error: `Automatic install failed. ${hint}`,
  };
}
