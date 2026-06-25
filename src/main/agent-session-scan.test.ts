import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeAgentEncodedPath,
  decodeClaudeEncodedPath,
  decodeCursorEncodedPath,
  displayPathForAgentSession,
  encodedPathsForCwd,
  buildAgentEncodedPathIndex,
  mergeDecodedEntries,
  resolveAgentSessionStatus,
  resolveCanonicalAgentCwd,
  resolveCleanupGroup,
  tryRecoverWorktreePath,
} from './agent-session-scan.js';
import { encodeClaudeProjectPath } from './agents.js';

describe('decodeAgentEncodedPath', () => {
  it('decodeClaudeEncodedPath restores leading slash', () => {
    assert.equal(
      decodeClaudeEncodedPath('-Users-me-code-myrepo-feature'),
      '/Users/me/code/myrepo/feature',
    );
  });

  it('decodeCursorEncodedPath adds leading slash', () => {
    assert.equal(
      decodeCursorEncodedPath('Users-me-code-myrepo-feature'),
      '/Users/me/code/myrepo/feature',
    );
  });

  it('decodeAgentEncodedPath respects encoding kind', () => {
    const encoded = encodedPathsForCwd('/tmp/foo-bar');
    assert.equal(decodeAgentEncodedPath(encoded.claude, 'claude'), '/tmp/foo/bar');
    assert.equal(decodeAgentEncodedPath(encoded.cursor, 'cursor'), '/tmp/foo/bar');
  });
});

describe('resolveCleanupGroup', () => {
  const codeDir = '/Users/me/code';
  const repos = [{ name: 'myrepo', path: '/Users/me/code/myrepo' }];
  const globalRoot = '/Users/me/Library/Application Support/ai-worktrees/global-sessions';

  it('groups global session cwds under Global', () => {
    const globalRoot = '/Users/me/Library/Application Support/ai-worktrees/global-sessions';
    const workspaceRoot = '/Users/me/Library/Application Support/ai-worktrees/global-workspaces';
    const group = resolveCleanupGroup(
      `${workspaceRoot}/abc-123/code`,
      codeDir,
      repos,
      globalRoot,
      workspaceRoot,
    );
    assert.equal(group.groupName, 'Global');
    assert.equal(group.groupKind, 'global');
  });

  it('groups sibling worktrees under their repo', () => {
    const group = resolveCleanupGroup(
      '/Users/me/code/myrepo-feature',
      codeDir,
      repos,
      globalRoot,
    );
    assert.equal(group.groupName, 'myrepo');
    assert.equal(group.groupKind, 'repo');
  });

  it('groups unknown paths as External', () => {
    const group = resolveCleanupGroup('/opt/other/project', codeDir, repos, globalRoot);
    assert.equal(group.groupName, 'External');
    assert.equal(group.groupKind, 'external');
  });

  it('groups hyphenated repo worktrees under the repo, not the first path segment', () => {
    const aiRepos = [{ name: 'ai-worktrees', path: '/Users/me/code/ai-worktrees' }];
    const group = resolveCleanupGroup(
      '/Users/me/code/ai-worktrees-clean-up-fixes',
      codeDir,
      aiRepos,
      globalRoot,
    );
    assert.equal(group.groupName, 'ai-worktrees');
    assert.equal(group.groupKind, 'repo');
  });
});

describe('resolveCanonicalAgentCwd', () => {
  const codeDir = '/Users/me/code';
  const repos = [{ name: 'ai-worktrees', path: '/Users/me/code/ai-worktrees' }];
  const globalRoot = '/Users/me/Library/Application Support/ai-worktrees/global-sessions';

  it('uses the encoded index so ai-worktrees paths are not split into ai/worktrees', () => {
    const cwd = '/Users/me/code/ai-worktrees-clean-up-fixes';
    const index = buildAgentEncodedPathIndex([cwd]);
    const encoded = encodeClaudeProjectPath(cwd);
    assert.equal(
      resolveCanonicalAgentCwd(encoded, 'claude', {
        encodedIndex: index,
        repos,
        codeDir,
        globalSessionRoot: globalRoot,
      }),
      cwd,
    );
    assert.notEqual(decodeClaudeEncodedPath(encoded), cwd);
  });

  it('resolves deleted worktree agent folders via repo prefix matching', () => {
    const cwd = '/Users/me/code/ai-worktrees-clean-up-fixes';
    const encoded = encodeClaudeProjectPath(cwd);
    assert.equal(
      resolveCanonicalAgentCwd(encoded, 'claude', {
        encodedIndex: new Map(),
        repos,
        codeDir,
        globalSessionRoot: globalRoot,
      }),
      cwd,
    );
  });
});

describe('tryRecoverWorktreePath', () => {
  const codeDir = '/Users/me/code';
  const repos = [{ name: 'ai-worktrees', path: '/Users/me/code/ai-worktrees' }];

  it('flattens lossy decoded paths back to worktree directories', () => {
    assert.equal(
      tryRecoverWorktreePath('/Users/me/code/ai/worktrees/clean/up/fixes', repos, codeDir),
      '/Users/me/code/ai-worktrees-clean-up-fixes',
    );
  });
});

describe('resolveAgentSessionStatus', () => {
  it('marks active cwds', () => {
    const active = new Set(['/Users/me/code/myrepo-feature']);
    assert.equal(
      resolveAgentSessionStatus('/Users/me/code/myrepo-feature', active, 'repo'),
      'active',
    );
  });

  it('marks repo orphans separately from external', () => {
    const active = new Set<string>();
    assert.equal(
      resolveAgentSessionStatus('/Users/me/code/myrepo-old', active, 'repo'),
      'orphaned',
    );
    assert.equal(
      resolveAgentSessionStatus('/opt/other/project', active, 'external'),
      'external',
    );
  });
});

describe('displayPathForAgentSession', () => {
  it('shortens global session paths', () => {
    const label = displayPathForAgentSession(
      '/Users/me/Library/Application Support/ai-worktrees/global-sessions/abcdef12-3456',
      'global',
    );
    assert.match(label, /^Global session · abcdef12/);
  });
});

describe('mergeDecodedEntries', () => {
  it('keeps every scanned data path for the same cwd', () => {
    const cwd = '/Users/me/code/myrepo-feature';
    const encoded = encodeClaudeProjectPath(cwd);
    const merged = mergeDecodedEntries(
      [
        {
          cwd,
          agentId: 'claude',
          dataPath: `/Users/me/.claude/projects/${encoded}`,
          createdAtMs: 100,
        },
        {
          cwd,
          agentId: 'cursor',
          dataPath: `/Users/me/.cursor/chats/${encoded.replace(/^-/, '')}`,
          createdAtMs: 200,
        },
      ],
      [{ name: 'myrepo', path: '/Users/me/code/myrepo' }],
      '/Users/me/code',
    );
    const entry = merged.get(cwd);
    assert.ok(entry);
    assert.deepEqual(Array.from(entry!.dataPaths).sort(), [
      `/Users/me/.claude/projects/${encoded}`,
      `/Users/me/.cursor/chats/${encoded.replace(/^-/, '')}`,
    ].sort());
  });
});
