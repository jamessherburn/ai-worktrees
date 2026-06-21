import type { ThemePreference } from './types';

export type ResolvedTheme = 'dark' | 'light';

export function resolveThemePreference(
  pref: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (pref === 'dark' || pref === 'light') return pref;
  return systemPrefersLight ? 'light' : 'dark';
}

export type NativeThemeSource = 'system' | 'light' | 'dark';

/** Maps app theme preferences to Electron `nativeTheme.themeSource` values. */
export function nativeThemeSource(pref: ThemePreference): NativeThemeSource {
  return pref;
}

export function windowBackgroundColor(
  pref: ThemePreference,
  systemPrefersLight = false,
): string {
  const resolved = resolveThemePreference(pref, systemPrefersLight);
  return resolved === 'light' ? '#F3F3F3' : '#141414';
}
