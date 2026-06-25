import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type {
  CreateSessionInput,
  CreateSessionResult,
  DeleteSessionInput,
  Session,
} from '@shared/types';
import { sessionNotesText } from '@shared/session-notes';
import { DEFAULT_AGENT_ID } from '@shared/agents';
import { normalizeSession, normalizeSessionLabelIds } from '@shared/session-labels';
import {
  addWorktree,
  deleteBranch,
  fetchBranch,
  hasOrigin,
  removeWorktree,
  resolveDefaultBranch,
} from './git.js';
import { clearAgentSessionData } from './agents.js';
import {
  ensureGlobalAgentStorage,
  globalAgentStoragePaths,
  globalSessionCwdPath,
  migrateGlobalAgentDataIfNeeded,
  removeGlobalAgentStorage,
} from './global-session-cwd.js';
import { getSettings } from './settings.js';
import { JsonStore } from './store.js';

type SessionsFile = { sessions: Session[] };

const store = new JsonStore<SessionsFile>('sessions.json', { sessions: [] });

const NAME_PATTERN = /^[a-zA-Z0-9._/-]+$/;

function normalizeSessionRecord(s: Session): Session {
  const base = normalizeSession({
    ...s,
    agentId: s.agentId ?? DEFAULT_AGENT_ID,
  });
  const notes = sessionNotesText(base);
  const { quickNotes: _quickNotes, notes: _legacyNotes, ...rest } = base;
  return {
    ...rest,
    notes: notes || undefined,
  };
}

export async function listSessions(): Promise<Session[]> {
  const data = await store.read();
  const sessions = data.sessions.map((s) => normalizeSessionRecord(s));
  for (const session of sessions) {
    if (session.global) {
      await migrateGlobalAgentDataIfNeeded(session.id, session.repoPath);
    }
  }
  return sessions;
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

    const labelIds = normalizeSessionLabelIds(input.labelIds);

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
      labelIds: labelIds.length ? labelIds : undefined,
    };

    await store.update((current) => ({ sessions: [...current.sessions, session] }));
    await ensureGlobalAgentStorage(session.id);
    await clearAgentSessionData(codeDir, { storageRoots: globalAgentStoragePaths(session.id) });
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

  await clearAgentSessionData(worktreePath, { includeLocalAgentDirs: true });

  const labelIds = normalizeSessionLabelIds(input.labelIds);

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
    labelIds: labelIds.length ? labelIds : undefined,
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
    sessions: current.sessions.map((s) => {
      if (s.id !== id) return s;
      const normalized = normalizeSession({ ...s, agentId: s.agentId ?? DEFAULT_AGENT_ID });
      let labelIds = normalizeSessionLabelIds(normalized.labelIds);
      const waitingId = 'waiting-on-review';
      if (value && !labelIds.includes(waitingId)) {
        labelIds = [...labelIds, waitingId];
      } else if (!value) {
        labelIds = labelIds.filter((lid) => lid !== waitingId);
      }
      const { waitingOnReview: _legacy, ...rest } = normalized;
      return { ...rest, labelIds: labelIds.length ? labelIds : undefined };
    }),
  }));
}

export async function setSessionMuted(id: string, value: boolean): Promise<void> {
  await store.update((current) => ({
    sessions: current.sessions.map((s) =>
      s.id === id ? { ...s, muted: value || undefined } : s,
    ),
  }));
}

export async function setSessionNotes(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  await store.update((current) => ({
    sessions: current.sessions.map((s) => {
      if (s.id !== id) return s;
      const { quickNotes: _quickNotes, notes: _legacyNotes, ...rest } = s;
      return { ...rest, notes: trimmed || undefined };
    }),
  }));
}

export async function setSessionLabels(id: string, labelIds: string[]): Promise<void> {
  const normalized = normalizeSessionLabelIds(labelIds);
  await store.update((current) => ({
    sessions: current.sessions.map((s) =>
      s.id === id
        ? {
            ...normalizeSession({ ...s, agentId: s.agentId ?? DEFAULT_AGENT_ID }),
            labelIds: normalized.length ? normalized : undefined,
          }
        : s,
    ),
  }));
}

export async function deleteSession(input: DeleteSessionInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessions = await listSessions();
  const session = sessions.find((s) => s.id === input.id);
  if (!session) return { ok: false, error: 'Session not found.' };

  if (session.global) {
    await clearAgentSessionData(session.repoPath, {
      storageRoots: globalAgentStoragePaths(session.id),
    });
    await clearAgentSessionData(globalSessionCwdPath(session.id));
    await removeGlobalAgentStorage(session.id);
  } else {
    await clearAgentSessionData(session.worktreePath, { includeLocalAgentDirs: true });
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
