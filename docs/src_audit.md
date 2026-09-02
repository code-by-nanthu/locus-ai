# Locus CLI — `/src` Audit vs PRD & Plan

Audit of all 5 source files against `docs/prd.md` and `docs/plan.md`.

---

## File-by-File Status

### [`src/index.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/index.tsx) — 7 lines

```tsx
#!/usr/bin/env node
render(<App />);
```

| PRD Requirement | Status | Gap |
|---|---|---|
| Multi-mode command router (`locus config`, `locus commit`, `locus export`, `locus ui`) | ❌ Missing | Blindly renders `<App />`. No CLI argument parsing at all. |
| `--session <id>` flag to restore past sessions | ❌ Missing | No `process.argv` handling. |
| Skip setup wizard when config exists | ❌ Missing | Config is never read here. |

**Verdict:** This file is a stub. It is the **primary blocker** for Phase 1, 2, and 3 of the plan. It must be expanded to parse CLI args and route to the correct sub-command before any other Phase can ship.

---

### [`src/llm.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/llm.ts) — 31 lines

| PRD Requirement | Status | Gap |
|---|---|---|
| Provider abstraction (Ollama / LM Studio) | ✅ Done | `getLocalClient()` and `fetchLocalModels()` work correctly. |
| Hardcoded server addresses (`localhost:11434`, `localhost:1234`) | ⚠️ Gap | PRD §2.2 requires these to be user-configurable via `~/.config/locus/config.json`. They are currently hardcoded strings. |
| Embedding endpoint support | ❌ Missing | Phase 5 (RAG) requires calling `/api/embeddings`. No such function exists. |
| Network peer proxy mode | ❌ Missing | Phase 3.4 (`locus ui`) requires proxying requests from a web client. Out of scope for this file now, but the `getBaseURL()` function needs to accept a custom host. |

**Verdict:** Fundamentally sound. Only needs one change for Phase 1: accept a `baseURL` override from config rather than hardcoding `localhost`.

---

### [`src/tools.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/tools.ts) — 111 lines

| PRD Requirement | Status | Gap |
|---|---|---|
| Core tool execution (read/write/run/search) | ✅ Done | All 4 tools implemented and working. |
| Absolute path safety | ✅ Done | `path.isAbsolute()` guard is in place. |
| File token budget warning | ❌ Missing | PRD §2.3 / Plan §5.1 require an `estimateTokens()` helper (`charCount / 4`) before `read_file` executes. Large files silently overflow context right now. |
| `run_command` sandboxing | ❌ Missing | PRD §2.4 requires commands run in an isolated shell/container. Currently executes directly on the host with no restrictions. |
| Auto-approve whitelist check | ❌ Missing | The security gate lives in `ui.tsx`. `tools.ts` has no concept of which tools are whitelisted — that logic needs to flow through from `config.ts` (Phase 2). |
| `search_workspace` result cap | ⚠️ Gap | Capped at 100 files, which is good for tokens but not configurable. Will hit issues on large monorepos. |

**Verdict:** Core is solid. Two clear Phase 1/2 additions needed: `estimateTokens()` and a way to receive the auto-approve whitelist from config.

---

### [`src/SyntaxHighlighter.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/SyntaxHighlighter.tsx) — ~100 lines

| PRD Requirement | Status | Gap |
|---|---|---|
| Safe streaming render (no regex OOM) | ✅ Done | Replaced with stateful linear `O(N)` scanner. |
| Code block detection mid-stream | ✅ Done | `isInCodeBlock` flag flushes partial blocks safely. |
| Inline markdown (bold, italic, code) | ⚠️ Gap | Old highlighter rendered `**bold**`, `*italic*`, `` `inline code` ``. The new stateful parser only has a basic token split inside code blocks — prose markdown is rendered as plain text. |
| Multi-language highlighting | ⚠️ Gap | The keyword regex inside `flushCodeBlock` only covers JS/TS keywords. Python, Rust, Go, SQL are not colored. |

**Verdict:** Stable and OOM-safe. The tradeoff made to fix OOM was losing prose markdown rendering. This is a UX gap worth restoring after core features are stable.

---

### [`src/ui.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/ui.tsx) — 980 lines *(the main orchestrator)*

| PRD Requirement | Status | Gap |
|---|---|---|
| Streaming agent loop | ✅ Done | `while (keepRunningLoop)` with abort support. |
| Security approval gateway (Y/N) | ✅ Done | `requestApproval()` + `pendingApproval` state. |
| Pseudo-tool-call fallback | ✅ Done | `parsePseudoToolCall()` intercepts raw JSON from weak models. |
| Big ASCII banner + branding | ✅ Done | `BigLogo` component with per-letter color gradient. |
| Dynamic welcome suggestions | ✅ Done | Fetched from model on first load with `AbortController`. |
| Input history (↑↓ arrows) | ✅ Done | `inputHistory` + `historyIndex` state. |
| Esc to abort stream | ✅ Done | `abortControllerRef.current.abort()`. |
| React.memo on message components | ✅ Done | `UserMessage`, `AgentMessage`, `ToolEntry` all memoized. |
| Skip setup wizard if config exists | ❌ Missing | Always starts at `SELECT_PROVIDER`. No config read on mount. |
| Session auto-save on every AI turn | ❌ Missing | History lives only in React state. Lost on exit. |
| `Ctrl+E` export hotkey | ❌ Missing | Not implemented. |
| Auto-approve whitelist (Phase 2) | ❌ Missing | `GUARDED_TOOLS` is a hardcoded `Set`. No config integration. |
| Token budget warning in approval gate | ❌ Missing | Approval gate shows filename/command, not token estimate. |
| `locus config` settings screen | ❌ Missing | No settings UI step in the state machine. |

**Verdict:** The most complete file in the project. All current features work well. But it is also the file that needs the most additions from Phase 1 and 2.

---

## Missing Files (Required by Plan)

These files are explicitly called out in `docs/plan.md` but **do not exist yet**:

| File | Phase | Purpose |
|---|---|---|
| `src/config.ts` | Phase 1 | Read/write `~/.config/locus/config.json` |
| `src/session.ts` | Phase 1 | Session ID generation, load/save chat history |
| `src/commands/commit.ts` | Phase 3 | `locus commit` — semantic git commit drafter |
| `src/commands/export.ts` | Phase 3 | `locus export` — Markdown session exporter |
| `src/commands/ui.ts` | Phase 3 | `locus ui` — self-hosted web dashboard |
| `src/indexer.ts` | Phase 5 | SQLite RAG embedding index |
| `src/commands/watch.ts` | Phase 5 | `chokidar` file watcher daemon |

---

## Priority Action Plan

Based on this audit, recommended implementation order:

### 🔴 Phase 1 (Do First — Unblocks Everything)
1. **Create `src/config.ts`** — JSON read/write for `~/.config/locus/config.json`
2. **Expand `src/index.tsx`** — parse `process.argv`, skip setup if config exists
3. **Update `src/ui.tsx`** — read config on mount, skip `SELECT_PROVIDER/MODEL` steps
4. **Create `src/session.ts`** — auto-save history to `~/.config/locus/history/`
5. **Update `src/llm.ts`** — accept `baseURL` override from config

### 🟡 Phase 2 (Security Ergonomics)
6. **Update `src/config.ts`** — add `autoApprove: string[]` field
7. **Update `src/ui.tsx`** — check config whitelist before calling `requestApproval()`
8. **Add `estimateTokens()` to `src/tools.ts`** — warn before reading large files

### 🟢 Phase 3 (Command Router)
9. **Expand `src/index.tsx`** — route `locus config`, `locus commit`, `locus export`
10. **Create `src/commands/commit.ts`** and `src/commands/export.ts`
