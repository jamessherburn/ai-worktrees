import type { Terminal as Xterm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/** Wait until the terminal host has measurable layout before fitting or starting the PTY. */
export function waitForTerminalLayout(host: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const attempt = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        resolve();
        return;
      }
      requestAnimationFrame(attempt);
    };
    attempt();
  });
}

/** Keep xterm focus and stdin aligned with whether the user can interact with this terminal. */
export function syncTerminalInteractive(
  term: Xterm,
  fit: FitAddon | null,
  active: boolean,
  resize: (cols: number, rows: number) => void,
  focusDelayMs = 50,
  afterSync?: () => void,
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
  if (term.cols > 0 && term.rows > 0) {
    resize(term.cols, term.rows);
  }
  afterSync?.();

  const timer = window.setTimeout(() => {
    if (!term.options.disableStdin) term.focus();
  }, focusDelayMs);
  return () => window.clearTimeout(timer);
}
