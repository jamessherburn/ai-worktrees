# AGENTS-README

How AI Worktrees is wired together, how to add a new coding agent, and what to respect for security when you change the main process.

---

## 1. What the app does, in one paragraph

Each **worktree session** is a git worktree (new branch) with a long-lived PTY running one agent CLI in that directory. **Global sessions** skip worktree creation and use the configured code directory as cwd. Sessions persist across app restarts: PTYs are recreated on demand, but worktrees, branches, and each agent’s on-disk history remain until you delete the session.

The UI has two views: **Flight Deck** (default) — a filterable grid of session cards opening a fullscreen three-panel workspace (Neovim editor, agent REPL, shell) — and **Workspace** — sidebar + main agent terminal + bottom dock (shell, Git, tasks). React + xterm.js in the renderer; git, PTY, Neovim, filesystem, and CLI detection live in the Electron main process behind a narrow `window.api` bridge.

---

## 2. Setup

### Requirements

- macOS
- Node 20+ and npm (development only; not needed for a packaged build)
- Agent CLIs on `PATH` for whichever agents you use:
  - `claude` — Anthropic Claude Code
  - `cursor-agent` — Cursor Agent
  - `gemini` — Google Gemini CLI
  - `codex` — OpenAI Codex CLI
- `nvim` on `PATH` for the Flight Deck embedded editor (other panels work without it)
- A folder of git repos (default `~/code`, configurable in Settings)
- Optional: `gh` for GitHub Stats and startup auto-setup; **fish** for the built-in shell (auto-installed via Homebrew when missing on macOS/Linux)

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

| File / path | Purpose |
| --- | --- |
| `~/Library/Application Support/ai-worktrees/` | Typical userData when running `npm run dev` |
| `~/Library/Application Support/AI Worktrees/` | Typical userData for the packaged `.app` |
| `sessions.json` | Sessions (worktree path, agent, wizard brief, global flag, labelIds, notes, …) |
| `settings.json` | Code dir, theme, wizard config, tasks sections, session prompts, session labels, nvim config |
| `diary.json` | Tasks kanban items |
| `<codeDir>/<repo>-<session>` | Worktree directory (session name slashes → dashes) |

On first launch, `src/main/migrate.ts` copies `sessions.json`, `settings.json`, and `diary.json` from legacy folders (`Claude Worktrees/`, `claude-worktrees-ui/`) if the new userData directory is empty.

**Wizard defaults:** `DEFAULT_WIZARD_CONFIG` in `src/shared/wizard.ts` applies only when settings have no valid `wizard` key. Existing `settings.json` keeps the user’s wizard until they reset in Settings.

---

## 3. Code structure

```
src/
├── main/
│   ├── index.ts                Window, webPreferences, graceful PTY shutdown
│   ├── ipc.ts                  All ipcMain handlers
│   ├── migrate.ts              Legacy userData migration
│   ├── sessions.ts             Session CRUD + NAME_PATTERN validation
│   ├── git.ts                  worktree + status/diff/stage (execFile only)
│   ├── repos.ts                Scans codeDir for git repos
│   ├── pty-manager.ts          Agent PTY per session + activity tracking
│   ├── shell-pty-manager.ts    Built-in shell PTY (fish preferred via resolve-shell-path)
│   ├── nvim-pty-manager.ts     Neovim PTY per session (Flight Deck editor)
│   ├── nvim-config.ts          Writes managed init.lua + plugin dir under userData
│   ├── resolve-shell-path.ts   find fish / fall back to login shell
│   ├── fish-setup.ts           Optional fish install at startup (brew)
│   ├── agents.ts               Per-agent launch command builder
│   ├── agent-detection.ts      `command -v` probes in login shell (cached)
│   ├── agent-data.ts           Instructions I/O + billing/spend per agent
│   ├── usage.ts                Claude spend via pinned ccusage (npx/bun)
│   ├── gh-cli.ts               Optional git/gh install + gh auth flow
│   ├── github-monitor.ts       GitHub Stats via `gh api graphql`
│   ├── external-sessions.ts    Discover running agent CLIs outside the app
│   ├── settings.ts             settings.json + import/export
│   ├── diary.ts                diary.json (tasks)
│   ├── vscode.ts               `code --reuse-window`
│   └── store.ts                Serial JSON read/write
│
├── preload/
│   └── index.ts                contextBridge → window.api (typed CWApi)
│
├── renderer/
│   ├── App.tsx                 Views, dock, modals, startup setup bar
│   ├── components/
│   │   ├── FlightDeck.tsx            Session grid + filters + GitHub Stats entry
│   │   ├── FlightDeckSessionModal.tsx  Fullscreen editor / agent / shell workspace
│   │   ├── NvimEditorPanel.tsx       xterm host for nvim PTY
│   │   ├── ViewSwitcher.tsx          Flight Deck ↔ Workspace toggle
│   │   ├── Sidebar.tsx
│   │   ├── Terminal.tsx              Agent REPL
│   │   ├── BuiltInTerminalPanel.tsx  Shell REPL
│   │   ├── BottomDock.tsx            Shell + Git + prompts (Workspace)
│   │   ├── GitPanel.tsx              Status / diff / file actions
│   │   ├── SessionNotesButton.tsx    Per-session notes (Flight Deck workspace)
│   │   ├── GitHubStatsModal.tsx      Cross-repo gh GraphQL stats
│   │   ├── NewSessionModal.tsx       Create + wizard step
│   │   ├── SettingsModal.tsx         Tabs: general, editor, labels, prompts, wizard, tasks
│   │   ├── NvimConfigSettingsEditor.tsx  Editor tab + shortcut reference
│   │   ├── AgentDataModal.tsx
│   │   ├── TasksPanel.tsx
│   │   └── …
│   └── styles/global.css
│
└── shared/
    ├── agents.ts               AGENTS registry + AgentId
    ├── app-shortcuts.ts        Shift+L/K/N/J reference + matchers
    ├── types.ts                Session, Settings, git types, …
    ├── ipc-channels.ts         IPC name constants
    ├── nvim-config.ts          Default Neovim config + migrations
    ├── session-labels.ts       Labels, activity kinds, mute
    ├── session-notes.ts        Per-session notes helpers
    ├── github-monitor.ts       GitHub Stats types + bucket helpers
    ├── wizard.ts               Wizard config + DEFAULT_WIZARD_CONFIG
    ├── tasks.ts                Tasks kanban defaults
    └── session-prompts.ts      Quick prompt defaults
```

Path alias `@shared/*` is set in `electron.vite.config.ts` and the tsconfig projects.

---

## 4. How a session flows end-to-end

### Worktree session (default)

```
User clicks + New Session
    │
    ▼
NewSessionModal → detectAgents()          main: agent-detection.ts (cached)
    │
    ▼
User picks { agentId, repoPath, name, useWizardMode? }
    │
    ├─ wizard on → getSettings().wizard → WizardSessionStep
    │       → buildWizardMarkdown() → wizardBriefMarkdown on create
    │
    ▼
createSession({ repoPath, name, agentId, wizardBriefMarkdown? })
    │
    ▼
sessions.ts: NAME_PATTERN, resolveDefaultBranch, optional git fetch,
             git worktree add -b <name> <baseRef>
    │
    ▼
Sidebar row; user selects session
    │
    ▼
Terminal.tsx → pty.start(sessionId)
    │
    ▼
ipc: getSessionById → startPty({ agentId, cwd: worktreePath, previouslyStarted })
    │
    ▼
agents.buildLaunchCommand() → e.g. "claude --continue"
pty.spawn($SHELL, ['-lic', shellCommand], { cwd })
    │
    ▼
IPC.PtyData / PtyWrite / PtyActivity ↔ xterm.js
```

### Global session

Same as above, but `createSession({ global: true, name, agentId, … })` sets `worktreePath` and `repoPath` to `settings.codeDir`, skips all git mutations, and uses `repoName: 'Global'`.

### Delete

```
DeleteSession → killPty + killShellPty + killNvimPty → (if not global) git worktree remove,
                optional branch -D → remove from sessions.json
```

### Flight Deck session workspace

```
User clicks session card on Flight Deck grid
    │
    ▼
FlightDeckSessionModal (fullscreen, fixed layout)
    │
    ├─ NvimEditorPanel → nvimPty.start(sessionId, theme)
    │       main: nvim-pty-manager.ts spawns nvim with userData init config
    │
    ├─ TerminalView (embedded) → pty.start(sessionId)  [agent REPL]
    │
    └─ BuiltInTerminalPanel (embedded) → shellPty.start(sessionId)
            main: shell-pty-manager.ts uses resolveShellPath() → fish when available
```

**Shift+K** cycles focus editor → agent → shell. **Shift+N** toggles notes. **Shift+L** (app-wide) opens the next non-muted session. **Escape** closes the workspace.

Startup (renderer `App.tsx`): `ensureGitHubApi()` then `ensureFishShell()` — progress on the status bar; fish cache cleared in main after install so new shell PTYs pick up fish.

---

## 5. Per-agent extension points

Each agent appears in the **shared registry** and in **one switch (or helper) per behavior** in main. Adding an agent is mechanical.

### 5.1 Required: register the agent

`src/shared/agents.ts`:

```ts
export type AgentId = 'claude' | 'cursor' | 'gemini' | 'codex' | 'newAgent';

export const AGENTS: AgentDefinition[] = [
  {
    id: 'newAgent',
    name: 'New Agent',
    description: 'Shown in the picker',
    binary: 'newagent-cli',                    // probed via command -v
    instructions: { home: '.newagent', filename: 'AGENTS.md' },
  },
];
```

That alone enables: picker card, Agent Data instructions editor (`~/…/.newagent/AGENTS.md`), session row chip, greyed-out state when binary missing.

### 5.2 Required: launch command

`src/main/agents.ts`:

```ts
case 'newAgent':
  return buildResumable('newagent-cli', 'resume --last', options);
  // or: return { shellCommand: 'newagent-cli' };
```

`buildResumable(base, resumeArgs, options)` appends resume args when `options.previouslyStarted` is true (`session.lastStartedAt !== null`, read in the PtyStart handler before `markSessionStarted`).

For history-aware resume (like Claude’s `~/.claude/projects/<encoded-cwd>/*.jsonl`), follow `buildClaudeCommand`.

### 5.3 Optional: billing / spend

`src/main/agent-data.ts` — case in `getAgentSpend`:

```ts
case 'newAgent':
  return { kind: 'plan', ...(await detectNewAgentBilling()) };
```

| `billing` | Meaning |
| --- | --- |
| `metered` | API key / per-token |
| `subscription` | Flat plan |
| `free` | Free tier / quota |
| `unknown` | Not signed in or unclear |

Return `{ kind: 'cost', cost, tokens, date, billing, note }` if you integrate a local usage tool (see Claude + `usage.ts` / ccusage).

### 5.4 Optional: chip colour

`src/renderer/styles/global.css` — `.session-agent-tag.agent-newAgent { … }`

### 5.5 That’s it

Worktree lifecycle, PTY management, Git panel, and persistence are agent-agnostic.

---

## 6. IPC contract

Renderer → main only through `src/preload/index.ts`. Channel names live in `src/shared/ipc-channels.ts`.

To add a capability:

1. Add a constant to `ipc-channels.ts`
2. Register `ipcMain.handle` / `ipcMain.on` in `ipc.ts`
3. Expose on the `api` object in preload
4. Types flow via `CWApi` and `src/renderer/global.d.ts`

**Prefer `invoke` + validated args** for anything security-sensitive. Fire-and-forget `send` is used for PTY input resize (high volume).

Handlers that accept a **filesystem path** from the renderer today: `RevealInFinder`, `OpenInVSCode`, `OpenInTerminal`, `PickDirectory` (user dialog). Safer pattern for new features: pass `sessionId` only and resolve paths in main from `sessions.json`.

---

## 7. Security

### 7.1 Claims you can stand behind

| Claim | True? |
| --- | --- |
| No in-repo HTTP client (`fetch`, `http`, `axios`, …) | Yes — grep `src/` |
| No telemetry / auto-update in this repo | Yes |
| Renderer isolated from Node (`contextIsolation`, no `nodeIntegration`) | Yes |
| Git argv via `execFile`, not shell interpolation | Yes — `git.ts` |
| Session names restricted before path/branch use | Yes — `NAME_PATTERN` in `sessions.ts` |
| Built-in agent commands are literals, not user-built shell | Yes — `agents.ts` |
| Zero network ever | **No** — subprocesses may network (see below) |
| Only touches code dir + userData | **No** — also agent homes, optional brew/gh/fish/npm, tmp GraphQL input files |

### 7.2 Electron hardening

```ts
// src/main/index.ts
contextIsolation: true,
nodeIntegration: false,
sandbox: false,  // node-pty; mitigate with minimal contextBridge only
```

The renderer never receives `ipcRenderer`. Only methods on `window.api` are callable.

### 7.3 Subprocess inventory

Use this when reviewing PRs:

| Mechanism | Used for | User input in command string? |
| --- | --- | --- |
| `execFile('git', argv, { cwd })` | All git operations | No — paths/refs in argv |
| `execFile('osascript', argv)` | Terminal.app `cd`, gh auth terminal | Path escaped in AppleScript string |
| `execFile('which'/'code', …)` | VS Code CLI resolution, fish lookup | Fixed argv |
| `execFile(shell, ['-lic', cmd])` | Agent detection, gh-cli/fish-setup brew | `cmd` built from literals in our code |
| `execFile('winget', argv)` | Windows git/gh install | Fixed argv |
| `execFile(npx\|bun, argv)` | ccusage for Claude spend | Pinned package version in argv |
| `exec(osascript shell string)` | Legacy OpenInITerm IPC | Worktree path escaped |
| `pty.spawn(shell, ['-lic', launch.shellCommand])` | Agent REPL | `shellCommand` from `agents.ts` literals |
| `pty.spawn(resolvedShell, ['-l'])` | Built-in shell (fish preferred) | No user command string |
| `pty.spawn(nvim, argv, …)` | Flight Deck Neovim | Fixed argv; config path from userData |
| `runInLoginShell('gh api graphql --input …')` | GitHub Stats | GraphQL query from our code; temp path in `tmpdir` |
| `shell.openPath(path)` | Finder reveal | Path from IPC (UI: session path) |

### 7.4 Shell injection rules for contributors

1. **Never** pass session names, repo names, wizard answers, or task text into a shell command string.
2. **Git:** always `execFile('git', [...], { cwd: worktreePath })`.
3. **New agents:** `binary` and launch args must be string literals in source. If you need dynamic flags, use `execFile` on the CLI binary with an argv array, not `-lic` string concatenation.
4. **Agent detection:** only registry `binary` strings inside `command -v …`.
5. **Avoid new `exec(`** — prefer `execFile` with argv. If you must use a shell, document it in README Security and this section.
6. **Auth files:** parse JSON defensively; never interpolate file contents into shell commands.
7. **API keys:** read `process.env` in main only; never send keys to the renderer.

### 7.5 Network (not in TypeScript, but real)

Subprocesses may use the network:

- `git fetch` / remotes
- Agent CLIs → vendor APIs
- `gh auth status`, `gh api graphql` (GitHub Stats), `brew install` (git/gh/fish), `winget install`
- `npx --yes ccusage@<pin>` → npm registry when uncached

Document new subprocesses that can download or phone home. **Neovim** itself is local; only add network-bearing plugins to the managed config deliberately.

### 7.6 Filesystem scope

| Area | Access |
| --- | --- |
| `settings.codeDir` | List repos, global session cwd, worktree parent paths |
| userData JSON | Read/write sessions, settings, tasks |
| userData nvim config | Generated `init.lua`, plugin tree (`nvim-config.ts`) |
| `~/agent-home/…` | Instructions read/write per `AgentDefinition` |
| Agent auth paths | Read-only for billing chips (`agent-data.ts`) |
| Worktree paths | Git panel + PTY cwd; paths originate from git status inside that worktree |
| `os.tmpdir()` | Short-lived JSON files for `gh api graphql --input` |

### 7.7 Adding an agent — checklist

- [ ] `binary` and `shellCommand` parts are literals
- [ ] No new `exec(` without security review
- [ ] Auth/usage file parsing is try/catch; no shell echo of secrets
- [ ] Billing detection does not exfiltrate file contents to renderer beyond display strings you control
- [ ] If spawn needs network install, note it in PR / README
- [ ] Optional: chip CSS class

### 7.8 Validation greps

```sh
# No first-party HTTP client
grep -rE 'fetch\(|http\.|https\.|axios|undici|net\.connect' src

# Subprocess surface (review every match)
grep -rE 'execFile|exec\(|pty\.spawn' src

# Per-agent switches
grep -n "case '" src/main/agents.ts src/main/agent-data.ts

# Registry
grep -n 'AGENTS' src/shared/agents.ts

# Session name gate
grep -n 'NAME_PATTERN' src/main/sessions.ts

# WebPreferences
grep -n 'contextIsolation\|nodeIntegration\|sandbox' src/main/index.ts
```

---

## 8. Related docs

- [README.md](./README.md) — user-facing features, install, and security summary for readers validating trust
- [src/shared/agents.ts](./src/shared/agents.ts) — current agent list
- [src/shared/wizard.ts](./src/shared/wizard.ts) — default session wizard
