/**
 * Confluence Adapter
 *
 * Fetches and writes back documentation from Confluence.
 * Converts between Confluence storage format (XHTML) and Markdown for the patch pipeline.
 *
 * Implements the unified DocAdapter interface.
 * @see apps/api/src/services/docs/adapters/types.ts
 */

import type {
  DocAdapter,
  DocRef,
  DocFetchResult,
  WritePatchParams,
  WriteResult,
} from './types.js';
import { getPage, updatePage, storageToMarkdown, markdownToStorage } from '../../confluence-client.js';

export interface ConfluenceAdapter extends DocAdapter {
  system: 'confluence';
  category: 'functional';
}

/**
 * Create a Confluence adapter for a specific workspace
 * 
 * @param workspaceId - The workspace ID (used to fetch credentials from Integration table)
 */
export function createConfluenceAdapter(workspaceId: string): ConfluenceAdapter {
  return {
    system: 'confluence',
    category: 'functional',

    async fetch(doc: DocRef): Promise<DocFetchResult> {
      console.log(`[ConfluenceAdapter] Fetching page ${doc.docId} for workspace ${workspaceId}`);
      
      const page = await getPage(workspaceId, doc.docId);
      
      if (!page) {
        throw new Error(`Failed to fetch Confluence page ${doc.docId}`);
      }

      // Convert storage format (XHTML) to markdown
      const markdown = storageToMarkdown(page.content);

      console.log(`[ConfluenceAdapter] Fetched page "${page.title}", version ${page.version}, content length: ${markdown.length}`);

      return {
        doc,
        baseRevision: String(page.version), // Store version number as string for consistency
        format: 'html', // Confluence storage format is XHTML (closest to 'html')
        content: page.content, // Store original XHTML content
        markdown, // Converted markdown for baseline checks
        title: page.title,
      };
    },

    async writePatch(params: WritePatchParams): Promise<WriteResult> {
      const { doc, baseRevision, newContent } = params;

      console.log(`[ConfluenceAdapter] Writing patch to page ${doc.docId}, baseRevision: ${baseRevision}`);

      // Fetch current page to check for conflicts
      const currentPage = await getPage(workspaceId, doc.docId);

      if (!currentPage) {
        return {
          success: false,
          error: `Page ${doc.docId} not found`,
        };
      }

      // Optimistic locking - check if page was modified since we fetched it
      const currentVersion = String(currentPage.version);
      if (currentVersion !== baseRevision) {
        return {
          success: false,
          error: `Revision conflict: page was modified since fetch. ` +
            `Expected version ${baseRevision}, got ${currentVersion}`,
        };
      }

      try {
        // Convert markdown back to Confluence storage format (XHTML)
        const storageContent = markdownToStorage(newContent);

        // Update the page
        const result = await updatePage(
          workspaceId,
          doc.docId,
          currentPage.title, // Keep existing title
          storageContent,
          currentPage.version
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to update page',
          };
        }

        // New version is currentVersion + 1
        const newVersion = String(currentPage.version + 1);

        console.log(`[ConfluenceAdapter] Successfully updated page ${doc.docId}, new version: ${newVersion}`);

        return {
          success: true,
          newRevision: newVersion,
          docUrl: this.getDocUrl(doc),
        };
      } catch (error: any) {
        console.error(`[ConfluenceAdapter] Error writing patch:`, error);
        return {
          success: false,
          error: error.message || 'Failed to write patch',
        };
      }
    },

    supportsDirectWriteback(): boolean {
      // Confluence supports direct writeback via API
      return true;
    },

    getDocUrl(doc: DocRef): string {
      // Confluence URLs are typically stored in the docUrl field from doc mapping
      // If not available, construct a placeholder
      if (doc.docUrl) {
        return doc.docUrl;
      }
      
      // Fallback: construct URL (requires cloudId which we don't have here)
      // In practice, docUrl should always be set from doc mapping
      return `https://confluence.atlassian.com/pages/${doc.docId}`;
    },
  };
}

