// ── Shared constants ───────────────────────────────────────────────────────────
// Centralised here to avoid duplication across CLI and Web code paths.

/** Tools that require explicit user approval before running. */
export const GUARDED_TOOLS = new Set(['write_file', 'run_command']);

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
