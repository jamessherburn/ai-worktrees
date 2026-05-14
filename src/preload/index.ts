import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  ActivityState,
  AgentSpendInfo,
  CreateSessionInput,
  CreateSessionResult,
  DeleteSessionInput,
  DiaryItem,
  GitDiffRequest,
  GitDiffResult,
  GitStatusResult,
  OpenInVSCodeResult,
  RepoInfo,
  SessionWithStatus,
  Settings,
} from '@shared/types';
import type { AgentAvailability, AgentId } from '@shared/agents';

type PtyDataPayload = { sessionId: string; data: string };
type PtyExitPayload = { sessionId: string; exitCode: number };
type PtyActivityPayload = { sessionId: string; activity: ActivityState };

const api = {
  listSessions: (): Promise<SessionWithStatus[]> => ipcRenderer.invoke(IPC.ListSessions),
  setWaitingOnReview: (sessionId: string, value: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.SessionsSetWaitingOnReview, { sessionId, value }),
  createSession: (input: CreateSessionInput): Promise<CreateSessionResult> =>
    ipcRenderer.invoke(IPC.CreateSession, input),
  deleteSession: (input: DeleteSessionInput) => ipcRenderer.invoke(IPC.DeleteSession, input),
  listRepos: (): Promise<RepoInfo[]> => ipcRenderer.invoke(IPC.ListRepos),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.GetSettings),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.UpdateSettings, patch),
  pickDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.PickDirectory, defaultPath),
  revealInFinder: (path: string) => ipcRenderer.invoke(IPC.RevealInFinder, path),
  openInITerm: (path: string) => ipcRenderer.invoke(IPC.OpenInITerm, path),
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
  },
  diary: {
    list: (): Promise<DiaryItem[]> => ipcRenderer.invoke(IPC.DiaryList),
    add: (text: string): Promise<DiaryItem> => ipcRenderer.invoke(IPC.DiaryAdd, text),
    toggleDone: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DiaryToggleDone, id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DiaryRemove, id),
    clearDoneBefore: (cutoffISO: string): Promise<number> =>
      ipcRenderer.invoke(IPC.DiaryClearDoneBefore, cutoffISO),
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
    backlog: (sessionId: string): Promise<{ running: boolean; backlog: string }> =>
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
};

contextBridge.exposeInMainWorld('api', api);

export type CWApi = typeof api;
