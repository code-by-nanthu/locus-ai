import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ── Config schema ──────────────────────────────────────────────────────────────

export interface LocusConfig {
  defaultProvider: 'ollama' | 'lmstudio';
  defaultModel: string;
  /** Tools that are auto-approved without Y/N prompt (Phase 2) */
  autoApprove: string[];
  /** Custom base URLs per provider (overrides hardcoded localhost defaults) */
  baseURLs?: {
    ollama?: string;
    lmstudio?: string;
  };
}

// ── File paths ─────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.config', 'locus');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Reads ~/.config/locus/config.json.
 * Returns null if the file doesn't exist yet (first launch).
 */
export async function loadConfig(): Promise<LocusConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as LocusConfig;
  } catch {
    return null;
  }
}

/**
 * Writes the config object to ~/.config/locus/config.json,
 * creating the directory if it doesn't exist.
 */
export async function saveConfig(config: LocusConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** Returns the config directory path (used by session.ts) */
export function getConfigDir(): string {
  return CONFIG_DIR;
}
