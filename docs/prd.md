# Locus — Product Requirements Document (PRD)

## 1. Overview

Locus is a robust local AI agent and development tool that operates entirely on your machine. Originally built as a Node.js-based CLI utilizing React Ink for a rich terminal UI, Locus has recently evolved to include a comprehensive Web Dashboard served locally via Express.

To evolve Locus into a truly standalone, industrial-grade application (comparable to Claude Code or GitHub CLI), we are eliminating external runtime dependencies, handling state persistence natively, and introducing advanced security and context management.

## 2. Implemented Features

### 2.1 Web Dashboard (React + Tailwind)

* **Local Web Server:** A dedicated Express server (`/api`) serving a beautiful, fully-responsive React single-page application.
* **Session Management:** Users can seamlessly browse, rename, and delete chat histories directly from the sidebar.
* **Dynamic Starter Prompts:** On a fresh chat, Locus automatically generates contextual suggestion prompts using the active LLM.
* **Theme Support:** Full Light/Dark mode toggling adhering to system preferences.

### 2.2 Local Configuration & State Persistence

* **Global Config System (`~/.config/locus/config.json`):** A file-backed storage layer that remembers the user's preferred default provider, default model, custom base URLs, and auto-approval whitelist rules.
* **Session Persistence & History Logs:** Chat logs are saved locally to `~/.config/locus/history/`. This allows users to resume previous conversations via the CLI (`/sessions` or `locus sessions`) or the Web UI.

### 2.3 Expanded AI Connectivity

* **Universal OpenAI-Compatibility:** Native support for 8 major local AI inference engines: Ollama, LM Studio, LocalAI, vLLM, Jan, GPT4All, Llama.cpp, and Oobabooga.
* **Custom Base URLs:** Users can override default connection addresses and ports dynamically via the UI to accommodate custom network setups.

### 2.4 Autonomous Tool Execution & Security Gateway

* **Host Tools Suite:** Built-in capabilities including `search_workspace`, `read_file`, `write_file`, `run_command`, and `browser_action` (Playwright Chromium automation).
* **Guarded Tool Approvals:** Destructive tools (`write_file`, `run_command`, `browser_action`) require user authorization with granular auto-approve pattern whitelisting (`run_command:<cmd>`, `browser_action:<action>`).

### 2.5 Developer CLI Sub-Commands

* **`locus commit`:** Analyzes git diffs (staged or unstaged) and generates conventional commit messages directly from your local LLM.
* **`locus export [id]`:** Exports conversational session transcripts into formatted markdown documents.
* **`locus sessions`:** Formatted terminal overview of all previous sessions with quick resume instructions.
* **`locus eval`:** Runs the automated agent task benchmark evaluation harness against fixture repositories.
* **`locus ui`:** Launches the local Web UI dashboard server and automatically opens it in the default browser.

### 2.6 Zero-Dependency Distribution

* **Single Binary Compilation (`pnpm run build:binary`):** Compiles the full TypeScript CLI, React Ink UI, Express server, and all bundled dependencies into a single, self-contained native executable binary (`bin/locus` — 64 MB Mach-O arm64 on macOS, ELF x64 on Linux) with zero external runtime dependencies.
* **Global Installer Script (`scripts/install.sh`):** Standard curl-to-sh install script (`curl -fsSL https://... | bash`) featuring automatic OS/arch detection, precompiled binary download, checksum verification, and `--uninstall` support without requiring Node.js.
* **Automated CI/CD Release Pipeline (`.github/workflows/release.yml`):** Multi-platform matrix compiling native standalone binaries for macOS arm64 and Linux x64 with SHA-256 manifests on every release tag.

## 3. Target Features (Roadmap)

### 3.1 Advanced Context & Discovery Tools

* **Vector Embeddings Index (RAG):** Optional local embedding plugin to vectorize large workspaces for semantic searching when lexical and symbol search (`search_workspace`, `find_symbol`) require supplementary retrieval.

## 4. Implementation Roadmap

1. **Phase 1: Persistence, UX, & Web Dashboard (COMPLETED)**
   Global Config System, Session History Recorder, Expanded Providers, and Modularized Web UI.
2. **Phase 2: Security Ergonomics & Loop Correctness (COMPLETED)**
   Unified SSE agent loop, strict `tool_call_id` plumbing, loop guardrails, loopback token auth, and path traversal containment.
3. **Phase 3: Reliability & Local Model UX (COMPLETED)**
   Diff-based file editing (`edit_file`), undo snapshots, context window compaction, dynamic intent gating, and scripted eval harness.
4. **Phase 4: Distribution & Packaging (COMPLETED)**
   Universal installer script, GitHub CI/CD workflows, update notifier, and release packaging.

---

## 5. Non-Goals (DOC-2)

To keep the security boundaries simple and dependable, Locus explicitly declares the following non-goals:
* **No Remote / Internet Hosting:** Locus is strictly bound to `127.0.0.1` and is never exposed to public or LAN interfaces.
* **No Multi-User Accounts:** Single-tenant by design; permissions belong to the local operating system user.
* **No Cloud Synchronization:** Sessions, credentials, and settings remain 100% on the local disk.
* **No Telemetry or Tracking:** Zero phone-home network calls, zero usage tracking, and zero user analytics.

---

## 6. Threat Model (DOC-3)

See [threat-model.md](./threat-model.md) for full architectural analysis. Adversaries considered:
1. **Malicious Browser Web Pages:** Attempting DNS rebinding or CSRF against `localhost:7331` (Mitigated via SEC-1 bearer auth token and SEC-2 `421` Host header enforcement).
2. **Prompt-Injected Files in Workspaces:** Malicious instructions hidden inside `README.md` or git diffs (Mitigated via `[SECURITY POLICY]` tagging tool output as untrusted external data).
3. **Confused Local Models:** Small models hallucinating dangerous command invocations (Mitigated via human-in-the-loop approval gate with strict pattern matching).
4. **Local Process Eavesdropping:** Other local users reading config files (Mitigated via restrictive directory permissions and credential redaction).

---

## 7. Supported Platforms Matrix (DOC-4)

| Operating System | Architectures | Supported Inference Engines | Validation Status |
|---|---|---|---|
| **macOS** (13.0+) | Apple Silicon (arm64), Intel (x64) | Ollama, LM Studio, vLLM, LocalAI, Jan, Llama.cpp | Tier 1 (CI-tested & Primary Dev) |
| **Linux** (Kernel 5.15+) | x86_64, aarch64 | Ollama, LM Studio, vLLM, LocalAI, Jan, GPT4All, Oobabooga | Tier 1 (CI-tested via GitHub Actions) |
| **Windows** (10 / 11) | x86_64 | Ollama, LM Studio, LocalAI, Llama.cpp, GPT4All | Tier 2 (Best-effort / UNC sanitized) |

---

## 8. Success Metrics (DOC-5)

1. **Eval Suite Pass Rate:** 100% pass rate on the scripted task harness (`locus eval`).
2. **Time-to-First-Token (TTFT):** < 500 ms p50 on Ollama with local 3B–8B models.
3. **Zero RCE via Browser:** 100% rejection rate against cross-origin and DNS-rebound requests.
4. **Crash-Free Session Rate:** > 99.9% across concurrent web and CLI instances.

