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

function iconFileName(resolved: ResolvedTheme): string {
  return resolved === 'light' ? 'icon-light.icns' : 'icon.icns';
}

function resolveIconPath(resolved: ResolvedTheme): string {
  const fileName = iconFileName(resolved);
  if (app.isPackaged) {
    return join(process.resourcesPath, fileName);
  }
  return join(app.getAppPath(), 'build', fileName);
}

export function applyAppTheme(pref: ThemePreference, opts?: { reloadWindows?: boolean }): void {
  nativeTheme.themeSource = nativeThemeSource(pref);
  const resolved = resolveTheme(pref);
  const backgroundColor = windowBackgroundColor(pref, !nativeTheme.shouldUseDarkColors);

  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(backgroundColor);
  }

  if (process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(resolveIconPath(resolved));
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
    }
  }

  if (opts?.reloadWindows) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload();
    }
  }
}
