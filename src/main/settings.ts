import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from '@shared/types';
import { DEFAULT_SESSION_PROMPTS, resolveSessionPrompts } from '@shared/session-prompts';
import { DEFAULT_TASKS_CONFIG, normalizeTasksConfig } from '@shared/tasks';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from '@shared/session-labels';
import { DEFAULT_NVIM_CONFIG, normalizeNvimConfig } from '@shared/nvim-config';
import { DEFAULT_WIZARD_CONFIG, normalizeWizardConfig } from '@shared/wizard';
import { JsonStore } from './store.js';

const DEFAULTS: Settings = {
  codeDir: join(homedir(), 'code'),
  theme: 'system',
  wizard: DEFAULT_WIZARD_CONFIG,
  tasks: DEFAULT_TASKS_CONFIG,
  sessionPrompts: DEFAULT_SESSION_PROMPTS,
  sessionLabels: DEFAULT_SESSION_LABELS,
  nvimConfig: DEFAULT_NVIM_CONFIG,
};

const store = new JsonStore<Settings>('settings.json', DEFAULTS);

type StoredSettings = Settings & { recapPrompt?: string };

function normalizeSettings(s: StoredSettings): Settings {
  const { recapPrompt: _legacy, ...rest } = s;
  return {
    ...rest,
    wizard: normalizeWizardConfig(s.wizard),
    tasks: normalizeTasksConfig(s.tasks),
    sessionPrompts: resolveSessionPrompts(s.sessionPrompts, s.recapPrompt),
    sessionLabels: normalizeSessionLabels(s.sessionLabels),
    nvimConfig: normalizeNvimConfig(s.nvimConfig),
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

export async function replaceSettings(settings: Settings): Promise<Settings> {
  const normalized = normalizeSettings(settings as StoredSettings);
  await store.write(normalized);
  return normalized;
}
