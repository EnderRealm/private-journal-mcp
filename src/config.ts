// ABOUTME: Configuration utilities for Obsidian vault discovery and path resolution
// ABOUTME: Handles cross-platform config paths and environment variable fallbacks

import * as path from 'path';

export function getObsidianConfigPath(): string {
  // Windows: use APPDATA
  if (process.env.APPDATA) {
    return path.win32.join(process.env.APPDATA, 'obsidian', 'obsidian.json');
  }

  const home = process.env.HOME || '';

  // macOS
  if (process.platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }

  // Linux and others
  return path.posix.join(home, '.config', 'obsidian', 'obsidian.json');
}
