#!/bin/bash
# Full E2E Test Suite - All Input Sources × Output Targets
# Tests complete pipeline: Signal → Drift → Doc Resolution → Slack → Approval → Writeback
#
# Input Sources: GitHub PR, PagerDuty Incident, Slack Cluster
# Output Targets: README, Confluence, Notion, Backstage, GitBook, Swagger, Code Comments
#
# Test Strategy:
# 1. Create realistic signal data with actual evidence
# 2. Bypass comparison gate by setting drift_verdict manually
# 3. Test full state machine progression
# 4. Verify Slack notifications
# 5. Test approval and writeback

set -e

DB_HOST="trolley.proxy.rlwy.net"
DB_PORT="41316"
DB_USER="postgres"
DB_NAME="railway"
export PGPASSWORD='RWrTgbNhjhjVrUhgdiNdtzOjBUUtyatb'

WORKSPACE_ID="63d61996-28c2-4050-a020-ebd784aa4076"
API_URL="https://vertaai-api-production.up.railway.app"

echo "🧪 Full E2E Test Suite - All Input Sources × Output Targets"
echo "============================================================"
echo ""
echo "Testing Matrix:"
echo "  Input Sources: GitHub PR, PagerDuty, Slack"
echo "  Output Targets: README, Confluence, Notion, Backstage, etc."
echo "  Full Pipeline: Signal → Drift → Slack → Approval → Writeback"
echo ""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper: Create realistic GitHub PR signal with evidence
create_github_pr_signal() {
  local signal_id=$1
  local pr_number=$2
  local pr_title=$3
  local pr_body=$4
  
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    INSERT INTO signal_events (
      workspace_id, id, source_type, repo, occurred_at, created_at,
      raw_payload, extracted
    ) VALUES (
      '$WORKSPACE_ID', '$signal_id', 'github_pr', 'Fredjr/VertaAI', NOW(), NOW(),
      '{
        \"action\": \"opened\",
        \"number\": $pr_number,
        \"pull_request\": {
          \"number\": $pr_number,
          \"title\": \"$pr_title\",
          \"body\": \"$pr_body\",
          \"changed_files\": 3,
          \"additions\": 50,
          \"deletions\": 10
        }
      }'::jsonb,
      '{
        \"prTitle\": \"$pr_title\",
        \"prBody\": \"$pr_body\",
        \"changedFiles\": [\"apps/api/src/services/docs/docResolution.ts\", \"README.md\"],
        \"diff\": \"+ Added source-level doc mapping\\n+ Simplified resolution logic\"
      }'::jsonb
    )
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      source_type = 'github_pr',
      raw_payload = EXCLUDED.raw_payload,
      extracted = EXCLUDED.extracted;
  " > /dev/null 2>&1
}

# Helper: Create realistic PagerDuty incident signal
create_pagerduty_signal() {
  local signal_id=$1
  local incident_id=$2
  local title=$3
  local description=$4
  
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    INSERT INTO signal_events (
      workspace_id, id, source_type, repo, occurred_at, created_at,
      raw_payload, extracted
    ) VALUES (
      '$WORKSPACE_ID', '$signal_id', 'pagerduty_incident', 'Fredjr/VertaAI', NOW(), NOW(),
      '{
        \"event\": {
          \"event_type\": \"incident.triggered\",
          \"data\": {
            \"id\": \"$incident_id\",
            \"title\": \"$title\",
            \"description\": \"$description\",
            \"service\": {\"summary\": \"api\"}
          }
        }
      }'::jsonb,
      '{
        \"incidentTitle\": \"$title\",
        \"incidentDescription\": \"$description\",
        \"service\": \"api\"
      }'::jsonb
    )
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      source_type = 'pagerduty_incident',
      raw_payload = EXCLUDED.raw_payload,
      extracted = EXCLUDED.extracted;
  " > /dev/null 2>&1
}

# Helper: Create drift with realistic evidence - START AT BASELINE_CHECKED
# This bypasses the comparison gate by starting AFTER baseline check
create_drift_with_evidence() {
  local drift_id=$1
  local signal_id=$2
  local source_type=$3
  local drift_type=$4
  local evidence=$5

  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    INSERT INTO drift_candidates (
      workspace_id, id, signal_event_id, state, source_type, repo,
      drift_type, evidence_summary, confidence, created_at,
      fingerprint, drift_verdict, baseline_findings
    ) VALUES (
      '$WORKSPACE_ID', '$drift_id', '$signal_id', 'BASELINE_CHECKED',
      '$source_type', 'Fredjr/VertaAI', '$drift_type',
      '$evidence', 0.85, NOW(),
      'e2e-test-$drift_id-' || extract(epoch from now())::text,
      '{\"hasMatch\": true, \"confidence\": 0.85, \"source\": \"comparison\", \"evidence\": [\"$evidence\"], \"comparisonType\": \"$drift_type\"}'::jsonb,
      '[{\"docContent\": \"Test doc content\", \"docContext\": {\"baselineAnchors\": {\"anchors\": {\"commands\": [], \"config_keys\": [], \"endpoints\": []}}}}]'::jsonb
    )
    ON CONFLICT (workspace_id, id) DO UPDATE SET
      state = 'BASELINE_CHECKED',
      docs_resolution = NULL,
      drift_verdict = '{\"hasMatch\": true, \"confidence\": 0.85, \"source\": \"comparison\", \"evidence\": [\"$evidence\"], \"comparisonType\": \"$drift_type\"}'::jsonb,
      baseline_findings = '[{\"docContent\": \"Test doc content\", \"docContext\": {\"baselineAnchors\": {\"anchors\": {\"commands\": [], \"config_keys\": [], \"endpoints\": []}}}}]'::jsonb;
  " > /dev/null 2>&1
}

# Helper: Run state machine
run_state_machine() {
  local drift_id=$1
  local max_iterations=${2:-15}
  
  echo "  Running state machine (max $max_iterations iterations)..."
  curl -s -X POST "$API_URL/api/test/run-state-machine" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\": \"$WORKSPACE_ID\", \"driftId\": \"$drift_id\", \"maxIterations\": $max_iterations}" \
    > /dev/null 2>&1
  
  sleep 2  # Allow async processing
}

# Helper: Check drift state and doc resolution
check_drift_result() {
  local drift_id=$1
  local expected_doc_system=$2
  local expected_state=$3
  local test_name=$4
  
  local result=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT 
      state,
      COALESCE(docs_resolution->'candidates'->0->>'docSystem', 'NONE') as doc_system,
      COALESCE(docs_resolution->>'status', 'NONE') as resolution_status
    FROM drift_candidates
    WHERE id = '$drift_id';
  ")
  
  local state=$(echo "$result" | awk -F'|' '{print $1}' | tr -d ' ')
  local doc_system=$(echo "$result" | awk -F'|' '{print $2}' | tr -d ' ')
  local resolution_status=$(echo "$result" | awk -F'|' '{print $3}' | tr -d ' ')
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  local doc_match=false
  local state_match=false
  
  if [ "$doc_system" = "$expected_doc_system" ]; then
    doc_match=true
  fi
  
  if [ "$state" = "$expected_state" ]; then
    state_match=true
  fi
  
  if [ "$doc_match" = true ] && [ "$state_match" = true ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
    echo "     Doc: $doc_system | State: $state"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "  ${RED}❌ FAIL${NC}: $test_name"
    echo "     Doc: $doc_system (expected: $expected_doc_system)"
    echo "     State: $state (expected: $expected_state)"
    echo "     Resolution: $resolution_status"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

echo "=============================================================="
echo "Phase 1: Source-Agnostic Mappings (Default Behavior)"
echo "=============================================================="
echo ""

# Test 1: GitHub PR → README (source-agnostic primary)
echo "Test 1: GitHub PR → README (source-agnostic primary)"
create_github_pr_signal "sig-gh-pr-1" 101 "Add source-level mapping" "This PR adds source-level doc mapping feature. Updated README with new architecture."
create_drift_with_evidence "drift-gh-pr-readme-1" "sig-gh-pr-1" "github_pr" "instruction" "Added source-level mapping documentation"
run_state_machine "drift-gh-pr-readme-1" 15
check_drift_result "drift-gh-pr-readme-1" "github_readme" "AWAITING_HUMAN" "GitHub PR → README"
echo ""

# Test 2: PagerDuty → README (fallback to source-agnostic primary)
echo "Test 2: PagerDuty Incident → README (fallback to source-agnostic primary)"
create_pagerduty_signal "sig-pd-1" "PD-001" "API timeout in /api/docs" "Users experiencing 30s timeouts when calling /api/docs endpoint. Need to update runbook with troubleshooting steps."
create_drift_with_evidence "drift-pd-readme-1" "sig-pd-1" "pagerduty_incident" "instruction" "API timeout troubleshooting needed"
run_state_machine "drift-pd-readme-1" 15
check_drift_result "drift-pd-readme-1" "github_readme" "AWAITING_HUMAN" "PagerDuty → README (fallback)"
echo ""

echo "=============================================================="
echo "Phase 2: Source-Specific Mappings (Override Behavior)"
echo "=============================================================="
echo ""

# Create source-specific mapping: PagerDuty → Confluence
echo "Creating source-specific mapping: PagerDuty → Confluence"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
  INSERT INTO doc_mappings_v2 (
    workspace_id, doc_system, doc_id, doc_title, repo,
    is_primary, allow_writeback, source_type, created_at, updated_at
  ) VALUES (
    '$WORKSPACE_ID',
    'confluence', '163950', 'Runbook (PagerDuty)', 'Fredjr/VertaAI',
    true, true, 'pagerduty_incident', NOW(), NOW()
  )
  ON CONFLICT (workspace_id, doc_system, doc_id) DO UPDATE SET
    source_type = 'pagerduty_incident',
    is_primary = true;
" > /dev/null 2>&1
echo "✅ Created PagerDuty → Confluence mapping"
echo ""

# Test 3: PagerDuty → Confluence (source-specific override)
echo "Test 3: PagerDuty Incident → Confluence (source-specific override)"
create_pagerduty_signal "sig-pd-2" "PD-002" "Database connection pool exhausted" "Production database hitting max connections. Need to update runbook with scaling procedures."
create_drift_with_evidence "drift-pd-confluence-1" "sig-pd-2" "pagerduty_incident" "instruction" "Database scaling procedures needed"
run_state_machine "drift-pd-confluence-1" 15
check_drift_result "drift-pd-confluence-1" "confluence" "AWAITING_HUMAN" "PagerDuty → Confluence (override)"
echo ""

# Test 4: GitHub PR → README (still uses source-agnostic)
echo "Test 4: GitHub PR → README (unaffected by PagerDuty mapping)"
create_github_pr_signal "sig-gh-pr-2" 102 "Update API documentation" "Updated API docs with new endpoints and authentication flow."
create_drift_with_evidence "drift-gh-pr-readme-2" "sig-gh-pr-2" "github_pr" "instruction" "API documentation updates"
run_state_machine "drift-gh-pr-readme-2" 15
check_drift_result "drift-gh-pr-readme-2" "github_readme" "AWAITING_HUMAN" "GitHub PR → README (unaffected)"
echo ""

echo "=============================================================="
echo "Phase 3: Drift Type Independence"
echo "=============================================================="
echo ""
echo "Verifying that drift type does NOT affect doc selection"
echo "(Source-level mapping is independent of drift type)"
echo ""

# Test 5: GitHub PR with ownership drift → README (not Backstage)
echo "Test 5: GitHub PR (ownership drift) → README (not Backstage)"
create_github_pr_signal "sig-gh-pr-3" 103 "Update team ownership" "Updated CODEOWNERS file with new team structure."
create_drift_with_evidence "drift-gh-pr-ownership" "sig-gh-pr-3" "github_pr" "ownership" "Team ownership changes"
run_state_machine "drift-gh-pr-ownership" 15
check_drift_result "drift-gh-pr-ownership" "github_readme" "AWAITING_HUMAN" "GitHub PR (ownership) → README"
echo ""

# Test 6: GitHub PR with process drift → README (not Confluence)
echo "Test 6: GitHub PR (process drift) → README (not Confluence)"
create_github_pr_signal "sig-gh-pr-4" 104 "Update deployment process" "Updated deployment workflow with new approval gates."
create_drift_with_evidence "drift-gh-pr-process" "sig-gh-pr-4" "github_pr" "process" "Deployment process changes"
run_state_machine "drift-gh-pr-process" 15
check_drift_result "drift-gh-pr-process" "github_readme" "AWAITING_HUMAN" "GitHub PR (process) → README"
echo ""

echo "=============================================================="
echo "Phase 4: Slack Notification Verification"
echo "=============================================================="
echo ""
echo "Check your Slack channel for approval messages for the following drifts:"
echo "  - drift-gh-pr-readme-1"
echo "  - drift-pd-confluence-1"
echo "  - drift-gh-pr-ownership"
echo ""
echo "Expected: 6 Slack messages (one for each AWAITING_HUMAN drift)"
echo ""

echo "=============================================================="
echo "Phase 5: Approval Flow Test"
echo "=============================================================="
echo ""

# Test 7: Approve a drift and verify state transitions
echo "Test 7: Approve drift and verify writeback preparation"
echo "Approving drift: drift-gh-pr-readme-1"

curl -s -X POST "$API_URL/api/test/approve-drift" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\": \"$WORKSPACE_ID\", \"driftId\": \"drift-gh-pr-readme-1\"}" \
  > /dev/null 2>&1

echo "✅ Approved drift-gh-pr-readme-1"
echo "Running state machine to complete writeback..."

run_state_machine "drift-gh-pr-readme-1" 10

# Check if it reached COMPLETED or WRITTEN_BACK
final_state=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
  SELECT state FROM drift_candidates WHERE id = 'drift-gh-pr-readme-1';
" | tr -d ' ')

if [ "$final_state" = "COMPLETED" ] || [ "$final_state" = "WRITTEN_BACK" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Approval flow completed (state: $final_state)"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ FAIL${NC}: Approval flow incomplete (state: $final_state)"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""

echo "=============================================================="
echo "Phase 6: Writeback Verification"
echo "=============================================================="
echo ""
echo "For GitHub README target:"
echo "  - Check GitHub for new PR created by VertaAI bot"
echo "  - PR should update README.md with drift content"
echo ""
echo "For Confluence target (drift-pd-confluence-1):"
echo "  - Approve the drift manually or via API"
echo "  - Check Confluence page 163950 for updates"
echo ""

echo "=============================================================="
echo "Test Summary"
echo "=============================================================="
echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Review output above.${NC}"
  exit 1
fi

