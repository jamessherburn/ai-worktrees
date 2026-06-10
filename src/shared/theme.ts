import type { ThemePreference } from './types';

export type { ResolvedTheme } from './nvim-theme';
export { resolveThemePreference } from './nvim-theme';

export type NativeThemeSource = 'system' | 'light' | 'dark';

/** Maps app theme preferences to Electron `nativeTheme.themeSource` values. */
export function nativeThemeSource(pref: ThemePreference): NativeThemeSource {
  return pref === 'monokai' ? 'dark' : pref;
}

export function windowBackgroundColor(pref: ThemePreference): string {
  if (pref === 'light') return '#F3F3F3';
  if (pref === 'monokai') return '#272822';
  return '#141414';
}
