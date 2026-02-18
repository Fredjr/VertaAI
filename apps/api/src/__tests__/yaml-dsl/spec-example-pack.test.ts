/**
 * Test: Verify that the spec's example pack can be parsed
 * Phase 1 Validation
 */

import { describe, it, expect } from 'vitest';
import { parsePackYAML } from '../../services/gatekeeper/yaml-dsl/packValidator.js';

describe('Spec Example Pack Parsing', () => {
  it('should parse the big microservices pack from spec', () => {
    const examplePack = `
apiVersion: verta.ai/v1
kind: PolicyPack
metadata:
  id: verta.trackA.enforce.microservices_v1
  name: "Enforce: Microservices Contract Integrity"
  version: 1.0.0
  owner: "platform-team"
  tags: ["trackA", "enforce", "microservices"]
  packMode: enforce
  strictness: balanced
  defaultsRef: verta.defaults.v1

scope:
  type: workspace
  repos:
    include: ["org/*"]
    exclude: ["org/legacy-*"]
  prEvents: ["opened", "synchronize", "labeled"]
  actorSignals:
    detectAgentAuthorship: true
    agentPatterns: ["\\\\[bot\\\\]$", "^dependabot"]
    botUsers: ["renovate[bot]"]

comparators:
  library: "1.0.0"

artifacts:
  requiredTypes: [openapi, readme, runbook]
  definitions:
    openapi:
      kind: openapi
      matchAny:
        - "**/openapi.{yaml,yml,json}"
      validators:
        - OPENAPI_SCHEMA_VALID
    readme:
      kind: readme
      matchAny:
        - "README.md"
        - "docs/README.md"

rules:
  - id: secrets_check
    name: "No Secrets in Diff"
    enabled: true
    trigger:
      always: true
    obligations:
      - comparator: NO_SECRETS_IN_DIFF
        params: {}
        severity: critical
        decisionOnFail: block

  - id: api_contract_updated
    name: "API Contract Updated"
    enabled: true
    trigger:
      anyChangedPathsRef: "apiChangePaths"
    obligations:
      - comparator: ARTIFACT_UPDATED
        params:
          artifactType: openapi
        severity: high
        decisionOnFail: block

evaluation:
  externalDependencyMode: soft_fail
  budgets:
    maxTotalMs: 30000
    perComparatorTimeoutMs: 5000
    maxGitHubApiCalls: 50
  unknownArtifactMode: warn
  maxFindings: 100
  maxEvidenceSnippetsPerFinding: 5

routing:
  github:
    checkRunName: "VertaAI Policy Pack"
    conclusionMapping:
      pass: success
      warn: success
      block: failure
    postSummaryComment: true
    annotateFiles: true

spawnTrackB:
  enabled: true
  when:
    - onDecision: block
  createRemediationCase: true
  remediationDefaults:
    priority: high
    targetSystems: ["github", "slack"]
    approvalChannelRef: "#verta-approvals"
  grouping:
    strategy: by-drift-type-and-service
    maxPerPR: 5
`;

    // This should NOT throw
    const pack = parsePackYAML(examplePack);

    // Verify key fields
    expect(pack.metadata.packMode).toBe('enforce');
    expect(pack.metadata.strictness).toBe('balanced');
    expect(pack.metadata.owner).toBe('platform-team');
    expect(pack.metadata.defaultsRef).toBe('verta.defaults.v1');
    
    expect(pack.scope.repos).toBeDefined();
    expect(pack.scope.repos?.include).toEqual(['org/*']);
    expect(pack.scope.actorSignals).toBeDefined();
    expect(pack.scope.actorSignals?.detectAgentAuthorship).toBe(true);
    
    expect(pack.comparators?.library).toBe('1.0.0');
    
    expect(pack.artifacts?.definitions?.openapi.kind).toBe('openapi');
    expect(pack.artifacts?.definitions?.openapi.matchAny).toEqual(['**/openapi.{yaml,yml,json}']);
    
    expect(pack.rules[0].enabled).toBe(true);
    expect(pack.rules[0].trigger.always).toBe(true);
    expect(pack.rules[0].obligations[0].comparator).toBe('NO_SECRETS_IN_DIFF');
    expect(pack.rules[0].obligations[0].severity).toBe('critical');
    
    expect(pack.rules[1].trigger.anyChangedPathsRef).toBe('apiChangePaths');
    
    expect(pack.evaluation?.externalDependencyMode).toBe('soft_fail');
    expect(pack.evaluation?.maxFindings).toBe(100);
    
    expect(pack.routing?.github?.postSummaryComment).toBe(true);
    expect(pack.routing?.github?.annotateFiles).toBe(true);
    
    expect(pack.spawnTrackB?.remediationDefaults?.targetSystems).toEqual(['github', 'slack']);
    expect(pack.spawnTrackB?.remediationDefaults?.approvalChannelRef).toBe('#verta-approvals');
  });
});

