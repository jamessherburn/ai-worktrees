import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Settings } from './types';
import {
  parseSettingsImport,
  parseSettingsImportJson,
  settingsExportToJson,
  settingsToExportDocument,
} from './settings-import-export';

const sampleSettings: Settings = {
  codeDir: '/Users/me/code',
  theme: 'dark',
  sessionLabels: [{ id: 'focus', name: 'Focus', color: '#007acc' }],
  worktreesSkills: [
    {
      name: 'Summarise Session',
      description: 'Recap the session',
      prompt: 'Please summarise everything we have done so far in this session.',
    },
    {
      name: 'Create Pull Request',
      prompt:
        'Please can you create a pull request for the changes we have made here. The title should be short and clear. The description should include 3 key sections: TLDR, Before/After and Commit History.',
    },
  ],
};

describe('settings import/export', () => {
  it('exports worktreesSkills in the settings document', () => {
    const doc = settingsToExportDocument(sampleSettings);
    assert.equal(doc.settings.worktreesSkills?.length, 2);
    assert.equal(doc.settings.worktreesSkills?.[0]?.name, 'Summarise Session');
  });

  it('round-trips settings including skills through JSON', () => {
    const json = settingsExportToJson(sampleSettings);
    const parsed = parseSettingsImportJson(json);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.codeDir, sampleSettings.codeDir);
    assert.equal(parsed.value.theme, 'dark');
    assert.equal(parsed.value.worktreesSkills?.length, 2);
    assert.equal(parsed.value.worktreesSkills?.[1]?.name, 'Create Pull Request');
  });

  it('imports wrapped export documents', () => {
    const wrapped = settingsToExportDocument(sampleSettings);
    const parsed = parseSettingsImport(wrapped);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.worktreesSkills?.[0]?.prompt, sampleSettings.worktreesSkills?.[0]?.prompt);
  });

  it('allows imports without worktreesSkills', () => {
    const parsed = parseSettingsImport({
      codeDir: '/Users/me/code',
      theme: 'system',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.worktreesSkills, undefined);
  });
});
