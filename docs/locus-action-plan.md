# Locus — Engineering Action Plan

Derived from `prd.md` and an audit of the web dashboard client (`App.tsx`). This document is the work list, not a vision doc. Every item has an acceptance criterion so it can be closed unambiguously.

**Status legend:** `P0` blocks further feature work · `P1` next milestone · `P2` scheduled · `P3` deferred pending evidence

**Effort:** S = under a day · M = 1–3 days · L = 1–2 weeks · XL = more than two weeks

---

## 0. Correct the record first

The PRD marks Phase 1 as COMPLETED, but four claimed features have no client-side implementation. Fix the document before anyone plans against it.

| ID | Task | Effort |
|---|---|---|
| DOC-1 | Move session rename/delete, LLM-generated starter prompts, provider/model selection, and custom base-URL editing out of §2 into §3. The client calls only `/api/sessions`, `/api/session/:id`, `/api/chat`, `/api/approve`. | S |
| DOC-2 | Add a **Non-goals** section. At minimum: no remote access, no multi-user, no cloud sync, no telemetry. These define the threat model, so they have to be written down. | S |
| DOC-3 | Add a **Threat model** section naming the adversaries: a malicious web page in the user's browser, a prompt-injected file inside the workspace, a hostile or confused model, another local process. | S |
| DOC-4 | Add a **Supported matrix**: OS × arch × inference engine, with a definition of what "supported" means (CI-tested vs. best-effort). | S |
| DOC-5 | Add **success metrics**: eval-suite pass rate, p50 time-to-first-token per engine, install-to-first-response time, crash-free session rate. | S |

---

## 1. P0 — Security and correctness defects in shipped code

These are live defects, not roadmap items. Nothing in §3 or §4 of the PRD should start before this section closes.

### SEC-1 · Authenticate the local API — `L`

An unauthenticated HTTP server that executes shell commands is reachable by any process on the machine, and by any website the user visits via DNS rebinding. Once the Phase 2 auto-approve whitelist lands, that becomes remote code execution from a web page.

- Bind explicitly to `127.0.0.1`. Never `0.0.0.0`, never a LAN interface, no flag to change it.
- Generate a 32-byte random token per server start. Print the dashboard URL with the token attached; the SPA stores it in memory and sends it as `Authorization: Bearer`.
- Reject every `/api/*` request without a valid token, including SSE.
- No permissive CORS. `Origin` must be on an allowlist.

**Acceptance:** a `curl` to `/api/chat` without the token returns 401. A test page served from a different origin cannot reach the API.

### SEC-2 · Validate the `Host` header — `S`

Origin checks alone do not stop DNS rebinding, because after rebinding the origin genuinely *is* localhost.

```ts
const ALLOWED_HOSTS = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);

app.use((req, res, next) => {
  if (!ALLOWED_HOSTS.has(req.headers.host ?? '')) return res.status(421).end();
  next();
});
```

**Acceptance:** a request with `Host: attacker.example` is rejected with 421.

### EXEC-1 · Execute through argv, never a shell — `M`

- Replace any `exec`/`shell: true` path with `spawn(file, args, { shell: false })`.
- Any tool that genuinely requires a shell is permanently ineligible for auto-approval.
- Resolve the binary to a `realpath` before matching against rules, so `PATH` shadowing cannot smuggle a different executable past a whitelist.

**Acceptance:** `echo hi; rm -rf /tmp/x` runs as a single `echo` with three literal arguments. A test asserts this.

### EXEC-2 · Contain file tools inside the workspace — `M`

Resolve to `realpath` **then** assert containment under the workspace root. Resolving before symlink expansion is the classic escape.

```ts
const root = await fs.realpath(workspaceRoot);
const target = await fs.realpath(path.resolve(root, userPath));
if (target !== root && !target.startsWith(root + path.sep)) throw new PathEscape(target);
```

**Acceptance:** tests cover `../../etc/passwd`, a symlink pointing outside the root, `~` expansion, and a Windows UNC path.

### STATE-1 · Move conversation state to the server — `L`

`handleSend` posts the entire `history` array back on every turn, so the client is authoritative over tool results. A compromised page, or the model itself, can fabricate a record of a command that never ran. The client also invents tool-call IDs:

```ts
tool_calls: [{ id: 'call_' + Date.now(), ... }]   // fabricated
{ role: 'tool', name, content }                   // missing tool_call_id
```

OpenAI-compatible endpoints require `tool.tool_call_id` to match the assistant's `tool_calls[i].id`. Strict backends (vLLM, LM Studio) reject this shape; lenient ones mis-pair on parallel calls.

- `POST /api/chat` takes `{ sessionId, message }` only.
- The server owns the transcript, appends turns, and emits the real `tool_call_id` in the `tool_start` and `tool_result` SSE events.
- The client renders from what the server sends and never reconstructs assistant turns.

**Acceptance:** a session with two parallel tool calls round-trips through vLLM without a 400, and IDs pair correctly in the persisted log.

### TOOL-1 · Structured tool-result envelope — `S`

Both ends currently infer failure with `content.includes('"error":')`. A command that legitimately prints that string renders as failed; a failure without that key renders as success.

```ts
type ToolResult = {
  toolCallId: string;
  ok: boolean;
  errorCode?: 'denied' | 'timeout' | 'not_found' | 'exec_failed' | 'path_escape';
  exitCode?: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
};
```

**Acceptance:** every `includes('"error":')` and `includes('"denied": true')` is deleted from the codebase.

### TOOL-2 · Cancellation — `M`

There is no `AbortController` in `handleSend`. Closing the tab leaves the generation running and any child process alive.

- Client: thread a signal into the fetch; add a stop button that swaps in for send while generating.
- Server: on stream close, abort the upstream LLM request and kill the child process group (`spawn` with `detached: true`, then `process.kill(-pid)`).
- Per-tool wall-clock timeout with `SIGTERM` then `SIGKILL`.

**Acceptance:** stopping mid-`sleep 60` leaves no orphan in `ps`.

### TOOL-3 · Approval lifecycle — `M`

If `tool_auth_required` fires and the user reloads, the server holds a promise on that `authId` forever.

- TTL on pending approvals; deny on expiry.
- Invalidate all pending `authId`s when the owning stream closes.
- `authId` is single-use, bound to its session, and unguessable.
- The dialog must display exactly what will execute. Today it renders `args.command` while the server matches on `pattern`; if those can diverge you have a confused deputy — the user approves one thing and another runs.

**Acceptance:** a test asserts the approved string and the executed argv are byte-identical. Reload during a pending approval leaves no hung request.

### LOOP-1 · Agent loop guardrails — `S`

Max iterations per turn, max wall-clock per turn, max output bytes per tool, and detection of repeated identical tool calls. Surface the limit in the UI when it trips.

**Acceptance:** a deliberately looping fixture task terminates with a clear message instead of running until the context fills.

---

## 2. P1 — Make change safe

### EVAL-1 · Eval harness — `L`

This is the highest-leverage item in the plan and it is absent from the PRD. Without it you cannot tell whether a prompt tweak, a model swap, or a tool refactor regressed the agent.

- 20–30 scripted tasks over fixture repos, each with a programmatic assertion (file contents, exit code, expected tool sequence).
- Deterministic replay: record transcripts, replay them against the tool layer without an LLM.
- `locus eval --engine ollama --model qwen2.5-coder` prints pass rate and per-task diffs.
- Run in CI against one pinned local model.

**Acceptance:** pass rate is reported as a single number and a prompt change moves it measurably.

### CAP-1 · Capability detection and text-protocol fallback — `L`

Native tool-calling support across the eight supported engines is inconsistent. Many Ollama models ship no tool template; GPT4All and Oobabooga vary by loader. An agent that assumes `tools` works fails opaquely.

- Probe each provider/model once with a trivial tool call; cache the result in config.
- Fall back to a text protocol (ReAct or XML tool blocks) with a strict parser and exactly one repair retry.
- Surface the detected mode in the UI so users understand degraded behaviour.

**Acceptance:** a model with no tool template still completes the eval suite in fallback mode.

### RULES-1 · Auto-approve rules, done properly — `L`

PRD §3.3 as written whitelists on command strings. That is bypassable by construction: `;`, `&&`, `$( )`, backticks, newlines, aliases, `git -c core.pager='sh -c …'`. Depends on EXEC-1 and EXEC-2.

- Rules match on `realpath(binary)` plus an argv shape, never a raw string.
- Deny by default. `read_file` and `search_code` are auto-approvable inside the workspace; `run_command` and `write_file` always prompt unless an explicit rule matches.
- Every auto-approved decision writes an audit line to the session log.
- Rules live in config with a `schemaVersion` and are editable from the UI.

**Acceptance:** a red-team fixture of 20 escape attempts is fully blocked, with each attempt as a named test.

### OBS-1 · Structured logging and debug transcripts — `M`

JSON lines with a session ID, request ID, tool name, decision, duration. A `--debug` flag dumps the full transcript including raw model output. Support requests are unanswerable without this.

**Acceptance:** a bug report can be reproduced from a dumped transcript alone.

---

## 3. P1 — Close the gap between the PRD and the client

| ID | Task | Effort |
|---|---|---|
| UI-1 | Session rename and delete (`PATCH`/`DELETE /api/session/:id`) with an inline row menu and optimistic update. | M |
| UI-2 | Provider and model picker in a settings panel, backed by the existing config layer. Include a custom base-URL field with a connection test. | M |
| UI-3 | Stop-generation button (pairs with TOOL-2). | S |
| UI-4 | Dynamic starter prompts. Generate on a fresh chat, cache per workspace, fall back to static prompts on failure or timeout — never block the empty state on a model call. | M |
| UI-5 | Scroll-to-bottom pill and sticky "jump to latest" while streaming. | S |
| UI-6 | Retry and edit-last-turn. Needs a server-side truncate-and-resume endpoint, so it lands after STATE-1. | M |
| UI-7 | Error and disconnect states: the client currently pushes `**Connection Error:**` into the transcript as if the assistant said it. Render transport failures as a distinct non-message row with a retry action. | S |

---

## 4. P2 — Persistence and configuration hardening

| ID | Task | Effort |
|---|---|---|
| CFG-1 | Replace the hard-coded `~/.config/locus` with `env-paths`. It is Linux-correct only; macOS wants `~/Library/Application Support`, Windows wants `%APPDATA%`. | S |
| CFG-2 | Add `schemaVersion` plus a migration chain to config and session files now. Retrofitting migrations after users have data is miserable. | S |
| CFG-3 | Any non-local provider credential goes to the OS keychain. Fallback: `chmod 0600`, redacted from all logs and transcripts. | M |
| CFG-4 | Sessions become append-only JSONL. Whole-file JSON rewrites truncate the session on a crash mid-write. | M |
| CFG-5 | Add a session index (`index.json` or SQLite) so `/api/sessions` is one read instead of `readdir` plus N file reads. This is the first thing that gets slow, at roughly 500 sessions. | M |
| CFG-6 | Define single-writer semantics. Two browser tabs on one session will interleave writes today. Either lock per session or version the file and reject stale writes. | M |

---

## 5. P2 — Sandbox

Depends on EXEC-1 and EXEC-2, which deliver most of the practical containment.

| ID | Task | Effort |
|---|---|---|
| SBX-1 | Opt-in Docker execution backend behind a `SandboxBackend` interface, workspace bind-mounted, network off by default. Not a hard dependency — it contradicts §3.1's zero-dependency goal. | L |
| SBX-2 | Native fallback: scrub the environment to an allowlist, set `cwd` to the workspace root, drop inherited descriptors, apply resource limits. | M |
| SBX-3 | Prompt-injection stance. A `README` in a cloned repo can instruct the model to run a command, and the approval dialog is the only thing between that and execution. Mark tool output as untrusted content in the prompt, and never let content-derived instructions match an auto-approve rule. | M |

---

## 6. P2 — Distribution

| ID | Task | Effort |
|---|---|---|
| DIST-1 | Pick the compiler. `pkg` is effectively dormant; `bun build --compile` is the pragmatic choice. Note the constraint it imposes: native addons do not survive compilation cleanly, which conflicts directly with `better-sqlite3` / `sqlite-vec` in §3.2. Decide that trade-off here, not in a build failure. | M |
| DIST-2 | Release pipeline: versioned artifacts per OS/arch, SHA-256 manifest, GitHub release automation. | M |
| DIST-3 | Code signing. Apple Developer ID plus notarization, Windows Authenticode. Unsigned binaries mean Gatekeeper quarantine and SmartScreen warnings — budget for it or accept the first-run friction explicitly. | L |
| DIST-4 | Installer script with arch detection, checksum verification, `--version` pinning, and an uninstall path. | M |
| DIST-5 | Publish the expected binary size. A compiled Bun binary starts around 50–100 MB before application code. | S |

---

## 7. P3 — Context and discovery

The PRD leads with vector embeddings. I would demote that. Claude Code ships no vector index; it does agentic `grep` and `glob` and lets the model iterate. For code specifically, lexical and structural search beats embeddings at a fraction of the complexity, and a required embedding model contradicts zero-dependency distribution.

| ID | Task | Effort |
|---|---|---|
| CTX-1 | Ship lexical search first: bundled ripgrep-equivalent exposed as `search_code`, plus `glob` and `read_file(path, startLine, endLine)`. | M |
| CTX-2 | Tree-sitter symbol index for `find_symbol` and `find_references`. Covers most of what RAG is proposed for, with deterministic results. | L |
| CTX-3 | Token budgeting. Read context length from the engine where exposed (`/api/show` on Ollama; `/v1/models` usually does not), fall back to a per-family table, estimate at roughly 3.5 characters per token for code. Enforce at the tool layer: `read_file` refuses oversized reads and suggests a line range instead of blowing the context. | M |
| CTX-4 | Embeddings, gated on evidence. Only build this if CTX-1 and CTX-2 leave a measurable gap on the eval suite. If built, make it an opt-in plugin with a pure-JS store so DIST-1 stays viable. | XL |

---

## 8. Open decisions

Each of these blocks work downstream and needs an owner and a date.

1. **SQLite or pure JS for the session index and any future vector store?** Native addons break single-binary compilation. Choosing SQLite means either shipping a loader shim or dropping the single-binary goal.
2. **Is Docker a hard dependency for `run_command`?** Safer, but breaks zero-dependency and excludes a lot of users.
3. **Does the server own conversation state?** STATE-1 assumes yes. If the answer is no, security has to be re-argued from scratch.
4. **Signing budget.** Apple Developer ID is an annual fee plus notarization work; without it, macOS users get a scary dialog on first run.
5. **Which model is the CI reference for evals?** Needs to be pinned by digest, small enough for CI, and capable of tool calls.
6. **Telemetry.** I would ship none and say so loudly. It is a feature for this audience, but it must be a stated decision.

---

## 9. Sequencing

| Milestone | Contents | Exit criteria |
|---|---|---|
| **M0 — Stop the bleeding** | SEC-1, SEC-2, EXEC-1, EXEC-2, STATE-1, TOOL-1, TOOL-2, TOOL-3, LOOP-1, DOC-1…5 | External page cannot reach the API. Approved argv equals executed argv. No orphan processes. Red-team fixture passes. |
| **M1 — Safe to change** | EVAL-1, CAP-1, OBS-1, UI-3, UI-7 | Eval pass rate reported in CI. A no-tool-template model completes the suite in fallback mode. |
| **M2 — Security ergonomics** | RULES-1, SBX-2, SBX-3, UI-1, UI-2 | Auto-approve is on by default for read-only tools with an audit trail, and the escape fixture is fully blocked. |
| **M3 — Persistence and scale** | CFG-1…6, CFG-5 index, UI-4, UI-5, UI-6 | 1,000 sessions load in under 100 ms. Crash mid-write loses at most one turn. |
| **M4 — Distribution** | DIST-1…5, SBX-1 | `curl … | sh` produces a working signed binary on macOS arm64, macOS x64, Linux x64, Windows x64. |
| **M5 — Context** | CTX-1, CTX-2, CTX-3, then CTX-4 only if justified | Eval tasks requiring cross-file discovery pass without manual file hints. |

The reordering that matters: **security before distribution.** A signed binary that is also an RCE surface is worse than an unsigned one, because signing is what convinces people to install it.

---

## 10. Definition of done for any tool added later

A checklist to apply to every new tool, so this audit does not have to be repeated:

- [ ] Takes structured parameters; no string concatenation into a shell
- [ ] Paths resolved with `realpath` and asserted inside the workspace root
- [ ] Returns the `ToolResult` envelope with an explicit `ok`
- [ ] Declares whether it is auto-approvable, with a written justification
- [ ] Honours the abort signal and a wall-clock timeout
- [ ] Truncates output at a byte cap and reports `truncated`
- [ ] Has at least one eval task exercising it
- [ ] Has a red-team test for its most obvious abuse
- [ ] Renders in the UI with a human-readable summary of what it did
