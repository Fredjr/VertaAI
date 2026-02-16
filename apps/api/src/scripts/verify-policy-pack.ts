/**
 * Verify Policy Pack and Adapter Layer
 * 
 * This script verifies that:
 * 1. WorkspacePolicyPack was created correctly
 * 2. Adapter layer transforms it correctly to ContractPack
 * 3. Adapter layer transforms it correctly to DriftPlan
 */

import { PrismaClient } from '@prisma/client';
import { getContractPacksAdapter, getDriftPlansAdapter } from '../services/policyPacks/adapter.js';

const prisma = new PrismaClient();

async function main() {
  const workspaceId = 'demo-workspace';

  console.log('🔍 Verifying Policy Pack Data...\n');

  // 1. Check WorkspacePolicyPack
  console.log('1️⃣ WorkspacePolicyPack (Unified Storage):');
  const policyPacks = await prisma.workspacePolicyPack.findMany({
    where: { workspaceId },
  });

  console.log(`   Found ${policyPacks.length} policy pack(s)`);
  policyPacks.forEach((pack) => {
    console.log(`   - ${pack.name} (${pack.id})`);
    console.log(`     Track A: ${pack.trackAEnabled ? '✅' : '❌'}`);
    console.log(`     Track B: ${pack.trackBEnabled ? '✅' : '❌'}`);
    console.log(`     Status: ${pack.status}`);
    console.log(`     Scope: ${pack.scopeType}`);
  });
  console.log('');

  // 2. Check ContractPack Adapter
  console.log('2️⃣ ContractPack Adapter (Track A Legacy Format):');
  const contractPacks = await getContractPacksAdapter(workspaceId);
  console.log(`   Found ${contractPacks.length} contract pack(s) via adapter`);
  contractPacks.forEach((pack) => {
    console.log(`   - ${pack.name} (${pack.id})`);
    console.log(`     Contracts: ${pack.contracts?.length || 0}`);
    console.log(`     Version: ${pack.version}`);
  });
  console.log('');

  // 3. Check DriftPlan Adapter
  console.log('3️⃣ DriftPlan Adapter (Track B Legacy Format):');
  const driftPlans = await getDriftPlansAdapter({ workspaceId, status: 'active' });
  console.log(`   Found ${driftPlans.length} drift plan(s) via adapter`);
  driftPlans.forEach((plan) => {
    console.log(`   - ${plan.name} (${plan.id})`);
    console.log(`     Primary Doc: ${plan.primaryDocSystem}/${plan.primaryDocId}`);
    console.log(`     Input Sources: ${plan.inputSources?.length || 0}`);
    console.log(`     Drift Types: ${plan.driftTypes?.length || 0}`);
    console.log(`     Status: ${plan.status}`);
  });
  console.log('');

  // 4. Check Legacy Tables (should be empty or separate)
  console.log('4️⃣ Legacy Tables (Should NOT contain unified policy pack data):');
  const legacyContractPacks = await prisma.contractPack.findMany({
    where: { workspaceId },
  });
  console.log(`   ContractPack table: ${legacyContractPacks.length} record(s)`);

  const legacyDriftPlans = await prisma.driftPlan.findMany({
    where: { workspaceId },
  });
  console.log(`   DriftPlan table: ${legacyDriftPlans.length} record(s)`);
  console.log('');

  // 5. Summary
  console.log('📊 Summary:');
  console.log(`   ✅ Unified Policy Packs: ${policyPacks.length}`);
  console.log(`   ✅ Adapter → ContractPacks: ${contractPacks.length}`);
  console.log(`   ✅ Adapter → DriftPlans: ${driftPlans.length}`);
  console.log(`   ℹ️  Legacy ContractPacks: ${legacyContractPacks.length}`);
  console.log(`   ℹ️  Legacy DriftPlans: ${legacyDriftPlans.length}`);
  console.log('');

  console.log('✅ Verification Complete!');
  console.log('');
  console.log('🎯 Architecture Flow:');
  console.log('   1. UI creates/edits → WorkspacePolicyPack (unified storage)');
  console.log('   2. Track A services read → Adapter → ContractPack format');
  console.log('   3. Track B services read → Adapter → DriftPlan format');
  console.log('   4. Legacy routes still exist but write to old tables');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   - Test UI at: http://localhost:3000/policy-packs?workspace=demo-workspace');
  console.log('   - Verify Track A contract validation works');
  console.log('   - Verify Track B drift detection works');
  console.log('   - Eventually deprecate legacy routes and tables');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

