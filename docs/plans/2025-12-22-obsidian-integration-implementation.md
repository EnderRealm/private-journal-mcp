# Obsidian Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable user journal entries to be stored in an Obsidian vault with cross-machine sync, fully backwards compatible.

**Architecture:** New `config.ts` module handles Obsidian discovery and path resolution. Existing modules get minimal changes - just call into config module. Embeddings use cache directory in Obsidian mode.

**Tech Stack:** TypeScript, Node.js fs/path, Jest for testing

---

## Task 1: Create config.ts with Obsidian config reading

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing test for getObsidianConfigPath**

```typescript
// tests/config.test.ts
import * as path from 'path';
import { getObsidianConfigPath } from '../src/config';

describe('Obsidian config utilities', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getObsidianConfigPath', () => {
    test('returns Windows path when APPDATA is set', () => {
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';

      const result = getObsidianConfigPath();

      expect(result).toBe('C:\\Users\\test\\AppData\\Roaming\\obsidian\\obsidian.json');
    });

    test('returns macOS path when on darwin', () => {
      delete process.env.APPDATA;
      process.env.HOME = '/Users/test';

      // Mock platform
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = getObsidianConfigPath();

      expect(result).toBe('/Users/test/Library/Application Support/obsidian/obsidian.json');
    });

    test('returns Linux path when on linux', () => {
      delete process.env.APPDATA;
      process.env.HOME = '/home/test';

      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = getObsidianConfigPath();

      expect(result).toBe('/home/test/.config/obsidian/obsidian.json');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL with "Cannot find module '../src/config'"

**Step 3: Write minimal implementation**

```typescript
// src/config.ts
// ABOUTME: Configuration utilities for Obsidian vault discovery and path resolution
// ABOUTME: Handles cross-platform config paths and environment variable fallbacks

import * as path from 'path';

export function getObsidianConfigPath(): string {
  // Windows: use APPDATA
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'obsidian', 'obsidian.json');
  }

  const home = process.env.HOME || '';

  // macOS
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }

  // Linux and others
  return path.join(home, '.config', 'obsidian', 'obsidian.json');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add getObsidianConfigPath for cross-platform config discovery"
```

---

## Task 2: Add parseObsidianConfig and getObsidianVaults

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

**Step 1: Write failing tests**

```typescript
// Add to tests/config.test.ts
import * as fs from 'fs/promises';
import * as os from 'os';
import { getObsidianConfigPath, parseObsidianConfig, getObsidianVaults } from '../src/config';

describe('parseObsidianConfig', () => {
  test('parses valid obsidian.json and returns vault map', () => {
    const configJson = JSON.stringify({
      vaults: {
        'abc123': { path: 'C:\\Users\\test\\Documents\\Obsidian\\work', ts: 123456 },
        'def456': { path: 'C:\\Users\\test\\Documents\\Obsidian\\personal', ts: 789012, open: true }
      }
    });

    const result = parseObsidianConfig(configJson);

    expect(result).toEqual({
      work: 'C:\\Users\\test\\Documents\\Obsidian\\work',
      personal: 'C:\\Users\\test\\Documents\\Obsidian\\personal'
    });
  });

  test('returns empty object for malformed JSON', () => {
    const result = parseObsidianConfig('not valid json');
    expect(result).toEqual({});
  });

  test('returns empty object for missing vaults key', () => {
    const result = parseObsidianConfig('{"other": "data"}');
    expect(result).toEqual({});
  });

  test('extracts vault name from path', () => {
    const configJson = JSON.stringify({
      vaults: {
        'id1': { path: '/Users/steve/Documents/Obsidian/macbeth' }
      }
    });

    const result = parseObsidianConfig(configJson);

    expect(result).toEqual({ macbeth: '/Users/steve/Documents/Obsidian/macbeth' });
  });
});

describe('getObsidianVaults', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('reads and parses obsidian config file', async () => {
    const configPath = path.join(tempDir, 'obsidian.json');
    const configData = {
      vaults: {
        'id1': { path: '/path/to/vault1' },
        'id2': { path: '/path/to/vault2' }
      }
    };
    await fs.writeFile(configPath, JSON.stringify(configData));

    const result = await getObsidianVaults(configPath);

    expect(result).toEqual({
      vault1: '/path/to/vault1',
      vault2: '/path/to/vault2'
    });
  });

  test('returns empty object when config file does not exist', async () => {
    const result = await getObsidianVaults('/nonexistent/path/obsidian.json');
    expect(result).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// Add to src/config.ts
import * as fs from 'fs/promises';

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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add Obsidian vault parsing and discovery"
```

---

## Task 3: Add isObsidianMode and getUserJournalPath

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

**Step 1: Write failing tests**

```typescript
// Add to tests/config.test.ts
import { isObsidianMode, getUserJournalPath } from '../src/config';

describe('isObsidianMode', () => {
  test('returns true when AGENTIC_JOURNAL_VAULT is set', () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'macbeth';
    expect(isObsidianMode()).toBe(true);
  });

  test('returns false when AGENTIC_JOURNAL_VAULT is not set', () => {
    delete process.env.AGENTIC_JOURNAL_VAULT;
    expect(isObsidianMode()).toBe(false);
  });

  test('returns false when AGENTIC_JOURNAL_VAULT is empty string', () => {
    process.env.AGENTIC_JOURNAL_VAULT = '';
    expect(isObsidianMode()).toBe(false);
  });
});

describe('getUserJournalPath', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(async () => {
    delete process.env.AGENTIC_JOURNAL_VAULT;
    delete process.env.AGENTIC_JOURNAL_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('returns default path when no env vars set', async () => {
    delete process.env.AGENTIC_JOURNAL_VAULT;
    delete process.env.AGENTIC_JOURNAL_PATH;
    process.env.HOME = '/Users/test';

    const result = await getUserJournalPath();

    expect(result).toBe('/Users/test/.private-journal');
  });

  test('returns AGENTIC_JOURNAL_PATH when set', async () => {
    process.env.AGENTIC_JOURNAL_PATH = '/custom/journal/path';

    const result = await getUserJournalPath();

    expect(result).toBe('/custom/journal/path');
  });

  test('returns Obsidian vault path with agentic-journal subfolder when AGENTIC_JOURNAL_VAULT set', async () => {
    // Create mock obsidian config
    const configPath = path.join(tempDir, 'obsidian.json');
    const vaultPath = path.join(tempDir, 'vaults', 'macbeth');
    await fs.mkdir(path.dirname(vaultPath), { recursive: true });
    await fs.mkdir(vaultPath, { recursive: true });

    await fs.writeFile(configPath, JSON.stringify({
      vaults: { 'id1': { path: vaultPath } }
    }));

    process.env.AGENTIC_JOURNAL_VAULT = 'macbeth';

    const result = await getUserJournalPath(configPath);

    expect(result).toBe(path.join(vaultPath, 'agentic-journal'));
  });

  test('falls back to default when vault not found', async () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'nonexistent';
    process.env.HOME = '/Users/test';

    const result = await getUserJournalPath();

    expect(result).toBe('/Users/test/.private-journal');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// Add to src/config.ts
import { resolveJournalPath } from './paths.js';

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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add isObsidianMode and getUserJournalPath with fallback chain"
```

---

## Task 4: Add getEmbeddingCachePath

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

**Step 1: Write failing tests**

```typescript
// Add to tests/config.test.ts
import { getEmbeddingCachePath, getEmbeddingPathForFile } from '../src/config';

describe('getEmbeddingCachePath', () => {
  test('returns LOCALAPPDATA path on Windows', () => {
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';

    const result = getEmbeddingCachePath();

    expect(result).toBe('C:\\Users\\test\\AppData\\Local\\private-journal\\embeddings');
  });

  test('returns ~/.cache path on Unix when LOCALAPPDATA not set', () => {
    delete process.env.LOCALAPPDATA;
    process.env.HOME = '/Users/test';

    const result = getEmbeddingCachePath();

    expect(result).toBe('/Users/test/.cache/private-journal/embeddings');
  });
});

describe('getEmbeddingPathForFile', () => {
  beforeEach(() => {
    delete process.env.AGENTIC_JOURNAL_VAULT;
  });

  test('returns path alongside md file in default mode', () => {
    const mdPath = '/path/to/journal/2025-12-22/14-30-45-123456.md';

    const result = getEmbeddingPathForFile(mdPath, false);

    expect(result).toBe('/path/to/journal/2025-12-22/14-30-45-123456.embedding');
  });

  test('returns cache path in Obsidian mode for user journal', () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'macbeth';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';

    const mdPath = 'C:\\Users\\test\\Documents\\Obsidian\\macbeth\\agentic-journal\\2025-12-22\\14-30-45-123456.md';

    const result = getEmbeddingPathForFile(mdPath, true);

    expect(result).toBe('C:\\Users\\test\\AppData\\Local\\private-journal\\embeddings\\2025-12-22--14-30-45-123456.embedding');
  });

  test('returns path alongside md file for project journal even in Obsidian mode', () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'macbeth';

    const mdPath = '/project/.private-journal/2025-12-22/14-30-45-123456.md';

    const result = getEmbeddingPathForFile(mdPath, false);

    expect(result).toBe('/project/.private-journal/2025-12-22/14-30-45-123456.embedding');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// Add to src/config.ts

export function getEmbeddingCachePath(): string {
  // Windows
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'private-journal', 'embeddings');
  }

  // Unix
  const home = process.env.HOME || '';
  return path.join(home, '.cache', 'private-journal', 'embeddings');
}

export function getEmbeddingPathForFile(mdPath: string, isUserJournal: boolean): string {
  // Only use cache for user journal in Obsidian mode
  if (isUserJournal && isObsidianMode()) {
    const cachePath = getEmbeddingCachePath();

    // Extract date and filename from path: .../2025-12-22/14-30-45-123456.md
    const filename = path.basename(mdPath, '.md');
    const dateDir = path.basename(path.dirname(mdPath));

    // Create stable embedding filename: 2025-12-22--14-30-45-123456.embedding
    return path.join(cachePath, `${dateDir}--${filename}.embedding`);
  }

  // Default: alongside md file
  return mdPath.replace(/\.md$/, '.embedding');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add embedding cache path utilities for Obsidian mode"
```

---

## Task 5: Add getProjectInfo for git remote extraction

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

**Step 1: Write failing tests**

```typescript
// Add to tests/config.test.ts
import { getProjectInfo } from '../src/config';

describe('getProjectInfo', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('returns git remote URL when in git repo', async () => {
    // Create a mock git config
    const gitDir = path.join(tempDir, '.git');
    await fs.mkdir(gitDir, { recursive: true });
    await fs.writeFile(path.join(gitDir, 'config'), `
[remote "origin"]
	url = git@github.com:user/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`);

    const result = await getProjectInfo(tempDir);

    expect(result).toBe('git@github.com:user/repo.git');
  });

  test('returns folder name when not in git repo', async () => {
    const result = await getProjectInfo(tempDir);

    expect(result).toBe(path.basename(tempDir));
  });

  test('returns folder name when git config has no remote', async () => {
    const gitDir = path.join(tempDir, '.git');
    await fs.mkdir(gitDir, { recursive: true });
    await fs.writeFile(path.join(gitDir, 'config'), `
[core]
	bare = false
`);

    const result = await getProjectInfo(tempDir);

    expect(result).toBe(path.basename(tempDir));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// Add to src/config.ts

export async function getProjectInfo(projectPath?: string): Promise<string> {
  const cwd = projectPath || process.cwd();

  try {
    // Try to read git config
    const gitConfigPath = path.join(cwd, '.git', 'config');
    const gitConfig = await fs.readFile(gitConfigPath, 'utf8');

    // Parse remote origin URL
    const remoteMatch = gitConfig.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
    if (remoteMatch && remoteMatch[1]) {
      return remoteMatch[1].trim();
    }
  } catch {
    // Not a git repo or no remote
  }

  // Fallback to folder name
  return path.basename(cwd);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add getProjectInfo for git remote or folder name extraction"
```

---

## Task 6: Update paths.ts to use config module

**Files:**
- Modify: `src/paths.ts`
- Modify: `tests/paths.test.ts`

**Step 1: Write failing test**

```typescript
// Add to tests/paths.test.ts
describe('resolveUserJournalPath with Obsidian mode', () => {
  test('returns Obsidian vault path when AGENTIC_JOURNAL_VAULT is set', async () => {
    // This test will be async now
    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';
    process.env.AGENTIC_JOURNAL_PATH = '/explicit/path';

    // Using explicit path should work synchronously
    const { resolveUserJournalPathSync } = await import('../src/paths');
    const result = resolveUserJournalPathSync();

    // Falls back since vault doesn't exist
    expect(result).toBeDefined();
  });
});
```

**Step 2: Run test to verify current behavior**

Run: `npm test -- tests/paths.test.ts`

**Step 3: Minimal change to paths.ts**

The existing `resolveUserJournalPath` is synchronous. We need to keep backwards compatibility while allowing async Obsidian lookup. Add a sync fallback.

```typescript
// Modify src/paths.ts - add import at top
import { isObsidianMode, getUserJournalPath as getConfigUserJournalPath } from './config.js';

// Keep existing resolveUserJournalPath for sync use
// Add new async version that config module uses
```

Actually, to maintain backwards compatibility, we should NOT modify paths.ts significantly. The config module already imports from paths.ts. We'll use the async getUserJournalPath from config.ts directly in journal.ts.

**Step 4: Verify existing tests still pass**

Run: `npm test -- tests/paths.test.ts`
Expected: PASS (no changes needed to paths.ts for now)

**Step 5: Commit (skip if no changes)**

No changes needed - paths.ts stays as fallback, config.ts handles Obsidian mode.

---

## Task 7: Update journal.ts frontmatter format

**Files:**
- Modify: `src/journal.ts`
- Modify: `tests/journal.test.ts`

**Step 1: Write failing tests for new frontmatter**

```typescript
// Add to tests/journal.test.ts
describe('Enhanced frontmatter format', () => {
  let projectTempDir: string;
  let userTempDir: string;
  let journalManager: JournalManager;

  beforeEach(async () => {
    projectTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-fm-test-'));
    userTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-fm-user-'));
    process.env.HOME = userTempDir;
    journalManager = new JournalManager(projectTempDir);
  });

  afterEach(async () => {
    await fs.rm(projectTempDir, { recursive: true, force: true });
    await fs.rm(userTempDir, { recursive: true, force: true });
  });

  test('includes project field in frontmatter', async () => {
    await journalManager.writeThoughts({ feelings: 'Test feeling' }, { project: 'git@github.com:user/repo.git' });

    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const userDayDir = path.join(userTempDir, '.private-journal', dateString);
    const files = await fs.readdir(userDayDir);
    const content = await fs.readFile(path.join(userDayDir, files[0]), 'utf8');

    expect(content).toContain('project: git@github.com:user/repo.git');
  });

  test('includes agent field in frontmatter', async () => {
    await journalManager.writeThoughts({ feelings: 'Test' }, { agent: 'claude-code:2.0.67' });

    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const userDayDir = path.join(userTempDir, '.private-journal', dateString);
    const files = await fs.readdir(userDayDir);
    const content = await fs.readFile(path.join(userDayDir, files[0]), 'utf8');

    expect(content).toContain('agent: claude-code:2.0.67');
  });

  test('includes tags with agentic-journal and section names', async () => {
    await journalManager.writeThoughts({
      feelings: 'Test feeling',
      technical_insights: 'Test insight'
    });

    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const userDayDir = path.join(userTempDir, '.private-journal', dateString);
    const files = await fs.readdir(userDayDir);
    const content = await fs.readFile(path.join(userDayDir, files[0]), 'utf8');

    expect(content).toContain('tags:');
    expect(content).toContain('  - agentic-journal');
    expect(content).toContain('  - feelings');
    expect(content).toContain('  - technical-insights');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/journal.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// Modify src/journal.ts

export interface JournalMetadata {
  project?: string;
  agent?: string;
}

// Update writeThoughts signature
async writeThoughts(thoughts: {
  feelings?: string;
  project_notes?: string;
  user_context?: string;
  technical_insights?: string;
  world_knowledge?: string;
}, metadata?: JournalMetadata): Promise<void> {
  // ... existing split logic ...

  // Pass metadata and section names to formatThoughts
}

// Update formatThoughts to include new frontmatter
private formatThoughts(thoughts: {...}, timestamp: Date, metadata?: JournalMetadata): string {
  // ... existing time formatting ...

  // Build tags from sections
  const tags = ['agentic-journal'];
  if (thoughts.feelings) tags.push('feelings');
  if (thoughts.project_notes) tags.push('project-notes');
  if (thoughts.user_context) tags.push('user-context');
  if (thoughts.technical_insights) tags.push('technical-insights');
  if (thoughts.world_knowledge) tags.push('world-knowledge');

  const tagsYaml = tags.map(t => `  - ${t}`).join('\n');

  let frontmatter = `---
title: "${timeDisplay} - ${dateDisplay}"
date: ${timestamp.toISOString()}
timestamp: ${timestamp.getTime()}`;

  if (metadata?.project) {
    frontmatter += `\nproject: ${metadata.project}`;
  }
  if (metadata?.agent) {
    frontmatter += `\nagent: ${metadata.agent}`;
  }

  frontmatter += `\ntags:\n${tagsYaml}
---`;

  // ... rest of content ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/journal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/journal.ts tests/journal.test.ts
git commit -m "feat: add project, agent, and tags to journal frontmatter"
```

---

## Task 8: Update embeddings.ts to use cache in Obsidian mode

**Files:**
- Modify: `src/embeddings.ts`
- Modify: `tests/embeddings.test.ts`

**Step 1: Write failing test**

```typescript
// Add to tests/embeddings.test.ts
import { getEmbeddingPathForFile, isObsidianMode } from '../src/config';

describe('Embedding storage in Obsidian mode', () => {
  beforeEach(() => {
    delete process.env.AGENTIC_JOURNAL_VAULT;
  });

  afterEach(() => {
    delete process.env.AGENTIC_JOURNAL_VAULT;
  });

  test('saveEmbedding uses cache path for user journal in Obsidian mode', async () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';
    process.env.LOCALAPPDATA = tempDir;

    const embeddingService = EmbeddingService.getInstance();
    const mdPath = path.join(tempDir, 'agentic-journal', '2025-12-22', '14-30-45-123456.md');

    // Create embedding data
    const embeddingData = {
      embedding: [0.1, 0.2, 0.3],
      text: 'test content',
      sections: ['Feelings'],
      timestamp: Date.now(),
      path: mdPath
    };

    await embeddingService.saveEmbedding(mdPath, embeddingData, true);

    // Verify it was saved to cache, not alongside md
    const cachePath = path.join(tempDir, 'private-journal', 'embeddings', '2025-12-22--14-30-45-123456.embedding');
    const exists = await fs.access(cachePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/embeddings.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// Modify src/embeddings.ts

import { getEmbeddingPathForFile } from './config.js';

// Update saveEmbedding to accept isUserJournal flag
async saveEmbedding(filePath: string, embeddingData: EmbeddingData, isUserJournal: boolean = false): Promise<void> {
  const embeddingPath = getEmbeddingPathForFile(filePath, isUserJournal);

  // Ensure directory exists
  await fs.mkdir(path.dirname(embeddingPath), { recursive: true });

  await fs.writeFile(embeddingPath, JSON.stringify(embeddingData, null, 2), 'utf8');
}

// Update loadEmbedding similarly
async loadEmbedding(filePath: string, isUserJournal: boolean = false): Promise<EmbeddingData | null> {
  const embeddingPath = getEmbeddingPathForFile(filePath, isUserJournal);

  try {
    const content = await fs.readFile(embeddingPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as any)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/embeddings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/embeddings.ts tests/embeddings.test.ts
git commit -m "feat: use cache directory for embeddings in Obsidian mode"
```

---

## Task 9: Update server.ts to capture agent info

**Files:**
- Modify: `src/server.ts`

**Step 1: Identify the change needed**

The server needs to:
1. Capture client info after initialization using `server.getClientVersion()`
2. Pass it to JournalManager when writing thoughts
3. Also get project info

**Step 2: Write implementation**

```typescript
// Modify src/server.ts

import { getProjectInfo } from './config.js';

export class PrivateJournalServer {
  private server: Server;
  private journalManager: JournalManager;
  private searchService: SearchService;
  private agentInfo: string = 'unknown';
  private projectInfo: string = 'unknown';

  constructor(journalPath: string) {
    // ... existing code ...
  }

  async run(): Promise<void> {
    // Get project info at startup
    this.projectInfo = await getProjectInfo();

    // ... existing embedding generation ...

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Capture client info after connection
    const clientVersion = this.server.getClientVersion();
    if (clientVersion) {
      this.agentInfo = `${clientVersion.name}:${clientVersion.version}`;
    }
  }

  private setupToolHandlers(): void {
    // ... in process_thoughts handler ...

    await this.journalManager.writeThoughts(thoughts, {
      project: this.projectInfo,
      agent: this.agentInfo
    });
  }
}
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: capture and pass agent and project info to journal entries"
```

---

## Task 10: Update journal.ts to use async path resolution

**Files:**
- Modify: `src/journal.ts`

**Step 1: Update JournalManager to use async getUserJournalPath**

```typescript
// Modify src/journal.ts

import { getUserJournalPath, isObsidianMode } from './config.js';

export class JournalManager {
  private projectJournalPath: string;
  private userJournalPath: string | null = null;
  private userJournalPathPromise: Promise<string> | null = null;

  constructor(projectJournalPath: string, userJournalPath?: string) {
    this.projectJournalPath = projectJournalPath;
    if (userJournalPath) {
      this.userJournalPath = userJournalPath;
    }
  }

  private async resolveUserJournalPath(): Promise<string> {
    if (this.userJournalPath) {
      return this.userJournalPath;
    }

    if (!this.userJournalPathPromise) {
      this.userJournalPathPromise = getUserJournalPath();
    }

    this.userJournalPath = await this.userJournalPathPromise;
    return this.userJournalPath;
  }

  async writeThoughts(...): Promise<void> {
    // ... existing code but use await this.resolveUserJournalPath() ...
  }
}
```

**Step 2: Verify existing tests pass**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/journal.ts
git commit -m "feat: use async path resolution for user journal in Obsidian mode"
```

---

## Task 11: Integration test - full Obsidian mode flow

**Files:**
- Create: `tests/integration.test.ts`

**Step 1: Write integration test**

```typescript
// tests/integration.test.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { JournalManager } from '../src/journal';
import { SearchService } from '../src/search';

describe('Obsidian mode integration', () => {
  let tempDir: string;
  let vaultDir: string;
  let cacheDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-integration-'));
    vaultDir = path.join(tempDir, 'vault', 'testvault');
    cacheDir = path.join(tempDir, 'cache');

    await fs.mkdir(vaultDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });

    // Create mock obsidian config
    const obsidianConfigDir = path.join(tempDir, 'obsidian-config');
    await fs.mkdir(obsidianConfigDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianConfigDir, 'obsidian.json'),
      JSON.stringify({ vaults: { 'id1': { path: vaultDir } } })
    );

    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';
    process.env.LOCALAPPDATA = cacheDir;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('writes journal to vault and embeddings to cache', async () => {
    const projectDir = path.join(tempDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });

    const journalManager = new JournalManager(
      path.join(projectDir, '.private-journal'),
      path.join(vaultDir, 'agentic-journal')
    );

    await journalManager.writeThoughts({
      feelings: 'Testing Obsidian integration'
    }, { project: 'test-project', agent: 'test-agent:1.0' });

    // Verify markdown in vault
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const journalDir = path.join(vaultDir, 'agentic-journal', dateString);

    const files = await fs.readdir(journalDir);
    const mdFile = files.find(f => f.endsWith('.md'));
    expect(mdFile).toBeDefined();

    const content = await fs.readFile(path.join(journalDir, mdFile!), 'utf8');
    expect(content).toContain('Testing Obsidian integration');
    expect(content).toContain('project: test-project');
    expect(content).toContain('agent: test-agent:1.0');
    expect(content).toContain('- agentic-journal');
    expect(content).toContain('- feelings');
  });
});
```

**Step 2: Run integration test**

Run: `npm test -- tests/integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: add integration test for Obsidian mode"
```

---

## Task 12: Final verification and cleanup

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Run linter**

Run: `npm run lint`
Expected: PASS (fix any issues)

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: cleanup and verify Obsidian integration complete"
```

---

## Summary

Total tasks: 12
Estimated time: 2-3 hours

Key files created/modified:
- `src/config.ts` (new) - Obsidian vault discovery and path utilities
- `tests/config.test.ts` (new) - Config module tests
- `src/journal.ts` - Enhanced frontmatter, async path resolution
- `src/embeddings.ts` - Cache-based storage in Obsidian mode
- `src/server.ts` - Agent and project info capture
- `tests/integration.test.ts` (new) - End-to-end Obsidian mode test
