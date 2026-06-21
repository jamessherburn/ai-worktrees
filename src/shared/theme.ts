import type { ThemePreference } from './types';

export type ResolvedTheme = 'dark' | 'light' | 'monokai';

export function resolveThemePreference(
  pref: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (pref === 'dark' || pref === 'light' || pref === 'monokai') return pref;
  return systemPrefersLight ? 'light' : 'dark';
}

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
