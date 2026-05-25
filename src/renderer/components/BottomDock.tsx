import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adjustAdjacentWidths,
  bottomDockDividerWidth,
  loadPanelWeights,
  pixelWidthsFromWeights,
  savePanelWeights,
  type BottomDockPanelId,
} from '../bottom-dock-splits';

export type BottomDockPanelSpec = {
  id: BottomDockPanelId;
  minWidth: number;
  content: React.ReactNode;
};

type Props = {
  height: number;
  panels: BottomDockPanelSpec[];
  onResizeHeight: (height: number) => void;
  onResizeHeightEnd: (height: number) => void;
  getMaxHeight: () => number;
  minHeight: number;
};

export function BottomDock({
  height,
  panels,
  onResizeHeight,
  onResizeHeightEnd,
  getMaxHeight,
  minHeight,
}: Props) {
  const visible = panels;
  const ids = useMemo(() => visible.map((p) => p.id), [visible]);
  const minWidths = useMemo(() => visible.map((p) => p.minWidth), [visible]);
  const idsKey = ids.join(',');

  const panelsRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [weights, setWeights] = useState<number[]>(() => loadPanelWeights(ids));

  useEffect(() => {
    setWeights(loadPanelWeights(ids));
  }, [idsKey]);

  useEffect(() => {
    const el = panelsRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(w);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [visible.length]);

  const pixelWidths = useMemo(
    () => pixelWidthsFromWeights(containerWidth, weights, minWidths),
    [containerWidth, weights, minWidths],
  );

  const persistWeights = useCallback(
    (widths: number[]) => {
      if (widths.length === 0) return;
      const sum = widths.reduce((a, b) => a + b, 0) || 1;
      const nextWeights = widths.map((w) => w / sum);
      setWeights(nextWeights);
      savePanelWeights(ids, nextWeights);
    },
    [ids],
  );

  const onDividerMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidths = pixelWidthsFromWeights(containerWidth, weights, minWidths);
    document.body.classList.add('resizing-bottom-dock-split');

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      persistWeights(adjustAdjacentWidths(startWidths, index, delta, minWidths));
    };

    const onUp = (ev: MouseEvent) => {
      document.body.classList.remove('resizing-bottom-dock-split');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const delta = ev.clientX - startX;
      persistWeights(adjustAdjacentWidths(startWidths, index, delta, minWidths));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onResizeHeightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    document.body.classList.add('resizing-bottom-dock');

    const clamp = (raw: number) => Math.min(getMaxHeight(), Math.max(minHeight, raw));

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      onResizeHeight(clamp(startHeight + delta));
    };

    const onUp = (ev: MouseEvent) => {
      document.body.classList.remove('resizing-bottom-dock');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const delta = startY - ev.clientY;
      onResizeHeightEnd(clamp(startHeight + delta));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const dividerW = bottomDockDividerWidth();

  return (
    <div className="bottom-dock" style={{ height }}>
      <div
        className="bottom-dock-resize"
        onMouseDown={onResizeHeightMouseDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
      />
      <div className="bottom-dock-panels" ref={panelsRef}>
        {visible.map((panel, i) => (
          <Fragment key={panel.id}>
            {i > 0 && (
              <div
                className="bottom-dock-divider"
                style={{ width: dividerW, flexShrink: 0 }}
                onMouseDown={onDividerMouseDown(i - 1)}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize between panels"
              />
            )}
            <div
              className="bottom-dock-slot"
              style={{
                width: pixelWidths[i],
                flexShrink: 0,
                minWidth: panel.minWidth,
              }}
            >
              {panel.content}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
