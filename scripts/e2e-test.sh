#!/bin/bash
# E2E Test Script for Phase 1-5 Integration
# Tests all input sources, output targets, and acceptance criteria

set -e

API_URL="http://localhost:3001"
WORKSPACE_ID="63e8e9d1-c09d-4dd0-a921-6e54df1724ac"

echo "========================================="
echo "Phase 1-5 E2E Test Suite"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0

# Test function
test_api() {
  local test_name="$1"
  local endpoint="$2"
  local expected_status="${3:-200}"
  
  echo -n "Testing: $test_name... "
  
  response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint")
  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$status_code" = "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $status_code)"
    ((pass_count++))
    return 0
  else
    echo -e "${RED}❌ FAIL${NC} (Expected HTTP $expected_status, got $status_code)"
    echo "Response: $body"
    ((fail_count++))
    return 1
  fi
}

echo "========================================="
echo "Test Suite 1: API Health & Connectivity"
echo "========================================="
echo ""

test_api "Health Check" "/health"
test_api "Workspaces List" "/api/workspaces"

echo ""
echo "========================================="
echo "Test Suite 2: Coverage Monitoring (Phase 3 Week 6)"
echo "========================================="
echo ""

test_api "Coverage Current Metrics" "/api/coverage/current?workspaceId=$WORKSPACE_ID"
test_api "Coverage Snapshots" "/api/coverage/snapshots?workspaceId=$WORKSPACE_ID&limit=10"
test_api "Coverage Trends" "/api/coverage/trends?workspaceId=$WORKSPACE_ID&days=7"
test_api "Coverage Alerts" "/api/coverage/alerts?workspaceId=$WORKSPACE_ID"

echo ""
echo "========================================="
echo "Test Suite 3: DriftPlan Management (Phase 3 Week 5)"
echo "========================================="
echo ""

test_api "Plan Templates List" "/api/plans/templates"
test_api "Microservice Template" "/api/plans/templates/microservice"
test_api "API Gateway Template" "/api/plans/templates/api_gateway"
test_api "Database Template" "/api/plans/templates/database"
test_api "Infrastructure Template" "/api/plans/templates/infrastructure"
test_api "Security Template" "/api/plans/templates/security"

echo ""
echo "========================================="
echo "Test Suite 4: Audit Trail (Phase 4 Week 8)"
echo "========================================="
echo ""

test_api "Audit Logs" "/api/audit/logs?workspaceId=$WORKSPACE_ID&limit=10"
test_api "Audit Retention Policy" "/api/audit/retention/policy?workspaceId=$WORKSPACE_ID&framework=SOX"
test_api "Evidence Bundle Retention Stats" "/api/audit/retention/evidence-bundles/stats?workspaceId=$WORKSPACE_ID"

echo ""
echo "========================================="
echo "Test Suite 5: Compliance Reporting (Phase 4 Week 8)"
echo "========================================="
echo ""

# Test compliance report generation
echo -n "Testing: Generate SOX Compliance Report... "
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/audit/compliance/report" \
  -H "Content-Type: application/json" \
  -d "{
    \"workspaceId\": \"$WORKSPACE_ID\",
    \"reportType\": \"SOX\",
    \"startDate\": \"2026-01-01T00:00:00Z\",
    \"endDate\": \"2026-02-08T23:59:59Z\",
    \"generatedBy\": \"e2e-test\"
  }")
status_code=$(echo "$response" | tail -n1)
if [ "$status_code" = "200" ]; then
  echo -e "${GREEN}✅ PASS${NC} (HTTP $status_code)"
  ((pass_count++))
else
  echo -e "${RED}❌ FAIL${NC} (Expected HTTP 200, got $status_code)"
  ((fail_count++))
fi

echo ""
echo "========================================="
echo "Test Suite 6: Create Test Data"
echo "========================================="
echo ""

# Create a test drift plan
echo -n "Testing: Create Test Drift Plan... "
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/plans" \
  -H "Content-Type: application/json" \
  -d "{
    \"workspaceId\": \"$WORKSPACE_ID\",
    \"name\": \"E2E Test Plan\",
    \"description\": \"Test plan created by E2E test suite\",
    \"scopeType\": \"workspace\",
    \"scopeRef\": \"$WORKSPACE_ID\",
    \"primaryDocId\": \"test-doc-123\",
    \"primaryDocSystem\": \"confluence\",
    \"docClass\": \"runbook\",
    \"config\": {
      \"inputSources\": [\"github_pr\", \"pagerduty_incident\"],
      \"driftTypes\": [\"instruction\", \"process\"],
      \"allowedOutputs\": [\"confluence\"],
      \"thresholds\": {
        \"minConfidence\": 0.6,
        \"minImpactScore\": 0.5,
        \"minDriftScore\": 0.5
      }
    },
    \"templateId\": \"microservice\",
    \"createdBy\": \"e2e-test\"
  }")
status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
if [ "$status_code" = "201" ]; then
  echo -e "${GREEN}✅ PASS${NC} (HTTP $status_code)"
  plan_id=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Created plan ID: $plan_id"
  ((pass_count++))
else
  echo -e "${RED}❌ FAIL${NC} (Expected HTTP 201, got $status_code)"
  echo "Response: $body"
  ((fail_count++))
fi

echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo ""
echo "Total Tests: $((pass_count + fail_count))"
echo -e "${GREEN}Passed: $pass_count${NC}"
echo -e "${RED}Failed: $fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  exit 1
fi

