/**
 * Gap #9: Cluster-First Drift Triage - Slack Message Builder
 * 
 * Builds Slack Block Kit messages for drift clusters with bulk actions.
 */

import type { DriftClusterData } from './types.js';

export interface ClusterSlackMessage {
  channel: string;
  text: string;
  blocks: any[];
}

export interface DriftSummary {
  id: string;
  service: string;
  driftType: string;
  confidence: number;
  sourceType: string;
  sourceRef: string; // PR number, incident ID, etc.
  docTitle: string;
  patchId: string;
  hasCoverageGap?: boolean; // Gap #2: Coverage as orthogonal dimension
}

/**
 * Build Slack message for drift cluster
 * Shows summary of all drifts in cluster with bulk action buttons
 */
export function buildClusterSlackMessage(
  cluster: DriftClusterData,
  drifts: DriftSummary[],
  targetChannel: string
): ClusterSlackMessage {
  const blocks: any[] = [];

  // 1. Header with cluster info
  const driftTypeEmoji = getDriftTypeEmoji(cluster.driftType);

  // Gap #2: Check if any drifts in cluster have coverage gap
  const hasCoverageGap = drifts.some(d => d.hasCoverageGap === true);
  const headerText = hasCoverageGap
    ? `${driftTypeEmoji} ${cluster.driftCount} Similar Drifts Detected + 📊 Coverage Gap`
    : `${driftTypeEmoji} ${cluster.driftCount} Similar Drifts Detected`;

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: headerText,
      emoji: true,
    },
  });

  // 2. Cluster summary section
  const summaryText = buildClusterSummary(cluster, drifts);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: summaryText,
    },
  });

  blocks.push({ type: 'divider' });

  // 3. Individual drift list (show first 5, then "and X more")
  const maxDriftsToShow = 5;
  const driftsToShow = drifts.slice(0, maxDriftsToShow);
  const remainingCount = drifts.length - maxDriftsToShow;

  driftsToShow.forEach((drift, index) => {
    const driftText = buildDriftSummaryText(drift, index + 1);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: driftText,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Review', emoji: true },
        value: `review_individual:${drift.patchId}`,
        action_id: `review_individual_${drift.patchId}`,
      },
    });
  });

  if (remainingCount > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_...and ${remainingCount} more similar drift${remainingCount > 1 ? 's' : ''}_`,
        },
      ],
    });
  }

  blocks.push({ type: 'divider' });

  // 4. Bulk action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve All', emoji: true },
        style: 'primary',
        value: `approve_cluster:${cluster.id}`,
        action_id: `approve_cluster_${cluster.id}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '👀 Review Individually', emoji: true },
        value: `review_cluster:${cluster.id}`,
        action_id: `review_cluster_${cluster.id}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject All', emoji: true },
        style: 'danger',
        value: `reject_cluster:${cluster.id}`,
        action_id: `reject_cluster_${cluster.id}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '💤 Snooze All 48h', emoji: true },
        value: `snooze_cluster:${cluster.id}`,
        action_id: `snooze_cluster_${cluster.id}`,
      },
    ],
  });

  // 5. Context footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Cluster ID: \`${cluster.id.substring(0, 8)}\` | Service: *${cluster.service}* | Type: *${cluster.driftType}*`,
      },
    ],
  });

  // Build fallback text
  const fallbackText = `${driftTypeEmoji} ${cluster.driftCount} similar ${cluster.driftType} drifts detected in ${cluster.service}`;

  return {
    channel: targetChannel,
    text: fallbackText,
    blocks,
  };
}

/**
 * Get emoji for drift type
 */
function getDriftTypeEmoji(driftType: string): string {
  const emojiMap: Record<string, string> = {
    instruction: '📋',
    process: '🔄',
    ownership: '👥',
    coverage: '📊',
    environment: '🔧',
  };
  return emojiMap[driftType] || '📝';
}

/**
 * Build cluster summary text
 */
function buildClusterSummary(cluster: DriftClusterData, drifts: DriftSummary[]): string {
  const avgConfidence = drifts.reduce((sum, d) => sum + d.confidence, 0) / drifts.length;
  const uniqueSources = new Set(drifts.map(d => d.sourceType)).size;

  let summary = `*Service:* ${cluster.service}\n`;
  summary += `*Drift Type:* ${cluster.driftType}\n`;
  summary += `*Pattern:* ${cluster.fingerprintPattern}\n`;
  summary += `*Count:* ${cluster.driftCount} similar drift${cluster.driftCount > 1 ? 's' : ''}\n`;
  summary += `*Avg Confidence:* ${(avgConfidence * 100).toFixed(0)}%\n`;
  summary += `*Sources:* ${uniqueSources} source type${uniqueSources > 1 ? 's' : ''}\n`;

  return summary;
}

/**
 * Build individual drift summary text
 */
function buildDriftSummaryText(drift: DriftSummary, index: number): string {
  const confidencePercent = (drift.confidence * 100).toFixed(0);
  const sourceIcon = getSourceIcon(drift.sourceType);

  let text = `*${index}.* ${sourceIcon} *${drift.sourceRef}*\n`;
  text += `   📄 ${drift.docTitle}\n`;
  text += `   📊 Confidence: ${confidencePercent}%`;

  // Gap #2: Show coverage gap indicator
  if (drift.hasCoverageGap) {
    text += ` + 📊 Coverage Gap`;
  }

  return text;
}

/**
 * Get icon for source type
 */
function getSourceIcon(sourceType: string): string {
  const iconMap: Record<string, string> = {
    github_pr: '🔀',
    pagerduty_incident: '🚨',
    slack_cluster: '💬',
    datadog_alert: '📈',
    grafana_alert: '📊',
    github_iac: '🏗️',
    github_codeowners: '👥',
  };
  return iconMap[sourceType] || '📝';
}

