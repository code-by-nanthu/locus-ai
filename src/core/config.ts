import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ── Config schema ──────────────────────────────────────────────────────────────

export interface LocusConfig {
  schemaVersion?: number;
  defaultProvider: 'ollama' | 'lmstudio' | 'localai' | 'vllm' | 'jan' | 'gpt4all' | 'llamacpp' | 'oobabooga';
  defaultModel: string;
  /** Tools that are auto-approved without Y/N prompt (Phase 2) */
  autoApprove: string[];
  /** Custom base URLs per provider (overrides hardcoded localhost defaults) */
  baseURLs?: Record<string, string>;
}

// ── File paths (P-1: Cross-platform) ──────────────────────────────────────────

export function getConfigDir(): string {
  const legacyDir = path.join(os.homedir(), '.config', 'locus');
  if (process.platform === 'win32') {
    return process.env.APPDATA ? path.join(process.env.APPDATA, 'locus') : legacyDir;
  }
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'locus');
  }
  return legacyDir;
}

function getConfigFile(): string {
  return path.join(getConfigDir(), 'config.json');
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Reads config.json.
 * Returns null if the file doesn't exist yet (first launch).
 */
export async function loadConfig(): Promise<LocusConfig | null> {
  try {
    const raw = await fs.readFile(getConfigFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: parsed.schemaVersion ?? 1,
      ...parsed,
    } as LocusConfig;
  } catch {
    return null;
  }
}

/**
 * Writes the config object to config.json,
 * creating the directory if it doesn't exist.
 */
export async function saveConfig(config: LocusConfig): Promise<void> {
  const dir = getConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const toSave: LocusConfig = {
    schemaVersion: 1,
    ...config,
  };
  await fs.writeFile(getConfigFile(), JSON.stringify(toSave, null, 2), 'utf-8');
}
