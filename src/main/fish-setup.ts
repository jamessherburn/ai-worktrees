import { brewInstall } from './gh-cli';
import { clearShellPathCache, findFishPath } from './resolve-shell-path';
import type { FishSetupResult } from '@shared/types';

async function fishAvailable(): Promise<boolean> {
  clearShellPathCache();
  return (await findFishPath()) !== null;
}

export async function ensureFishShell(send: (message: string) => void): Promise<FishSetupResult> {
  send('Checking if fish shell is installed...');
  if (await fishAvailable()) {
    return { ok: true, outcome: 'already-installed' };
  }

  if (process.platform === 'win32') {
    return { ok: true, outcome: 'skipped' };
  }

  send('Installing fish shell...');
  const fishOk = await brewInstall(
    send,
    'fish',
    'Installing fish via Homebrew...',
    fishAvailable,
  );

  clearShellPathCache();
  if (fishOk && (await fishAvailable())) {
    return { ok: true, outcome: 'installed' };
  }

  const hint =
    process.platform === 'darwin'
      ? 'Install manually: brew install fish (https://fishshell.com)'
      : 'Install manually: brew install fish or your distro package manager (https://fishshell.com)';

  send('Could not install fish automatically.');
  return {
    ok: false,
    error: `Fish shell is not available. ${hint}`,
  };
}
