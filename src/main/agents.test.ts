import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgentId } from '@shared/agents';
import { AGENT_LAUNCH_SPECS, composeLaunchCommand } from './agents.js';

const AGENT_IDS: AgentId[] = ['claude', 'cursor', 'codex', 'gemini'];

describe('composeLaunchCommand', () => {
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

  it('never uses session.lastStartedAt semantics (resume gated by canResume only)', () => {
    for (const agentId of AGENT_IDS) {
      const withoutHistory = composeLaunchCommand(agentId, false).shellCommand;
      assert.equal(withoutHistory, AGENT_LAUNCH_SPECS[agentId].binary);
      assert.doesNotMatch(withoutHistory, /resume|continue/);
    }
  });
});
