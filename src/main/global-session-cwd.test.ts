import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  ensureGlobalAgentStorage,
  ensureGlobalSessionCwd,
  ensureGlobalWorkspace,
  globalAgentDataRoot,
  globalAgentEnv,
  globalAgentStoragePaths,
  globalSessionCwdPath,
  globalWorkspacePath,
  globalWorktreePath,
  migrateGlobalAgentDataIfNeeded,
  removeGlobalAgentStorage,
  removeGlobalSessionCwd,
  resolveAgentCwd,
  resolveAgentWorkspace,
  setUserDataRootForTests,
} from './global-session-cwd.js';
import { buildLaunchCommand, encodeClaudeProjectPath, encodeCursorProjectPath } from './agents.js';

async function withUnixSocket(path: string, run: () => Promise<void>): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(path, () => resolve());
  });
  try {
    await run();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('global-session-cwd', () => {
  let userDataDir: string;

  before(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ai-worktrees-global-cwd-'));
    setUserDataRootForTests(userDataDir);
  });

  after(async () => {
    setUserDataRootForTests(undefined);
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('globalWorkspacePath nests under userData/global-workspaces', () => {
    assert.equal(
      globalWorkspacePath('abc-123'),
      join(userDataDir, 'global-workspaces', 'abc-123'),
    );
  });

  it('ensureGlobalWorkspace creates a real directory with code symlinked to the code dir', async () => {
    const codeDir = join(userDataDir, 'code');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-a';
    const workspace = await ensureGlobalWorkspace(sessionId, codeDir);
    assert.equal(workspace, globalWorkspacePath(sessionId));
    assert.equal(await readlink(globalWorktreePath(sessionId)), codeDir);
  });

  it('resolveAgentCwd uses the workspace code link for global sessions', async () => {
    const codeDir = join(userDataDir, 'code-agent');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-agent';
    const cwd = await resolveAgentCwd({
      id: sessionId,
      name: 'global-a',
      repoPath: codeDir,
      repoName: 'Global',
      worktreePath: codeDir,
      branchName: '',
      baseBranch: '',
      agentId: 'claude',
      createdAt: new Date().toISOString(),
      lastStartedAt: null,
      global: true,
    });
    assert.equal(cwd, globalWorktreePath(sessionId));
    assert.equal(await readlink(cwd), codeDir);
  });

  it('resolveAgentWorkspace returns the real workspace root for global sessions', async () => {
    const codeDir = join(userDataDir, 'code-workspace');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-workspace';
    const workspace = await resolveAgentWorkspace({
      id: sessionId,
      name: 'global-b',
      repoPath: codeDir,
      repoName: 'Global',
      worktreePath: codeDir,
      branchName: '',
      baseBranch: '',
      agentId: 'cursor',
      createdAt: new Date().toISOString(),
      lastStartedAt: null,
      global: true,
    });
    assert.equal(workspace, globalWorkspacePath(sessionId));
    assert.notEqual(workspace, globalWorktreePath(sessionId));
  });

  it('buildLaunchCommand uses workspaceCwd for cursor --workspace while PTY cwd differs', async () => {
    const codeDir = join(userDataDir, 'code-launch');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-launch';
    const workspace = await ensureGlobalWorkspace(sessionId, codeDir);
    const workCwd = globalWorktreePath(sessionId);
    const launch = await buildLaunchCommand('cursor', {
      cwd: workCwd,
      workspaceCwd: workspace,
      canResume: false,
    });
    assert.match(launch.shellCommand, /--workspace/);
    assert.match(launch.shellCommand, /--trust/);
    assert.match(launch.shellCommand, /global-workspaces\/session-launch/);
    assert.doesNotMatch(launch.shellCommand, /code-launch/);
  });

  it('ensureGlobalSessionCwd still supports legacy symlink cleanup', async () => {
    const codeDir = join(userDataDir, 'legacy-code');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-legacy';
    const cwd = await ensureGlobalSessionCwd(sessionId, codeDir);
    assert.equal(cwd, globalSessionCwdPath(sessionId));
    assert.equal(await readlink(cwd), codeDir);
  });

  it('migrateGlobalAgentDataIfNeeded copies legacy code-dir claude data into worktree storage', async () => {
    const codeDir = join(userDataDir, 'code-migrate');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-migrate';
    const storageRoots = globalAgentStoragePaths(sessionId);
    const canonicalCodeDir = await realpath(codeDir);
    const legacyProject = join(
      storageRoots.claudeConfigDir!,
      'projects',
      encodeClaudeProjectPath(canonicalCodeDir),
    );
    await mkdir(legacyProject, { recursive: true });
    await writeFile(join(legacyProject, 'session.jsonl'), '{}');

    await migrateGlobalAgentDataIfNeeded(sessionId, codeDir);

    const migratedProject = join(
      storageRoots.claudeConfigDir!,
      'projects',
      encodeClaudeProjectPath(globalWorktreePath(sessionId)),
    );
    await writeFile(join(migratedProject, 'verify.txt'), 'ok');
  });

  it('migrateGlobalAgentDataIfNeeded tolerates cursor worker.sock in per-session storage', async () => {
    const shortUserData = '/tmp/u';
    setUserDataRootForTests(shortUserData);
    try {
      await mkdir(shortUserData, { recursive: true });
      const codeDir = '/tmp/gcode';
      await mkdir(codeDir, { recursive: true });
      const sessionId = 's-sock';
      const storageRoots = globalAgentStoragePaths(sessionId);
      const workCwd = globalWorktreePath(sessionId);
      const projectDir = join(
        storageRoots.cursorConfigDir!,
        'projects',
        encodeCursorProjectPath(workCwd),
      );
      await mkdir(projectDir, { recursive: true });
      await writeFile(join(projectDir, 'chat.json'), '{}');

      const socketPath = join(projectDir, 'worker.sock');
      await withUnixSocket(socketPath, async () => {
        await migrateGlobalAgentDataIfNeeded(sessionId, codeDir);
      });
    } finally {
      setUserDataRootForTests(userDataDir);
      await rm(shortUserData, { recursive: true, force: true });
    }
  });

  it('removeGlobalAgentStorage deletes workspace, agent data, and legacy symlinks', async () => {
    const codeDir = join(userDataDir, 'code-for-agent-remove');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-d';
    await ensureGlobalAgentStorage(sessionId);
    await ensureGlobalWorkspace(sessionId, codeDir);
    await ensureGlobalSessionCwd(sessionId, codeDir);
    await writeFile(join(globalAgentDataRoot(sessionId), 'marker.txt'), 'ok');

    await removeGlobalAgentStorage(sessionId);
    await assert.rejects(() => readlink(globalWorktreePath(sessionId)));
    await assert.rejects(() => readlink(globalSessionCwdPath(sessionId)));
    await assert.rejects(() => writeFile(join(globalAgentDataRoot(sessionId), 'nope.txt'), 'x'));
  });
});
