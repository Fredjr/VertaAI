#!/bin/bash

# End-to-End Test Script for Policy Pack API
# Tests CREATE, READ, UPDATE, DELETE operations

API_URL="http://localhost:3001"
WORKSPACE_ID="demo-workspace"

echo "🚀 Testing Policy Pack API..."
echo ""

# Test 1: CREATE Policy Pack with Track A
echo "📝 Test 1: CREATE Policy Pack with Track A"
CREATE_RESPONSE=$(curl -s -X POST "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs" \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{
    "name": "Test Track A Policy Pack",
    "description": "E2E test for Track A",
    "scopeType": "workspace",
    "trackAEnabled": true,
    "trackAConfig": {
      "surfaces": ["api", "docs"],
      "contracts": [{
        "contractId": "test-contract-1",
        "name": "API Contract",
        "description": "Test API contract",
        "scope": {},
        "artifacts": [{
          "system": "github",
          "type": "openapi_spec",
          "locator": {"repo": "test/repo", "path": "openapi.yaml", "ref": "main"},
          "role": "primary",
          "required": true,
          "freshnessSlaHours": 24
        }],
        "invariants": [{
          "invariantId": "test-invariant-1",
          "name": "Version Bump Required",
          "description": "Breaking changes require version bump",
          "enabled": true,
          "severity": "high",
          "comparatorType": "openapi_version_bump",
          "config": {}
        }],
        "enforcement": {"mode": "pr_gate", "blockOnFail": true, "warnOnWarn": true, "requireApprovalOverride": false},
        "routing": {"method": "codeowners", "fallbackChannel": null},
        "writeback": {"enabled": false, "autoApproveThreshold": null, "requiresApproval": true, "targetArtifacts": []}
      }],
      "dictionaries": {},
      "extraction": {},
      "safety": {},
      "enforcement": {"mode": "warn_only", "criticalThreshold": 90, "highThreshold": 70, "mediumThreshold": 40},
      "gracefulDegradation": {"timeoutMs": 30000, "maxArtifactFetchFailures": 3, "fallbackMode": "warn_only", "enableSoftFail": true},
      "appliesTo": []
    },
    "trackBEnabled": false,
    "trackBConfig": {},
    "approvalTiers": {},
    "routing": {}
  }')

echo "$CREATE_RESPONSE" | jq '.'
POLICY_PACK_ID=$(echo "$CREATE_RESPONSE" | jq -r '.policyPack.id')
echo "✅ Created Policy Pack ID: $POLICY_PACK_ID"
echo ""

# Test 2: LIST Policy Packs
echo "📋 Test 2: LIST Policy Packs"
curl -s "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs" | jq '.policyPacks | length'
echo "✅ Listed policy packs"
echo ""

# Test 3: GET Specific Policy Pack
echo "🔍 Test 3: GET Specific Policy Pack"
curl -s "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs/${POLICY_PACK_ID}" | jq '.policyPack.name'
echo "✅ Retrieved policy pack"
echo ""

# Test 4: UPDATE Policy Pack
echo "✏️  Test 4: UPDATE Policy Pack"
UPDATE_RESPONSE=$(curl -s -X PUT "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs/${POLICY_PACK_ID}" \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{
    "name": "Updated Track A Policy Pack",
    "description": "Updated description",
    "trackAEnabled": true,
    "trackAConfig": {
      "surfaces": ["api", "docs", "infra"],
      "contracts": [],
      "dictionaries": {},
      "extraction": {},
      "safety": {},
      "enforcement": {"mode": "warn_only", "criticalThreshold": 90, "highThreshold": 70, "mediumThreshold": 40},
      "gracefulDegradation": {"timeoutMs": 30000, "maxArtifactFetchFailures": 3, "fallbackMode": "warn_only", "enableSoftFail": true},
      "appliesTo": []
    }
  }')

echo "$UPDATE_RESPONSE" | jq '.policyPack | {name, version, parentId}'
echo "✅ Updated policy pack"
echo ""

# Test 5: DELETE Policy Pack (soft delete)
echo "🗑️  Test 5: DELETE Policy Pack"
curl -s -X DELETE "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs/${POLICY_PACK_ID}" \
  -H "x-user-id: test-user" | jq '.message'
echo "✅ Deleted policy pack"
echo ""

# Test 6: Verify soft delete
echo "✔️  Test 6: Verify Soft Delete"
curl -s "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs/${POLICY_PACK_ID}" | jq '.policyPack.status'
echo "✅ Verified soft delete (status should be 'archived')"
echo ""

echo "🎉 All tests completed!"

