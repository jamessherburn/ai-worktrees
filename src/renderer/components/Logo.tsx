export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="app-logo"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AI Worktrees"
    >
      <title>AI Worktrees</title>
      <defs>
        <clipPath id="wuiSquircle">
          <rect x="0" y="0" width="1024" height="1024" rx="228" ry="228" />
        </clipPath>
      </defs>
      <g clipPath="url(#wuiSquircle)">
        <rect width="1024" height="1024" fill="#1F1438" />
        <g fill="#9F84EB">
          <circle cx="512" cy="430" r="220" />
          <circle cx="360" cy="410" r="135" />
          <circle cx="664" cy="410" r="135" />
          <circle cx="430" cy="270" r="115" />
          <circle cx="594" cy="270" r="115" />
          <circle cx="512" cy="200" r="95" />
        </g>
        <rect x="472" y="610" width="80" height="240" rx="16" fill="#9F84EB" />
      </g>
    </svg>
  );
}
