import appIconDarkUrl from '../../../build/icon-source-1024.png';
import appIconLightUrl from '../../../build/icon-source-1024-light.png';
import type { ResolvedTheme } from '../theme';

export function Logo({ size = 28, theme }: { size?: number; theme: ResolvedTheme }) {
  return (
    <img
      className="app-logo"
      src={theme === 'light' ? appIconLightUrl : appIconDarkUrl}
      width={size}
      height={size}
      alt="AI Worktrees"
      draggable={false}
    />
  );
}
