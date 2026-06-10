import appIconUrl from '../../../build/icon-source-1024.png';

//  This  is  comment   

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <img
      className="app-logo"
      src={appIconUrl}
      width={size}
      height={size}
      alt="AI Worktrees"
      draggable={false}
    />
  );
}
