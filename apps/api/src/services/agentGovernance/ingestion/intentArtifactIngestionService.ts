/**
 * Intent Artifact Ingestion Service
 * Orchestrates the ingestion of intent artifacts from various sources
 */

import { prisma } from '../../../lib/db.js';
import type { IntentArtifact, IntentArtifactIngestion, FileChange } from '../../../types/agentGovernance.js';
import { validateIntentArtifact } from '../intentArtifactValidator.js';
import {
  extractIntentFromPRDescription,
  inferIntentFromPRMetadata,
  mergeIntentWithMetadata,
  type PRTemplateIntentBlock,
} from './prTemplateParser.js';
import {
  extractAgentIdentity,
  inferCapabilitiesFromFileChanges,
  buildAgentActionTrace,
} from './agentSummaryParser.js';

export interface PRData {
  number: number;
  title: string;
  body: string;
  labels: string[];
  user: {
    login: string;
    type: string;
  };
  commits: Array<{
    message: string;
    author: { name: string; email: string };
  }>;
  files: FileChange[];
  repoFullName: string;
}

/**
 * Ingest intent artifact from PR data
 * Returns the created intent artifact and optional agent action trace
 */
export async function ingestIntentArtifactFromPR(
  workspaceId: string,
  prData: PRData
): Promise<{
  intentArtifact: IntentArtifact | null;
  agentActionTrace: any | null;
  ingestion: IntentArtifactIngestion;
}> {
  const autoPopulatedFields: string[] = [];
  
  // Step 1: Extract explicit intent from PR description
  const explicitIntent = extractIntentFromPRDescription(prData.body);
  
  // Step 2: Infer intent from PR metadata
  const inferredIntent = inferIntentFromPRMetadata(prData);
  
  // Step 3: Merge explicit and inferred intent
  const mergedIntent = mergeIntentWithMetadata(explicitIntent, inferredIntent);
  
  // Step 4: Check if this is an agent-authored PR
  const agentIdentity = extractAgentIdentity(prData.commits, prData.body);
  
  if (agentIdentity) {
    mergedIntent.authorType = 'AGENT';
    mergedIntent.agentIdentity = agentIdentity;
    autoPopulatedFields.push('authorType', 'agentIdentity');
  }
  
  // Step 5: Infer capabilities from file changes if not explicitly provided
  if (!mergedIntent.requestedCapabilities || mergedIntent.requestedCapabilities.length === 0) {
    mergedIntent.requestedCapabilities = inferCapabilitiesFromFileChanges(prData.files);
    autoPopulatedFields.push('requestedCapabilities');
  }
  
  // Step 6: Validate the merged intent
  const validation = validateIntentArtifact(mergedIntent);
  
  if (!validation.success) {
    return {
      intentArtifact: null,
      agentActionTrace: null,
      ingestion: {
        source: explicitIntent ? 'pr_template' : 'manual',
        artifact: mergedIntent,
        validation: {
          schema_valid: false,
          capabilities_parseable: false,
          constraints_enforceable: false,
          errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        auto_populated_fields: autoPopulatedFields,
      },
    };
  }
  
  // Step 7: Create intent artifact in database
  const intentArtifact = await prisma.intentArtifact.create({
    data: {
      workspaceId,
      prNumber: prData.number,
      repoFullName: prData.repoFullName,
      author: validation.data.author,
      authorType: validation.data.authorType,
      agentIdentity: validation.data.agentIdentity ? JSON.stringify(validation.data.agentIdentity) : null,
      requestedCapabilities: validation.data.requestedCapabilities,
      constraints: validation.data.constraints,
      affectedServices: validation.data.affectedServices,
      expectedSideEffects: validation.data.expectedSideEffects,
      riskAcknowledgements: validation.data.riskAcknowledgements,
      links: validation.data.links || null,
      signature: validation.data.signature || null,
    },
  });
  
  // Step 8: Create agent action trace if this is an agent-authored PR
  let agentActionTrace = null;
  if (agentIdentity) {
    const traceData = buildAgentActionTrace(
      workspaceId,
      prData.number,
      prData.repoFullName,
      agentIdentity,
      prData.files
    );
    
    agentActionTrace = await prisma.agentActionTrace.create({
      data: traceData,
    });
  }
  
  return {
    intentArtifact,
    agentActionTrace,
    ingestion: {
      source: explicitIntent ? 'pr_template' : 'manual',
      artifact: mergedIntent,
      validation: {
        schema_valid: true,
        capabilities_parseable: true,
        constraints_enforceable: true,
      },
      auto_populated_fields: autoPopulatedFields,
    },
  };
}

/**
 * Get or create intent artifact for a PR
 * Returns existing artifact if already ingested
 */
export async function getOrCreateIntentArtifact(
  workspaceId: string,
  prData: PRData
): Promise<IntentArtifact | null> {
  // Check if intent artifact already exists
  const existing = await prisma.intentArtifact.findFirst({
    where: {
      workspaceId,
      prNumber: prData.number,
      repoFullName: prData.repoFullName,
    },
  });
  
  if (existing) {
    return existing;
  }
  
  // Ingest new intent artifact
  const result = await ingestIntentArtifactFromPR(workspaceId, prData);
  return result.intentArtifact;
}

