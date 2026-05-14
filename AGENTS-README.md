# AGENTS-README

How AI Worktrees is wired together, and how to add support for a new AI coding agent.

---

## 1. What the app does, in one paragraph

Each "session" is a dedicated git worktree branched off `origin/main`, with a long-lived pty running one agent's CLI inside that worktree. Sessions persist across app restarts: the pty is killed when the session is deleted (or the app exits) but the worktree + branch + agent's on-disk history all live independently. The UI is React + xterm.js; the heavy lifting (git, pty, filesystem, agent CLI detection) is in the Electron main process.

---

## 2. Setup

### Requirements

- macOS
- Node 20+ and npm (development only; not needed for a packaged build)
- Whichever agent CLIs you want to use, on your `PATH`:
  - `claude` (Anthropic Claude Code)
  - `cursor-agent` (Cursor Agent)
  - `gemini` (Google Gemini CLI)
  - `codex` (OpenAI Codex CLI)
- A folder of git repos. Defaults to `~/code`, configurable in Settings.

### Develop

```sh
npm install      # rebuilds node-pty for Electron
npm run dev      # Electron with HMR
```

If you switch Node versions and node-pty stops loading: `npm run rebuild`.

### Type-check and build

```sh
npm run typecheck   # tsc on both node + web projects
npm run build       # bundles main/preload/renderer into out/
npm run dist        # full mac dmg in release/
```

### Where state lives

- App data (sessions, settings, diary): `~/Library/Application Support/AI Worktrees/`
- Worktrees: sibling of the parent repo, named `<repo>-<session-name>`
- Renamed-app migration: `src/main/migrate.ts` copies `sessions.json`, `settings.json`, `diary.json` from any of `Claude Worktrees/` or `claude-worktrees-ui/` on first launch, if the new dir is empty

---

## 3. Code structure

```
src/
├── main/                       Electron main process (Node)
│   ├── index.ts                Window + lifecycle + migration kickoff
│   ├── ipc.ts                  All ipcMain handlers
│   ├── migrate.ts              Legacy userData migration
│   ├── sessions.ts             Session CRUD (creates worktree + branch, cleans up)
│   ├── git.ts                  worktree add/remove/diff helpers (execFile, no shell)
│   ├── repos.ts                Scans codeDir for git repos
│   ├── pty-manager.ts          One pty per session; activity tracking; graceful shutdown
│   ├── agents.ts               Per-agent shell command builder (fresh vs continue)
│   ├── agent-detection.ts      Probes each agent's CLI in a login shell, caches result
│   ├── agent-data.ts           Per-agent instructions file I/O + billing-mode detection
│   ├── settings.ts             User settings JSON store
│   ├── usage.ts                Claude $ usage via ccusage
│   ├── diary.ts                Diary JSON store
│   ├── vscode.ts               "Open in VS Code" via the code CLI
│   └── store.ts                Tiny serial-write JSON store
│
├── preload/
│   └── index.ts                contextBridge → window.api (typed)
│
├── renderer/                   React + xterm.js
│   ├── App.tsx                 Layout, modal state, panel widths
│   ├── theme.ts                System/light/dark resolver
│   ├── components/
│   │   ├── Sidebar.tsx         Sessions list, agent chip per row, resize handle
│   │   ├── Terminal.tsx        xterm.js host bound to a session's pty
│   │   ├── NewSessionModal.tsx Agent picker + repo + name
│   │   ├── AgentDataModal.tsx  Per-agent spend + billing chip + instructions editor
│   │   ├── DeveloperPanel.tsx  Git status + diff for the active worktree
│   │   ├── DiaryModal.tsx, SettingsModal.tsx, DeleteConfirmModal.tsx
│   │   └── Logo.tsx
│   └── styles/global.css
│
└── shared/                     Imported by main, preload, and renderer
    ├── agents.ts               AGENTS registry + AgentId + AgentDefinition
    ├── types.ts                Session, Settings, AgentSpendInfo, etc.
    └── ipc-channels.ts         IPC channel name constants
```

Path aliases (`@shared/*`) are defined in `electron.vite.config.ts` and mirror in the `tsconfig.*.json` files.

---

## 4. How a session flows end-to-end

```
User clicks + New Session
    │
    ▼
NewSessionModal calls window.api.detectAgents()          → main: agent-detection.ts
    │  (one login-shell call probes all binaries; cached)
    ▼
User picks { agentId, repoPath, name }, hits Create
    │
    ▼
window.api.createSession(input) → IPC.CreateSession      → main: sessions.ts:createSession
    │
    ▼
sessions.ts validates name, resolves default branch,
git fetch origin <branch>, git worktree add -b <name>
    │
    ▼
Session row appears in sidebar with agent chip
    │
    ▼
User clicks the row
    │
    ▼
Renderer mounts Terminal.tsx, calls window.api.pty.start
    │
    ▼
main: ipc.ts reads the Session, captures previouslyStarted
       (= lastStartedAt !== null), calls pty-manager.startPty
    │
    ▼
pty-manager calls agents.buildLaunchCommand(agentId, {cwd, previouslyStarted})
       which returns the shell line to run (e.g. "claude --continue")
    │
    ▼
pty.spawn(shellPath(), ['-lic', '<shell command>'], { cwd: worktreePath })
       Data flows over IPC.PtyData → xterm.js. Input flows back over IPC.PtyWrite.
       Activity is sampled every 500ms and emitted over IPC.PtyActivity.
    │
    ▼
User deletes the session → IPC.DeleteSession
       1. killPty(id)  2. git worktree remove  3. git branch -D (optional)
       4. drop from sessions.json
```

---

## 5. Per-agent extension points

Each agent appears in exactly **one** array (the shared registry) and **one** switch statement per behavior. Adding an agent touches at most six files and is mechanical.

### 5.1 Required: register the agent

`src/shared/agents.ts`:

```ts
export type AgentId = 'claude' | 'cursor' | 'gemini' | 'codex' | 'newAgent';

export const AGENTS: AgentDefinition[] = [
  // ...
  {
    id: 'newAgent',
    name: 'New Agent',
    description: 'One-line description, shown in the picker',
    binary: 'newagent-cli',                              // probed via `command -v`
    instructions: { home: '.newagent', filename: 'AGENTS.md' },
  },
];
```

That entry alone gets you:
- A card in the New Session picker (greyed-out until the binary is found on `PATH`)
- A row in Agent Data with the instructions-file editor (read/write of `~/.newagent/AGENTS.md`)
- An agent chip on every session row
- Greyed-out behavior in the picker if `newagent-cli` isn't installed

### 5.2 Required: launch command

`src/main/agents.ts` — add a case:

```ts
case 'newAgent':
  // If the CLI has a no-args "resume the latest" command, use this helper:
  return buildResumable('newagent-cli', 'resume --last', options);
  // Otherwise just always launch fresh:
  // return { shellCommand: 'newagent-cli' };
```

`buildResumable(base, resumeArgs, options)` returns `base resumeArgs` when `options.previouslyStarted` is true, else `base`. The `previouslyStarted` signal is `session.lastStartedAt !== null` captured **before** `markSessionStarted` updates it (see `src/main/ipc.ts` PtyStart handler).

If the agent needs richer logic (e.g. probing on-disk history like Claude does with `~/.claude/projects/<encoded-cwd>/*.jsonl`), follow the `buildClaudeCommand` pattern.

### 5.3 Optional: billing-mode detection

`src/main/agent-data.ts` — add a case in `getAgentSpend`:

```ts
case 'newAgent':
  return { kind: 'plan', ...(await detectNewAgentBilling()) };
```

`detectNewAgentBilling()` should return `{ billing, note }`:

| `billing`      | Meaning                                          | Chip colour |
| -------------- | ------------------------------------------------ | ----------- |
| `metered`      | API key set; charged per token                   | amber       |
| `subscription` | Flat fee plan (Pro / ChatGPT / etc.); no overage | purple      |
| `free`         | Free tier with quota; no charge                  | green       |
| `unknown`      | Couldn't determine — usually "not signed in"     | grey        |

Detection patterns we already use:
- **Env vars**: `process.env.ANTHROPIC_API_KEY`, `process.env.GEMINI_API_KEY`, `process.env.GOOGLE_API_KEY`
- **Auth files**: read JSON, look for API-key keys vs. OAuth/session tokens
- **OAuth credentials**: stat for `oauth_creds.json` or similar

If you want real `$` spend (not just a billing label), return `{ kind: 'cost', cost, tokens, date, billing, note }`. The Claude branch shows the full shape via `ccusage`.

### 5.4 Optional: agent chip colour

`src/renderer/styles/global.css` — add a `.session-agent-tag.agent-newAgent` rule using `color-mix(in srgb, <hex> N%, transparent)`. Without one, the chip falls back to neutral grey.

### 5.5 That's it

Nothing else needs to change. The session lifecycle (worktree creation, branch, deletion, pty management, activity tracking, persistence) is fully agent-agnostic — every session goes through the same `createSession`/`deleteSession` regardless of `agentId`.

---

## 6. IPC contract

All renderer → main calls go through the `contextBridge` in `src/preload/index.ts`. The channel names are constants in `src/shared/ipc-channels.ts`. The renderer never sees `ipcRenderer` directly; it sees a typed `window.api` (typed by `CWApi` in the preload).

If you add an IPC method:

1. Add a channel name to `src/shared/ipc-channels.ts`.
2. Register the handler in `src/main/ipc.ts`.
3. Expose it in `src/preload/index.ts` as a method on the `api` object.

The exported `CWApi` type flows automatically into `window.api` via `src/renderer/global.d.ts`.

---

## 7. Security

This app is local-first. It does not phone home, collect telemetry, or check for updates. Outbound network traffic comes only from operations you'd run yourself in a terminal (`git fetch`, the agent CLIs themselves).

### Electron hardening

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (sandbox is off because node-pty needs a Node runtime in preload; we compensate by exposing only the explicit `window.api` surface and never `ipcRenderer`).
- The renderer can only invoke handlers defined in `src/main/ipc.ts`.

### Shell injection surface

- All git calls use `execFile` (no shell). Branch names, paths, refs are passed as argv, never interpolated into a command string.
- Pty launches via `pty.spawn(shellPath(), ['-lic', launch.shellCommand], { cwd })` (same `-lic` flags as agent detection so `PATH` matches). The `shellCommand` for built-in agents is composed of literal strings only (e.g. `'claude --continue'`) — no untrusted interpolation. **If you add an agent that needs user-supplied flags in its launch command, escape them or pass them as separate argv to the CLI inside the shell command.**
- Session names are validated against `^[a-zA-Z0-9._/-]+$` (`NAME_PATTERN` in `src/main/sessions.ts`) before being used to construct branch names or worktree paths.
- Agent-CLI detection runs `command -v <binary>` inside a login shell. Each `<binary>` comes from the in-code `AGENTS` registry (literal strings), never from user input.
- The only `exec` (shell) call is `osascript` for the iTerm helper, and the only thing interpolated is the worktree path — itself derived from validated inputs.

### Things the app does NOT do

- No HTTP/HTTPS, sockets, or arbitrary network I/O from this codebase. (`grep -rE 'fetch\(|http\.|https\.|axios|undici|net\.connect' src` returns nothing.)
- No telemetry, analytics, crash reporting, or update pings.
- No reading or writing of files outside: the configured code directory, the app's own userData dir, each agent's own home dir for its instructions file, and whatever `git` itself touches.

### Adding an agent — security checklist

- Use literal strings for the CLI binary name and launch args. Don't compose them from user input.
- If your agent's auth file lives somewhere readable, treat its contents as untrusted JSON: wrap parsing in try/catch, validate fields exist before reading, never echo raw values back into a shell command.
- Don't add new shell-style `exec` calls. If you must shell out, prefer `execFile` and pass an argv array.
- If your agent needs an API key from the environment, read it via `process.env.<NAME>` only — don't surface keys to the renderer.

---

## 8. Useful greps

```sh
grep -rE 'fetch\(|http\.|https\.|axios|undici|net\.connect' src   # → no matches
grep -rE 'execFile|spawn|exec\(' src                              # → only git, node-pty, osascript, ccusage
grep -n "case 'claude'" src/main                                  # → all per-agent switches at a glance
grep -rn "AgentId" src/shared                                     # → entry points to extend
```
