# Implementation Plan: Restructure `src/` to Symmetrical CLI & Modular Architecture

This plan restructures the codebase into a clean, symmetrical architecture where CLI-specific code is isolated under `src/cli/` (mirroring `src/web/`), terminal components are split into focused submodules, hooks are centralized with consistent naming conventions, and shared agent utilities are unified.

---

## Proposed Architecture

```text
src/
├── index.tsx                         # CLI entry point & dispatcher
│
├── core/                             # Shared storage, schemas, config & constants
│   ├── config.ts
│   ├── constants.ts
│   └── session.ts
│
├── services/                         # Shared services (LLM client, tools, agent utilities)
│   ├── agent.ts                      # Agent streaming loop & prompt suggestion helper
│   ├── llm.ts
│   └── tools.ts
│
├── cli/                              # Dedicated CLI domain (Terminal UI / Ink)
│   ├── commands/                     # Subcommand handlers
│   │   ├── commit.ts
│   │   ├── export.ts
│   │   └── ui.ts
│   ├── hooks/                        # Terminal React hooks
│   │   ├── useApprovalGate.ts
│   │   ├── useSessionManager.ts
│   │   └── useTerminalSize.ts        # (renamed from use-terminal-size.ts)
│   └── components/                   # Modular Ink components
│       ├── App.tsx                   # Main CLI container & coordinator
│       ├── chat/                     # Conversation UI components
│       │   ├── UserMessage.tsx
│       │   ├── AgentMessage.tsx
│       │   ├── ToolEntry.tsx
│       │   └── WelcomeHints.tsx
│       ├── setup/                    # Setup wizard & picker components
│       │   ├── SetupShell.tsx
│       │   ├── StepBar.tsx
│       │   ├── ProviderItem.tsx
│       │   └── ModelItem.tsx
│       └── common/                   # Shared terminal primitives
│           ├── Divider.tsx
│           ├── ElapsedTimer.tsx
│           ├── Logo.tsx
│           ├── ascii-art.ts
│           └── SyntaxHighlighter.tsx
│
└── web/                              # Dedicated Web UI (Vite + React 19 + Tailwind)
    ├── App.tsx
    ├── index.css
    ├── index.html
    ├── main.tsx
    └── public/
```

---

## Proposed Changes

### 1. Shared Services & Core

#### [MODIFY] [`src/services/agent.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/services/agent.ts)
- Add exportable helper `fetchPromptSuggestions(client, model, signal?)` to eliminate duplication between `ui.ts` and `App.tsx`.

---

### 2. CLI Hooks & Commands Reorganization

#### [NEW] [`src/cli/hooks/useTerminalSize.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/hooks/useTerminalSize.ts)
- Move and rename `src/components/use-terminal-size.ts` to `src/cli/hooks/useTerminalSize.ts` with camelCase naming.

#### [NEW] [`src/cli/hooks/useApprovalGate.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/hooks/useApprovalGate.ts)
- Relocate from `src/hooks/useApprovalGate.ts`.

#### [NEW] [`src/cli/hooks/useSessionManager.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/hooks/useSessionManager.ts)
- Relocate from `src/hooks/useSessionManager.ts`.

#### [DELETE] Old hooks directory files (`src/hooks/*`, `src/components/use-terminal-size.ts`).

#### [NEW] [`src/cli/commands/commit.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/commands/commit.ts)
- Relocate from `src/commands/commit.ts` and update relative imports (`../../core/`, `../../services/`).

#### [NEW] [`src/cli/commands/export.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/commands/export.ts)
- Relocate from `src/commands/export.ts` and update relative imports.

#### [NEW] [`src/cli/commands/ui.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/commands/ui.ts)
- Relocate from `src/commands/ui.ts`, update relative imports and static assets path resolution.

#### [DELETE] Old commands directory files (`src/commands/*`).

---

### 3. CLI Modular Components

#### [NEW] Common Components:
- [`src/cli/components/common/Divider.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/common/Divider.tsx)
- [`src/cli/components/common/ElapsedTimer.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/common/ElapsedTimer.tsx)
- [`src/cli/components/common/Logo.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/common/Logo.tsx)
- [`src/cli/components/common/ascii-art.ts`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/common/ascii-art.ts)
- [`src/cli/components/common/SyntaxHighlighter.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/common/SyntaxHighlighter.tsx)

#### [NEW] Chat Components:
- [`src/cli/components/chat/UserMessage.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/chat/UserMessage.tsx)
- [`src/cli/components/chat/AgentMessage.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/chat/AgentMessage.tsx)
- [`src/cli/components/chat/ToolEntry.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/chat/ToolEntry.tsx)
- [`src/cli/components/chat/WelcomeHints.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/chat/WelcomeHints.tsx)

#### [NEW] Setup Components:
- [`src/cli/components/setup/StepBar.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/setup/StepBar.tsx)
- [`src/cli/components/setup/SetupShell.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/setup/SetupShell.tsx)
- [`src/cli/components/setup/ProviderItem.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/setup/ProviderItem.tsx)
- [`src/cli/components/setup/ModelItem.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/setup/ModelItem.tsx)

#### [MODIFY] [`src/cli/components/App.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/cli/components/App.tsx)
- Deconstruct the 1,300+ line monolith by importing the extracted chat, setup, common components and hooks.
- Retain state machine, hotkeys, and chat submission logic in a clean, concise container.

#### [DELETE] Old components directory files (`src/components/*`).

---

### 4. Entry Point

#### [MODIFY] [`src/index.tsx`](file:///Users/nanthups/Workspace/Learning/local-ai-cli/src/index.tsx)
- Update imports to point to `./cli/components/App.js` and `./cli/commands/*.js`.

---

## Verification Plan

### Automated Tests & Type Checking
- Run `npx tsc --noEmit` to verify 100% type safety and resolved module paths.
- Run `pnpm build` to verify that both the Vite web build and the TypeScript CLI distribution build succeed.

### Manual Verification
- Test `locus --help` / `pnpm start` (CLI launch).
- Test CLI subcommands: `locus export`, `locus commit`, `locus sessions`.
