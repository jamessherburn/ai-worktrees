import type { WebContents } from 'electron';
import * as pty from 'node-pty';
import { promises as fs } from 'node:fs';
import { IPC } from '@shared/ipc-channels';
import { resolveShellPath } from './resolve-shell-path.js';

type ShellPtyEntry = {
  proc: pty.IPty;
  backlog: string[];
  backlogBytes: number;
};

const MAX_BACKLOG_BYTES = 500_000;

const shellPtys = new Map<string, ShellPtyEntry>();
let listener: WebContents | undefined;

export function registerShellPtyWebContents(wc: WebContents): void {
  listener = wc;
  wc.on('destroyed', () => {
    if (listener === wc) listener = undefined;
  });
}

function pushBacklog(entry: ShellPtyEntry, chunk: string): void {
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

export async function startShellPty(opts: {
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
}): Promise<{ ok: true; reattached: boolean } | { ok: false; error: string }> {
  if (shellPtys.has(opts.sessionId)) {
    const existing = shellPtys.get(opts.sessionId)!;
    const snapshot = existing.backlog.join('');
    queueMicrotask(() => {
      if (snapshot) listener?.send(IPC.ShellPtyData, { sessionId: opts.sessionId, data: snapshot });
    });
    return { ok: true, reattached: true };
  }

  if (!(await exists(opts.cwd))) {
    return { ok: false, error: `Worktree path no longer exists: ${opts.cwd}` };
  }

  const shell = await resolveShellPath();
  const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color', SHELL: shell };

  let proc: pty.IPty;
  try {
    proc = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env,
    });
  } catch (err) {
    return { ok: false, error: `Failed to spawn shell: ${(err as Error).message}` };
  }

  const entry: ShellPtyEntry = {
    proc,
    backlog: [],
    backlogBytes: 0,
  };
  shellPtys.set(opts.sessionId, entry);

  proc.onData((data) => {
    pushBacklog(entry, data);
    listener?.send(IPC.ShellPtyData, { sessionId: opts.sessionId, data });
  });

  proc.onExit(({ exitCode }) => {
    shellPtys.delete(opts.sessionId);
    listener?.send(IPC.ShellPtyExit, { sessionId: opts.sessionId, exitCode });
  });

  return { ok: true, reattached: false };
}

export function writeShellPty(sessionId: string, data: string): void {
  shellPtys.get(sessionId)?.proc.write(data);
}

export function resizeShellPty(sessionId: string, cols: number, rows: number): void {
  const entry = shellPtys.get(sessionId);
  if (!entry) return;
  try {
    entry.proc.resize(cols, rows);
  } catch {
    // ignore: pty may have just exited
  }
}

export function killShellPty(sessionId: string): void {
  const entry = shellPtys.get(sessionId);
  if (!entry) return;
  try {
    entry.proc.kill();
  } catch {
    // ignore
  }
  shellPtys.delete(sessionId);
}

export function killAllShellPtys(): void {
  for (const id of Array.from(shellPtys.keys())) killShellPty(id);
}

export async function gracefulShellShutdown(timeoutMs = 800): Promise<void> {
  const entries = Array.from(shellPtys.values());
  if (entries.length === 0) return;

  for (const entry of entries) {
    try {
      entry.proc.kill('SIGINT');
    } catch {
      // ignore
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (shellPtys.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }

  for (const entry of Array.from(shellPtys.values())) {
    try {
      entry.proc.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
  shellPtys.clear();
}
