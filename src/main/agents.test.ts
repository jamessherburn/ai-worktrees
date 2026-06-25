import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { AgentId } from '@shared/agents';
import {
  AGENT_LAUNCH_SPECS,
  agentSessionDataPaths,
  composeLaunchCommand,
  encodeClaudeProjectPath,
  encodeCursorProjectPath,
  encodeProjectPath,
  formatPtyShellCommand,
  removeAgentDataPaths,
  shellSingleQuote,
} from './agents.js';

const AGENT_IDS: AgentId[] = ['claude', 'cursor', 'codex', 'gemini'];

describe('encodeProjectPath', () => {
  it('encodeCursorProjectPath matches Cursor CLI project directory names', () => {
    assert.equal(
      encodeCursorProjectPath('/Users/jamessherburn/code/ai-worktrees-skills-tray'),
      'Users-jamessherburn-code-ai-worktrees-skills-tray',
    );
  });

  it('encodeClaudeProjectPath keeps the leading dash from the root slash', () => {
    assert.equal(
      encodeClaudeProjectPath('/Users/jamessherburn/code/ai-worktrees-skills-tray'),
      '-Users-jamessherburn-code-ai-worktrees-skills-tray',
    );
  });

  it('encodeProjectPath is an alias for the Cursor encoding', () => {
    const path = '/tmp/foo';
    assert.equal(encodeProjectPath(path), encodeCursorProjectPath(path));
  });
});

describe('composeLaunchCommand', () => {
  const cwd = '/Users/jamessherburn/code';

  for (const agentId of AGENT_IDS) {
    const spec = AGENT_LAUNCH_SPECS[agentId];

    it(`${agentId}: fresh start uses base binary only`, () => {
      assert.equal(composeLaunchCommand(agentId, false).shellCommand, spec.binary);
    });

    if (spec.resumeArgs) {
      it(`${agentId}: resume only when saved state probe succeeded`, () => {
        assert.equal(
          composeLaunchCommand(agentId, true).shellCommand,
          `${spec.binary} ${spec.resumeArgs}`,
        );
      });
    } else {
      it(`${agentId}: never appends resume args even when probe succeeded`, () => {
        assert.equal(composeLaunchCommand(agentId, true).shellCommand, spec.binary);
      });
    }
  }

  it('cursor includes --workspace when cwd is provided', () => {
    assert.equal(
      composeLaunchCommand('cursor', false, { cwd }).shellCommand,
      `cursor-agent --workspace ${shellSingleQuote(cwd)}`,
    );
    assert.equal(
      composeLaunchCommand('cursor', true, { cwd }).shellCommand,
      `cursor-agent --workspace ${shellSingleQuote(cwd)} resume`,
    );
  });

  it('formatPtyShellCommand prefixes per-session agent env vars', () => {
    assert.equal(
      formatPtyShellCommand('cursor-agent resume', {
        CURSOR_CONFIG_DIR: '/tmp/global/cursor',
        CLAUDE_CONFIG_DIR: '/tmp/global/claude',
      }),
      `CURSOR_CONFIG_DIR=${shellSingleQuote('/tmp/global/cursor')} CLAUDE_CONFIG_DIR=${shellSingleQuote('/tmp/global/claude')} cursor-agent resume`,
    );
  });

  it('explicit canResume overrides cwd probe', () => {
    for (const agentId of AGENT_IDS) {
      const spec = AGENT_LAUNCH_SPECS[agentId];
      assert.equal(composeLaunchCommand(agentId, false).shellCommand, spec.binary);
      if (spec.resumeArgs) {
        assert.equal(
          composeLaunchCommand(agentId, true).shellCommand,
          `${spec.binary} ${spec.resumeArgs}`,
        );
      }
    }
  });
});

describe('agentSessionDataPaths', () => {
  const cwd = '/Users/jamessherburn/code/myrepo-feature';

  it('includes Claude, Cursor, and Codex home dirs for a worktree cwd', () => {
    const paths = agentSessionDataPaths(cwd, { includeLocalAgentDirs: true });
    assert.ok(paths.some((p) => p.includes('.claude/projects/-Users-jamessherburn-code-myrepo-feature')));
    assert.ok(paths.some((p) => p.includes('.cursor/projects/Users-jamessherburn-code-myrepo-feature')));
    assert.ok(paths.some((p) => p.includes('.codex/sessions/-Users-jamessherburn-code-myrepo-feature')));
    assert.ok(paths.includes(`${cwd}/.cursor`));
    assert.ok(paths.includes(`${cwd}/.codex`));
  });

  it('omits local agent dirs for global session cwds', () => {
    const paths = agentSessionDataPaths(cwd);
    assert.ok(!paths.some((p) => p.endsWith('/.cursor')));
    assert.ok(!paths.some((p) => p.endsWith('/.codex')));
  });

  it('uses per-session storage roots for global sessions', () => {
    const roots = {
      claudeConfigDir: '/tmp/global/claude',
      cursorConfigDir: '/tmp/global/cursor',
      codexHome: '/tmp/global/codex',
    };
    const paths = agentSessionDataPaths(cwd, { storageRoots: roots });
    assert.ok(paths.some((p) => p.startsWith('/tmp/global/claude/projects/')));
    assert.ok(paths.some((p) => p.startsWith('/tmp/global/cursor/chats/')));
    assert.ok(paths.some((p) => p.startsWith('/tmp/global/codex/sessions/')));
    assert.ok(!paths.some((p) => p.includes('/.claude/projects/')));
  });
});

describe('removeAgentDataPaths', () => {
  it('removes the exact scanned directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-worktrees-agent-remove-'));
    const target = join(root, 'claude-project');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'session.jsonl'), '{}');

    await removeAgentDataPaths([target]);

    await assert.rejects(() => writeFile(join(target, 'again.txt'), 'x'));
    await rm(root, { recursive: true, force: true });
  });
});
