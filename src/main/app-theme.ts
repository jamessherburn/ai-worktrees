import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron';
import { join } from 'node:path';
import {
  nativeThemeSource,
  resolveThemePreference,
  windowBackgroundColor,
  type ResolvedTheme,
} from '@shared/theme';
import type { ThemePreference } from '@shared/types';

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return resolveThemePreference(pref, !nativeTheme.shouldUseDarkColors);
}

/** PNG sources — Electron cannot load .icns at runtime (see electron/electron#46514). */
function iconFileName(resolved: ResolvedTheme): string {
  return resolved === 'light' ? 'icon-source-1024-light.png' : 'icon-source-1024.png';
}

function resolveIconPath(resolved: ResolvedTheme): string {
  const fileName = iconFileName(resolved);
  if (app.isPackaged) {
    return join(process.resourcesPath, fileName);
  }
  return join(import.meta.dirname, '../../build', fileName);
}

function applyDockIcon(resolved: ResolvedTheme): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  const icon = nativeImage.createFromPath(resolveIconPath(resolved));
  if (!icon.isEmpty()) {
    app.dock.setIcon(icon);
  }
}

export function applyAppTheme(pref: ThemePreference): void {
  nativeTheme.themeSource = nativeThemeSource(pref);
  const resolved = resolveTheme(pref);
  const backgroundColor = windowBackgroundColor(pref, !nativeTheme.shouldUseDarkColors);

  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(backgroundColor);
  }

  applyDockIcon(resolved);
}
