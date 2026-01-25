/**
 * Notion Adapter - Phase 4
 * 
 * Fetches and writes back documentation from Notion.
 * Converts between Notion blocks and Markdown for the patch pipeline.
 */

import { Client } from '@notionhq/client';

export interface DocRef {
  docId: string;
  docUrl?: string;
}

export interface DocFetchResult {
  doc: DocRef;
  baseRevision: string;
  format: 'markdown';
  markdown: string;
  title: string;
}

export interface WriteResult {
  newRevision: string;
}

export interface NotionAdapter {
  system: 'notion';
  fetch(doc: DocRef): Promise<DocFetchResult>;
  writePatch(params: {
    doc: DocRef;
    baseRevision: string;
    newMarkdown: string;
  }): Promise<WriteResult>;
}

/**
 * Create a Notion adapter with the given access token
 */
export function createNotionAdapter(accessToken: string): NotionAdapter {
  const notion = new Client({ auth: accessToken });

  return {
    system: 'notion',

    async fetch(doc: DocRef): Promise<DocFetchResult> {
      // Fetch page metadata
      const page = await notion.pages.retrieve({ page_id: doc.docId }) as any;

      // Fetch page content blocks
      const blocks = await notion.blocks.children.list({
        block_id: doc.docId,
        page_size: 100,
      });

      // Convert blocks to markdown
      const markdown = blocksToMarkdown(blocks.results as any[]);

      // Extract title from page properties
      const title = extractPageTitle(page);

      return {
        doc,
        baseRevision: page.last_edited_time,
        format: 'markdown',
        markdown,
        title,
      };
    },

    async writePatch({ doc, baseRevision, newMarkdown }): Promise<WriteResult> {
      // Fetch current page to check revision
      const currentPage = await notion.pages.retrieve({ page_id: doc.docId }) as any;

      // Optimistic locking - check if page was modified since we fetched it
      if (currentPage.last_edited_time !== baseRevision) {
        throw new Error(
          `Revision conflict: page was modified since fetch. ` +
          `Expected ${baseRevision}, got ${currentPage.last_edited_time}`
        );
      }

      // Convert markdown back to blocks
      const newBlocks = markdownToBlocks(newMarkdown);

      // Delete existing blocks
      const existingBlocks = await notion.blocks.children.list({
        block_id: doc.docId,
        page_size: 100,
      });

      for (const block of existingBlocks.results) {
        await notion.blocks.delete({ block_id: (block as any).id });
      }

      // Append new blocks
      if (newBlocks.length > 0) {
        await notion.blocks.children.append({
          block_id: doc.docId,
          children: newBlocks as any,
        });
      }

      // Get the updated page revision
      const updatedPage = await notion.pages.retrieve({ page_id: doc.docId }) as any;

      console.log(`[NotionAdapter] Updated page ${doc.docId}, new revision: ${updatedPage.last_edited_time}`);

      return { newRevision: updatedPage.last_edited_time };
    },
  };
}

/**
 * Extract page title from Notion page properties
 */
function extractPageTitle(page: any): string {
  // Notion pages can have different title property names
  const titleProp = page.properties?.title ||
    page.properties?.Name ||
    page.properties?.['Page'] ||
    Object.values(page.properties || {}).find((p: any) => p.type === 'title');

  if (titleProp?.title?.[0]?.plain_text) {
    return titleProp.title[0].plain_text;
  }

  return 'Untitled';
}

/**
 * Convert rich text array to plain text
 */
function richTextToPlain(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map(t => t.plain_text || '').join('');
}

/**
 * Convert Notion blocks to Markdown
 */
function blocksToMarkdown(blocks: any[]): string {
  return blocks.map(block => {
    const type = block.type;
    const content = block[type];

    switch (type) {
      case 'paragraph':
        return richTextToPlain(content?.rich_text);

      case 'heading_1':
        return `# ${richTextToPlain(content?.rich_text)}`;

      case 'heading_2':
        return `## ${richTextToPlain(content?.rich_text)}`;

      case 'heading_3':
        return `### ${richTextToPlain(content?.rich_text)}`;

      case 'bulleted_list_item':
        return `- ${richTextToPlain(content?.rich_text)}`;

      case 'numbered_list_item':
        return `1. ${richTextToPlain(content?.rich_text)}`;

      case 'code':
        const language = content?.language || '';
        return `\`\`\`${language}\n${richTextToPlain(content?.rich_text)}\n\`\`\``;

      case 'quote':
        return `> ${richTextToPlain(content?.rich_text)}`;

      case 'divider':
        return '---';

      case 'to_do':
        const checked = content?.checked ? '[x]' : '[ ]';
        return `- ${checked} ${richTextToPlain(content?.rich_text)}`;

      default:
        return '';
    }
  }).filter(line => line !== '').join('\n\n');
}

/**
 * Convert Markdown to Notion blocks
 */
function markdownToBlocks(markdown: string): any[] {
  const lines = markdown.split('\n');
  const blocks: any[] = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeContent: string[] = [];

  for (const line of lines) {
    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        blocks.push({
          type: 'code',
          code: {
            language: codeLanguage || 'plain text',
            rich_text: [{ type: 'text', text: { content: codeContent.join('\n') } }],
          },
        });
        inCodeBlock = false;
        codeLanguage = '';
        codeContent = [];
      } else {
        // Start code block
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Skip empty lines
    if (!line.trim()) continue;

    // Headings
    if (line.startsWith('# ')) {
      blocks.push({
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] },
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] },
      });
    }
    // Divider
    else if (line === '---' || line === '***') {
      blocks.push({ type: 'divider', divider: {} });
    }
    // Bulleted list
    else if (line.startsWith('- ')) {
      // Check for checkbox
      if (line.startsWith('- [ ] ')) {
        blocks.push({
          type: 'to_do',
          to_do: {
            checked: false,
            rich_text: [{ type: 'text', text: { content: line.slice(6) } }],
          },
        });
      } else if (line.startsWith('- [x] ')) {
        blocks.push({
          type: 'to_do',
          to_do: {
            checked: true,
            rich_text: [{ type: 'text', text: { content: line.slice(6) } }],
          },
        });
      } else {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
        });
      }
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, '');
      blocks.push({
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: [{ type: 'text', text: { content } }] },
      });
    }
    // Quote
    else if (line.startsWith('> ')) {
      blocks.push({
        type: 'quote',
        quote: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    }
    // Regular paragraph
    else {
      blocks.push({
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
      });
    }
  }

  return blocks;
}

export { blocksToMarkdown, markdownToBlocks };

