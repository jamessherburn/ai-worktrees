import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionPromptPreset } from '@shared/types';

const VISIBLE_COUNT = 10;

type FlyoutAnchor = {
  index: number;
  left: number;
  bottom: number;
  minWidth: number;
};

type Props = {
  prompts: SessionPromptPreset[];
  disabled?: boolean;
  onRun: (text: string) => void;
};

export function SessionPromptDock({ prompts, disabled = false, onRun }: Props) {
  const [windowStart, setWindowStart] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [flyoutAnchor, setFlyoutAnchor] = useState<FlyoutAnchor | null>(null);
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());
  const clearHoverTimerRef = useRef<number | undefined>();

  const maxWindowStart = Math.max(0, prompts.length - VISIBLE_COUNT);
  const canGoPrev = windowStart > 0;
  const canGoNext = windowStart < maxWindowStart;
  const visiblePrompts = prompts.slice(windowStart, windowStart + VISIBLE_COUNT);

  useEffect(() => {
    setWindowStart((start) => Math.min(start, maxWindowStart));
  }, [maxWindowStart]);

  const run = useCallback(
    (text: string) => {
      if (disabled || !text.trim()) return;
      setHoveredIndex(null);
      setFlyoutAnchor(null);
      onRun(text);
    },
    [disabled, onRun],
  );

  const clearHover = useCallback(() => {
    setHoveredIndex(null);
    setFlyoutAnchor(null);
  }, []);

  const scheduleClearHover = useCallback(() => {
    if (clearHoverTimerRef.current !== undefined) {
      window.clearTimeout(clearHoverTimerRef.current);
    }
    clearHoverTimerRef.current = window.setTimeout(() => {
      clearHoverTimerRef.current = undefined;
      clearHover();
    }, 120);
  }, [clearHover]);

  const cancelClearHover = useCallback(() => {
    if (clearHoverTimerRef.current !== undefined) {
      window.clearTimeout(clearHoverTimerRef.current);
      clearHoverTimerRef.current = undefined;
    }
  }, []);

  const setChipRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    if (el) chipRefs.current.set(index, el);
    else chipRefs.current.delete(index);
  }, []);

  const updateFlyoutAnchor = useCallback((index: number) => {
    const el = chipRefs.current.get(index);
    if (!el) {
      setFlyoutAnchor(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setFlyoutAnchor({
      index,
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + 6,
      minWidth: Math.max(rect.width, 140),
    });
  }, []);

  const hoverParent = useCallback(
    (index: number) => {
      if (disabled) return;
      cancelClearHover();
      setHoveredIndex(index);
      updateFlyoutAnchor(index);
    },
    [disabled, updateFlyoutAnchor, cancelClearHover],
  );

  const shiftWindow = useCallback(
    (delta: number) => {
      clearHover();
      setWindowStart((start) => Math.min(maxWindowStart, Math.max(0, start + delta)));
    },
    [maxWindowStart, clearHover],
  );

  useLayoutEffect(() => {
    return () => {
      if (clearHoverTimerRef.current !== undefined) {
        window.clearTimeout(clearHoverTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (hoveredIndex === null) return;
    const preset = prompts[hoveredIndex];
    if (!preset?.children?.length) {
      setFlyoutAnchor(null);
      return;
    }
    updateFlyoutAnchor(hoveredIndex);

    const onLayoutChange = () => updateFlyoutAnchor(hoveredIndex);
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    return () => {
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [hoveredIndex, prompts, updateFlyoutAnchor]);

  if (prompts.length === 0) return null;

  const hoveredPreset = hoveredIndex !== null ? prompts[hoveredIndex] : null;
  const hoveredChildren = hoveredPreset?.children ?? [];
  const showFlyout =
    !disabled && hoveredIndex !== null && hoveredChildren.length > 0 && flyoutAnchor !== null;

  const showNav = prompts.length > VISIBLE_COUNT;

  return (
    <div className="session-prompt-dock-shell">
      {showNav && (
        <button
          type="button"
          className="session-prompt-dock-nav"
          onClick={() => shiftWindow(-1)}
          disabled={disabled || !canGoPrev}
          aria-label="Show earlier quick prompts"
          title="Earlier prompts"
        >
          <ChevronLeftIcon />
        </button>
      )}

      <div className="session-prompt-dock" role="toolbar" aria-label="Quick prompts">
        {visiblePrompts.map((preset, offset) => {
          const index = windowStart + offset;
          const children = preset.children ?? [];
          const hasChildren = children.length > 0;

          return (
            <div
              key={`${preset.title}-${index}`}
              className={`session-prompt-dock-item${hasChildren ? ' session-prompt-dock-item--parent' : ''}`}
              onMouseEnter={() => {
                if (hasChildren) hoverParent(index);
              }}
              onMouseLeave={() => {
                if (hasChildren) scheduleClearHover();
              }}
            >
              <button
                ref={(el) => setChipRef(index, el)}
                type="button"
                className={`session-prompt-dock-chip${hasChildren ? ' session-prompt-dock-chip--parent' : ''}`}
                disabled={disabled || (!hasChildren && !preset.text.trim())}
                title={
                  hasChildren
                    ? preset.text.trim()
                      ? `${preset.title} — hover for more; click to run parent prompt`
                      : `${preset.title} — hover for child prompts`
                    : preset.text
                }
                aria-haspopup={hasChildren ? 'menu' : undefined}
                aria-expanded={showFlyout && flyoutAnchor?.index === index ? true : undefined}
                onClick={() => {
                  if (preset.text.trim()) run(preset.text);
                }}
              >
                {preset.title}
                {hasChildren && <ChevronUpIcon />}
              </button>
            </div>
          );
        })}
      </div>

      {showNav && (
        <button
          type="button"
          className="session-prompt-dock-nav"
          onClick={() => shiftWindow(1)}
          disabled={disabled || !canGoNext}
          aria-label="Show later quick prompts"
          title="Later prompts"
        >
          <ChevronRightIcon />
        </button>
      )}

      {showFlyout &&
        flyoutAnchor &&
        createPortal(
          <div
            className="session-prompt-dock-flyout"
            role="group"
            aria-label={`${hoveredPreset?.title ?? ''} prompts`}
            style={{
              position: 'fixed',
              left: flyoutAnchor.left,
              bottom: flyoutAnchor.bottom,
              minWidth: flyoutAnchor.minWidth,
              transform: 'translateX(-50%)',
            }}
            onMouseEnter={() => hoverParent(flyoutAnchor.index)}
            onMouseLeave={scheduleClearHover}
          >
            {hoveredChildren.map((child, childIndex) => (
              <button
                key={`${child.title}-${childIndex}`}
                type="button"
                className="session-prompt-dock-flyout-item"
                title={child.text}
                onClick={() => run(child.text)}
              >
                {child.title}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
