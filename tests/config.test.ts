// tests/config.test.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { getObsidianConfigPath, parseObsidianConfig, getObsidianVaults } from '../src/config';

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
});
