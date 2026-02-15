/**
 * Contract Validation Service
 * 
 * Orchestrates the contract validation flow for Track 1:
 * 1. Resolve applicable contracts
 * 2. Fetch artifact snapshots
 * 3. Run comparators
 * 4. Generate IntegrityFindings
 * 5. Calculate risk tier
 * 
 * This is the main entry point for PR-blocking contract validation.
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractResolver } from './contractResolver.js';
import { getComparatorRegistry } from './comparators/registry.js';
// Import comparators to trigger auto-registration
import './comparators/openapi.js';
import './comparators/terraform.js';
import './comparators/docsRequiredSections.js';
import './comparators/docsAnchorCheck.js';
import './comparators/obligationFilePresent.js';
import './comparators/obligationFileChanged.js';
// Tier 1 comparators
import './comparators/openapiValidate.js';
import './comparators/openapiDiff.js';
import './comparators/openapiVersionBump.js';
import { createFindings, calculateRiskTier } from './findingRepository.js';
import { classifySurfaceAreas } from '../contractGate/surfaceClassifier.js';
import { resolveContractPacks } from './contractPackResolver.js';
import { runObligationChecks } from './obligationChecker.js';
import { ArtifactFetcher } from './artifactFetcher.js';
import { prisma } from '../../lib/db.js';
import type { IntegrityFinding, Contract, Invariant, ArtifactSnapshot } from './types.js';

// ======================================================================
// TYPES
// ======================================================================

export interface ContractValidationInput {
  workspaceId: string;
  signalEventId: string;
  changedFiles: Array<{ filename: string; status: string }>;
  service?: string;
  repo?: string;
}

export interface ContractValidationResult {
  band: 'pass' | 'warn' | 'fail';
  findings: IntegrityFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalCount: number;
  contractsChecked: number;
  duration: number; // milliseconds
  surfacesTouched: string[]; // Added for GitHub Check display
  policyMode?: string; // Added for policy enforcement display
}

// ======================================================================
// MAIN VALIDATION FUNCTION
// ======================================================================

/**
 * Run contract validation for a PR
 * 
 * This is the main entry point for Track 1 contract validation.
 * It orchestrates the entire flow from contract resolution to findings generation.
 */
export async function runContractValidation(
  input: ContractValidationInput
): Promise<ContractValidationResult> {
  const startTime = Date.now();

  console.log(`[ContractValidation] Starting validation for signal ${input.signalEventId}`);
  console.log(`[ContractValidation] Changed files: ${input.changedFiles.length}`);

  // Step 0: Fetch active ContractPolicy (if exists)
  let policy: { mode: string; criticalThreshold: number; highThreshold: number; mediumThreshold: number } | null = null;
  try {
    const activePolicy = await prisma.contractPolicy.findFirst({
      where: {
        workspaceId: input.workspaceId,
        active: true,
      },
      select: {
        mode: true,
        criticalThreshold: true,
        highThreshold: true,
        mediumThreshold: true,
      },
      orderBy: {
        createdAt: 'desc', // Use most recent if multiple active policies
      },
    });

    if (activePolicy) {
      policy = activePolicy;
      console.log(`[ContractValidation] Using ContractPolicy: mode=${policy.mode}`);
    } else {
      console.log(`[ContractValidation] No active ContractPolicy found, using default behavior`);
    }
  } catch (error: any) {
    console.warn(`[ContractValidation] Failed to fetch ContractPolicy (soft-fail):`, error.message);
    // Continue without policy (graceful degradation)
  }

  // Step 1: Classify surfaces
  const surfaceClassification = classifySurfaceAreas(input.changedFiles);
  console.log(`[ContractValidation] Surfaces detected: ${surfaceClassification.surfaces.join(', ') || 'none'}`);
  console.log(`[ContractValidation] Surface confidence: ${(surfaceClassification.confidence * 100).toFixed(0)}%`);

  // Early exit if no contract surfaces touched
  if (surfaceClassification.surfaces.length === 0) {
    console.log(`[ContractValidation] No contract surfaces touched - returning PASS`);
    const duration = Date.now() - startTime;
    return {
      band: 'pass',
      findings: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalCount: 0,
      contractsChecked: 0,
      duration,
      surfacesTouched: [],
    };
  }

  // Step 2: Resolve applicable ContractPacks from database
  const contractPackResolution = await resolveContractPacks(
    input.workspaceId,
    surfaceClassification.surfaces,
    input.changedFiles
  );

  console.log(`[ContractValidation] Resolved ${contractPackResolution.contracts.length} contracts from ${contractPackResolution.packIds.length} packs`);
  console.log(`[ContractValidation] Resolution reasons: ${contractPackResolution.resolutionReasons.join('; ')}`);

  // Early exit if no contracts resolved
  if (contractPackResolution.contracts.length === 0) {
    console.log(`[ContractValidation] No contracts resolved - returning PASS`);
    const duration = Date.now() - startTime;
    return {
      band: 'pass',
      findings: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalCount: 0,
      contractsChecked: 0,
      duration,
      surfacesTouched: surfaceClassification.surfaces,
    };
  }

  const contracts = contractPackResolution.contracts;

  // Step 3: Run obligation checks (deterministic policy gates)
  const obligationResult = await runObligationChecks({
    workspaceId: input.workspaceId,
    signalEventId: input.signalEventId,
    surfacesTouched: surfaceClassification.surfaces,
    changedFiles: input.changedFiles,
    contracts,
  });

  console.log(`[ContractValidation] Obligation checks: ${obligationResult.obligationsChecked} checked, ${obligationResult.obligationsFailed} failed`);

  const allFindings: IntegrityFinding[] = [...obligationResult.findings];

  // Step 4: Fetch artifact snapshots (with soft-fail)
  const allSnapshots: ArtifactSnapshot[] = [];
  const fetcher = new ArtifactFetcher(input.workspaceId);

  for (const contract of contracts) {
    try {
      console.log(`[ContractValidation] Fetching artifacts for contract ${contract.contractId}`);

      // Fetch with timeout (5 seconds per contract)
      const snapshots = await Promise.race([
        fetcher.fetchContractArtifacts(
          contract.contractId,
          contract.artifacts,
          {
            signalEventId: input.signalEventId,
          }
        ),
        createTimeout(5000, 'Artifact fetching timeout'),
      ]);

      allSnapshots.push(...snapshots);
      console.log(`[ContractValidation] Fetched ${snapshots.length} snapshots for contract ${contract.contractId}`);
    } catch (error: any) {
      console.warn(`[ContractValidation] Artifact fetching failed for contract ${contract.contractId} (soft-fail):`, error.message);
      // Continue with next contract (soft-fail)
    }
  }

  console.log(`[ContractValidation] Total snapshots fetched: ${allSnapshots.length}`);

  // Step 5: Run comparators (with soft-fail)
  for (const contract of contracts) {
    for (const invariant of contract.invariants) {
      try {
        console.log(`[ContractValidation] Running comparator for invariant ${invariant.invariantId}`);

        // Get snapshots for this contract
        const contractSnapshots = allSnapshots.filter(s => s.contractId === contract.contractId);

        if (contractSnapshots.length < 2) {
          console.log(`[ContractValidation] Not enough snapshots for comparison (need 2, got ${contractSnapshots.length}) - skipping`);
          continue;
        }

        // Run comparator with timeout (5 seconds per invariant)
        const findings = await Promise.race([
          runComparator(invariant, contractSnapshots, {
            workspaceId: input.workspaceId,
            contractId: contract.contractId,
            service: input.service,
            repo: input.repo,
            signalEventId: input.signalEventId,
          }),
          createTimeout(5000, 'Comparator timeout'),
        ]);

        allFindings.push(...findings);
        console.log(`[ContractValidation] Comparator found ${findings.length} findings`);
      } catch (error: any) {
        console.warn(`[ContractValidation] Comparator failed for invariant ${invariant.invariantId} (soft-fail):`, error.message);
        // Continue with next invariant (soft-fail)
      }
    }
  }

  console.log(`[ContractValidation] Total findings: ${allFindings.length} (${obligationResult.findings.length} from obligations, ${allFindings.length - obligationResult.findings.length} from comparators)`);

  // Step 6: Persist findings to database
  if (allFindings.length > 0) {
    await createFindings(allFindings);
    console.log(`[ContractValidation] Persisted ${allFindings.length} findings`);
  }

  // Step 7: Calculate risk tier (with policy enforcement)
  const riskTier = calculateRiskTier(allFindings, policy);

  const duration = Date.now() - startTime;
  console.log(`[ContractValidation] Completed in ${duration}ms - Band: ${riskTier.band}${policy ? ` (mode: ${policy.mode})` : ''}`);

  return {
    ...riskTier,
    findings: allFindings,
    contractsChecked: contracts.length,
    duration,
    surfacesTouched: surfaceClassification.surfaces,
    policyMode: policy?.mode,
  };
}

// ======================================================================
// HELPER FUNCTIONS
// ======================================================================

/**
 * Create a timeout promise that rejects after the specified duration
 */
function createTimeout<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Run a single comparator for a contract invariant
 * Uses the comparator registry to find the appropriate comparator
 */
async function runComparator(
  invariant: Invariant,
  snapshots: ArtifactSnapshot[],
  context: {
    workspaceId: string;
    contractId: string;
    service?: string;
    repo?: string;
    signalEventId: string;
  }
): Promise<IntegrityFinding[]> {
  const registry = getComparatorRegistry();

  // Use registry to find a comparator that can handle this invariant
  const comparator = registry.canHandle(invariant, snapshots);

  if (!comparator) {
    console.warn(`[ContractValidation] No comparator found for type: ${invariant.comparatorType}`);
    return [];
  }

  if (snapshots.length < 2) {
    console.warn(`[ContractValidation] Not enough snapshots to compare (need 2, got ${snapshots.length})`);
    return [];
  }

  const result = await comparator.compare({
    invariant,
    leftSnapshot: snapshots[0]!,
    rightSnapshot: snapshots[1]!,
    context,
  });

  return result.findings;
}

