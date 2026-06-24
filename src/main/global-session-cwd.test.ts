import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  ensureGlobalSessionCwd,
  globalSessionCwdPath,
  removeGlobalSessionCwd,
  setUserDataRootForTests,
} from './global-session-cwd.js';

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
});
