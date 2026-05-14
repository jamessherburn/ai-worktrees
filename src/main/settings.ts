import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from '@shared/types';
import { DEFAULT_WIZARD_CONFIG, normalizeWizardConfig } from '@shared/wizard';
import { JsonStore } from './store.js';

const DEFAULTS: Settings = {
  codeDir: join(homedir(), 'code'),
  theme: 'system',
  wizard: DEFAULT_WIZARD_CONFIG,
};

const store = new JsonStore<Settings>('settings.json', DEFAULTS);

export async function getSettings(): Promise<Settings> {
  const s = await store.read();
  return { ...s, wizard: normalizeWizardConfig(s.wizard) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return store.update((current) => {
    const next: Settings = { ...current, ...patch };
    next.wizard = normalizeWizardConfig(next.wizard);
    return next;
  });
}
