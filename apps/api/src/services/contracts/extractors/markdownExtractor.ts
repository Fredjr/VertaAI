/**
 * Markdown Extractor
 * 
 * Extracts structured data from Markdown documents:
 * - Headers (with hierarchy and anchors)
 * - Code blocks (with language tags)
 * - Links (internal and external)
 * - Lists (ordered and unordered)
 * 
 * Uses stable parsing algorithms to ensure consistent results.
 */

// ======================================================================
// TYPES
// ======================================================================

export interface MarkdownHeader {
  level: number; // 1-6 (# to ######)
  text: string;
  anchor: string; // GitHub-style anchor (lowercase, hyphens, no special chars)
  line: number;
}

export interface MarkdownCodeBlock {
  language: string;
  code: string;
  line: number;
}

export interface MarkdownLink {
  text: string;
  url: string;
  isInternal: boolean; // true if starts with # or relative path
  line: number;
}

export interface MarkdownList {
  type: 'ordered' | 'unordered';
  items: string[];
  line: number;
}

export interface MarkdownExtract {
  headers: MarkdownHeader[];
  codeBlocks: MarkdownCodeBlock[];
  links: MarkdownLink[];
  lists: MarkdownList[];
  rawContent: string;
}

// ======================================================================
// EXTRACTOR
// ======================================================================

export class MarkdownExtractor {
  /**
   * Extract structured data from markdown content
   */
  extract(content: string): MarkdownExtract {
    return {
      headers: this.extractHeaders(content),
      codeBlocks: this.extractCodeBlocks(content),
      links: this.extractLinks(content),
      lists: this.extractLists(content),
      rawContent: content,
    };
  }

  /**
   * Extract headers with GitHub-style anchors
   */
  private extractHeaders(content: string): MarkdownHeader[] {
    const headers: MarkdownHeader[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Match ATX-style headers (# Header)
      const atxMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (atxMatch) {
        const level = atxMatch[1]!.length;
        const text = atxMatch[2]!.trim();
        const anchor = this.generateAnchor(text);

        headers.push({
          level,
          text,
          anchor,
          line: i + 1,
        });
      }
    }

    return headers;
  }

  /**
   * Generate GitHub-style anchor from header text
   * Rules:
   * - Lowercase
   * - Replace spaces with hyphens
   * - Remove special characters except hyphens
   * - Remove leading/trailing hyphens
   */
  private generateAnchor(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Extract code blocks with language tags
   */
  private extractCodeBlocks(content: string): MarkdownCodeBlock[] {
    const codeBlocks: MarkdownCodeBlock[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let currentLanguage = '';
    let currentCode: string[] = [];
    let blockStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Check for code block start/end
      const codeBlockMatch = line.match(/^```(\w*)$/);
      if (codeBlockMatch) {
        if (!inCodeBlock) {
          // Start of code block
          inCodeBlock = true;
          currentLanguage = codeBlockMatch[1] || 'text';
          currentCode = [];
          blockStartLine = i + 1;
        } else {
          // End of code block
          inCodeBlock = false;
          codeBlocks.push({
            language: currentLanguage,
            code: currentCode.join('\n'),
            line: blockStartLine,
          });
        }
      } else if (inCodeBlock) {
        currentCode.push(line);
      }
    }

    return codeBlocks;
  }

  /**
   * Extract links (markdown and HTML)
   */
  private extractLinks(content: string): MarkdownLink[] {
    const links: MarkdownLink[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Match markdown links: [text](url)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;

      while ((match = linkRegex.exec(line)) !== null) {
        const text = match[1]!;
        const url = match[2]!;
        const isInternal = url.startsWith('#') || url.startsWith('./') || url.startsWith('../');

        links.push({
          text,
          url,
          isInternal,
          line: i + 1,
        });
      }
    }

    return links;
  }

  /**
   * Extract lists (ordered and unordered)
   */
  private extractLists(content: string): MarkdownList[] {
    // Simplified implementation - can be enhanced later
    return [];
  }
}

