import type { AgentId } from './agents';
import type { WizardConfig } from './wizard';

export type SessionLabel = {
  id: string;
  name: string;
  /** CSS color (typically hex). */
  color: string;
};

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
  /** When true, the session is visually de-emphasised on the Flight Deck. */
  muted?: boolean;
  /** @deprecated Migrated to quickNotes on read; no longer written. */
  notes?: string;
  /** Short-lived quick notes for this session (Flight Deck workspace). */
  quickNotes?: SessionQuickNote[];
  /** @deprecated Migrated to labelIds on read; no longer written. */
  waitingOnReview?: boolean;
  /** When set, the session header offers pasting this briefing into the agent terminal. */
  wizardBriefMarkdown?: string;
  /** Runs the agent at the code directory from settings; no git worktree is created. */
  global?: boolean;
  /** Agent process running outside this app; not persisted in sessions.json. */
  external?: boolean;
};

export type SessionStatus = 'running' | 'stopped' | 'orphaned';

export type ActivityState = 'working' | 'idle';

export type SessionWithStatus = Session & {
  status: SessionStatus;
  activity?: ActivityState;
};

export type ThemePreference = 'system' | 'dark' | 'light';

export type TaskSectionConfig = {
  id: string;
  name: string;
  /** When true, the column is hidden on the board; cards remain stored until the section is shown again. */
  hidden?: boolean;
};

export type TasksConfig = {
  sections: TaskSectionConfig[];
  /** Board section whose completed cards appear in What Did I Do (default: Done). */
  whatDidIDoSectionId: string;
};

/** Leaf prompt nested under a parent; cannot have further children. */
export type SessionPromptChild = {
  title: string;
  text: string;
};

export type SessionPromptPreset = {
  title: string;
  text: string;
  /** Optional child prompts (max one level; children cannot nest). */
  children?: SessionPromptChild[];
};

export type Settings = {
  codeDir: string;
  theme: ThemePreference;
  wizard: WizardConfig;
  tasks?: TasksConfig;
  /** Pre-built prompts shown in each session row (pasted into the terminal with Enter). */
  sessionPrompts?: SessionPromptPreset[];
  /** User-defined labels for categorizing sessions. */
  sessionLabels?: SessionLabel[];
};

export type RepoInfo = {
  name: string;
  path: string;
};

export type CreateSessionInput = {
  repoPath?: string;
  name: string;
  agentId: AgentId;
  wizardBriefMarkdown?: string | null;
  /** When true, runs at the code directory from settings without creating a worktree. */
  global?: boolean;
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
  /** Set when the card enters the configured "What Did I Do" section (typically Done). */
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
