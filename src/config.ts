// ABOUTME: Configuration utilities for Obsidian vault discovery and path resolution
// ABOUTME: Handles cross-platform config paths and environment variable fallbacks

import * as path from 'path';
import * as fs from 'fs/promises';

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
