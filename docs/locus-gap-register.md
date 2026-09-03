# Locus — Gap Register (Resolved: 100%)

**Status: Complete (74 / 74 items resolved)**  
All technical, security, architectural, and documentation gaps identified in `README.md`, `prd.md`, and the web client have been systematically implemented and verified with automated test suites.

---

## 0. Resolved Specification Conflicts

| # | Conflict | Resolution & Status | Confidence |
|---|---|---|---|
| C-1 | Provider count (README 3 vs PRD 8) | ✅ **Resolved:** Full support & discovery for 8 providers (`ollama`, `lmstudio`, `localai`, `vllm`, `jan`, `gpt4all`, `llamacpp`, `oobabooga`) in `constants.ts` and `tool-reference.md`. | verified |
| C-2 | Auto-Approve whitelist status | ✅ **Resolved:** Shipped with strict regex boundary checks, authorization pattern matching, and approval audit log. | verified |
| C-3 | Session path (`history` vs `sessions`) | ✅ **Resolved:** Cross-platform config paths with automatic fallback resolution and `schemaVersion: 1`. | verified |
| C-4 | Browser tool presence | ✅ **Resolved:** Playwright browser automation tool (`browser_action`) with recording artifact saving and video flushes. | verified |
| C-5 | Subcommands (`commit`, `export`, `diff`) | ✅ **Resolved:** Shipped CLI subcommands and matching Web UI endpoints with full format export (Markdown, JSON, HTML). | verified |

---

## 1. Agent Core (13 / 13 Resolved)

| ID | Gap Item | Implementation Details | Status |
|---|---|---|---|
| AG-1 | Single-source tool loop | Centralized `runAgentLoop` in `src/services/agent.ts` powering both CLI Ink and Express Web UI. | ✅ Resolved |
| AG-2 | Real `tool_call_id` plumbing | Accumulator maps streaming chunks to their real `tool_call_id` for strict OpenAI/vLLM compliance. | ✅ Resolved |
| AG-3 | Parallel tool calls | Accumulator handles arrays of parallel tool calls with unique index keys. | ✅ Resolved |
| AG-4 | Structured tool results | Standard envelope: `{ ok, success, durationMs, exitCode, errorCode, ... }`. | ✅ Resolved |
| AG-5 | Cancellation | Unified `AbortController` terminating OpenAI requests, child processes, and browser instances. | ✅ Resolved |
| AG-6 | Loop guardrails | Maximum 15 turns cap, repeat-call detection after 3 identical failing calls, output length caps. | ✅ Resolved |
| AG-7 | Context compaction | `compactHistory` truncates older tool outputs (>1000 chars) while protecting recent conversation turns. | ✅ Resolved |
| AG-8 | Diff-based file editing | `edit_file` tool with newline normalization and unique match enforcement. | ✅ Resolved |
| AG-9 | Checkpoint and undo | Automatic pre-edit snapshots in `.locus/snapshots/` and `/undo` command. | ✅ Resolved |
| AG-10 | Malformed tool-call recovery | Regex fallback extractor parses pseudo tool calls from raw assistant strings. | ✅ Resolved |
| AG-11 | Dynamic tool intent gating | `shouldProvideTools` prevents 3B models from emitting template artifacts (`empty`/`{}`) on greetings. | ✅ Resolved |
| AG-12 | Project instructions loader | Auto-loads `LOCUS.md`, `.locus.md`, `AGENTS.md`, or `CLAUDE.md` into the system prompt. | ✅ Resolved |
| AG-13 | Secret exclusion | Access to `.env*`, `.git/config`, `id_rsa`, `.npmrc`, `.aws/`, `.ssh/` is blocked. | ✅ Resolved |

---

## 2. Security (10 / 10 Resolved)

| ID | Gap Item | Implementation Details | Status |
|---|---|---|---|
| S-1 | Loopback API authentication | Boot-time cryptographic 24-byte bearer token (`Authorization: Bearer <token>`). | ✅ Resolved |
| S-2 | Host header validation | Strict loopback check (`localhost`, `127.0.0.1`, `[::1]`) defeats DNS rebinding. | ✅ Resolved |
| S-3 | Safe command execution | Child process execution with sanitized environment and timeout guards. | ✅ Resolved |
| S-4 | Workspace containment | Canonical `fs.realpath` resolution prevents symlink, `..`, and UNC path traversal. | ✅ Resolved |
| S-5 | Approval binding | Cryptographic 16-byte `authId` tokens tied to exact command and arguments. | ✅ Resolved |
| S-6 | Approval TTL & single-use | 5-minute approval expiration timer; disconnect listener auto-denies pending requests. | ✅ Resolved |
| S-7 | Audit logging | Immutable audit trail recorded in `~/.config/locus/audit.log`. | ✅ Resolved |
| S-8 | Prompt injection defense | Strict `[SECURITY POLICY]` designating tool output as untrusted external data. | ✅ Resolved |
| S-9 | Environment scrubbing | Scrubbed sensitive credentials (`AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, etc.). | ✅ Resolved |
| S-10 | Docker sandbox backend | Optional `--docker` mode executes commands inside isolated containers. | ✅ Resolved |

---

## 3. API Endpoints (10 / 10 Resolved)

| ID | Endpoint | Description | Status |
|---|---|---|---|
| API-1 | `PATCH /api/session/:id`, `DELETE /api/session/:id` | Session renaming and deletion. | ✅ Resolved |
| API-2 | `GET /api/config`, `PUT /api/config` | Provider, model, and base URL configuration. | ✅ Resolved |
| API-3 | `GET /api/providers`, `GET /api/models` | Local provider discovery and model listings. | ✅ Resolved |
| API-4 | `POST /api/starters` | Dynamic prompt starters. | ✅ Resolved |
| API-5 | `POST /api/chat/:id/abort` | Instant turn cancellation. | ✅ Resolved |
| API-6 | `POST /api/session/:id/truncate` | Session truncation for retry and turn editing. | ✅ Resolved |
| API-7 | `GET /api/rules`, `PUT /api/rules` | Auto-approve whitelist pattern management. | ✅ Resolved |
| API-8 | `GET /api/health`, `GET /api/version` | Runtime health checks and version verification. | ✅ Resolved |
| API-9 | `GET /api/session/:id/export` | Multi-format export (Markdown, JSON, HTML). | ✅ Resolved |
| API-10 | `GET /api/context` | Live working directory and git status. | ✅ Resolved |

---

## 4. Web UI (13 / 13 Resolved)

| ID | Feature | Implementation Details | Status |
|---|---|---|---|
| W-1 | Session rename and delete | Inline editable title, popover menu with delete confirmation. | ✅ Resolved |
| W-2 | Settings surface | Provider dropdown, base URL input, model picker modal. | ✅ Resolved |
| W-3 | Stop button | In-flight generation cancellation. | ✅ Resolved |
| W-4 | Starter prompts | Dynamic contextual cards with loading animations. | ✅ Resolved |
| W-5 | Retry & edit-last-turn | One-click retry button on assistant turns with prompt restoration. | ✅ Resolved |
| W-6 | Distinct transport errors | Top-level alert banner for connection drops without polluting history. | ✅ Resolved |
| W-7 | Token usage indicator | Header badge showing estimated token count. | ✅ Resolved |
| W-8 | Session search | Instant client-side search filtering by title and date. | ✅ Resolved |
| W-9 | Scroll anchoring | Smart auto-scroll that respects user upward scrolling. | ✅ Resolved |
| W-10 | Keyboard shortcuts | `Cmd+K` (focus composer), `Cmd+N` (new chat), `Esc` (abort), `?` (shortcuts modal). | ✅ Resolved |
| W-11 | SSE resilience | Graceful connection drop handling and error notification. | ✅ Resolved |
| W-12 | Working-directory display | Header badge showing active project directory. | ✅ Resolved |
| W-13 | Git status surface | Interactive `/diff` and git working tree inspection. | ✅ Resolved |

---

## 5. Persistence and Config (6 / 6 Resolved)

| ID | Feature | Implementation Details | Status |
|---|---|---|---|
| P-1 | Cross-platform paths | Resolves `%APPDATA%` on Windows, `$XDG_CONFIG_HOME` on Linux, and `~/.config/locus`. | ✅ Resolved |
| P-2 | Schema versioning | Version tracking with `schemaVersion: 1` in all JSON files. | ✅ Resolved |
| P-3 | Credential redaction | Redaction of API keys and tokens from transcripts and tool results. | ✅ Resolved |
| P-4 | Session storage | Structured session storage with timestamped snapshots. | ✅ Resolved |
| P-5 | Fast session index | `sessions_index.json` enables O(1) session listing without directory scans. | ✅ Resolved |
| P-6 | Single-writer file lock | `.locus.lock` coordinates concurrent writes across multiple tabs and CLI. | ✅ Resolved |

---

## 6. Context and Discovery (5 / 5 Resolved)

| ID | Feature | Implementation Details | Status |
|---|---|---|---|
| X-1 | Line-range slicing | `read_file` supports 1-indexed `startLine` and `endLine`. | ✅ Resolved |
| X-2 | Symbol index | `find_symbol` locates functions, classes, interfaces across TS, JS, Py, Go, Rust. | ✅ Resolved |
| X-3 | Token budgeting | Dynamic turn compaction and token tracking. | ✅ Resolved |
| X-4 | Gitignore respect | Excludes vendor directories (`node_modules`, `.git`, `dist`). | ✅ Resolved |
| X-5 | Search ranking | Prioritizes exact filename matches over deep vendor matches. | ✅ Resolved |

---

## 7. Engineering Infrastructure (6 / 6 Resolved)

| ID | Feature | Implementation Details | Status |
|---|---|---|---|
| I-1 | Eval harness | Scripted task harness in `src/test/eval_harness.test.ts`. | ✅ Resolved |
| I-2 | Red-team fixture | Security test suite testing path traversal, secret protection, and commands. | ✅ Resolved |
| I-3 | Native test suite | 17 automated tests running with Node's native test runner (`pnpm test`). | ✅ Resolved |
| I-4 | CI Matrix | Multi-OS GitHub Actions workflow (.github/workflows/ci.yml). | ✅ Resolved |
| I-5 | Structured logging | `--debug` flag dumps verbose diagnostics. | ✅ Resolved |
| I-6 | Crash handling | Captures `uncaughtException`, `unhandledRejection`, `SIGINT`, `SIGTERM`. | ✅ Resolved |

---

## 8. Distribution and Packaging (6 / 6 Resolved)

| ID | Feature | Implementation Details | Status |
|---|---|---|---|
| D-1 | Single executable | Executable wrapper with global binary configuration. | ✅ Resolved |
| D-2 | Platform packaging | Standardized archive packaging in release pipeline. | ✅ Resolved |
| D-3 | Installer script | Universal Unix installer script `scripts/install.sh` with arch detection. | ✅ Resolved |
| D-4 | Release workflow | `.github/workflows/release.yml` with automated SHA-256 generation. | ✅ Resolved |
| D-5 | Global CLI flags | `--version`, `-v`, `--help`, `-h` flags. | ✅ Resolved |
| D-6 | Update check | Background check against GitHub Releases on boot. | ✅ Resolved |

---

## 9. Product Surface (5 / 5 Resolved)

| ID | Feature | Implementation Details | Status |
|---|---|---|---|
| Q-1 | License | Standard MIT `LICENSE` file. | ✅ Resolved |
| Q-2 | Threat model | `docs/threat-model.md` documenting security boundaries and zero telemetry. | ✅ Resolved |
| Q-3 | Tool reference | `docs/tool-reference.md` covering all 7 tools and 8 inference engines. | ✅ Resolved |
| Q-4 | Changelog | Standard `CHANGELOG.md` following Keep a Changelog format. | ✅ Resolved |
| Q-5 | Model recommendations | `docs/model-recommendations.md` mapping RAM/VRAM tiers to models. | ✅ Resolved |
