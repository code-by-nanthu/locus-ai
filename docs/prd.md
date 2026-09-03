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
* **`locus ui`:** Launches the local Web UI dashboard server and automatically opens it in the default browser.

## 3. Target Features (Roadmap)

### 3.1 Zero-Dependency Distribution

* **Single Binary Compilation:** Compile the TypeScript/React codebase into a single, self-contained native executable binary (e.g., `locus-macos`, `locus-linux`, `locus.exe`) using tools like `pkg` or `bun`.
* **Global Installer Script:** Provide a standard curl-to-sh install script (`curl -fsSL https://... | sh`).

### 3.2 Advanced Context & Discovery Tools

* **Vector Embeddings Index (RAG):** Integrate a tiny local embedding database (such as a native JS vector store or SQLite-vec) to vectorize the workspace for fast semantic searching across thousands of source files.
* **Intelligent File Token Budgeting & Compaction:** Build an automatic system token counter and context compaction/eviction to prevent context window blowouts on local models.
* **Diff-Based File Editing:** Provide fine-grained search-and-replace / unified diff editing to avoid full-file rewrites.

### 3.3 Enterprise-Grade Security & Sandboxing

* **Host Header & Loopback Token Authentication:** Secure the local web dashboard against DNS rebinding and local port sniffing.
* **System Environment Sandbox:** Execute all `run_command` actions inside an isolated local container (like Docker) or an ephemeral shell environment.

## 4. Proposed Implementation Roadmap

1. **Phase 1: Persistence, UX, & Web Dashboard (COMPLETED)**
   Implemented the Global Config System, Session History Recorder, Expanded Providers, and the complete Web UI.
2. **Phase 2: Security Ergonomics & Loop Correctness (IN PROGRESS)**
   Unified SSE agent loop, strict `tool_call_id` plumbing, loop guardrails, token auth, and path traversal containment.
3. **Phase 3: Reliability & Local Model UX**
   Diff-based file editing, context window compaction, and eval harness.
4. **Phase 4: Distribution & Advanced Context**
   Single Binary Compilation, global installer, and RAG embeddings.
