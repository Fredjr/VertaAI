#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Create Baseline Pack in Production ===${NC}\n"

# Step 1: Get production API URL
echo -e "${YELLOW}Step 1: Finding production API URL...${NC}"
echo ""
echo "Please provide the production API URL."
echo "You can find it by:"
echo "  1. Railway dashboard → vertaai-api service → Settings → Public URL"
echo "  2. Vercel dashboard → verta-ai-pearl → Settings → Environment Variables → NEXT_PUBLIC_API_URL"
echo "  3. Browser DevTools → Network tab → Look for API requests"
echo ""
read -p "Enter production API URL (e.g., https://vertaai-api-production.up.railway.app): " API_URL

# Remove trailing slash if present
API_URL=${API_URL%/}

echo -e "\n${BLUE}Using API URL: ${API_URL}${NC}\n"

# Step 2: Test API connectivity
echo -e "${YELLOW}Step 2: Testing API connectivity...${NC}"
HEALTH_CHECK=$(curl -s -w "\n%{http_code}" "${API_URL}/health" 2>&1 || echo "000")
HTTP_CODE=$(echo "$HEALTH_CHECK" | tail -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ API is reachable${NC}\n"
else
  echo -e "${RED}❌ API health check failed (HTTP ${HTTP_CODE})${NC}"
  echo "Response: $HEALTH_CHECK"
  echo ""
  echo "Please verify:"
  echo "  - API URL is correct"
  echo "  - API is deployed and running"
  echo "  - No firewall/CORS issues"
  exit 1
fi

# Step 3: Create baseline pack
echo -e "${YELLOW}Step 3: Creating baseline pack via admin endpoint...${NC}"
RESPONSE=$(curl -s -X POST "${API_URL}/api/admin/create-baseline-pack" 2>&1)

# Check if response is valid JSON
if echo "$RESPONSE" | jq -e '.' >/dev/null 2>&1; then
  echo "$RESPONSE" | jq '.'
  
  # Check if successful
  if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    PACK_ID=$(echo "$RESPONSE" | jq -r '.pack.id')
    PACK_NAME=$(echo "$RESPONSE" | jq -r '.pack.name')
    echo ""
    echo -e "${GREEN}✅ Baseline pack created successfully!${NC}"
    echo -e "${GREEN}   Pack ID: ${PACK_ID}${NC}"
    echo -e "${GREEN}   Pack Name: ${PACK_NAME}${NC}\n"
  else
    echo ""
    echo -e "${RED}❌ Failed to create baseline pack${NC}"
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
    echo -e "${RED}   Error: ${ERROR}${NC}\n"
    exit 1
  fi
else
  echo -e "${RED}❌ Invalid response from API${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi

# Step 4: Verify pack in database
echo -e "${YELLOW}Step 4: Verifying pack in database...${NC}"
PACK_LIST=$(curl -s "${API_URL}/api/workspaces/demo-workspace/policy-packs" 2>&1)

if echo "$PACK_LIST" | jq -e '.policyPacks' >/dev/null 2>&1; then
  BASELINE_COUNT=$(echo "$PACK_LIST" | jq '[.policyPacks[] | select(.packMetadataId == "baseline-contract-integrity")] | length')
  
  if [ "$BASELINE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Baseline pack found in database${NC}"
    echo "$PACK_LIST" | jq '.policyPacks[] | select(.packMetadataId == "baseline-contract-integrity") | {id, name, packStatus, trackAEnabled}'
  else
    echo -e "${YELLOW}⚠️  Baseline pack not found in pack list${NC}"
    echo "This may be normal if the pack was just created."
  fi
else
  echo -e "${YELLOW}⚠️  Could not fetch pack list${NC}"
  echo "Response: $PACK_LIST"
fi

echo ""
echo -e "${GREEN}=== Success! ===${NC}"
echo ""
echo "Next steps:"
echo "  1. View pack in UI: https://verta-ai-pearl.vercel.app/policy-packs?workspace=demo-workspace"
echo "  2. Create test PR #23 to verify evaluation"
echo "  3. Check GitHub check run output"
echo ""
echo "To create test PR #23:"
echo "  cd /tmp/vertaai-e2e-test"
echo "  git checkout -b test-baseline-pack-pr23"
echo "  echo '# Testing Baseline Pack' >> README.md"
echo "  git add README.md"
echo "  git commit -m 'test: baseline pack evaluation (PR #23)'"
echo "  git push origin test-baseline-pack-pr23"
echo "  gh pr create --title 'Test: Baseline Pack Evaluation (PR #23)' --body '...'"
echo ""

