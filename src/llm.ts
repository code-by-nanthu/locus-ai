import OpenAI from 'openai';
export type Provider = 'ollama' | 'lmstudio';
export function getLocalClient(provider: Provider) {
  // Map default local provider server target host addresses
  const baseURL = provider === 'ollama' 
    ? 'http://localhost:11434/v1' 
    : 'http://localhost:1234/v1';

  return new OpenAI({
    baseURL,
    apiKey: 'local-no-key-required', 
  });
}
