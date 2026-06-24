import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  ActivityState,
  AgentSpendInfo,
  CreateSessionInput,
  CreateSessionResult,
  DeleteSessionInput,
  CleanupDeleteInput,
  CleanupDeleteResult,
  CleanupSnapshot,
  TaskItem,
  FishSetupResult,
  GhSetupResult,
  GitDiffRequest,
  GitDiffResult,
  GitFileActionRequest,
  GitFileActionResult,
  GitStatusResult,
  OpenInVSCodeResult,
  RepoInfo,
  SessionWithStatus,
  Settings,
} from '@shared/types';
import type { SettingsExportResult, SettingsImportResult } from '@shared/settings-import-export';
import type { AgentAvailability, AgentId } from '@shared/agents';

type PtyDataPayload = { sessionId: string; data: string };
type PtyExitPayload = { sessionId: string; exitCode: number };
type PtyActivityPayload = { sessionId: string; activity: ActivityState };
type ShellPtyDataPayload = { sessionId: string; data: string };
type ShellPtyExitPayload = { sessionId: string; exitCode: number };

const api = {
  ensureGitHubApi: (): Promise<GhSetupResult> => ipcRenderer.invoke(IPC.GhSetupEnsure),
  ensureFishShell: (): Promise<FishSetupResult> => ipcRenderer.invoke(IPC.FishSetupEnsure),
  onGitHubApiSetupProgress: (cb: (message: string) => void) => {
    const listener = (_: unknown, message: string) => cb(message);
    ipcRenderer.on(IPC.GhSetupProgress, listener);
    return () => ipcRenderer.removeListener(IPC.GhSetupProgress, listener);
  },
  onFishSetupProgress: (cb: (message: string) => void) => {
    const listener = (_: unknown, message: string) => cb(message);
    ipcRenderer.on(IPC.FishSetupProgress, listener);
    return () => ipcRenderer.removeListener(IPC.FishSetupProgress, listener);
  },
  listSessions: (): Promise<SessionWithStatus[]> => ipcRenderer.invoke(IPC.ListSessions),
  setWaitingOnReview: (sessionId: string, value: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.SessionsSetWaitingOnReview, { sessionId, value }),
  setSessionLabels: (sessionId: string, labelIds: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.SessionsSetLabels, { sessionId, labelIds }),
  setSessionMuted: (sessionId: string, value: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.SessionsSetMuted, { sessionId, value }),
  createSession: (input: CreateSessionInput): Promise<CreateSessionResult> =>
    ipcRenderer.invoke(IPC.CreateSession, input),
  deleteSession: (input: DeleteSessionInput) => ipcRenderer.invoke(IPC.DeleteSession, input),
  listCleanupItems: (): Promise<CleanupSnapshot> => ipcRenderer.invoke(IPC.CleanupList),
  deleteCleanupItems: (input: CleanupDeleteInput): Promise<CleanupDeleteResult> =>
    ipcRenderer.invoke(IPC.CleanupDelete, input),
  listRepos: (): Promise<RepoInfo[]> => ipcRenderer.invoke(IPC.ListRepos),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.GetSettings),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.UpdateSettings, patch),
  exportSettings: (): Promise<SettingsExportResult> => ipcRenderer.invoke(IPC.ExportSettings),
  importSettings: (): Promise<SettingsImportResult> => ipcRenderer.invoke(IPC.ImportSettings),
  pickDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.PickDirectory, defaultPath),
  revealInFinder: (path: string) => ipcRenderer.invoke(IPC.RevealInFinder, path),
  openInITerm: (path: string) => ipcRenderer.invoke(IPC.OpenInITerm, path),
  openInTerminal: (path: string): Promise<void> => ipcRenderer.invoke(IPC.OpenInTerminal, path),
  openInVSCode: (path: string): Promise<OpenInVSCodeResult> =>
    ipcRenderer.invoke(IPC.OpenInVSCode, path),
  detectAgents: (force?: boolean): Promise<AgentAvailability> =>
    ipcRenderer.invoke(IPC.AgentsDetect, force),
  readAgentInstructions: (agentId: AgentId): Promise<string> =>
    ipcRenderer.invoke(IPC.ReadAgentInstructions, agentId),
  writeAgentInstructions: (agentId: AgentId, content: string): Promise<void> =>
    ipcRenderer.invoke(IPC.WriteAgentInstructions, { agentId, content }),
  getAgentSpend: (agentId: AgentId, force?: boolean): Promise<AgentSpendInfo> =>
    ipcRenderer.invoke(IPC.GetAgentSpend, { agentId, force }),
  git: {
    status: (sessionId: string): Promise<GitStatusResult> =>
      ipcRenderer.invoke(IPC.GitStatus, sessionId),
    diff: (req: GitDiffRequest): Promise<GitDiffResult> =>
      ipcRenderer.invoke(IPC.GitDiff, req),
    fileAction: (req: GitFileActionRequest): Promise<GitFileActionResult> =>
      ipcRenderer.invoke(IPC.GitFileAction, req),
  },
  tasks: {
    list: (): Promise<TaskItem[]> => ipcRenderer.invoke(IPC.TasksList),
    add: (text: string, sectionId: string, labelIds?: string[]): Promise<TaskItem> =>
      ipcRenderer.invoke(IPC.TasksAdd, { text, sectionId, labelIds }),
    update: (id: string, text: string): Promise<void> =>
      ipcRenderer.invoke(IPC.TasksUpdate, { id, text }),
    move: (id: string, sectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.TasksMove, { id, sectionId }),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TasksRemove, id),
    setLabels: (id: string, labelIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.TasksSetLabels, { id, labelIds }),
  },
  pty: {
    start: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.PtyStart, { sessionId, cols, rows }) as Promise<
        { ok: true; reattached: boolean } | { ok: false; error: string }
      >,
    write: (sessionId: string, data: string) =>
      ipcRenderer.send(IPC.PtyWrite, { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.PtyResize, { sessionId, cols, rows }),
    kill: (sessionId: string) => ipcRenderer.invoke(IPC.PtyKill, sessionId),
    backlog: (
      sessionId: string,
    ): Promise<{ running: boolean; backlog: string; activity: 'working' | 'idle' }> =>
      ipcRenderer.invoke(IPC.PtyBacklog, sessionId),
    markIdle: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.PtyMarkIdle, sessionId),
    onData: (cb: (payload: PtyDataPayload) => void) => {
      const listener = (_: unknown, payload: PtyDataPayload) => cb(payload);
      ipcRenderer.on(IPC.PtyData, listener);
      return () => ipcRenderer.removeListener(IPC.PtyData, listener);
    },
    onExit: (cb: (payload: PtyExitPayload) => void) => {
      const listener = (_: unknown, payload: PtyExitPayload) => cb(payload);
      ipcRenderer.on(IPC.PtyExit, listener);
      return () => ipcRenderer.removeListener(IPC.PtyExit, listener);
    },
    onActivity: (cb: (payload: PtyActivityPayload) => void) => {
      const listener = (_: unknown, payload: PtyActivityPayload) => cb(payload);
      ipcRenderer.on(IPC.PtyActivity, listener);
      return () => ipcRenderer.removeListener(IPC.PtyActivity, listener);
    },
  },
  shellPty: {
    start: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.ShellPtyStart, { sessionId, cols, rows }) as Promise<
        { ok: true; reattached: boolean } | { ok: false; error: string }
      >,
    write: (sessionId: string, data: string) =>
      ipcRenderer.send(IPC.ShellPtyWrite, { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.ShellPtyResize, { sessionId, cols, rows }),
    kill: (sessionId: string) => ipcRenderer.invoke(IPC.ShellPtyKill, sessionId),
    onData: (cb: (payload: ShellPtyDataPayload) => void) => {
      const listener = (_: unknown, payload: ShellPtyDataPayload) => cb(payload);
      ipcRenderer.on(IPC.ShellPtyData, listener);
      return () => ipcRenderer.removeListener(IPC.ShellPtyData, listener);
    },
    onExit: (cb: (payload: ShellPtyExitPayload) => void) => {
      const listener = (_: unknown, payload: ShellPtyExitPayload) => cb(payload);
      ipcRenderer.on(IPC.ShellPtyExit, listener);
      return () => ipcRenderer.removeListener(IPC.ShellPtyExit, listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type CWApi = typeof api;
