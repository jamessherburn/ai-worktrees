import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { RepoInfo } from '@shared/types';
import { isGitRepo } from './git.js';

export async function listRepos(codeDir: string): Promise<RepoInfo[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(codeDir);
  } catch {
    return [];
  }

  const repos: RepoInfo[] = [];
  await Promise.all(
    entries.map(async (name) => {
      if (name.startsWith('.')) return;
      const path = join(codeDir, name);
      try {
        const stat = await fs.stat(path);
        if (!stat.isDirectory()) return;
      } catch {
        return;
      }
      if (await isGitRepo(path)) {
        repos.push({ name, path });
      }
    }),
  );

  return repos.sort((a, b) => a.name.localeCompare(b.name));
}
