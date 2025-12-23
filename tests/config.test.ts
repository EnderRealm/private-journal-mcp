// tests/config.test.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { getObsidianConfigPath, parseObsidianConfig, getObsidianVaults, isObsidianMode, getUserJournalPath, getEmbeddingCachePath, getEmbeddingPathForFile } from '../src/config';

describe('Obsidian config utilities', () => {
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

    test('returns temp directory fallback when HOME is missing on Linux', () => {
      delete process.env.APPDATA;
      delete process.env.HOME;

      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = getObsidianConfigPath();

      // Should fall back to /tmp instead of returning invalid path like /.config/obsidian/obsidian.json
      expect(result).toBe('/tmp/.config/obsidian/obsidian.json');
    });

    test('returns temp directory fallback when HOME is missing on macOS', () => {
      delete process.env.APPDATA;
      delete process.env.HOME;

      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = getObsidianConfigPath();

      // Should fall back to /tmp instead of returning invalid path
      expect(result).toBe('/tmp/Library/Application Support/obsidian/obsidian.json');
    });
  });

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

      expect(result).toBe(path.join('/Users/test', '.private-journal'));
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

      expect(result).toBe(path.join('/Users/test', '.private-journal'));
    });
  });

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
});
