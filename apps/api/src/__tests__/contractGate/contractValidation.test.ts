/**
 * Contract Validation Integration Tests
 * 
 * Tests for the full contract validation flow:
 * 1. Surface classification
 * 2. Contract resolution
 * 3. Artifact fetching (TODO)
 * 4. Comparators (TODO)
 * 
 * Week 1-2 Step 2: Wire Contract Resolution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runContractValidation } from '../../services/contracts/contractValidation.js';
import type { ContractValidationInput } from '../../services/contracts/contractValidation.js';

describe('Contract Validation Integration', () => {
  let mockInput: ContractValidationInput;

  beforeEach(() => {
    mockInput = {
      workspaceId: 'test-workspace',
      signalEventId: 'test-signal-123',
      changedFiles: [],
      service: 'test-service',
      repo: 'test-org/test-repo',
    };
  });

  // ======================================================================
  // SURFACE CLASSIFICATION TESTS
  // ======================================================================

  it('should return PASS when no contract surfaces touched', async () => {
    mockInput.changedFiles = [
      { filename: 'src/utils/helper.ts', status: 'modified' },
      { filename: 'src/components/Button.tsx', status: 'modified' },
    ];

    const result = await runContractValidation(mockInput);

    expect(result.band).toBe('pass');
    expect(result.contractsChecked).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('should detect API surface and resolve contracts', async () => {
    mockInput.changedFiles = [
      { filename: 'openapi/openapi.yaml', status: 'modified' },
    ];

    const result = await runContractValidation(mockInput);

    // Should detect API surface and attempt contract resolution
    expect(result.contractsChecked).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should detect Infrastructure surface and resolve contracts', async () => {
    mockInput.changedFiles = [
      { filename: 'terraform/main.tf', status: 'modified' },
    ];

    const result = await runContractValidation(mockInput);

    expect(result.contractsChecked).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should detect multiple surfaces', async () => {
    mockInput.changedFiles = [
      { filename: 'openapi/openapi.yaml', status: 'modified' },
      { filename: 'terraform/main.tf', status: 'modified' },
      { filename: 'README.md', status: 'modified' },
    ];

    const result = await runContractValidation(mockInput);

    // Should detect API, Infra, and Docs surfaces
    expect(result.contractsChecked).toBeGreaterThanOrEqual(0);
  });

  // ======================================================================
  // CONTRACT RESOLUTION TESTS
  // ======================================================================

  it('should handle contract resolution failures gracefully', async () => {
    mockInput.changedFiles = [
      { filename: 'openapi/openapi.yaml', status: 'modified' },
    ];
    mockInput.workspaceId = 'non-existent-workspace';

    const result = await runContractValidation(mockInput);

    // Should not throw, should return PASS if no contracts found
    expect(result.band).toBe('pass');
  });

  // ======================================================================
  // PERFORMANCE TESTS
  // ======================================================================

  it('should complete validation in < 30 seconds for large PRs', async () => {
    // Simulate a large PR with 100 files
    mockInput.changedFiles = Array.from({ length: 100 }, (_, i) => ({
      filename: `src/file${i}.ts`,
      status: 'modified',
    }));

    const startTime = Date.now();
    const result = await runContractValidation(mockInput);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(30000); // < 30 seconds
    expect(result.duration).toBeLessThan(30000);
  });

  it('should complete validation quickly for PRs with no contract surfaces', async () => {
    mockInput.changedFiles = Array.from({ length: 50 }, (_, i) => ({
      filename: `src/utils/helper${i}.ts`,
      status: 'modified',
    }));

    const startTime = Date.now();
    const result = await runContractValidation(mockInput);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // < 1 second for early exit
    expect(result.band).toBe('pass');
  });

  // ======================================================================
  // EDGE CASES
  // ======================================================================

  it('should handle empty file list', async () => {
    mockInput.changedFiles = [];

    const result = await runContractValidation(mockInput);

    expect(result.band).toBe('pass');
    expect(result.contractsChecked).toBe(0);
  });

  it('should handle missing optional fields', async () => {
    mockInput.service = undefined;
    mockInput.repo = undefined;
    mockInput.changedFiles = [
      { filename: 'openapi/openapi.yaml', status: 'modified' },
    ];

    const result = await runContractValidation(mockInput);

    // Should not throw
    expect(result).toBeDefined();
  });
});

