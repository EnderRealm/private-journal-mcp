# Obsidian Integration for User Journals

## Overview

Enable user journal entries to be stored in an Obsidian vault for cross-machine sync, while keeping embeddings local. Fully backwards compatible - opt-in via environment variable.

## Storage Locations

### Default Behavior (no env var)

Everything works exactly as before:
- User journal: `~/.private-journal/`
- Embeddings: alongside `.md` files
- No changes for existing users

### Opt-in Obsidian Mode (`AGENTIC_JOURNAL_VAULT=<vault-name>`)

- User journal: `<vault>/agentic-journal/YYYY-MM-DD/HH-MM-SS-μμμμμμ.md`
- User embeddings: `~/.cache/private-journal/embeddings/` (or `%LOCALAPPDATA%` on Windows)

### Project Journal (always unchanged)

- Location: `<project>/.private-journal/`
- Embeddings: alongside `.md` files
- No changes regardless of env var

## Configuration

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `AGENTIC_JOURNAL_VAULT` | Obsidian vault name | `macbeth` |
| `AGENTIC_JOURNAL_PATH` | Explicit path override | `/path/to/journal` |

### Vault Discovery

Read Obsidian config from platform-specific location:
- Windows: `%APPDATA%/obsidian/obsidian.json`
- macOS: `~/Library/Application Support/obsidian/obsidian.json`
- Linux: `~/.config/obsidian/obsidian.json`

Look up vault by name to get filesystem path.

### Fallback Chain

1. `AGENTIC_JOURNAL_VAULT` → Obsidian vault lookup
2. `AGENTIC_JOURNAL_PATH` → explicit path
3. Default: `~/.private-journal/`

## Frontmatter Format

```yaml
---
title: "2:30:45 PM - December 22, 2025"
date: 2025-12-22T14:30:45.000Z
timestamp: 1734890445000
project: git@github.com:user/repo.git
agent: claude-code:2.0.67
tags:
  - agentic-journal
  - feelings
  - technical-insights
---
```

- `project`: Git remote URL, or folder name if not a git repo
- `agent`: From MCP `getClientVersion()` as `name:version`
- `tags`: Always includes `agentic-journal` plus section names present in entry

## Embedding Sync Strategy

1. Markdown files sync via Obsidian to new machines
2. Embeddings stay local (not synced)
3. On startup, `generateMissingEmbeddings()` detects missing embeddings and regenerates
4. Embedding path derived from relative path (date + filename) for cross-machine stability

## File Changes

### New file: `src/config.ts` (~80 lines)

- `getObsidianVaults()` - Read Obsidian config
- `resolveObsidianVaultPath(vaultName)` - Look up vault by name
- `getUserJournalPath()` - Main entry point with fallback chain
- `getEmbeddingCachePath()` - Return OS-appropriate cache directory
- `getProjectInfo()` - Get git remote or folder name
- `isObsidianMode()` - Check if Obsidian integration is enabled

### Modified: `src/paths.ts` (minimal)

- `resolveUserJournalPath()` - Call config module, fallback to original behavior

### Modified: `src/journal.ts` (~15 lines)

- `formatThoughts()` - Add new frontmatter fields (project, agent, tags)
- Accept agent info parameter

### Modified: `src/embeddings.ts` (~10 lines)

- `saveEmbedding()` / `loadEmbedding()` - Use cache path when in Obsidian mode for user entries

### Modified: `src/server.ts` (~5 lines)

- Capture `getClientVersion()` after initialization
- Pass agent info to journal manager

## Testing

### New: `tests/config.test.ts`

- Mock Obsidian config file parsing
- Test vault lookup (found, not found, malformed JSON)
- Test fallback chain
- Test cross-platform cache path resolution
- Test git remote extraction

### Extend: `tests/journal.test.ts`

- Test new frontmatter format
- Test tag generation from section fields
- Verify YAML validity

### Extend: `tests/embeddings.test.ts`

- Test embedding path calculation (cache vs alongside)
- Test missing embedding detection

All tests mock filesystem - no Obsidian installation required.
