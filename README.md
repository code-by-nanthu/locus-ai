<div align="center">

```text
██╗      ██████╗  ██████╗██╗   ██╗███████╗
██║     ██╔═══██╗██╔════╝██║   ██║██╔════╝
██║     ██║   ██║██║     ██║   ██║███████╗
██║     ██║   ██║██║     ██║   ██║╚════██║
███████╗╚██████╔╝╚██████╗╚██████╔╝███████║
╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
```

**A Standalone Local AI Orchestrator with UI & CLI**

</div>

---

**Locus** is a powerful, privacy-first local AI orchestrator that acts as your agentic coding and terminal assistant. Running entirely locally on top of your existing local LLM providers (Ollama, LM Studio, Oobabooga), Locus allows models to autonomously execute terminal commands, read/write files, and interact with the browser while giving you complete visibility and control over security approvals.

## 🚀 Key Features

* **Multi-Provider Support:** First-class support for `Ollama`, `LM Studio`, and `Oobabooga`.
* **Autonomous Agent Execution:** Locus natively intercepts and executes tool calls made by your AI (e.g., file reading/writing, terminal commands).
* **Security & Whitelisting Gateway:** Tools that modify your system are gated by user approval, complete with an "Auto-Approve" feature and pattern matching whitelist.
* **Dual Interfaces:** Features a beautiful, responsive terminal UI (built with React Ink) and a separate modern Web UI.
* **Session Management:** Persists all chat sessions automatically to `~/.config/locus/history`. Jump back into past conversations effortlessly.
* **Git Integration:** Includes a built-in AI commit generator (`locus commit`) to review diffs and suggest Conventional Commits.
* **Markdown Exports:** Export your technical discussions to clean markdown files via `locus export`.

## 📦 Installation & Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Build the project (compiles both the Web UI and the CLI application):

   ```bash
   pnpm build
   ```

3. Start Locus:

   ```bash
   pnpm start
   ```

*(On first run, Locus will guide you through connecting to a provider and selecting a model).*

## 🏗 Directory Structure

The source code is highly modular, separating the UI layer from the LLM execution and persistence layers:

```text
src/
├── index.tsx                # CLI Entry Point & Bootstrapper
├── cli/                     
│   ├── commands/            # Standalone sub-commands (commit, export, ui)
│   └── components/          # React Ink Terminal UI layer (State machines, Chat Views)
├── web/                     # Web UI Application (Vite)
├── core/                    
│   ├── config.ts            # Global configuration (providers, models, whitelist)
│   └── session.ts           # Chat history persistence and querying
└── services/                
    ├── llm.ts               # Local AI client wrappers (OpenAI compatible)
    ├── agent.ts             # Orchestrates SSE streaming and tool loop execution
    └── tools.ts             # The actual system tools the LLM can execute
```

## 🧠 Under the Hood

Locus implements a custom conversational state machine and streaming execution agent.

1. **Interactive State:** Setup screens seamlessly flow into the `CHAT` loop where Locus maintains context.
2. **Streaming & Tools:** Responses are streamed via SSE. If a tool call pattern is detected in the stream, Locus buffers it, executes the system function (like `write_file` or `run_command`), appends the tool's result to the context, and automatically forces the LLM to continue synthesizing its thoughts based on the new data.
