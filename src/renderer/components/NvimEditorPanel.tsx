import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from '../terminal-theme';
import { syncTerminalInteractive, waitForTerminalLayout } from '../terminal-activation';
import type { ResolvedTheme } from '../theme';

type Props = {
  sessionId: string;
  themeName: ResolvedTheme;
  blurred: boolean;
  /** When false, the editor accepts input but does not steal focus on mount. */
  autoFocus?: boolean;
  /** Bumped when the panel container layout changes. */
  layoutRevision?: number;
  /** Delay PTY start so the agent terminal can claim focus and layout first. */
  startDelayMs?: number;
  onRegisterFocus?: (focus: (() => void) | null) => void;
};

export function NvimEditorPanel({
  sessionId,
  themeName,
  blurred,
  autoFocus = false,
  layoutRevision = 0,
  startDelayMs = 600,
  onRegisterFocus,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyReadyRef = useRef(false);
  const activationCleanupRef = useRef<(() => void) | null>(null);
  const blurredRef = useRef(blurred);
  const autoFocusRef = useRef(autoFocus);
  const onRegisterFocusRef = useRef(onRegisterFocus);
  blurredRef.current = blurred;
  autoFocusRef.current = autoFocus;
  onRegisterFocusRef.current = onRegisterFocus;

  const clearActivation = () => {
    activationCleanupRef.current?.();
    activationCleanupRef.current = null;
  };

  const applyTerminalActivation = (focusDelayMs = 50, afterSync?: () => void) => {
    const term = termRef.current;
    if (!term || !ptyReadyRef.current) return;
    clearActivation();
    activationCleanupRef.current = syncTerminalInteractive(
      term,
      fitRef.current,
      !blurredRef.current,
      (cols, rows) => window.api.nvimPty.resize(sessionId, cols, rows),
      focusDelayMs,
      afterSync,
      autoFocusRef.current,
    );
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Xterm({
      fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: getTerminalTheme(themeName),
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(host);

    onRegisterFocusRef.current?.(() => term.focus());

    termRef.current = term;
    fitRef.current = fitAddon;

    let cancelled = false;
    let pendingBacklogReplay = false;
    let unsubData: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let fitTimer: number | undefined;
    ptyReadyRef.current = false;

    const fitSafely = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      try {
        fitAddon.fit();
      } catch {
        // ignore: layout not stable
      }
    };

    const scheduleFit = () => {
      if (fitTimer !== undefined) window.clearTimeout(fitTimer);
      fitTimer = window.setTimeout(fitSafely, 32);
    };

    unsubData = window.api.nvimPty.onData(({ sessionId: id, data }) => {
      if (id !== sessionId) return;
      const replayingBacklog = pendingBacklogReplay;
      if (pendingBacklogReplay) pendingBacklogReplay = false;
      term.write(data);
      if (replayingBacklog) {
        requestAnimationFrame(() => {
          fitSafely();
          if (term.cols > 0 && term.rows > 0) {
            window.api.nvimPty.resize(sessionId, term.cols, term.rows);
          }
          term.scrollToBottom();
        });
      }
    });

    unsubExit = window.api.nvimPty.onExit(({ sessionId: id, exitCode }) => {
      if (id !== sessionId) return;
      term.writeln(`\r\n\x1b[2m[editor exited with code ${exitCode}]\x1b[0m`);
    });

    const start = async () => {
      if (startDelayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, startDelayMs));
      }
      if (cancelled) return;
      await waitForTerminalLayout(host);
      fitSafely();
      const result = await window.api.nvimPty.start(sessionId, term.cols, term.rows, themeName);
      if (cancelled) return;
      if (!result.ok) {
        term.writeln(`\r\n\x1b[31m${result.error}\x1b[0m`);
        return;
      }

      pendingBacklogReplay = result.reattached;

      term.onData((data) => window.api.nvimPty.write(sessionId, data));
      term.onResize(({ cols, rows }) => window.api.nvimPty.resize(sessionId, cols, rows));

      resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(host);
      const parent = host.parentElement;
      if (parent) resizeObserver.observe(parent);
      const grandparent = parent?.parentElement;
      if (grandparent) resizeObserver.observe(grandparent);

      ptyReadyRef.current = true;
      applyTerminalActivation(result.reattached ? 100 : 50, result.reattached ? () => term.scrollToBottom() : undefined);
    };

    void start();

    return () => {
      cancelled = true;
      ptyReadyRef.current = false;
      clearActivation();
      if (fitTimer !== undefined) window.clearTimeout(fitTimer);
      unsubData?.();
      unsubExit?.();
      resizeObserver?.disconnect();
      onRegisterFocusRef.current?.(null);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terminal tied to sessionId
  }, [sessionId, startDelayMs]);

  const mountedThemeRef = useRef<ResolvedTheme | null>(null);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = getTerminalTheme(themeName);
    if (!ptyReadyRef.current) return;
    if (mountedThemeRef.current === null) {
      mountedThemeRef.current = themeName;
      return;
    }
    if (mountedThemeRef.current === themeName) return;
    mountedThemeRef.current = themeName;
    window.api.nvimPty.setTheme(sessionId, themeName);
  }, [themeName, sessionId]);

  useEffect(() => {
    if (!ptyReadyRef.current) return;
    applyTerminalActivation(50);
    return clearActivation;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activation tied to session mount refs
  }, [blurred, autoFocus]);

  useEffect(() => {
    const fit = fitRef.current;
    if (!fit) return;
    const timer = window.setTimeout(() => {
      try {
        fit.fit();
      } catch {
        // ignore: layout not stable
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [layoutRevision]);

  return (
    <div className="nvim-editor-panel">
      <div className="nvim-editor-body">
        <div className="nvim-editor-shell" aria-hidden={blurred}>
          <div className="nvim-editor-host" ref={hostRef} />
        </div>
      </div>
    </div>
  );
}
