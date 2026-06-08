import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from '../terminal-theme';
import { syncTerminalInteractive } from '../terminal-activation';
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
  const ptyReadyRef = useRef(false);
  const activationCleanupRef = useRef<(() => void) | null>(null);
  const visibleRef = useRef(visible);
  const blurredRef = useRef(blurred);
  const onTerminalApiRef = useRef(onTerminalApi);
  onTerminalApiRef.current = onTerminalApi;
  visibleRef.current = visible;
  blurredRef.current = blurred;

  const clearActivation = () => {
    activationCleanupRef.current?.();
    activationCleanupRef.current = null;
  };

  const applyTerminalActivation = (focusDelayMs = 50) => {
    const term = termRef.current;
    if (!term || !ptyReadyRef.current) return;
    clearActivation();
    const active = visibleRef.current && !blurredRef.current;
    activationCleanupRef.current = syncTerminalInteractive(
      term,
      fitRef.current,
      active,
      (cols, rows) => window.api.pty.resize(sessionId, cols, rows),
      focusDelayMs,
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

    unsubData = window.api.pty.onData(({ sessionId: id, data }) => {
      if (id !== sessionId) return;
      if (pendingBacklogReplay) {
        term.reset();
        pendingBacklogReplay = false;
      }
      term.write(data);
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

      pendingBacklogReplay = result.reattached;

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

      ptyReadyRef.current = true;
      applyTerminalActivation(result.reattached ? 100 : 50);
    };

    void start();

    return () => {
      cancelled = true;
      ptyReadyRef.current = false;
      clearActivation();
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
    if (!ptyReadyRef.current) return;
    applyTerminalActivation(50);
    return clearActivation;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activation tied to session mount refs
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
