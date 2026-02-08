// Zero-LLM Slack Message Builder from EvidenceBundle
// Phase 4 Week 7: Build Slack messages deterministically from evidence bundles
// No LLM calls - pure template-based message generation

import { EvidenceBundle } from './types.js';

type ImpactBand = 'low' | 'medium' | 'high' | 'critical';

export interface SlackMessageBlocks {
  channel: string;
  text: string;
  blocks: any[];
}

/**
 * Build Slack message from EvidenceBundle without LLM
 * Pure deterministic template-based generation
 */
export function buildSlackMessageFromEvidence(
  bundle: EvidenceBundle,
  patchId: string,
  targetChannel: string,
  ownerName: string
): SlackMessageBlocks {
  const blocks: any[] = [];

  // 1. Header with impact band
  const impactEmoji = getImpactEmoji(bundle.assessment.impactBand);
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${impactEmoji} Drift Detected: ${bundle.assessment.impactBand.toUpperCase()} Impact`,
      emoji: true,
    },
  });

  // 2. Summary section
  const summary = buildSummaryText(bundle);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: summary,
    },
  });

  // 3. Claims section (what doc currently says)
  if (bundle.targetEvidence.claims.length > 0) {
    const claimsText = bundle.targetEvidence.claims
      .slice(0, 3) // Show top 3 claims
      .map((claim) => `• ${claim.snippet}`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📄 Current Documentation Claims:*\n${claimsText}`,
      },
    });
  }

  // 4. Reality section (what signal shows)
  const realityText = buildRealityText(bundle);
  if (realityText) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔍 Signal Evidence:*\n${realityText}`,
      },
    });
  }

  // 5. Fired rules section (impact rules that triggered)
  if (bundle.assessment.firedRules.length > 0) {
    const rulesText = bundle.assessment.firedRules
      .slice(0, 3) // Show top 3 rules
      .map((rule) => `• ${rule}`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Impact Rules Triggered:*\n${rulesText}`,
      },
    });
  }

  // 6. Impact assessment
  const impactText = buildImpactText(bundle);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: impactText,
    },
  });

  // 7. Divider
  blocks.push({ type: 'divider' });

  // 8. Action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve', emoji: true },
        style: 'primary',
        value: `approve:${patchId}`,
        action_id: `approve_${patchId}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit', emoji: true },
        value: `edit:${patchId}`,
        action_id: `edit_${patchId}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        style: 'danger',
        value: `reject:${patchId}`,
        action_id: `reject_${patchId}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '💤 Snooze 48h', emoji: true },
        value: `snooze:${patchId}`,
        action_id: `snooze_${patchId}`,
      },
    ],
  });

  // 9. Context footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Impact Score: ${bundle.assessment.impactScore.toFixed(3)} | Fingerprint: \`${bundle.fingerprints.strict.substring(0, 12)}...\``,
      },
    ],
  });

  // Build fallback text
  const fallbackText = `${impactEmoji} Drift detected: ${bundle.assessment.impactBand} impact. ${bundle.assessment.firedRules.length} rules triggered.`;

  return {
    channel: targetChannel,
    text: fallbackText,
    blocks,
  };
}

/**
 * Get emoji for impact band
 */
function getImpactEmoji(impactBand: ImpactBand): string {
  const emojiMap: Record<ImpactBand, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };
  return emojiMap[impactBand] || '⚪';
}

/**
 * Build summary text from bundle
 */
function buildSummaryText(bundle: EvidenceBundle): string {
  const source = bundle.sourceEvidence;
  const sourceType = source.sourceType;

  let summary = `*Source:* ${formatSourceType(sourceType)}\n`;

  // Add source-specific details from artifacts
  const artifacts = source.artifacts;
  if (sourceType === 'github_pr' && artifacts.prDiff) {
    summary += `*Files Changed:* ${artifacts.prDiff.filesChanged.length}\n`;
    summary += `*Lines:* +${artifacts.prDiff.linesAdded} -${artifacts.prDiff.linesRemoved}\n`;
  } else if (sourceType === 'pagerduty_incident' && artifacts.incidentTimeline) {
    summary += `*Severity:* ${artifacts.incidentTimeline.severity}\n`;
    summary += `*Duration:* ${artifacts.incidentTimeline.duration}\n`;
  } else if (sourceType === 'slack_cluster' && artifacts.slackMessages) {
    summary += `*Messages:* ${artifacts.slackMessages.messageCount}\n`;
    summary += `*Participants:* ${artifacts.slackMessages.participants.length}\n`;
  } else if (sourceType.includes('alert') && artifacts.alertData) {
    summary += `*Alert Type:* ${artifacts.alertData.alertType}\n`;
    summary += `*Severity:* ${artifacts.alertData.severity || 'unknown'}\n`;
  }

  summary += `*Doc:* ${bundle.targetEvidence.docTitle || 'Documentation'}`;

  return summary;
}

/**
 * Build reality text from source evidence
 */
function buildRealityText(bundle: EvidenceBundle): string | null {
  const source = bundle.sourceEvidence;
  const artifacts = source.artifacts;

  // Show excerpt from PR diff
  if (artifacts.prDiff?.excerpt) {
    const truncated = artifacts.prDiff.excerpt.length > 300
      ? artifacts.prDiff.excerpt.substring(0, 300) + '...'
      : artifacts.prDiff.excerpt;
    return `\`\`\`${truncated}\`\`\``;
  }

  // Show excerpt from incident timeline
  if (artifacts.incidentTimeline?.excerpt) {
    const truncated = artifacts.incidentTimeline.excerpt.length > 300
      ? artifacts.incidentTimeline.excerpt.substring(0, 300) + '...'
      : artifacts.incidentTimeline.excerpt;
    return `\`\`\`${truncated}\`\`\``;
  }

  // Show excerpt from Slack messages
  if (artifacts.slackMessages?.excerpt) {
    const truncated = artifacts.slackMessages.excerpt.length > 300
      ? artifacts.slackMessages.excerpt.substring(0, 300) + '...'
      : artifacts.slackMessages.excerpt;
    return `\`\`\`${truncated}\`\`\``;
  }

  // Show excerpt from alert data
  if (artifacts.alertData?.excerpt) {
    const truncated = artifacts.alertData.excerpt.length > 300
      ? artifacts.alertData.excerpt.substring(0, 300) + '...'
      : artifacts.alertData.excerpt;
    return `\`\`\`${truncated}\`\`\``;
  }

  // Show changed files for PR
  if (artifacts.prDiff?.filesChanged && artifacts.prDiff.filesChanged.length > 0) {
    const files = artifacts.prDiff.filesChanged.slice(0, 5).join(', ');
    return `Changed files: ${files}${artifacts.prDiff.filesChanged.length > 5 ? '...' : ''}`;
  }

  return null;
}

/**
 * Build impact assessment text
 */
function buildImpactText(bundle: EvidenceBundle): string {
  const assessment = bundle.assessment;

  let text = `*Impact Assessment:*\n`;
  text += `• Band: ${assessment.impactBand.toUpperCase()}\n`;
  text += `• Score: ${assessment.impactScore.toFixed(3)}\n`;
  text += `• Rules Fired: ${assessment.firedRules.length}\n`;

  if (assessment.consequenceText) {
    text += `• Consequence: ${assessment.consequenceText}`;
  }

  return text;
}

/**
 * Format source type for display
 */
function formatSourceType(sourceType: string): string {
  const typeMap: Record<string, string> = {
    github_pr: 'GitHub PR',
    pagerduty_incident: 'PagerDuty Incident',
    slack_cluster: 'Slack Discussion',
    datadog_alert: 'Datadog Alert',
    grafana_alert: 'Grafana Alert',
    github_iac: 'GitHub IaC',
    github_codeowners: 'GitHub CODEOWNERS',
    github_swagger: 'GitHub Swagger/OpenAPI',
  };
  return typeMap[sourceType] || sourceType;
}


