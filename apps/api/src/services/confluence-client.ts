/**
 * Multi-tenant Confluence Client
 * Handles reading and writing Confluence pages for multiple organizations
 */

import { prisma } from '../lib/db.js';

interface ConfluenceCredentials {
  cloudId: string;
  accessToken: string;
}

// Cache of credentials per organization
const credentialsCache = new Map<string, ConfluenceCredentials>();

/**
 * Get Confluence credentials for an organization
 */
async function getCredentials(orgId: string): Promise<ConfluenceCredentials | null> {
  // Check cache first
  if (credentialsCache.has(orgId)) {
    return credentialsCache.get(orgId)!;
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { confluenceCloudId: true, confluenceAccessToken: true },
  });

  if (!org?.confluenceCloudId || !org?.confluenceAccessToken) {
    console.warn(`[ConfluenceClient] No Confluence credentials for org ${orgId}`);
    return null;
  }

  const credentials = {
    cloudId: org.confluenceCloudId,
    accessToken: org.confluenceAccessToken,
  };

  credentialsCache.set(orgId, credentials);
  return credentials;
}

/**
 * Clear cached credentials for an organization (e.g., after token refresh)
 */
export function clearConfluenceCache(orgId: string): void {
  credentialsCache.delete(orgId);
}

/**
 * Make an authenticated request to Confluence API
 */
async function confluenceRequest(
  orgId: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const creds = await getCredentials(orgId);
  if (!creds) {
    throw new Error('Confluence not connected for this organization');
  }

  const url = `https://api.atlassian.com/ex/confluence/${creds.cloudId}${path}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Confluence API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get a Confluence page by ID
 */
export async function getPage(
  orgId: string,
  pageId: string
): Promise<{ id: string; title: string; content: string; version: number } | null> {
  try {
    const page = await confluenceRequest(
      orgId,
      `/wiki/api/v2/pages/${pageId}?body-format=storage`
    );

    return {
      id: page.id,
      title: page.title,
      content: page.body?.storage?.value || '',
      version: page.version?.number || 1,
    };
  } catch (error) {
    console.error(`[ConfluenceClient] Error fetching page ${pageId}:`, error);
    return null;
  }
}

/**
 * Update a Confluence page
 */
export async function updatePage(
  orgId: string,
  pageId: string,
  title: string,
  content: string,
  currentVersion: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await confluenceRequest(
      orgId,
      `/wiki/api/v2/pages/${pageId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          id: pageId,
          status: 'current',
          title,
          body: {
            representation: 'storage',
            value: content,
          },
          version: {
            number: currentVersion + 1,
            message: 'Updated by VertaAI - Documentation drift fix',
          },
        }),
      }
    );

    return { success: true };
  } catch (error: any) {
    console.error(`[ConfluenceClient] Error updating page ${pageId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Search for pages in Confluence
 */
export async function searchPages(
  orgId: string,
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; title: string; spaceKey: string }>> {
  try {
    const result = await confluenceRequest(
      orgId,
      `/wiki/rest/api/content/search?cql=text~"${encodeURIComponent(query)}"&limit=${limit}`
    );

    return (result.results || []).map((page: any) => ({
      id: page.id,
      title: page.title,
      spaceKey: page.space?.key || '',
    }));
  } catch (error) {
    console.error(`[ConfluenceClient] Error searching pages:`, error);
    return [];
  }
}

/**
 * Convert Confluence storage format to markdown (simplified)
 */
export function storageToMarkdown(storageContent: string): string {
  // Basic conversion - can be enhanced with a proper library
  let markdown = storageContent
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
    // Paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    // Bold and italic
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    // Code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return markdown;
}

/**
 * Convert markdown to Confluence storage format (simplified)
 */
export function markdownToStorage(markdown: string): string {
  let storage = markdown
    // Headers
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Lists (simple)
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    // Paragraphs
    .replace(/^(?!<[hlu]|<li)(.+)$/gim, '<p>$1</p>')
    // Clean up
    .replace(/\n/g, '');

  return storage;
}

