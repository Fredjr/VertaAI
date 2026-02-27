/**
 * PolicyPlan Builder
 * 
 * Builds the PolicyPlan IR entity from pack evaluation results.
 * This tracks which packs/overlays were selected and why (activation ledger).
 * 
 * Key principles:
 * - Records pack selection decisions
 * - Tracks overlay activation/suppression
 * - Provides audit trail
 * - Backward compatible
 */

import type { PolicyPlan, PackActivation, OverlayActivation, ActivationRecord } from './types.js';
import type { PackResult } from '../yamlGatekeeperIntegration.js';
import type { DetectedSignals } from './types.js';

/**
 * Build PolicyPlan from pack evaluation results
 * 
 * @param packResults - Results from all evaluated packs
 * @param signals - Detected signals (for overlay activation reasoning)
 * @returns Complete PolicyPlan with activation ledger
 */
export function buildPolicyPlan(
  packResults: PackResult[],
  signals?: DetectedSignals
): PolicyPlan {
  const basePacks: PackActivation[] = [];
  const overlays: OverlayActivation[] = [];
  const activationLedger: ActivationRecord[] = [];
  const timestamp = new Date().toISOString();

  // Process each pack result
  for (const packResult of packResults) {
    const pack = packResult.pack;
    const metadata = pack.metadata;

    // Determine if this is a base pack or overlay
    const packType = metadata.packType || 'BASELINE';
    const isOverlay = packType === 'SERVICE_OVERLAY' || packType === 'CUSTOM';

    // Build pack activation record
    const packActivation: PackActivation = {
      packId: metadata.id || 'unknown',
      packName: metadata.name,
      version: metadata.version,
      packType: packType as any,
      scopeType: (pack.scope?.type || 'workspace') as 'workspace' | 'service' | 'repo',
      scopeRef: pack.scope?.ref,
      priority: metadata.scopePriority || 50,
      reason: buildActivationReason(pack, packResult.packSource, isOverlay),
    };

    // Add to appropriate list
    if (isOverlay) {
      // Determine if overlay was activated or suppressed
      // For now, if it's in packResults, it was activated
      const overlayActivation: OverlayActivation = {
        overlayId: packActivation.packId,
        overlayName: packActivation.packName,
        status: 'activated',
        reason: buildOverlayActivationReason(pack, signals),
        signals: extractActivationSignals(pack, signals),
      };
      overlays.push(overlayActivation);

      // Add to activation ledger
      activationLedger.push({
        packOrOverlayId: overlayActivation.overlayId,
        packOrOverlayName: overlayActivation.overlayName,
        status: 'activated',
        reason: overlayActivation.reason,
        timestamp,
      });
    } else {
      basePacks.push(packActivation);

      // Add to activation ledger
      activationLedger.push({
        packOrOverlayId: packActivation.packId,
        packOrOverlayName: packActivation.packName,
        status: 'activated',
        reason: packActivation.reason,
        timestamp,
      });
    }
  }

  // Partition obligations by status
  const obligations = partitionObligations(packResults);

  // Determine merge strategy (should be consistent across packs)
  const mergeStrategy = packResults[0]?.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE';

  return {
    basePacks,
    overlays,
    obligations,
    activationLedger,
    mergeStrategy,
  };
}

/**
 * Build activation reason for a pack
 */
function buildActivationReason(pack: any, source: string, isOverlay: boolean): string {
  if (isOverlay) {
    return `Overlay activated based on detected signals`;
  }

  switch (source) {
    case 'repo':
      return `Repo-scoped pack for ${pack.scope?.ref || 'this repository'}`;
    case 'service':
      return `Service-scoped pack for ${pack.scope?.ref || 'this service'}`;
    case 'workspace':
      return `Workspace-level baseline pack`;
    default:
      return `Pack activated (source: ${source})`;
  }
}

/**
 * Build overlay activation reason based on signals
 */
function buildOverlayActivationReason(pack: any, signals?: DetectedSignals): string {
  if (!signals) {
    return 'Overlay activated (signals not available)';
  }

  const packName = pack.metadata.name.toLowerCase();
  const reasons: string[] = [];

  // API Service Overlay
  if (packName.includes('api')) {
    if (signals.hasOpenAPI) reasons.push('OpenAPI schema detected');
    if (signals.hasGraphQL) reasons.push('GraphQL schema detected');
    if (signals.hasProto) reasons.push('Proto files detected');
  }

  // DB Service Overlay
  if (packName.includes('db') || packName.includes('database')) {
    if (signals.hasMigrations) reasons.push('Database migrations detected');
    if (signals.hasORM) reasons.push('ORM models detected');
  }

  // Observability Overlay
  if (packName.includes('observability')) {
    if (signals.hasSLO) reasons.push('SLO definitions detected');
    if (signals.hasAlerts) reasons.push('Alert rules detected');
  }

  return reasons.length > 0
    ? `Detected: ${reasons.join(', ')}`
    : 'Overlay activated based on pack selection logic';
}

/**
 * Extract signals that triggered overlay activation
 */
function extractActivationSignals(pack: any, signals?: DetectedSignals): string[] {
  if (!signals) return [];

  const packName = pack.metadata.name.toLowerCase();
  const activationSignals: string[] = [];

  if (packName.includes('api')) {
    if (signals.hasOpenAPI) activationSignals.push('openapi_present');
    if (signals.hasGraphQL) activationSignals.push('graphql_present');
    if (signals.hasProto) activationSignals.push('proto_present');
  }

  if (packName.includes('db') || packName.includes('database')) {
    if (signals.hasMigrations) activationSignals.push('migrations_present');
    if (signals.hasORM) activationSignals.push('orm_present');
  }

  if (packName.includes('observability')) {
    if (signals.hasSLO) activationSignals.push('slo_present');
    if (signals.hasAlerts) activationSignals.push('alerts_present');
  }

  return activationSignals;
}

/**
 * Partition obligations by status
 * This uses the evaluation graph to determine which obligations were enforced/suppressed/etc.
 */
function partitionObligations(packResults: PackResult[]): PolicyPlan['obligations'] {
  const enforced: string[] = [];
  const suppressed: string[] = [];
  const informational: string[] = [];
  const notEvaluable: string[] = [];

  for (const packResult of packResults) {
    const graph = packResult.result.evaluationGraph;
    if (!graph) continue;

    for (const ruleGraph of graph.ruleGraphs) {
      for (const obligation of ruleGraph.obligations) {
        const obligationId = `${ruleGraph.ruleId}:${obligation.description}`;

        // Determine status based on evaluation result
        if (obligation.result === 'NOT_EVALUABLE') {
          notEvaluable.push(obligationId);
        } else if (obligation.result === 'SUPPRESSED') {
          suppressed.push(obligationId);
        } else if (obligation.result === 'INFO') {
          informational.push(obligationId);
        } else {
          // PASS or FAIL - these are enforced
          enforced.push(obligationId);
        }
      }
    }
  }

  return {
    enforced,
    suppressed,
    informational,
    notEvaluable,
  };
}

