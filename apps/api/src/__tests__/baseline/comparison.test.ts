// apps/api/src/__tests__/baseline/comparison.test.ts
import { describe, it, expect } from 'vitest';
import { compareArtifacts, detectInstructionDrift } from '../../services/baseline/comparison.js';
import type { BaselineArtifacts } from '../../services/baseline/types.js';

describe('baseline comparison typed deltas', () => {
  it('emits typed deltas for new commands and tools', () => {
    const source: BaselineArtifacts = {
      commands: ['kubectl apply -f deployment.yaml'],
      tools: ['helm'],
    };
    const doc: BaselineArtifacts = {
      commands: [],
      tools: [],
    };

    const result = detectInstructionDrift(source, doc);

    expect(result.hasDrift).toBe(true);
    expect(result.typedDeltas).toBeDefined();
    expect(result.typedDeltas?.some(d => d.artifactType === 'command')).toBe(true);
    expect(result.typedDeltas?.some(d => d.artifactType === 'tool')).toBe(true);
    // Per-delta confidence should be populated to match overall confidence
    expect(result.typedDeltas?.every(d => d.confidence === result.confidence)).toBe(true);
  });

  it('flattens typed deltas across drift types in compareArtifacts', () => {
    const source: BaselineArtifacts = {
      commands: ['kubectl apply -f deployment.yaml'],
      steps: ['Run database migrations'],
      teams: ['platform-team'],
      platforms: ['kubernetes'],
      scenarios: ['blue/green deployment'],
    };
    const doc: BaselineArtifacts = {
      commands: [],
      steps: [],
      teams: [],
      platforms: [],
      scenarios: [],
    };

    const comparison = compareArtifacts({
      sourceArtifacts: source,
      docArtifacts: doc,
      sourceType: 'github_pr',
    });

    expect(comparison.hasDrift).toBe(true);
    expect(comparison.typedDeltas).toBeDefined();
    const types = new Set(comparison.typedDeltas?.map(d => d.artifactType));
    expect(types.has('command')).toBe(true);
    expect(types.has('step')).toBe(true);
    expect(types.has('team')).toBe(true);
    expect(types.has('platform')).toBe(true);
    // Coverage-related scenarios should also contribute typed deltas
    expect(types.has('scenario')).toBe(true);
  });
});

