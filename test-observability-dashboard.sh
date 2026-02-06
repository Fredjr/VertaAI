#!/bin/bash
# Pipeline Health Observability Dashboard Test
# Tests the new F7 observability metrics for tracking pipeline health

set -e

API_URL="${API_URL:-https://vertaai-api-production.up.railway.app}"

echo "=========================================="
echo "Pipeline Health Observability Dashboard"
echo "=========================================="
echo ""
echo "API: $API_URL"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# Fetch metrics
METRICS=$(curl -s "$API_URL/api/metrics")

echo "📊 PROPOSAL METRICS"
echo "===================="
TOTAL=$(echo "$METRICS" | jq -r '.total_proposals')
APPROVED=$(echo "$METRICS" | jq -r '.approved_count')
EDITED=$(echo "$METRICS" | jq -r '.edited_count')
REJECTED=$(echo "$METRICS" | jq -r '.rejected_count')
PENDING=$(echo "$METRICS" | jq -r '.pending_count')
APPROVAL_RATE=$(echo "$METRICS" | jq -r '.approval_rate')

echo "Total Proposals:    $TOTAL"
echo "Approved:           $APPROVED"
echo "Edited:             $EDITED"
echo "Rejected:           $REJECTED"
echo "Pending:            $PENDING"
echo "Approval Rate:      $APPROVAL_RATE%"
echo ""

echo "📄 DOC RESOLUTION BREAKDOWN (F7)"
echo "=================================="
MAPPING=$(echo "$METRICS" | jq -r '.doc_resolution.mapping_count')
SEARCH=$(echo "$METRICS" | jq -r '.doc_resolution.search_count')
PR_LINK=$(echo "$METRICS" | jq -r '.doc_resolution.pr_link_count')
UNKNOWN=$(echo "$METRICS" | jq -r '.doc_resolution.unknown_count')
NEEDS_MAPPING=$(echo "$METRICS" | jq -r '.doc_resolution.needs_mapping_count')
NEEDS_MAPPING_PCT=$(echo "$METRICS" | jq -r '.doc_resolution.needs_mapping_percentage')

echo "Mapping (P1):       $MAPPING"
echo "Search (P2):        $SEARCH"
echo "PR Link (P0):       $PR_LINK"
echo "Unknown:            $UNKNOWN"
echo "Needs Mapping:      $NEEDS_MAPPING ($NEEDS_MAPPING_PCT%)"
echo ""

# Calculate resolution method percentages
TOTAL_RESOLVED=$((MAPPING + SEARCH + PR_LINK + UNKNOWN))
if [ $TOTAL_RESOLVED -gt 0 ]; then
  MAPPING_PCT=$(awk "BEGIN {printf \"%.1f\", ($MAPPING / $TOTAL_RESOLVED) * 100}")
  SEARCH_PCT=$(awk "BEGIN {printf \"%.1f\", ($SEARCH / $TOTAL_RESOLVED) * 100}")
  PR_LINK_PCT=$(awk "BEGIN {printf \"%.1f\", ($PR_LINK / $TOTAL_RESOLVED) * 100}")
  
  echo "Resolution Method Distribution:"
  echo "  PR Link (P0):     $PR_LINK_PCT%"
  echo "  Mapping (P1):     $MAPPING_PCT%"
  echo "  Search (P2):      $SEARCH_PCT%"
  echo ""
fi

echo "⏱️  TIME TO HUMAN ACTION (F7)"
echo "=============================="
MEDIAN_MINUTES=$(echo "$METRICS" | jq -r '.time_to_action.median_minutes')
SAMPLE_SIZE=$(echo "$METRICS" | jq -r '.time_to_action.sample_size')

if [ "$MEDIAN_MINUTES" != "null" ]; then
  MEDIAN_HOURS=$(awk "BEGIN {printf \"%.1f\", $MEDIAN_MINUTES / 60}")
  echo "Median Time:        $MEDIAN_MINUTES minutes ($MEDIAN_HOURS hours)"
else
  echo "Median Time:        N/A (no data)"
fi
echo "Sample Size:        $SAMPLE_SIZE"
echo ""

echo "🚫 REJECTION REASONS (F7)"
echo "=========================="
REJECTION_REASONS=$(echo "$METRICS" | jq -r '.rejection_reasons')
if [ "$REJECTION_REASONS" != "{}" ]; then
  echo "$REJECTION_REASONS" | jq -r 'to_entries | .[] | "  \(.key): \(.value)"'
else
  echo "  No rejections recorded"
fi
echo ""

echo "📡 SOURCE BREAKDOWN (F7)"
echo "========================"
SOURCE_BREAKDOWN=$(echo "$METRICS" | jq -r '.source_breakdown')
if [ "$SOURCE_BREAKDOWN" != "{}" ]; then
  echo "$SOURCE_BREAKDOWN" | jq -r 'to_entries | .[] | "  \(.key): \(.value)"'
else
  echo "  No sources recorded"
fi
echo ""

echo "🎯 PIPELINE HEALTH INDICATORS"
echo "=============================="

# Health indicator 1: needs_mapping percentage
if [ "$NEEDS_MAPPING_PCT" != "null" ]; then
  NEEDS_MAPPING_FLOAT=$(echo "$NEEDS_MAPPING_PCT" | awk '{print int($1)}')
  if [ "$NEEDS_MAPPING_FLOAT" -lt 10 ]; then
    echo "✅ needs_mapping rate: HEALTHY ($NEEDS_MAPPING_PCT% < 10%)"
  elif [ "$NEEDS_MAPPING_FLOAT" -lt 25 ]; then
    echo "⚠️  needs_mapping rate: WARNING ($NEEDS_MAPPING_PCT% < 25%)"
  else
    echo "❌ needs_mapping rate: CRITICAL ($NEEDS_MAPPING_PCT% >= 25%)"
  fi
fi

# Health indicator 2: Approval rate
if [ "$APPROVAL_RATE" != "null" ] && [ "$TOTAL" -gt 0 ]; then
  APPROVAL_FLOAT=$(echo "$APPROVAL_RATE" | awk '{print int($1)}')
  if [ "$APPROVAL_FLOAT" -gt 70 ]; then
    echo "✅ Approval rate: HEALTHY ($APPROVAL_RATE% > 70%)"
  elif [ "$APPROVAL_FLOAT" -gt 50 ]; then
    echo "⚠️  Approval rate: WARNING ($APPROVAL_RATE% > 50%)"
  else
    echo "❌ Approval rate: CRITICAL ($APPROVAL_RATE% <= 50%)"
  fi
fi

# Health indicator 3: Time to action
if [ "$MEDIAN_MINUTES" != "null" ]; then
  MEDIAN_INT=$(echo "$MEDIAN_MINUTES" | awk '{print int($1)}')
  if [ "$MEDIAN_INT" -lt 60 ]; then
    echo "✅ Time to action: HEALTHY ($MEDIAN_MINUTES min < 1 hour)"
  elif [ "$MEDIAN_INT" -lt 240 ]; then
    echo "⚠️  Time to action: WARNING ($MEDIAN_MINUTES min < 4 hours)"
  else
    echo "❌ Time to action: SLOW ($MEDIAN_MINUTES min >= 4 hours)"
  fi
fi

echo ""
echo "=========================================="
echo "✅ Observability Dashboard Complete"
echo "=========================================="

