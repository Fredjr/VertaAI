// Source Evidence Builders
// Creates deterministic excerpts from different signal types
// Integrates with existing SignalEvent data structures

import { SourceEvidence, SourceArtifacts } from './types.js';

interface BuildSourceEvidenceArgs {
  signalEvent: any;
  parserArtifacts?: any;
}

/**
 * Main function to build source evidence from SignalEvent
 */
export async function buildSourceEvidence(args: BuildSourceEvidenceArgs): Promise<SourceEvidence> {
  const { signalEvent, parserArtifacts } = args;

  const sourceType = signalEvent.sourceType;
  const artifacts = await buildArtifactsForSourceType(sourceType, signalEvent, parserArtifacts);

  // Extract source ID from rawPayload for better identification
  let sourceId = signalEvent.id;
  if (sourceType === 'github_pr' && signalEvent.rawPayload?.pull_request?.number) {
    sourceId = `pr-${signalEvent.rawPayload.pull_request.number}`;
  } else if (sourceType === 'pagerduty_incident' && signalEvent.rawPayload?.incident?.id) {
    sourceId = signalEvent.rawPayload.incident.id;
  }

  return {
    sourceType: sourceType as SourceEvidence['sourceType'],
    sourceId,
    timestamp: signalEvent.occurredAt || signalEvent.createdAt,
    artifacts
  };
}

/**
 * Build artifacts based on source type
 */
async function buildArtifactsForSourceType(
  sourceType: string, 
  signalEvent: any, 
  parserArtifacts?: any
): Promise<SourceArtifacts> {
  switch (sourceType) {
    case 'github_pr':
      return buildGitHubPRArtifacts(signalEvent, parserArtifacts);
    
    case 'pagerduty_incident':
      return buildPagerDutyArtifacts(signalEvent, parserArtifacts);
    
    case 'slack_cluster':
      return buildSlackArtifacts(signalEvent, parserArtifacts);
    
    case 'datadog_alert':
    case 'grafana_alert':
      return buildAlertArtifacts(signalEvent, parserArtifacts);
    
    case 'github_iac':
      return buildIaCArtiacts(signalEvent, parserArtifacts);
    
    case 'github_codeowners':
      return buildCodeownersArtifacts(signalEvent, parserArtifacts);
    
    default:
      console.warn(`[SourceBuilders] Unknown source type: ${sourceType}`);
      return {};
  }
}

/**
 * Build GitHub PR artifacts from existing rawPayload
 */
function buildGitHubPRArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const rawPayload = signalEvent.rawPayload || {};
  const pullRequest = rawPayload.pull_request || {};
  const extracted = signalEvent.extracted || {};
  const prDiff = extracted.prDiff || {};

  // Get diff from existing extracted data or raw payload
  const diffText = prDiff.diffContent || extracted.diff || pullRequest.diff_url || '';
  const filesChanged = prDiff.filesChanged || extracted.filesChanged || [];

  // Create deterministic excerpt (max 2000 chars, line-bounded)
  const excerpt = createDeterministicExcerpt(diffText, 2000);

  return {
    prDiff: {
      excerpt: excerpt.text,
      linesAdded: prDiff.linesAdded || extracted.linesAdded || 0,
      linesRemoved: prDiff.linesRemoved || extracted.linesRemoved || 0,
      filesChanged: filesChanged,
      maxChars: 2000,
      lineBounded: excerpt.lineBounded
    }
  };
}

/**
 * Build PagerDuty incident artifacts
 */
function buildPagerDutyArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const rawPayload = signalEvent.rawPayload || {};
  const incident = rawPayload.incident || {};
  const extracted = signalEvent.extracted || {};
  const pagerdutyNormalized = extracted.pagerdutyNormalized || parserArtifacts?.pagerdutyNormalized || {};

  // Build timeline from incident data
  const timelineText = buildIncidentTimeline(incident, extracted, pagerdutyNormalized);
  const excerpt = createDeterministicExcerpt(timelineText, 1500);

  return {
    incidentTimeline: {
      excerpt: excerpt.text,
      severity: pagerdutyNormalized.severity || signalEvent.severity || incident.urgency || 'unknown',
      duration: extracted.duration || 'unknown',
      responders: pagerdutyNormalized.responders || signalEvent.responders || [],
      maxChars: 1500,
      lineBounded: excerpt.lineBounded,
      timelineExcerpt: excerpt.text
    }
  };
}

/**
 * Build Slack cluster artifacts
 */
function buildSlackArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const rawPayload = signalEvent.rawPayload || {};
  const extracted = signalEvent.extracted || {};
  const slackCluster = extracted.slackCluster || parserArtifacts?.slackCluster || {};

  // Get messages from cluster
  const messages = slackCluster.messages || rawPayload.messages || [];
  const messagesText = messages.map((m: any) => `${m.user}: ${m.text}`).join('\n');
  const excerpt = createDeterministicExcerpt(messagesText, 1800);

  return {
    slackMessages: {
      excerpt: excerpt.text,
      messageCount: slackCluster.messageCount || signalEvent.messageCount || messages.length || 0,
      participants: extracted.participants || [],
      timespan: extracted.timespan || 'unknown',
      maxChars: 1800,
      lineBounded: excerpt.lineBounded,
      theme: slackCluster.theme,
      userCount: slackCluster.uniqueUsers || messages.length,
      messagesExcerpt: excerpt.text
    }
  };
}

/**
 * Build alert artifacts (Datadog/Grafana)
 */
function buildAlertArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const rawPayload = signalEvent.rawPayload || {};
  const extracted = signalEvent.extracted || {};
  const alertNormalized = extracted.alertNormalized || parserArtifacts?.alertNormalized || {};

  const alertText = buildAlertSummary(rawPayload, extracted, alertNormalized);
  const excerpt = createDeterministicExcerpt(alertText, 1200);

  return {
    alertData: {
      excerpt: excerpt.text,
      alertType: alertNormalized.alertType || extracted.alertType || 'unknown',
      severity: alertNormalized.severity || signalEvent.severity || 'unknown',
      affectedServices: alertNormalized.affectedServices || [],
      threshold: extracted.threshold || 'unknown',
      duration: extracted.duration || 'unknown',
      maxChars: 1200,
      lineBounded: excerpt.lineBounded
    }
  };
}

/**
 * Build IaC artifacts
 */
function buildIaCArtiacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const extracted = signalEvent.extracted || {};
  const iacSummary = extracted.iacSummary || parserArtifacts?.iacSummary || {};

  const changesText = buildIaCChangesText(extracted, iacSummary);
  const excerpt = createDeterministicExcerpt(changesText, 1600);

  return {
    iacChanges: {
      excerpt: excerpt.text,
      resourcesChanged: extracted.resourcesChanged || [],
      changeType: extracted.changeType || 'update',
      maxChars: 1600,
      lineBounded: excerpt.lineBounded,
      resourcesAdded: iacSummary.resourcesAdded || [],
      resourcesModified: iacSummary.resourcesModified || [],
      resourcesDeleted: iacSummary.resourcesDeleted || [],
      changeTypes: iacSummary.changeTypes || []
    }
  };
}

/**
 * Build CODEOWNERS artifacts
 */
function buildCodeownersArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const extracted = signalEvent.extracted || {};
  const codeownersDiff = extracted.codeownersDiff || parserArtifacts?.codeownersDiff || {};

  const ownershipText = buildOwnershipChangesText(extracted, codeownersDiff);
  const excerpt = createDeterministicExcerpt(ownershipText, 1000);

  return {
    ownershipChanges: {
      excerpt: excerpt.text,
      pathsChanged: extracted.pathsChanged || [],
      ownersAdded: codeownersDiff.ownersAdded || extracted.ownersAdded || [],
      ownersRemoved: codeownersDiff.ownersRemoved || extracted.ownersRemoved || [],
      maxChars: 1000,
      lineBounded: excerpt.lineBounded,
      pathsAdded: codeownersDiff.pathsAdded || [],
      pathsRemoved: codeownersDiff.pathsRemoved || []
    }
  };
}

/**
 * Create deterministic excerpt with line boundaries
 */
function createDeterministicExcerpt(text: string, maxChars: number): { text: string; lineBounded: boolean } {
  if (!text || text.length <= maxChars) {
    return { text: text || '', lineBounded: true };
  }
  
  // Find last complete line within maxChars
  const truncated = text.substring(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  
  if (lastNewline > maxChars * 0.7) {
    // Good line boundary found
    return { 
      text: truncated.substring(0, lastNewline) + '\n[...truncated]',
      lineBounded: true 
    };
  } else {
    // No good line boundary, truncate at char limit
    return { 
      text: truncated + '[...truncated]',
      lineBounded: false 
    };
  }
}

// Helper functions for building specific text summaries
function buildIncidentTimeline(incident: any, extracted: any, pagerdutyNormalized: any): string {
  const timeline = pagerdutyNormalized.timeline || [];
  const timelineText = timeline.map((t: any) => `${t.timestamp}: ${t.action} by ${t.user}`).join('\n');
  return `Incident: ${incident.title || 'Unknown'}\nStatus: ${incident.status || 'unknown'}\nSummary: ${incident.summary || extracted.summary || 'No summary available'}\nTimeline:\n${timelineText}`;
}

function buildAlertSummary(rawPayload: any, extracted: any, alertNormalized: any): string {
  return `Alert: ${rawPayload.alert_name || alertNormalized.alertType || 'Unknown'}\nCondition: ${rawPayload.condition || 'unknown'}\nValue: ${rawPayload.current_value || 'unknown'}\nSeverity: ${alertNormalized.severity || 'unknown'}`;
}

function buildIaCChangesText(extracted: any, iacSummary: any): string {
  const added = iacSummary.resourcesAdded || [];
  const modified = iacSummary.resourcesModified || [];
  const deleted = iacSummary.resourcesDeleted || [];
  return `IaC Changes: ${extracted.summary || 'Unknown changes'}\nAdded: ${added.join(', ')}\nModified: ${modified.join(', ')}\nDeleted: ${deleted.join(', ')}`;
}

function buildOwnershipChangesText(extracted: any, codeownersDiff: any): string {
  const pathsAdded = codeownersDiff.pathsAdded || [];
  const pathsRemoved = codeownersDiff.pathsRemoved || [];
  const ownersAdded = codeownersDiff.ownersAdded || extracted.ownersAdded || [];
  const ownersRemoved = codeownersDiff.ownersRemoved || extracted.ownersRemoved || [];
  return `Ownership Changes:\nPaths Added: ${pathsAdded.join(', ')}\nPaths Removed: ${pathsRemoved.join(', ')}\nOwners Added: ${ownersAdded.join(', ')}\nOwners Removed: ${ownersRemoved.join(', ')}`;
}
