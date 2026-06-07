export type PanelId = 'agent' | 'shell' | 'git';

export const PANEL_IDS: PanelId[] = ['agent', 'shell', 'git'];

export type GridRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SnapZoneId =
  | 'full'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export const GRID_COLS = 12;
export const GRID_ROWS = 8;
/** Visual gap between adjacent panel windows (applied in positioning math). */
export const GRID_GAP_PX = 12;

export const SNAP_ZONES: Record<SnapZoneId, GridRect> = {
  full: { x: 0, y: 0, w: GRID_COLS, h: GRID_ROWS },
  left: { x: 0, y: 0, w: GRID_COLS / 2, h: GRID_ROWS },
  right: { x: GRID_COLS / 2, y: 0, w: GRID_COLS / 2, h: GRID_ROWS },
  top: { x: 0, y: 0, w: GRID_COLS, h: GRID_ROWS / 2 },
  bottom: { x: 0, y: GRID_ROWS / 2, w: GRID_COLS, h: GRID_ROWS / 2 },
  'top-left': { x: 0, y: 0, w: GRID_COLS / 2, h: GRID_ROWS / 2 },
  'top-right': { x: GRID_COLS / 2, y: 0, w: GRID_COLS / 2, h: GRID_ROWS / 2 },
  'bottom-left': { x: 0, y: GRID_ROWS / 2, w: GRID_COLS / 2, h: GRID_ROWS / 2 },
  'bottom-right': { x: GRID_COLS / 2, y: GRID_ROWS / 2, w: GRID_COLS / 2, h: GRID_ROWS / 2 },
};

export type PanelLayout = Partial<Record<PanelId, GridRect | null>>;

const DEFAULT_LAYOUTS: Record<string, PanelLayout> = {
  agent: { agent: SNAP_ZONES.full },
  'agent,shell': { agent: SNAP_ZONES.left, shell: SNAP_ZONES.right },
  'agent,git': { agent: SNAP_ZONES.left, git: SNAP_ZONES.right },
  'agent,shell,git': {
    agent: SNAP_ZONES.left,
    shell: SNAP_ZONES['top-right'],
    git: SNAP_ZONES['bottom-right'],
  },
  shell: { shell: SNAP_ZONES.full },
  git: { git: SNAP_ZONES.full },
  'shell,git': { shell: SNAP_ZONES.left, git: SNAP_ZONES.right },
};

function layoutKey(visible: PanelId[]): string {
  return [...visible].sort().join(',');
}

export function defaultLayoutFor(visible: PanelId[]): PanelLayout {
  const key = layoutKey(visible);
  if (DEFAULT_LAYOUTS[key]) return { ...DEFAULT_LAYOUTS[key] };
  const layout: PanelLayout = {};
  if (visible.length === 1) {
    layout[visible[0]] = SNAP_ZONES.full;
    return layout;
  }
  if (visible.length === 2) {
    layout[visible[0]] = SNAP_ZONES.left;
    layout[visible[1]] = SNAP_ZONES.right;
    return layout;
  }
  layout.agent = SNAP_ZONES.left;
  layout.shell = SNAP_ZONES['top-right'];
  layout.git = SNAP_ZONES['bottom-right'];
  return layout;
}

export function snapZoneAt(nx: number, ny: number): SnapZoneId {
  const cornerX = nx < 0.25 ? 'l' : nx > 0.75 ? 'r' : '';
  const cornerY = ny < 0.25 ? 't' : ny > 0.75 ? 'b' : '';
  if (cornerX === 'l' && cornerY === 't') return 'top-left';
  if (cornerX === 'r' && cornerY === 't') return 'top-right';
  if (cornerX === 'l' && cornerY === 'b') return 'bottom-left';
  if (cornerX === 'r' && cornerY === 'b') return 'bottom-right';
  if (nx < 0.33) return 'left';
  if (nx > 0.67) return 'right';
  if (ny < 0.33) return 'top';
  if (ny > 0.67) return 'bottom';
  return 'full';
}

export function rectToStyle(rect: GridRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const half = GRID_GAP_PX / 2;
  const leftPct = (rect.x / GRID_COLS) * 100;
  const topPct = (rect.y / GRID_ROWS) * 100;
  const widthPct = (rect.w / GRID_COLS) * 100;
  const heightPct = (rect.h / GRID_ROWS) * 100;
  return {
    left: `calc(${leftPct}% + ${half}px)`,
    top: `calc(${topPct}% + ${half}px)`,
    width: `calc(${widthPct}% - ${GRID_GAP_PX}px)`,
    height: `calc(${heightPct}% - ${GRID_GAP_PX}px)`,
  };
}

function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isFullscreen(rect: GridRect): boolean {
  return rect.w >= GRID_COLS && rect.h >= GRID_ROWS;
}

export function isLayoutValid(visible: PanelId[], layout: PanelLayout): boolean {
  const rects = visible.map((id) => layout[id]).filter((r): r is GridRect => Boolean(r && r.w > 0 && r.h > 0));
  if (rects.length !== visible.length) return false;
  if (visible.length > 1 && rects.some(isFullscreen)) return false;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
}

function readStoredLayout(sessionId: string): PanelLayout {
  try {
    const raw = localStorage.getItem(`flight-deck-layout-${sessionId}`);
    if (!raw) return {};
    return JSON.parse(raw) as PanelLayout;
  } catch {
    return {};
  }
}

export function resolveLayout(
  sessionId: string,
  visible: PanelId[],
  prefer?: PanelLayout,
): PanelLayout {
  const stored = readStoredLayout(sessionId);
  const defaults = defaultLayoutFor(visible);
  const candidate: PanelLayout = {};
  for (const id of visible) {
    candidate[id] = prefer?.[id] ?? stored[id] ?? defaults[id] ?? SNAP_ZONES.full;
  }
  if (isLayoutValid(visible, candidate)) return candidate;
  return defaultLayoutFor(visible);
}

export function loadPanelLayout(sessionId: string, visible: PanelId[]): PanelLayout {
  return resolveLayout(sessionId, visible);
}

export function persistPanelLayout(sessionId: string, layout: PanelLayout) {
  localStorage.setItem(`flight-deck-layout-${sessionId}`, JSON.stringify(layout));
}

export function loadVisiblePanels(): Set<PanelId> {
  try {
    const raw = localStorage.getItem('flight-deck-visible-panels');
    if (!raw) return new Set(['agent']);
    const parsed = JSON.parse(raw) as PanelId[];
    const set = new Set(parsed.filter((p) => PANEL_IDS.includes(p)));
    if (!set.has('agent')) set.add('agent');
    return set;
  } catch {
    return new Set(['agent']);
  }
}

export function persistVisiblePanels(panels: Set<PanelId>) {
  localStorage.setItem('flight-deck-visible-panels', JSON.stringify([...panels]));
}
