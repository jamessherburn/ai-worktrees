export const MODAL_VIEWPORT_MARGIN = 24;
/** Matches `--titlebar-height` in global.css — keeps modals below macOS traffic lights. */
export const MODAL_TITLEBAR_HEIGHT = 42;

export type ModalSize = { width: number; height: number };

export function maxExpandedModalSize(): ModalSize {
  if (typeof window === 'undefined') {
    return { width: 800, height: 600 };
  }
  return {
    width: window.innerWidth - MODAL_VIEWPORT_MARGIN,
    height: window.innerHeight - MODAL_VIEWPORT_MARGIN - MODAL_TITLEBAR_HEIGHT,
  };
}

export function clampModalSize(
  width: number,
  height: number,
  minWidth: number,
  minHeight: number,
): ModalSize {
  const max = maxExpandedModalSize();
  return {
    width: Math.min(max.width, Math.max(minWidth, width)),
    height: Math.min(max.height, Math.max(minHeight, height)),
  };
}

export function isModalAtMaxSize(size: ModalSize, max: ModalSize = maxExpandedModalSize()): boolean {
  return size.width >= max.width - 1 && size.height >= max.height - 1;
}

export function isModalAtMaxHeight(size: ModalSize, max: ModalSize = maxExpandedModalSize()): boolean {
  return size.height >= max.height - 1;
}

export function shouldUseExpandedModalLayout(size: ModalSize, expanded: boolean): boolean {
  return expanded || isModalAtMaxHeight(size);
}
