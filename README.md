# AI Worktrees

A local Mac desktop app for managing AI coding-agent sessions across multiple repositories. Each session is a dedicated git worktree with a long-lived embedded REPL — flick between sessions in different repos without losing context.

The first supported agent is [Claude Code](https://claude.com/claude-code). The app is designed so additional agents can be plugged in without changing the rest of the UI.

## Features

- **One-click new session** — pick an agent and a repo, name the session, app creates a worktree off the latest `origin/main` (or `origin/master`) and opens the agent inside it.
- **Embedded terminal** — full xterm.js REPL inside the app, no external terminal required.
- **Sessions persist across restarts** — close the app, reopen, and resume any session (e.g. `claude --continue` for Claude).
- **Multi-repo, multi-agent** — sidebar groups sessions by repo, switching keeps each pty alive in the background. Different sessions can use different agents side by side.
- **Clean cleanup** — delete a session and the worktree + branch are removed.

## Requirements

- macOS
- The CLI for any agent you want to use, on your `PATH`. For Claude that means [Claude Code](https://claude.com/claude-code).
- A folder of git repos (defaults to `$HOME/code`, configurable in Settings)
- Node.js 20+ and npm (for development; not required to run a packaged build)

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

- App data (sessions + settings JSON): `~/Library/Application Support/ai-worktrees/`
- Worktrees: sibling of the repo, named `<repo>-<session-name>` (matches the existing `create-worktree.sh` convention)

## Usage

1. Click **+ New Session** in the sidebar.
2. Pick an AI agent (Claude is the only option today).
3. Pick a repo (scanned from your code directory).
4. Name the session. The name doubles as the branch name.
5. The app fetches the default branch, creates a worktree, and opens the agent inside it.
6. Click between sessions in the sidebar to switch — all sessions keep running.
7. Hover a session to delete it (worktree + branch are removed).

## Security

This is a local-first app. It does not phone home, collect telemetry, or check for updates. The only outbound network activity comes from operations you'd run yourself in a terminal.

**What the app does at runtime**

| Action | What it touches |
| --- | --- |
| Lists repos | Reads directory entries under your code directory (default `~/code`) and runs `git rev-parse` on each |
| Creates a session | `git fetch origin <branch>` (uses your existing git credentials), `git worktree add` |
| Opens a session | Spawns the selected agent's CLI inside the worktree via a pty |
| Persists state | Reads / writes `~/Library/Application Support/ai-worktrees/sessions.json` and `settings.json` |
| Deletes a session | `git worktree remove`, `git branch -D` |
| "Open in iTerm" | Runs `osascript` to tell iTerm to open the worktree path |

**What the app does NOT do**

- No HTTP/HTTPS, sockets, or any other network calls written by this app. (Search the source for `fetch(`, `http.`, `axios`, etc. — there are none.)
- No telemetry, analytics, or crash reporting
- No auto-update or version-check pings
- No external services beyond `git` and the agent binaries on your PATH
- No reading or writing of files outside the code directory, the app's user-data dir, or what `git` itself touches

**Electron hardening**

- `contextIsolation: true`, `nodeIntegration: false` — the renderer can't touch Node APIs directly.
- All renderer → main communication goes through a typed `contextBridge` (`src/preload/index.ts`).
- Git commands run via `execFile` (no shell), so no shell-injection surface from arguments.
- Session names are validated against `^[a-zA-Z0-9._/-]+$` before they're used to construct worktree paths or branches.
- The only `exec` (shell) call is `osascript` for "Open in iTerm", and the only thing interpolated into it is the worktree path — derived from already-validated inputs.

**Verifying yourself**

```sh
grep -rE 'fetch\(|http\.|https\.|axios|undici|net\.connect' src   # → no matches
grep -rE 'execFile|spawn|exec\(' src                              # → only git, node-pty, osascript
```

Each agent REPL, of course, talks to its provider — that's between you and that agent, exactly the same as running its CLI in your terminal.

## Architecture

```
src/
├── main/         Electron main process (Node)
│   ├── index.ts          window + lifecycle
│   ├── ipc.ts            IPC handlers
│   ├── sessions.ts       session CRUD + JSON persistence
│   ├── agents.ts         agent registry (Claude, ...)
│   ├── git.ts            worktree-add / worktree-remove
│   ├── repos.ts          scans codeDir for git repos
│   ├── pty-manager.ts    node-pty per session
│   └── settings.ts       user settings
├── preload/      contextBridge → window.api
├── renderer/     React + xterm.js UI
└── shared/       Types + IPC channel constants
```
