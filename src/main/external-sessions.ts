import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import { AGENTS, type AgentId } from '@shared/agents';
import type { Session } from '@shared/types';
import { worktreeMetadata } from './git.js';

const execFileAsync = promisify(execFile);

let discovered: Session[] = [];

type ProcessHit = { agentId: AgentId; pid: number };

function externalSessionId(cwd: string): string {
  return `external:${Buffer.from(cwd).toString('base64url')}`;
}

export function isExternalSessionId(id: string): boolean {
  return id.startsWith('external:');
}

export function getDiscoveredExternalSession(id: string): Session | undefined {
  return discovered.find((s) => s.id === id);
}

function matchesAgent(agentId: AgentId, comm: string, args: string): boolean {
  switch (agentId) {
    case 'claude':
      return comm === 'claude' || /(?:^|\s|\/)(claude)(?:\s|$)/.test(args);
    case 'cursor':
      return /cursor-agent/.test(args) && !/worker-server/.test(args);
    case 'codex':
      return comm === 'codex' || /(?:^|\s|\/)(codex)(?:\s|$)/.test(args);
    case 'gemini':
      return comm === 'gemini' || /(?:^|\s|\/)(gemini)(?:\s|$)/.test(args);
    default:
      return false;
  }
}

async function listRunningAgentProcesses(): Promise<ProcessHit[]> {
  let stdout: string;
  try {
    const result = await execFileAsync('ps', ['-ax', '-o', 'pid=,comm=,args='], { timeout: 5000 });
    stdout = result.stdout;
  } catch {
    return [];
  }

  const hits: ProcessHit[] = [];
  const seen = new Set<number>();

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const comm = match[2];
    const args = match[3];
    if (!Number.isFinite(pid) || seen.has(pid)) continue;

    for (const agent of AGENTS) {
      if (!matchesAgent(agent.id, comm, args)) continue;
      seen.add(pid);
      hits.push({ agentId: agent.id, pid });
      break;
    }
  }

  return hits;
}

async function cwdForPid(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      timeout: 3000,
    });
    for (const line of stdout.split('\n')) {
      if (line.startsWith('n')) return line.slice(1);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function discoverExternalSessions(knownSessions: Session[]): Promise<Session[]> {
  const knownPaths = new Set(knownSessions.map((s) => s.worktreePath));
  const processes = await listRunningAgentProcesses();
  const byKey = new Map<string, Session>();

  for (const proc of processes) {
    const cwd = await cwdForPid(proc.pid);
    if (!cwd || knownPaths.has(cwd)) continue;

    const key = `${proc.agentId}:${cwd}`;
    if (byKey.has(key)) continue;

    const { branchName, repoPath, repoName } = await worktreeMetadata(cwd);
    const name = branchName || basename(cwd);

    byKey.set(key, {
      id: externalSessionId(cwd),
      name,
      repoPath,
      repoName,
      worktreePath: cwd,
      branchName,
      baseBranch: '',
      agentId: proc.agentId,
      createdAt: new Date().toISOString(),
      lastStartedAt: new Date().toISOString(),
      external: true,
    });
  }

  discovered = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  return discovered;
}

export async function killExternalAgentProcesses(cwd: string, agentId: AgentId): Promise<void> {
  const processes = await listRunningAgentProcesses();
  for (const proc of processes) {
    if (proc.agentId !== agentId) continue;
    const procCwd = await cwdForPid(proc.pid);
    if (procCwd !== cwd) continue;
    try {
      process.kill(proc.pid, 'SIGTERM');
    } catch {
      // ignore: process may have already exited
    }
  }
}
