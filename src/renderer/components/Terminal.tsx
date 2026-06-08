import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from '../terminal-theme';
import type { ResolvedTheme } from '../theme';
import type { AgentId } from '@shared/agents';
import { normalizePromptText, SESSION_PROMPT_SUBMIT_DELAY_MS } from '@shared/session-prompt-submit';

export type TerminalApi = {
  paste: (text: string) => void;
  submitPrompt: (text: string) => void;
  scrollToBottom: () => void;
};

type Props = {
  sessionId: string;
  agentId: AgentId;
  visible: boolean;
  blurred: boolean;
  themeName: ResolvedTheme;
  /** When true, omits outer padding and refits when the host layout changes (flight deck grid). */
  embedded?: boolean;
  /** Bumped when an embedded terminal's container layout changes. */
  layoutRevision?: number;
  onExit?: (sessionId: string) => void;
  onTerminalApi?: (sessionId: string, api: TerminalApi | null) => void;
};

export function TerminalView({
  sessionId,
  agentId,
  visible,
  blurred,
  themeName,
  embedded = false,
  layoutRevision = 0,
  onExit,
  onTerminalApi,
}: Props) {
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
      theme: getTerminalTheme(themeName),
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(host);

    const terminalApi: TerminalApi = {
      paste: (text: string) => {
        term.focus();
        term.input(text);
      },
      submitPrompt: (text: string) => {
        term.focus();
        const body = normalizePromptText(text);
        // Paste prompt text first, then send Enter as a separate keypress so agent
        // composers submit instead of treating Return as pasted newline content.
        const delay =
          agentId === 'claude' || agentId === 'cursor'
            ? SESSION_PROMPT_SUBMIT_DELAY_MS
            : 50;
        term.paste(body);
        window.setTimeout(() => {
          term.input('\r');
        }, delay);
      },
      scrollToBottom: () => {
        const buffer = term.buffer.active;
        const target = buffer.baseY + buffer.length - 1;
        if (target >= buffer.viewportY) {
          term.scrollToLine(target);
        }
        term.scrollToBottom();
        requestAnimationFrame(() => {
          term.scrollToBottom();
          term.focus();
        });
      },
    };

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

      onTerminalApiRef.current?.(sessionId, terminalApi);

      term.onData((data) => window.api.pty.write(sessionId, data));
      term.onResize(({ cols, rows }) => window.api.pty.resize(sessionId, cols, rows));

      resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(host);
      if (embedded) {
        const parent = host.parentElement;
        if (parent) resizeObserver.observe(parent);
        const grandparent = parent?.parentElement;
        if (grandparent) resizeObserver.observe(grandparent);
      }

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
    term.options.theme = getTerminalTheme(themeName);
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

  useEffect(() => {
    if (!embedded) return;
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
  }, [embedded, layoutRevision]);

  return (
    <div className={`terminal-shell${embedded ? ' terminal-shell--embedded' : ''}`} aria-hidden={blurred}>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
