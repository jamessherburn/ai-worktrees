import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AGENTS, type AgentAvailability, type AgentId } from '@shared/agents';

const execFileAsync = promisify(execFile);

let cache: AgentAvailability | null = null;
let inflight: Promise<AgentAvailability> | null = null;

function shellPath(): string {
  return process.env.SHELL || '/bin/zsh';
}

function buildProbeCommand(): string {
  return AGENTS.map((a) => {
    if (a.id === 'aider') {
      return `(command -v aider >/dev/null 2>&1 && command -v ollama >/dev/null 2>&1 && command -v ctags >/dev/null 2>&1 && ollama list | grep -q "qwen2.5-coder" && echo "aider=1") || echo "aider=0"`;
    }
    return `command -v ${a.binary} >/dev/null 2>&1 && echo "${a.id}=1" || echo "${a.id}=0"`;
  }).join('; ');
}

function parseProbeOutput(stdout: string): AgentAvailability {
  const result = {} as AgentAvailability;
  for (const agent of AGENTS) result[agent.id] = false;
  for (const line of stdout.split('\n')) {
    const [id, value] = line.trim().split('=');
    if (!id || !value) continue;
    if (id in result) result[id as AgentId] = value === '1';
  }
  return result;
}

export async function detectAgents(force = false): Promise<AgentAvailability> {
  if (cache && !force) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { stdout } = await execFileAsync(shellPath(), ['-lic', buildProbeCommand()], {
        timeout: 10_000,
      });
      cache = parseProbeOutput(stdout);
      return cache;
    } catch (err) {
      console.error('[agent-detection] probe failed:', (err as Error).message);
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
