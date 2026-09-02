import OpenAI from 'openai';

export type Provider = 'ollama' | 'lmstudio';

const DEFAULT_URLS: Record<Provider, string> = {
  ollama:   'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};

/**
 * Returns the base URL for a provider.
 * Accepts an optional override from the user's config file.
 */
export function getBaseURL(provider: Provider, override?: string): string {
  return override ?? DEFAULT_URLS[provider];
}

/**
 * Creates an OpenAI-compatible client for a local provider.
 * Accepts an optional baseURL override so config-supplied addresses replace
 * the hardcoded localhost defaults.
 */
export function getLocalClient(provider: Provider, baseURL?: string) {
  return new OpenAI({
    baseURL: getBaseURL(provider, baseURL),
    apiKey: 'local-no-key-required',
  });
}

/** Dynamically fetch installed models from the active local provider */
export async function fetchLocalModels(provider: Provider, baseURL?: string): Promise<string[]> {
  try {
    const url = `${getBaseURL(provider, baseURL)}/models`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = (await response.json()) as { data: Array<{ id: string }> };
    return data.data.map((model) => model.id);
  } catch {
    throw new Error(`Could not connect to ${provider}. Make sure it is running.`);
  }
}
