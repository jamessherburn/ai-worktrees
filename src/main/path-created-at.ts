import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';

export function statCreatedAtMs(stat: Stats): number {
  const birth = stat.birthtimeMs;
  if (Number.isFinite(birth) && birth > 0) return birth;
  return stat.ctimeMs || stat.mtimeMs || 0;
}

export async function pathCreatedAtMs(path: string): Promise<number> {
  try {
    const stat = await fs.stat(path);
    return statCreatedAtMs(stat);
  } catch {
    return 0;
  }
}

export function createdAtIso(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

export function compareByCreatedAtDesc(a: { createdAt: string }, b: { createdAt: string }): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
