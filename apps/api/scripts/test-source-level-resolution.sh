#!/bin/bash
# E2E Test Suite: Source-Level Doc Resolution
# Tests that source-specific mappings work correctly with simple fallback
#
# Test Philosophy:
# - Source-agnostic mappings (sourceType=NULL) apply to ALL sources
# - Source-specific mappings override for that specific source
# - Drift type does NOT affect doc selection (that's the old complex approach)

set -e

DB_HOST="trolley.proxy.rlwy.net"
DB_PORT="41316"
DB_USER="postgres"
DB_NAME="railway"
export PGPASSWORD='RWrTgbNhjhjVrUhgdiNdtzOjBUUtyatb'

WORKSPACE_ID="63d61996-28c2-4050-a020-ebd784aa4076"
API_URL="https://vertaai-api-production.up.railway.app"

echo "🧪 E2E Test Suite: Source-Level Doc Resolution"
echo "=================================================="
echo ""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper: Create test signal and drift
create_test_drift() {
  local drift_id=$1
  local signal_id=$2
  local source_type=$3
  local repo=$4
  
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    -- Create signal
    INSERT INTO signal_events (workspace_id, id, source_type, repo, occurred_at, created_at)
    VALUES ('$WORKSPACE_ID', '$signal_id', '$source_type', '$repo', NOW(), NOW())
    ON CONFLICT (workspace_id, id) DO UPDATE SET source_type = '$source_type';

    -- Create drift
    INSERT INTO drift_candidates (
      workspace_id, id, signal_event_id, state, source_type, repo,
      drift_type, evidence_summary, confidence, created_at,
      fingerprint
    ) VALUES (
      '$WORKSPACE_ID', '$drift_id', '$signal_id', 'DRIFT_CLASSIFIED',
      '$source_type', '$repo', 'instruction',
      'Test drift from $source_type', 0.75, NOW(),
      'test-$drift_id-' || extract(epoch from now())::text
    )
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      state = 'DRIFT_CLASSIFIED',
      docs_resolution = NULL,
      selected_doc_id = NULL;
  " > /dev/null 2>&1
}

# Helper: Run state machine
run_state_machine() {
  local drift_id=$1
  curl -s -X POST "$API_URL/api/test/run-state-machine" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\": \"$WORKSPACE_ID\", \"driftId\": \"$drift_id\", \"maxIterations\": 5}" \
    > /dev/null 2>&1
}

# Helper: Check result
check_result() {
  local drift_id=$1
  local expected_doc_system=$2
  local test_name=$3
  
  local result=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT 
      COALESCE(docs_resolution->'candidates'->0->>'docSystem', 'NONE') as selected,
      COALESCE(docs_resolution->>'notes', 'NONE') as notes
    FROM drift_candidates
    WHERE id = '$drift_id';
  ")
  
  local selected=$(echo "$result" | awk -F'|' '{print $1}' | tr -d ' ')
  local notes=$(echo "$result" | awk -F'|' '{print $2}' | tr -d ' ')
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  if [ "$selected" = "$expected_doc_system" ]; then
    echo "✅ PASS: $test_name"
    echo "   Selected: $selected (expected: $expected_doc_system)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo "❌ FAIL: $test_name"
    echo "   Selected: $selected (expected: $expected_doc_system)"
    echo "   Notes: $notes"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  echo ""
}

# ==============================================================================
# Test 1: GitHub PR with source-agnostic mapping
# Expected: Should use primary doc (README) since no source-specific mapping exists
# ==============================================================================
echo "Test 1: GitHub PR → Source-Agnostic Primary Doc (README)"
echo "--------------------------------------------------------"
create_test_drift "test-github-pr-agnostic" "sig-github-pr-agnostic" "github_pr" "Fredjr/VertaAI"
run_state_machine "test-github-pr-agnostic"
check_result "test-github-pr-agnostic" "github_readme" "GitHub PR → Source-Agnostic Primary Doc"

# ==============================================================================
# Test 2: Create source-specific mapping for PagerDuty → Confluence
# Then test that PagerDuty uses it
# ==============================================================================
echo "Test 2: PagerDuty → Source-Specific Mapping (Confluence)"
echo "--------------------------------------------------------"

# Create source-specific mapping
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
  INSERT INTO doc_mappings_v2 (
    workspace_id, doc_system, doc_id, doc_title, repo, 
    is_primary, source_type, created_at, updated_at
  ) VALUES (
    '$WORKSPACE_ID', 'confluence', '163950-pagerduty', 
    'Runbook (PagerDuty specific)', 'Fredjr/VertaAI',
    true, 'pagerduty_incident', NOW(), NOW()
  ) ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;
" > /dev/null 2>&1

create_test_drift "test-pagerduty-specific" "sig-pagerduty-specific" "pagerduty_incident" "Fredjr/VertaAI"
run_state_machine "test-pagerduty-specific"
check_result "test-pagerduty-specific" "confluence" "PagerDuty → Source-Specific Mapping"

# ==============================================================================
# Summary
# ==============================================================================
echo "=================================================="
echo "Test Results Summary"
echo "=================================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo "✅ All tests passed"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi

