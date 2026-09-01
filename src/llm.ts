import OpenAI from 'openai';

export type Provider = 'ollama' | 'lmstudio';

export function getBaseURL(provider: Provider): string {
  return provider === 'ollama' 
    ? 'http://localhost:11434/v1' 
    : 'http://localhost:1234/v1';
}

export function getLocalClient(provider: Provider) {
  return new OpenAI({
    baseURL: getBaseURL(provider),
    apiKey: 'local-no-key-required', 
  });
}

// Dynamically fetch installed models from the active local provider
export async function fetchLocalModels(provider: Provider): Promise<string[]> {
  try {
    const url = `${getBaseURL(provider)}/models`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = (await response.json()) as { data: Array<{ id: string }> };
    return data.data.map((model) => model.id);
  } catch (error) {
    throw new Error(`Could not connect to ${provider}. Make sure it is running background server instances.`);
  }
}
