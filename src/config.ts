// ABOUTME: Configuration utilities for Obsidian vault discovery and path resolution
// ABOUTME: Handles cross-platform config paths and environment variable fallbacks

import * as path from 'path';
import * as fs from 'fs/promises';
import { resolveJournalPath } from './paths.js';

export function getObsidianConfigPath(): string {
  // Windows: use APPDATA
  if (process.env.APPDATA) {
    return path.win32.join(process.env.APPDATA, 'obsidian', 'obsidian.json');
  }

  // Fallback to /tmp if HOME is not set (prevents invalid paths like /.config/...)
  const home = process.env.HOME || '/tmp';

  // macOS
  if (process.platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }

  // Linux and others
  return path.posix.join(home, '.config', 'obsidian', 'obsidian.json');
}

export interface ObsidianVaultMap {
  [vaultName: string]: string;
}

export function parseObsidianConfig(configJson: string): ObsidianVaultMap {
  try {
    const config = JSON.parse(configJson);
    if (!config.vaults || typeof config.vaults !== 'object') {
      return {};
    }

    const vaultMap: ObsidianVaultMap = {};

    for (const [, vaultData] of Object.entries(config.vaults)) {
      const vault = vaultData as { path?: string };
      if (vault.path) {
        const vaultName = path.basename(vault.path);
        vaultMap[vaultName] = vault.path;
      }
    }

    return vaultMap;
  } catch {
    return {};
  }
}

export async function getObsidianVaults(configPath?: string): Promise<ObsidianVaultMap> {
  const configFile = configPath || getObsidianConfigPath();

  try {
    const content = await fs.readFile(configFile, 'utf8');
    return parseObsidianConfig(content);
  } catch {
    return {};
  }
}

export function isObsidianMode(): boolean {
  const vaultName = process.env.AGENTIC_JOURNAL_VAULT;
  return Boolean(vaultName && vaultName.trim().length > 0);
}

export async function getUserJournalPath(obsidianConfigPath?: string): Promise<string> {
  // Priority 1: Explicit path override
  if (process.env.AGENTIC_JOURNAL_PATH) {
    return process.env.AGENTIC_JOURNAL_PATH;
  }

  // Priority 2: Obsidian vault
  const vaultName = process.env.AGENTIC_JOURNAL_VAULT;
  if (vaultName && vaultName.trim().length > 0) {
    const vaults = await getObsidianVaults(obsidianConfigPath);
    const vaultPath = vaults[vaultName];

    if (vaultPath) {
      return path.join(vaultPath, 'agentic-journal');
    }

    console.error(`Warning: Obsidian vault "${vaultName}" not found, using default path`);
  }

  // Priority 3: Default behavior
  return resolveJournalPath('.private-journal', false);
}
