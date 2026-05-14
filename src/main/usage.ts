import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type DailyUsage = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
};

export type UsageResult =
  | { ok: true; usage: DailyUsage | null }
  | { ok: false; error: string };

const TTL_MS = 15 * 60 * 1000;

let cache: { fetchedAt: number; result: UsageResult } | null = null;
let inflight: Promise<UsageResult> | null = null;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

const CCUSAGE_VERSION = '18.0.10';

async function resolveRunner(): Promise<{ cmd: string; args: string[] } | null> {
  for (const candidate of ['/opt/homebrew/bin/npx', '/usr/local/bin/npx', '/usr/bin/npx']) {
    if (await pathExists(candidate)) {
      return { cmd: candidate, args: ['--yes', `ccusage@${CCUSAGE_VERSION}`, '--json'] };
    }
  }
  const devboxBun = join(homedir(), '.devbox/ai/claude/bun');
  if (await pathExists(devboxBun)) {
    return { cmd: devboxBun, args: ['x', '--bun', `ccusage@${CCUSAGE_VERSION}`, '--json'] };
  }
  return null;
}

function parseCcusage(stdout: string): { daily?: DailyUsage[] } | null {
  const candidates = [stdout, stripNonJsonNoise(stdout)];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      const e = err as Error;
      const m = /position (\d+)/.exec(e.message);
      if (m) {
        const pos = Number(m[1]);
        const around = candidate.slice(Math.max(0, pos - 60), Math.min(candidate.length, pos + 60));
        console.error(`[usage] JSON parse failed at pos ${pos}: ${e.message}`);
        console.error(`[usage] context: ...${JSON.stringify(around)}...`);
      } else {
        console.error('[usage] JSON parse failed:', e.message);
      }
    }
  }
  return null;
}

function stripNonJsonNoise(stdout: string): string {
  // Bun / npm sometimes interleave progress lines like "$ ccusage..." or "[bun] resolved..."
  // into stdout. Drop any line that doesn't look like JSON content.
  const lines = stdout.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed === '') {
      kept.push(line);
      continue;
    }
    const first = trimmed[0];
    if ('{}[],:"'.includes(first) || /^[0-9a-zA-Z._-]/.test(trimmed) === false) {
      kept.push(line);
      continue;
    }
    if (/^(true|false|null|"|-?\d)/.test(trimmed)) {
      kept.push(line);
      continue;
    }
    // Lines that start with letters (identifiers) are likely progress messages.
    console.error('[usage] dropping suspicious line:', JSON.stringify(line.slice(0, 120)));
  }
  return kept.join('\n');
}

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchToday(): Promise<UsageResult> {
  const runner = await resolveRunner();
  if (!runner) {
    return { ok: false, error: 'Could not find bun (~/.devbox/ai/claude/bun) or npx to run ccusage.' };
  }
  let stdout: string;
  try {
    const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
    const mergedPath = [...extraPath, process.env.PATH ?? ''].filter(Boolean).join(':');
    const result = await execFileAsync(runner.cmd, runner.args, {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
      env: { ...process.env, PATH: mergedPath, NO_COLOR: '1', CI: '1' },
    });
    stdout = result.stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    const detail = e.stderr ? ` — ${e.stderr.split('\n')[0]}` : '';
    console.error('[usage] ccusage spawn failed:', e.message, e.stderr);
    return { ok: false, error: `ccusage failed: ${e.message}${detail}` };
  }
  const data = parseCcusage(stdout);
  if (!data) {
    return { ok: false, error: 'ccusage output was unparseable (see main process logs).' };
  }
  const today = todayLocalDate();
  const usage = data.daily?.find((d) => d.date === today) ?? null;
  return { ok: true, usage };
}

export async function getTodayUsage(force = false): Promise<UsageResult> {
  if (!force && cache && cache.result.ok && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.result;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const result = await fetchToday();
      cache = { fetchedAt: Date.now(), result };
      return result;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
