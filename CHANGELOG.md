# Changelog

All notable changes to Locus are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-03

### Added

- **Unified Agent Core (`AG-1`)**: Centralized, decoupled agent loop (`runAgentLoop`) in `services/agent.ts` shared across Ink CLI and Express Web UI.
- **Strict Tool Call IDs & Parallel Buffering (`AG-2`, `AG-3`)**: Preserves backend `tool_call_id` and buffers parallel tool calls via stream delta indexing.
- **Surgical Diff File Editing (`AG-8`)**: Added `edit_file` search-and-replace tool with fuzzy newline normalization and ambiguous occurrence detection.
- **Snapshot Checkpointing & Undo (`AG-9`)**: Automatic pre-modification snapshots in `.locus/snapshots/` and `/undo` command to revert the last file edit.
- **Dynamic Tool Intent Gating (`AG-11`)**: `shouldProvideTools` prevents small local models (e.g. Llama 3.2 3B) from emitting template artifacts on casual greetings.
- **Context Compaction (`AG-7`)**: `compactHistory` prevents 8k–32k context overflow by truncating old historical tool outputs while preserving recent turns and system prompts.
- **Project Guidance Loader (`AG-12`)**: Automatic loading of `LOCUS.md`, `AGENTS.md`, or `CLAUDE.md` into system context.
- **Live Git Status Injection & `/diff` (`AG-11`, `O-1`)**: Active branch and modified file status injected into prompt, plus interactive `/diff` command and `locus diff` CLI subcommand.
- **Loopback Bearer Authentication & DNS Rebinding Protection (`S-1`, `S-2`)**: 24-byte crypto tokens required for all Web API routes, with `Host` header enforcement.
- **Single-Use Approval Tokens & 5-Min TTL (`S-5`, `S-6`)**: Cryptographic 16-byte `authId` tokens, auto-denial on stream disconnect, and 5-minute timeout.
- **Workspace Path Containment & Secret Exclusion (`S-4`, `AG-13`)**: Directory traversal checks using `fs.realpath` and automatic blocking of `.env`, `id_rsa`, `.git`, `.npmrc`.
- **Approval Audit Log (`S-7`)**: Append-only log of all approval, denial, and whitelist decisions stored at `~/.config/locus/audit.log`.
- **Line-Range Slicing in `read_file` (`X-1`)**: Added `startLine` and `endLine` parameters to `read_file`.
- **Multi-Format Session Export (`O-2`, `API-9`)**: Export sessions to Markdown, full JSON, or self-contained styled HTML reports via `locus export` and `/api/session/:id/export`.
- **Web Health & Version Endpoints (`API-8`)**: `GET /api/health` and `GET /api/version`.
- **CLI Global Flags (`D-5`)**: Added `--version` / `-v` and `--help` / `-h`.
- **Automated Test Suite & Eval Harness (`I-1`, `I-3`)**: Unit tests for tools, security, compaction, and scripted eval harness fixtures (`pnpm test`).
- **Open Source Licensing (`Q-1`)**: Added standard MIT `LICENSE`.
