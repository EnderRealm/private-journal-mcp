// ABOUTME: Unit tests for path resolution utilities
// ABOUTME: Tests cross-platform fallback logic and environment handling

import * as path from 'path';
import { resolveJournalPath, resolveUserJournalPath, resolveProjectJournalPath } from '../src/paths';

describe('Path resolution utilities', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('resolveJournalPath uses current directory when reasonable', () => {
    // Mock a reasonable current working directory
    const mockCwd = path.join(path.sep, 'Users', 'test', 'projects', 'my-app');
    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    const result = resolveJournalPath('.private-journal', true);
    expect(result).toBe(path.join(mockCwd, '.private-journal'));
  });

  test('resolveJournalPath skips system directories', () => {
    const systemPaths = ['/', 'C:\\', '/System', '/usr'];
    const homeDir = path.join(path.sep, 'Users', 'test');

    systemPaths.forEach(systemPath => {
      jest.spyOn(process, 'cwd').mockReturnValue(systemPath);
      process.env.HOME = homeDir;

      const result = resolveJournalPath('.private-journal', true);
      expect(result).toBe(path.join(homeDir, '.private-journal'));
    });
  });

  test('resolveJournalPath falls back to HOME when current directory excluded', () => {
    const homeDir = path.join(path.sep, 'Users', 'test');
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;

    const result = resolveJournalPath('.private-journal', false);
    expect(result).toBe(path.join(homeDir, '.private-journal'));
  });

  test('resolveJournalPath uses USERPROFILE on Windows', () => {
    delete process.env.HOME;
    process.env.USERPROFILE = 'C:\\Users\\test';
    
    const result = resolveJournalPath('.private-journal', false);
    expect(result).toBe(path.join('C:\\Users\\test', '.private-journal'));
  });

  test('resolveJournalPath falls back to temp directory', () => {
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    delete process.env.TEMP;
    delete process.env.TMP;

    const result = resolveJournalPath('.private-journal', false);
    const tmpDir = path.join(path.sep, 'tmp');
    expect(result).toBe(path.join(tmpDir, '.private-journal'));
  });

  test('resolveUserJournalPath excludes current directory', () => {
    const mockCwd = path.join(path.sep, 'Users', 'test', 'projects', 'my-app');
    const homeDir = path.join(path.sep, 'Users', 'test');
    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    process.env.HOME = homeDir;

    const result = resolveUserJournalPath();
    expect(result).toBe(path.join(homeDir, '.private-journal'));
    expect(result).not.toContain(path.join('projects', 'my-app'));
  });

  test('resolveProjectJournalPath includes current directory', () => {
    const mockCwd = path.join(path.sep, 'Users', 'test', 'projects', 'my-app');
    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    const result = resolveProjectJournalPath();
    expect(result).toBe(path.join(mockCwd, '.private-journal'));
  });

  test('both user and project paths are consistent when no project context', () => {
    // Simulate no reasonable project directory - use '/' which is excluded on all platforms
    const homeDir = path.join(path.sep, 'Users', 'test');
    jest.spyOn(process, 'cwd').mockReturnValue('/');
    process.env.HOME = homeDir;

    const userPath = resolveUserJournalPath();
    const projectPath = resolveProjectJournalPath();

    expect(userPath).toBe(path.join(homeDir, '.private-journal'));
    expect(projectPath).toBe(path.join(homeDir, '.private-journal'));
  });
});