import type { WebContents } from 'electron';
import * as pty from 'node-pty';
import { promises as fs } from 'node:fs';
import { IPC } from '@shared/ipc-channels';
import type { ResolvedTheme } from '@shared/nvim-theme';
import { ensureNvimConfig, nvimConfigDir, nvimDataDir, nvimInitPath } from './nvim-config.js';
import { enrichedPath, resolveNvimPath } from './resolve-shell-path.js';

const VALID_THEMES = new Set<ResolvedTheme>(['dark', 'light', 'monokai']);

type NvimPtyEntry = {
  proc: pty.IPty;
  backlog: string[];
  backlogBytes: number;
};

const MAX_BACKLOG_BYTES = 500_000;

const nvimPtys = new Map<string, NvimPtyEntry>();
let listener: WebContents | undefined;

export function registerNvimPtyWebContents(wc: WebContents): void {
  listener = wc;
  wc.on('destroyed', () => {
    if (listener === wc) listener = undefined;
  });
}

function pushBacklog(entry: NvimPtyEntry, chunk: string): void {
  entry.backlog.push(chunk);
  entry.backlogBytes += chunk.length;
  while (entry.backlogBytes > MAX_BACKLOG_BYTES && entry.backlog.length > 1) {
    const removed = entry.backlog.shift()!;
    entry.backlogBytes -= removed.length;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeTheme(theme?: string): ResolvedTheme {
  if (theme && VALID_THEMES.has(theme as ResolvedTheme)) {
    return theme as ResolvedTheme;
  }
  return 'dark';
}

export async function startNvimPty(opts: {
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
  theme?: ResolvedTheme;
}): Promise<{ ok: true; reattached: boolean } | { ok: false; error: string }> {
  if (nvimPtys.has(opts.sessionId)) {
    const existing = nvimPtys.get(opts.sessionId)!;
    const snapshot = existing.backlog.join('');
    const theme = normalizeTheme(opts.theme);
    queueMicrotask(() => {
      if (snapshot) listener?.send(IPC.NvimPtyData, { sessionId: opts.sessionId, data: snapshot });
    });
    return { ok: true, reattached: true };
  }

  if (!(await exists(opts.cwd))) {
    return { ok: false, error: `Worktree path no longer exists: ${opts.cwd}` };
  }

  await ensureNvimConfig();
  const dataDir = nvimDataDir();
  await fs.mkdir(dataDir, { recursive: true });

  const nvimPath = await resolveNvimPath();
  if (!nvimPath) {
    return {
      ok: false,
      error: 'Neovim not found. Install nvim (e.g. brew install neovim) and restart the app.',
    };
  }

  const initPath = nvimInitPath();
  const theme = normalizeTheme(opts.theme);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: enrichedPath(),
    TERM: 'xterm-256color',
    AI_WORKTREES_NVIM_DATA: dataDir,
    AI_WORKTREES_NVIM_CONFIG_DIR: nvimConfigDir(),
    AI_WORKTREES_THEME: theme,
    XDG_DATA_HOME: dataDir,
  };

  let proc: pty.IPty;
  try {
    proc = pty.spawn(nvimPath, ['-u', initPath], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env,
    });
  } catch (err) {
    return {
      ok: false,
      error: `Failed to start Neovim. Install nvim and try again: ${(err as Error).message}`,
    };
  }

  const entry: NvimPtyEntry = {
    proc,
    backlog: [],
    backlogBytes: 0,
  };
  nvimPtys.set(opts.sessionId, entry);

  proc.onData((data) => {
    pushBacklog(entry, data);
    listener?.send(IPC.NvimPtyData, { sessionId: opts.sessionId, data });
  });

  proc.onExit(({ exitCode }) => {
    nvimPtys.delete(opts.sessionId);
    listener?.send(IPC.NvimPtyExit, { sessionId: opts.sessionId, exitCode });
  });

  return { ok: true, reattached: false };
}

export function writeNvimPty(sessionId: string, data: string): void {
  nvimPtys.get(sessionId)?.proc.write(data);
}

export function setNvimPtyTheme(sessionId: string, theme: ResolvedTheme): void {
  const entry = nvimPtys.get(sessionId);
  if (!entry) return;
  const resolved = normalizeTheme(theme);
  entry.proc.write(
    `:silent! lua if _G.AIWorktreesApplyTheme then _G.AIWorktreesApplyTheme('${resolved}') end\n`,
  );
}

export function resizeNvimPty(sessionId: string, cols: number, rows: number): void {
  const entry = nvimPtys.get(sessionId);
  if (!entry) return;
  try {
    entry.proc.resize(cols, rows);
  } catch {
    // ignore: pty may have just exited
  }
}

export function killNvimPty(sessionId: string): void {
  const entry = nvimPtys.get(sessionId);
  if (!entry) return;
  try {
    entry.proc.kill();
  } catch {
    // ignore
  }
  nvimPtys.delete(sessionId);
}

export function killAllNvimPtys(): void {
  for (const id of Array.from(nvimPtys.keys())) killNvimPty(id);
}

export async function gracefulNvimShutdown(timeoutMs = 800): Promise<void> {
  const entries = Array.from(nvimPtys.values());
  if (entries.length === 0) return;

  for (const entry of entries) {
    try {
      entry.proc.kill('SIGINT');
    } catch {
      // ignore
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (nvimPtys.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }

  for (const entry of Array.from(nvimPtys.values())) {
    try {
      entry.proc.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
  nvimPtys.clear();
}
