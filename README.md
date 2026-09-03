<div align="center">

```text
██╗      ██████╗  ██████╗██╗   ██╗███████╗
██║     ██╔═══██╗██╔════╝██║   ██║██╔════╝
██║     ██║   ██║██║     ██║   ██║███████╗
██║     ██║   ██║██║     ██║   ██║╚════██║
███████╗╚██████╔╝╚██████╗╚██████╔╝███████║
╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
```

**Local AI coding assistant with a terminal UI and web dashboard**

[![CI](https://github.com/code-by-nanthu/locus-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/code-by-nanthu/locus-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Distribution](https://img.shields.io/badge/Distribution-Standalone_Binary-emerald.svg)](docs/prd.md)

</div>

---

Locus is a coding assistant that runs on your machine against your own local models. It connects to backends like Ollama, LM Studio, or llama.cpp, reads your codebase, runs commands, and makes edits without sending code or prompts to an external API.

You get two ways to work with it: an interactive terminal app (built with Ink) and a local web interface that runs on `http://localhost:7331`.

---

## What it does

Most coding agents assume you are pointing them at a frontier cloud model with a massive context window. Small 3B to 14B parameter models running locally have very different failure modes: they drop context quickly, hallucinate when asked to rewrite 400-line files from scratch, and get stuck in tool call loops if schemas are too complicated.

Locus is designed around those realities:

* **Targeted file edits:** Instead of rewriting entire files, Locus uses search-and-replace patches. If a model makes a mistake, you can revert it with `/undo`.
* **Keeps files inside the project:** File paths resolve against the workspace root. It rejects directory traversal attempts and blocks sensitive files like `.env` or SSH keys.
* **Approval for risky tools:** Shell commands, file writes, and browser automation require confirmation before running. You can whitelist specific read-only commands so it stops asking for things like `git status`.
* **Context budgeting:** It compacts conversation history and trims long tool outputs so smaller 8k to 32k context windows do not overflow mid task.
* **Works with 8 local engines:** Out of the box support for Ollama, LM Studio, vLLM, LocalAI, Jan, GPT4All, llama.cpp, and text-generation-webui.
* **Standalone binary:** You can compile Locus down to a single 64 MB executable that runs without Node.js or pnpm installed.

---

## Installation

### 1. Install the standalone binary

Download and run the installer for your system:

**macOS and Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.ps1 | iex
```

To remove Locus later:

* macOS and Linux: run `./scripts/install.sh --uninstall`
* Windows: run `.\scripts\install.ps1 -Uninstall`

### 2. Build from source

If you want to edit the code or build it yourself:

```bash
git clone https://github.com/code-by-nanthu/locus-ai.git
cd locus-ai
pnpm install
pnpm build
```

Run tests to make sure everything passes:

```bash
pnpm test
```

Start the interactive terminal:

```bash
pnpm start
```

Or start the web dashboard:

```bash
pnpm start ui
```

### 3. Compile your own binary

To produce the single executable yourself:

```bash
pnpm run build:binary
./bin/locus --help
```

---

## Command line usage

| Command | What it does |
| :--- | :--- |
| `locus` | Starts the terminal assistant |
| `locus ui [--port <port>]` | Starts the web UI (default: port 7331, picks next free port if busy) |
| `locus eval` | Runs the benchmark test suite against sample fixture projects |
| `locus diff` | Shows git diff stats and modified files in the current repo |
| `locus commit` | Generates a Conventional Commit message from staged changes |
| `locus sessions` | Lists your saved conversations with timestamps |
| `locus --session <id>` | Resumes a previous conversation by ID |
| `locus export [id]` | Exports a chat to Markdown |
| `locus export [id] --format html` | Exports a chat to a standalone styled HTML page |
| `locus export [id] --format json` | Exports the raw chat log to JSON |
| `locus update` | Checks GitHub for new releases and updates the binary |

---

## Slash commands

Type `/` in either the terminal or the web chat to bring up built-in commands:

* `/diff`: Review current git changes before letting the agent continue.
* `/undo`: Revert the last file modification made by the agent.
* `/whitelist`: Manage auto-approved commands and tools.
* `/sessions`: Pick and switch to an earlier conversation.
* `/model`: Switch to another model without restarting.
* `/provider`: Switch backends (e.g. from Ollama to LM Studio).

---

## Project structure

```text
src/
├── index.tsx                         # CLI entry point and argument router
├── cli/
│   ├── commands/                     # Subcommands (commit, diff, export, ui, update)
│   └── components/                   # Terminal interface (React Ink)
├── web/                              # Browser interface (React, Tailwind, Vite)
│   ├── components/layout/            # Header, sidebar, session grouping
│   ├── components/chat/              # Message list, tool cards, diff viewer
│   ├── components/modals/            # Settings, shortcuts, approvals
│   └── App.tsx                       # Web app state and SSE streaming
├── core/
│   ├── config.ts                     # Configuration (~/.config/locus/config.json)
│   ├── constants.ts                  # Default ports and security whitelist patterns
│   └── session.ts                    # Session storage and single-writer file locking
├── services/
│   ├── llm.ts                        # Provider endpoints and model detection
│   ├── agent.ts                      # Agent loop, tool execution, and prompt compaction
│   └── tools.ts                      # Safe file reading, surgical edits, commands
└── test/                             # Tests and scripted evaluation tasks
```

---

## Testing

Locus includes unit tests and an automated task benchmark:

```bash
pnpm test
```

This runs:

* **Tool sandboxing:** checks path traversal blocking, secret filtering, and file editing.
* **Agent parsing:** tests pseudo-tool recovery, prompt compaction, and intent filtering.
* **Evaluation harness:** runs scripted coding tasks on test fixtures to measure pass rates.

---

## Documentation

* [Product requirements (PRD)](docs/prd.md)
* [Engineering plan](docs/locus-action-plan.md)
* [Threat model and security](docs/threat-model.md)
* [Tool reference](docs/tool-reference.md)
* [Hardware and model guide](docs/model-recommendations.md)
* [Changelog](CHANGELOG.md)

---

## License

MIT (c) [code-by-nanthu](https://github.com/code-by-nanthu)
