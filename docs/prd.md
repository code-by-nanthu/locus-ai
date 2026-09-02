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

* **Global Config System (`~/.config/locus/config.json`):** A file-backed storage layer that remembers the user's preferred default provider, default model, and custom port configurations.
* **Session Persistence & History Logs:** Chat logs are saved locally to `~/.config/locus/sessions/`. This allows users to resume previous conversations via the CLI (`/sessions`) or the Web UI.

### 2.3 Expanded AI Connectivity

* **Universal OpenAI-Compatibility:** Native support for 8 major local AI inference engines: Ollama, LM Studio, LocalAI, vLLM, Jan, GPT4All, Llama.cpp, and Oobabooga.
* **Custom Base URLs:** Users can override the default connection ports (e.g., `localhost:11434`) dynamically via the UI to accommodate custom network setups.

## 3. Target Features (Roadmap)

### 3.1 Zero-Dependency Distribution

* **Single Binary Compilation:** Compile the TypeScript/React codebase into a single, self-contained native executable binary (e.g., `locus-macos`, `locus-linux`, `locus.exe`) using tools like `pkg` or `bun`.
* **Global Installer Script:** Provide a standard curl-to-sh install script (`curl -fsSL https://... | sh`).

### 3.2 Advanced Context & Discovery Tools

* **Vector Embeddings Index (RAG):** Integrate a tiny local embedding database (such as a native JS vector store or SQLite-vec) to vectorize the workspace for fast semantic searching across thousands of source files.
* **Intelligent File Token Budgeting:** Build an automatic system token counter that warns the user if reading a specific file will exceed the local model's maximum context length.

### 3.3 Enterprise-Grade Security Extensions

* **Tool Rule Configuration (Auto-Approve Whitelists):** Allow users to flag certain tools or paths as safe (e.g., `read_file` is auto-approved, but `run_command` always prompts).
* **System Environment Sandbox:** Execute all `run_command` actions inside an isolated local container (like Docker) or an ephemeral shell environment.

## 4. Proposed Implementation Roadmap

1. **Phase 1: Persistence, UX, & Web Dashboard (COMPLETED)**
   Implemented the Global Config System, Session History Recorder, Expanded Providers, and the complete Web UI.
2. **Phase 2: Security Ergonomics**
   Build the Auto-Approve Whitelist Rule system into the existing Security Verification Gateway.
3. **Phase 3: Distribution**
   Configure Single Binary Compilation and the Global Installer script.
4. **Phase 4: Advanced Context & Sandboxing**
   Integrate RAG embeddings, token budgeting, and the execution sandbox.
