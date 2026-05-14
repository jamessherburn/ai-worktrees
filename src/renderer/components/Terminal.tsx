import { useEffect, useRef } from 'react';
import { Terminal as Xterm, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

type TerminalApi = { paste: (text: string) => void };

type Props = {
  sessionId: string;
  visible: boolean;
  blurred: boolean;
  themeName: 'dark' | 'light';
  onExit?: (sessionId: string) => void;
  onTerminalApi?: (sessionId: string, api: TerminalApi | null) => void;
};

const DARK_THEME: ITheme = {
  background: '#0E0A1A',
  foreground: '#ECE7F6',
  cursor: '#7C5BD6',
  cursorAccent: '#0E0A1A',
  selectionBackground: '#2E2349',
  black: '#1c2030',
  red: '#ef6377',
  green: '#4cd1a1',
  yellow: '#f0b86e',
  blue: '#7c8cff',
  magenta: '#c594e8',
  cyan: '#5fd4d6',
  white: '#e6e8ee',
  brightBlack: '#5e6577',
  brightRed: '#ff8a99',
  brightGreen: '#7ee5be',
  brightYellow: '#ffce94',
  brightBlue: '#9eaaff',
  brightMagenta: '#dbb1f0',
  brightCyan: '#9be6e8',
  brightWhite: '#ffffff',
};

const LIGHT_THEME: ITheme = {
  background: '#fafbfc',
  foreground: '#1F1A2E',
  cursor: '#6E4FD3',
  cursorAccent: '#fafbfc',
  selectionBackground: '#E2D8F5',
  black: '#1f2330',
  red: '#c93c4f',
  green: '#1f9d6f',
  yellow: '#a06e1f',
  blue: '#3a52d6',
  magenta: '#8a48b9',
  cyan: '#137884',
  white: '#3a3f4f',
  brightBlack: '#5e6577',
  brightRed: '#d04357',
  brightGreen: '#239f72',
  brightYellow: '#a8741f',
  brightBlue: '#465fdb',
  brightMagenta: '#9954c4',
  brightCyan: '#1a8e9b',
  brightWhite: '#1f2330',
};

export function TerminalView({ sessionId, visible, blurred, themeName, onExit, onTerminalApi }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onTerminalApiRef = useRef(onTerminalApi);
  onTerminalApiRef.current = onTerminalApi;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Xterm({
      fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: themeName === 'light' ? LIGHT_THEME : DARK_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(host);

    onTerminalApiRef.current?.(sessionId, {
      paste: (text: string) => {
        term.focus();
        term.paste(text);
      },
    });

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

    unsubData = window.api.pty.onData(({ sessionId: id, data }) => {
      if (id === sessionId) term.write(data);
    });

    unsubExit = window.api.pty.onExit(({ sessionId: id, exitCode }) => {
      if (id !== sessionId) return;
      term.writeln(`\r\n\x1b[2m[claude exited with code ${exitCode}]\x1b[0m`);
      onExit?.(sessionId);
    });

    const start = async () => {
      fitSafely();
      const result = await window.api.pty.start(sessionId, term.cols, term.rows);
      if (cancelled) return;
      if (!result.ok) {
        term.writeln(`\r\n\x1b[31m${result.error}\x1b[0m`);
        return;
      }

      term.onData((data) => window.api.pty.write(sessionId, data));
      term.onResize(({ cols, rows }) => window.api.pty.resize(sessionId, cols, rows));

      resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(host);

      if (visible && !blurred) term.focus();
    };

    void start();

    return () => {
      cancelled = true;
      onTerminalApiRef.current?.(sessionId, null);
      if (fitTimer !== undefined) window.clearTimeout(fitTimer);
      unsubData?.();
      unsubExit?.();
      resizeObserver?.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terminal is tied to sessionId; theme updates handled separately
  }, [sessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = themeName === 'light' ? LIGHT_THEME : DARK_THEME;
  }, [themeName]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (blurred) {
      term.blur();
    } else if (visible) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        term.focus();
      });
    }
  }, [visible, blurred]);

  return <div className="terminal-host" ref={hostRef} aria-hidden={blurred} />;
}
