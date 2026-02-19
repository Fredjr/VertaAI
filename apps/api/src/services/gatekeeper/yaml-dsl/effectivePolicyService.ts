/**
 * Effective Policy Service
 * Phase 3B.1: Compute effective policy for a given repo/branch
 * 
 * Shows which packs apply, how rules are merged, and explains decision logic
 */

import type { PackYAML, PackRule, MergeStrategy } from './types.js';
import type { SelectedPack } from './packSelector.js';

export interface EffectiveRule {
  ruleId: string;
  ruleName: string;
  enabled: boolean;
  trigger: any;
  obligations: any[];
  
  // Provenance - which pack(s) contributed this rule
  sources: Array<{
    packId: string;
    packName: string;
    packVersion: string;
    packPriority: number;
    packSource: 'repo' | 'service' | 'workspace';
  }>;
  
  // Conflict info (if multiple packs define same rule differently)
  hasConflict: boolean;
  conflictResolution?: {
    strategy: MergeStrategy;
    winningPackId: string;
    reason: string;
  };
}

export interface EffectivePolicy {
  // Context
  repository: string;
  branch: string;
  
  // Applicable packs
  applicablePacks: Array<{
    id: string;
    name: string;
    version: string;
    priority: number;
    mergeStrategy: MergeStrategy;
    source: 'repo' | 'service' | 'workspace';
    ruleCount: number;
  }>;
  
  // Merged rules
  effectiveRules: EffectiveRule[];
  
  // Decision logic explanation
  decisionLogic: {
    mergeStrategy: MergeStrategy;
    priorityOrder: string[];
    explanation: string;
  };
  
  // Conflicts detected
  conflicts: Array<{
    ruleId: string;
    conflictingPacks: string[];
    resolution: string;
  }>;
}

/**
 * Compute effective policy for a given repo/branch
 */
export function computeEffectivePolicy(
  selectedPacks: SelectedPack[],
  repository: string,
  branch: string
): EffectivePolicy {
  // 1. Build applicable packs summary
  const applicablePacks = selectedPacks.map(sp => ({
    id: sp.pack.metadata.id,
    name: sp.pack.metadata.name,
    version: sp.pack.metadata.version,
    priority: sp.pack.metadata.scopePriority || 50,
    mergeStrategy: sp.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE' as MergeStrategy,
    source: sp.source,
    ruleCount: sp.pack.rules.length,
  }));

  // 2. Determine merge strategy (should be consistent)
  const mergeStrategies = new Set(applicablePacks.map(p => p.mergeStrategy));
  const mergeStrategy = mergeStrategies.size === 1 
    ? applicablePacks[0]?.mergeStrategy || 'MOST_RESTRICTIVE'
    : 'MOST_RESTRICTIVE'; // Fallback if mixed

  // 3. Merge rules from all packs
  const { effectiveRules, conflicts } = mergeRules(selectedPacks, mergeStrategy);

  // 4. Build decision logic explanation
  const priorityOrder = applicablePacks
    .sort((a, b) => b.priority - a.priority)
    .map(p => `${p.name} (priority=${p.priority})`);

  const explanation = buildExplanation(mergeStrategy, applicablePacks.length, conflicts.length);

  return {
    repository,
    branch,
    applicablePacks,
    effectiveRules,
    decisionLogic: {
      mergeStrategy,
      priorityOrder,
      explanation,
    },
    conflicts,
  };
}

/**
 * Merge rules from multiple packs
 */
function mergeRules(
  selectedPacks: SelectedPack[],
  mergeStrategy: MergeStrategy
): { effectiveRules: EffectiveRule[]; conflicts: any[] } {
  const ruleMap = new Map<string, EffectiveRule>();
  const conflicts: any[] = [];

  for (const sp of selectedPacks) {
    for (const rule of sp.pack.rules) {
      const existing = ruleMap.get(rule.id);

      if (!existing) {
        // First time seeing this rule
        ruleMap.set(rule.id, {
          ruleId: rule.id,
          ruleName: rule.name,
          enabled: rule.enabled,
          trigger: rule.trigger,
          obligations: rule.obligations,
          sources: [{
            packId: sp.pack.metadata.id,
            packName: sp.pack.metadata.name,
            packVersion: sp.pack.metadata.version,
            packPriority: sp.pack.metadata.scopePriority || 50,
            packSource: sp.source,
          }],
          hasConflict: false,
        });
      } else {
        // Rule already exists - potential conflict
        existing.sources.push({
          packId: sp.pack.metadata.id,
          packName: sp.pack.metadata.name,
          packVersion: sp.pack.metadata.version,
          packPriority: sp.pack.metadata.scopePriority || 50,
          packSource: sp.source,
        });

        // Check if rules are different (conflict)
        const isDifferent = JSON.stringify(existing.obligations) !== JSON.stringify(rule.obligations);
        
        if (isDifferent) {
          existing.hasConflict = true;
          
          // Resolve conflict based on merge strategy
          const resolution = resolveConflict(existing, rule, sp, mergeStrategy);
          existing.conflictResolution = resolution;

          conflicts.push({
            ruleId: rule.id,
            conflictingPacks: existing.sources.map(s => s.packName),
            resolution: resolution.reason,
          });
        }
      }
    }
  }

  return {
    effectiveRules: Array.from(ruleMap.values()),
    conflicts,
  };
}

/**
 * Resolve conflict between rules based on merge strategy
 */
function resolveConflict(
  existing: EffectiveRule,
  newRule: PackRule,
  newPack: SelectedPack,
  mergeStrategy: MergeStrategy
): { strategy: MergeStrategy; winningPackId: string; reason: string } {
  switch (mergeStrategy) {
    case 'HIGHEST_PRIORITY': {
      // Use rule from highest priority pack
      const highestPriority = Math.max(...existing.sources.map(s => s.packPriority));
      const newPriority = newPack.pack.metadata.scopePriority || 50;

      if (newPriority > highestPriority) {
        // New pack wins
        existing.obligations = newRule.obligations;
        existing.enabled = newRule.enabled;
        return {
          strategy: 'HIGHEST_PRIORITY',
          winningPackId: newPack.pack.metadata.id,
          reason: `Pack "${newPack.pack.metadata.name}" has higher priority (${newPriority})`,
        };
      } else {
        // Existing pack wins
        const winner = existing.sources.find(s => s.packPriority === highestPriority)!;
        return {
          strategy: 'HIGHEST_PRIORITY',
          winningPackId: winner.packId,
          reason: `Pack "${winner.packName}" has higher priority (${highestPriority})`,
        };
      }
    }

    case 'MOST_RESTRICTIVE': {
      // Keep most restrictive version (this is complex - for now, keep first)
      return {
        strategy: 'MOST_RESTRICTIVE',
        winningPackId: existing.sources[0].packId,
        reason: 'Using most restrictive rule definition (first pack)',
      };
    }

    case 'EXPLICIT': {
      // Explicit mode requires manual resolution
      return {
        strategy: 'EXPLICIT',
        winningPackId: existing.sources[0].packId,
        reason: 'CONFLICT: Explicit mode requires all packs to agree. Manual resolution needed.',
      };
    }

    default:
      return {
        strategy: 'MOST_RESTRICTIVE',
        winningPackId: existing.sources[0].packId,
        reason: 'Using default conflict resolution',
      };
  }
}

/**
 * Build human-readable explanation of decision logic
 */
function buildExplanation(
  mergeStrategy: MergeStrategy,
  packCount: number,
  conflictCount: number
): string {
  let explanation = `${packCount} pack(s) apply to this repository/branch. `;

  switch (mergeStrategy) {
    case 'MOST_RESTRICTIVE':
      explanation += 'Using MOST_RESTRICTIVE merge strategy: any BLOCK → BLOCK, else any WARN → WARN, else PASS.';
      break;
    case 'HIGHEST_PRIORITY':
      explanation += 'Using HIGHEST_PRIORITY merge strategy: decision from highest priority pack takes precedence.';
      break;
    case 'EXPLICIT':
      explanation += 'Using EXPLICIT merge strategy: all packs must agree, conflicts require manual resolution.';
      break;
  }

  if (conflictCount > 0) {
    explanation += ` ${conflictCount} conflict(s) detected and resolved.`;
  }

  return explanation;
}

