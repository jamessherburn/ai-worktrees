import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { AgentId } from '@shared/agents';
import {
  AGENT_LAUNCH_SPECS,
  agentSessionDataPaths,
  composeLaunchCommand,
  copyAgentPathSkippingSpecialFiles,
  copyAgentSessionDataBetweenRoots,
  cursorHasSavedSession,
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
    assert.equal(
      encodeCursorProjectPath(
        '/Users/jamessherburn/Library/Application Support/ai-worktrees/global-workspaces/abc-123',
      ),
      'Users-jamessherburn-Library-Application-Support-ai-worktrees-global-workspaces-abc-123',
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

  it('cursor includes --trust for fresh global workspace roots', () => {
    assert.equal(
      composeLaunchCommand('cursor', false, { cwd, cursorTrustWorkspace: true }).shellCommand,
      `cursor-agent --workspace ${shellSingleQuote(cwd)} --trust`,
    );
    assert.equal(
      composeLaunchCommand('cursor', true, { cwd, cursorTrustWorkspace: true }).shellCommand,
      `cursor-agent --workspace ${shellSingleQuote(cwd)} --trust resume`,
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

describe('copyAgentPathSkippingSpecialFiles', () => {
  it('skips unix sockets and copies regular files', async () => {
    const root = await mkdtemp('/tmp/c');
    const src = join(root, 'src');
    const dest = join(root, 'dest');
    const projectDir = join(src, 'projects', 'code');
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'chat.json'), '{"ok":true}');

    const socketPath = join(projectDir, 'worker.sock');
    await withUnixSocket(socketPath, async () => {
      await copyAgentPathSkippingSpecialFiles(src, dest);
      await writeFile(join(dest, 'projects', 'code', 'verify.txt'), 'ok');
    });
    await rm(root, { recursive: true, force: true });
  });

  it('is a no-op when source and destination are the same path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-worktrees-agent-copy-same-'));
    const dir = join(root, 'cursor', 'projects', 'Users-example-code');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'chat.json'), '{}');

    await copyAgentPathSkippingSpecialFiles(dir, dir);

    await writeFile(join(dir, 'still-here.txt'), 'ok');
    await rm(root, { recursive: true, force: true });
  });
});

describe('copyAgentSessionDataBetweenRoots', () => {
  it('ignores identical from/to paths', async () => {
    const cwd = '/tmp/example';
    const roots = {
      claudeConfigDir: '/tmp/global/claude',
      cursorConfigDir: '/tmp/global/cursor',
      codexHome: '/tmp/global/codex',
    };
    const copied = await copyAgentSessionDataBetweenRoots(cwd, cwd, roots, roots);
    assert.equal(copied, false);
  });
});

describe('cursorHasSavedSession', () => {
  it('ignores worker.sock when probing for saved sessions', async () => {
    const root = await mkdtemp('/tmp/c');
    const cwd = join(root, 'x');
    const cursorRoot = join(root, 'cursor');
    const projectDir = join(cursorRoot, 'projects', encodeCursorProjectPath(cwd));
    await mkdir(projectDir, { recursive: true });

    const socketPath = join(projectDir, 'worker.sock');
    await withUnixSocket(socketPath, async () => {
      assert.equal(await cursorHasSavedSession(cwd, { cursorConfigDir: cursorRoot }), false);
    });

    await writeFile(join(projectDir, 'chat.json'), '{}');
    assert.equal(await cursorHasSavedSession(cwd, { cursorConfigDir: cursorRoot }), false);

    const transcriptDir = join(projectDir, 'agent-transcripts', 'chat-1');
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(join(transcriptDir, 'chat-1.jsonl'), '{"role":"user"}');
    assert.equal(await cursorHasSavedSession(cwd, { cursorConfigDir: cursorRoot }), true);

    await rm(root, { recursive: true, force: true });
  });

  it('falls back to ~/.cursor when per-session cursor config is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-worktrees-cursor-fallback-'));
    const cwd = join(root, 'workspace');
    const isolatedCursorRoot = join(root, 'isolated-cursor');
    const projectDir = join(root, 'default-cursor', 'projects', encodeCursorProjectPath(cwd));
    const transcriptDir = join(projectDir, 'agent-transcripts', 'chat-1');
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(join(transcriptDir, 'chat-1.jsonl'), '{"role":"user"}');

    const fakeHome = join(root, 'home');
    await mkdir(fakeHome, { recursive: true });
    const previousHome = process.env.HOME;
    process.env.HOME = fakeHome;
    await mkdir(join(fakeHome, '.cursor', 'projects'), { recursive: true });
    await copyAgentPathSkippingSpecialFiles(
      join(root, 'default-cursor', 'projects'),
      join(fakeHome, '.cursor', 'projects'),
    );

    try {
      assert.equal(
        await cursorHasSavedSession(cwd, { cursorConfigDir: isolatedCursorRoot }),
        true,
      );
    } finally {
      process.env.HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finds agent-transcripts under Application Support global workspace paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-worktrees-cursor-global-ws-'));
    const workspace = join(root, 'Library', 'Application Support', 'ai-worktrees', 'global-workspaces', 'sess-1');
    const encoded = encodeCursorProjectPath(workspace);
    const transcriptDir = join(root, 'cursor-home', 'projects', encoded, 'agent-transcripts', 'chat-uuid');
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(join(transcriptDir, 'chat-uuid.jsonl'), '{"role":"user"}');

    const fakeHome = join(root, 'home');
    await mkdir(fakeHome, { recursive: true });
    const previousHome = process.env.HOME;
    process.env.HOME = fakeHome;
    await copyAgentPathSkippingSpecialFiles(
      join(root, 'cursor-home', 'projects'),
      join(fakeHome, '.cursor', 'projects'),
    );

    try {
      assert.equal(await cursorHasSavedSession(workspace), true);
    } finally {
      process.env.HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });
});
