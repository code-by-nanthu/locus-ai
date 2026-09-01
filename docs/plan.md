# Locus CLI — Implementation Plan

> This document covers the phased implementation plan for expanding Locus CLI into a fully
> standalone, production-grade local AI agent. Features are grouped by dependency order so
> each phase produces a shippable, usable increment.

---

## Current State (Baseline)

| Layer | Status |
| --- | --- |
| React Ink terminal UI | ✅ Done |
| Streaming agent loop | ✅ Done |
| Tool execution (read/write/run/search) | ✅ Done |
| Security approval gateway | ✅ Done |
| Pseudo-tool-call fallback (weak models) | ✅ Done |
| Big ASCII banner, Locus branding | ✅ Done |
| Dynamic welcome suggestions | ✅ Done |

---

## Phase 1 — Global Config & Session Persistence

**Goal:** Eliminate the provider/model setup menu on every launch. Remember conversations.

### 1.1 Global Config Manager (`locus config`)

- **Config file:** `~/.config/locus/config.json`
  - Stores: `defaultProvider`, `defaultModel`, `autoApprove` tool whitelist, theme preferences.
- **CLI flag:** Running `locus config` opens an interactive Ink settings editor.
- **On startup:** If `config.json` exists, skip the setup wizard and jump straight to chat.
- **Files to create/modify:**
  - `src/config.ts` — read/write helpers for `~/.config/locus/config.json`
  - `src/ui.tsx` — skip `SELECT_PROVIDER` + `SELECT_MODEL` steps if defaults are saved
  - `src/index.tsx` — parse `--config` flag to open settings mode

### 1.2 Session History Recorder

- **Storage:** `~/.config/locus/history/<session-id>.json` (each session is a JSON file)
- **Session ID:** Generated from timestamp on first message (e.g., `2026-09-01T20:42`)
- **CLI flag:** `locus --session <id>` restores a past session into history state
- **Export hotkey:** `Ctrl+E` in chat dumps the current session to a formatted Markdown file (`locus-session-<date>.md`)
- **Files to create/modify:**
  - `src/session.ts` — session ID generation, load/save helpers
  - `src/ui.tsx` — auto-save history on every AI turn, `Ctrl+E` export handler

---

## Phase 2 — Security Ergonomics (Auto-Approve Whitelist)

**Goal:** Reduce approval fatigue without weakening security.

### 2.1 Tool Rule Configuration

- **Config key:** `autoApprove: string[]` in `~/.config/locus/config.json`
  - Example: `["read_file", "search_workspace"]` — these run silently.
  - `run_command` and `write_file` still prompt unless explicitly whitelisted.
- **`locus config`** exposes a toggle UI for each tool.
- **Files to modify:**
  - `src/ui.tsx` — in the security gate, check `config.autoApprove` before calling `requestApproval()`

### 2.2 Path-Scoped Whitelist (optional extension)

- Allow patterns like `write_file:src/**` — auto-approve writes inside `src/` but prompt for writes elsewhere.
- Stored as: `autoApprove: [{ tool: "write_file", pathPattern: "src/**" }]`

---

## Phase 3 — Expanded CLI Commands

**Goal:** Locus becomes a multi-mode tool, not just a chat window.

### 3.1 Command Router (`src/index.tsx`)

```
locus              → launch interactive chat (current default)
locus config       → open interactive settings editor
locus export       → export last session to Markdown (no chat UI)
locus commit       → run git diff, draft commit message, print to terminal
locus ui           → start embedded web server + open browser
```

### 3.2 `locus commit` — Semantic Git Commit Draftsman

- Runs `git diff --staged` via `run_command`
- Sends the diff to the local model with a concise commit-message prompt
- Outputs draft message to terminal; user can confirm (copies to clipboard) or edit
- **Files to create:**
  - `src/commands/commit.ts`

### 3.3 `locus export` — Markdown Session Exporter

- Reads the most recent session JSON from `~/.config/locus/history/`
- Formats it into a clean Markdown document with user/assistant turns, code blocks, and tool entries
- Saves to `./locus-session-<date>.md` in the current working directory
- **Files to create:**
  - `src/commands/export.ts`

### 3.4 `locus ui` — Self-Hosted Web Dashboard

- Boots a lightweight HTTP server (using `fastify` or `polka`) at `http://localhost:3000`
- Serves a minimal web UI that mirrors the terminal chat interface
- Communicates with the Ollama/LM Studio backend via the same `src/llm.ts` layer
- Same tool execution and security gateway, exposed via REST/WebSocket
- **Files to create:**
  - `src/commands/ui.ts` — server bootstrap
  - `src/web/` — HTML/JS frontend (single-file, no framework)

---

## Phase 4 — Distribution & Zero-Dependency Binary

**Goal:** Users run `locus` without Node.js or pnpm installed.

### 4.1 Single Binary Compilation

- Use **`pkg`** (`npm install -g pkg`) to compile `dist/index.js` + `node_modules` into:
  - `locus-macos-arm64`
  - `locus-macos-x64`
  - `locus-linux-x64`
  - `locus-win.exe`
- Add `build:pkg` script to `package.json`:

  ```json
  "build:pkg": "tsc && pkg dist/index.js --targets node18-macos-arm64,node18-linux-x64 --output bin/locus"
  ```

- **Files to modify:**
  - `package.json` — add `pkg` config block and `build:pkg` script

### 4.2 Global Installer Script

- `scripts/install.sh` — detects OS/arch, downloads the right binary from GitHub Releases, places it at `/usr/local/bin/locus`
- Users install with: `curl -fsSL https://raw.githubusercontent.com/.../install.sh | sh`

---

## Phase 5 — Advanced Context Engine (Local RAG)

**Goal:** Handle large codebases without blowing the model's context window.

### 5.1 Intelligent File Token Budgeting

- Before calling `read_file`, estimate token count (`charCount / 4` as a proxy)
- If the file exceeds a configurable threshold (default: 8,000 tokens), show a warning in the approval gate and offer to send a head/tail truncated version or a line-range subset
- **Files to modify:**
  - `src/tools.ts` — add `estimateTokens()` helper
  - `src/ui.tsx` — show budget warning in the approval UI

### 5.2 Embedded SQLite Document Index

- Use `better-sqlite3` to maintain `~/.config/locus/index.db`
- On `locus watch` or `search_workspace`, chunk and index source files by function/class boundary
- Semantic search via cosine similarity on stored embeddings (generated by the local model's embedding endpoint)
- **Files to create:**
  - `src/indexer.ts` — chunking, embedding, and SQLite storage
  - `src/commands/watch.ts` — file watcher daemon using `chokidar`

---

## Suggested Build Order

```
Phase 1  →  Phase 2  →  Phase 3 (commit + export first)  →  Phase 4  →  Phase 5
```

Start with **Phase 1** (config + session) as it delivers the highest daily-use value and
is a prerequisite for Phase 2's whitelist and Phase 3's export command.

---

## Open Questions

1. **Web UI framework:** Vanilla JS single-file or a lightweight bundled UI (Vite + Preact)?
2. **Embedding model:** Use Ollama's `/api/embeddings` endpoint, or ship `nomic-embed-text` as default?
3. **Binary distribution:** GitHub Releases + `install.sh`, or also publish to Homebrew tap?
4. **Network peer mode:** mTLS between peers, or plain HTTP on LAN (trust network)?
