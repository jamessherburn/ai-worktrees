import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_NVIM_CONFIG, normalizeNvimConfig } from '@shared/nvim-config';
import { NVIM_THEME_LUA_MODULE, NVIM_THEME_MODULE_FILENAME } from '@shared/nvim-theme';
import { getSettings, updateSettings } from './settings.js';

export function nvimConfigDir(): string {
  return join(app.getPath('userData'), 'nvim-config');
}

export function nvimDataDir(): string {
  return join(app.getPath('userData'), 'nvim-data');
}

export function nvimInitPath(): string {
  return join(nvimConfigDir(), 'init.lua');
}

export function nvimThemeModulePath(): string {
  return join(nvimConfigDir(), NVIM_THEME_MODULE_FILENAME);
}

export async function writeNvimThemeModule(): Promise<void> {
  const dir = nvimConfigDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(nvimThemeModulePath(), NVIM_THEME_LUA_MODULE, 'utf-8');
}

export async function writeNvimConfig(content?: string): Promise<string> {
  const settings = await getSettings();
  const source = content ?? settings.nvimConfig;
  const normalized = normalizeNvimConfig(source);
  const dir = nvimConfigDir();
  await fs.mkdir(dir, { recursive: true });
  await writeNvimThemeModule();
  await fs.writeFile(nvimInitPath(), normalized, 'utf-8');
  if (content === undefined && source !== normalized) {
    await updateSettings({ nvimConfig: normalized });
  }
  return normalized;
}

export async function ensureNvimConfig(): Promise<string> {
  try {
    await fs.stat(nvimInitPath());
    return await writeNvimConfig();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return writeNvimConfig(DEFAULT_NVIM_CONFIG);
    }
    throw err;
  }
}
