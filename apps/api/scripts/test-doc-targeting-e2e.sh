#!/bin/bash
# E2E Test Script for Doc Targeting Fix
# Tests all critical input source × output target combinations

set -e

DB_HOST="trolley.proxy.rlwy.net"
DB_PORT="41316"
DB_USER="postgres"
DB_NAME="railway"
export PGPASSWORD='RWrTgbNhjhjVrUhgdiNdtzOjBUUtyatb'

WORKSPACE_ID="63d61996-28c2-4050-a020-ebd784aa4076"
API_URL="https://vertaai-api-production.up.railway.app"

echo "🧪 E2E Test Suite: Doc Targeting Fix Verification"
echo "=================================================="
echo ""

# Helper function to create test drift
create_test_drift() {
  local drift_id=$1
  local signal_id=$2
  local drift_type=$3
  local source_type=$4
  local repo=$5
  local service=$6
  
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    INSERT INTO drift_candidates (
      workspace_id, id, signal_event_id, state, source_type, 
      repo, service, drift_type, drift_domains, evidence_summary, 
      confidence, risk_level, recommended_action, created_at
    ) VALUES (
      '$WORKSPACE_ID', '$drift_id', '$signal_id', 'DRIFT_CLASSIFIED',
      '$source_type', '$repo', '$service', '$drift_type',
      ARRAY['test'], 'E2E test drift', 0.75, 'medium', 'generate_patch', NOW()
    )
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      state = 'DRIFT_CLASSIFIED',
      doc_candidates = '[]'::jsonb,
      docs_resolution = NULL,
      baseline_findings = '[]'::jsonb,
      selected_doc_id = NULL;
  " > /dev/null 2>&1
}

# Helper function to run state machine
run_state_machine() {
  local drift_id=$1
  curl -s -X POST "$API_URL/api/test/run-state-machine" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\": \"$WORKSPACE_ID\", \"driftId\": \"$drift_id\", \"maxIterations\": 5}"
}

# Helper function to check result
check_result() {
  local drift_id=$1
  local expected_doc_system=$2
  local test_name=$3
  
  local result=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT 
      COALESCE(docs_resolution->'candidates'->0->>'docSystem', 'NONE') as selected_system,
      COALESCE(docs_resolution->'attempts'->1->'info'->>'targetDocSystems', 'NONE') as filter_used,
      jsonb_array_length(COALESCE(docs_resolution->'candidates', '[]'::jsonb)) as num_candidates
    FROM drift_candidates
    WHERE id = '$drift_id';
  ")
  
  local selected_system=$(echo "$result" | awk '{print $1}' | tr -d ' ')
  local filter_used=$(echo "$result" | awk '{print $3}' | tr -d ' ')
  local num_candidates=$(echo "$result" | awk '{print $5}' | tr -d ' ')
  
  if [ "$selected_system" = "$expected_doc_system" ]; then
    echo "✅ PASS: $test_name"
    echo "   Selected: $selected_system (expected: $expected_doc_system)"
    echo "   Filter: $filter_used"
    echo "   Candidates: $num_candidates"
    return 0
  else
    echo "❌ FAIL: $test_name"
    echo "   Selected: $selected_system (expected: $expected_doc_system)"
    echo "   Filter: $filter_used"
    echo "   Candidates: $num_candidates"
    return 1
  fi
}

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo "Test 1: GitHub PR (instruction) → README"
echo "----------------------------------------"
create_test_drift "test-gh-pr-instruction-readme" "github_pr_readme_proper_test" "instruction" "github_pr" "Fredjr/VertaAI" "api"
run_state_machine "test-gh-pr-instruction-readme" > /dev/null
if check_result "test-gh-pr-instruction-readme" "github_readme" "GitHub PR (instruction) → README"; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))
echo ""

echo "Test 2: GitHub PR (process) → Confluence"
echo "----------------------------------------"
create_test_drift "test-gh-pr-process-confluence" "github_pr_readme_proper_test" "process" "github_pr" "Fredjr/VertaAI" "api"
run_state_machine "test-gh-pr-process-confluence" > /dev/null
if check_result "test-gh-pr-process-confluence" "confluence" "GitHub PR (process) → Confluence"; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))
echo ""

echo "Test 3: GitHub PR (ownership) → Backstage"
echo "----------------------------------------"
create_test_drift "test-gh-pr-ownership-backstage" "github_pr_readme_proper_test" "ownership" "github_pr" "Fredjr/VertaAI" "api"
run_state_machine "test-gh-pr-ownership-backstage" > /dev/null
if check_result "test-gh-pr-ownership-backstage" "backstage" "GitHub PR (ownership) → Backstage"; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))
echo ""

echo "=================================================="
echo "Test Results Summary"
echo "=================================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi

