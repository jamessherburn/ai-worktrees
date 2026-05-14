import { dialog, ipcMain, nativeTheme, shell } from 'electron';
import { exec } from 'node:child_process';
import type { AgentId } from '@shared/agents';
import type { AgentSpendInfo } from '@shared/types';
import type {
  CreateSessionInput,
  DeleteSessionInput,
  DiaryItem,
  GitDiffRequest,
  GitDiffResult,
  GitStatusResult,
  OpenInVSCodeResult,
  RepoInfo,
  Session,
  Settings,
  SessionWithStatus,
} from '@shared/types';
import { IPC } from '@shared/ipc-channels';
import { listRepos } from './repos.js';
import { getFileDiff, getWorktreeStatus } from './git.js';
import { openWorktreeInVSCode } from './vscode.js';
import { detectAgents } from './agent-detection.js';
import {
  getAgentSpend,
  readAgentInstructions,
  writeAgentInstructions,
} from './agent-data.js';
import { promises as fs } from 'node:fs';
import {
  createSession,
  deleteSession,
  getSessionById,
  listSessions,
  setSessionWaitingOnReview,
} from './sessions.js';
import { getSettings, updateSettings } from './settings.js';
import {
  getActivityState,
  getBacklog,
  isRunning,
  killPty,
  markSessionIdle,
  resizePty,
  runningSessionIds,
  startPty,
  writePty,
} from './pty-manager.js';
import {
  addItem as diaryAddItem,
  clearDoneBefore as diaryClearDoneBefore,
  listItems as diaryListItems,
  removeItem as diaryRemoveItem,
  toggleDone as diaryToggleDone,
} from './diary.js';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}


async function decorate(sessions: Session[]): Promise<SessionWithStatus[]> {
  const running = new Set(runningSessionIds());
  const result: SessionWithStatus[] = [];
  for (const s of sessions) {
    let status: SessionWithStatus['status'];
    if (running.has(s.id)) status = 'running';
    else if (!(await pathExists(s.worktreePath))) status = 'orphaned';
    else status = 'stopped';
    const decorated: SessionWithStatus = { ...s, status };
    if (status === 'running') decorated.activity = getActivityState(s.id);
    result.push(decorated);
  }
  return result;
}

export function registerIpc(): void {
  ipcMain.handle(IPC.ListSessions, async (): Promise<SessionWithStatus[]> => {
    return decorate(await listSessions());
  });

  ipcMain.handle(IPC.CreateSession, async (_e, input: CreateSessionInput) => {
    return createSession(input);
  });

  ipcMain.handle(IPC.DeleteSession, async (_e, input: DeleteSessionInput) => {
    killPty(input.id);
    return deleteSession(input);
  });

  ipcMain.handle(IPC.ListRepos, async (): Promise<RepoInfo[]> => {
    const settings = await getSettings();
    return listRepos(settings.codeDir);
  });

  ipcMain.handle(IPC.GetSettings, async (): Promise<Settings> => {
    return getSettings();
  });

  ipcMain.handle(IPC.UpdateSettings, async (_e, patch: Partial<Settings>) => {
    const next = await updateSettings(patch);
    if (patch.theme) nativeTheme.themeSource = patch.theme;
    return next;
  });

  ipcMain.handle(IPC.PickDirectory, async (_e, defaultPath?: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.RevealInFinder, async (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle(IPC.OpenInITerm, async (_e, path: string) => {
    const escaped = path.replace(/"/g, '\\"');
    const script = `tell application "iTerm" to create window with default profile command "cd \\"${escaped}\\" && claude --continue"`;
    return new Promise<void>((resolve) => {
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, () => resolve());
    });
  });

  ipcMain.handle(IPC.PtyStart, async (_e, args: { sessionId: string; cols: number; rows: number }) => {
    const session = await getSessionById(args.sessionId);
    if (!session) return { ok: false, error: 'Session not found.' };
    return startPty({
      sessionId: session.id,
      agentId: session.agentId,
      cwd: session.worktreePath,
      previouslyStarted: session.lastStartedAt !== null,
      cols: args.cols,
      rows: args.rows,
    });
  });

  ipcMain.on(IPC.PtyWrite, (_e, args: { sessionId: string; data: string }) => {
    writePty(args.sessionId, args.data);
  });

  ipcMain.on(IPC.PtyResize, (_e, args: { sessionId: string; cols: number; rows: number }) => {
    resizePty(args.sessionId, args.cols, args.rows);
  });

  ipcMain.handle(IPC.PtyKill, async (_e, sessionId: string) => {
    killPty(sessionId);
  });

  ipcMain.handle(IPC.PtyBacklog, async (_e, sessionId: string) => {
    return { running: isRunning(sessionId), backlog: getBacklog(sessionId) };
  });

  ipcMain.handle(IPC.PtyMarkIdle, async (_e, sessionId: string) => {
    markSessionIdle(sessionId);
  });

  ipcMain.handle(
    IPC.SessionsSetWaitingOnReview,
    async (_e, args: { sessionId: string; value: boolean }) => {
      await setSessionWaitingOnReview(args.sessionId, args.value);
    },
  );

  ipcMain.handle(IPC.ReadAgentInstructions, async (_e, agentId: AgentId): Promise<string> => {
    return readAgentInstructions(agentId);
  });

  ipcMain.handle(
    IPC.WriteAgentInstructions,
    async (_e, args: { agentId: AgentId; content: string }): Promise<void> => {
      await writeAgentInstructions(args.agentId, args.content);
    },
  );

  ipcMain.handle(
    IPC.GetAgentSpend,
    async (_e, args: { agentId: AgentId; force?: boolean }): Promise<AgentSpendInfo> => {
      return getAgentSpend(args.agentId, args.force === true);
    },
  );

  ipcMain.handle(IPC.DiaryList, async (): Promise<DiaryItem[]> => {
    return diaryListItems();
  });

  ipcMain.handle(IPC.DiaryAdd, async (_e, text: string): Promise<DiaryItem> => {
    return diaryAddItem(text);
  });

  ipcMain.handle(IPC.DiaryToggleDone, async (_e, id: string): Promise<void> => {
    await diaryToggleDone(id);
  });

  ipcMain.handle(IPC.DiaryRemove, async (_e, id: string): Promise<void> => {
    await diaryRemoveItem(id);
  });

  ipcMain.handle(IPC.DiaryClearDoneBefore, async (_e, cutoffISO: string): Promise<number> => {
    return diaryClearDoneBefore(cutoffISO);
  });

  ipcMain.handle(IPC.GitStatus, async (_e, sessionId: string): Promise<GitStatusResult> => {
    const session = await getSessionById(sessionId);
    if (!session) return { ok: false, error: 'Session not found.' };
    if (!(await pathExists(session.worktreePath))) {
      return { ok: false, error: 'Worktree path no longer exists.' };
    }
    try {
      const status = await getWorktreeStatus(session.worktreePath);
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.OpenInVSCode, async (_e, path: string): Promise<OpenInVSCodeResult> => {
    return openWorktreeInVSCode(path);
  });

  ipcMain.handle(IPC.AgentsDetect, async (_e, force?: boolean) => {
    return detectAgents(force === true);
  });

  ipcMain.handle(IPC.GitDiff, async (_e, req: GitDiffRequest): Promise<GitDiffResult> => {
    const session = await getSessionById(req.sessionId);
    if (!session) return { ok: false, error: 'Session not found.' };
    if (!(await pathExists(session.worktreePath))) {
      return { ok: false, error: 'Worktree path no longer exists.' };
    }
    try {
      const diff = await getFileDiff(session.worktreePath, req.path, {
        staged: req.staged,
        untracked: req.untracked,
        oldPath: req.oldPath,
      });
      return { ok: true, diff };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
