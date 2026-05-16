import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { getAgent, type AgentId } from '@shared/agents';
import type { AgentBillingMode, AgentSpendInfo } from '@shared/types';
import { getTodayUsage } from './usage.js';

export function resolveInstructionsPath(agentId: AgentId): string {
  const def = getAgent(agentId);
  return join(homedir(), def.instructions.home, def.instructions.filename);
}

export async function readAgentInstructions(agentId: AgentId): Promise<string> {
  const path = resolveInstructionsPath(agentId);
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

export async function writeAgentInstructions(agentId: AgentId, content: string): Promise<void> {
  const path = resolveInstructionsPath(agentId);
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, content, 'utf-8');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

type Billing = { billing: AgentBillingMode; note: string };

function detectClaudeBilling(): Billing {
  if (process.env.ANTHROPIC_API_KEY) {
    return { billing: 'metered', note: 'API key set — usage is billed per token' };
  }
  return { billing: 'subscription', note: 'Anthropic plan — flat monthly fee' };
}

async function detectCodexBilling(): Promise<Billing> {
  const authPath = join(homedir(), '.codex', 'auth.json');
  try {
    const raw = await fs.readFile(authPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.OPENAI_API_KEY === 'string' && data.OPENAI_API_KEY.length > 0) {
      return { billing: 'metered', note: 'API key — usage is billed per token' };
    }
    if (data.tokens || data.access_token || data.refresh_token) {
      return { billing: 'subscription', note: 'ChatGPT plan — no per-use charge' };
    }
    return { billing: 'unknown', note: 'Signed in (auth mode unclear)' };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { billing: 'unknown', note: 'Not signed in' };
    }
    return { billing: 'unknown', note: `Auth check failed: ${(err as Error).message}` };
  }
}

async function detectGeminiBilling(): Promise<Billing> {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return { billing: 'metered', note: 'API key set — usage is billed per token' };
  }
  const oauthCandidates = [
    join(homedir(), '.gemini', 'oauth_creds.json'),
    join(homedir(), '.gemini', 'google_account_id'),
  ];
  for (const path of oauthCandidates) {
    if (await pathExists(path)) {
      return { billing: 'free', note: 'Free tier (Google account login)' };
    }
  }
  return { billing: 'unknown', note: 'Not signed in' };
}

function detectCursorBilling(): Billing {
  return { billing: 'subscription', note: 'Cursor plan — check cursor.com for current tier' };
}

/** ccusage throws when Claude Code has never created local project data (app not installed / not used). */
function isMissingClaudeLocalData(error: string): boolean {
  return error.includes('No valid Claude data directories');
}

export async function getAgentSpend(agentId: AgentId, force = false): Promise<AgentSpendInfo> {
  switch (agentId) {
    case 'claude': {
      const { billing, note } = detectClaudeBilling();
      const result = await getTodayUsage(force);
      if (!result.ok) {
        if (isMissingClaudeLocalData(result.error)) {
          return {
            kind: 'plan',
            billing: 'unknown',
            note: 'Claude Code not installed or not used yet — no local usage data',
          };
        }
        return { kind: 'error', message: result.error };
      }
      const usage = result.usage;
      return {
        kind: 'cost',
        cost: usage?.totalCost ?? 0,
        tokens: usage?.totalTokens ?? 0,
        date: usage?.date ?? null,
        billing,
        note,
      };
    }
    case 'cursor':
      return { kind: 'plan', ...detectCursorBilling() };
    case 'gemini':
      return { kind: 'plan', ...(await detectGeminiBilling()) };
    case 'codex':
      return { kind: 'plan', ...(await detectCodexBilling()) };
    case 'aider':
      return {
        kind: 'plan',
        billing: 'free',
        note: 'Local Ollama/Aider — no per-token charges',
      };
  }
}
