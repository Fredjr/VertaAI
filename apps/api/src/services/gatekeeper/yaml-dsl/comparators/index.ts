/**
 * Comparator Registry Initialization
 * Migration Plan v5.0 - Sprint 1, Task 1.4
 * 
 * Registers all comparators at application startup
 */

import { comparatorRegistry } from './registry.js';
import { artifactUpdatedComparator } from './artifact/artifactUpdated.js';
import { artifactPresentComparator } from './artifact/artifactPresent.js';
import { prTemplateFieldPresentComparator } from './evidence/prTemplateFieldPresent.js';
import { checkrunsPassedComparator } from './evidence/checkrunsPassed.js';
import { noSecretsInDiffComparator } from './safety/noSecretsInDiff.js';
import { humanApprovalPresentComparator } from './governance/humanApprovalPresent.js';
import { minApprovalsComparator } from './governance/minApprovals.js';
import { actorIsAgentComparator } from './actor/actorIsAgent.js';
import { changedPathMatchesComparator } from './trigger/changedPathMatches.js';
import { openapiSchemaValidComparator } from './schema/openapiSchemaValid.js';
// Track A Task 2: Cross-Artifact Comparators
import { openapiCodeParityComparator } from './cross-artifact/openapiCodeParity.js';
import { schemaMigrationParityComparator } from './cross-artifact/schemaMigrationParity.js';
import { contractImplementationParityComparator } from './cross-artifact/contractImplementationParity.js';
import { docCodeParityComparator } from './cross-artifact/docCodeParity.js';
import { testImplementationParityComparator } from './cross-artifact/testImplementationParity.js';
// 11.1: Additional Cross-Artifact Comparators (Full Acceptance Criteria)
import { dashboardServiceParityComparator } from './cross-artifact/dashboardServiceParity.js';
import { runbookOwnershipParityComparator } from './cross-artifact/runbookOwnershipParity.js';
import { sloThresholdParityComparator } from './cross-artifact/sloThresholdParity.js';
// Agent Governance Comparators (Spec→Build→Run Triangle)
import { intentCapabilityParityComparator } from './cross-artifact/intentCapabilityParity.js';
import { infraOwnershipParityComparator } from './cross-artifact/infraOwnershipParity.js';

export function initializeComparators(): void {
  console.log('[Comparators] Initializing comparator registry...');

  // Register all 10 core comparators
  comparatorRegistry.register(artifactUpdatedComparator);
  comparatorRegistry.register(artifactPresentComparator);
  comparatorRegistry.register(prTemplateFieldPresentComparator);
  comparatorRegistry.register(checkrunsPassedComparator);
  comparatorRegistry.register(noSecretsInDiffComparator);
  comparatorRegistry.register(humanApprovalPresentComparator);
  comparatorRegistry.register(minApprovalsComparator);
  comparatorRegistry.register(actorIsAgentComparator);
  comparatorRegistry.register(changedPathMatchesComparator);
  comparatorRegistry.register(openapiSchemaValidComparator);

  // Register Track A Task 2: Cross-Artifact Comparators
  comparatorRegistry.register(openapiCodeParityComparator);
  comparatorRegistry.register(schemaMigrationParityComparator);
  comparatorRegistry.register(contractImplementationParityComparator);
  comparatorRegistry.register(docCodeParityComparator);
  comparatorRegistry.register(testImplementationParityComparator);

  // Register 11.1: Additional Cross-Artifact Comparators
  comparatorRegistry.register(dashboardServiceParityComparator);
  comparatorRegistry.register(runbookOwnershipParityComparator);
  comparatorRegistry.register(sloThresholdParityComparator);

  // Register Agent Governance Comparators
  comparatorRegistry.register(intentCapabilityParityComparator);
  comparatorRegistry.register(infraOwnershipParityComparator);

  console.log(`[Comparators] Registered ${comparatorRegistry.list().length} comparators`);
  console.log(`[Comparators] Available: ${comparatorRegistry.list().join(', ')}`);
}

// Export registry for use in pack evaluator
export { comparatorRegistry } from './registry.js';
export * from './types.js';

