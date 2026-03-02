/**
 * Intent ↔ Runtime Parity Comparator (Agent Governance - Spec→Run)
 * 
 * Verifies that runtime behavior matches declared intent capabilities:
 * - Detects undeclared runtime usage (privilege escalation in production)
 * - Detects unused declared capabilities (over-provisioning)
 * - Validates runtime constraints (no unexpected side effects)
 * 
 * This is a Spec→Run comparator in the Spec–Build–Run triangle.
 * 
 * ARCHITECTURE:
 * - Fetches intent artifact from database (declared capabilities)
 * - Fetches runtime observations from database (observed capabilities)
 * - Compares declared vs observed using capability aggregation service
 * - Generates findings with evidence from runtime observations
 * 
 * USAGE:
 * This comparator is auto-invoked for agent-authored PRs.
 * It requires runtime observations to be ingested (Phase 2 Part 2).
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { EvidenceItem } from '../../ir/types.js';
import { AgentGovernanceMessages, RemediationMessages } from '../../ir/messageCatalog.js';
import { prisma } from '../../../../../lib/db.js';
import { detectCapabilityDrift } from '../../../../runtime/capabilityAggregation.js';
import type { Capability } from '../../../../../types/agentGovernance.js';

/**
 * Parameters for INTENT_RUNTIME_PARITY comparator
 */
interface IntentRuntimeParityParams {
  /** Observation window in days (default: 7) */
  observationWindowDays?: number;
  /** Minimum observation count to consider capability as "used" (default: 1) */
  minObservationCount?: number;
  /** Services to check (default: all services in intent artifact) */
  services?: string[];
  /** Whether to fail on undeclared usage (default: true) */
  failOnUndeclaredUsage?: boolean;
  /** Whether to warn on unused declarations (default: true) */
  warnOnUnusedDeclarations?: boolean;
}

export const intentRuntimeParityComparator: Comparator = {
  id: ComparatorId.INTENT_RUNTIME_PARITY,
  version: '1.0.0',

  async evaluate(context: PRContext, params: IntentRuntimeParityParams = {}): Promise<any> {
    const { owner, repo, prNumber, workspaceId } = context;
    const repoFullName = `${owner}/${repo}`;

    // Default parameters
    const observationWindowDays = params.observationWindowDays || 7;
    const minObservationCount = params.minObservationCount || 1;
    const failOnUndeclaredUsage = params.failOnUndeclaredUsage !== false;
    const warnOnUnusedDeclarations = params.warnOnUnusedDeclarations !== false;

    // Step 1: Fetch intent artifact from database
    const intentArtifact = await prisma.intentArtifact.findFirst({
      where: {
        workspaceId,
        prNumber,
        repoFullName,
      },
    });

    if (!intentArtifact) {
      // No intent artifact found - skip this comparator
      return {
        comparatorId: ComparatorId.INTENT_RUNTIME_PARITY,
        status: 'unknown',
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No intent artifact found for this PR',
        evidence: [],
      };
    }

    // Step 2: Extract declared capabilities and affected services
    const declaredCapabilities = intentArtifact.requestedCapabilities as unknown as Capability[];
    const affectedServices = params.services || intentArtifact.affectedServices || [];

    if (affectedServices.length === 0) {
      return {
        comparatorId: ComparatorId.INTENT_RUNTIME_PARITY,
        status: 'unknown',
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No affected services specified in intent artifact',
        evidence: [],
      };
    }

    // Step 3: Detect capability drift for each service
    const allDrifts = [];
    const evidence: EvidenceItem[] = [];

    for (const service of affectedServices) {
      const drifts = await detectCapabilityDrift(
        workspaceId,
        service,
        declaredCapabilities,
        observationWindowDays
      );

      // Filter by minimum observation count
      const significantDrifts = drifts.filter(drift => {
        if (drift.driftType === 'undeclared_usage') {
          const observationCount = drift.evidence.reduce((sum, e) => sum + (e.metadata.count || 1), 0);
          return observationCount >= minObservationCount;
        }
        return true; // Always include unused declarations
      });

      allDrifts.push(...significantDrifts);

      // Build evidence
      for (const drift of significantDrifts) {
        evidence.push({
          type: 'runtime_drift',
          path: `${service}/${drift.capabilityTarget}`,
          snippet: `${drift.driftType}: ${drift.capabilityType} on ${drift.capabilityTarget}`,
          confidence: drift.severity === 'critical' ? 95 : drift.severity === 'high' ? 90 : 80,
        });
      }
    }

    // Step 4: Categorize drifts
    const undeclaredUsage = allDrifts.filter(d => d.driftType === 'undeclared_usage');
    const unusedDeclarations = allDrifts.filter(d => d.driftType === 'unused_declaration');

    // Step 5: Determine status and message
    if (undeclaredUsage.length > 0 && failOnUndeclaredUsage) {
      const criticalDrifts = undeclaredUsage.filter(d => d.severity === 'critical');
      const highDrifts = undeclaredUsage.filter(d => d.severity === 'high');

      const capabilityList = undeclaredUsage
        .map(d => `${d.capabilityType}(${d.capabilityTarget})`)
        .join(', ');

      return {
        comparatorId: ComparatorId.INTENT_RUNTIME_PARITY,
        status: 'fail',
        reasonCode: FindingCode.INTENT_RUNTIME_UNDECLARED,
        message: AgentGovernanceMessages.intentRuntimeUndeclared(capabilityList, affectedServices.join(', ')),
        evidence,
        remediation: RemediationMessages.agentGovernance.addRuntimeCapabilities(capabilityList),
      };
    }

    if (unusedDeclarations.length > 0 && warnOnUnusedDeclarations) {
      const capabilityList = unusedDeclarations
        .map(d => `${d.capabilityType}(${d.capabilityTarget})`)
        .join(', ');

      return {
        comparatorId: ComparatorId.INTENT_RUNTIME_PARITY,
        status: 'fail',
        reasonCode: FindingCode.INTENT_RUNTIME_UNUSED,
        message: AgentGovernanceMessages.intentRuntimeUnused(capabilityList, observationWindowDays),
        evidence,
        remediation: RemediationMessages.agentGovernance.removeUnusedCapabilities(capabilityList),
      };
    }

    // All good!
    return {
      comparatorId: ComparatorId.INTENT_RUNTIME_PARITY,
      status: 'pass',
      reasonCode: FindingCode.PASS,
      message: AgentGovernanceMessages.intentRuntimeConsistent(affectedServices.join(', '), observationWindowDays),
      evidence,
    };
  },
};

