import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from '@shared/types';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from '@shared/session-labels';
import { JsonStore } from './store.js';

const DEFAULTS: Settings = {
  codeDir: join(homedir(), 'code'),
  theme: 'system',
  sessionLabels: DEFAULT_SESSION_LABELS,
};

const store = new JsonStore<Settings>('settings.json', DEFAULTS);

type StoredSettings = Settings & {
  recapPrompt?: string;
  wizard?: unknown;
  tasks?: unknown;
  sessionPrompts?: unknown;
};

function normalizeSettings(s: StoredSettings): Settings {
  const {
    recapPrompt: _legacy,
    wizard: _wizard,
    tasks: _tasks,
    sessionPrompts: _prompts,
    ...rest
  } = s;
  return {
    ...rest,
    sessionLabels: normalizeSessionLabels(s.sessionLabels),
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
