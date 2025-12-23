// tests/integration.test.ts
// ABOUTME: Integration tests for Obsidian mode functionality
// ABOUTME: Tests end-to-end flow of journal writing and searching in Obsidian mode

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { JournalManager } from '../src/journal.js';
import { SearchService } from '../src/search.js';

describe('Obsidian mode integration', () => {
  let tempDir: string;
  let vaultDir: string;
  let cacheDir: string;
  let projectDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-integration-'));
    vaultDir = path.join(tempDir, 'vault', 'testvault');
    cacheDir = path.join(tempDir, 'cache');
    projectDir = path.join(tempDir, 'project');

    await fs.mkdir(vaultDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });

    // Create mock obsidian config
    const obsidianConfigDir = path.join(tempDir, 'obsidian-config');
    await fs.mkdir(obsidianConfigDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianConfigDir, 'obsidian.json'),
      JSON.stringify({ vaults: { 'id1': { path: vaultDir } } })
    );

    // Note: Tests will pass explicit paths to JournalManager
    // since discovering the vault requires AGENTIC_JOURNAL_VAULT env var
    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';
    process.env.LOCALAPPDATA = cacheDir;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('writes journal to vault and embeddings to cache', async () => {
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

    // Verify embedding in cache (not alongside md)
    const embeddingCacheDir = path.join(cacheDir, 'private-journal', 'embeddings');
    const cacheFiles = await fs.readdir(embeddingCacheDir);
    const embeddingFile = cacheFiles.find(f => f.endsWith('.embedding'));
    expect(embeddingFile).toBeDefined();
  }, 60000);

  test('project journal unaffected by Obsidian mode', async () => {
    const journalManager = new JournalManager(
      path.join(projectDir, '.private-journal'),
      path.join(vaultDir, 'agentic-journal')
    );

    await journalManager.writeThoughts({
      project_notes: 'Project-specific note'
    }, { project: 'test-project' });

    // Verify project notes in project directory
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const projectJournalDir = path.join(projectDir, '.private-journal', dateString);

    const files = await fs.readdir(projectJournalDir);
    const mdFile = files.find(f => f.endsWith('.md'));
    const embeddingFile = files.find(f => f.endsWith('.embedding'));

    expect(mdFile).toBeDefined();
    expect(embeddingFile).toBeDefined(); // Project embeddings stay with md

    const content = await fs.readFile(path.join(projectJournalDir, mdFile!), 'utf8');
    expect(content).toContain('Project-specific note');
  }, 60000);
});
