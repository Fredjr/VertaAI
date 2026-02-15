# Week 1-2 Step 3: Wire Comparators + Artifact Fetching

## 🎯 Goal
Integrate artifact fetching and comparators into the contract validation flow while maintaining the simplified approach from Steps 1-2.

## 🤔 Challenge
- **Current State**: Simplified surface-based contract resolution (no actual Contract objects)
- **Requirement**: ArtifactFetcher and Comparators need actual Contract objects with artifact definitions
- **Constraint**: Must proceed carefully without breaking existing tests

## 📋 Approach: Simplified Artifact Fetching (Week 1-2)

### Strategy
Create a **simplified artifact fetching flow** that works with our surface-based approach:

1. **Mock Contract Generation**: Generate simple mock contracts based on detected surfaces
2. **Simplified Artifact Fetching**: Use placeholder artifacts for testing
3. **Comparator Integration**: Wire comparators with soft-fail strategy
4. **Timeout Handling**: Implement 5-second timeout per comparator
5. **Graceful Degradation**: Return PASS if artifact fetching fails

### Why This Approach?
- ✅ Demonstrates the full flow end-to-end
- ✅ Doesn't require database-backed contracts yet
- ✅ Maintains backward compatibility with existing tests
- ✅ Easy to upgrade to full implementation later
- ✅ Allows us to test comparator logic

## 🏗️ Implementation Plan

### Phase 1: Create Mock Contract Generator (30 min)
**File**: `apps/api/src/services/contractGate/mockContractGenerator.ts`

**Purpose**: Generate simple mock contracts based on detected surfaces

**Example**:
```typescript
// Input: surfaces = ['api', 'docs']
// Output: Mock contract with OpenAPI + Docs artifacts
{
  contractId: 'mock-api-docs-contract',
  artifacts: [
    { type: 'openapi', system: 'github', locator: {...}, role: 'primary' },
    { type: 'readme', system: 'github', locator: {...}, role: 'secondary' }
  ],
  invariants: [
    { comparatorType: 'openapi_docs_endpoint_parity', severity: 'high' }
  ]
}
```

### Phase 2: Update Contract Validation (45 min)
**File**: `apps/api/src/services/contracts/contractValidation.ts`

**Changes**:
1. Generate mock contracts from surfaces
2. Initialize ArtifactFetcher
3. Fetch artifacts with timeout (5s per artifact)
4. Run comparators with soft-fail
5. Aggregate findings

**Pseudo-code**:
```typescript
// Step 2.5: Generate mock contracts from surfaces
const mockContracts = generateMockContracts(surfaceClassification);

// Step 3: Fetch artifacts
const fetcher = new ArtifactFetcher(input.workspaceId);
const allSnapshots = [];

for (const contract of mockContracts) {
  try {
    const snapshots = await Promise.race([
      fetcher.fetchContractArtifacts(contract.contractId, contract.artifacts, {...}),
      timeout(5000)
    ]);
    allSnapshots.push(...snapshots);
  } catch (error) {
    console.warn('Artifact fetching failed (soft-fail):', error);
    // Continue with next contract
  }
}

// Step 4: Run comparators
const comparators = getComparators();
const allFindings = [];

for (const contract of mockContracts) {
  for (const invariant of contract.invariants) {
    const comparator = comparators[invariant.comparatorType];
    if (!comparator) continue;
    
    const relevantSnapshots = allSnapshots.filter(s => s.contractId === contract.contractId);
    
    if (!comparator.canCompare(invariant, relevantSnapshots)) {
      console.log('Comparator cannot compare - skipping');
      continue;
    }
    
    try {
      const result = await Promise.race([
        comparator.compare({invariant, leftSnapshot, rightSnapshot, context}),
        timeout(5000)
      ]);
      allFindings.push(...result.findings);
    } catch (error) {
      console.warn('Comparator failed (soft-fail):', error);
      // Continue with next comparator
    }
  }
}
```

### Phase 3: Add Tests (30 min)
**File**: `apps/api/src/__tests__/contractGate/contractValidation.test.ts`

**New Tests**:
1. Should fetch artifacts when API surface detected
2. Should run OpenAPI comparator when artifacts available
3. Should handle artifact fetching timeout gracefully
4. Should handle comparator timeout gracefully
5. Should aggregate findings from multiple comparators
6. Should return WARN when findings detected
7. Should return FAIL when critical findings detected

### Phase 4: Integration Testing (15 min)
- Run all tests
- Verify performance (< 30s for large PRs)
- Check soft-fail behavior

## 🎯 Success Criteria

- [ ] All existing tests still pass (31/31)
- [ ] New tests added (7+ new tests)
- [ ] Artifact fetching integrated with soft-fail
- [ ] Comparators wired with timeout handling
- [ ] Performance < 30s for large PRs
- [ ] Graceful degradation when artifacts unavailable

## 🚧 Limitations (Week 1-2)

1. **Mock Contracts**: Using generated mock contracts, not database-backed
2. **Placeholder Artifacts**: Artifacts may contain placeholder data
3. **Simplified Resolution**: Not using full ContractResolver yet
4. **Limited Comparators**: Only OpenAPI and Terraform comparators

## 🔄 Future Upgrades (Week 3-4+)

1. Replace mock contracts with database-backed contracts
2. Integrate full ContractResolver
3. Add real artifact fetching from GitHub/Confluence
4. Add more comparators
5. Improve timeout handling with retry logic

## ⏱️ Estimated Time
- Phase 1: 30 min
- Phase 2: 45 min
- Phase 3: 30 min
- Phase 4: 15 min
- **Total**: ~2 hours

## 🎬 Next Steps
1. Create `mockContractGenerator.ts`
2. Update `contractValidation.ts`
3. Add tests
4. Run integration tests
5. Document progress

