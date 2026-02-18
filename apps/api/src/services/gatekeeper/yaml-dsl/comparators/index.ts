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

  console.log(`[Comparators] Registered ${comparatorRegistry.list().length} comparators`);
  console.log(`[Comparators] Available: ${comparatorRegistry.list().join(', ')}`);
}

// Export registry for use in pack evaluator
export { comparatorRegistry } from './registry.js';
export * from './types.js';

