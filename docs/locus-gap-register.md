# Locus — Gap Register

What is not built yet. Derived from `README.md`, `prd.md`, and the web client (`App.tsx`, `main.tsx`). Companion to `locus-action-plan.md`; IDs cross-reference it.

**Confidence column:** `verified` = confirmed absent from code I have read · `doc-conflict` = the README and PRD disagree, so status is unknown · `inferred` = not mentioned in any document, so presumed absent

---

## 0. Resolve before scoping anything

The README and PRD contradict each other in five places. Each changes the size of the work, so answer these first.

| # | Conflict | Why it matters | Confidence |
|---|---|---|---|
| C-1 | README: "First-class support for Ollama, LM Studio, Oobabooga" (3). PRD §2.3: 8 engines including vLLM, LocalAI, Jan, GPT4All, llama.cpp. | Five engines are either untested or unbuilt. Each needs its own tool-calling probe (`CAP-1`) and a CI lane. | doc-conflict |
| C-2 | README: "Auto-Approve feature and pattern matching whitelist" is a **shipped** feature. PRD §3.3: it is **Phase 2 roadmap**. | If it ships today, the string-matching bypass in `RULES-1` is a live vulnerability, not a future design flaw. This flips it to M0. | doc-conflict |
| C-3 | README: sessions persist to `~/.config/locus/history`. PRD §2.2: `~/.config/locus/sessions/`. | One of them is stale. Users on the wrong path silently lose history after an upgrade. Needs a migration either way (`CFG-2`). | doc-conflict |
| C-4 | README: models can "interact with the browser". No browser tool appears in the PRD, the tool list, or the approval dialog. | A browser tool is a large surface (navigation, DOM read, injection risk). Either it exists undocumented and needs an approval path, or the README overstates. | doc-conflict |
| C-5 | README: `locus commit` and `locus export` sub-commands. Absent from the PRD entirely. | They are real features with no roadmap slot, no web equivalent, and no tests. | doc-conflict |

---

## 1. Agent core — the largest gap

The PRD treats the agent loop as done. It is the least complete part of the system.

| ID | Missing | Notes | Confidence |
|---|---|---|---|
| AG-1 | **Single-source tool loop.** `App.tsx` reconstructs assistant turns and fabricates tool-call IDs client-side. The loop must live only in `services/agent.ts`, with both the Ink CLI and the web UI as subscribers. | Today the two surfaces can diverge in behaviour. Blocks `STATE-1`. | verified |
| AG-2 | **Real `tool_call_id` plumbing.** Client invents `'call_' + Date.now()`; `role: 'tool'` messages carry no `tool_call_id`. | Strict OpenAI-compatible backends (vLLM) reject this shape. Parallel calls mis-pair. | verified |
| AG-3 | **Parallel tool calls.** The stream handler assumes one `tempTool` at a time; a second `tool_start` overwrites the first. | Most current models emit arrays. Silent data loss today. | verified |
| AG-4 | **Structured tool result** (`ok`, `errorCode`, `exitCode`, `truncated`, `durationMs`) replacing `content.includes('"error":')`. | `TOOL-1` | verified |
| AG-5 | **Cancellation.** No `AbortController`, no stop button, no child-process kill. | `TOOL-2` | verified |
| AG-6 | **Loop guardrails.** No max iterations, wall-clock cap, per-tool output cap, or repeat-call detection. | `LOOP-1` | verified |
| AG-7 | **Context compaction.** Nothing summarises or evicts old turns. A local model with 8–32K context will hard-fail mid-task once tool output accumulates. Not mentioned anywhere in the PRD. | This is the single most common cause of "the agent broke on a real task". | inferred |
| AG-8 | **Diff-based file editing.** README implies whole-file `write_file`. Small local models truncate or hallucinate on full rewrites. Needs a search/replace or unified-diff edit tool with fuzzy matching and a retry-on-mismatch path. | This is where Aider's reliability comes from. Probably your highest-ROI single feature. | inferred |
| AG-9 | **Checkpoint and undo.** No snapshot before edits, no way to revert an agent run. | Git-based shadow commits are the standard approach. Trust feature; users won't grant write access without it. | inferred |
| AG-10 | **Malformed tool-call recovery.** No strict parser plus one repair retry for models that emit near-valid JSON. | Essential for weak models. Part of `CAP-1`. | inferred |
| AG-11 | **Capability detection.** No probe for whether a model supports native tool calls; no text-protocol fallback. | `CAP-1` | inferred |
| AG-12 | **Project instructions file** (`LOCUS.md` or `AGENTS.md`) loaded into the system prompt. | Every competitor has this. Cheap to build, high perceived value. | inferred |
| AG-13 | **Secret exclusion.** Nothing stops `read_file` from feeding `.env`, `id_rsa`, or `.git/config` to the model, or a tool result from echoing a key into the transcript on disk. | Hard requirement for the regulated-codebase positioning. | inferred |

---

## 2. Security — none of this exists

| ID | Missing | Plan ref | Confidence |
|---|---|---|---|
| S-1 | Loopback API authentication (per-run bearer token) | `SEC-1` | verified |
| S-2 | `Host` header validation against DNS rebinding | `SEC-2` | verified |
| S-3 | `spawn` with argv and `shell: false`; `realpath` binary resolution | `EXEC-1` | inferred |
| S-4 | Workspace containment after `realpath` (symlink, `..`, `~`, UNC) | `EXEC-2` | inferred |
| S-5 | Approval binding: guarantee the displayed command is byte-identical to the executed argv. The dialog renders `args.command` while the server matches `pattern`. | `TOOL-3` | verified |
| S-6 | Approval TTL, single-use `authId`, invalidation on stream close | `TOOL-3` | verified |
| S-7 | Audit log of every approval and auto-approval decision | `RULES-1` | inferred |
| S-8 | Prompt-injection handling: mark tool output as untrusted, forbid content-derived instructions from matching auto-approve rules | `SBX-3` | inferred |
| S-9 | Environment scrubbing and resource limits on spawned processes | `SBX-2` | inferred |
| S-10 | Docker sandbox backend | `SBX-1` | inferred |

---

## 3. API endpoints that need to exist

The client calls exactly four routes: `GET /api/sessions`, `GET /api/session/:id`, `POST /api/chat`, `POST /api/approve`. Everything the PRD and README promise needs the rest.

| ID | Endpoint | For |
|---|---|---|
| API-1 | `PATCH /api/session/:id`, `DELETE /api/session/:id` | Rename and delete (claimed in PRD §2.1) |
| API-2 | `GET /api/config`, `PUT /api/config` | Provider, model, port, base URL (claimed in §2.2) |
| API-3 | `GET /api/providers`, `GET /api/providers/:id/models`, `POST /api/providers/:id/test` | Model picker and connection test (claimed in §2.3) |
| API-4 | `POST /api/starters` | Generated starter prompts (claimed in §2.1) |
| API-5 | `POST /api/chat/:id/abort` | Cancellation (`AG-5`) |
| API-6 | `POST /api/session/:id/truncate` | Retry and edit-last-turn |
| API-7 | `GET /api/rules`, `PUT /api/rules` | Auto-approve rule editing |
| API-8 | `GET /api/health`, `GET /api/version` | Update check, install verification, debugging |
| API-9 | `GET /api/session/:id/export` | Web parity with `locus export` (`C-5`) |
| API-10 | `GET /api/context` | Token usage and context-budget display (`CTX-3`) |

---

## 4. Web UI

| ID | Missing | Confidence |
|---|---|---|
| W-1 | Session rename and delete controls | verified |
| W-2 | Settings surface: provider, model, base URL, port, rules | verified |
| W-3 | Stop-generation button | verified |
| W-4 | Generated starter prompts (the redesign ships static ones as a placeholder) | verified |
| W-5 | Retry and edit-last-turn | verified |
| W-6 | Distinct transport-error rendering. Connection failures are currently pushed into the transcript as assistant messages. | verified |
| W-7 | Context/token usage indicator | verified |
| W-8 | Session search and filter | verified |
| W-9 | Scroll-to-bottom pill; scroll anchoring during streaming (`scrollIntoView` on every token fights the user's own scrolling) | verified |
| W-10 | Keyboard shortcuts: new chat, focus composer, toggle sidebar, stop | verified |
| W-11 | Reconnect and resume for a dropped SSE stream. Today a dropped connection loses the in-flight turn silently. | verified |
| W-12 | Working-directory display and switcher. The user cannot see which workspace the agent will act on. | verified |
| W-13 | Git status surface, given `locus commit` exists in the CLI | inferred |

---

## 5. Persistence and config

| ID | Missing | Plan ref |
|---|---|---|
| P-1 | Cross-platform config paths via `env-paths` (`~/.config` is Linux-only) | `CFG-1` |
| P-2 | `schemaVersion` plus migration chain, including the `history` → `sessions` rename in `C-3` | `CFG-2` |
| P-3 | Credential storage in the OS keychain; redaction from logs and transcripts | `CFG-3` |
| P-4 | Append-only JSONL sessions instead of whole-file rewrites | `CFG-4` |
| P-5 | Session index so listing is one read, not `readdir` plus N reads | `CFG-5` |
| P-6 | Single-writer semantics across two browser tabs and the CLI running at once | `CFG-6` |

---

## 6. Context and discovery

| ID | Missing | Plan ref |
|---|---|---|
| X-1 | `search_code` (bundled ripgrep-equivalent), `glob`, `read_file(path, startLine, endLine)` | `CTX-1` |
| X-2 | Tree-sitter symbol index: `find_symbol`, `find_references` | `CTX-2` |
| X-3 | Token budgeting with per-engine context-length discovery | `CTX-3` |
| X-4 | `.gitignore` and ignore-file respect in every file-touching tool | part of `CTX-1` |
| X-5 | Embeddings/RAG — deferred until evals prove X-1 and X-2 insufficient | `CTX-4` |

---

## 7. Engineering infrastructure — nothing here exists

| ID | Missing | Why it blocks everything else |
|---|---|---|
| I-1 | **Eval harness**: fixture repos, scripted tasks, programmatic assertions, pass-rate output | You cannot verify any agent-core change without it. This is `EVAL-1` and it gates M2 onward. |
| I-2 | **Red-team fixture**: 20+ shell-escape and path-escape attempts as named tests | Acceptance gate for `RULES-1`. Without it, "whitelist" is a claim. |
| I-3 | **Unit and integration tests.** No test command appears in the README. | |
| I-4 | **CI matrix**: OS × arch × engine, plus one pinned local model for evals | |
| I-5 | **Structured logging and `--debug` transcript dump** | `OBS-1`. Support requests are unanswerable without it. |
| I-6 | **Crash handling**: unhandled rejection capture, safe shutdown, no orphaned children | |

---

## 8. Distribution and packaging

| ID | Missing | Plan ref |
|---|---|---|
| D-1 | Single-binary compilation. Decide `bun build --compile` vs `pkg`, and settle the native-addon conflict with any SQLite dependency. | `DIST-1` |
| D-2 | Signing and notarization (Apple Developer ID, Windows Authenticode) | `DIST-3` |
| D-3 | Installer script with arch detection, checksum verification, version pinning, uninstall | `DIST-4` |
| D-4 | Release automation with a SHA-256 manifest | `DIST-2` |
| D-5 | `locus` global bin plus `--version` and `--help`. Today the README only documents `pnpm start`, which means there is no installed-product story yet. | inferred |
| D-6 | Update check against the release manifest | inferred |

---

## 9. Product surface

| ID | Missing |
|---|---|
| Q-1 | `LICENSE`. The README makes no license claim, which blocks adoption in exactly the enterprise segment you want. |
| Q-2 | Threat model, non-goals, and an explicit "no telemetry" statement in the docs |
| Q-3 | Docs beyond the README: tool reference, rule syntax, per-engine setup, troubleshooting |
| Q-4 | `CHANGELOG` and a versioning policy |
| Q-5 | Model recommendations by hardware tier. Users with a 7B model on 16 GB will conclude the product is broken; tell them what actually works. |

---

## 10. Build order

Only the first block is truly blocking. Everything else is schedulable.

**Now — the loop cannot be trusted until these land**
`C-1`…`C-5` (answer the conflicts) → `S-1`, `S-2`, `S-5`, `S-6` (security floor) → `AG-1`, `AG-2`, `AG-4`, `AG-5`, `AG-6` (loop correctness) → `S-3`, `S-4` (execution safety)

**Next — makes every later change verifiable**
`I-1`, `I-2`, `I-5`, `AG-11`, `AG-10`

**Then — the reliability features that decide whether the product works with local models**
`AG-8` (diff editing), `AG-7` (compaction), `AG-9` (undo), `AG-12` (project instructions), `X-1`, `X-3`

**After that** — `AG-13`, `S-7`…`S-10`, then the API and UI gaps in §3 and §4, then persistence in §5, then distribution in §8.

If you want a single line to plan against: **`AG-8`, `AG-7`, and `I-1` are the three items that decide whether Locus is usable on a real repository with a local model.** Everything in the PRD's Phase 2–4 assumes they already work.
