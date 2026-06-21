import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorktreesSkill } from './types';
import {
  cloneDefaultWorktreesSkills,
  combineSkillPromptAndSuffix,
  formatSlashSkillDisplay,
  isCompleteSlashSkillReference,
  parseSlashSkillCommand,
  resolveSlashSkillSubmission,
  resolveWorktreesSkills,
} from './worktrees-skills';

const skills: WorktreesSkill[] = [
  { name: 'my-super-skill', prompt: 'Run the super skill.' },
  { name: 'Session recap', prompt: 'Summarize the session.' },
  { name: 'Review changes', prompt: 'Review the diff.' },
];

describe('combineSkillPromptAndSuffix', () => {
  it('joins prompt and suffix with a space', () => {
    assert.equal(
      combineSkillPromptAndSuffix('Run the super skill.', 'and some follow up'),
      'Run the super skill. and some follow up',
    );
  });

  it('returns prompt alone when suffix is empty', () => {
    assert.equal(combineSkillPromptAndSuffix('Run the super skill.', ''), 'Run the super skill.');
  });
});

describe('parseSlashSkillCommand', () => {
  it('parses an exact skill name', () => {
    assert.deepEqual(parseSlashSkillCommand('/my-super-skill', skills), {
      skill: skills[0],
      suffix: '',
    });
  });

  it('parses skill name with trailing text on one line', () => {
    assert.deepEqual(parseSlashSkillCommand('/my-super-skill and some follow up', skills), {
      skill: skills[0],
      suffix: 'and some follow up',
    });
  });

  it('parses multi-word skill names with trailing text', () => {
    assert.deepEqual(parseSlashSkillCommand('/Session recap please', skills), {
      skill: skills[1],
      suffix: 'please',
    });
  });

  it('resolves a unique partial prefix', () => {
    assert.deepEqual(parseSlashSkillCommand('/sess', skills), {
      skill: skills[1],
      suffix: '',
    });
  });
});

describe('formatSlashSkillDisplay', () => {
  it('shows slash name with trailing space', () => {
    assert.equal(formatSlashSkillDisplay(skills[0]), '/my-super-skill ');
  });

  it('shows slash name with suffix text', () => {
    assert.equal(
      formatSlashSkillDisplay(skills[0], 'and some follow up'),
      '/my-super-skill and some follow up',
    );
  });
});

describe('isCompleteSlashSkillReference', () => {
  it('is false for partial prefixes', () => {
    assert.equal(isCompleteSlashSkillReference('/sess', skills), false);
  });

  it('is true for a full skill name', () => {
    assert.equal(isCompleteSlashSkillReference('/my-super-skill', skills), true);
  });

  it('is true for a full skill name with suffix', () => {
    assert.equal(isCompleteSlashSkillReference('/my-super-skill and more', skills), true);
  });
});

describe('resolveSlashSkillSubmission', () => {
  it('expands slash display into prompt plus suffix', () => {
    assert.equal(
      resolveSlashSkillSubmission('/my-super-skill and some follow up', skills),
      'Run the super skill. and some follow up',
    );
  });
});

describe('resolveWorktreesSkills', () => {
  it('uses the new default skills when unset', () => {
    const defaults = cloneDefaultWorktreesSkills();
    assert.deepEqual(resolveWorktreesSkills(undefined), defaults);
    assert.equal(defaults.length, 2);
    assert.equal(defaults[0]?.name, 'Summarise Session');
    assert.equal(defaults[1]?.name, 'Create Pull Request');
  });
});
