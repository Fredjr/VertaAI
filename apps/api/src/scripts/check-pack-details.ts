#!/usr/bin/env tsx
/**
 * Check pack details for debugging
 */

import { prisma } from '../lib/db.js';

async function main() {
  const pack = await prisma.workspacePolicyPack.findFirst({
    where: {
      workspaceId: 'demo-workspace',
      name: 'Production Test Pack - Observe Core'
    }
  });

  if (!pack) {
    console.log('❌ Pack not found');
    return;
  }

  console.log('✅ Pack found:');
  console.log('  ID:', pack.id);
  console.log('  workspaceId:', pack.workspaceId);
  console.log('  status:', pack.status);
  console.log('  packStatus:', pack.packStatus);
  console.log('  trackAEnabled:', pack.trackAEnabled);
  console.log('  trackAConfigYamlPublished:', pack.trackAConfigYamlPublished ? 'SET' : 'NULL');
  console.log('  scopeType:', pack.scopeType);
  console.log('  scopeRef:', pack.scopeRef);
  
  // Parse the YAML to check scope
  if (pack.trackAConfigYamlPublished) {
    const yaml = require('yaml');
    const packYAML = yaml.parse(pack.trackAConfigYamlPublished);
    console.log('\n📋 YAML Scope:');
    console.log('  type:', packYAML.scope.type);
    console.log('  repos.include:', packYAML.scope.repos?.include);
    console.log('  branches.include:', packYAML.scope.branches?.include);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

