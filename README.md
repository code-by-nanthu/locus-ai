<div align="center">

```text
██╗      ██████╗  ██████╗██╗   ██╗███████╗
██║     ██╔═══██╗██╔════╝██║   ██║██╔════╝
██║     ██║   ██║██║     ██║   ██║███████╗
██║     ██║   ██║██║     ██║   ██║╚════██║
███████╗╚██████╔╝╚██████╗╚██████╔╝███████║
╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
```

**A Standalone, Privacy-First Local AI Orchestrator with UI & CLI**

</div>

---

**Locus** is a privacy-first local AI coding orchestrator and agent assistant. Running entirely on top of your local LLM engines (Ollama, LM Studio, vLLM, LocalAI, Jan, GPT4All, Llama.cpp, Oobabooga), Locus autonomously executes tool operations—surgical file edits, command execution, workspace exploration, and headless browser automation—while maintaining strict security containment and full user approval gates.

## 🚀 Key Features

* **8 Local AI Providers:** Direct plug-and-play support for `Ollama`, `LM Studio`, `LocalAI`, `vLLM`, `Jan`, `GPT4All`, `Llama.cpp`, and `Oobabooga`.
* **Centralized Autonomous Agent Loop:** Unified streaming agent engine powering both CLI and Web UI with parallel tool buffering, strict `tool_call_id` plumbing, and loop runaway guardrails.
* **Surgical Diff & File Editing (`edit_file`):** Search-and-replace file editing preventing truncation and hallucinations on small models.
* **Workspace Path Containment & Secret Exclusion:** Enforces directory containment using `fs.realpath` and automatically denies access to sensitive credentials (`.env`, `id_rsa`, `.git/config`).
* **Context Compaction for Local Models:** Automatically condenses historical turns and large tool outputs to prevent context overflow on 8K–32K local models.
* **Project Instruction Awareness:** Automatically loads workspace guidance from `LOCUS.md`, `AGENTS.md`, or `CLAUDE.md` into the active system context.
* **Git Context Awareness & Diff Command:** Live branch status injection, `/diff` slash command, and `locus diff` CLI subcommand.
* **Security & Whitelisting Gateway:** Destructive tools (`write_file`, `edit_file`, `run_command`, `browser_action`) require approval with single-use cryptographic tokens, auto-expiring TTL, and granular whitelist rules.
* **Loopback Token Auth & DNS Rebinding Protection:** Web server is secured with loopback bearer token authorization and Host-header validation.
* **Dual Interfaces:** Reactive terminal UI built with React Ink and a modern responsive Web UI with live token budget indicators.
* **Multi-Format Export:** Export technical sessions to Markdown, JSON, or self-contained HTML reports via `locus export`.

## 📦 Installation & Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Build the project:

   ```bash
   pnpm build
   ```

3. Run the automated test suite & eval harness:

   ```bash
   pnpm test
   ```

4. Start Locus:

   ```bash
   pnpm start
   # or launch the Web UI directly:
   pnpm start ui
   ```

## 🛠 Available CLI Subcommands

| Command | Description |
| :--- | :--- |
| `pnpm start` | Launch the interactive React Ink terminal assistant |
| `pnpm start ui` | Launch the modern browser-based Web UI with loopback auth |
| `pnpm start diff` | View git diff and modified file statistics for the project |
| `pnpm start commit` | Analyze git staged diff and generate Conventional Commits |
| `pnpm start export [id]` | Export session to `locus-session-[id]-[date].md` |
| `pnpm start export [id] --format html` | Export session to a self-contained, styled HTML report |
| `pnpm start export [id] --format json` | Export full raw session conversation to JSON |
| `pnpm start sessions` | View a table of all saved sessions and timestamps |
| `pnpm start -- --session <id>` | Resume a specific past conversation in the terminal |

## ⚡ Interactive Slash Commands

Inside either the CLI terminal or Web chat, enter `/` to invoke commands:

* `/diff` — Inspect working tree changes and git diff summary
* `/whitelist` — View or reset auto-approved tools and command patterns
* `/sessions` — Browse and restore past conversation sessions
* `/model` — Switch active model on the fly
* `/provider` — Switch local AI runtime provider

## 🏗 Project Architecture

```text
src/
├── index.tsx                # Main CLI entry point & argument router
├── cli/                     
│   ├── commands/            # Standalone subcommands (commit, diff, export, ui)
│   └── components/          # React Ink terminal UI (chat, tools, setup)
├── web/                     # Web UI Application (React, Vite, TailwindCSS)
├── core/                    
│   ├── config.ts            # Persistent config (~/.config/locus/config.json)
│   ├── constants.ts         # Guarded tools whitelist & pattern resolvers
│   └── session.ts           # Chat persistence (~/.config/locus/history)
├── services/                
│   ├── llm.ts               # Local AI provider endpoints & model fetchers
│   ├── agent.ts             # Central agent loop, compaction, guardrails, git context
│   └── tools.ts             # Tool schemas, execution, safe path resolution
└── test/                    # Node test runner suite & programmatic eval harness
```

## 🧪 Testing & Verification

Run the comprehensive test suite with Node's native test runner:

```bash
pnpm test
```

Verifies:
- **Agent Intelligence & Compaction:** Pseudo-tool-call parsing, context compaction, and auth pattern mapping.
- **Security & Path Containment:** Secret file blocking, directory traversal rejection (`S-4`), surgical edits (`AG-8`), and safe command execution.
- **Eval Harness (`I-1`):** Programmatic task execution against fixture projects with automated pass-rate validation.
