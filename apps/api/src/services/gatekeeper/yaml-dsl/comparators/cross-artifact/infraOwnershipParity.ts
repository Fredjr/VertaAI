/**
 * INFRA_OWNERSHIP_PARITY Comparator (Build→Run)
 *
 * Validates that infrastructure resources have ownership metadata and that
 * it matches authoritative sources (PagerDuty, CODEOWNERS, service catalog).
 *
 * INVARIANT: All infrastructure must have declared ownership
 *
 * EXAMPLES:
 * - New Terraform resource → must have owner tag
 * - Kubernetes deployment → must have owner label
 * - CloudFormation stack → must have owner parameter
 * - Orphaned resource → ownership tag missing or invalid
 *
 * DETECTION LOGIC:
 * - Extract ownership metadata from IaC files (tags, labels, annotations)
 * - Resolve authoritative owner from workspace config
 * - Compare declared owner vs authoritative owner
 * - Flag missing ownership, mismatched ownership, orphaned resources
 *
 * BUILD→RUN VERIFICATION:
 * - Build: What ownership is declared in IaC
 * - Run: What ownership is in authoritative sources
 * - Drift: Declared owner ≠ Authoritative owner
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';
import { resolveOwner } from '../../../../ownership/resolver.js';

/**
 * Parameters for INFRA_OWNERSHIP_PARITY comparator
 */
export interface InfraOwnershipParityParams {
  /** Require ownership for all infrastructure changes (default: true) */
  requireOwnership?: boolean;
  /** Minimum confidence threshold for ownership resolution (default: 0.7) */
  minConfidence?: number;
  /** Allow orphaned resources (default: false) */
  allowOrphaned?: boolean;
}

/**
 * Ownership metadata extracted from IaC files
 */
interface OwnershipMetadata {
  file: string;
  resourceType: string;
  resourceName: string;
  declaredOwner: string | null;
  ownershipSource: 'tag' | 'label' | 'annotation' | 'parameter' | 'comment' | 'none';
  lineNumber?: number;
}

/**
 * Ownership violation detected
 */
interface OwnershipViolation {
  type: 'missing' | 'mismatch' | 'orphaned' | 'low_confidence';
  file: string;
  resourceType: string;
  resourceName: string;
  declaredOwner: string | null;
  authoritativeOwner: string | null;
  confidence: number;
  message: string;
}

export const infraOwnershipParityComparator: Comparator = {
  id: ComparatorId.INFRA_OWNERSHIP_PARITY,
  version: '1.0.0',

  async evaluate(context: PRContext, params: InfraOwnershipParityParams): Promise<any> {
    const { files, workspaceId, owner, repo } = context;
    const requireOwnership = params.requireOwnership ?? true;
    const minConfidence = params.minConfidence ?? 0.7;
    const allowOrphaned = params.allowOrphaned ?? false;

    // Step 1: Filter IaC files
    const iacFiles = files.filter(f =>
      f.filename.endsWith('.tf') ||
      f.filename.endsWith('.tfvars') ||
      f.filename.endsWith('.yaml') ||
      f.filename.endsWith('.yml') ||
      f.filename.includes('terraform/') ||
      f.filename.includes('infrastructure/') ||
      f.filename.includes('k8s/') ||
      f.filename.includes('cloudformation/')
    );

    if (iacFiles.length === 0) {
      // No IaC files changed - skip this comparator
      return {
        comparatorId: ComparatorId.INFRA_OWNERSHIP_PARITY,
        status: 'unknown',
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No infrastructure files changed in this PR',
        evidence: [],
      };
    }

    // Step 2: Extract ownership metadata from IaC files
    const ownershipMetadata: OwnershipMetadata[] = [];
    for (const file of iacFiles) {
      const metadata = await extractOwnershipFromIaC(file.filename, file.patch || '');
      ownershipMetadata.push(...metadata);
    }

    if (ownershipMetadata.length === 0) {
      // No resources found in IaC files
      return {
        comparatorId: ComparatorId.INFRA_OWNERSHIP_PARITY,
        status: 'unknown',
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No infrastructure resources found in changed files',
        evidence: [],
      };
    }

    // Step 3: Resolve authoritative owner from workspace config
    const repoFullName = `${owner}/${repo}`;
    const ownerResolution = await resolveOwner(workspaceId, null, repoFullName);

    // Step 4: Compare declared ownership vs authoritative ownership
    const violations: OwnershipViolation[] = [];

    for (const metadata of ownershipMetadata) {
      // Check if ownership is declared
      if (!metadata.declaredOwner) {
        if (requireOwnership) {
          violations.push({
            type: 'missing',
            file: metadata.file,
            resourceType: metadata.resourceType,
            resourceName: metadata.resourceName,
            declaredOwner: null,
            authoritativeOwner: ownerResolution.primary?.ref || null,
            confidence: 100,
            message: `Resource ${metadata.resourceName} has no ownership metadata`,
          });
        }
        continue;
      }

      // Check if declared owner matches authoritative owner
      const authoritativeOwner = ownerResolution.primary?.ref;
      if (authoritativeOwner && metadata.declaredOwner !== authoritativeOwner) {
        violations.push({
          type: 'mismatch',
          file: metadata.file,
          resourceType: metadata.resourceType,
          resourceName: metadata.resourceName,
          declaredOwner: metadata.declaredOwner,
          authoritativeOwner,
          confidence: 85,
          message: `Resource ${metadata.resourceName} owner "${metadata.declaredOwner}" does not match authoritative owner "${authoritativeOwner}"`,
        });
      }
    }

    // Step 5: Build result
    if (violations.length === 0) {
      // PASS: All resources have valid ownership
      return {
        comparatorId: ComparatorId.INFRA_OWNERSHIP_PARITY,
        status: 'pass',
        reasonCode: FindingCode.INFRA_OWNERSHIP_CONSISTENT,
        message: CrossArtifactMessages.infraOwnershipConsistent(),
        evidence: ownershipMetadata.map(m => ({
          type: 'ownership_metadata' as const,
          value: `${m.resourceType}.${m.resourceName}`,
          path: m.file,
          snippet: `Owner: ${m.declaredOwner} (${m.ownershipSource})`,
          confidence: 90,
        })),
      };
    }

    // FAIL: Ownership violations detected
    const evidence: EvidenceItem[] = violations.map(v => ({
      type: 'ownership_violation' as const,
      value: v.type,
      path: v.file,
      snippet: v.message,
      confidence: v.confidence,
    }));

    // Determine primary finding code
    const hasMissing = violations.some(v => v.type === 'missing');
    const hasMismatch = violations.some(v => v.type === 'mismatch');

    let reasonCode: FindingCode;
    let message: string;
    let remediation: string;

    if (hasMissing) {
      const missingResources = violations
        .filter(v => v.type === 'missing')
        .map(v => `${v.resourceType}.${v.resourceName}`)
        .join(', ');

      reasonCode = FindingCode.INFRA_OWNERSHIP_MISSING;
      message = CrossArtifactMessages.infraOwnershipMissing(missingResources);
      remediation = RemediationMessages.agentGovernance.addInfraOwnership(missingResources);
    } else if (hasMismatch) {
      const mismatchResources = violations
        .filter(v => v.type === 'mismatch')
        .map(v => `${v.resourceType}.${v.resourceName}`)
        .join(', ');
      const expected = violations.find(v => v.type === 'mismatch')?.authoritativeOwner || 'unknown';
      const actual = violations.find(v => v.type === 'mismatch')?.declaredOwner || 'unknown';

      reasonCode = FindingCode.INFRA_OWNERSHIP_MISMATCH;
      message = CrossArtifactMessages.infraOwnershipMismatch(mismatchResources, expected, actual);
      remediation = RemediationMessages.agentGovernance.fixInfraOwnership(mismatchResources);
    } else {
      reasonCode = FindingCode.INFRA_OWNERSHIP_MISSING;
      message = 'Infrastructure ownership violations detected';
      remediation = RemediationMessages.agentGovernance.addInfraOwnership('resources');
    }

    return {
      comparatorId: ComparatorId.INFRA_OWNERSHIP_PARITY,
      status: 'fail',
      reasonCode,
      message,
      evidence,
      remediation,
    };
  },
};

/**
 * Extract ownership metadata from IaC file content
 */
async function extractOwnershipFromIaC(
  filename: string,
  patch: string
): Promise<OwnershipMetadata[]> {
  const metadata: OwnershipMetadata[] = [];

  // Determine file type
  if (filename.endsWith('.tf')) {
    // Terraform file
    metadata.push(...extractTerraformOwnership(filename, patch));
  } else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
    // Kubernetes or CloudFormation YAML
    metadata.push(...extractKubernetesOwnership(filename, patch));
  }

  return metadata;
}

/**
 * Extract ownership from Terraform files
 */
function extractTerraformOwnership(filename: string, patch: string): OwnershipMetadata[] {
  const metadata: OwnershipMetadata[] = [];
  const lines = patch.split('\n');

  let currentResource: { type: string; name: string } | null = null;
  let currentOwner: string | null = null;
  let ownershipSource: OwnershipMetadata['ownershipSource'] = 'none';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match resource declaration: resource "aws_instance" "web" {
    const resourceMatch = line.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
    if (resourceMatch) {
      // Save previous resource if exists
      if (currentResource) {
        metadata.push({
          file: filename,
          resourceType: currentResource.type,
          resourceName: currentResource.name,
          declaredOwner: currentOwner,
          ownershipSource,
          lineNumber: i,
        });
      }

      // Start new resource
      currentResource = { type: resourceMatch[1], name: resourceMatch[2] };
      currentOwner = null;
      ownershipSource = 'none';
    }

    // Match owner tag: owner = "platform-team"
    const ownerTagMatch = line.match(/owner\s*=\s*"([^"]+)"/);
    if (ownerTagMatch && currentResource) {
      currentOwner = ownerTagMatch[1];
      ownershipSource = 'tag';
    }

    // Match tags block with Owner key
    const tagsOwnerMatch = line.match(/Owner\s*=\s*"([^"]+)"/);
    if (tagsOwnerMatch && currentResource) {
      currentOwner = tagsOwnerMatch[1];
      ownershipSource = 'tag';
    }
  }

  // Save last resource
  if (currentResource) {
    metadata.push({
      file: filename,
      resourceType: currentResource.type,
      resourceName: currentResource.name,
      declaredOwner: currentOwner,
      ownershipSource,
    });
  }

  return metadata;
}

/**
 * Extract ownership from Kubernetes YAML files
 */
function extractKubernetesOwnership(filename: string, patch: string): OwnershipMetadata[] {
  const metadata: OwnershipMetadata[] = [];
  const lines = patch.split('\n');

  let currentResource: { type: string; name: string } | null = null;
  let currentOwner: string | null = null;
  let ownershipSource: OwnershipMetadata['ownershipSource'] = 'none';
  let inMetadata = false;
  let inLabels = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match kind: Deployment
    const kindMatch = line.match(/kind:\s*(\w+)/);
    if (kindMatch) {
      // Save previous resource if exists
      if (currentResource) {
        metadata.push({
          file: filename,
          resourceType: currentResource.type,
          resourceName: currentResource.name,
          declaredOwner: currentOwner,
          ownershipSource,
          lineNumber: i,
        });
      }

      // Start new resource
      currentResource = { type: kindMatch[1], name: '' };
      currentOwner = null;
      ownershipSource = 'none';
      inMetadata = false;
      inLabels = false;
    }

    // Match name in metadata
    if (line.match(/^metadata:/)) {
      inMetadata = true;
    }

    if (inMetadata && line.match(/^\s+name:\s*(.+)/)) {
      const nameMatch = line.match(/name:\s*(.+)/);
      if (nameMatch && currentResource) {
        currentResource.name = nameMatch[1].trim();
      }
    }

    // Match labels section
    if (line.match(/^\s+labels:/)) {
      inLabels = true;
    }

    // Match owner label
    if (inLabels && line.match(/owner:\s*(.+)/)) {
      const ownerMatch = line.match(/owner:\s*(.+)/);
      if (ownerMatch && currentResource) {
        currentOwner = ownerMatch[1].trim();
        ownershipSource = 'label';
      }
    }

    // Match team label
    if (inLabels && line.match(/team:\s*(.+)/)) {
      const teamMatch = line.match(/team:\s*(.+)/);
      if (teamMatch && currentResource && !currentOwner) {
        currentOwner = teamMatch[1].trim();
        ownershipSource = 'label';
      }
    }
  }

  // Save last resource
  if (currentResource && currentResource.name) {
    metadata.push({
      file: filename,
      resourceType: currentResource.type,
      resourceName: currentResource.name,
      declaredOwner: currentOwner,
      ownershipSource,
    });
  }

  return metadata;
}


