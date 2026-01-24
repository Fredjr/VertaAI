/**
 * Drift Detection Pipeline
 * Chains agents: A (Triage) → B (Doc Resolver) → C (Patch Planner) → D (Patch Generator) → E (Slack Composer)
 */

import { prisma } from '../lib/db.js';
import { runDriftTriage, DriftTriageInput } from '../agents/drift-triage.js';
import { runDocResolver } from '../agents/doc-resolver.js';
import { runPatchPlanner } from '../agents/patch-planner.js';
import { runPatchGenerator } from '../agents/patch-generator.js';
import { runSlackComposer, buildFallbackSlackMessage } from '../agents/slack-composer.js';
import type { DriftTriageOutput } from '@vertaai/shared';

export interface DriftDetectionInput {
  signalId: string;
  orgId: string;
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  repoFullName: string;
  authorLogin: string;
  mergedAt: string | null;
  changedFiles: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  diff: string;
}

export interface DriftDetectionResult {
  signalId: string;
  driftDetected: boolean;
  proposalIds: string[];
  errors: string[];
}

/**
 * Run the full drift detection pipeline
 */
export async function runDriftDetectionPipeline(input: DriftDetectionInput): Promise<DriftDetectionResult> {
  console.log(`[Pipeline] Starting drift detection for signal: ${input.signalId}`);
  const errors: string[] = [];
  const proposalIds: string[] = [];

  // Step 1: Agent A - Drift Triage
  console.log(`[Pipeline] Step 1: Running Drift Triage`);
  const triageInput: DriftTriageInput = {
    prNumber: input.prNumber,
    prTitle: input.prTitle,
    prBody: input.prBody,
    repoFullName: input.repoFullName,
    authorLogin: input.authorLogin,
    mergedAt: input.mergedAt,
    changedFiles: input.changedFiles,
    diff: input.diff,
  };

  const triageResult = await runDriftTriage(triageInput);
  
  // Update signal with triage result
  await prisma.signal.update({
    where: { id: input.signalId },
    data: {
      driftAnalysis: triageResult.success ? triageResult.data : { error: triageResult.error },
      processedAt: new Date(),
    },
  });

  if (!triageResult.success || !triageResult.data) {
    errors.push(`Triage failed: ${triageResult.error}`);
    return { signalId: input.signalId, driftDetected: false, proposalIds, errors };
  }

  const triage: DriftTriageOutput = triageResult.data;
  if (!triage.drift_detected) {
    console.log(`[Pipeline] No drift detected, stopping pipeline`);
    return { signalId: input.signalId, driftDetected: false, proposalIds, errors };
  }

  // Step 2: Agent B - Doc Resolver
  console.log(`[Pipeline] Step 2: Running Doc Resolver`);
  const docResolverResult = await runDocResolver({
    repoFullName: input.repoFullName,
    suspectedServices: extractServicesFromFiles(input.changedFiles),
    impactedDomains: triage.impacted_domains,
    orgId: input.orgId,
  });

  if (!docResolverResult.success || !docResolverResult.data) {
    errors.push(`Doc resolver failed: ${docResolverResult.error}`);
    return { signalId: input.signalId, driftDetected: true, proposalIds, errors };
  }

  if (docResolverResult.data.doc_candidates.length === 0) {
    console.log(`[Pipeline] No doc candidates found`);
    return { signalId: input.signalId, driftDetected: true, proposalIds, errors };
  }

  // Process each doc candidate
  for (const candidate of docResolverResult.data.doc_candidates) {
    try {
      const proposalId = await processDocCandidate({
        input,
        triage,
        candidate,
        orgId: input.orgId,
      });
      if (proposalId) {
        proposalIds.push(proposalId);
      }
    } catch (err) {
      errors.push(`Failed to process doc ${candidate.doc_id}: ${err}`);
    }
  }

  console.log(`[Pipeline] Completed. Proposals created: ${proposalIds.length}`);
  return { signalId: input.signalId, driftDetected: true, proposalIds, errors };
}

interface ProcessDocInput {
  input: DriftDetectionInput;
  triage: DriftTriageOutput;
  candidate: { doc_id: string; title: string; confidence: number };
  orgId: string;
}

async function processDocCandidate(params: ProcessDocInput): Promise<string | null> {
  const { input, triage, candidate, orgId } = params;
  console.log(`[Pipeline] Processing doc candidate: ${candidate.title}`);

  // Fetch document content from database
  const doc = await prisma.trackedDocument.findUnique({
    where: { id: candidate.doc_id },
  });

  if (!doc || !doc.lastContentSnapshot) {
    console.warn(`[Pipeline] Doc ${candidate.doc_id} not found or has no content`);
    return null;
  }

  // Step 3: Agent C - Patch Planner
  console.log(`[Pipeline] Step 3: Running Patch Planner for ${candidate.title}`);
  const plannerResult = await runPatchPlanner({
    docId: candidate.doc_id,
    docTitle: candidate.title,
    docContent: doc.lastContentSnapshot,
    impactedDomains: triage.impacted_domains,
    prTitle: input.prTitle,
    prDescription: input.prBody,
    diffExcerpt: input.diff,
  });

  if (!plannerResult.success || !plannerResult.data) {
    console.error(`[Pipeline] Patch planner failed: ${plannerResult.error}`);
    return null;
  }

  if (plannerResult.data.targets.length === 0) {
    console.log(`[Pipeline] No patch targets identified`);
    return null;
  }

  // Step 4: Agent D - Patch Generator (CORE FEATURE)
  console.log(`[Pipeline] Step 4: Running Patch Generator`);
  const patchResult = await runPatchGenerator({
    docId: candidate.doc_id,
    docTitle: candidate.title,
    docContent: doc.lastContentSnapshot,
    patchPlan: plannerResult.data,
    prId: `${input.repoFullName}#${input.prNumber}`,
    prTitle: input.prTitle,
    prDescription: input.prBody,
    diffExcerpt: input.diff,
    changedFiles: input.changedFiles.map(f => f.filename),
  });

  if (!patchResult.success || !patchResult.data) {
    console.error(`[Pipeline] Patch generator failed: ${patchResult.error}`);
    return null;
  }

  // Create diff proposal in database
  const proposal = await prisma.diffProposal.create({
    data: {
      orgId,
      documentId: candidate.doc_id,
      signalId: input.signalId,
      diffContent: patchResult.data.unified_diff,
      summary: patchResult.data.summary,
      confidence: patchResult.data.confidence,
      status: patchResult.data.needs_human ? 'needs_review' : 'pending',
    },
  });

  console.log(`[Pipeline] Created proposal: ${proposal.id}`);
  return proposal.id;
}

function extractServicesFromFiles(files: Array<{ filename: string }>): string[] {
  const services = new Set<string>();
  for (const file of files) {
    // Extract service name from path patterns like services/foo/, apps/bar/
    const match = file.filename.match(/^(?:services|apps|packages)\/([^/]+)\//);
    if (match && match[1]) services.add(match[1]);
  }
  return Array.from(services);
}

