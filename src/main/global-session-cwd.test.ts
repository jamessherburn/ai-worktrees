import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  ensureGlobalAgentStorage,
  ensureGlobalSessionCwd,
  globalAgentDataRoot,
  globalAgentEnv,
  globalAgentStoragePaths,
  globalSessionCwdPath,
  migrateGlobalAgentDataIfNeeded,
  removeGlobalAgentStorage,
  removeGlobalSessionCwd,
  resolveAgentCwd,
  setUserDataRootForTests,
} from './global-session-cwd.js';
import { encodeCursorProjectPath } from './agents.js';

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

  it('globalSessionCwdPath nests under userData/global-sessions', () => {
    assert.equal(
      globalSessionCwdPath('abc-123'),
      join(userDataDir, 'global-sessions', 'abc-123'),
    );
  });

  it('globalAgentDataRoot nests under userData/global-agent-data', () => {
    assert.equal(
      globalAgentDataRoot('abc-123'),
      join(userDataDir, 'global-agent-data', 'abc-123'),
    );
  });

  it('ensureGlobalAgentStorage creates per-agent config directories', async () => {
    const sessionId = 'session-storage';
    await ensureGlobalAgentStorage(sessionId);
    const paths = globalAgentStoragePaths(sessionId);
    assert.equal(paths.claudeConfigDir, join(userDataDir, 'global-agent-data', sessionId, 'claude'));
    assert.equal(paths.cursorConfigDir, join(userDataDir, 'global-agent-data', sessionId, 'cursor'));
    assert.equal(paths.codexHome, join(userDataDir, 'global-agent-data', sessionId, 'codex'));
    assert.deepEqual(globalAgentEnv(sessionId), {
      CLAUDE_CONFIG_DIR: paths.claudeConfigDir,
      CURSOR_CONFIG_DIR: paths.cursorConfigDir,
      CODEX_HOME: paths.codexHome,
    });
  });

  it('resolveAgentCwd uses the code directory for global sessions', async () => {
    const codeDir = join(userDataDir, 'code');
    await mkdir(codeDir, { recursive: true });
    const cwd = await resolveAgentCwd({
      id: 'session-agent',
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
    assert.equal(cwd, await realpath(codeDir));
  });

  it('ensureGlobalSessionCwd creates a symlink to the code directory', async () => {
    const codeDir = join(userDataDir, 'code');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-a';

    const cwd = await ensureGlobalSessionCwd(sessionId, codeDir);
    assert.equal(cwd, globalSessionCwdPath(sessionId));
    assert.equal(await readlink(cwd), codeDir);
  });

  it('ensureGlobalSessionCwd recreates the symlink when the code directory changes', async () => {
    const oldCodeDir = join(userDataDir, 'old-code');
    const newCodeDir = join(userDataDir, 'new-code');
    await mkdir(oldCodeDir, { recursive: true });
    await mkdir(newCodeDir, { recursive: true });
    const sessionId = 'session-b';

    await ensureGlobalSessionCwd(sessionId, oldCodeDir);
    const cwd = await ensureGlobalSessionCwd(sessionId, newCodeDir);
    assert.equal(await readlink(cwd), newCodeDir);
  });

  it('removeGlobalSessionCwd deletes only the symlink', async () => {
    const codeDir = join(userDataDir, 'code-for-remove');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-c';
    const cwd = await ensureGlobalSessionCwd(sessionId, codeDir);

    await removeGlobalSessionCwd(sessionId);
    await assert.rejects(() => readlink(cwd));
    await writeFile(join(codeDir, 'still-here.txt'), 'ok');
  });

  it('migrateGlobalAgentDataIfNeeded copies legacy symlink data into canonical cwd storage', async () => {
    const codeDir = join(userDataDir, 'code');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-migrate';
    const legacyCwd = globalSessionCwdPath(sessionId);
    await ensureGlobalSessionCwd(sessionId, codeDir);
    const storageRoots = globalAgentStoragePaths(sessionId);
    const legacyChat = join(
      storageRoots.cursorConfigDir!,
      'chats',
      encodeCursorProjectPath(legacyCwd),
    );
    await mkdir(legacyChat, { recursive: true });
    await writeFile(join(legacyChat, 'chat.json'), '{}');

    await migrateGlobalAgentDataIfNeeded(sessionId, codeDir);

    const canonicalCwd = await realpath(codeDir);
    const canonicalChat = join(
      storageRoots.cursorConfigDir!,
      'chats',
      encodeCursorProjectPath(canonicalCwd),
    );
    await writeFile(join(canonicalChat, 'verify.txt'), 'ok');
  });

  it('migrateGlobalAgentDataIfNeeded still migrates legacy symlink data for isolated sessions', async () => {
    const codeDir = join(userDataDir, 'code-isolated-legacy');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-isolated-legacy';
    const legacyCwd = globalSessionCwdPath(sessionId);
    await ensureGlobalSessionCwd(sessionId, codeDir);
    const storageRoots = globalAgentStoragePaths(sessionId);
    const legacyChat = join(
      storageRoots.cursorConfigDir!,
      'chats',
      encodeCursorProjectPath(legacyCwd),
    );
    await mkdir(legacyChat, { recursive: true });
    await writeFile(join(legacyChat, 'chat.json'), '{}');

    await migrateGlobalAgentDataIfNeeded(sessionId, codeDir, { agentStorageIsolated: true });

    const canonicalCwd = await realpath(codeDir);
    const canonicalChat = join(
      storageRoots.cursorConfigDir!,
      'chats',
      encodeCursorProjectPath(canonicalCwd),
    );
    await writeFile(join(canonicalChat, 'verify.txt'), 'ok');
  });

  it('migrateGlobalAgentDataIfNeeded tolerates cursor worker.sock in per-session storage', async () => {
    const shortUserData = await mkdtemp('/tmp/u');
    setUserDataRootForTests(shortUserData);
    try {
      const codeDir = '/tmp/gcode';
      await mkdir(codeDir, { recursive: true });
      const sessionId = 'session-socket';
      const storageRoots = globalAgentStoragePaths(sessionId);
      const projectDir = join(
        storageRoots.cursorConfigDir!,
        'projects',
        encodeCursorProjectPath(codeDir),
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

  it('removeGlobalAgentStorage deletes per-session agent data and legacy symlinks', async () => {
    const codeDir = join(userDataDir, 'code-for-agent-remove');
    await mkdir(codeDir, { recursive: true });
    const sessionId = 'session-d';
    await ensureGlobalAgentStorage(sessionId);
    await ensureGlobalSessionCwd(sessionId, codeDir);
    await writeFile(join(globalAgentDataRoot(sessionId), 'marker.txt'), 'ok');

    await removeGlobalAgentStorage(sessionId);
    await assert.rejects(() => readlink(globalSessionCwdPath(sessionId)));
    await assert.rejects(() => writeFile(join(globalAgentDataRoot(sessionId), 'nope.txt'), 'x'));
  });
});
