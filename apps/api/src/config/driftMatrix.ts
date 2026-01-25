/**
 * Drift Matrix Configuration
 * 
 * Decision table for drift detection, patch style selection, and confidence ranges.
 * Maps drift types + sources to appropriate patch styles and confidence thresholds.
 * 
 * @see VERTAAI_MVP_SPEC.md Section 5.5.1
 */

import type { DriftType, PatchStyle } from '@vertaai/shared';

// ============================================================================
// Types
// ============================================================================

export type SignalSource = 
  | 'github' 
  | 'slack' 
  | 'incident' 
  | 'pagerduty' 
  | 'codeowners';

export interface DriftMatrixEntry {
  driftType: DriftType;
  source: SignalSource;
  signalPattern: string;
  baselineCheck: string;
  patchStyles: PatchStyle[];  // First is primary, last is fallback
  confidenceRange: { min: number; max: number };
}

// ============================================================================
// Drift Matrix Decision Table
// ============================================================================

export const DRIFT_MATRIX: DriftMatrixEntry[] = [
  // Instruction drift from GitHub - highest confidence
  {
    driftType: 'instruction',
    source: 'github',
    signalPattern: 'tool/config change in PR diff',
    baselineCheck: 'doc references old token',
    patchStyles: ['replace_steps', 'add_note'],
    confidenceRange: { min: 0.75, max: 0.95 },
  },
  
  // Instruction drift from Slack - lower confidence
  {
    driftType: 'instruction',
    source: 'slack',
    signalPattern: 'repeated workaround snippet',
    baselineCheck: 'doc missing snippet/tool',
    patchStyles: ['add_note', 'replace_steps'],  // Note first = safer default
    confidenceRange: { min: 0.55, max: 0.75 },
  },
  
  // Process drift from incident - medium-high confidence
  {
    driftType: 'process',
    source: 'incident',
    signalPattern: 'timeline order differs from doc',
    baselineCheck: 'doc step order differs',
    patchStyles: ['reorder_steps', 'add_note'],
    confidenceRange: { min: 0.60, max: 0.85 },
  },
  
  // Ownership drift from PagerDuty - highest confidence (authoritative)
  {
    driftType: 'ownership',
    source: 'pagerduty',
    signalPattern: 'on-call owner differs',
    baselineCheck: 'doc owner mismatch',
    patchStyles: ['update_owner_block'],
    confidenceRange: { min: 0.80, max: 0.95 },
  },
  
  // Ownership drift from CODEOWNERS - high confidence (authoritative)
  {
    driftType: 'ownership',
    source: 'codeowners',
    signalPattern: 'code ownership differs',
    baselineCheck: 'doc mismatch',
    patchStyles: ['update_owner_block'],
    confidenceRange: { min: 0.70, max: 0.90 },
  },
  
  // Coverage drift from Slack - medium confidence
  {
    driftType: 'coverage',
    source: 'slack',
    signalPattern: 'repeated question cluster',
    baselineCheck: 'doc lacks scenario',
    patchStyles: ['add_section', 'add_note'],
    confidenceRange: { min: 0.60, max: 0.80 },
  },
  
  // Coverage drift from incident - medium confidence
  {
    driftType: 'coverage',
    source: 'incident',
    signalPattern: 'repeat incident tag',
    baselineCheck: 'doc lacks scenario',
    patchStyles: ['add_section', 'add_note'],
    confidenceRange: { min: 0.55, max: 0.80 },
  },
  
  // Environment drift from GitHub - highest confidence
  {
    driftType: 'environment',
    source: 'github',
    signalPattern: 'CI/infra tool replaced',
    baselineCheck: 'doc references old tool',
    patchStyles: ['replace_steps', 'add_note'],
    confidenceRange: { min: 0.75, max: 0.95 },
  },
];

// ============================================================================
// Patch Style Selection
// ============================================================================

/**
 * Select appropriate patch style based on drift type, source, and confidence.
 * Higher confidence allows more aggressive patch styles.
 * 
 * @param driftType - The type of drift detected
 * @param source - The signal source
 * @param confidence - The confidence score (0-1)
 * @returns The recommended patch style
 */
export function selectPatchStyle(
  driftType: DriftType,
  source: SignalSource,
  confidence: number
): PatchStyle {
  const entry = DRIFT_MATRIX.find(
    e => e.driftType === driftType && e.source === source
  );
  
  if (!entry) {
    // Safe fallback for unknown combinations
    return 'add_note';
  }
  
  // Higher confidence = allow more aggressive patch style (first in array)
  const threshold = entry.confidenceRange.max * 0.9;
  if (confidence >= threshold) {
    return entry.patchStyles[0] ?? 'add_note';  // Primary style with fallback
  }

  // Lower confidence = use safer fallback (last in array)
  return entry.patchStyles[entry.patchStyles.length - 1] ?? 'add_note';
}

/**
 * Get the confidence range for a drift type + source combination.
 */
export function getConfidenceRange(
  driftType: DriftType,
  source: SignalSource
): { min: number; max: number } | null {
  const entry = DRIFT_MATRIX.find(
    e => e.driftType === driftType && e.source === source
  );
  return entry?.confidenceRange || null;
}

/**
 * Check if a confidence value is within expected range for the drift type.
 */
export function isConfidenceInRange(
  driftType: DriftType,
  source: SignalSource,
  confidence: number
): boolean {
  const range = getConfidenceRange(driftType, source);
  if (!range) return true;  // Unknown combinations pass
  return confidence >= range.min && confidence <= range.max;
}

