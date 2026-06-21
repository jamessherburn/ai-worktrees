import type { SessionLabel, Settings, ThemePreference } from './types';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from './session-labels';

export const SETTINGS_EXPORT_VERSION = 1;

export type SettingsExportDocument = {
  version: typeof SETTINGS_EXPORT_VERSION;
  app: 'ai-worktrees';
  exportedAt: string;
  settings: Settings;
};

export type SettingsExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

export type SettingsImportResult =
  | { ok: true; settings: Settings }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

const THEME_OPTIONS: ThemePreference[] = ['system', 'dark', 'light', 'monokai'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function settingsToExportDocument(settings: Settings): SettingsExportDocument {
  return {
    version: SETTINGS_EXPORT_VERSION,
    app: 'ai-worktrees',
    exportedAt: new Date().toISOString(),
    settings,
  };
}

export function settingsExportToJson(settings: Settings): string {
  return JSON.stringify(settingsToExportDocument(settings), null, 2);
}

export function parseSettingsImport(raw: unknown): { ok: true; value: Settings } | { ok: false; error: string } {
  let candidate: unknown = raw;

  if (isRecord(raw) && isRecord(raw.settings)) {
    candidate = raw.settings;
  }

  if (!isRecord(candidate)) {
    return { ok: false, error: 'Settings must be a JSON object.' };
  }

  const codeDir = candidate.codeDir;
  if (typeof codeDir !== 'string' || !codeDir.trim()) {
    return { ok: false, error: 'codeDir must be a non-empty string.' };
  }

  const theme = candidate.theme;
  if (typeof theme !== 'string' || !THEME_OPTIONS.includes(theme as ThemePreference)) {
    return { ok: false, error: 'theme must be system, dark, light, or monokai.' };
  }

  return {
    ok: true,
    value: {
      codeDir: codeDir.trim(),
      theme: theme as ThemePreference,
      sessionLabels: normalizeSessionLabels(
        (candidate.sessionLabels as SessionLabel[] | undefined) ?? DEFAULT_SESSION_LABELS,
      ),
    },
  };
}

export function parseSettingsImportJson(
  json: string,
): { ok: true; value: Settings } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON.' };
  }
  return parseSettingsImport(parsed);
}
