/**
 * Manually process a drift candidate through the pipeline
 * Useful for testing without waiting for QStash
 */

import { prisma } from '../lib/db.js';
import { runDriftDetectionPipeline } from '../pipelines/drift-detection.js';
import { getPRDiff, getPRFiles } from '../services/github-client.js';

async function main() {
  const driftId = process.argv[2];
  
  if (!driftId) {
    console.error('❌ Usage: npx tsx src/scripts/process-drift-manually.ts <driftId>');
    process.exit(1);
  }
  
  console.log(`🔧 Processing drift candidate: ${driftId}\n`);
  
  // Get drift candidate
  const drift = await prisma.driftCandidate.findFirst({
    where: { id: driftId },
    include: { signalEvent: true },
  });
  
  if (!drift) {
    console.error(`❌ Drift candidate not found: ${driftId}`);
    process.exit(1);
  }
  
  console.log(`✅ Found drift candidate:`);
  console.log(`   State: ${drift.state}`);
  console.log(`   Workspace: ${drift.workspaceId}`);
  console.log(`   Repo: ${drift.repo}`);
  console.log('');
  
  if (!drift.signalEvent) {
    console.error(`❌ No signal event found for drift ${driftId}`);
    process.exit(1);
  }
  
  const extracted = drift.signalEvent.extracted as any;
  
  console.log(`📋 Signal Event:`);
  console.log(`   PR #${extracted.prNumber}: ${extracted.prTitle}`);
  console.log(`   Author: ${extracted.authorLogin}`);
  console.log(`   Merged: ${extracted.merged}`);
  console.log(`   Repo: ${extracted.repoFullName}`);
  console.log('');
  
  // Fetch PR diff and files
  console.log(`🔍 Fetching PR details from GitHub...`);
  
  let diff = '';
  let files: any[] = [];
  
  try {
    // Note: This will use the GitHub client which falls back to env vars
    const { getGitHubClient } = await import('../services/github-client.js');
    const octokit = await getGitHubClient(drift.workspaceId, extracted.installationId);
    
    if (octokit) {
      const [owner, repo] = extracted.repoFullName.split('/');
      
      // Get PR diff
      const diffResponse = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: extracted.prNumber,
        mediaType: { format: 'diff' },
      });
      diff = diffResponse.data as any;
      
      // Get PR files
      const filesResponse = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: extracted.prNumber,
      });
      files = filesResponse.data;
      
      console.log(`✅ Fetched ${files.length} changed files`);
      console.log(`✅ Diff size: ${diff.length} bytes`);
    } else {
      console.warn('⚠️  No GitHub client available - using empty diff/files');
    }
  } catch (error: any) {
    console.error(`❌ Error fetching PR details: ${error.message}`);
    console.log('⚠️  Continuing with empty diff/files...');
  }
  
  console.log('');
  console.log(`🚀 Running drift detection pipeline...`);
  console.log('');
  
  try {
    const result = await runDriftDetectionPipeline({
      signalId: drift.signalEventId,
      workspaceId: drift.workspaceId,
      driftCandidateId: drift.id,
      prNumber: extracted.prNumber,
      prTitle: extracted.prTitle,
      prBody: extracted.prBody || '',
      repoFullName: extracted.repoFullName,
      authorLogin: extracted.authorLogin,
      mergedAt: extracted.mergedAt,
      changedFiles: files,
      diff,
    });
    
    console.log('');
    console.log(`✅ Pipeline completed!`);
    console.log(`   Result:`, JSON.stringify(result, null, 2));
    
  } catch (error: any) {
    console.error(`❌ Pipeline error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
  
  await prisma.$disconnect();
}

main();

