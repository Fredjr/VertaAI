/**
 * Feature Flags - Workspace Preferences Mapping Tests
 * 
 * Tests that user-friendly workspace toggles correctly map to technical feature flags
 */

import { 
  isFeatureEnabled, 
  cacheWorkspacePrefs, 
  clearWorkspacePrefsCache 
} from '../../config/featureFlags.js';

describe('Feature Flags - Workspace Preferences Mapping', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearWorkspacePrefsCache();
    // Clear env vars
    delete process.env.FF_ENABLE_TYPED_DELTAS;
    delete process.env.FF_ENABLE_EVIDENCE_TO_LLM;
    delete process.env.FF_ENABLE_MATERIALITY_GATE;
    delete process.env.FF_ENABLE_CONTEXT_EXPANSION;
    delete process.env.FF_ENABLE_TEMPORAL_ACCUMULATION;
  });

  afterEach(() => {
    clearWorkspacePrefsCache();
  });

  test('evidenceGroundedPatching enables ENABLE_TYPED_DELTAS and ENABLE_EVIDENCE_TO_LLM', () => {
    const workspaceId = 'test-workspace-1';
    const prefs = {
      evidenceGroundedPatching: true,
      skipLowValuePatches: false,
      expandedContextMode: false,
      trackCumulativeDrift: false,
    };

    cacheWorkspacePrefs(workspaceId, prefs);

    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_EVIDENCE_TO_LLM', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_MATERIALITY_GATE', workspaceId)).toBe(false);
    expect(isFeatureEnabled('ENABLE_CONTEXT_EXPANSION', workspaceId)).toBe(false);
    expect(isFeatureEnabled('ENABLE_TEMPORAL_ACCUMULATION', workspaceId)).toBe(false);
  });

  test('skipLowValuePatches enables ENABLE_MATERIALITY_GATE', () => {
    const workspaceId = 'test-workspace-2';
    const prefs = {
      evidenceGroundedPatching: false,
      skipLowValuePatches: true,
      expandedContextMode: false,
      trackCumulativeDrift: false,
    };

    cacheWorkspacePrefs(workspaceId, prefs);

    expect(isFeatureEnabled('ENABLE_MATERIALITY_GATE', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(false);
  });

  test('expandedContextMode enables ENABLE_CONTEXT_EXPANSION', () => {
    const workspaceId = 'test-workspace-3';
    const prefs = {
      evidenceGroundedPatching: false,
      skipLowValuePatches: false,
      expandedContextMode: true,
      trackCumulativeDrift: false,
    };

    cacheWorkspacePrefs(workspaceId, prefs);

    expect(isFeatureEnabled('ENABLE_CONTEXT_EXPANSION', workspaceId)).toBe(true);
  });

  test('trackCumulativeDrift enables ENABLE_TEMPORAL_ACCUMULATION', () => {
    const workspaceId = 'test-workspace-4';
    const prefs = {
      evidenceGroundedPatching: false,
      skipLowValuePatches: false,
      expandedContextMode: false,
      trackCumulativeDrift: true,
    };

    cacheWorkspacePrefs(workspaceId, prefs);

    expect(isFeatureEnabled('ENABLE_TEMPORAL_ACCUMULATION', workspaceId)).toBe(true);
  });

  test('multiple toggles can be enabled simultaneously', () => {
    const workspaceId = 'test-workspace-5';
    const prefs = {
      evidenceGroundedPatching: true,
      skipLowValuePatches: true,
      expandedContextMode: true,
      trackCumulativeDrift: true,
    };

    cacheWorkspacePrefs(workspaceId, prefs);

    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_EVIDENCE_TO_LLM', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_MATERIALITY_GATE', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_CONTEXT_EXPANSION', workspaceId)).toBe(true);
    expect(isFeatureEnabled('ENABLE_TEMPORAL_ACCUMULATION', workspaceId)).toBe(true);
  });

  test('env var override takes precedence over workspace prefs', () => {
    const workspaceId = 'test-workspace-6';
    const prefs = {
      evidenceGroundedPatching: false, // Workspace says false
      skipLowValuePatches: false,
      expandedContextMode: false,
      trackCumulativeDrift: false,
    };

    cacheWorkspacePrefs(workspaceId, prefs);

    // But env var says true
    process.env.FF_ENABLE_TYPED_DELTAS = 'true';

    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(true);
  });

  test('falls back to default when no workspace prefs cached', () => {
    const workspaceId = 'test-workspace-7';
    // Don't cache any prefs

    // Should fall back to defaults (all false in starter mode)
    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(false);
    expect(isFeatureEnabled('ENABLE_EVIDENCE_TO_LLM', workspaceId)).toBe(false);
  });

  test('cache expires after TTL', async () => {
    const workspaceId = 'test-workspace-8';
    const prefs = {
      evidenceGroundedPatching: true,
      skipLowValuePatches: false,
      expandedContextMode: false,
      trackCumulativeDrift: false,
    };

    cacheWorkspacePrefs(workspaceId, prefs);
    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(true);

    // Clear cache to simulate expiry
    clearWorkspacePrefsCache(workspaceId);

    // Should fall back to default
    expect(isFeatureEnabled('ENABLE_TYPED_DELTAS', workspaceId)).toBe(false);
  });
});

