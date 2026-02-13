/**
 * Patch Styles by Output Target
 * 
 * Point 6: Output-specific patch styles for appropriate documentation updates
 * Different doc systems require different patch approaches
 * 
 * @see Point 6 in Multi-Source Enrichment Plan
 */

import type { DocSystem, DriftType } from '../services/docs/adapters/types.js';

// ============================================================================
// Types
// ============================================================================

export type PatchStyle =
  | 'update_section'      // Update existing section (Confluence, Notion, README)
  | 'add_note'            // Add note/callout (Confluence, Notion)
  | 'reorder_steps'       // Reorder process steps (Confluence, Notion)
  | 'update_owner'        // Update owner field (Backstage, README)
  | 'update_description'  // Update description (Swagger, Backstage)
  | 'update_param'        // Update parameter docs (Swagger, Code Comments)
  | 'add_example'         // Add example (Swagger, Code Comments)
  | 'update_path'         // Update API path (Swagger)
  | 'update_jsdoc'        // Update JSDoc comment (Code Comments)
  | 'create_pr';          // Create PR with changes (GitHub-based systems)

export interface PatchStyleConfig {
  allowedStyles: PatchStyle[];  // Allowed patch styles for this output
  defaultStyle: PatchStyle;     // Default style if no preference
  driftTypeStyles: Partial<Record<DriftType, PatchStyle>>;  // Preferred style per drift type
}

// ============================================================================
// Output-Specific Patch Styles
// ============================================================================

/**
 * Patch style configuration per doc system
 */
export const DOC_SYSTEM_PATCH_STYLES: Record<DocSystem, PatchStyleConfig> = {
  confluence: {
    allowedStyles: ['update_section', 'add_note', 'reorder_steps'],
    defaultStyle: 'update_section',
    driftTypeStyles: {
      instruction: 'update_section',
      process: 'reorder_steps',
      ownership: 'update_section',
      environment_tooling: 'update_section',
    },
  },

  notion: {
    allowedStyles: ['update_section', 'add_note', 'reorder_steps'],
    defaultStyle: 'update_section',
    driftTypeStyles: {
      instruction: 'update_section',
      process: 'reorder_steps',
      ownership: 'update_section',
      environment_tooling: 'update_section',
    },
  },

  github_readme: {
    allowedStyles: ['update_section', 'create_pr'],
    defaultStyle: 'create_pr',
    driftTypeStyles: {
      instruction: 'update_section',
      process: 'update_section',
      ownership: 'update_section',
      environment_tooling: 'update_section',
    },
  },

  github_swagger: {
    allowedStyles: ['update_description', 'update_param', 'update_path', 'add_example', 'create_pr'],
    defaultStyle: 'update_description',
    driftTypeStyles: {
      instruction: 'update_description',
      process: 'update_description',
      ownership: 'update_description',
      environment_tooling: 'update_path',
    },
  },

  backstage: {
    allowedStyles: ['update_owner', 'update_description', 'create_pr'],
    defaultStyle: 'update_description',
    driftTypeStyles: {
      instruction: 'update_description',
      process: 'update_description',
      ownership: 'update_owner',
      environment_tooling: 'update_description',
    },
  },

  github_code_comments: {
    allowedStyles: ['update_jsdoc', 'update_param', 'add_example', 'create_pr'],
    defaultStyle: 'update_jsdoc',
    driftTypeStyles: {
      instruction: 'update_param',
      process: 'update_jsdoc',
      ownership: 'update_jsdoc',
      environment_tooling: 'update_param',
    },
  },

  gitbook: {
    allowedStyles: ['update_section', 'add_note', 'reorder_steps', 'create_pr'],
    defaultStyle: 'update_section',
    driftTypeStyles: {
      instruction: 'update_section',
      process: 'reorder_steps',
      ownership: 'update_section',
      environment_tooling: 'update_section',
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get patch style for a doc system and drift type
 */
export function getPatchStyle(
  docSystem: DocSystem,
  driftType: DriftType,
  confidence?: number
): PatchStyle {
  const config = DOC_SYSTEM_PATCH_STYLES[docSystem];
  
  if (!config) {
    return 'add_note';  // Safe fallback
  }
  
  // Get drift-type-specific style
  const preferredStyle = config.driftTypeStyles[driftType];
  
  // For process drift, apply safety check (from existing driftMatrix.ts)
  if (driftType === 'process' && preferredStyle === 'reorder_steps') {
    const MIN_CONFIDENCE_FOR_REORDER = 0.75;
    if (confidence !== undefined && confidence < MIN_CONFIDENCE_FOR_REORDER) {
      return 'add_note';  // Too risky to reorder, just add note
    }
  }
  
  return preferredStyle || config.defaultStyle;
}

/**
 * Check if a patch style is allowed for a doc system
 */
export function isPatchStyleAllowed(docSystem: DocSystem, style: PatchStyle): boolean {
  const config = DOC_SYSTEM_PATCH_STYLES[docSystem];
  return config?.allowedStyles.includes(style) ?? false;
}

/**
 * Get all allowed patch styles for a doc system
 */
export function getAllowedPatchStyles(docSystem: DocSystem): PatchStyle[] {
  const config = DOC_SYSTEM_PATCH_STYLES[docSystem];
  return config?.allowedStyles || ['add_note'];
}

