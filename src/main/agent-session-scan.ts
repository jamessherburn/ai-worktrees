import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AgentId } from '@shared/agents';
import type { CleanupGroupKind, LeftoverAgentSession } from '@shared/types';
import {
  claudeHasSavedConversation,
  codexHasSavedSession,
  cursorHasSavedSession,
  encodeClaudeProjectPath,
  encodeCursorProjectPath,
  agentSessionDataPaths,
  type AgentStorageRoots,
} from './agents.js';
import {
  globalAgentCleanupId,
  globalAgentStoragePaths,
  globalSessionCwdPath,
  userDataRootForCleanup,
} from './global-session-cwd.js';
import { compareByCreatedAtDesc, createdAtIso, statCreatedAtMs } from './path-created-at.js';
import type { RepoInfo } from '@shared/types';

export type DecodedAgentDir = {
  cwd: string;
  agentId: AgentId;
  dataPath: string;
  createdAtMs: number;
};

type ScanRoot = {
  agentId: AgentId;
  root: string;
  encoding: 'claude' | 'cursor';
};

const SCAN_ROOTS: ScanRoot[] = [
  { agentId: 'claude', root: join(homedir(), '.claude', 'projects'), encoding: 'claude' },
  { agentId: 'cursor', root: join(homedir(), '.cursor', 'projects'), encoding: 'cursor' },
  { agentId: 'cursor', root: join(homedir(), '.cursor', 'chats'), encoding: 'cursor' },
  { agentId: 'codex', root: join(homedir(), '.codex', 'sessions'), encoding: 'claude' },
  { agentId: 'codex', root: join(homedir(), '.codex', 'projects'), encoding: 'claude' },
];

/** Best-effort decode of Claude-style encoded project paths (lossy for dots). */
export function decodeClaudeEncodedPath(encoded: string): string {
  const body = encoded.startsWith('-') ? encoded.slice(1) : encoded;
  const path = body.replace(/-/g, '/');
  return encoded.startsWith('-') ? `/${path}` : path;
}

/** Best-effort decode of Cursor-style encoded project paths (lossy for dots). */
export function decodeCursorEncodedPath(encoded: string): string {
  return `/${encoded.replace(/-/g, '/')}`;
}

export function decodeAgentEncodedPath(encoded: string, encoding: 'claude' | 'cursor'): string {
  return encoding === 'claude' ? decodeClaudeEncodedPath(encoded) : decodeCursorEncodedPath(encoded);
}

export function agentSessionId(cwd: string): string {
  return `agent::${cwd}`;
}

async function dirHasEntries(path: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(path);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function scanEncodedRoots(ctx: AgentCwdResolveContext): Promise<DecodedAgentDir[]> {
  const found: DecodedAgentDir[] = [];
  for (const { agentId, root, encoding } of SCAN_ROOTS) {
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch {
      continue;
    }
    for (const encoded of entries) {
      if (encoded.startsWith('.')) continue;
      const dataPath = join(root, encoded);
      let createdAtMs = 0;
      try {
        const stat = await fs.stat(dataPath);
        if (!stat.isDirectory()) continue;
        createdAtMs = statCreatedAtMs(stat);
      } catch {
        continue;
      }
      if (!(await dirHasEntries(dataPath))) continue;
      let cwd = resolveCanonicalAgentCwd(encoded, encoding, ctx);
      if (!(await pathExists(cwd))) {
        const decoded = decodeAgentEncodedPath(encoded, encoding);
        const recovered = tryRecoverWorktreePath(decoded, ctx.repos, ctx.codeDir);
        if (recovered) cwd = recovered;
        else if (decoded !== cwd && (await pathExists(decoded))) cwd = decoded;
      }
      found.push({
        cwd,
        agentId,
        dataPath,
        createdAtMs,
      });
    }
  }
  return found;
}

async function scanLocalAgentDirs(cwds: Iterable<string>): Promise<DecodedAgentDir[]> {
  const found: DecodedAgentDir[] = [];
  for (const cwd of cwds) {
    if (!(await pathExists(cwd))) continue;
    const cursorPath = join(cwd, '.cursor');
    const codexPath = join(cwd, '.codex');
    if (await dirHasEntries(cursorPath)) {
      found.push({
        cwd,
        agentId: 'cursor',
        dataPath: cursorPath,
        createdAtMs: await localDirCreatedAtMs(cursorPath),
      });
    }
    if (await dirHasEntries(codexPath)) {
      found.push({
        cwd,
        agentId: 'codex',
        dataPath: codexPath,
        createdAtMs: await localDirCreatedAtMs(codexPath),
      });
    }
  }
  return found;
}

async function localDirCreatedAtMs(path: string): Promise<number> {
  try {
    const stat = await fs.stat(path);
    return statCreatedAtMs(stat);
  } catch {
    return 0;
  }
}

function normalizeCwdKey(cwd: string): string {
  return cwd.replace(/\/+$/, '');
}

function mergeDecodedEntries(
  entries: DecodedAgentDir[],
  repos: RepoInfo[],
  codeDir: string,
): Map<string, { agents: Set<AgentId>; createdAtMs: number; dataPaths: Set<string> }> {
  const byCwd = new Map<string, { agents: Set<AgentId>; createdAtMs: number; dataPaths: Set<string> }>();
  for (const entry of entries) {
    const recovered = tryRecoverWorktreePath(entry.cwd, repos, codeDir);
    const key = normalizeCwdKey(recovered ?? entry.cwd);
    const existing = byCwd.get(key);
    if (existing) {
      existing.agents.add(entry.agentId);
      existing.dataPaths.add(entry.dataPath);
      existing.createdAtMs = Math.min(existing.createdAtMs, entry.createdAtMs);
    } else {
      byCwd.set(key, {
        agents: new Set([entry.agentId]),
        createdAtMs: entry.createdAtMs,
        dataPaths: new Set([entry.dataPath]),
      });
    }
  }
  return byCwd;
}

export type CleanupGroupInfo = {
  groupName: string;
  groupKind: CleanupGroupKind;
  repoPath: string;
};

export function resolveCleanupGroup(
  cwd: string,
  codeDir: string,
  repos: RepoInfo[],
  globalSessionRoot: string,
): CleanupGroupInfo {
  let normalized = normalizeCwdKey(cwd);
  const recovered = tryRecoverWorktreePath(normalized, repos, codeDir);
  if (recovered) normalized = recovered;

  if (normalized.startsWith(normalizeCwdKey(globalSessionRoot) + '/')) {
    return { groupName: 'Global', groupKind: 'global', repoPath: '' };
  }

  const repoByPath = new Map(repos.map((r) => [r.path, r]));
  for (const repo of repos) {
    if (normalized === repo.path) {
      return { groupName: repo.name, groupKind: 'repo', repoPath: repo.path };
    }
    const parent = dirname(repo.path);
    const dirName = basename(normalized);
    if (dirname(normalized) === parent && dirName.startsWith(`${repo.name}-`)) {
      return { groupName: repo.name, groupKind: 'repo', repoPath: repo.path };
    }
    if (normalized.startsWith(`${repo.path}/`)) {
      return { groupName: repo.name, groupKind: 'repo', repoPath: repo.path };
    }
  }

  if (codeDir) {
    const codeRoot = normalizeCwdKey(codeDir);
    if (normalized.startsWith(`${codeRoot}/`)) {
      const rel = normalized.slice(codeRoot.length + 1);
      const top = rel.split('/')[0];
      if (top) {
        const candidate = join(codeDir, top);
        const repo = repoByPath.get(candidate);
        if (repo) {
          return { groupName: repo.name, groupKind: 'repo', repoPath: repo.path };
        }
        return { groupName: top, groupKind: 'repo', repoPath: candidate };
      }
    }
  }

  return { groupName: 'External', groupKind: 'external', repoPath: '' };
}

export function resolveAgentSessionStatus(
  cwd: string,
  activeAgentCwds: Set<string>,
  groupKind: CleanupGroupKind,
): LeftoverAgentSession['status'] {
  if (activeAgentCwds.has(normalizeCwdKey(cwd))) return 'active';
  if (groupKind === 'external') return 'external';
  return 'orphaned';
}

export function displayPathForAgentSession(cwd: string, groupKind: CleanupGroupKind): string {
  if (groupKind === 'global') {
    const id = basename(cwd);
    return `Global session · ${id.slice(0, 8)}…`;
  }
  const parts = cwd.split('/');
  if (parts.length >= 2) {
    return parts.slice(-2).join('/');
  }
  return cwd;
}

async function existingAgentDataPaths(
  cwd: string,
  storageRoots?: AgentStorageRoots,
): Promise<string[]> {
  const paths: string[] = [];
  for (const path of agentSessionDataPaths(cwd, { storageRoots })) {
    if (await pathExists(path)) paths.push(path);
  }
  return paths;
}

export async function listGlobalAgentStorageSessions(opts: {
  codeDir: string;
  sessions: { id: string; name: string; global?: boolean }[];
}): Promise<LeftoverAgentSession[]> {
  const root = join(userDataRootForCleanup(), 'global-agent-data');
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const registeredGlobalIds = new Set(
    opts.sessions.filter((session) => session.global).map((session) => session.id),
  );
  const sessionsById = new Map(opts.sessions.map((session) => [session.id, session]));
  const results: LeftoverAgentSession[] = [];

  for (const sessionId of entries) {
    if (sessionId.startsWith('.')) continue;
    const dataRoot = join(root, sessionId);
    let createdAtMs = 0;
    try {
      const stat = await fs.stat(dataRoot);
      if (!stat.isDirectory()) continue;
      createdAtMs = statCreatedAtMs(stat);
    } catch {
      continue;
    }

    const storageRoots = globalAgentStoragePaths(sessionId);
    const session = sessionsById.get(sessionId);
    const probeCwd = session?.global ? session.repoPath : opts.codeDir;
    const agents: AgentId[] = [];
    if (await claudeHasSavedConversation(probeCwd, storageRoots)) agents.push('claude');
    if (await cursorHasSavedSession(probeCwd, storageRoots)) agents.push('cursor');
    if (await codexHasSavedSession(probeCwd, storageRoots)) agents.push('codex');

    const isActive = registeredGlobalIds.has(sessionId);
    if (agents.length === 0) {
      if (isActive) continue;
      results.push({
        id: globalAgentCleanupId(sessionId),
        cwd: dataRoot,
        dataPaths: [],
        groupName: 'Global',
        groupKind: 'global',
        repoPath: '',
        agents: [],
        status: 'orphaned',
        displayPath: displayPathForAgentSession(dataRoot, 'global'),
        createdAt: createdAtIso(createdAtMs),
      });
      continue;
    }

    const dataPaths = await existingAgentDataPaths(probeCwd, storageRoots);
    results.push({
      id: globalAgentCleanupId(sessionId),
      cwd: dataRoot,
      dataPaths,
      groupName: 'Global',
      groupKind: 'global',
      repoPath: '',
      agents: agents.sort() as AgentId[],
      status: isActive ? 'active' : 'orphaned',
      displayPath: session ? `Global · ${session.name}` : displayPathForAgentSession(dataRoot, 'global'),
      createdAt: createdAtIso(createdAtMs),
    });
  }

  results.sort(compareByCreatedAtDesc);
  return results;
}

export async function listLeftoverAgentSessions(opts: {
  codeDir: string;
  repos: RepoInfo[];
  activeAgentCwds: Set<string>;
  sessions?: { global?: boolean; id: string; worktreePath: string }[];
  extraCwds?: string[];
}): Promise<LeftoverAgentSession[]> {
  const globalSessionRoot = join(userDataRootForCleanup(), 'global-sessions');
  const knownCwds = await collectKnownAgentCwds(opts.repos, {
    sessions: opts.sessions,
    worktreePaths: opts.extraCwds,
  });
  const encodedIndex = buildAgentEncodedPathIndex(knownCwds);
  const resolveCtx: AgentCwdResolveContext = {
    encodedIndex,
    repos: opts.repos,
    codeDir: opts.codeDir,
    globalSessionRoot,
  };
  const encodedEntries = await scanEncodedRoots(resolveCtx);
  const localEntries = await scanLocalAgentDirs([...knownCwds, ...(opts.extraCwds ?? [])]);
  const mergedEntries = mergeDecodedEntries(
    [...encodedEntries, ...localEntries],
    opts.repos,
    opts.codeDir,
  );

  const globalStorageSessions = await listGlobalAgentStorageSessions({
    codeDir: opts.codeDir,
    sessions: opts.sessions ?? [],
  });
  const globalStorageIds = new Set(globalStorageSessions.map((session) => session.id));

  const sessions: LeftoverAgentSession[] = [...globalStorageSessions];
  for (const [rawCwd, merged] of mergedEntries) {
    const recovered = tryRecoverWorktreePath(rawCwd, opts.repos, opts.codeDir);
    const cwd = recovered ?? rawCwd;
    const group = resolveCleanupGroup(cwd, opts.codeDir, opts.repos, globalSessionRoot);
    if (group.groupKind === 'global') {
      const legacySessionId = basename(cwd);
      if (globalStorageIds.has(globalAgentCleanupId(legacySessionId))) continue;
    }
    const agents = Array.from(merged.agents).sort() as AgentId[];
    sessions.push({
      id: agentSessionId(cwd),
      cwd,
      dataPaths: Array.from(merged.dataPaths),
      groupName: group.groupName,
      groupKind: group.groupKind,
      repoPath: group.repoPath,
      agents,
      status: resolveAgentSessionStatus(cwd, opts.activeAgentCwds, group.groupKind),
      displayPath: displayPathForAgentSession(cwd, group.groupKind),
      createdAt: createdAtIso(merged.createdAtMs),
    });
  }

  sessions.sort(compareByCreatedAtDesc);
  return sessions;
}

export function encodedPathsForCwd(cwd: string): { claude: string; cursor: string } {
  return {
    claude: encodeClaudeProjectPath(cwd),
    cursor: encodeCursorProjectPath(cwd),
  };
}

/** Map agent storage folder names back to real cwd paths (avoids lossy decode splits). */
export function buildAgentEncodedPathIndex(knownCwds: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const raw of knownCwds) {
    const cwd = normalizeCwdKey(raw);
    if (!cwd) continue;
    const { claude, cursor } = encodedPathsForCwd(cwd);
    index.set(claude, cwd);
    index.set(cursor, cwd);
  }
  return index;
}

function encodeForAgentStorage(cwd: string, encoding: 'claude' | 'cursor'): string {
  return encoding === 'claude' ? encodeClaudeProjectPath(cwd) : encodeCursorProjectPath(cwd);
}

function matchesEncodedPath(candidate: string, encoded: string, encoding: 'claude' | 'cursor'): boolean {
  return encodeForAgentStorage(candidate, encoding) === encoded;
}

/** Recover worktree paths when lossy decode turned hyphens into extra directories. */
export function tryRecoverWorktreePath(
  cwd: string,
  repos: RepoInfo[],
  codeDir: string,
): string | null {
  const normalized = normalizeCwdKey(cwd);
  if (!codeDir) return null;
  const codeRoot = normalizeCwdKey(codeDir);
  if (!normalized.startsWith(`${codeRoot}/`)) return null;

  const reposByName = [...repos].sort((a, b) => b.name.length - a.name.length);
  for (const repo of reposByName) {
    const parent = normalizeCwdKey(dirname(repo.path));
    if (!normalized.startsWith(`${parent}/`)) continue;

    const afterParent = normalized.slice(parent.length + 1);
    const flattened = join(parent, afterParent.replace(/\//g, '-'));
    const dirName = basename(flattened);
    if (dirname(flattened) === parent && dirName.startsWith(`${repo.name}-`)) {
      return flattened;
    }
  }
  return null;
}

export type AgentCwdResolveContext = {
  encodedIndex: Map<string, string>;
  repos: RepoInfo[];
  codeDir: string;
  globalSessionRoot: string;
};

export function resolveCanonicalAgentCwd(
  encoded: string,
  encoding: 'claude' | 'cursor',
  ctx: AgentCwdResolveContext,
): string {
  const { encodedIndex, repos, codeDir, globalSessionRoot } = ctx;

  const indexed = encodedIndex.get(encoded);
  if (indexed) return indexed;

  const globalRoot = normalizeCwdKey(globalSessionRoot);
  const globalPrefix = encodeForAgentStorage(`${globalRoot}/`, encoding);
  if (encoded.startsWith(globalPrefix) && encoded.length > globalPrefix.length) {
    const candidate = join(globalRoot, encoded.slice(globalPrefix.length));
    if (matchesEncodedPath(candidate, encoded, encoding)) return candidate;
  }

  const reposByName = [...repos].sort((a, b) => b.name.length - a.name.length);
  for (const repo of reposByName) {
    if (matchesEncodedPath(repo.path, encoded, encoding)) return repo.path;

    const worktreeParent = dirname(repo.path);
    const worktreePrefix = encodeForAgentStorage(`${worktreeParent}/${repo.name}-`, encoding);
    if (encoded.startsWith(worktreePrefix) && encoded.length > worktreePrefix.length) {
      const candidate = join(worktreeParent, `${repo.name}-${encoded.slice(worktreePrefix.length)}`);
      if (matchesEncodedPath(candidate, encoded, encoding)) return candidate;
    }
  }

  const decoded = decodeAgentEncodedPath(encoded, encoding);
  const recovered = tryRecoverWorktreePath(decoded, repos, codeDir);
  if (recovered) return recovered;

  if (encodedIndex.has(encodeClaudeProjectPath(decoded))) {
    return encodedIndex.get(encodeClaudeProjectPath(decoded))!;
  }
  if (encodedIndex.has(encodeCursorProjectPath(decoded))) {
    return encodedIndex.get(encodeCursorProjectPath(decoded))!;
  }

  return decoded;
}

/** @internal Exported for tests. */
export { mergeDecodedEntries };

export async function collectKnownAgentCwds(
  repos: RepoInfo[],
  opts?: { sessions?: { global?: boolean; id: string; worktreePath: string }[]; worktreePaths?: string[] },
): Promise<string[]> {
  const cwds = new Set<string>();
  for (const repo of repos) cwds.add(repo.path);

  for (const session of opts?.sessions ?? []) {
    if (session.global) cwds.add(globalSessionCwdPath(session.id));
    else cwds.add(session.worktreePath);
  }

  for (const path of opts?.worktreePaths ?? []) cwds.add(path);

  for (const repo of repos) {
    const parent = dirname(repo.path);
    const prefix = `${repo.name}-`;
    let entries: string[];
    try {
      entries = await fs.readdir(parent);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) continue;
      const candidate = join(parent, entry);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) cwds.add(candidate);
      } catch {
        continue;
      }
    }
  }

  return [...cwds];
}
