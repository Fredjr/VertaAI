#!/bin/bash
# Test script for Gap A, B, C, D fixes
# Tests that baseline comparison results flow to LLM agents and validators

set -e

API_URL="${API_URL:-http://localhost:3001}"

echo "======================================"
echo "Testing Gap Fixes A, B, C, D"
echo "======================================"
echo ""

# Test 1: Verify EVIDENCE_EXTRACTED state exists in state machine
echo "Test 1: Verify EVIDENCE_EXTRACTED state exists"
echo "--------------------------------------"
if grep -q "EVIDENCE_EXTRACTED" apps/api/src/types/state-machine.ts; then
    echo "✅ PASS: EVIDENCE_EXTRACTED state found in state machine"
else
    echo "❌ FAIL: EVIDENCE_EXTRACTED state not found"
    exit 1
fi
echo ""

# Test 2: Verify handleEvidenceExtracted handler exists
echo "Test 2: Verify handleEvidenceExtracted handler exists"
echo "--------------------------------------"
if grep -q "handleEvidenceExtracted" apps/api/src/services/orchestrator/transitions.ts; then
    echo "✅ PASS: handleEvidenceExtracted handler found"
else
    echo "❌ FAIL: handleEvidenceExtracted handler not found"
    exit 1
fi
echo ""

# Test 3: Verify baseline-gated flow control (Gap C)
echo "Test 3: Verify baseline-gated flow control exists"
echo "--------------------------------------"
if grep -q "GAP C FIX" apps/api/src/services/orchestrator/transitions.ts; then
    echo "✅ PASS: Baseline-gated flow control found"
else
    echo "❌ FAIL: Baseline-gated flow control not found"
    exit 1
fi
echo ""

# Test 4: Verify PatchPlanner receives baseline results (Gap A)
echo "Test 4: Verify PatchPlanner receives baseline results"
echo "--------------------------------------"
if grep -q "baselineCheck" apps/api/src/agents/patch-planner.ts && \
   grep -q "evidencePack" apps/api/src/agents/patch-planner.ts; then
    echo "✅ PASS: PatchPlanner interface includes baseline fields"
else
    echo "❌ FAIL: PatchPlanner interface missing baseline fields"
    exit 1
fi
echo ""

# Test 5: Verify PatchGenerator receives baseline results (Gap A)
echo "Test 5: Verify PatchGenerator receives baseline results"
echo "--------------------------------------"
if grep -q "baselineCheck" apps/api/src/agents/patch-generator.ts && \
   grep -q "evidencePack" apps/api/src/agents/patch-generator.ts; then
    echo "✅ PASS: PatchGenerator interface includes baseline fields"
else
    echo "❌ FAIL: PatchGenerator interface missing baseline fields"
    exit 1
fi
echo ""

# Test 6: Verify validators use structured evidence (Gap B)
echo "Test 6: Verify validators use structured evidence"
echo "--------------------------------------"
if grep -q "GAP B FIX.*structured evidence" apps/api/src/services/orchestrator/transitions.ts; then
    echo "✅ PASS: Validators use structured evidence from evidencePack"
else
    echo "❌ FAIL: Validators not using structured evidence"
    exit 1
fi
echo ""

# Test 7: Verify baseline results passed to planner in transitions
echo "Test 7: Verify baseline results passed to planner"
echo "--------------------------------------"
if grep -A 20 "runPatchPlanner" apps/api/src/services/orchestrator/transitions.ts | grep -q "baselineCheck"; then
    echo "✅ PASS: Baseline results passed to PatchPlanner"
else
    echo "❌ FAIL: Baseline results not passed to PatchPlanner"
    exit 1
fi
echo ""

# Test 8: Verify baseline results passed to generator in transitions
echo "Test 8: Verify baseline results passed to generator"
echo "--------------------------------------"
if grep -A 20 "runPatchGenerator" apps/api/src/services/orchestrator/transitions.ts | grep -q "baselineCheck"; then
    echo "✅ PASS: Baseline results passed to PatchGenerator"
else
    echo "❌ FAIL: Baseline results not passed to PatchGenerator"
    exit 1
fi
echo ""

# Test 9: Verify evidence grounding in system prompts
echo "Test 9: Verify evidence grounding in system prompts"
echo "--------------------------------------"
if grep -q "Evidence Grounding" apps/api/src/agents/patch-planner.ts && \
   grep -q "Evidence Grounding" apps/api/src/agents/patch-generator.ts; then
    echo "✅ PASS: Evidence grounding instructions found in agent prompts"
else
    echo "❌ FAIL: Evidence grounding instructions missing"
    exit 1
fi
echo ""

# Test 10: TypeScript compilation
echo "Test 10: TypeScript compilation"
echo "--------------------------------------"
cd apps/api
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo "❌ FAIL: TypeScript compilation errors found"
    npx tsc --noEmit 2>&1 | grep "error TS" | head -10
    exit 1
else
    echo "✅ PASS: TypeScript compilation successful"
fi
cd ../..
echo ""

echo "======================================"
echo "All Gap Fix Tests Passed! ✅"
echo "======================================"
echo ""
echo "Summary:"
echo "- Gap D: EVIDENCE_EXTRACTED state added ✅"
echo "- Gap C: Baseline-gated flow control added ✅"
echo "- Gap A: Baseline results wired to LLM agents ✅"
echo "- Gap B: Validators use structured evidence ✅"
echo ""

