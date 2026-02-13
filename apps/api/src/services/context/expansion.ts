/**
 * Context Expansion Module (Phase 4)
 * 
 * Fetches full content of up to 3 key changed files to provide richer context
 * to LLM agents for more accurate patch generation.
 * 
 * Selection criteria:
 * - Prioritize files with most changes (additions + deletions)
 * - Limit to reasonable file sizes (< 10KB per file)
 * - Skip binary files, images, lock files
 * - Bounded to max 3 files to control LLM token usage
 */

import type { Octokit } from '@octokit/rest';

/**
 * Expanded file context
 */
export interface ExpandedFileContext {
  filename: string;
  content: string;
  additions: number;
  deletions: number;
  totalChanges: number;
  language?: string;
}

/**
 * Context expansion result
 */
export interface ContextExpansionResult {
  success: boolean;
  expandedFiles: ExpandedFileContext[];
  skippedFiles: string[];
  error?: string;
}

/**
 * Configuration for context expansion
 */
export interface ContextExpansionConfig {
  maxFiles: number;           // Default: 3
  maxFileSizeBytes: number;   // Default: 10KB
  skipPatterns: RegExp[];     // Files to skip (binary, lock files, etc.)
}

/**
 * Default configuration
 */
export const DEFAULT_CONTEXT_EXPANSION_CONFIG: ContextExpansionConfig = {
  maxFiles: 3,
  maxFileSizeBytes: 10 * 1024, // 10KB
  skipPatterns: [
    /\.lock$/,                  // package-lock.json, yarn.lock, etc.
    /\.min\.(js|css)$/,         // Minified files
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i, // Binary/image files
    /node_modules\//,           // Dependencies
    /dist\//,                   // Build output
    /build\//,                  // Build output
    /\.map$/,                   // Source maps
  ],
};

/**
 * Select top N files for context expansion based on change volume
 */
export function selectFilesForExpansion(
  changedFiles: Array<{ filename: string; additions: number; deletions: number; status: string }>,
  config: ContextExpansionConfig = DEFAULT_CONTEXT_EXPANSION_CONFIG
): string[] {
  // Filter out files matching skip patterns
  const eligibleFiles = changedFiles.filter(file => {
    return !config.skipPatterns.some(pattern => pattern.test(file.filename));
  });

  // Sort by total changes (additions + deletions) descending
  const sorted = eligibleFiles
    .map(file => ({
      filename: file.filename,
      totalChanges: file.additions + file.deletions,
    }))
    .sort((a, b) => b.totalChanges - a.totalChanges);

  // Take top N files
  return sorted.slice(0, config.maxFiles).map(f => f.filename);
}

/**
 * Fetch expanded context for selected files
 */
export async function fetchExpandedContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  selectedFiles: string[],
  changedFiles: Array<{ filename: string; additions: number; deletions: number; status: string }>,
  config: ContextExpansionConfig = DEFAULT_CONTEXT_EXPANSION_CONFIG
): Promise<ContextExpansionResult> {
  const expandedFiles: ExpandedFileContext[] = [];
  const skippedFiles: string[] = [];

  for (const filename of selectedFiles) {
    try {
      // Fetch file content from GitHub
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filename,
        ref,
      });

      // Check if it's a file (not a directory)
      if (!('content' in data) || data.type !== 'file') {
        console.log(`[ContextExpansion] Skipping ${filename}: not a file`);
        skippedFiles.push(filename);
        continue;
      }

      // Check file size
      if (data.size > config.maxFileSizeBytes) {
        console.log(`[ContextExpansion] Skipping ${filename}: too large (${data.size} bytes)`);
        skippedFiles.push(filename);
        continue;
      }

      // Decode content
      const content = data.encoding === 'base64'
        ? Buffer.from(data.content, 'base64').toString('utf-8')
        : data.content;

      // Find change stats
      const fileStats = changedFiles.find(f => f.filename === filename);
      const additions = fileStats?.additions || 0;
      const deletions = fileStats?.deletions || 0;

      expandedFiles.push({
        filename,
        content,
        additions,
        deletions,
        totalChanges: additions + deletions,
        language: detectLanguage(filename),
      });

      console.log(`[ContextExpansion] Fetched ${filename} (${content.length} chars, ${additions}+/${deletions}- lines)`);
    } catch (error: any) {
      console.error(`[ContextExpansion] Error fetching ${filename}:`, error.message);
      skippedFiles.push(filename);
    }
  }

  return {
    success: true,
    expandedFiles,
    skippedFiles,
  };
}

/**
 * Detect programming language from filename
 */
function detectLanguage(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    java: 'java',
    rs: 'rust',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
  };
  return ext ? languageMap[ext] : undefined;
}

