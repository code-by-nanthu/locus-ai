// ── Shared constants ───────────────────────────────────────────────────────────
// Centralised here to avoid duplication across CLI and Web code paths.

/** Tools that require explicit user approval before running. */
export const GUARDED_TOOLS = new Set(['write_file', 'edit_file', 'run_command', 'browser_action']);

/** Derives the authorization pattern key for a given tool call. */
export function getAuthPattern(name: string, args?: Record<string, any>): string {
  if (name === 'run_command') {
    const execName = (args?.command ?? '').trim().split(/\s+/)[0] || 'command';
    return `run_command:${execName}`;
  }
  if (name === 'browser_action') {
    const action = args?.action || 'action';
    return `browser_action:${action}`;
  }
  return name;
}

/**
 * Fallback starter prompts shown when the LLM suggestion endpoint is
 * unavailable or returns an unparseable response.
 */
export const FALLBACK_SUGGESTIONS = [
  'Summarise the structure of this project',
  'Find every TODO under src/ and group them by file',
  'Run the test suite and explain any failures',
  'What changed in the last commit?',
];

/**
 * Human-readable label for each supported provider key.
 * Used in both the CLI SelectInput and the Web UI <select> dropdown.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  ollama:    'Ollama',
  lmstudio:  'LM Studio',
  localai:   'LocalAI',
  vllm:      'vLLM',
  jan:       'Jan',
  gpt4all:   'GPT4All',
  llamacpp:  'Llama.cpp',
  oobabooga: 'Oobabooga',
};
