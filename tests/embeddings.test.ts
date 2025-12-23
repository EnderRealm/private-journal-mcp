// ABOUTME: Unit tests for embedding functionality and search capabilities
// ABOUTME: Tests embedding generation, storage, and semantic search operations

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { EmbeddingService } from '../src/embeddings';
import { SearchService } from '../src/search';
import { JournalManager } from '../src/journal';
import { getEmbeddingPathForFile } from '../src/config';

describe('Embedding and Search functionality', () => {
  let projectTempDir: string;
  let userTempDir: string;
  let journalManager: JournalManager;
  let searchService: SearchService;
  let originalHome: string | undefined;

  beforeEach(async () => {
    projectTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-project-test-'));
    userTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-user-test-'));
    
    // Mock HOME environment
    originalHome = process.env.HOME;
    process.env.HOME = userTempDir;
    
    journalManager = new JournalManager(projectTempDir);
    searchService = new SearchService(projectTempDir, path.join(userTempDir, '.private-journal'));
  });

  afterEach(async () => {
    // Restore original HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    
    await fs.rm(projectTempDir, { recursive: true, force: true });
    await fs.rm(userTempDir, { recursive: true, force: true });
  });

  test('embedding service initializes and generates embeddings', async () => {
    const embeddingService = EmbeddingService.getInstance();
    
    const text = 'This is a test journal entry about TypeScript programming.';
    const embedding = await embeddingService.generateEmbedding(text);
    
    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    expect(typeof embedding[0]).toBe('number');
  }, 30000); // 30 second timeout for model loading

  test('embedding service extracts searchable text from markdown', async () => {
    const embeddingService = EmbeddingService.getInstance();
    
    const markdown = `---
title: "Test Entry"
date: 2025-05-31T12:00:00.000Z
timestamp: 1717056000000
---

## Feelings

I feel great about this feature implementation.

## Technical Insights

TypeScript interfaces are really powerful for maintaining code quality.`;

    const { text, sections } = embeddingService.extractSearchableText(markdown);
    
    expect(text).toContain('I feel great about this feature implementation');
    expect(text).toContain('TypeScript interfaces are really powerful');
    expect(text).not.toContain('title: "Test Entry"');
    expect(sections).toEqual(['Feelings', 'Technical Insights']);
  });

  test('cosine similarity calculation works correctly', async () => {
    const embeddingService = EmbeddingService.getInstance();
    
    const vector1 = [1, 0, 0];
    const vector2 = [1, 0, 0];
    const vector3 = [0, 1, 0];
    
    const similarity1 = embeddingService.cosineSimilarity(vector1, vector2);
    const similarity2 = embeddingService.cosineSimilarity(vector1, vector3);
    
    expect(similarity1).toBeCloseTo(1.0, 5); // Identical vectors
    expect(similarity2).toBeCloseTo(0.0, 5); // Orthogonal vectors
  });

  test('journal manager generates embeddings when writing thoughts', async () => {
    const thoughts = {
      feelings: 'I feel excited about implementing this search feature',
      technical_insights: 'Vector embeddings provide semantic understanding of text'
    };
    
    await journalManager.writeThoughts(thoughts);
    
    // Check that embedding files were created
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Check user directory for feelings and technical_insights
    const userDayDir = path.join(userTempDir, '.private-journal', dateString);
    const userFiles = await fs.readdir(userDayDir);
    
    const userMdFile = userFiles.find(f => f.endsWith('.md'));
    const userEmbeddingFile = userFiles.find(f => f.endsWith('.embedding'));
    
    expect(userMdFile).toBeDefined();
    expect(userEmbeddingFile).toBeDefined();
    
    if (userEmbeddingFile) {
      const embeddingContent = await fs.readFile(path.join(userDayDir, userEmbeddingFile), 'utf8');
      const embeddingData = JSON.parse(embeddingContent);
      
      expect(embeddingData.embedding).toBeDefined();
      expect(Array.isArray(embeddingData.embedding)).toBe(true);
      expect(embeddingData.text).toContain('excited about implementing');
      expect(embeddingData.sections).toContain('Feelings');
      expect(embeddingData.sections).toContain('Technical Insights');
    }
  }, 60000);

  test('search service finds semantically similar entries', async () => {
    // Write some test entries
    await journalManager.writeThoughts({
      feelings: 'I feel frustrated with debugging TypeScript errors'
    });
    
    await journalManager.writeThoughts({
      technical_insights: 'JavaScript async patterns can be tricky to understand'
    });
    
    await journalManager.writeThoughts({
      project_notes: 'The React component architecture is working well'
    });

    // Wait a moment for embeddings to be generated
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Search for similar entries
    const results = await searchService.search('feeling upset about TypeScript problems');
    
    expect(results.length).toBeGreaterThan(0);
    
    // The first result should be about TypeScript frustration
    const topResult = results[0];
    expect(topResult.text).toContain('frustrated');
    expect(topResult.text).toContain('TypeScript');
    expect(topResult.score).toBeGreaterThan(0.1);
  }, 90000);

  test('search service can filter by entry type', async () => {
    // Add project and user entries
    await journalManager.writeThoughts({
      project_notes: 'This project uses React and TypeScript'
    });
    
    await journalManager.writeThoughts({
      feelings: 'I enjoy working with modern JavaScript frameworks'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Search only project entries
    const projectResults = await searchService.search('React TypeScript', { type: 'project' });
    const userResults = await searchService.search('React TypeScript', { type: 'user' });
    
    expect(projectResults.length).toBeGreaterThan(0);
    expect(projectResults[0].type).toBe('project');
    
    if (userResults.length > 0) {
      expect(userResults[0].type).toBe('user');
    }
  }, 90000);
});

describe('Embedding storage in Obsidian mode', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-obsidian-test-'));
    delete process.env.AGENTIC_JOURNAL_VAULT;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('saveEmbedding uses cache path for user journal in Obsidian mode', async () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';
    process.env.LOCALAPPDATA = tempDir;

    const embeddingService = EmbeddingService.getInstance();
    const mdPath = path.join(tempDir, 'agentic-journal', '2025-12-22', '14-30-45-123456.md');

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

  test('saveEmbedding uses path alongside md for project journal', async () => {
    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';

    const embeddingService = EmbeddingService.getInstance();
    const projectDir = path.join(tempDir, 'project', '.private-journal', '2025-12-22');
    await fs.mkdir(projectDir, { recursive: true });
    const mdPath = path.join(projectDir, '14-30-45-123456.md');

    const embeddingData = {
      embedding: [0.1, 0.2, 0.3],
      text: 'test content',
      sections: ['Project Notes'],
      timestamp: Date.now(),
      path: mdPath
    };

    await embeddingService.saveEmbedding(mdPath, embeddingData, false);

    // Verify it was saved alongside md file
    const embeddingPath = path.join(projectDir, '14-30-45-123456.embedding');
    const exists = await fs.access(embeddingPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});

describe('Search with Obsidian mode cache', () => {
  let tempDir: string;
  let userJournalDir: string;
  let cachePath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-obsidian-test-'));

    // Set up Obsidian mode
    process.env.AGENTIC_JOURNAL_VAULT = 'testvault';
    process.env.LOCALAPPDATA = tempDir;

    userJournalDir = path.join(tempDir, 'vault', 'agentic-journal');
    cachePath = path.join(tempDir, 'private-journal', 'embeddings');
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('search finds user journal entries when embeddings are in cache', async () => {
    // Create user journal markdown file
    const dateDir = path.join(userJournalDir, '2025-12-22');
    await fs.mkdir(dateDir, { recursive: true });
    const mdPath = path.join(dateDir, '14-30-45-123456.md');

    const markdown = `---
title: "Test Feelings"
date: 2025-12-22T14:30:45.123Z
timestamp: 1734878445123
---

## Feelings

I'm frustrated with this search bug in Obsidian mode.`;

    await fs.writeFile(mdPath, markdown, 'utf8');

    // Generate a real embedding for the text
    const embeddingService = EmbeddingService.getInstance();
    const embedding = await embeddingService.generateEmbedding("I'm frustrated with this search bug in Obsidian mode.");

    // Create embedding in cache (flat structure)
    await fs.mkdir(cachePath, { recursive: true });
    const embeddingPath = path.join(cachePath, '2025-12-22--14-30-45-123456.embedding');

    const embeddingData = {
      embedding,
      text: "I'm frustrated with this search bug in Obsidian mode.",
      sections: ['Feelings'],
      timestamp: 1734878445123,
      path: mdPath
    };

    await fs.writeFile(embeddingPath, JSON.stringify(embeddingData), 'utf8');

    // Search should find the entry
    const searchService = new SearchService(
      path.join(tempDir, 'project'),
      userJournalDir
    );

    const results = await searchService.search('search bug', { type: 'user' });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain('frustrated');
    expect(results[0].type).toBe('user');
  }, 60000);
});