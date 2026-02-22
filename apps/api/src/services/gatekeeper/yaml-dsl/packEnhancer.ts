/**
 * Pack Enhancer
 * Phase 2.4 - Hybrid Approach Auto-Enhancement
 * 
 * Automatically enriches YAML packs with fact-based conditions
 * alongside existing comparator-based obligations.
 * 
 * This provides:
 * 1. Backward compatibility - existing comparators still work
 * 2. Enhanced visibility - users see equivalent fact-based conditions
 * 3. Migration path - users can gradually switch to conditions
 * 4. Zero configuration - happens automatically on pack load
 */

import type { PackYAML } from './packValidator.js';
import { translateComparatorToConditions, isTranslatable } from './translation/comparatorToFact.js';
import { ComparatorId } from './types.js';

/**
 * Enhance a pack by auto-generating fact-based conditions for translatable comparators
 * 
 * This modifies the pack in-place by adding _autoCondition to obligations
 * that have translatable comparators.
 * 
 * @param pack - The pack to enhance
 * @returns The enhanced pack (same reference, modified in-place)
 */
export function enhancePackWithConditions(pack: PackYAML): PackYAML {
  let enhancementCount = 0;

  for (const rule of pack.rules) {
    // GAP-4: obligations are now optional (approval-gate rules have none)
    for (const obligation of (rule.obligations ?? [])) {
      const comparatorId = obligation.comparator || obligation.comparatorId;

      // Skip if no comparator or already has explicit condition
      if (!comparatorId || obligation.condition || obligation.conditions) {
        continue;
      }

      // Check if this comparator can be translated
      if (isTranslatable(comparatorId as ComparatorId)) {
        const translation = translateComparatorToConditions(
          comparatorId as ComparatorId,
          obligation.params || {}
        );

        if (translation.success && translation.conditions && translation.conditions.length > 0) {
          // Add auto-generated condition (single condition or AND composite)
          if (translation.conditions.length === 1) {
            (obligation as any)._autoCondition = translation.conditions[0];
          } else {
            (obligation as any)._autoCondition = {
              operator: 'AND',
              conditions: translation.conditions,
            };
          }
          enhancementCount++;
        }
      }
    }
  }

  if (enhancementCount > 0) {
    console.log(`[PackEnhancer] Enhanced pack "${pack.metadata.name}" with ${enhancementCount} auto-generated conditions`);
  }

  return pack;
}

/**
 * Check if a pack has been enhanced with auto-conditions
 */
export function isPackEnhanced(pack: PackYAML): boolean {
  for (const rule of pack.rules) {
    for (const obligation of (rule.obligations ?? [])) {
      if ((obligation as any)._autoCondition) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get enhancement statistics for a pack
 */
export interface EnhancementStats {
  totalObligations: number;
  comparatorBased: number;
  conditionBased: number;
  autoEnhanced: number;
  translatableButNotEnhanced: number;
}

export function getEnhancementStats(pack: PackYAML): EnhancementStats {
  const stats: EnhancementStats = {
    totalObligations: 0,
    comparatorBased: 0,
    conditionBased: 0,
    autoEnhanced: 0,
    translatableButNotEnhanced: 0,
  };

  for (const rule of pack.rules) {
    for (const obligation of (rule.obligations ?? [])) {
      stats.totalObligations++;

      const comparatorId = obligation.comparator || obligation.comparatorId;
      const hasExplicitCondition = !!(obligation.condition || obligation.conditions);
      const hasAutoCondition = !!(obligation as any)._autoCondition;

      if (comparatorId && !hasExplicitCondition) {
        stats.comparatorBased++;
        
        if (hasAutoCondition) {
          stats.autoEnhanced++;
        } else if (isTranslatable(comparatorId as ComparatorId)) {
          stats.translatableButNotEnhanced++;
        }
      } else if (hasExplicitCondition) {
        stats.conditionBased++;
      }
    }
  }

  return stats;
}

/**
 * Remove auto-generated conditions from a pack
 * (useful for serialization or if user wants to disable enhancement)
 */
export function stripAutoConditions(pack: PackYAML): PackYAML {
  for (const rule of pack.rules) {
    for (const obligation of (rule.obligations ?? [])) {
      delete (obligation as any)._autoCondition;
    }
  }
  return pack;
}

/**
 * Convert auto-generated conditions to explicit conditions
 * (useful for migration - makes the enhancement permanent)
 */
export function promoteAutoConditions(pack: PackYAML): PackYAML {
  for (const rule of pack.rules) {
    for (const obligation of (rule.obligations ?? [])) {
      const autoCondition = (obligation as any)._autoCondition;
      if (autoCondition && !obligation.condition && !obligation.conditions) {
        // Promote auto-condition to explicit condition
        (obligation as any).condition = autoCondition;
        delete (obligation as any)._autoCondition;
      }
    }
  }
  return pack;
}

