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
  let repoTypeSource: 'explicit' | 'inferred' = 'inferred';
  const repoTypeEvidence: string[] = [];

  if (hasMonorepoMarkers || hasMultipleServices) {
    repoType = 'monorepo';
    repoTypeSource = hasMonorepoMarkers ? 'explicit' : 'inferred';
    const marker = hasMonorepoMarkers ? 'pnpm-workspace.yaml/lerna.json/nx.json' : 'multiple service directories';
    evidence.push(`Monorepo markers detected (${marker})`);
    repoTypeEvidence.push(`Found ${marker}`);
  } else if (hasTerraform && !hasDockerfile) {
    repoType = 'infra';
    repoTypeSource = 'inferred';
    evidence.push('Infrastructure repo (Terraform files, no Dockerfile)');
    repoTypeEvidence.push('Terraform files present', 'No Dockerfile found');
  } else if (hasServiceYaml) {
    repoType = 'service';
    repoTypeSource = 'explicit';
    const catalogFile = files.find(f => f.filename.match(/service\.yaml$|catalog-info\.yaml$|backstage\.yaml$/i))?.filename;
    evidence.push(`Service repo (explicit service catalog: ${catalogFile})`);
    repoTypeEvidence.push(`Service catalog found: ${catalogFile}`);
  } else if (hasDockerfile || hasK8s) {
    repoType = 'service';
    repoTypeSource = 'inferred';
    const marker = hasDockerfile ? 'Dockerfile' : 'K8s manifests';
    evidence.push(`Service repo (${marker})`);
    repoTypeEvidence.push(`${marker} detected`);
  } else if (hasPackageJson) {
    // Check if it's a library (has index.ts but no src/main.ts or src/server.ts)
    const hasLibraryStructure = files.some(f => f.filename.match(/^(index\.ts|index\.js|src\/index\.(ts|js))$/)) &&
                                !files.some(f => f.filename.match(/src\/(main|server|app)\.(ts|js)$/));
    if (hasLibraryStructure) {
      repoType = 'library';
      repoTypeSource = 'inferred';
      evidence.push('Library structure (index.ts, no main/server entry point)');
      repoTypeEvidence.push('index.ts found', 'No main/server entry point');
    } else {
      repoType = 'service';
      repoTypeSource = 'inferred';
      evidence.push('Service structure (package.json with main/server entry point)');
      repoTypeEvidence.push('package.json with service entry point');
    }
  } else if (files.every(f => f.filename.match(/\.(md|txt|rst)$/i))) {
    repoType = 'docs';
    repoTypeSource = 'inferred';
    evidence.push('Documentation repo (only markdown/text files)');
    repoTypeEvidence.push('Only markdown/text files detected');
  }
  
  // Determine service tier (for services only)
  let serviceTier: RepoClassification['serviceTier'] = 'unknown';
  let tierSource: 'explicit' | 'inferred' | 'unknown' = 'unknown';
  const tierEvidence: string[] = [];

  if (repoType === 'service') {
    // Check for explicit tier declaration in service catalog
    const catalogFile = files.find(f => f.filename.match(/service\.yaml$|catalog-info\.yaml$|backstage\.yaml$/i));
    const hasTierAnnotation = catalogFile && catalogFile.patch?.includes('tier:');

    if (hasTierAnnotation) {
      // Explicit tier from service catalog
      tierSource = 'explicit';
      const tierMatch = catalogFile.patch?.match(/tier:\s*['"]?(tier-)?([123])['"]?/i);
      if (tierMatch) {
        const tierNum = tierMatch[2];
        serviceTier = `tier-${tierNum}` as RepoClassification['serviceTier'];
        evidence.push(`Tier-${tierNum} service (explicit from ${catalogFile.filename})`);
        tierEvidence.push(`Tier declared in ${catalogFile.filename}`);
      }
    } else if (hasSLO) {
      // Inferred tier-1 from SLO
      serviceTier = 'tier-1';
      tierSource = 'inferred';
      const sloFile = files.find(f => f.filename.match(/slo\.yaml$|sli\.yaml$/i))?.filename;
      // CRITICAL FIX: Show exact heuristic, not just "implies"
      evidence.push(`Tier-1 service (inferred from SLO: ${sloFile})`);
      tierEvidence.push(`SLO file found: ${sloFile}`, 'Heuristic: SLO presence → likely tier-1 (overridable by catalog)');
    } else if (hasRunbook && hasHighAvailability) {
      // Inferred tier-1 from runbook + HA
      serviceTier = 'tier-1';
      tierSource = 'inferred';
      evidence.push('Tier-1 service (inferred from runbook + HA config)');
      tierEvidence.push('Runbook + HA config implies tier-1');
    } else if (hasRunbook || hasServiceYaml) {
      // Inferred tier-2
      serviceTier = 'tier-2';
      tierSource = 'inferred';
      const marker = hasRunbook ? 'runbook' : 'service catalog';
      evidence.push(`Tier-2 service (inferred from ${marker})`);
      tierEvidence.push(`${marker} present, no tier-1 markers`);
    } else {
      // Inferred tier-3
      serviceTier = 'tier-3';
      tierSource = 'inferred';
      evidence.push('Tier-3 service (inferred: no tier-1/tier-2 markers)');
      tierEvidence.push('No SLO, runbook, or service catalog found');
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

  // Compute confidence (legacy)
  const confidence = evidence.length > 0 ? Math.min(0.9, 0.5 + (evidence.length * 0.1)) : 0.3;

  // CRITICAL FIX: Detailed confidence breakdown
  const repoTypeConfidence = repoTypeSource === 'explicit' ? 0.95 :
                             repoTypeEvidence.length >= 2 ? 0.8 : 0.6;

  const tierConfidence = tierSource === 'explicit' ? 0.95 :
                         tierSource === 'inferred' ? 0.7 : 0.3;

  return {
    repoType,
    serviceTier,
    hasDeployment,
    hasDatabase,
    primaryLanguages,
    confidence,
    evidence,
    metadata,
    confidenceBreakdown: {
      repoTypeConfidence,
      repoTypeSource,
      repoTypeEvidence,
      tierConfidence,
      tierSource,
      tierEvidence,
    },
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

