import { useEffect, useState } from 'react';
import type { ThemePreference } from '@shared/types';
import { resolveThemePreference, type ResolvedTheme } from '@shared/theme';

export type { ResolvedTheme };

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return resolveThemePreference(pref, window.matchMedia('(prefers-color-scheme: light)').matches);
}

export function useResolvedTheme(pref: ThemePreference): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(pref));

  useEffect(() => {
    setResolved(resolveTheme(pref));
    if (pref !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setResolved(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return resolved;
}
