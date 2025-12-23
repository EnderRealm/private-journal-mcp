// tests/config.test.ts
import * as path from 'path';
import { getObsidianConfigPath } from '../src/config';

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
  });
});
