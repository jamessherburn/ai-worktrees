import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type {
  CleanupDeleteInput,
  CleanupDeleteResult,
  CleanupSnapshot,
  LeftoverBranch,
  LeftoverWorktree,
  Session,
} from '@shared/types';
import { listLeftoverAgentSessions } from './agent-session-scan.js';
import { clearAgentSessionData } from './agents.js';
import { globalSessionCwdPath } from './global-session-cwd.js';
import {
  deleteBranch,
  listGitWorktrees,
  listLocalBranchesWithCreatorDates,
  removeWorktree,
  resolveDefaultBranch,
} from './git.js';
import { compareByCreatedAtDesc, createdAtIso, pathCreatedAtMs, statCreatedAtMs } from './path-created-at.js';
import { listRepos } from './repos.js';
import { getSettings } from './settings.js';
import { listSessions } from './sessions.js';

function worktreeId(repoPath: string, worktreePath: string): string {
  return `${repoPath}::${worktreePath}`;
}

function branchId(repoPath: string, branchName: string): string {
  return `${repoPath}::${branchName}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

function deriveWorktreePath(repoPath: string, name: string): string {
  const repoName = basename(repoPath);
  const parent = dirname(repoPath);
  const slug = name.replace(/\//g, '-');
  return join(parent, `${repoName}-${slug}`);
}

function activeAgentCwds(sessions: Session[]): Set<string> {
  const cwds = new Set<string>();
  for (const session of sessions) {
    if (session.global) {
      cwds.add(globalSessionCwdPath(session.id));
    } else {
      cwds.add(session.worktreePath);
    }
  }
  return cwds;
}

async function scanUnregisteredWorktreeDirs(
  repoPath: string,
  registeredPaths: Set<string>,
): Promise<LeftoverWorktree[]> {
  const repoName = basename(repoPath);
  const parent = dirname(repoPath);
  const prefix = `${repoName}-`;
  let entries: string[];
  try {
    entries = await fs.readdir(parent);
  } catch {
    return [];
  }

  const leftovers: LeftoverWorktree[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const worktreePath = join(parent, entry);
    if (registeredPaths.has(worktreePath)) continue;
    if (!(await pathExists(worktreePath))) continue;
    let createdAtMs = 0;
    try {
      const stat = await fs.stat(worktreePath);
      if (!stat.isDirectory()) continue;
      createdAtMs = statCreatedAtMs(stat);
    } catch {
      continue;
    }
    leftovers.push({
      id: worktreeId(repoPath, worktreePath),
      repoPath,
      repoName,
      groupName: repoName,
      groupKind: 'repo',
      worktreePath,
      branchName: entry.slice(prefix.length),
      registered: false,
      createdAt: createdAtIso(createdAtMs),
    });
  }
  return leftovers;
}

export async function listCleanupItems(): Promise<CleanupSnapshot> {
  const settings = await getSettings();
  const sessions = await listSessions();
  const activeWorktreePaths = new Set(
    sessions.filter((s) => !s.global).map((s) => s.worktreePath),
  );
  const activeBranchKeys = new Set(
    sessions.filter((s) => !s.global).map((s) => branchId(s.repoPath, s.branchName)),
  );
  const agentCwds = activeAgentCwds(sessions);

  const worktrees: LeftoverWorktree[] = [];
  const branches: LeftoverBranch[] = [];
  const repos = await listRepos(settings.codeDir);
  const extraCwds: string[] = [];

  for (const repo of repos) {
    let defaultBranch = 'main';
    try {
      defaultBranch = await resolveDefaultBranch(repo.path);
    } catch {
      // keep default
    }

    const registered = await listGitWorktrees(repo.path);
    const registeredPaths = new Set(registered.map((w) => w.path));

    for (const entry of registered) {
      if (entry.isMain) continue;
      if (entry.branchName === defaultBranch) continue;
      if (activeWorktreePaths.has(entry.path)) continue;
      extraCwds.push(entry.path);
      worktrees.push({
        id: worktreeId(repo.path, entry.path),
        repoPath: repo.path,
        repoName: repo.name,
        groupName: repo.name,
        groupKind: 'repo',
        worktreePath: entry.path,
        branchName: entry.branchName || basename(entry.path),
        registered: true,
        createdAt: createdAtIso(await pathCreatedAtMs(entry.path)),
      });
    }

    const unregistered = await scanUnregisteredWorktreeDirs(repo.path, registeredPaths);
    for (const item of unregistered) {
      if (item.branchName === defaultBranch) continue;
      extraCwds.push(item.worktreePath);
      worktrees.push(item);
    }

    const checkedOutBranches = new Set(
      registered.map((w) => w.branchName).filter(Boolean),
    );
    let localBranches: { name: string; createdAtMs: number }[] = [];
    try {
      localBranches = await listLocalBranchesWithCreatorDates(repo.path);
    } catch {
      continue;
    }

    for (const branch of localBranches) {
      const branchName = branch.name;
      if (branchName === defaultBranch) continue;
      if (checkedOutBranches.has(branchName)) continue;
      if (activeBranchKeys.has(branchId(repo.path, branchName))) continue;
      branches.push({
        id: branchId(repo.path, branchName),
        repoPath: repo.path,
        repoName: repo.name,
        groupName: repo.name,
        groupKind: 'repo',
        branchName,
        createdAt: createdAtIso(branch.createdAtMs),
      });
    }
  }

  worktrees.sort(compareByCreatedAtDesc);
  branches.sort(compareByCreatedAtDesc);

  const agentSessions = (
    await listLeftoverAgentSessions({
      codeDir: settings.codeDir,
      repos,
      activeAgentCwds: agentCwds,
      sessions,
      extraCwds: [...worktrees.map((w) => w.worktreePath), ...extraCwds],
    })
  ).filter((session) => session.groupKind !== 'external');

  return { worktrees, branches, agentSessions };
}

export async function deleteCleanupItems(input: CleanupDeleteInput): Promise<CleanupDeleteResult> {
  const snapshot = await listCleanupItems();
  const worktreeById = new Map(snapshot.worktrees.map((w) => [w.id, w]));
  const branchById = new Map(snapshot.branches.map((b) => [b.id, b]));
  const agentSessionById = new Map(snapshot.agentSessions.map((a) => [a.id, a]));
  const errors: string[] = [];

  for (const id of input.worktreeIds) {
    const item = worktreeById.get(id);
    if (!item) {
      errors.push(`Worktree not found: ${id}`);
      continue;
    }
    try {
      if (item.registered) {
        await removeWorktree(item.repoPath, item.worktreePath, input.force);
      } else if (await pathExists(item.worktreePath)) {
        await fs.rm(item.worktreePath, { recursive: true, force: true });
      }
      await clearAgentSessionData(item.worktreePath, { includeLocalAgentDirs: true });
    } catch (err) {
      errors.push(`${item.worktreePath}: ${(err as Error).message}`);
    }
  }

  for (const id of input.branchIds) {
    const item = branchById.get(id);
    if (!item) {
      errors.push(`Branch not found: ${id}`);
      continue;
    }
    try {
      await deleteBranch(item.repoPath, item.branchName);
    } catch (err) {
      errors.push(`${item.branchName}: ${(err as Error).message}`);
    }
  }

  for (const id of input.agentSessionIds) {
    const item = agentSessionById.get(id);
    if (!item) {
      errors.push(`Agent session not found: ${id}`);
      continue;
    }
    if (item.groupKind === 'external') continue;
    try {
      await clearAgentSessionData(item.cwd, {
        includeLocalAgentDirs: item.groupKind !== 'global',
      });
    } catch (err) {
      errors.push(`${item.cwd}: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join('\n') };
  }
  return { ok: true };
}

/** @internal Exported for tests. */
export { deriveWorktreePath, worktreeId, branchId };
