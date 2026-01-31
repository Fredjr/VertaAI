/**
 * Infrastructure as Code (IaC) Parser
 * 
 * Parses Terraform and Pulumi changes from PR diffs to detect environment drift.
 * Extracts resource changes, variable modifications, and infrastructure updates.
 * 
 * Phase 5 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 3.1
 */

// ============================================================================
// Types
// ============================================================================

export interface IaCChange {
  type: 'terraform' | 'pulumi' | 'cloudformation';
  filePath: string;
  resourceType?: string;
  resourceName?: string;
  changeType: 'added' | 'modified' | 'deleted';
  oldValue?: string;
  newValue?: string;
  description: string;
}

export interface IaCAnalysisResult {
  hasIaCChanges: boolean;
  changes: IaCChange[];
  affectedServices: string[];
  driftTypeHints: string[];
  environmentDriftEvidence: string;
  keywords: string[];
}

// File patterns for IaC detection
const IAC_FILE_PATTERNS = {
  terraform: [/\.tf$/, /\.tfvars$/, /terraform\.tfstate/],
  pulumi: [/Pulumi\.(yaml|yml)$/, /Pulumi\.[^/]+\.(yaml|yml)$/, /__main__\.py$/, /index\.(ts|js)$/],
  cloudformation: [/template\.(yaml|yml|json)$/, /cloudformation\.(yaml|yml|json)$/],
};

// Resource patterns for Terraform
const TERRAFORM_RESOURCE_PATTERN = /resource\s+"([^"]+)"\s+"([^"]+)"/g;
const TERRAFORM_VARIABLE_PATTERN = /variable\s+"([^"]+)"/g;
const TERRAFORM_OUTPUT_PATTERN = /output\s+"([^"]+)"/g;
const TERRAFORM_MODULE_PATTERN = /module\s+"([^"]+)"/g;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Detect IaC file type from path
 */
export function detectIaCType(filePath: string): 'terraform' | 'pulumi' | 'cloudformation' | null {
  for (const [type, patterns] of Object.entries(IAC_FILE_PATTERNS)) {
    if (patterns.some(p => p.test(filePath))) {
      return type as 'terraform' | 'pulumi' | 'cloudformation';
    }
  }
  return null;
}

/**
 * Check if a file is an IaC file
 */
export function isIaCFile(filePath: string): boolean {
  return detectIaCType(filePath) !== null;
}

/**
 * Extract Terraform resources from content
 */
function extractTerraformResources(content: string): Array<{ type: string; name: string }> {
  const resources: Array<{ type: string; name: string }> = [];
  let match;

  const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"/g;
  while ((match = resourceRegex.exec(content)) !== null) {
    if (match[1] && match[2]) {
      resources.push({ type: match[1], name: match[2] });
    }
  }

  return resources;
}

/**
 * Extract service names from IaC content
 */
function extractServiceNames(content: string, filePath: string): string[] {
  const services: Set<string> = new Set();

  // Extract from file path (e.g., services/api/main.tf -> api)
  const pathMatch = filePath.match(/services?\/([^/]+)/);
  if (pathMatch && pathMatch[1]) services.add(pathMatch[1]);

  // Extract from Terraform resource names
  const resources = extractTerraformResources(content);
  for (const r of resources) {
    // Common patterns: aws_ecs_service.api, kubernetes_deployment.backend
    if (r.type.includes('service') || r.type.includes('deployment')) {
      services.add(r.name);
    }
  }

  // Extract from common variable names
  const serviceVarMatch = content.match(/service_name\s*=\s*"([^"]+)"/);
  if (serviceVarMatch && serviceVarMatch[1]) services.add(serviceVarMatch[1]);

  return [...services];
}

/**
 * Parse a diff hunk to extract IaC changes
 */
export function parseIaCDiff(
  filePath: string,
  diffContent: string
): IaCChange[] {
  const changes: IaCChange[] = [];
  const iacType = detectIaCType(filePath);
  
  if (!iacType) return changes;
  
  const lines = diffContent.split('\n');
  let currentResource: { type?: string; name?: string } | null = null;
  
  for (const line of lines) {
    // Track resource context
    const resourceMatch = line.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
    if (resourceMatch) {
      currentResource = { type: resourceMatch[1], name: resourceMatch[2] };
    }
    
    // Detect added lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.substring(1).trim();
      if (content && !content.startsWith('#')) {
        changes.push({
          type: iacType,
          filePath,
          resourceType: currentResource?.type,
          resourceName: currentResource?.name,
          changeType: 'added',
          newValue: content,
          description: `Added: ${content.substring(0, 100)}`,
        });
      }
    }
    
    // Detect removed lines
    if (line.startsWith('-') && !line.startsWith('---')) {
      const content = line.substring(1).trim();
      if (content && !content.startsWith('#')) {
        changes.push({
          type: iacType,
          filePath,
          resourceType: currentResource?.type,
          resourceName: currentResource?.name,
          changeType: 'deleted',
          oldValue: content,
          description: `Removed: ${content.substring(0, 100)}`,
        });
      }
    }
  }

  return changes;
}

/**
 * Analyze PR files for IaC changes
 */
export function analyzeIaCChanges(
  changedFiles: Array<{ filename: string; patch?: string; status?: string }>
): IaCAnalysisResult {
  const allChanges: IaCChange[] = [];
  const affectedServices: Set<string> = new Set();
  const keywords: Set<string> = new Set();

  for (const file of changedFiles) {
    if (!isIaCFile(file.filename)) continue;

    // Parse diff if available
    if (file.patch) {
      const changes = parseIaCDiff(file.filename, file.patch);
      allChanges.push(...changes);

      // Extract services from patch content
      const services = extractServiceNames(file.patch, file.filename);
      services.forEach(s => affectedServices.add(s));

      // Extract keywords
      const words = file.patch.toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
      words.forEach(w => keywords.add(w));
    } else {
      // File changed but no patch available
      allChanges.push({
        type: detectIaCType(file.filename) || 'terraform',
        filePath: file.filename,
        changeType: file.status === 'added' ? 'added' : file.status === 'removed' ? 'deleted' : 'modified',
        description: `IaC file ${file.status || 'modified'}: ${file.filename}`,
      });
    }
  }

  // Build drift evidence
  const driftTypeHints = allChanges.length > 0 ? ['environment_tooling'] : [];

  // Check for instruction drift hints (API gateway, load balancer changes)
  const hasApiChanges = allChanges.some(c =>
    c.resourceType?.includes('api_gateway') ||
    c.resourceType?.includes('load_balancer') ||
    c.resourceType?.includes('route') ||
    c.description.toLowerCase().includes('endpoint')
  );
  if (hasApiChanges) driftTypeHints.push('instruction');

  // Build evidence summary
  const resourceTypes = [...new Set(allChanges.map(c => c.resourceType).filter(Boolean))];
  const environmentDriftEvidence = allChanges.length > 0
    ? `Infrastructure changes detected: ${allChanges.length} modifications across ${resourceTypes.length} resource types (${resourceTypes.slice(0, 5).join(', ')}). Documentation may need updating for deployment procedures, environment variables, or infrastructure requirements.`
    : '';

  return {
    hasIaCChanges: allChanges.length > 0,
    changes: allChanges,
    affectedServices: [...affectedServices],
    driftTypeHints,
    environmentDriftEvidence,
    keywords: [...keywords].slice(0, 30),
  };
}

/**
 * Get IaC-specific keywords for drift detection
 */
export function getIaCKeywords(): string[] {
  return [
    'terraform', 'pulumi', 'cloudformation', 'infrastructure',
    'aws', 'gcp', 'azure', 'kubernetes', 'k8s', 'docker',
    'ecs', 'eks', 'lambda', 'ec2', 's3', 'rds', 'dynamodb',
    'vpc', 'subnet', 'security_group', 'iam', 'role', 'policy',
    'deployment', 'service', 'ingress', 'configmap', 'secret',
    'variable', 'output', 'module', 'provider', 'resource',
    'cpu', 'memory', 'replicas', 'scaling', 'autoscaling',
    'environment', 'env', 'config', 'configuration',
  ];
}

