import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import type { GitFileChange, GitFileChangeKind, GitWorktreeStatus } from '@shared/types';

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    throw new GitError(e.message, e.stderr ?? '');
  }
}

async function gitRaw(cwd: string, args: string[], allowExitCodes: number[] = []): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 });
    return stdout;
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message: string };
    if (typeof e.code === 'number' && allowExitCodes.includes(e.code)) {
      return e.stdout ?? '';
    }
    throw new GitError(e.message, e.stderr ?? '');
  }
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await git(path, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

export async function resolveDefaultBranch(repoPath: string): Promise<string> {
  try {
    const ref = await git(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    return ref.replace(/^origin\//, '');
  } catch {
    for (const candidate of ['main', 'master']) {
      try {
        await git(repoPath, ['rev-parse', '--verify', `refs/heads/${candidate}`]);
        return candidate;
      } catch {
        continue;
      }
    }
    throw new GitError('Could not resolve default branch (no main or master).', '');
  }
}

export async function fetchBranch(repoPath: string, branch: string): Promise<void> {
  try {
    await git(repoPath, ['fetch', 'origin', branch]);
  } catch (err) {
    if (err instanceof GitError && /Could not resolve host|Network is unreachable/i.test(err.stderr)) {
      return;
    }
    throw err;
  }
}

export async function addWorktree(opts: {
  repoPath: string;
  worktreePath: string;
  newBranch: string;
  baseRef: string;
}): Promise<void> {
  await git(opts.repoPath, [
    'worktree',
    'add',
    opts.worktreePath,
    '-b',
    opts.newBranch,
    opts.baseRef,
  ]);
}

function isUnregisteredWorktreeError(err: unknown): boolean {
  if (!(err instanceof GitError)) return false;
  const text = `${err.message}\n${err.stderr}`;
  return /is not a working tree/i.test(text);
}

async function removeOrphanWorktreeDirectory(worktreePath: string): Promise<void> {
  await fs.rm(worktreePath, { recursive: true, force: true });
}

export async function removeWorktree(repoPath: string, worktreePath: string, force: boolean): Promise<void> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);
  try {
    await git(repoPath, args);
  } catch (err) {
    if (!isUnregisteredWorktreeError(err)) throw err;
    await removeOrphanWorktreeDirectory(worktreePath);
    try {
      await git(repoPath, ['worktree', 'prune']);
    } catch {
      // ignore: nothing to prune
    }
  }
}

export async function deleteBranch(repoPath: string, branch: string): Promise<void> {
  try {
    await git(repoPath, ['branch', '-D', branch]);
  } catch {
    // ignore: branch may not exist after worktree removal
  }
}

export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  const out = await git(worktreePath, ['status', '--porcelain']);
  return out.length > 0;
}

export async function hasOrigin(repoPath: string): Promise<boolean> {
  try {
    await git(repoPath, ['remote', 'get-url', 'origin']);
    return true;
  } catch {
    return false;
  }
}

function kindFromCode(code: string): GitFileChangeKind {
  switch (code) {
    case 'M': return 'modified';
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    case 'T': return 'typechange';
    case 'U': return 'unmerged';
    default: return 'modified';
  }
}

export async function getWorktreeStatus(worktreePath: string): Promise<GitWorktreeStatus> {
  const out = await gitRaw(worktreePath, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);

  const result: GitWorktreeStatus = { staged: [], unstaged: [], untracked: [] };
  if (!out) return result;

  const tokens = out.split('\0');
  let i = 0;
  while (i < tokens.length) {
    const entry = tokens[i];
    if (!entry) {
      i++;
      continue;
    }
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);

    let oldPath: string | undefined;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      i++;
      oldPath = tokens[i] || undefined;
    }

    if (x === '?' && y === '?') {
      result.untracked.push({ path, kind: 'untracked' });
    } else if (x === '!' && y === '!') {
      // ignored — skip
    } else {
      if (x !== ' ' && x !== '?') {
        const change: GitFileChange = { path, kind: kindFromCode(x) };
        if (oldPath) change.oldPath = oldPath;
        result.staged.push(change);
      }
      if (y !== ' ' && y !== '?') {
        result.unstaged.push({ path, kind: kindFromCode(y) });
      }
    }
    i++;
  }

  return result;
}

export type DiffOpts = {
  staged: boolean;
  untracked: boolean;
  oldPath?: string;
};

export type GitFileGroup = 'staged' | 'unstaged' | 'untracked';

export async function stageFile(worktreePath: string, path: string, oldPath?: string): Promise<void> {
  const args = ['add', '--'];
  if (oldPath) args.push(oldPath);
  args.push(path);
  await git(worktreePath, args);
}

export async function unstageFile(worktreePath: string, path: string, oldPath?: string): Promise<void> {
  const args = ['restore', '--staged', '--'];
  if (oldPath) args.push(oldPath);
  args.push(path);
  await git(worktreePath, args);
}

export async function discardFileChanges(
  worktreePath: string,
  path: string,
  group: GitFileGroup,
  oldPath?: string,
): Promise<void> {
  if (group === 'untracked') {
    await git(worktreePath, ['clean', '-f', '-d', '--', path]);
    return;
  }
  if (group === 'staged') {
    const args = ['restore', '--staged', '--worktree', '--'];
    if (oldPath) args.push(oldPath);
    args.push(path);
    await git(worktreePath, args);
    return;
  }
  const args = ['restore', '--worktree', '--'];
  if (oldPath) args.push(oldPath);
  args.push(path);
  await git(worktreePath, args);
}

export async function getFileDiff(
  worktreePath: string,
  path: string,
  opts: DiffOpts,
): Promise<string> {
  if (opts.untracked) {
    return gitRaw(
      worktreePath,
      ['diff', '--no-index', '--no-color', '--', '/dev/null', path],
      [1],
    );
  }
  const args = ['diff', '--no-color'];
  if (opts.staged) args.push('--cached');
  args.push('--');
  if (opts.oldPath) args.push(opts.oldPath);
  args.push(path);
  return gitRaw(worktreePath, args);
}
