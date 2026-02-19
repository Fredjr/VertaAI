/**
 * Conflict Detector Service
 * Phase 3C.2: Detect conflicts between multiple policy packs
 * 
 * Detects:
 * - Merge strategy conflicts (EXPLICIT mode requires consistency)
 * - Rule conflicts (same rule ID, different decisions)
 * - Priority conflicts (ambiguous priority assignments)
 */

import type { PackYAML, PackRule, MergeStrategy } from './types.js';

export interface PackConflict {
  type: 'merge_strategy_conflict' | 'rule_conflict' | 'priority_conflict';
  severity: 'error' | 'warning';
  affectedPacks: string[];
  affectedRules?: string[];
  description: string;
  remediation: string[];
}

/**
 * Detect conflicts between multiple packs
 */
export function detectConflicts(packs: PackYAML[]): PackConflict[] {
  const conflicts: PackConflict[] = [];

  if (packs.length === 0) {
    return conflicts;
  }

  // 1. Check for merge strategy conflicts
  const mergeStrategyConflicts = detectMergeStrategyConflicts(packs);
  conflicts.push(...mergeStrategyConflicts);

  // 2. Check for rule conflicts (same rule ID, different decisions)
  const ruleConflicts = detectRuleConflicts(packs);
  conflicts.push(...ruleConflicts);

  // 3. Check for priority conflicts (ambiguous priorities)
  const priorityConflicts = detectPriorityConflicts(packs);
  conflicts.push(...priorityConflicts);

  return conflicts;
}

/**
 * Detect merge strategy conflicts
 */
function detectMergeStrategyConflicts(packs: PackYAML[]): PackConflict[] {
  const conflicts: PackConflict[] = [];

  const mergeStrategies = new Set(
    packs.map(p => p.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE')
  );

  // If any pack uses EXPLICIT, all must use the same strategy
  if (mergeStrategies.size > 1 && mergeStrategies.has('EXPLICIT')) {
    conflicts.push({
      type: 'merge_strategy_conflict',
      severity: 'error',
      affectedPacks: packs.map(p => p.metadata.name),
      description: 'Conflicting merge strategies detected. EXPLICIT mode requires all packs to use the same strategy.',
      remediation: [
        'Change all packs to use EXPLICIT merge strategy',
        'Or change EXPLICIT packs to use MOST_RESTRICTIVE or HIGHEST_PRIORITY',
        'Current strategies: ' + Array.from(mergeStrategies).join(', '),
      ],
    });
  }

  // Warn if multiple strategies are used (even without EXPLICIT)
  if (mergeStrategies.size > 1 && !mergeStrategies.has('EXPLICIT')) {
    conflicts.push({
      type: 'merge_strategy_conflict',
      severity: 'warning',
      affectedPacks: packs.map(p => p.metadata.name),
      description: 'Multiple merge strategies detected. System will use MOST_RESTRICTIVE as fallback.',
      remediation: [
        'Consider standardizing on a single merge strategy across all packs',
        'Current strategies: ' + Array.from(mergeStrategies).join(', '),
      ],
    });
  }

  return conflicts;
}

/**
 * Detect rule conflicts (same rule ID, different decisions)
 */
function detectRuleConflicts(packs: PackYAML[]): PackConflict[] {
  const conflicts: PackConflict[] = [];

  // Build a map of rule ID -> list of (pack, decision)
  const ruleMap = new Map<string, Array<{ pack: string; decision: string; rule: PackRule }>>();

  for (const pack of packs) {
    for (const rule of pack.rules) {
      const decision = computeRuleDecision(rule);

      if (!ruleMap.has(rule.id)) {
        ruleMap.set(rule.id, []);
      }

      ruleMap.get(rule.id)!.push({
        pack: pack.metadata.name,
        decision,
        rule,
      });
    }
  }

  // Check for conflicts
  for (const [ruleId, entries] of ruleMap.entries()) {
    if (entries.length > 1) {
      const decisions = new Set(entries.map(e => e.decision));

      if (decisions.size > 1) {
        // Conflict detected
        conflicts.push({
          type: 'rule_conflict',
          severity: 'warning',
          affectedPacks: entries.map(e => e.pack),
          affectedRules: [ruleId],
          description: `Rule "${ruleId}" has conflicting decisions across packs: ${Array.from(decisions).join(', ')}`,
          remediation: [
            'Ensure all packs define the same decision for this rule',
            'Or use different rule IDs for different behaviors',
            'Or adjust pack priorities to control which decision wins',
            `Packs: ${entries.map(e => `${e.pack} (${e.decision})`).join(', ')}`,
          ],
        });
      }
    }
  }

  return conflicts;
}

/**
 * Detect priority conflicts (multiple packs with same priority)
 */
function detectPriorityConflicts(packs: PackYAML[]): PackConflict[] {
  const conflicts: PackConflict[] = [];

  // Build a map of priority -> list of packs
  const priorityMap = new Map<number, string[]>();

  for (const pack of packs) {
    const priority = pack.metadata.scopePriority || 50;

    if (!priorityMap.has(priority)) {
      priorityMap.set(priority, []);
    }

    priorityMap.get(priority)!.push(pack.metadata.name);
  }

  // Check for conflicts (multiple packs with same priority)
  for (const [priority, packNames] of priorityMap.entries()) {
    if (packNames.length > 1) {
      conflicts.push({
        type: 'priority_conflict',
        severity: 'warning',
        affectedPacks: packNames,
        description: `Multiple packs have the same priority (${priority}). This may lead to non-deterministic behavior.`,
        remediation: [
          'Assign unique priorities to each pack',
          'Or accept that packs with the same priority will be evaluated in arbitrary order',
          `Affected packs: ${packNames.join(', ')}`,
        ],
      });
    }
  }

  return conflicts;
}

/**
 * Compute the decision for a rule (simplified)
 * Returns the most restrictive decision from all obligations
 */
function computeRuleDecision(rule: PackRule): string {
  let decision = 'pass';

  for (const obligation of rule.obligations) {
    const decisionOnFail = obligation.decisionOnFail || 'warn';

    if (decisionOnFail === 'block') {
      decision = 'block';
    } else if (decisionOnFail === 'warn' && decision !== 'block') {
      decision = 'warn';
    }
  }

  return decision;
}

