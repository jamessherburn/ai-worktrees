import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from '@shared/types';
import { DEFAULT_SESSION_PROMPTS, normalizeSessionPrompts } from '@shared/session-prompts';
import { DEFAULT_TASKS_CONFIG, normalizeTasksConfig } from '@shared/tasks';
import { DEFAULT_WIZARD_CONFIG, normalizeWizardConfig } from '@shared/wizard';
import { JsonStore } from './store.js';

const DEFAULTS: Settings = {
  codeDir: join(homedir(), 'code'),
  theme: 'system',
  wizard: DEFAULT_WIZARD_CONFIG,
  tasks: DEFAULT_TASKS_CONFIG,
  sessionPrompts: DEFAULT_SESSION_PROMPTS,
};

const store = new JsonStore<Settings>('settings.json', DEFAULTS);

function normalizeSettings(s: Settings): Settings {
  return {
    ...s,
    wizard: normalizeWizardConfig(s.wizard),
    tasks: normalizeTasksConfig(s.tasks),
    sessionPrompts: normalizeSessionPrompts(s.sessionPrompts),
  };
}

export async function getSettings(): Promise<Settings> {
  const s = await store.read();
  return normalizeSettings(s);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return store.update((current) => {
    const next: Settings = { ...current, ...patch };
    return normalizeSettings(next);
  });
}
