import { dialog, ipcMain, nativeTheme, shell } from 'electron';
import { nativeThemeSource } from '@shared/theme';
import { exec, execFile } from 'node:child_process';
import { resolve } from 'node:path';
import type { AgentId } from '@shared/agents';
import type { AgentSpendInfo } from '@shared/types';
import type {
  CreateSessionInput,
  DeleteSessionInput,
  TaskItem,
  GhSetupResult,
  GitDiffRequest,
  GitDiffResult,
  GitFileActionRequest,
  GitFileActionResult,
  GitStatusResult,
  OpenInVSCodeResult,
  RepoInfo,
  Session,
  Settings,
  SessionWithStatus,
} from '@shared/types';
import type { SettingsExportResult, SettingsImportResult } from '@shared/settings-import-export';
import { parseSettingsImportJson, settingsExportToJson } from '@shared/settings-import-export';
import { IPC } from '@shared/ipc-channels';
import type { GitHubMonitorRequest, GitHubMonitorResult, GitHubMonitorStatus } from '@shared/github-monitor';
import { ensureGitHubCli } from './gh-cli.js';
import { fetchGitHubMonitorStats, getGitHubMonitorStatus } from './github-monitor.js';
import { listRepos } from './repos.js';
import {
  discardFileChanges,
  getFileDiff,
  getWorktreeStatus,
  stageFile,
  unstageFile,
} from './git.js';
import { openWorktreeInVSCode } from './vscode.js';
import { detectAgents } from './agent-detection.js';
import {
  getAgentSpend,
  readAgentInstructions,
  writeAgentInstructions,
} from './agent-data.js';
import { promises as fs } from 'node:fs';
import {
  discoverExternalSessions,
  getDiscoveredExternalSession,
  isExternalSessionId,
  killExternalAgentProcesses,
} from './external-sessions.js';
import {
  createSession,
  deleteSession,
  getSessionById,
  listSessions,
  setSessionLabels,
  setSessionMuted,
  addSessionQuickNote,
  removeSessionQuickNote,
  setSessionWaitingOnReview,
} from './sessions.js';
import { setKeyboardShortcuts } from './keyboard-shortcuts-handler.js';
import { getSettings, replaceSettings, updateSettings } from './settings.js';
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
  killShellPty,
  resizeShellPty,
  startShellPty,
  writeShellPty,
} from './shell-pty-manager.js';
import {
  addItem as tasksAddItem,
  clearDoneBefore as tasksClearDoneBefore,
  listItems as tasksListItems,
  moveToSection as tasksMoveToSection,
  removeItem as tasksRemoveItem,
  updateItem as tasksUpdateItem,
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
  const external = await discoverExternalSessions(sessions);
  const all = [...sessions, ...external];
  const running = new Set(runningSessionIds());
  const result: SessionWithStatus[] = [];
  for (const s of all) {
    let status: SessionWithStatus['status'];
    if (s.external || running.has(s.id)) status = 'running';
    else if (!(await pathExists(s.worktreePath))) status = 'orphaned';
    else status = 'stopped';
    const decorated: SessionWithStatus = { ...s, status };
    if (status === 'running') {
      decorated.activity = s.external ? 'working' : getActivityState(s.id);
    }
    result.push(decorated);
  }
  return result;
}

export function registerIpc(): void {
  ipcMain.handle(IPC.GhSetupEnsure, async (event): Promise<GhSetupResult> => {
    const wc = event.sender;
    return ensureGitHubCli((message) => {
      wc.send(IPC.GhSetupProgress, message);
    });
  });

  ipcMain.handle(IPC.GitHubMonitorStatus, async (): Promise<GitHubMonitorStatus> => {
    return getGitHubMonitorStatus();
  });

  ipcMain.handle(
    IPC.GitHubMonitorFetch,
    async (_e, request: GitHubMonitorRequest): Promise<GitHubMonitorResult> => {
      return fetchGitHubMonitorStats(request);
    },
  );

  ipcMain.handle(IPC.ListSessions, async (): Promise<SessionWithStatus[]> => {
    return decorate(await listSessions());
  });

  ipcMain.handle(IPC.CreateSession, async (_e, input: CreateSessionInput) => {
    return createSession(input);
  });

  ipcMain.handle(IPC.DeleteSession, async (_e, input: DeleteSessionInput) => {
    killPty(input.id);
    killShellPty(input.id);
    if (isExternalSessionId(input.id)) {
      const session = getDiscoveredExternalSession(input.id);
      if (session?.external) {
        await killExternalAgentProcesses(session.worktreePath, session.agentId);
      }
      return { ok: true };
    }
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
    if (patch.theme) nativeTheme.themeSource = nativeThemeSource(patch.theme);
    if (patch.keyboardShortcuts) setKeyboardShortcuts(next.keyboardShortcuts ?? {});
    return next;
  });

  ipcMain.on(IPC.ShortcutsSync, (_e, shortcuts: Settings['keyboardShortcuts']) => {
    setKeyboardShortcuts(shortcuts ?? {});
  });

  ipcMain.handle(IPC.ExportSettings, async (): Promise<SettingsExportResult> => {
    const settings = await getSettings();
    const result = await dialog.showSaveDialog({
      title: 'Export settings',
      defaultPath: 'ai-worktrees-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, cancelled: true };
    }
    try {
      await fs.writeFile(result.filePath, settingsExportToJson(settings), 'utf-8');
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.ImportSettings, async (): Promise<SettingsImportResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Import settings',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, cancelled: true };
    }
    try {
      const raw = await fs.readFile(result.filePaths[0], 'utf-8');
      const parsed = parseSettingsImportJson(raw);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const next = await replaceSettings(parsed.value);
      nativeTheme.themeSource = nativeThemeSource(next.theme);
      setKeyboardShortcuts(next.keyboardShortcuts ?? {});
      return { ok: true, settings: next };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
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
    const resolved = resolve(path);
    const result = await shell.openPath(resolved);
    if (result) throw new Error(result);
  });

  ipcMain.handle(IPC.OpenInITerm, async (_e, path: string) => {
    const escaped = path.replace(/"/g, '\\"');
    const script = `tell application "iTerm" to create window with default profile command "cd \\"${escaped}\\" && claude --continue"`;
    return new Promise<void>((resolve) => {
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, () => resolve());
    });
  });

  ipcMain.handle(IPC.OpenInTerminal, async (_e, dir: string) => {
    const inner = dir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await new Promise<void>((resolve, reject) => {
      execFile(
        'osascript',
        [
          '-e',
          'tell application "Terminal" to activate',
          '-e',
          `tell application "Terminal" to do script "cd " & quoted form of "${inner}"`,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
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
    return {
      running: isRunning(sessionId),
      backlog: getBacklog(sessionId),
      activity: getActivityState(sessionId),
    };
  });

  ipcMain.handle(IPC.PtyMarkIdle, async (_e, sessionId: string) => {
    markSessionIdle(sessionId);
  });

  ipcMain.handle(
    IPC.ShellPtyStart,
    async (_e, args: { sessionId: string; cols: number; rows: number }) => {
      const session = await getSessionById(args.sessionId);
      if (!session) return { ok: false, error: 'Session not found.' };
      return startShellPty({
        sessionId: session.id,
        cwd: session.worktreePath,
        cols: args.cols,
        rows: args.rows,
      });
    },
  );

  ipcMain.on(IPC.ShellPtyWrite, (_e, args: { sessionId: string; data: string }) => {
    writeShellPty(args.sessionId, args.data);
  });

  ipcMain.on(IPC.ShellPtyResize, (_e, args: { sessionId: string; cols: number; rows: number }) => {
    resizeShellPty(args.sessionId, args.cols, args.rows);
  });

  ipcMain.handle(IPC.ShellPtyKill, async (_e, sessionId: string) => {
    killShellPty(sessionId);
  });

  ipcMain.handle(
    IPC.SessionsSetWaitingOnReview,
    async (_e, args: { sessionId: string; value: boolean }) => {
      if (isExternalSessionId(args.sessionId)) return;
      await setSessionWaitingOnReview(args.sessionId, args.value);
    },
  );

  ipcMain.handle(
    IPC.SessionsSetLabels,
    async (_e, args: { sessionId: string; labelIds: string[] }) => {
      if (isExternalSessionId(args.sessionId)) return;
      await setSessionLabels(args.sessionId, args.labelIds);
    },
  );

  ipcMain.handle(
    IPC.SessionsSetMuted,
    async (_e, args: { sessionId: string; value: boolean }) => {
      if (isExternalSessionId(args.sessionId)) return;
      await setSessionMuted(args.sessionId, args.value);
    },
  );

  ipcMain.handle(
    IPC.SessionsAddQuickNote,
    async (_e, args: { sessionId: string; text: string }) => {
      if (isExternalSessionId(args.sessionId)) {
        throw new Error('Quick notes are not available for external sessions.');
      }
      return addSessionQuickNote(args.sessionId, args.text);
    },
  );

  ipcMain.handle(
    IPC.SessionsRemoveQuickNote,
    async (_e, args: { sessionId: string; noteId: string }) => {
      if (isExternalSessionId(args.sessionId)) return;
      await removeSessionQuickNote(args.sessionId, args.noteId);
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

  ipcMain.handle(IPC.TasksList, async (): Promise<TaskItem[]> => tasksListItems());

  ipcMain.handle(
    IPC.TasksAdd,
    async (_e, args: { text: string; sectionId: string }): Promise<TaskItem> =>
      tasksAddItem(args.text, args.sectionId),
  );

  ipcMain.handle(
    IPC.TasksUpdate,
    async (_e, args: { id: string; text: string }): Promise<void> => {
      await tasksUpdateItem(args.id, args.text);
    },
  );

  ipcMain.handle(
    IPC.TasksMove,
    async (_e, args: { id: string; sectionId: string }): Promise<void> => {
      const settings = await getSettings();
      await tasksMoveToSection(
        args.id,
        args.sectionId,
        settings.tasks!.whatDidIDoSectionId,
      );
    },
  );

  ipcMain.handle(IPC.TasksRemove, async (_e, id: string): Promise<void> => {
    await tasksRemoveItem(id);
  });

  ipcMain.handle(IPC.TasksClearDoneBefore, async (_e, cutoffISO: string): Promise<number> => {
    return tasksClearDoneBefore(cutoffISO);
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

  ipcMain.handle(
    IPC.GitFileAction,
    async (_e, req: GitFileActionRequest): Promise<GitFileActionResult> => {
      const session = await getSessionById(req.sessionId);
      if (!session) return { ok: false, error: 'Session not found.' };
      if (!(await pathExists(session.worktreePath))) {
        return { ok: false, error: 'Worktree path no longer exists.' };
      }
      try {
        const { worktreePath } = session;
        const { path, oldPath, group, action } = req;
        if (action === 'stage') await stageFile(worktreePath, path, oldPath);
        else if (action === 'unstage') await unstageFile(worktreePath, path, oldPath);
        else await discardFileChanges(worktreePath, path, group, oldPath);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );
}
