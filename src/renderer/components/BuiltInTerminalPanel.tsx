import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { DARK_TERMINAL_THEME, LIGHT_TERMINAL_THEME } from '../terminal-theme';

type Props = {
  sessionId: string;
  worktreePath: string;
  themeName: 'dark' | 'light';
  blurred: boolean;
  onHide: () => void;
};

export function BuiltInTerminalPanel({
  sessionId,
  worktreePath,
  themeName,
  blurred,
  onHide,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Xterm({
      fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: themeName === 'light' ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(host);

    termRef.current = term;
    fitRef.current = fitAddon;

    let cancelled = false;
    let unsubData: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let fitTimer: number | undefined;

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

    unsubData = window.api.shellPty.onData(({ sessionId: id, data }) => {
      if (id === sessionId) term.write(data);
    });

    unsubExit = window.api.shellPty.onExit(({ sessionId: id, exitCode }) => {
      if (id !== sessionId) return;
      term.writeln(`\r\n\x1b[2m[shell exited with code ${exitCode}]\x1b[0m`);
    });

    const start = async () => {
      fitSafely();
      const result = await window.api.shellPty.start(sessionId, term.cols, term.rows);
      if (cancelled) return;
      if (!result.ok) {
        term.writeln(`\r\n\x1b[31m${result.error}\x1b[0m`);
        return;
      }

      term.onData((data) => window.api.shellPty.write(sessionId, data));
      term.onResize(({ cols, rows }) => window.api.shellPty.resize(sessionId, cols, rows));

      resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(host);

      if (!blurred) term.focus();
    };

    void start();

    return () => {
      cancelled = true;
      if (fitTimer !== undefined) window.clearTimeout(fitTimer);
      unsubData?.();
      unsubExit?.();
      resizeObserver?.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terminal tied to sessionId
  }, [sessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = themeName === 'light' ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;
  }, [themeName]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (blurred) {
      term.blur();
    } else {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        term.focus();
      });
    }
  }, [blurred]);

  return (
    <section className="built-in-terminal-panel bottom-dock-panel">
      <div className="bottom-dock-panel-header">
        <div className="bottom-dock-panel-title">Terminal</div>
        <div className="built-in-terminal-subtitle" title={worktreePath}>
          {worktreePath}
        </div>
        <div className="bottom-dock-panel-header-actions">
          <button
            className="icon-btn"
            onClick={onHide}
            title="Hide Terminal panel"
            aria-label="Hide Terminal panel"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>
      <div className="built-in-terminal-body">
        <div className="built-in-terminal-shell" aria-hidden={blurred}>
          <div className="built-in-terminal-host" ref={hostRef} />
        </div>
      </div>
    </section>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
