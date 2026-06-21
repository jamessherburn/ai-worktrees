export type BottomDockPanelId = 'terminal' | 'git';

const SPLITS_KEY = 'bottom-dock-panel-weights';
const DIVIDER_WIDTH = 5;

export function bottomDockDividerWidth(): number {
  return DIVIDER_WIDTH;
}

export function loadPanelWeights(ids: BottomDockPanelId[]): number[] {
  if (ids.length === 0) return [];
  let stored: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(SPLITS_KEY);
    if (raw) stored = JSON.parse(raw) as Record<string, number>;
  } catch {
    stored = {};
  }

  const legacyDev = Number(localStorage.getItem('git-panel-width'));
  if (Number.isFinite(legacyDev) && legacyDev > 0 && stored.git === undefined && stored.developer === undefined) {
    stored.git = legacyDev / 380;
  }
  if (stored.developer !== undefined && stored.git === undefined) {
    stored.git = stored.developer;
  }

  const weights = ids.map((id) => {
    const w = stored[id];
    return Number.isFinite(w) && w > 0 ? w : 1;
  });
  return weights;
}

export function savePanelWeights(ids: BottomDockPanelId[], weights: number[]): void {
  let stored: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(SPLITS_KEY);
    if (raw) stored = JSON.parse(raw) as Record<string, number>;
  } catch {
    stored = {};
  }
  ids.forEach((id, i) => {
    stored[id] = weights[i];
  });
  localStorage.setItem(SPLITS_KEY, JSON.stringify(stored));
}

export function pixelWidthsFromWeights(
  totalWidth: number,
  weights: number[],
  minWidths: number[],
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [Math.max(minWidths[0] ?? 0, totalWidth)];

  const dividers = (n - 1) * DIVIDER_WIDTH;
  const available = Math.max(0, totalWidth - dividers);
  const sum = weights.reduce((a, b) => a + b, 0) || n;
  let widths = weights.map((w, i) =>
    Math.max(minWidths[i] ?? 120, (w / sum) * available),
  );

  const used = widths.reduce((a, b) => a + b, 0);
  if (used > available) {
    const scale = available / used;
    widths = widths.map((w) => w * scale);
  } else if (used < available) {
    widths[widths.length - 1] += available - used;
  }

  return widths;
}

export function adjustAdjacentWidths(
  widths: number[],
  index: number,
  delta: number,
  minWidths: number[],
): number[] {
  if (index < 0 || index >= widths.length - 1) return widths;
  const next = [...widths];
  const minLeft = minWidths[index] ?? 120;
  const minRight = minWidths[index + 1] ?? 120;
  const growLeft = next[index + 1] - minRight;
  const shrinkLeft = next[index] - minLeft;
  const clamped = Math.max(-shrinkLeft, Math.min(growLeft, delta));
  next[index] += clamped;
  next[index + 1] -= clamped;
  return next;
}
