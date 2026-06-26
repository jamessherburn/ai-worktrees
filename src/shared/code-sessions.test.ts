import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODE_SESSION_DIR_PREFIX,
  codeSessionDirName,
  deriveCodeSessionPath,
  isCodeSession,
  sessionKindFor,
} from './code-sessions';
import type { Session } from './types';

describe('code-sessions', () => {
  it('builds directory names with the ai-worktrees-session prefix', () => {
    assert.equal(codeSessionDirName('my-project'), `${CODE_SESSION_DIR_PREFIX}my-project`);
    assert.equal(codeSessionDirName('feature/auth'), `${CODE_SESSION_DIR_PREFIX}feature-auth`);
  });

  it('derives paths under the configured code directory', () => {
    assert.equal(
      deriveCodeSessionPath('/Users/me/code', 'my-project'),
      `/Users/me/code/${CODE_SESSION_DIR_PREFIX}my-project`,
    );
  });

  it('detects code sessions by kind or directory prefix', () => {
    const codeSession = {
      kind: 'code',
      worktreePath: '/Users/me/code/ai-worktrees-session-alpha',
    } as Session;
    const repoSession = {
      kind: 'repo',
      worktreePath: '/Users/me/code/myrepo-feature',
    } as Session;
    const legacyCodeSession = {
      worktreePath: '/Users/me/code/ai-worktrees-session-legacy',
    } as Session;

    assert.equal(isCodeSession(codeSession), true);
    assert.equal(isCodeSession(repoSession), false);
    assert.equal(sessionKindFor(legacyCodeSession), 'code');
  });
});
