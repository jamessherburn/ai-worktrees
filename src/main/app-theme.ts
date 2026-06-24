import { BrowserWindow, nativeTheme } from 'electron';
import { nativeThemeSource, windowBackgroundColor } from '@shared/theme';
import type { ThemePreference } from '@shared/types';

export function applyAppTheme(pref: ThemePreference): void {
  nativeTheme.themeSource = nativeThemeSource(pref);
  const backgroundColor = windowBackgroundColor(pref, !nativeTheme.shouldUseDarkColors);

  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(backgroundColor);
  }
}
