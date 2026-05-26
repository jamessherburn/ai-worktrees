import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type {
  CreateSessionInput,
  CreateSessionResult,
  DeleteSessionInput,
  Session,
} from '@shared/types';
import { DEFAULT_AGENT_ID } from '@shared/agents';
import {
  addWorktree,
  deleteBranch,
  fetchBranch,
  hasOrigin,
  removeWorktree,
  resolveDefaultBranch,
} from './git.js';
import { getSettings } from './settings.js';
import { JsonStore } from './store.js';

type SessionsFile = { sessions: Session[] };

const store = new JsonStore<SessionsFile>('sessions.json', { sessions: [] });

const NAME_PATTERN = /^[a-zA-Z0-9._/-]+$/;

export async function listSessions(): Promise<Session[]> {
  const data = await store.read();
  return data.sessions.map((s) => ({
    ...s,
    agentId: s.agentId ?? DEFAULT_AGENT_ID,
  }));
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

export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Session name is required.' };
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, error: 'Name may only contain letters, numbers, dot, underscore, slash, and dash.' };
  }

  if (input.global) {
    const settings = await getSettings();
    const codeDir = settings.codeDir;
    if (!codeDir) {
      return { ok: false, error: 'Code directory is not configured. Set it in Settings.' };
    }
    if (!(await pathExists(codeDir))) {
      return { ok: false, error: `Code directory does not exist: ${codeDir}` };
    }

    const existing = await listSessions();
    if (existing.some((s) => s.global && s.name === name)) {
      return { ok: false, error: `A global session named "${name}" already exists.` };
    }

    const session: Session = {
      id: randomUUID(),
      name,
      repoPath: codeDir,
      repoName: 'Global',
      worktreePath: codeDir,
      branchName: '',
      baseBranch: '',
      agentId: input.agentId ?? DEFAULT_AGENT_ID,
      createdAt: new Date().toISOString(),
      lastStartedAt: null,
      global: true,
      ...(input.wizardBriefMarkdown != null && input.wizardBriefMarkdown !== ''
        ? { wizardBriefMarkdown: input.wizardBriefMarkdown }
        : {}),
    };

    await store.update((current) => ({ sessions: [...current.sessions, session] }));
    return { ok: true, session };
  }

  if (!input.repoPath) {
    return { ok: false, error: 'Repository is required for worktree sessions.' };
  }

  const existing = await listSessions();
  if (existing.some((s) => s.repoPath === input.repoPath && s.name === name)) {
    return { ok: false, error: `A session named "${name}" already exists for this repo.` };
  }

  const worktreePath = deriveWorktreePath(input.repoPath, name);
  if (await pathExists(worktreePath)) {
    return { ok: false, error: `Worktree path already exists on disk: ${worktreePath}` };
  }

  let baseBranch: string;
  try {
    baseBranch = await resolveDefaultBranch(input.repoPath);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const useRemote = await hasOrigin(input.repoPath);
  if (useRemote) {
    try {
      await fetchBranch(input.repoPath, baseBranch);
    } catch (err) {
      return { ok: false, error: `git fetch failed: ${(err as Error).message}` };
    }
  }

  const baseRef = useRemote ? `origin/${baseBranch}` : baseBranch;

  try {
    await addWorktree({
      repoPath: input.repoPath,
      worktreePath,
      newBranch: name,
      baseRef,
    });
  } catch (err) {
    return { ok: false, error: `git worktree add failed: ${(err as Error).message}` };
  }

  const session: Session = {
    id: randomUUID(),
    name,
    repoPath: input.repoPath,
    repoName: basename(input.repoPath),
    worktreePath,
    branchName: name,
    baseBranch,
    agentId: input.agentId ?? DEFAULT_AGENT_ID,
    createdAt: new Date().toISOString(),
    lastStartedAt: null,
    ...(input.wizardBriefMarkdown != null && input.wizardBriefMarkdown !== ''
      ? { wizardBriefMarkdown: input.wizardBriefMarkdown }
      : {}),
  };

  await store.update((current) => ({ sessions: [...current.sessions, session] }));
  return { ok: true, session };
}

export async function markSessionStarted(id: string): Promise<void> {
  await store.update((current) => ({
    sessions: current.sessions.map((s) =>
      s.id === id ? { ...s, lastStartedAt: new Date().toISOString() } : s,
    ),
  }));
}

export async function setSessionWaitingOnReview(id: string, value: boolean): Promise<void> {
  await store.update((current) => ({
    sessions: current.sessions.map((s) =>
      s.id === id ? { ...s, waitingOnReview: value } : s,
    ),
  }));
}

export async function deleteSession(input: DeleteSessionInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessions = await listSessions();
  const session = sessions.find((s) => s.id === input.id);
  if (!session) return { ok: false, error: 'Session not found.' };

  if (!session.global) {
    if (await pathExists(session.worktreePath)) {
      try {
        await removeWorktree(session.repoPath, session.worktreePath, input.force);
      } catch (err) {
        return { ok: false, error: `git worktree remove failed: ${(err as Error).message}` };
      }
    }

    if (input.deleteBranch) {
      await deleteBranch(session.repoPath, session.branchName);
    }
  }

  await store.update((current) => ({ sessions: current.sessions.filter((s) => s.id !== input.id) }));
  return { ok: true };
}

export async function getSessionById(id: string): Promise<Session | undefined> {
  const sessions = await listSessions();
  return sessions.find((s) => s.id === id);
}
