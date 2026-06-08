import type { Terminal as Xterm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/** Keep xterm focus and stdin aligned with whether the user can interact with this terminal. */
export function syncTerminalInteractive(
  term: Xterm,
  fit: FitAddon | null,
  active: boolean,
  resize: (cols: number, rows: number) => void,
  focusDelayMs = 50,
): () => void {
  term.options.disableStdin = !active;
  if (!active) {
    term.blur();
    return () => {};
  }

  try {
    fit?.fit();
  } catch {
    // layout not stable yet
  }
  resize(term.cols, term.rows);

  const timer = window.setTimeout(() => {
    if (!term.options.disableStdin) term.focus();
  }, focusDelayMs);
  return () => window.clearTimeout(timer);
}
