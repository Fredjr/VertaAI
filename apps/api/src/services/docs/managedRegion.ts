/**
 * Managed Region Service
 * 
 * Handles extraction and application of patches to managed regions in documents.
 * Managed regions are marked sections that VertaAI can safely auto-update.
 * 
 * @see IMPLEMENTATION_PLAN.md Section 3.2
 */

// Managed region markers
export const MANAGED_START = '<!-- DRIFT_AGENT_MANAGED_START -->';
export const MANAGED_END = '<!-- DRIFT_AGENT_MANAGED_END -->';

export interface ManagedRegionResult {
  before: string;      // Content before managed region (including start marker)
  managed: string;     // Content inside managed region
  after: string;       // Content after managed region (including end marker)
  hasManagedRegion: boolean;
  startIndex: number;  // Index where managed content starts
  endIndex: number;    // Index where managed content ends
}

/**
 * Extract the managed region from a markdown document.
 * Returns the content split into before/managed/after sections.
 */
export function extractManagedRegion(markdown: string): ManagedRegionResult {
  const startIdx = markdown.indexOf(MANAGED_START);
  const endIdx = markdown.indexOf(MANAGED_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return {
      before: markdown,
      managed: '',
      after: '',
      hasManagedRegion: false,
      startIndex: -1,
      endIndex: -1,
    };
  }

  const managedStartIdx = startIdx + MANAGED_START.length;

  return {
    before: markdown.slice(0, managedStartIdx),
    managed: markdown.slice(managedStartIdx, endIdx),
    after: markdown.slice(endIdx),
    hasManagedRegion: true,
    startIndex: managedStartIdx,
    endIndex: endIdx,
  };
}

/**
 * Apply a patch to only the managed region of a document.
 * Throws if the document doesn't have a managed region.
 */
export function applyPatchToManagedRegion(
  markdown: string,
  patchedManaged: string
): string {
  const { before, after, hasManagedRegion } = extractManagedRegion(markdown);

  if (!hasManagedRegion) {
    throw new Error('Document does not have a managed region');
  }

  return before + patchedManaged + after;
}

/**
 * Check if a diff only modifies content within the managed region.
 * Returns true if all changes are within the managed region bounds.
 */
export function diffOnlyTouchesManagedRegion(
  originalMarkdown: string,
  patchedMarkdown: string
): boolean {
  const original = extractManagedRegion(originalMarkdown);
  const patched = extractManagedRegion(patchedMarkdown);

  if (!original.hasManagedRegion || !patched.hasManagedRegion) {
    return false;
  }

  // Check that content outside managed region is unchanged
  return original.before === patched.before && original.after === patched.after;
}

/**
 * Install snippet for teams to add to their docs.
 * This creates an empty managed region that VertaAI can populate.
 */
export const INSTALL_SNIPPET = `
<!-- DRIFT_AGENT_MANAGED_START -->
<!--
  This section is managed by VertaAI Drift Agent.
  Changes here may be overwritten automatically.
  Move content outside these markers if you don't want it auto-updated.
-->

<!-- DRIFT_AGENT_MANAGED_END -->
`;

/**
 * Check if a document has a valid managed region.
 */
export function hasManagedRegion(markdown: string): boolean {
  return extractManagedRegion(markdown).hasManagedRegion;
}

/**
 * Get the managed region content only.
 */
export function getManagedContent(markdown: string): string | null {
  const result = extractManagedRegion(markdown);
  return result.hasManagedRegion ? result.managed : null;
}

/**
 * Insert a managed region into a document at a specific heading.
 * If the heading is not found, appends to the end.
 */
export function insertManagedRegionAfterHeading(
  markdown: string,
  headingPattern: string
): string {
  const headingRegex = new RegExp(`^(#{1,6}\\s*${headingPattern}.*?)$`, 'mi');
  const match = markdown.match(headingRegex);

  if (match && match.index !== undefined) {
    const insertPoint = match.index + match[0].length;
    return (
      markdown.slice(0, insertPoint) +
      '\n\n' +
      INSTALL_SNIPPET.trim() +
      '\n\n' +
      markdown.slice(insertPoint)
    );
  }

  // Append to end if heading not found
  return markdown + '\n\n' + INSTALL_SNIPPET.trim();
}

