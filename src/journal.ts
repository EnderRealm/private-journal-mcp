// ABOUTME: Core journal writing functionality for MCP server
// ABOUTME: Handles file system operations, timestamps, and markdown formatting

import * as fs from 'fs/promises';
import * as path from 'path';
import { JournalEntry } from './types.js';
import { getUserJournalPath } from './config.js';
import { EmbeddingService, EmbeddingData } from './embeddings.js';

export interface JournalMetadata {
  project?: string;
  agent?: string;
}

export class JournalManager {
  private projectJournalPath: string;
  private explicitUserPath: string | undefined;
  private userJournalPath: string | null = null;
  private userJournalPathPromise: Promise<string> | null = null;
  private embeddingService: EmbeddingService;

  constructor(projectJournalPath: string, userJournalPath?: string) {
    this.projectJournalPath = projectJournalPath;
    this.explicitUserPath = userJournalPath;
    this.embeddingService = EmbeddingService.getInstance();
  }

  private async resolveUserJournalPath(): Promise<string> {
    if (this.userJournalPath) {
      return this.userJournalPath;
    }

    if (!this.userJournalPathPromise) {
      // Check if explicit path was provided in constructor
      if (this.explicitUserPath) {
        this.userJournalPath = this.explicitUserPath;
        return this.userJournalPath;
      }
      this.userJournalPathPromise = getUserJournalPath();
    }

    this.userJournalPath = await this.userJournalPathPromise;
    return this.userJournalPath;
  }

  async writeEntry(content: string): Promise<void> {
    const timestamp = new Date();
    const dateString = this.formatDate(timestamp);
    const timeString = this.formatTimestamp(timestamp);
    
    const dayDirectory = path.join(this.projectJournalPath, dateString);
    const fileName = `${timeString}.md`;
    const filePath = path.join(dayDirectory, fileName);

    await this.ensureDirectoryExists(dayDirectory);
    
    const formattedEntry = this.formatEntry(content, timestamp);
    await fs.writeFile(filePath, formattedEntry, 'utf8');

    // Generate and save embedding
    await this.generateEmbeddingForEntry(filePath, formattedEntry, timestamp);
  }

  async writeThoughts(thoughts: {
    feelings?: string;
    project_notes?: string;
    user_context?: string;
    technical_insights?: string;
    world_knowledge?: string;
  }, metadata?: JournalMetadata): Promise<void> {
    const timestamp = new Date();

    // Split thoughts into project-local and user-global
    const projectThoughts = { project_notes: thoughts.project_notes };
    const userThoughts = {
      feelings: thoughts.feelings,
      user_context: thoughts.user_context,
      technical_insights: thoughts.technical_insights,
      world_knowledge: thoughts.world_knowledge
    };

    // Write project notes to project directory
    if (projectThoughts.project_notes) {
      await this.writeThoughtsToLocation(projectThoughts, timestamp, this.projectJournalPath, metadata);
    }

    // Write user thoughts to user directory
    const hasUserContent = Object.values(userThoughts).some(value => value !== undefined);
    if (hasUserContent) {
      const userPath = await this.resolveUserJournalPath();
      await this.writeThoughtsToLocation(userThoughts, timestamp, userPath, metadata);
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTimestamp(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const microseconds = String(date.getMilliseconds() * 1000 + Math.floor(Math.random() * 1000)).padStart(6, '0');
    return `${hours}-${minutes}-${seconds}-${microseconds}`;
  }

  private formatEntry(content: string, timestamp: Date): string {
    const timeDisplay = timestamp.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: 'numeric', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    const dateDisplay = timestamp.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `---
title: "${timeDisplay} - ${dateDisplay}"
date: ${timestamp.toISOString()}
timestamp: ${timestamp.getTime()}
---

${content}
`;
  }

  private async writeThoughtsToLocation(
    thoughts: {
      feelings?: string;
      project_notes?: string;
      user_context?: string;
      technical_insights?: string;
      world_knowledge?: string;
    },
    timestamp: Date,
    basePath: string,
    metadata?: JournalMetadata
  ): Promise<void> {
    const dateString = this.formatDate(timestamp);
    const timeString = this.formatTimestamp(timestamp);

    const dayDirectory = path.join(basePath, dateString);
    const fileName = `${timeString}.md`;
    const filePath = path.join(dayDirectory, fileName);

    await this.ensureDirectoryExists(dayDirectory);

    const formattedEntry = this.formatThoughts(thoughts, timestamp, metadata);
    await fs.writeFile(filePath, formattedEntry, 'utf8');

    // Generate and save embedding
    await this.generateEmbeddingForEntry(filePath, formattedEntry, timestamp);
  }

  private formatThoughts(thoughts: {
    feelings?: string;
    project_notes?: string;
    user_context?: string;
    technical_insights?: string;
    world_knowledge?: string;
  }, timestamp: Date, metadata?: JournalMetadata): string {
    const timeDisplay = timestamp.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
    const dateDisplay = timestamp.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const sections = [];

    if (thoughts.feelings) {
      sections.push(`## Feelings\n\n${thoughts.feelings}`);
    }

    if (thoughts.project_notes) {
      sections.push(`## Project Notes\n\n${thoughts.project_notes}`);
    }

    if (thoughts.user_context) {
      sections.push(`## User Context\n\n${thoughts.user_context}`);
    }

    if (thoughts.technical_insights) {
      sections.push(`## Technical Insights\n\n${thoughts.technical_insights}`);
    }

    if (thoughts.world_knowledge) {
      sections.push(`## World Knowledge\n\n${thoughts.world_knowledge}`);
    }

    // Build tags array - always include agentic-journal plus section names
    const tags = ['agentic-journal'];
    if (thoughts.feelings) tags.push('feelings');
    if (thoughts.project_notes) tags.push('project-notes');
    if (thoughts.user_context) tags.push('user-context');
    if (thoughts.technical_insights) tags.push('technical-insights');
    if (thoughts.world_knowledge) tags.push('world-knowledge');

    // Build frontmatter
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

    frontmatter += '\ntags:\n';
    tags.forEach(tag => {
      frontmatter += `  - ${tag}\n`;
    });

    frontmatter += '---\n';

    return `${frontmatter}
${sections.join('\n\n')}
`;
  }

  private async generateEmbeddingForEntry(
    filePath: string,
    content: string,
    timestamp: Date
  ): Promise<void> {
    try {
      const { text, sections } = this.embeddingService.extractSearchableText(content);

      if (text.trim().length === 0) {
        return; // Skip empty entries
      }

      const embedding = await this.embeddingService.generateEmbedding(text);

      const embeddingData: EmbeddingData = {
        embedding,
        text,
        sections,
        timestamp: timestamp.getTime(),
        path: filePath
      };

      // Determine if this is a user journal by checking if path starts with userJournalPath
      const userPath = await this.resolveUserJournalPath();
      const isUserJournal = filePath.startsWith(userPath);

      await this.embeddingService.saveEmbedding(filePath, embeddingData, isUserJournal);
    } catch (error) {
      console.error(`Failed to generate embedding for ${filePath}:`, error);
      // Don't throw - embedding failure shouldn't prevent journal writing
    }
  }

  async generateMissingEmbeddings(): Promise<number> {
    let count = 0;
    const userPath = await this.resolveUserJournalPath();
    const paths = [this.projectJournalPath, userPath];

    for (const basePath of paths) {
      try {
        const dayDirs = await fs.readdir(basePath);

        for (const dayDir of dayDirs) {
          const dayPath = path.join(basePath, dayDir);
          const stat = await fs.stat(dayPath);

          if (!stat.isDirectory() || !dayDir.match(/^\d{4}-\d{2}-\d{2}$/)) {
            continue;
          }

          const files = await fs.readdir(dayPath);
          const mdFiles = files.filter(file => file.endsWith('.md'));

          for (const mdFile of mdFiles) {
            const mdPath = path.join(dayPath, mdFile);
            const embeddingPath = mdPath.replace(/\.md$/, '.embedding');

            try {
              await fs.access(embeddingPath);
              // Embedding already exists, skip
            } catch {
              // Generate missing embedding
              console.error(`Generating missing embedding for ${mdPath}`);
              const content = await fs.readFile(mdPath, 'utf8');
              const timestamp = this.extractTimestampFromPath(mdPath) || new Date();
              await this.generateEmbeddingForEntry(mdPath, content, timestamp);
              count++;
            }
          }
        }
      } catch (error) {
        if ((error as any)?.code !== 'ENOENT') {
          console.error(`Failed to scan ${basePath} for missing embeddings:`, error);
        }
      }
    }

    return count;
  }

  private extractTimestampFromPath(filePath: string): Date | null {
    const filename = path.basename(filePath, '.md');
    const match = filename.match(/^(\d{2})-(\d{2})-(\d{2})-\d{6}$/);
    
    if (!match) return null;
    
    const [, hours, minutes, seconds] = match;
    const dirName = path.basename(path.dirname(filePath));
    const dateMatch = dirName.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    
    if (!dateMatch) return null;
    
    const [, year, month, day] = dateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                   parseInt(hours), parseInt(minutes), parseInt(seconds));
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        throw new Error(`Failed to create journal directory at ${dirPath}: ${mkdirError instanceof Error ? mkdirError.message : mkdirError}`);
      }
    }
  }
}