import type { Terminal as Xterm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

function hostHasLayout(host: HTMLElement): boolean {
  if (host.clientWidth <= 0 || host.clientHeight <= 0) return false;
  let node: HTMLElement | null = host;
  while (node) {
    if (node.clientHeight <= 0) return false;
    node = node.parentElement;
  }
  return true;
}

/** Wait until the terminal host has measurable layout before fitting or starting the PTY. */
export function waitForTerminalLayout(host: HTMLElement, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let observer: ResizeObserver | undefined;

    const done = () => {
      observer?.disconnect();
      resolve();
    };

    const attempt = () => {
      if (hostHasLayout(host)) {
        done();
        return;
      }
      if (Date.now() >= deadline) {
        done();
        return;
      }
      requestAnimationFrame(attempt);
    };

    observer = new ResizeObserver(() => {
      if (hostHasLayout(host)) done();
    });
    observer.observe(host);
    let node: HTMLElement | null = host.parentElement;
    while (node) {
      observer.observe(node);
      node = node.parentElement;
    }

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
  shouldFocus = true,
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

  if (!shouldFocus) return () => {};

  const timer = window.setTimeout(() => {
    if (!term.options.disableStdin) term.focus();
  }, focusDelayMs);
  return () => window.clearTimeout(timer);
}
