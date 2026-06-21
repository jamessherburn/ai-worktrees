import type { AgentId } from './agents';

export type SessionLabel = {
  id: string;
  name: string;
  /** CSS color (typically hex). */
  color: string;
};

/** @deprecated Migrated to notes on read; no longer written. */
export type SessionQuickNote = {
  id: string;
  text: string;
  createdAt: string;
};

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
  /** Custom label ids applied to this session. */
  labelIds?: string[];
  /** When true, the session is visually de-emphasised in the sidebar. */
  muted?: boolean;
  /** Free-form notes stored on the session (legacy; no in-app editor). */
  notes?: string;
  /** @deprecated Migrated to notes on read; no longer written. */
  quickNotes?: SessionQuickNote[];
  /** @deprecated Migrated to labelIds on read; no longer written. */
  waitingOnReview?: boolean;
  /** Runs the agent at the code directory from settings; no git worktree is created. */
  global?: boolean;
};

export type SessionStatus = 'running' | 'stopped' | 'orphaned';

export type ActivityState = 'working' | 'idle';

export type SessionWithStatus = Session & {
  status: SessionStatus;
  activity?: ActivityState;
};

export type ThemePreference = 'system' | 'dark' | 'light';

/** Cross-agent skill launched into the active session terminal. */
export type WorktreesSkill = {
  name: string;
  /** Text pasted into the agent session and submitted. */
  prompt: string;
  /** Optional hint shown in Settings; not sent to the agent. */
  description?: string;
};

export type Settings = {
  codeDir: string;
  theme: ThemePreference;
  /** User-defined labels for categorizing sessions and to-do items. */
  sessionLabels?: SessionLabel[];
  /** Cross-agent skills launched from the bottom skills bar. */
  worktreesSkills?: WorktreesSkill[];
};

export type RepoInfo = {
  name: string;
  path: string;
};

export type CreateSessionInput = {
  repoPath?: string;
  name: string;
  agentId: AgentId;
  /** When true, runs at the code directory from settings without creating a worktree. */
  global?: boolean;
  /** Optional labels to apply when the session is created. */
  labelIds?: string[];
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

export type TaskItem = {
  id: string;
  text: string;
  createdAt: string;
  sectionId: string;
  /** Label ids from Settings → Labels. */
  labelIds?: string[];
  /** Set when the item is moved to Done. */
  doneAt: string | null;
};

/** @deprecated Use TaskItem */
export type DiaryItem = TaskItem;

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

export type GitFileGroup = 'staged' | 'unstaged' | 'untracked';

export type GitFileAction = 'stage' | 'unstage' | 'discard';

export type GitFileActionRequest = {
  sessionId: string;
  path: string;
  oldPath?: string;
  group: GitFileGroup;
  action: GitFileAction;
};

export type GitFileActionResult = { ok: true } | { ok: false; error: string };

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

export type FishSetupResult =
  | {
      ok: true;
      outcome: 'already-installed' | 'installed' | 'skipped';
    }
  | { ok: false; error: string };
