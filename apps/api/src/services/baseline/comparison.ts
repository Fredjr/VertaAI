/**
 * Phase 1 Day 1 Task 1.3: Deterministic Drift Type Detection
 * 
 * Compares source artifacts against doc artifacts to detect drift deterministically.
 * This is the core comparison logic that works across all source types.
 */

import type {
  BaselineArtifacts,
  CompareArtifactsArgs,
  ComparisonResult,
  DriftDetectionResult,
  CoverageGapResult,
  TypedDelta,
} from './types.js';

/**
 * Compare source artifacts against doc artifacts to detect drift
 * This is deterministic - same input always produces same output
 */
export function compareArtifacts(args: CompareArtifactsArgs): ComparisonResult {
  const { sourceArtifacts, docArtifacts } = args;
  
  // Detect all drift types simultaneously
  const instructionDrift = detectInstructionDrift(sourceArtifacts, docArtifacts);
  const processDrift = detectProcessDrift(sourceArtifacts, docArtifacts);
  const ownershipDrift = detectOwnershipDrift(sourceArtifacts, docArtifacts);
  const environmentDrift = detectEnvironmentDrift(sourceArtifacts, docArtifacts);
  const coverageGaps = detectCoverageGaps(sourceArtifacts, docArtifacts);
  
  // Determine primary drift type (highest confidence)
  const driftTypes = [
    { type: 'instruction' as const, ...instructionDrift },
    { type: 'process' as const, ...processDrift },
    { type: 'ownership' as const, ...ownershipDrift },
    { type: 'environment' as const, ...environmentDrift },
  ].filter(d => d.hasDrift);
  
  // Sort by confidence and evidence count
  driftTypes.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.evidenceCount - a.evidenceCount;
  });
  
  const primaryDrift = driftTypes[0];

  // Determine recommendation based on drift type and coverage
  const recommendation = determineRecommendation(primaryDrift, coverageGaps);

  // Flatten typed deltas from all drift detectors for downstream consumers
  const allTypedDeltas: TypedDelta[] = [
    ...(instructionDrift.typedDeltas || []),
    ...(processDrift.typedDeltas || []),
    ...(ownershipDrift.typedDeltas || []),
    ...(environmentDrift.typedDeltas || []),
    ...(coverageGaps.typedDeltas || []),
  ];

  return {
    driftType: primaryDrift?.type || 'instruction',
    confidence: primaryDrift?.confidence || 0,
    hasDrift: driftTypes.length > 0,
    hasCoverageGap: coverageGaps.hasGap,
    allDriftTypes: driftTypes.map(d => d.type),
    conflicts: primaryDrift?.conflicts || [],
    newContent: primaryDrift?.newContent || [],
    coverageGaps: coverageGaps.gaps || [],
    typedDeltas: allTypedDeltas.length ? allTypedDeltas : undefined,
    recommendation,
    details: {
      instruction: instructionDrift,
      process: processDrift,
      ownership: ownershipDrift,
      environment: environmentDrift,
      coverage: coverageGaps,
    },
  };
}

/**
 * Detect instruction drift (commands, config, endpoints, tools)
 */
export function detectInstructionDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];
  const typedDeltas: TypedDelta[] = [];
  
  // Compare commands
  const docCommands = new Set((doc.commands || []).map(c => c.toLowerCase()));
  const sourceCommands = source.commands || [];
  for (const cmd of sourceCommands) {
    if (!docCommands.has(cmd.toLowerCase())) {
      newContent.push(`New command: ${cmd}`);
      typedDeltas.push({
        artifactType: 'command',
        action: 'missing_in_doc',
        sourceValue: cmd,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  // Compare config keys
  const docConfigKeys = new Set((doc.configKeys || []).map(k => k.toLowerCase()));
  const sourceConfigKeys = source.configKeys || [];
  for (const key of sourceConfigKeys) {
    if (!docConfigKeys.has(key.toLowerCase())) {
      newContent.push(`New config key: ${key}`);
      typedDeltas.push({
        artifactType: 'configKey',
        action: 'missing_in_doc',
        sourceValue: key,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  // Compare endpoints
  const docEndpoints = new Set((doc.endpoints || []).map(e => e.toLowerCase()));
  const sourceEndpoints = source.endpoints || [];
  for (const endpoint of sourceEndpoints) {
    if (!docEndpoints.has(endpoint.toLowerCase())) {
      newContent.push(`New endpoint: ${endpoint}`);
      typedDeltas.push({
        artifactType: 'endpoint',
        action: 'missing_in_doc',
        sourceValue: endpoint,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  // Compare tools
  const docTools = new Set((doc.tools || []).map(t => t.toLowerCase()));
  const sourceTools = source.tools || [];
  for (const tool of sourceTools) {
    if (!docTools.has(tool.toLowerCase())) {
      newContent.push(`New tool: ${tool}`);
      typedDeltas.push({
        artifactType: 'tool',
        action: 'missing_in_doc',
        sourceValue: tool,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 3 ? 0.9 : evidenceCount >= 1 ? 0.7 : 0.5;

  // Attach per-delta confidence so downstream consumers can
  // reason about individual changes without recomputing.
  if (typedDeltas.length > 0) {
    for (const delta of typedDeltas) {
      delta.confidence = confidence;
    }
  }
  
  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
    typedDeltas: typedDeltas.length ? typedDeltas : undefined,
  };
}

/**
 * Detect process drift (steps, decisions, sequences)
 */
export function detectProcessDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];
  const typedDeltas: TypedDelta[] = [];
  
  // Compare steps
  const docSteps = new Set((doc.steps || []).map(s => s.toLowerCase()));
  const sourceSteps = source.steps || [];
  for (const step of sourceSteps) {
    if (!docSteps.has(step.toLowerCase())) {
      newContent.push(`New step: ${step.substring(0, 100)}`);
      typedDeltas.push({
        artifactType: 'step',
        action: 'missing_in_doc',
        sourceValue: step,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  // Compare decisions
  const docDecisions = new Set((doc.decisions || []).map(d => d.toLowerCase()));
  const sourceDecisions = source.decisions || [];
  for (const decision of sourceDecisions) {
    if (!docDecisions.has(decision.toLowerCase())) {
      newContent.push(`New decision point: ${decision.substring(0, 100)}`);
      typedDeltas.push({
        artifactType: 'decision',
        action: 'missing_in_doc',
        sourceValue: decision,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 2 ? 0.85 : evidenceCount >= 1 ? 0.65 : 0.5;

  if (typedDeltas.length > 0) {
    for (const delta of typedDeltas) {
      delta.confidence = confidence;
    }
  }

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
    typedDeltas: typedDeltas.length ? typedDeltas : undefined,
  };
}

/**
 * Detect ownership drift (teams, owners, paths, channels)
 */
export function detectOwnershipDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];
  const typedDeltas: TypedDelta[] = [];

  // Compare teams
  const docTeams = new Set((doc.teams || []).filter(t => typeof t === 'string').map(t => t.toLowerCase()));
  const sourceTeams = (source.teams || []).filter(t => typeof t === 'string');
  for (const team of sourceTeams) {
    if (!docTeams.has(team.toLowerCase())) {
      newContent.push(`New team: ${team}`);
      typedDeltas.push({
        artifactType: 'team',
        action: 'missing_in_doc',
        sourceValue: team,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Compare owners
  const docOwners = new Set((doc.owners || []).filter(o => typeof o === 'string').map(o => o.toLowerCase()));
  const sourceOwners = (source.owners || []).filter(o => typeof o === 'string');
  for (const owner of sourceOwners) {
    if (!docOwners.has(owner.toLowerCase())) {
      newContent.push(`New owner: ${owner}`);
      typedDeltas.push({
        artifactType: 'owner',
        action: 'missing_in_doc',
        sourceValue: owner,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Compare paths
  const docPaths = new Set((doc.paths || []).filter(p => typeof p === 'string').map(p => p.toLowerCase()));
  const sourcePaths = (source.paths || []).filter(p => typeof p === 'string');
  for (const path of sourcePaths) {
    if (!docPaths.has(path.toLowerCase())) {
      newContent.push(`New path: ${path}`);
      typedDeltas.push({
        artifactType: 'path',
        action: 'missing_in_doc',
        sourceValue: path,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Compare channels
  const docChannels = new Set((doc.channels || []).filter(c => typeof c === 'string').map(c => c.toLowerCase()));
  const sourceChannels = (source.channels || []).filter(c => typeof c === 'string');
  for (const channel of sourceChannels) {
    if (!docChannels.has(channel.toLowerCase())) {
      newContent.push(`New channel: ${channel}`);
      typedDeltas.push({
        artifactType: 'channel',
        action: 'missing_in_doc',
        sourceValue: channel,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 2 ? 0.9 : evidenceCount >= 1 ? 0.7 : 0.5;

  if (typedDeltas.length > 0) {
    for (const delta of typedDeltas) {
      delta.confidence = confidence;
    }
  }

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
    typedDeltas: typedDeltas.length ? typedDeltas : undefined,
  };
}

/**
 * Detect environment drift (platforms, versions, dependencies)
 */
export function detectEnvironmentDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];
  const typedDeltas: TypedDelta[] = [];

  // Compare platforms
  const docPlatforms = new Set((doc.platforms || []).map(p => p.toLowerCase()));
  const sourcePlatforms = source.platforms || [];
  for (const platform of sourcePlatforms) {
    if (!docPlatforms.has(platform.toLowerCase())) {
      newContent.push(`New platform: ${platform}`);
      typedDeltas.push({
        artifactType: 'platform',
        action: 'missing_in_doc',
        sourceValue: platform,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Compare versions
  const docVersions = new Set((doc.versions || []).map(v => v.toLowerCase()));
  const sourceVersions = source.versions || [];
  for (const version of sourceVersions) {
    if (!docVersions.has(version.toLowerCase())) {
      newContent.push(`New version: ${version}`);
      typedDeltas.push({
        artifactType: 'version',
        action: 'missing_in_doc',
        sourceValue: version,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Compare dependencies
  const docDeps = new Set((doc.dependencies || []).map(d => d.toLowerCase()));
  const sourceDeps = source.dependencies || [];
  for (const dep of sourceDeps) {
    if (!docDeps.has(dep.toLowerCase())) {
      newContent.push(`New dependency: ${dep}`);
      typedDeltas.push({
        artifactType: 'dependency',
        action: 'missing_in_doc',
        sourceValue: dep,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 2 ? 0.85 : evidenceCount >= 1 ? 0.65 : 0.5;

  if (typedDeltas.length > 0) {
    for (const delta of typedDeltas) {
      delta.confidence = confidence;
    }
  }

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
    typedDeltas: typedDeltas.length ? typedDeltas : undefined,
  };
}

/**
 * Detect coverage gaps (new scenarios, features, errors)
 * This is orthogonal to drift type - can occur with any drift type
 */
export function detectCoverageGaps(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): CoverageGapResult {
  const gaps: string[] = [];
  const typedDeltas: TypedDelta[] = [];

  // Check for new scenarios
  const docScenarios = new Set((doc.scenarios || []).map(s => s.toLowerCase()));
  const sourceScenarios = source.scenarios || [];
  for (const scenario of sourceScenarios) {
    if (!docScenarios.has(scenario.toLowerCase())) {
      gaps.push(`New scenario: ${scenario.substring(0, 100)}`);
      typedDeltas.push({
        artifactType: 'scenario',
        action: 'missing_in_doc',
        sourceValue: scenario,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Check for new features
  const docFeatures = new Set((doc.features || []).map(f => f.toLowerCase()));
  const sourceFeatures = source.features || [];
  for (const feature of sourceFeatures) {
    if (!docFeatures.has(feature.toLowerCase())) {
      gaps.push(`New feature: ${feature.substring(0, 100)}`);
      typedDeltas.push({
        artifactType: 'feature',
        action: 'missing_in_doc',
        sourceValue: feature,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }

  // Check for new errors
  const docErrors = new Set((doc.errors || []).map(e => e.toLowerCase()));
  const sourceErrors = source.errors || [];
  for (const error of sourceErrors) {
    if (!docErrors.has(error.toLowerCase())) {
      gaps.push(`New error: ${error.substring(0, 100)}`);
      typedDeltas.push({
        artifactType: 'error',
        action: 'missing_in_doc',
        sourceValue: error,
        docValue: undefined,
        section: undefined,
        confidence: 0,
      });
    }
  }
  
  const confidence = gaps.length >= 3 ? 0.85 : gaps.length >= 1 ? 0.7 : 0.5;
  if (typedDeltas.length > 0) {
    for (const delta of typedDeltas) {
      delta.confidence = confidence;
    }
  }

  return {
    hasGap: gaps.length > 0,
    gapCount: gaps.length,
    gaps,
    typedDeltas: typedDeltas.length ? typedDeltas : undefined,
  };
}

/**
 * Determine patch recommendation based on drift type and coverage gaps
 */
function determineRecommendation(
  primaryDrift: any,
  coverageGaps: CoverageGapResult
): 'replace_steps' | 'add_section' | 'update_ownership' | 'add_note' {
  if (!primaryDrift) {
    return coverageGaps.hasGap ? 'add_section' : 'add_note';
  }

  // If there are conflicts, recommend replacement
  if (primaryDrift.conflicts && primaryDrift.conflicts.length > 0) {
    return 'replace_steps';
  }

  // If there's new content, recommendation depends on drift type
  if (primaryDrift.newContent && primaryDrift.newContent.length > 0) {
    switch (primaryDrift.type) {
      case 'ownership':
        return 'update_ownership';
      case 'process':
        return 'replace_steps';
      default:
        return 'add_section';
    }
  }

  // If only coverage gaps, add new section
  if (coverageGaps.hasGap) {
    return 'add_section';
  }

  return 'add_note';
}

