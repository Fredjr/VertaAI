/**
 * List all registered comparators
 */

import { getComparatorRegistry } from '../src/services/contracts/comparators/registry.js';
// Import all comparators to trigger auto-registration
import '../src/services/contracts/comparators/openapi.js';
import '../src/services/contracts/comparators/terraform.js';
import '../src/services/contracts/comparators/docsRequiredSections.js';
import '../src/services/contracts/comparators/docsAnchorCheck.js';
import '../src/services/contracts/comparators/obligationFilePresent.js';
import '../src/services/contracts/comparators/obligationFileChanged.js';
import '../src/services/contracts/comparators/openapiValidate.js';
import '../src/services/contracts/comparators/openapiDiff.js';
import '../src/services/contracts/comparators/openapiVersionBump.js';

const registry = getComparatorRegistry();
const comparators = registry.list();

console.log('\n📋 Registered Comparators:\n');
comparators.forEach((c, i) => {
  console.log(`${i + 1}. ${c.type} (v${c.version})`);
  console.log(`   Supports: ${c.supportedArtifactTypes.join(', ')}`);
});
console.log(`\nTotal: ${comparators.length} comparators registered\n`);

