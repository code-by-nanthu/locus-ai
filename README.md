<div align="center">

```text
██╗      ██████╗  ██████╗██╗   ██╗███████╗
██║     ██╔═══██╗██╔════╝██║   ██║██╔════╝
██║     ██║   ██║██║     ██║   ██║███████╗
██║     ██║   ██║██║     ██║   ██║╚════██║
███████╗╚██████╔╝╚██████╗╚██████╔╝███████║
╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
```

**A Standalone, Privacy-First Local AI Coding Orchestrator with UI & CLI**

[![CI](https://github.com/code-by-nanthu/locus-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/code-by-nanthu/locus-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero-Dependency](https://img.shields.io/badge/Distribution-Native_Binary-emerald.svg)](docs/prd.md)

</div>

---

**Locus** is a privacy-first local AI coding orchestrator and agent assistant. Running entirely on top of your local LLM engines (Ollama, LM Studio, vLLM, LocalAI, Jan, GPT4All, Llama.cpp, Oobabooga), Locus autonomously executes tool operations—surgical file edits, command execution, workspace exploration, and headless browser automation—while maintaining strict security containment and full user approval gates.

---

## 🚀 Key Features

* **8 Local AI Inference Engines:** Direct plug-and-play support for `Ollama`, `LM Studio`, `LocalAI`, `vLLM`, `Jan`, `GPT4All`, `Llama.cpp`, and `Oobabooga`.
* **Zero-Dependency Native Binary Distribution:** Compile into a self-contained native executable (`bin/locus`, 64 MB Mach-O arm64 or ELF x64) that runs out of the box with **zero Node.js or external runtime dependencies**.
* **Centralized Autonomous Agent Loop:** Unified streaming agent engine powering both CLI and Web UI with parallel tool buffering, strict `tool_call_id` plumbing, and loop runaway guardrails.
* **Surgical Diff & File Editing (`edit_file`):** Exact search-and-replace file editing preventing full-file truncation and hallucination on small models, with automatic backup snapshots and `/undo` support.
* **Workspace Path Containment (`EXEC-2`):** Canonical `fs.realpath` resolution strictly verified against `root + path.sep` boundaries to eliminate directory traversal escapes and credential leakage (`.env`, `id_rsa`, `.git/config`).
* **Intelligent Context Gating & Clean Prompting:** Automatically loads workspace guidance from `LOCUS.md`, `AGENTS.md`, or `CLAUDE.md`. Non-technical queries (e.g. creative writing, greetings) bypass git status dumping so small models stay focused.
* **Context Compaction for Local Models:** Condenses older tool outputs and truncates turns gracefully to fit within 8K–32K local context windows.
* **Security & Whitelisting Gateway:** Destructive tools (`write_file`, `edit_file`, `run_command`, `browser_action`) require user approval with single-use cryptographic tokens, auto-expiring TTL, and granular whitelist rules.
* **Loopback Token Auth & DNS Rebinding Defense:** Web server binds strictly to `127.0.0.1`, validates `Host` headers with `421 Misdirected Request` enforcement, and requires persistent Bearer token authorization.
* **Dual Interfaces:** Reactive terminal UI built with React Ink and a modular, responsive Web UI with live token budget indicators and session management.
* **Automated Benchmark Eval Harness (`locus eval`):** Built-in scripted eval harness testing workspace search, surgical diffs, and command execution against fixture repositories with automated pass-rate validation.
* **Multi-Format Export:** Export technical sessions to Markdown, JSON, or self-contained HTML reports via `locus export`.

---

## 📦 Installation & Getting Started

### Option 1: Zero-Dependency 1-Line Installer (Recommended)

Install the standalone native executable directly without requiring Node.js or pnpm:

**macOS & Linux (Terminal):**
```bash
curl -fsSL https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.ps1 | iex
```

To uninstall:
- On macOS/Linux: `./scripts/install.sh --uninstall`
- On Windows: `.\scripts\install.ps1 -Uninstall`

### Option 2: From Source via pnpm

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/code-by-nanthu/locus-ai.git
   cd locus-ai
   pnpm install
   ```

2. Build the project:

   ```bash
   pnpm build
   ```

3. Run the automated test suite:

   ```bash
   pnpm test
   ```

4. Launch Locus:

   ```bash
   pnpm start
   # or launch the Web UI dashboard:
   pnpm start ui
   ```

### Option 3: Compile Your Own Standalone Native Binary

Compile the full application into a self-contained native binary using Bun:

```bash
pnpm run build:binary
./bin/locus --help
```

---

## 🛠 Available CLI Subcommands

| Command | Description |
| :--- | :--- |
| `locus` | Launch the interactive React Ink terminal assistant |
| `locus ui` | Launch the modern browser-based Web UI with loopback security |
| `locus eval` | Run the automated agent benchmark evaluation harness against fixture projects |
| `locus diff` | View git diff statistics and modified file details for the project |
| `locus commit` | Analyze staged git changes and generate Conventional Commit messages |
| `locus sessions` | View a table of all saved sessions and timestamps |
| `locus --session <id>` | Resume a specific past conversation in the terminal |
| `locus export [id]` | Export session to a formatted Markdown document |
| `locus export [id] --format html` | Export session to a self-contained, styled HTML report |
| `locus export [id] --format json` | Export full raw session conversation to JSON |

---

## ⚡ Interactive Slash Commands

Inside either the CLI terminal or Web chat, enter `/` to invoke commands:

* `/diff` — Inspect working tree changes and git diff summary
* `/undo` — Revert the last file modification made by the agent
* `/whitelist` — View or reset auto-approved tools and command patterns
* `/sessions` — Browse and restore past conversation sessions
* `/model` — Switch active model on the fly
* `/provider` — Switch local AI runtime provider

---

## 🏗 Modular Project Architecture

```text
src/
├── index.tsx                         # Main CLI entry point & argument router
├── cli/                     
│   ├── commands/                     # Standalone subcommands (commit, diff, export, ui)
│   └── components/                   # React Ink terminal UI (chat, tools, setup)
├── web/                              # Modularized Web UI Application
│   ├── types.ts                      # Domain interfaces (Session, Message, ApprovalRequest)
│   ├── lib/utils.ts                  # Pure helpers (formatters, session grouping, token estimator)
│   ├── hooks/                        # Custom React hooks (useTheme, useShortcuts, useScrollAnchor)
│   ├── components/
│   │   ├── ui/                       # Reusable UI controls (IconButton, CopyButton)
│   │   ├── layout/                   # Layout components (Header, Sidebar)
│   │   ├── chat/                     # Conversation turns (MessageList, MessageBubble, ToolTurn, CodeBlock)
│   │   └── modals/                   # Dialogs (ApprovalModal, ShortcutsModal, SettingsModal, ErrorBanner)
│   └── App.tsx                       # Clean root coordinator (~390 lines)
├── core/                    
│   ├── config.ts                     # Cross-platform config (~/.config/locus/config.json)
│   ├── constants.ts                  # Guarded tools whitelist & pattern resolvers
│   └── session.ts                    # Chat persistence & single-writer locks
├── services/                
│   ├── llm.ts                        # Local AI provider endpoints & model discovery
│   ├── agent.ts                      # Central agent loop, compaction, guardrails, git context
│   └── tools.ts                      # Tool schemas, execution, safe path resolution
└── test/                             # Node test runner suite & programmatic eval harness
```

---

## 🧪 Testing & Verification

Run the comprehensive test suite with Node's native test runner:

```bash
pnpm test
```

Verifies:
* **Agent Intelligence & Compaction:** Pseudo-tool-call parsing, context compaction, intent gating, and auth pattern mapping.
* **Security & Path Containment:** Secret file blocking, directory traversal rejection (`EXEC-2`), surgical edits (`AG-8`), and safe command execution.
* **Eval Benchmark Harness (`EVAL-1`):** Programmatic task execution against fixture projects with automated pass-rate validation.

---

## 📚 Documentation

* [Product Requirements Document (PRD)](docs/prd.md)
* [Engineering Action Plan](docs/locus-action-plan.md)
* [Gap Register (100% Resolved)](docs/locus-gap-register.md)
* [Threat Model & Security Policy](docs/threat-model.md)
* [Tool & Provider Reference](docs/tool-reference.md)
* [Hardware & Model Recommendations](docs/model-recommendations.md)
* [Changelog](CHANGELOG.md)

---

## 📄 License

MIT © [code-by-nanthu](https://github.com/code-by-nanthu)
