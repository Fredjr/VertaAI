#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3001}"
WORKSPACE_ID="demo-workspace"

echo -e "${YELLOW}=== Testing UI Field Mapping & Template Selection ===${NC}\n"

# Step 1: Create baseline pack via admin endpoint
echo -e "${YELLOW}Step 1: Creating baseline pack via admin endpoint...${NC}"
RESPONSE=$(curl -s -X POST "${API_URL}/api/admin/create-baseline-pack")
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success' > /dev/null; then
  PACK_ID=$(echo "$RESPONSE" | jq -r '.pack.id')
  echo -e "${GREEN}✅ Baseline pack created: ${PACK_ID}${NC}\n"
else
  echo -e "${RED}❌ Failed to create baseline pack${NC}"
  exit 1
fi

# Step 2: Verify pack is in database
echo -e "${YELLOW}Step 2: Verifying pack is in database...${NC}"
PACK_RESPONSE=$(curl -s "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs/${PACK_ID}")
echo "$PACK_RESPONSE" | jq '.policyPack | {id, name, packStatus, trackAEnabled, packMetadataId}'

if echo "$PACK_RESPONSE" | jq -e '.policyPack.trackAEnabled' > /dev/null; then
  echo -e "${GREEN}✅ Pack verified in database${NC}\n"
else
  echo -e "${RED}❌ Pack not found in database${NC}"
  exit 1
fi

# Step 3: Check YAML contains expected fields
echo -e "${YELLOW}Step 3: Checking YAML contains expected fields...${NC}"
YAML=$(echo "$PACK_RESPONSE" | jq -r '.policyPack.trackAConfigYamlPublished')

echo "Checking for required fields in YAML..."
echo "$YAML" | grep -q "packMode:" && echo -e "${GREEN}✅ packMode found${NC}" || echo -e "${RED}❌ packMode missing${NC}"
echo "$YAML" | grep -q "scopePriority:" && echo -e "${GREEN}✅ scopePriority found${NC}" || echo -e "${RED}❌ scopePriority missing${NC}"
echo "$YAML" | grep -q "scopeMergeStrategy:" && echo -e "${GREEN}✅ scopeMergeStrategy found${NC}" || echo -e "${RED}❌ scopeMergeStrategy missing${NC}"
echo "$YAML" | grep -q "packType:" && echo -e "${GREEN}✅ packType found${NC}" || echo -e "${RED}❌ packType missing${NC}"

echo ""

# Step 4: List all published packs
echo -e "${YELLOW}Step 4: Listing all published packs for workspace...${NC}"
PACKS_RESPONSE=$(curl -s "${API_URL}/api/workspaces/${WORKSPACE_ID}/policy-packs")
echo "$PACKS_RESPONSE" | jq '.policyPacks[] | {id, name, packStatus, trackAEnabled, packMetadataId}'

echo ""
echo -e "${GREEN}=== Test Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Start web server: cd apps/web && pnpm dev"
echo "2. Navigate to: http://localhost:3000/policy-packs/new?workspace=demo-workspace"
echo "3. Follow testing plan in TESTING_PLAN_UI_FIELD_MAPPING.md"
echo ""
echo "To create a test PR:"
echo "  cd /tmp/vertaai-e2e-test"
echo "  git checkout -b test-ui-field-mapping"
echo "  echo 'test' >> README.md"
echo "  git add README.md"
echo "  git commit -m 'test: UI field mapping'"
echo "  git push origin test-ui-field-mapping"
echo "  gh pr create --title 'Test: UI Field Mapping' --body 'Testing UI field mapping fixes'"

