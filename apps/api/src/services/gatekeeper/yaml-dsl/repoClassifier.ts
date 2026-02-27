/**
 * Repo Classifier
 * 
 * Deterministic repository classification based on file structure analysis.
 * Used to determine obligation applicability and provide contextualized guidance.
 * 
 * Key principles:
 * - 100% deterministic (no LLM, no probabilistic models)
 * - File pattern-based classification
 * - Explicit evidence chains
 * - Cacheable results
 */

import type { GitHubFile } from './comparators/types.js';

export interface RepoClassification {
  /** Type of repository */
  repoType: 'service' | 'library' | 'infra' | 'monorepo' | 'docs' | 'unknown';
  
  /** Service tier (for services only) */
  serviceTier: 'tier-1' | 'tier-2' | 'tier-3' | 'unknown';
  
  /** Has deployment configuration */
  hasDeployment: boolean;
  
  /** Has database */
  hasDatabase: boolean;
  
  /** Primary programming languages */
  primaryLanguages: string[];
  
  /** Confidence in classification (0-1) */
  confidence: number;
  
  /** Evidence that led to this classification */
  evidence: string[];
  
  /** Additional metadata */
  metadata: {
    hasDockerfile?: boolean;
    hasK8s?: boolean;
    hasTerraform?: boolean;
    hasServiceCatalog?: boolean;
    hasSLO?: boolean;
    hasRunbook?: boolean;
    hasMonorepoMarkers?: boolean;
  };
}

/**
 * Classify a repository based on its file structure
 * This is deterministic and cacheable
 */
export function classifyRepo(files: GitHubFile[], repoName: string): RepoClassification {
  const evidence: string[] = [];
  const metadata: RepoClassification['metadata'] = {};
  
  // Detect file markers
  const hasDockerfile = files.some(f => f.filename.match(/^Dockerfile$|^\.dockerfile$/i));
  const hasK8s = files.some(f => f.filename.match(/k8s\/|kubernetes\/|helm\/|\.k8s\.yaml$/i));
  const hasTerraform = files.some(f => f.filename.match(/\.tf$|terraform\//i));
  const hasPackageJson = files.some(f => f.filename === 'package.json');
  const hasServiceYaml = files.some(f => f.filename.match(/service\.yaml$|catalog-info\.yaml$|backstage\.yaml$/i));
  const hasSLO = files.some(f => f.filename.match(/slo\.yaml$|sli\.yaml$|slo\//i));
  const hasRunbook = files.some(f => f.filename.match(/runbook\.md$|runbook\//i));
  const hasHighAvailability = files.some(f => f.filename.match(/ha\.yaml$|high-availability/i));
  const hasMonorepoMarkers = files.some(f => f.filename.match(/^(pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json)$/));
  const hasMultipleServices = files.filter(f => f.filename.match(/^(apps|services|packages)\/[^/]+\/(package\.json|Dockerfile)$/)).length > 1;
  
  metadata.hasDockerfile = hasDockerfile;
  metadata.hasK8s = hasK8s;
  metadata.hasTerraform = hasTerraform;
  metadata.hasServiceCatalog = hasServiceYaml;
  metadata.hasSLO = hasSLO;
  metadata.hasRunbook = hasRunbook;
  metadata.hasMonorepoMarkers = hasMonorepoMarkers;
  
  // Determine repo type
  let repoType: RepoClassification['repoType'] = 'unknown';
  
  if (hasMonorepoMarkers || hasMultipleServices) {
    repoType = 'monorepo';
    evidence.push('Monorepo markers detected (pnpm-workspace.yaml, multiple services)');
  } else if (hasTerraform && !hasDockerfile) {
    repoType = 'infra';
    evidence.push('Infrastructure repo (Terraform files, no Dockerfile)');
  } else if (hasDockerfile || hasK8s || hasServiceYaml) {
    repoType = 'service';
    evidence.push('Service repo (Dockerfile, K8s manifests, or service catalog)');
  } else if (hasPackageJson) {
    // Check if it's a library (has index.ts but no src/main.ts or src/server.ts)
    const hasLibraryStructure = files.some(f => f.filename.match(/^(index\.ts|index\.js|src\/index\.(ts|js))$/)) &&
                                !files.some(f => f.filename.match(/src\/(main|server|app)\.(ts|js)$/));
    if (hasLibraryStructure) {
      repoType = 'library';
      evidence.push('Library structure (index.ts, no main/server entry point)');
    } else {
      repoType = 'service';
      evidence.push('Service structure (package.json with main/server entry point)');
    }
  } else if (files.every(f => f.filename.match(/\.(md|txt|rst)$/i))) {
    repoType = 'docs';
    evidence.push('Documentation repo (only markdown/text files)');
  }
  
  // Determine service tier (for services only)
  let serviceTier: RepoClassification['serviceTier'] = 'unknown';
  
  if (repoType === 'service') {
    if (hasSLO || (hasRunbook && hasHighAvailability)) {
      serviceTier = 'tier-1';
      evidence.push('Tier-1 service (has SLO, runbook, or HA config)');
    } else if (hasRunbook || hasServiceYaml) {
      serviceTier = 'tier-2';
      evidence.push('Tier-2 service (has runbook or service catalog)');
    } else {
      serviceTier = 'tier-3';
      evidence.push('Tier-3 service (no tier-1/tier-2 markers)');
    }
  }
  
  // Detect deployment and database
  const hasDeployment = hasDockerfile || hasK8s || hasTerraform;
  const hasDatabase = files.some(f => f.filename.match(/migrations\/|schema\.prisma$|\.sql$|db\/schema/i));
  
  if (hasDatabase) {
    evidence.push('Has database (migrations, schema files)');
  }
  
  // Detect primary languages
  const primaryLanguages = detectLanguages(files);
  
  // Compute confidence
  const confidence = evidence.length > 0 ? Math.min(0.9, 0.5 + (evidence.length * 0.1)) : 0.3;
  
  return {
    repoType,
    serviceTier,
    hasDeployment,
    hasDatabase,
    primaryLanguages,
    confidence,
    evidence,
    metadata,
  };
}

/**
 * Detect primary programming languages from file extensions
 */
function detectLanguages(files: GitHubFile[]): string[] {
  const langMap = new Map<string, number>();
  
  const extToLang: Record<string, string> = {
    'ts': 'TypeScript',
    'js': 'JavaScript',
    'py': 'Python',
    'go': 'Go',
    'java': 'Java',
    'rb': 'Ruby',
    'rs': 'Rust',
    'tf': 'Terraform',
    'yaml': 'YAML',
    'yml': 'YAML',
  };
  
  for (const file of files) {
    const ext = file.filename.split('.').pop()?.toLowerCase();
    if (ext && extToLang[ext]) {
      const lang = extToLang[ext];
      langMap.set(lang, (langMap.get(lang) || 0) + 1);
    }
  }
  
  return Array.from(langMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang]) => lang);
}

