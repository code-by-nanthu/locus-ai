# Implementation Plan: Code Audit Fixes

Fixes are ordered by **dependency** — foundation files first, dependent files last.

## Phase 1 — Foundation: `src/core/constants.ts` [NEW]
Consolidate duplicated constants. Both `App.tsx` files and `ui.ts` will import from here.
- `FALLBACK_SUGGESTIONS` array
- `GUARDED_TOOLS` Set
- `PROVIDER_LABELS` map (bonus — currently duplicated between web/CLI)

---

## Phase 2 — Core Services (low-risk, isolated)

### `src/core/session.ts`
- Simplify `generateSessionId` regex chain (single `.slice` + `.replace`)
- Rewrite `listSessionsDetail` using `Promise.allSettled` (flatter, clearer intent)

### `src/services/llm.ts`
- Make `getBaseURL` private, rename to `resolveBaseURL`
- Update callers in same file

### `src/services/tools.ts`
- Remove obvious comment on line 121
- Add exported `normalizeToolName()` utility
- Fix path resolution guard comment (keep it)

---

## Phase 3 — Extract Agent Service: `src/services/agent.ts` [NEW]
Extract the SSE streaming agent loop out of `ui.ts`:
```ts
export async function runAgentTurn(
  client: OpenAI,
  config: LocusConfig,
  history: Message[],
  sessionId: string,
  pendingApprovals: Map<...>,
  onEvent: (event: SSEEvent) => void
): Promise<void>
```
The `runTool` helper and its authorization logic moves here too, cleaned up with guard clauses.

---

## Phase 4 — Refactor `src/commands/ui.ts`
- Remove local `FALLBACK_SUGGESTIONS`, `GUARDED_TOOLS` — import from constants
- Delegate agent loop to `agent.ts`
- Remove obvious comments
- Fix `argsObj` → `parsedArgs`

---

## Phase 5 — Extract CLI Hooks

### `src/hooks/useApprovalGate.ts` [NEW]
Extract `requestApproval`, `pendingApproval` state, and `approvalResolveRef` from `App.tsx`.

### `src/hooks/useSessionManager.ts` [NEW]
Extract the save-session logic, `sessionIdRef`, and session listing state.

---

## Phase 6 — Refactor `src/components/App.tsx`
- Remove local `GUARDED_TOOLS`, `FALLBACK_SUGGESTIONS` — import from constants
- Rename: `currentStream` → `streamingContent`, `isPseudo` → `isPseudoToolCall`, `keepRunningLoop` → inline `break`, `incomingBuffer` → `accumulatedContent`
- Replace tool-name fallback chain with `normalizeToolName()`
- Remove orphaned divider comment on line 836
- Use `useApprovalGate` and `useSessionManager` hooks
- Extract screen renders into named `render*` functions within the component for readability without full file splits (avoids prop-drilling explosion)

---

## Phase 7 — Fix `src/index.tsx`
- Extract session resolution into `resolveInitialSession()` helper function

---

## Phase 8 — Build & Verify
- `pnpm build` — confirm zero TypeScript errors
- Spot-check that session loading, agent loop, and tool authorization still work

> [!NOTE]
> The `src/components/App.tsx` full screen-level split (into separate `SetupWizard.tsx`, `SessionPicker.tsx`, etc.) would require threading ~20 state values through props or a context. That's a larger refactor better done with React Context. I'll use **named render functions** inside the component for now as an intermediate improvement — this still dramatically reduces cognitive load without prop-drilling risk.
