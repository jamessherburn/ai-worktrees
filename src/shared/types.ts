import type { AgentId } from './agents';
import type { WizardConfig } from './wizard';

export type Session = {
  id: string;
  name: string;
  repoPath: string;
  repoName: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  agentId: AgentId;
  createdAt: string;
  lastStartedAt: string | null;
  waitingOnReview?: boolean;
  /** When set, the session header offers pasting this briefing into the agent terminal. */
  wizardBriefMarkdown?: string;
};

export type SessionStatus = 'running' | 'stopped' | 'orphaned';

export type ActivityState = 'working' | 'idle';

export type SessionWithStatus = Session & {
  status: SessionStatus;
  activity?: ActivityState;
};

export type ThemePreference = 'system' | 'dark' | 'light';

export type Settings = {
  codeDir: string;
  theme: ThemePreference;
  wizard: WizardConfig;
};

export type RepoInfo = {
  name: string;
  path: string;
};

export type CreateSessionInput = {
  repoPath: string;
  name: string;
  agentId: AgentId;
  wizardBriefMarkdown?: string | null;
};

export type DeleteSessionInput = {
  id: string;
  force: boolean;
  deleteBranch: boolean;
};

export type CreateSessionResult =
  | { ok: true; session: Session }
  | { ok: false; error: string };

export type DailyUsage = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
};

export type UsageResult =
  | { ok: true; usage: DailyUsage | null }
  | { ok: false; error: string };

export type AgentBillingMode = 'metered' | 'subscription' | 'free' | 'unknown';

export type AgentSpendInfo =
  | {
      kind: 'cost';
      cost: number;
      tokens: number;
      date: string | null;
      billing: AgentBillingMode;
      note: string;
    }
  | { kind: 'plan'; billing: AgentBillingMode; note: string }
  | { kind: 'error'; message: string };

export type DiaryItem = {
  id: string;
  text: string;
  createdAt: string;
  doneAt: string | null;
};

export type GitFileChangeKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'typechange'
  | 'unmerged';

export type GitFileChange = {
  path: string;
  oldPath?: string;
  kind: GitFileChangeKind;
};

export type GitWorktreeStatus = {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
};

export type GitStatusResult =
  | { ok: true; status: GitWorktreeStatus }
  | { ok: false; error: string };

export type GitDiffRequest = {
  sessionId: string;
  path: string;
  oldPath?: string;
  staged: boolean;
  untracked: boolean;
};

export type GitDiffResult =
  | { ok: true; diff: string }
  | { ok: false; error: string };

export type OpenInVSCodeResult =
  | { ok: true }
  | { ok: false; reason: 'not-installed' }
  | { ok: false; reason: 'failed'; error: string };

export type GhSetupResult =
  | {
      ok: true;
      outcome: 'already-installed' | 'installed';
      /** Present when `gh` is installed but `gh auth status` fails (user must sign in). */
      needsGhAuth?: boolean;
      /** Whether the app tried to open a system terminal to run `gh auth login`. */
      launchedAuthTerminal?: boolean;
    }
  | { ok: false; error: string };
