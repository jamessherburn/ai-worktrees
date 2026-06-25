# AGENTS-README

Architecture guide for contributors: how the pieces connect, how data flows, and what to respect when you change the main process or IPC.

For install, daily use, and a user-facing security summary, see [README.md](./README.md).

---

## 1. The story of a session

When someone creates a session, the app validates the name, resolves the repo’s default branch, optionally fetches from `origin`, and runs `git worktree add` beside the repo. The new row in `sessions.json` stores the worktree path, branch, agent id, and any labels.

Selecting a session in the sidebar mounts (or reveals) an xterm.js view. The renderer calls `pty.start(sessionId)`. The main process looks up the session and builds a launch command in `agents.ts` (`claude --continue`, `cursor-agent resume`, etc. when resuming). A cwd probe checks whether the agent has saved state for that worktree path; if so, resume args are appended. The PTY spawns at `session.worktreePath`. Output streams over IPC to xterm; keystrokes go back through `pty.write`. When you switch away, the PTY keeps running and accumulates a backlog so reconnecting replays recent output.

Separately, each session *may* have a **shell PTY** in the bottom dock (`shell-pty-manager.ts`). That is a normal login shell (fish when available) at the session’s `worktreePath`. Agent and shell are independent processes with independent backlogs.

Deleting a session kills both PTYs, removes the JSON entry, clears saved agent conversations for that session (`clearAgentSessionData` in `agents.ts` — Claude, Cursor, Codex home dirs and local `.cursor`/`.codex` where safe), removes the worktree, and optionally the branch. Creating a session also clears stale agent data at the new path so a reused name does not resume an old chat.

The **Cleanup** modal (sidebar icon, next to Agent Data) scans for leftover branches, worktrees, and agent session folders not tied to active sessions and lets you delete them in bulk or selectively.

On startup, `purgeRemovedGlobalSessions()` in `migrate.ts` strips any legacy `global: true` rows from `sessions.json` and deletes deprecated `global-*` directories under userData.

Nothing in this flow scans the OS for other agent processes. The sidebar lists only sessions in `sessions.json`.

---

## 2. Process model

Electron splits the app into three layers:

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React + xterm.js)                            │
│  No Node. No filesystem. No child_process.              │
└───────────────────────────┬─────────────────────────────┘
                            │ window.api.*
┌───────────────────────────▼─────────────────────────────┐
│  Preload (contextBridge)                                │
│  Typed façade over ipcRenderer.invoke / on              │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC channels (shared/ipc-channels.ts)
┌───────────────────────────▼─────────────────────────────┐
│  Main (Node + node-pty)                                 │
│  git, sessions, settings, diary, agent spawn, dialogs │
└─────────────────────────────────────────────────────────┘
```

**Why it matters:** every new capability should land in main, get a channel name in `shared/ipc-channels.ts`, expose one method on `preload/index.ts`, and type it on `CWApi` / `renderer/global.d.ts`. The renderer never imports `electron` or `fs`.

Window creation (`main/index.ts`) uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: false` (node-pty requirement). On quit, main sends SIGINT to agent and shell PTYs before exit.

---

## 3. UI map

The app has a single workspace layout (no view switcher):

| Piece | File(s) | Role |
| --- | --- | --- |
| Shell | `renderer/App.tsx` | Session state, shortcuts, dock visibility, modals |
| Sidebar | `components/Sidebar.tsx` | Session list, labels, mute, context menu |
| Agent terminal | `components/Terminal.tsx` | xterm + agent PTY |
| Shell panel | `components/BuiltInTerminalPanel.tsx` | xterm + shell PTY |
| Git panel | `components/GitPanel.tsx` | Status / diff / file actions |
| Bottom dock | `components/BottomDock.tsx` | Resizable split between dock panels |
| New session | `components/NewSessionModal.tsx` | Repository → Agent → Details wizard |
| To Do | `components/TodoModal.tsx` | Global tasks (`diary.json`) |
| Skills bar | `components/WorktreesSkillPrompter.tsx` | Slash-command skills prompt (bottom bar) |
| Skills editor | `components/WorktreesSkillsEditor.tsx` | Settings → Skills tab |
| Settings | `components/SettingsModal.tsx` | General, Skills, Labels, Shortcuts tabs |
| Agent Data | `components/AgentDataModal.tsx` | Instructions + spend per agent |
| Cleanup | `components/CleanupModal.tsx` | Leftover branches, worktrees, agent sessions |

Per-session **panel prefs** (shell/git open or closed) live in renderer `localStorage` (`session-panel-prefs`), not in `settings.json`. Cycling sessions restores each session’s own dock state.

Keyboard shortcuts are defined in `shared/app-shortcuts.ts` and handled in `App.tsx` (capture phase; skipped when modals are open or a form field is focused — except **Shift+J** from the skills bar, which cycles focus away).

### Skills (Worktrees Skills)

Cross-agent reusable prompts live in `settings.json` as `worktreesSkills` (see `shared/worktrees-skills.ts`). They are **not** migrated from the legacy `sessionPrompts` quick-prompt setting.

- **Settings → Skills** — `WorktreesSkillsEditor.tsx` edits name, description, and prompt body.
- **Bottom bar** — `WorktreesSkillPrompter.tsx` provides `/skill-name` autocomplete; first **Enter** commits the slash display, second **Enter** expands the prompt (plus any trailing text) and submits via `Terminal.submitPrompt` (`shared/session-prompt-submit.ts`). **Esc** or the **×** button clears the field.
- **Focus** — **Shift+J** includes the skills bar in the agent ↔ shell ↔ skills cycle (`skillPrompterFocusRef` in `App.tsx`).
- **Mirror rendering** — `PrompterMirror` highlights committed `/skill` tokens and the active slash query. Slashes that are not skill references (e.g. in URLs or file paths) must be treated as plain text so the scan always advances; otherwise pasted text with multiple `/` characters can hang the renderer.

Default skills: **Summarise Session**, **Create Pull Request** (`DEFAULT_WORKTREES_SKILLS`).

Import/export: `settings-import-export.ts` includes `worktreesSkills` in the exported JSON document; import normalizes via `normalizeWorktreesSkills`.

---

## 4. Session lifecycle (detailed)

### Create

```
NewSessionModal
  → detectAgents()                    agent-detection.ts
  → createSession({ repoPath, name, agentId, labelIds? })
       sessions.ts
         NAME_PATTERN check
         resolveDefaultBranch, optional fetchBranch
         addWorktree → git.ts
         clearAgentSessionData(worktreePath)
         append to sessions.json
```

### Open / switch

```
Sidebar onSelect(id)
  → setActiveId; add id to openedIds
  → TerminalView mounts or becomes visible
  → pty.start → startPty in pty-manager.ts
       if PTY exists: reattach + backlog replay
       else: cwd = session.worktreePath
       agents.buildLaunchCommand(cwd) — canResume from AGENT_RESUME_PROBES
       → pty.spawn($SHELL, ['-lic', cmd], { cwd })
       → markSessionStarted on first spawn
```

### Built-in shell (on demand)

```
BuiltInTerminalPanel mount
  → shellPty.start(sessionId)
       shell-pty-manager.ts: same reattach pattern
       spawn resolved shell (fish preferred via resolve-shell-path.ts)
```

Concurrent `shellPty.start` calls for one session are deduplicated with an in-flight lock so cycling panels does not spawn two fish processes.

### Status decoration

```
listSessions IPC
  → listSessions() from store
  → decorate(): running if agent PTY alive; orphaned if worktree path missing
  → attach activity from pty-manager when running
```

### Delete

```
DeleteSession
  → killPty + killShellPty
  → deleteSession:
       clearAgentSessionData(worktreePath)   agents.ts
       worktree remove + optional branch delete
  → store removes JSON entry

createSession (after worktree add)
  → clearAgentSessionData(worktreePath)          stale agent data safety net

CleanupList / CleanupDelete
  → cleanup.ts + agent-session-scan.ts
       list/delete leftover branches, worktrees, agent session folders
```

---

## 5. Code structure

```
src/
├── main/
│   ├── index.ts              Window, theme, graceful PTY shutdown
│   ├── ipc.ts                All ipcMain handlers
│   ├── migrate.ts            Legacy userData copy; purge deprecated global sessions
│   ├── sessions.ts           CRUD + NAME_PATTERN
│   ├── git.ts                worktree + status/diff/stage (execFile only)
│   ├── repos.ts              Scans settings.codeDir
│   ├── pty-manager.ts        Agent PTY + activity + backlog
│   ├── shell-pty-manager.ts  Shell PTY + backlog + start dedup
│   ├── resolve-shell-path.ts fish / login shell
│   ├── fish-setup.ts         Optional fish install (brew)
│   ├── gh-cli.ts             Optional git/gh install + gh auth helper
│   ├── agents.ts             Per-agent launch command builder + clearAgentSessionData
│   ├── agent-session-scan.ts Scan ~/.claude, ~/.cursor, ~/.codex; resolve encoded paths
│   ├── cleanup.ts            Leftover branches/worktrees/agent sessions
│   ├── path-created-at.ts    Created-at timestamps for cleanup list sorting
│   ├── agent-detection.ts    `command -v` in login shell (cached)
│   ├── agent-data.ts         Instructions I/O + billing/spend
│   ├── usage.ts              Claude spend via pinned ccusage
│   ├── settings.ts           settings.json normalize/strip legacy keys
│   ├── diary.ts              diary.json (to-do items)
│   ├── vscode.ts             `code --reuse-window`
│   └── store.ts              Serial JSON read/write
│
├── preload/
│   └── index.ts              contextBridge → window.api
│
├── renderer/
│   ├── App.tsx               Layout, shortcuts, panel prefs
│   ├── modal-layout.ts       Expanded modal sizing (title bar safe area)
│   ├── components/           Sidebar, Terminal, modals, Git, dock, …
│   └── styles/global.css
│
└── shared/
    ├── agents.ts             AGENTS registry + AgentId
    ├── app-shortcuts.ts      Shift+* shortcuts
    ├── types.ts              Session, Settings, TaskItem, git types
    ├── ipc-channels.ts       Channel name constants
    ├── session-labels.ts     Labels, mute, chips
    ├── session-sidebar-order.ts  Shift+N ordering
    ├── worktrees-skills.ts       Skills defaults, slash parsing, normalization
    ├── tasks.ts              To-do sections + filters
    ├── settings-import-export.ts
    └── theme.ts
```

Path alias `@shared/*` is configured in `electron.vite.config.ts` and the tsconfig projects.

---

## 6. Persistence

| File | Contents |
| --- | --- |
| `sessions.json` | `{ sessions: Session[] }` |
| `settings.json` | `codeDir`, `theme`, `sessionLabels`, `worktreesSkills` (legacy keys stripped on read) |
| `diary.json` | To-do items (sections: `todo`, `doing`, `done`) |

userData path: `~/Library/Application Support/ai-worktrees/` (dev) or `~/Library/Application Support/AI Worktrees/` (packaged).

---

## 7. Adding an agent

### 7.1 Register

`src/shared/agents.ts`:

```ts
export type AgentId = 'claude' | 'cursor' | 'gemini' | 'codex' | 'newAgent';

export const AGENTS: AgentDefinition[] = [
  {
    id: 'newAgent',
    name: 'New Agent',
    description: 'Picker subtitle',
    binary: 'newagent-cli',
    instructions: { home: '.newagent', filename: 'AGENTS.md' },
  },
];
```

This enables the picker, Agent Data instructions path, and greyed-out state when `binary` is missing.

### 7.2 Launch command

`src/main/agents.ts`:

```ts
case 'newAgent':
  return buildResumable('newagent-cli', 'resume --last', options);
```

Use string **literals** only. For cwd-sensitive resume (like Claude’s project dirs), add a probe in `AGENT_RESUME_PROBES`. Pass `storageRoots` in `LaunchOptions` when agent config lives outside the default home dirs. Pass an explicit `canResume` only when resume eligibility is known out-of-band.

If the agent stores per-project session data under its home directory, add paths to `agentSessionDataPaths` in `agents.ts` so delete, create, and cleanup can clear them.

### 7.3 Optional: billing

`src/main/agent-data.ts` — add a `getAgentSpend` case. Return `{ kind: 'plan' | 'cost' | … }` as documented in existing agents.

### 7.4 Optional: chip colour

`src/renderer/styles/global.css` — `.session-agent-tag.agent-newAgent { … }`

Worktree lifecycle, PTY plumbing, and Git panel need no agent-specific changes.

---

## 8. IPC conventions

1. Add a constant to `shared/ipc-channels.ts`
2. Register in `main/ipc.ts` (`handle` for request/response, `on` for PTY stream volume)
3. Expose on `preload/index.ts` → `window.api`
4. Extend `CWApi` in `renderer/global.d.ts`

**Prefer `invoke` with validated args** for anything sensitive. PTY input/resize uses fire-and-forget `send`.

Handlers that accept a **filesystem path** from the renderer today: `RevealInFinder`, `OpenInVSCode`, `OpenInTerminal`, `OpenInITerm`, `PickDirectory`. Safer pattern for new features: pass `sessionId` only and resolve paths in main from `sessions.json`.

**Cleanup** (`CleanupList`, `CleanupDelete`): main resolves delete targets from a fresh scan snapshot; renderer sends item ids only.

---

## 9. Security

### 9.1 Claims

| Claim | Holds? |
| --- | --- |
| No in-repo HTTP client | Yes — grep `src/` |
| No telemetry / auto-update in source | Yes |
| Renderer isolated from Node | Yes |
| Git via `execFile` argv, not shell strings | Yes — `git.ts` |
| Session names gated before path use | Yes — `NAME_PATTERN` |
| Agent commands are literals | Yes — `agents.ts` |
| Zero network ever | **No** — subprocesses may network |
| Sandbox around git/agents | **No** — same as Terminal |

### 9.2 Subprocess inventory

| Mechanism | Purpose | User text in shell string? |
| --- | --- | --- |
| `execFile('git', argv, { cwd })` | All git ops | No |
| `execFile('code', …)` | VS Code | Fixed argv |
| `execFile('osascript', …)` | Terminal.app helper | Path escaped in script |
| `execFile(shell, ['-lic', cmd])` | Agent detection, brew/gh/fish setup | `cmd` from our literals |
| `execFile('winget', argv)` | Windows git/gh (if used) | Fixed argv |
| `execFile(npx\|bun, argv)` | ccusage for Claude spend | Pinned package in argv |
| `exec(osascript …)` | Legacy OpenInITerm | Path escaped |
| `pty.spawn(shell, ['-lic', launch.shellCommand])` | Agent REPL | From `agents.ts` only |
| `pty.spawn(resolvedShell, ['-l'])` | Built-in shell | No user command |
| `shell.openPath(path)` | Finder | Path from session record via IPC |

### 9.3 Rules for contributors

1. Never put session names, task text, or label names into a shell command string.
2. Git: always `execFile('git', [...], { cwd: worktreePath })`.
3. New agents: `binary` and launch args are literals; use argv arrays if you need dynamic flags.
4. Agent detection: only registry `binary` names inside `command -v`.
5. Avoid new `exec(` — prefer `execFile`. Document exceptions here and in README.
6. Parse auth JSON defensively; never echo secrets into shell commands.
7. Do not send API keys to the renderer.

### 9.4 Network (via subprocesses)

- `git fetch` / remotes  
- Agent CLIs → vendor APIs  
- `gh` install / `gh auth login`  
- Homebrew / winget when setup runs  
- `npx ccusage@<pin>` → npm when uncached  

Document new subprocesses that download or phone home in PRs.

### 9.5 Filesystem scope

| Area | Access |
| --- | --- |
| `settings.codeDir` | Repo scan, worktree parent |
| userData JSON | sessions, settings, diary |
| Agent homes | Instructions read/write per `AgentDefinition`; per-project session dirs scanned/deleted by cleanup |
| Agent auth paths | Read-only for billing UI |
| Worktree paths | Git panel + shell PTY cwd + agent PTY cwd |
| Agent session scan | Read (and delete on cleanup) under `~/.claude/projects`, `~/.cursor/projects`, `~/.cursor/chats`, `~/.codex/sessions`, `~/.codex/projects`, and local `.cursor`/`.codex` in worktrees |

### 9.6 Agent checklist

- [ ] `binary` and launch parts are literals  
- [ ] No new `exec(` without review  
- [ ] Auth parsing is try/catch; no secret leakage to renderer  
- [ ] Optional chip CSS  

### 9.7 Validation greps

```sh
grep -rE 'fetch\(|http\.|https\.|axios|undici|net\.connect' src
grep -rE 'execFile|exec\(|pty\.spawn' src
grep -n "case '" src/main/agents.ts src/main/agent-data.ts
grep -n 'AGENTS' src/shared/agents.ts
grep -n 'NAME_PATTERN' src/main/sessions.ts
grep -n 'contextIsolation\|nodeIntegration\|sandbox' src/main/index.ts
```

---

## 10. Related docs

- [README.md](./README.md) — user guide and trust summary  
- [src/shared/agents.ts](./src/shared/agents.ts) — current agent list  
- [src/shared/app-shortcuts.ts](./src/shared/app-shortcuts.ts) — keyboard shortcuts  
