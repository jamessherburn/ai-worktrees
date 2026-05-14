import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from '@shared/types';
import { JsonStore } from './store.js';

const DEFAULTS: Settings = {
  codeDir: join(homedir(), 'code'),
  theme: 'system',
};

const store = new JsonStore<Settings>('settings.json', DEFAULTS);

export async function getSettings(): Promise<Settings> {
  return store.read();
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return store.update((current) => ({ ...current, ...patch }));
}
