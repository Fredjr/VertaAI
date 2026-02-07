#!/bin/bash
# Comprehensive E2E Test Suite - Source-Level Doc Resolution
# Tests full pipeline: Input Source → Doc Resolution → Slack Notification → Approval → Writeback
#
# Test Philosophy (Source-Level Mapping):
# - Users map at repo + source level (not drift type level)
# - Source-agnostic mappings (sourceType=NULL) apply to ALL sources
# - Source-specific mappings override for that specific source
# - Tests cover: GitHub PR, PagerDuty, Slack (future)

set -e

DB_HOST="trolley.proxy.rlwy.net"
DB_PORT="41316"
DB_USER="postgres"
DB_NAME="railway"
export PGPASSWORD='RWrTgbNhjhjVrUhgdiNdtzOjBUUtyatb'

WORKSPACE_ID="63d61996-28c2-4050-a020-ebd784aa4076"
API_URL="https://vertaai-api-production.up.railway.app"

echo "🧪 Comprehensive E2E Test Suite - Source-Level Doc Resolution"
echo "=============================================================="
echo ""
echo "Testing full pipeline:"
echo "  1. Input Source → Signal Creation"
echo "  2. Drift Detection → Doc Resolution (source-level)"
echo "  3. State Machine → AWAITING_HUMAN"
echo "  4. Slack Notification"
echo "  5. Approval → Writeback"
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
  local drift_type=${5:-"instruction"}

  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    -- Create signal
    INSERT INTO signal_events (workspace_id, id, source_type, repo, occurred_at, created_at, raw_payload)
    VALUES ('$WORKSPACE_ID', '$signal_id', '$source_type', '$repo', NOW(), NOW(), '{}'::jsonb)
    ON CONFLICT (workspace_id, id) DO UPDATE SET source_type = '$source_type', repo = '$repo';

    -- Create drift
    INSERT INTO drift_candidates (
      workspace_id, id, signal_event_id, state, source_type, repo,
      drift_type, evidence_summary, confidence, created_at,
      fingerprint
    ) VALUES (
      '$WORKSPACE_ID', '$drift_id', '$signal_id', 'DRIFT_CLASSIFIED',
      '$source_type', '$repo', '$drift_type',
      'E2E test: $drift_type drift from $source_type', 0.85, NOW(),
      'e2e-test-$drift_id-' || extract(epoch from now())::text
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
  local max_iterations=${2:-10}

  curl -s -X POST "$API_URL/api/test/run-state-machine" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\": \"$WORKSPACE_ID\", \"driftId\": \"$drift_id\", \"maxIterations\": $max_iterations}" \
    > /dev/null 2>&1
}

# Helper: Check doc resolution result
check_doc_resolution() {
  local drift_id=$1
  local expected_doc_system=$2
  local test_name=$3

  local result=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT
      state,
      COALESCE(docs_resolution->'candidates'->0->>'docSystem', 'NONE') as doc_system,
      COALESCE(docs_resolution->>'status', 'NONE') as resolution_status,
      COALESCE(docs_resolution->>'notes', '') as notes
    FROM drift_candidates
    WHERE id = '$drift_id';
  ")

  local state=$(echo "$result" | awk -F'|' '{print $1}' | tr -d ' ')
  local doc_system=$(echo "$result" | awk -F'|' '{print $2}' | tr -d ' ')
  local resolution_status=$(echo "$result" | awk -F'|' '{print $3}' | tr -d ' ')
  local notes=$(echo "$result" | awk -F'|' '{print $4}' | tr -d ' ')

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$doc_system" = "$expected_doc_system" ]; then
    echo "✅ PASS: $test_name"
    echo "   State: $state"
    echo "   Doc System: $doc_system (expected: $expected_doc_system)"
    echo "   Resolution: $resolution_status"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo "❌ FAIL: $test_name"
    echo "   State: $state"
    echo "   Doc System: $doc_system (expected: $expected_doc_system)"
    echo "   Resolution: $resolution_status"
    echo "   Notes: $notes"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  echo ""
}

# Helper: Check state progression
check_state() {
  local drift_id=$1
  local expected_state=$2
  local test_name=$3

  local state=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT state FROM drift_candidates WHERE id = '$drift_id';
  " | tr -d ' ')

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$state" = "$expected_state" ]; then
    echo "✅ PASS: $test_name"
    echo "   State: $state"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo "❌ FAIL: $test_name"
    echo "   State: $state (expected: $expected_state)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  echo ""
}

echo "=============================================================="
echo "Phase 1: Source-Agnostic Mappings (Current State)"
echo "=============================================================="
echo ""
echo "All existing mappings have sourceType=NULL, so they apply to all sources."

# ==============================================================================
# Test 1.1: GitHub PR → Source-Agnostic Primary Doc (README)
# ==============================================================================
echo "Test 1.1: GitHub PR → README (source-agnostic primary)"
echo "------------------------------------------------------"
create_test_drift "e2e-github-pr-readme" "sig-e2e-github-pr-1" "github_pr" "Fredjr/VertaAI" "instruction"
run_state_machine "e2e-github-pr-readme" 10
check_doc_resolution "e2e-github-pr-readme" "github_readme" "GitHub PR → README"
check_state "e2e-github-pr-readme" "AWAITING_HUMAN" "GitHub PR → State: AWAITING_HUMAN"

# ==============================================================================
# Test 1.2: PagerDuty Incident → Source-Agnostic Primary Doc (README fallback)
# ==============================================================================
echo "Test 1.2: PagerDuty → README (source-agnostic fallback)"
echo "--------------------------------------------------------"
create_test_drift "e2e-pagerduty-readme" "sig-e2e-pagerduty-1" "pagerduty_incident" "Fredjr/VertaAI" "process"
run_state_machine "e2e-pagerduty-readme" 10
check_doc_resolution "e2e-pagerduty-readme" "github_readme" "PagerDuty → README (fallback)"
check_state "e2e-pagerduty-readme" "AWAITING_HUMAN" "PagerDuty → State: AWAITING_HUMAN"

echo ""
echo "=============================================================="
echo "Phase 2: Source-Specific Mappings"
echo "=============================================================="
echo ""
echo "Creating source-specific mappings to override defaults"
echo ""

# ==============================================================================
# Test 2.1: Create source-specific mapping: PagerDuty → Confluence
# ==============================================================================
echo "Setting up: PagerDuty → Confluence (source-specific)"
echo "-----------------------------------------------------"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
  INSERT INTO doc_mappings_v2 (
    workspace_id, doc_system, doc_id, doc_title, repo,
    is_primary, allow_writeback, source_type, created_at, updated_at
  ) VALUES (
    '$WORKSPACE_ID', 'confluence', '163950',
    'Software Development Runbook (PagerDuty)', 'Fredjr/VertaAI',
    true, true, 'pagerduty_incident', NOW(), NOW()
  ) ON CONFLICT (workspace_id, doc_system, doc_id) DO UPDATE SET
    source_type = 'pagerduty_incident',
    is_primary = true;
" > /dev/null 2>&1
echo "✅ Created source-specific mapping: PagerDuty → Confluence"
echo ""

# ==============================================================================
# Test 2.2: PagerDuty → Confluence (source-specific override)
# ==============================================================================
echo "Test 2.2: PagerDuty → Confluence (source-specific override)"
echo "------------------------------------------------------------"
create_test_drift "e2e-pagerduty-confluence" "sig-e2e-pagerduty-2" "pagerduty_incident" "Fredjr/VertaAI" "process"
run_state_machine "e2e-pagerduty-confluence" 10
check_doc_resolution "e2e-pagerduty-confluence" "confluence" "PagerDuty → Confluence (source-specific)"
check_state "e2e-pagerduty-confluence" "AWAITING_HUMAN" "PagerDuty → State: AWAITING_HUMAN"

# ==============================================================================
# Test 2.3: Verify GitHub PR still uses README (not affected by PagerDuty mapping)
# ==============================================================================
echo "Test 2.3: GitHub PR → README (unaffected by PagerDuty mapping)"
echo "---------------------------------------------------------------"
create_test_drift "e2e-github-pr-still-readme" "sig-e2e-github-pr-2" "github_pr" "Fredjr/VertaAI" "process"
run_state_machine "e2e-github-pr-still-readme" 10
check_doc_resolution "e2e-github-pr-still-readme" "github_readme" "GitHub PR → README (still)"
check_state "e2e-github-pr-still-readme" "AWAITING_HUMAN" "GitHub PR → State: AWAITING_HUMAN"

echo ""
echo "=============================================================="
echo "Phase 3: Drift Type Independence"
echo "=============================================================="
echo ""
echo "Verify that drift type does NOT affect doc selection"
echo "(Source-level routing, not drift-type routing)"
echo ""

# ==============================================================================
# Test 3.1: PagerDuty + instruction drift → Still Confluence
# ==============================================================================
echo "Test 3.1: PagerDuty + instruction drift → Confluence"
echo "-----------------------------------------------------"
create_test_drift "e2e-pagerduty-instruction" "sig-e2e-pagerduty-3" "pagerduty_incident" "Fredjr/VertaAI" "instruction"
run_state_machine "e2e-pagerduty-instruction" 10
check_doc_resolution "e2e-pagerduty-instruction" "confluence" "PagerDuty + instruction → Confluence"

# ==============================================================================
# Test 3.2: PagerDuty + ownership drift → Still Confluence
# ==============================================================================
echo "Test 3.2: PagerDuty + ownership drift → Confluence"
echo "---------------------------------------------------"
create_test_drift "e2e-pagerduty-ownership" "sig-e2e-pagerduty-4" "pagerduty_incident" "Fredjr/VertaAI" "ownership"
run_state_machine "e2e-pagerduty-ownership" 10
check_doc_resolution "e2e-pagerduty-ownership" "confluence" "PagerDuty + ownership → Confluence"

echo ""
echo "=============================================================="
echo "Test Results Summary"
echo "=============================================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo "✅ All tests passed!"
  echo ""
  echo "Next steps:"
  echo "  1. Test Slack notifications (check Slack channel for approval messages)"
  echo "  2. Test approval flow (approve a drift and verify writeback)"
  echo "  3. Test actual writeback to README/Confluence"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
