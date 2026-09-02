# Locus CLI Architecture

This directory contains the source code for **Locus**, the standalone local AI CLI orchestrator.

## Directory Structure

The source code has been modularized into domain-specific layers to separate the user interface (React Ink) from data persistence and LLM service integrations.

```
src/
├── index.tsx                # Application Entry Point
│                            # Handles CLI arguments (like `sessions` and `--session`) and bootstraps the React app.
│
├── components/              # UI Layer (React Ink)
│   ├── App.tsx              # Main orchestrator state machine (Setup / Chat screens, hotkeys, slash commands).
│   └── SyntaxHighlighter.tsx# Parses markdown and highlights code blocks for the terminal.
│
├── core/                    # State & Persistence
│   ├── config.ts            # Manages global `~/.config/locus/config.json` (saved providers/models).
│   └── session.ts           # Manages chat histories in `~/.config/locus/history/`.
│
└── services/                # External Integrations
    ├── llm.ts               # Local AI clients (Ollama, LM Studio API wrappers).
    └── tools.ts             # Host orchestration tools (read_file, write_file, execute_command).
```

## State Machine (`App.tsx`)

Locus uses a simple sequential state machine driven by the `Step` type:
1. `SELECT_PROVIDER`: Prompt user to pick Ollama / LM Studio.
2. `SELECT_MODEL`: Fetch models from the chosen provider and prompt user.
3. `SELECT_SESSION`: (Triggered via `/sessions`) Let user pick a previous chat history.
4. `CHAT`: The main event loop where streaming LLM generation happens.

## Data Flow

1. **Input**: User types in `TextInput`.
2. **Commands**: Intercepted locally (`/provider`, `/model`, `/sessions`).
3. **Generation**: `handleSubmitChat` triggers `getLocalClient().chat()`.
4. **Tool Calling**: Locus intercepts raw JSON structures matching tool schemas and executes local functions (`executeTool`) asynchronously before returning the result to the LLM.
5. **Persistence**: The chat array is continuously synced to disk via `session.ts`.
