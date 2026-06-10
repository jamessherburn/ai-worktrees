import type { WebContents } from 'electron';
import * as pty from 'node-pty';
import { promises as fs } from 'node:fs';
import { IPC } from '@shared/ipc-channels';
import type { AgentId } from '@shared/agents';
import type { ActivityState } from '@shared/types';
import { buildLaunchCommand } from './agents.js';
import { markSessionStarted } from './sessions.js';

type ActivityEvent = { at: number; bytes: number };

type PtyEntry = {
  proc: pty.IPty;
  backlog: string[];
  backlogBytes: number;
  recentEvents: ActivityEvent[];
  manuallyIdle: boolean;
  lastEmittedActivity: ActivityState | undefined;
};

const MAX_BACKLOG_BYTES = 500_000;
const MEANINGFUL_BYTES = 8;
const ACTIVITY_WINDOW_MS = 1500;
const ACTIVITY_BYTE_THRESHOLD = 60;
const POLL_INTERVAL_MS = 500;

const ptys = new Map<string, PtyEntry>();
let listener: WebContents | undefined;
let activityTimer: NodeJS.Timeout | undefined;

export function registerWebContents(wc: WebContents): void {
  listener = wc;
  wc.on('destroyed', () => {
    if (listener === wc) listener = undefined;
  });
}

function pushBacklog(entry: PtyEntry, chunk: string): void {
  entry.backlog.push(chunk);
  entry.backlogBytes += chunk.length;
  while (entry.backlogBytes > MAX_BACKLOG_BYTES && entry.backlog.length > 1) {
    const removed = entry.backlog.shift()!;
    entry.backlogBytes -= removed.length;
  }
}

function recordActivity(entry: PtyEntry, byteCount: number): void {
  entry.recentEvents.push({ at: Date.now(), bytes: byteCount });
  if (byteCount >= MEANINGFUL_BYTES) entry.manuallyIdle = false;
}

function computeActivity(entry: PtyEntry): ActivityState {
  const cutoff = Date.now() - ACTIVITY_WINDOW_MS;
  while (entry.recentEvents.length > 0 && entry.recentEvents[0].at < cutoff) {
    entry.recentEvents.shift();
  }
  if (entry.manuallyIdle) return 'idle';
  let bytes = 0;
  for (const ev of entry.recentEvents) bytes += ev.bytes;
  return bytes > ACTIVITY_BYTE_THRESHOLD ? 'working' : 'idle';
}

function emitActivity(sessionId: string, activity: ActivityState): void {
  listener?.send(IPC.PtyActivity, { sessionId, activity });
}

function tickActivity(): void {
  for (const [sessionId, entry] of ptys) {
    const next = computeActivity(entry);
    if (next !== entry.lastEmittedActivity) {
      entry.lastEmittedActivity = next;
      emitActivity(sessionId, next);
    }
  }
}

function ensureActivityTimer(): void {
  if (activityTimer) return;
  activityTimer = setInterval(tickActivity, POLL_INTERVAL_MS);
}

function shellPath(): string {
  return process.env.SHELL || '/bin/zsh';
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function startPty(opts: {
  sessionId: string;
  agentId: AgentId;
  cwd: string;
  cols: number;
  rows: number;
}): Promise<{ ok: true; reattached: boolean } | { ok: false; error: string }> {
  if (ptys.has(opts.sessionId)) {
    const existing = ptys.get(opts.sessionId)!;
    const snapshot = existing.backlog.join('');
    queueMicrotask(() => {
      if (snapshot) listener?.send(IPC.PtyData, { sessionId: opts.sessionId, data: snapshot });
    });
    return { ok: true, reattached: true };
  }

  if (!(await exists(opts.cwd))) {
    return { ok: false, error: `Worktree path no longer exists: ${opts.cwd}` };
  }

  const launch = await buildLaunchCommand(opts.agentId, {
    cwd: opts.cwd,
  });

  const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' };

  let proc: pty.IPty;
  try {
    // Match agent-detection.ts: login + interactive (-lic) so ~/.zshrc PATH
    // (nvm, fnm, etc.) matches what `command -v` saw when marking the agent installed.
    proc = pty.spawn(shellPath(), ['-lic', launch.shellCommand], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env,
    });
  } catch (err) {
    return { ok: false, error: `Failed to spawn shell: ${(err as Error).message}` };
  }

  const entry: PtyEntry = {
    proc,
    backlog: [],
    backlogBytes: 0,
    recentEvents: [],
    manuallyIdle: false,
    lastEmittedActivity: undefined,
  };
  ptys.set(opts.sessionId, entry);
  void markSessionStarted(opts.sessionId);
  ensureActivityTimer();

  proc.onData((data) => {
    pushBacklog(entry, data);
    recordActivity(entry, data.length);
    listener?.send(IPC.PtyData, { sessionId: opts.sessionId, data });
  });

  proc.onExit(({ exitCode }) => {
    ptys.delete(opts.sessionId);
    listener?.send(IPC.PtyExit, { sessionId: opts.sessionId, exitCode });
  });

  return { ok: true, reattached: false };
}

export function getActivityState(sessionId: string): ActivityState {
  const entry = ptys.get(sessionId);
  if (!entry) return 'idle';
  return computeActivity(entry);
}

export function markSessionIdle(sessionId: string): void {
  const entry = ptys.get(sessionId);
  if (!entry) return;
  entry.manuallyIdle = true;
  entry.recentEvents = [];
  if (entry.lastEmittedActivity !== 'idle') {
    entry.lastEmittedActivity = 'idle';
    emitActivity(sessionId, 'idle');
  }
}

export function writePty(sessionId: string, data: string): void {
  ptys.get(sessionId)?.proc.write(data);
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const entry = ptys.get(sessionId);
  if (!entry) return;
  try {
    entry.proc.resize(cols, rows);
  } catch {
    // ignore: pty may have just exited
  }
}

export function killPty(sessionId: string): void {
  const entry = ptys.get(sessionId);
  if (!entry) return;
  try {
    entry.proc.kill();
  } catch {
    // ignore
  }
  ptys.delete(sessionId);
}

export async function gracefulShutdown(timeoutMs = 800): Promise<void> {
  const entries = Array.from(ptys.values());
  if (entries.length === 0) return;

  for (const entry of entries) {
    try {
      entry.proc.kill('SIGINT');
    } catch {
      // ignore
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (ptys.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }

  for (const entry of Array.from(ptys.values())) {
    try {
      entry.proc.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
  ptys.clear();
}

export function killAllPtys(): void {
  for (const id of Array.from(ptys.keys())) killPty(id);
}

export function isRunning(sessionId: string): boolean {
  return ptys.has(sessionId);
}

export function runningSessionIds(): string[] {
  return Array.from(ptys.keys());
}

export function getBacklog(sessionId: string): string {
  return ptys.get(sessionId)?.backlog.join('') ?? '';
}
