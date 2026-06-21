import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings, ThemePreference } from '@shared/types';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from '@shared/session-labels';
import { normalizeWorktreesSkills } from '@shared/worktrees-skills';
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
  sessionPrompts?: { title?: string; text?: string; children?: { title?: string; text?: string }[] }[];
};

function normalizeTheme(theme: unknown): ThemePreference {
  if (theme === 'system' || theme === 'dark' || theme === 'light') return theme;
  if (theme === 'monokai') return 'dark';
  return 'system';
}

function normalizeSettings(s: StoredSettings): Settings {
  const {
    recapPrompt: _legacy,
    wizard: _wizard,
    tasks: _tasks,
    sessionPrompts: _sessionPrompts,
    ...rest
  } = s;
  return {
    ...rest,
    theme: normalizeTheme(s.theme),
    sessionLabels: normalizeSessionLabels(s.sessionLabels),
    worktreesSkills: normalizeWorktreesSkills(s.worktreesSkills),
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
