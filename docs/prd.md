# Locus — Product Requirements Document (PRD)

## 1. Overview

Locus is currently a Node.js-based local AI CLI agent utilizing React Ink for a rich terminal UI. To evolve Locus from a script into a truly standalone, industrial-grade CLI application (comparable to Claude Code or GitHub CLI), we need to eliminate external runtime dependencies, handle state persistence natively, and introduce advanced security and context management.

## 2. Target Features

### 2.1 Zero-Dependency Distribution

* **Single Binary Compilation:** Compile the TypeScript/React codebase into a single, self-contained native executable binary (e.g., `locus-macos`, `locus-linux`, `locus.exe`) using tools like `pkg` or `bun`. This allows users to run the app instantly without requiring Node.js or pnpm on their machine.
* **Global Installer Script:** Provide a standard curl-to-sh install script (`curl -fsSL https://... | sh`) that automatically detects the user's OS and architecture, downloads the correct binary, and moves it to the user's `/usr/local/bin` path.

### 2.2 Local Configuration & State Persistence

* **Global Config System (`~/.locusrc`):** Implement a file-backed storage layer to remember the user's preferred default provider, default model, and workspace blacklists. This eliminates the need to navigate the setup menu on every single launch.
* **Session Persistence & History Logs:** Save chat logs locally to an application data folder (e.g., `~/.config/locus/history/`). This allows users to resume previous conversations by passing a flag like `locus --session <session-id>`.

### 2.3 Advanced Context & Discovery Tools

* **Vector Embeddings Index (RAG):** To prevent large projects from crashing the local LLM's context window, integrate a tiny local embedding database (such as a native JS vector store or SQLite-vec) to vectorize the workspace. This enables fast semantic searching across thousands of source files.
* **Intelligent File Token Budgeting:** Build an automatic system token counter that warns the user if reading a specific file will exceed the local model's maximum context length, gracefully offering to send a summarized version instead.

### 2.4 Enterprise-Grade Security Extensions

* **Tool Rule Configuration (Auto-Approve Whitelists):** The current Security Verification Gateway forces manual approval for all destructive actions. A config rule system will allow users to flag certain tools or paths as safe (e.g., `read_file` is auto-approved, but `run_command` always prompts), reducing alert fatigue.
* **System Environment Sandbox:** Execute all `run_command` actions inside an isolated local container (like Docker) or an ephemeral shell environment to guarantee the AI agent cannot accidentally corrupt the host operating system.

## 3. Structural Comparison

| Feature Strategy | Current (Node.js Script) | Target (Standalone Application) |
| --- | --- | --- |
| **User Prerequisites** | Requires Node.js, pnpm, and `node_modules`. | Zero prerequisites. Runs as a native machine binary. |
| **Launch Efficiency** | Forces provider/model selection on every spin-up. | Instant launch. Restores global configurations automatically. |
| **Scale Constraints** | Drops chat history and context entirely on exit. | Persistent memory. Resumes previous sessions via local logs. |

## 4. Proposed Implementation Roadmap

1. **Phase 1: Persistence & UX**
   Implement the Global Config System & Session History Recorder to remember preferences and past chats.
2. **Phase 2: Security Ergonomics**
   Build the Auto-Approve Whitelist Rule system into the existing Security Verification Gateway.
3. **Phase 3: Distribution**
   Configure Single Binary Compilation and the Global Installer script.
4. **Phase 4: Advanced Context & Sandboxing**
   Integrate RAG embeddings, token budgeting, and the execution sandbox.
