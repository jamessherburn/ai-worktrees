# AI Worktrees

A local macOS desktop app for managing AI coding-agent sessions across multiple git repositories. Each **worktree session** gets its own branch and worktree with a long-lived embedded REPL — switch between repos and agents without losing terminal context.

Built-in agents today: [Claude Code](https://claude.com/claude-code), Cursor Agent, Gemini CLI, and Codex CLI. The registry is data-driven; see [AGENTS-README.md](./AGENTS-README.md) to add another.

## Installing the latest version

Release artifacts are built from `main` in GitHub Actions. After copying the app to `/Applications`, you may need to clear quarantine for a locally built or downloaded build:

```sh
xattr -rd com.apple.quarantine "/Applications/AI Worktrees.app"
```

## Features

- **One-click new session** — pick an agent and repo, name the session; the app resolves the default branch, optionally `git fetch`, then `git worktree add` off `origin/main` or `origin/master`.
- **Session wizard** — optional questionnaire before create; answers compile into a markdown briefing you can paste into the agent terminal.
- **Global sessions** — run an agent at your whole code directory with no worktree or branch (useful for cross-repo work).
- **Embedded agent terminal** — xterm.js REPL per session via node-pty; sessions stay alive when you switch away.
- **Built-in shell** — bottom-dock terminal at the active session’s worktree (or code dir for global sessions).
- **Git panel** — status, diffs, stage / unstage / discard for the active worktree.
- **Multi-repo, multi-agent** — sidebar groups sessions by repo; different sessions can use different agents concurrently.
- **Tasks kanban** — local task board persisted in app data (not tied to git).
- **Session quick prompts** — configurable paste-and-send shortcuts for the agent terminal.
- **Agent data** — per-agent instructions file editor, install detection, and billing / usage hints (Claude can show same-day cost via local `ccusage` data).
- **Sessions persist across restarts** — worktrees and agent history survive app quit; reopen and continue (e.g. `claude --continue`).
- **Clean cleanup** — deleting a worktree session removes the worktree and can delete the branch.

## Requirements

- macOS
- Agent CLIs on your `PATH` for whichever agents you use (`claude`, `cursor-agent`, `gemini`, `codex`, …)
- A folder of git repos (default `$HOME/code`, configurable in Settings)
- Node.js 20+ and npm (development only; not required for a packaged `.app`)

## Development

```sh
npm install      # also rebuilds node-pty for Electron
npm run dev      # launches Electron with HMR
```

If you change Node versions and node-pty stops loading, run `npm run rebuild`.

## Build & package

```sh
npm run dist     # produces release/AI Worktrees.dmg + .app
```

Drag the `.app` to `/Applications` and launch.

## Where things live

| What | Where |
| --- | --- |
| App data | `~/Library/Application Support/ai-worktrees/` when running from this repo (`npm run dev`), or `~/Library/Application Support/AI Worktrees/` for the packaged app. Legacy installs may have been migrated from `Claude Worktrees/` or `claude-worktrees-ui/` (see `src/main/migrate.ts`). |
| `sessions.json` | Session list (paths, agent, wizard brief, global flag, …) |
| `settings.json` | Code directory, theme, wizard config, tasks layout, session prompts |
| `diary.json` | Tasks kanban items |
| Worktrees | Sibling of the repo: `<parent>/<repo-name>-<session-name>` (slashes in the session name become dashes in the folder name) |

Wizard questions and the briefing template live in **settings** — updating the app does not overwrite a customized wizard until you use **Reset wizard to defaults** in Settings.

## Usage

1. Click **+ New Session** in the sidebar.
2. Choose an agent (unavailable agents are greyed out if the CLI is not on `PATH`).
3. Optionally enable **Global session** to use the code directory instead of a repo worktree.
4. Pick a repo (for worktree sessions) and name the session (also the branch name for worktree sessions).
5. Leave **Use Wizard Mode** on to answer the briefing questionnaire, or off to create immediately.
6. The app creates the session and you can start the agent terminal from the main pane.
7. Use the bottom dock for a plain shell, the Git panel for changes, and the sidebar to switch sessions.
8. Hover a session and delete to remove it (worktree + optional branch for non-global sessions).

External shortcuts: **Open in VS Code**, **Reveal in Finder**, and agent instructions editing are under Agent Data and the session chrome.

## Security

This is a **local-first** app: no telemetry, no crash reporting, no in-app auto-update, and **no HTTP/HTTPS client code** in this repository. Network access happens only when **subprocesses you indirectly trigger** talk to the network (same class of behavior as using Terminal yourself).

### Trust model

```mermaid
flowchart LR
  subgraph renderer [Renderer - React]
    UI[UI / xterm.js]
  end
  subgraph preload [Preload]
    API["window.api"]
  end
  subgraph main [Main process - Node]
    IPC[ipc handlers]
    Git[git execFile]
    Pty[pty.spawn]
    FS[JSON stores + agent files]
  end
  UI --> API --> IPC
  IPC --> Git
  IPC --> Pty
  IPC --> FS
  Pty --> Agents[Agent CLIs on PATH]
  Git --> Network[(git remote)]
  Agents --> Providers[(Agent providers)]
```

You should treat the app as **fully trusted on your machine**: it can run shells, invoke `git`, read your code directory, and write its own config under Application Support.

### What the app does at runtime

| Action | What it touches |
| --- | --- |
| Lists repos | Reads directories under your configured code directory; `git rev-parse` per candidate |
| Creates a worktree session | `git fetch origin <branch>` when `origin` exists; `git worktree add` |
| Creates a global session | No git mutation; agent cwd is the code directory |
| Opens agent terminal | `pty.spawn` login shell running the agent CLI in the session cwd |
| Built-in shell | Separate `pty.spawn` per session at the same cwd |
| Git panel | `git status` / `diff` / `add` / `restore` / `clean` under the session worktree via `execFile` |
| Persists state | `sessions.json`, `settings.json`, `diary.json` in userData |
| Deletes a worktree session | `git worktree remove`, optional `git branch -D` |
| Agent instructions | Read/write `~/…/<agent-home>/<instructions-file>` (paths from the in-code agent registry) |
| Claude usage chip | May run `npx` / `bun x` to invoke pinned `ccusage` (reads local Claude Code usage files; may hit npm registry to download the tool) |
| Startup GitHub CLI check | Probes/installs `git` and `gh` via Homebrew or winget when missing; may open Terminal for `gh auth login` |
| Open in VS Code | `code --reuse-window <path>` via `execFile` |
| Reveal in Finder | `shell.openPath` on the worktree directory |
| Open in Terminal | `osascript` telling macOS Terminal to `cd` into the worktree |

### Network and subprocesses

| Source | Can use the network? |
| --- | --- |
| This app’s TypeScript/JavaScript | **No** — no `fetch`, `http`, `axios`, etc. in `src/` |
| `git fetch` / `git` remote operations | **Yes** — uses your existing git credentials |
| Agent CLIs (Claude, Cursor, Gemini, Codex, …) | **Yes** — same as running them in Terminal |
| `gh` (install/auth check on startup) | **Yes** — when installed or during `gh auth` |
| Homebrew / winget (optional install of git/gh) | **Yes** — if automatic install runs |
| `npx ccusage@…` (Claude spend in Agent Data) | **Yes** — npm registry when the package is not already cached |

### Filesystem scope

The app routinely reads or writes:

- Your **code directory** (repo scan, worktrees as siblings, global session cwd)
- **userData** JSON stores (sessions, settings, tasks)
- **Agent instruction files** under each agent’s home (e.g. `~/.claude/CLAUDE.md`)
- **Agent auth/usage files** for billing detection only (e.g. `~/.codex/auth.json`, Claude project dirs for `ccusage`) — not sent to a first-party server by this app
- Paths returned by **git** inside a worktree (status, diff, stage, discard)

It does **not** implement a sandbox around git or agents: anything those tools can access on disk, they can still access.

### Electron hardening

- `contextIsolation: true`, `nodeIntegration: false` — the renderer cannot call Node APIs directly.
- `sandbox: false` — required for node-pty; mitigation is a minimal `contextBridge` API only (`src/preload/index.ts`).
- All renderer → main calls go through typed IPC handlers in `src/main/ipc.ts`.
- Git uses `execFile('git', argv, { cwd })` — arguments are argv elements, not shell strings.
- Session names must match `^[a-zA-Z0-9._/-]+$` before branch or worktree paths are derived (`src/main/sessions.ts`).
- Built-in agent launch strings are **literal compositions** in `src/main/agents.ts` (no user text in the shell command). Agent binaries probed via `command -v` use names from the in-code `AGENTS` registry only.

**Shell usage (know the surface):**

- Agent and shell PTYs: `pty.spawn($SHELL, ['-lic', '<command>'], { cwd })`
- Agent detection: login shell running `command -v` for each registered binary
- macOS Terminal helper: `execFile('osascript', …)` with a `cd` into the worktree
- Legacy iTerm helper: `exec` + `osascript` (exposed on IPC but not used by current UI)
- GitHub CLI setup: login shell for `brew` / `gh` probes and installs

If the renderer were compromised (e.g. via a future XSS), IPC handlers that accept **paths** (`RevealInFinder`, `OpenInVSCode`, `OpenInTerminal`) could be abused to target arbitrary filesystem locations — today the UI only passes session paths from data the main process already stored.

### What the app does **not** do

- No first-party HTTP API, analytics, or update pings in source
- No cloud sync of sessions or settings
- No automatic upload of your code, prompts, or wizard answers

Agent providers are a separate trust boundary: whatever you type in a REPL is handled by that vendor’s CLI, exactly as in Terminal.

### Verify yourself

From the repository root:

```sh
# No in-app HTTP client
grep -rE 'fetch\(|http\.|https\.|axios|undici|net\.connect' src
# Expect: no matches

# Subprocess entry points (review manually)
grep -rE 'execFile|exec\(|pty\.spawn' src

# Session name validation
grep -n 'NAME_PATTERN' src/main/sessions.ts

# Electron webPreferences
grep -n 'contextIsolation\|nodeIntegration\|sandbox' src/main/index.ts
```

For contributor-level detail (adding agents, IPC, injection checklist), see [AGENTS-README.md § Security](./AGENTS-README.md#7-security).

## Architecture

```
src/
├── main/           Electron main process
│   ├── index.ts              window, lifecycle, migration
│   ├── ipc.ts                IPC handlers
│   ├── sessions.ts           session CRUD
│   ├── git.ts                worktree + status/diff/actions
│   ├── repos.ts              code-directory scan
│   ├── pty-manager.ts        agent PTY per session
│   ├── shell-pty-manager.ts  built-in shell PTY per session
│   ├── agents.ts             per-agent launch command
│   ├── agent-detection.ts    PATH probes (cached)
│   ├── agent-data.ts         instructions + billing/spend
│   ├── usage.ts              ccusage wrapper (Claude)
│   ├── gh-cli.ts             optional git/gh install + auth
│   ├── settings.ts           settings store
│   ├── diary.ts              tasks store
│   ├── migrate.ts            legacy userData migration
│   ├── vscode.ts             VS Code CLI helper
│   └── store.ts              JSON read/write helper
├── preload/        contextBridge → window.api
├── renderer/       React + xterm.js UI
└── shared/         types, IPC channels, wizard, tasks, agents
```

See [AGENTS-README.md](./AGENTS-README.md) for session lifecycle, adding an agent, and IPC conventions.
