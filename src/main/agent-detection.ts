import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AGENTS, type AgentAvailability, type AgentId } from '@shared/agents';
import { enrichedPath, probeShellPath } from './resolve-shell-path.js';
import { setCursorLaunchBinary } from './cursor-binary.js';

const execFileAsync = promisify(execFile);

let cache: AgentAvailability | null = null;
let cursorBinaryCache: string | null = null;
let inflight: Promise<AgentAvailability> | null = null;

function probeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: enrichedPath() };
}

function buildProbeCommand(): string {
  return AGENTS.map((a) => {
    if (a.id === 'cursor') {
      // Cursor ships both `cursor-agent` (legacy) and `agent` (primary).
      return [
        'cursor_bin=$(command -v cursor-agent 2>/dev/null || command -v agent 2>/dev/null)',
        'if [ -n "$cursor_bin" ]; then echo "cursor=1"; printf "cursor_bin=%s\\n" "$(basename "$cursor_bin")"; else echo "cursor=0"; fi',
      ].join('; ');
    }
    return `command -v ${a.binary} >/dev/null 2>&1 && echo "${a.id}=1" || echo "${a.id}=0"`;
  }).join('; ');
}

function parseProbeOutput(stdout: string): AgentAvailability {
  const result = {} as AgentAvailability;
  for (const agent of AGENTS) result[agent.id] = false;

  let resolvedCursorBinary: string | null = null;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('cursor_bin=')) {
      const binary = trimmed.slice('cursor_bin='.length).trim();
      if (binary) resolvedCursorBinary = binary;
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const id = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (id in result) result[id as AgentId] = value === '1';
  }

  cursorBinaryCache = result.cursor ? resolvedCursorBinary : null;
  setCursorLaunchBinary(cursorBinaryCache);
  return result;
}

export async function detectAgents(force = false): Promise<AgentAvailability> {
  if (cache && !force) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const shell = probeShellPath();
      const { stdout } = await execFileAsync(shell, ['-lic', buildProbeCommand()], {
        timeout: 10_000,
        env: probeEnv(),
      });
      cache = parseProbeOutput(stdout);
      return cache;
    } catch (err) {
      console.error('[agent-detection] probe failed:', (err as Error).message);
      cursorBinaryCache = null;
      setCursorLaunchBinary(null);
      cache = AGENTS.reduce((acc, a) => {
        acc[a.id] = false;
        return acc;
      }, {} as AgentAvailability);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
