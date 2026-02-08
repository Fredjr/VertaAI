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
  
  return {
    sourceType: sourceType as SourceEvidence['sourceType'],
    sourceId: signalEvent.id,
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
  
  // Get diff from existing extracted data or raw payload
  const diffText = extracted.diff || pullRequest.diff_url || '';
  const filesChanged = extracted.filesChanged || [];
  
  // Create deterministic excerpt (max 2000 chars, line-bounded)
  const excerpt = createDeterministicExcerpt(diffText, 2000);
  
  return {
    prDiff: {
      excerpt: excerpt.text,
      linesAdded: extracted.linesAdded || 0,
      linesRemoved: extracted.linesRemoved || 0,
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
  
  // Build timeline from incident data
  const timelineText = buildIncidentTimeline(incident, extracted);
  const excerpt = createDeterministicExcerpt(timelineText, 1500);
  
  return {
    incidentTimeline: {
      excerpt: excerpt.text,
      severity: signalEvent.severity || incident.urgency || 'unknown',
      duration: extracted.duration || 'unknown',
      responders: signalEvent.responders || [],
      maxChars: 1500,
      lineBounded: excerpt.lineBounded
    }
  };
}

/**
 * Build Slack cluster artifacts
 */
function buildSlackArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const rawPayload = signalEvent.rawPayload || {};
  const extracted = signalEvent.extracted || {};
  
  // Get messages from cluster
  const messages = rawPayload.messages || [];
  const messagesText = messages.map((m: any) => `${m.user}: ${m.text}`).join('\n');
  const excerpt = createDeterministicExcerpt(messagesText, 1800);
  
  return {
    slackMessages: {
      excerpt: excerpt.text,
      messageCount: signalEvent.messageCount || messages.length || 0,
      participants: extracted.participants || [],
      timespan: extracted.timespan || 'unknown',
      maxChars: 1800,
      lineBounded: excerpt.lineBounded
    }
  };
}

/**
 * Build alert artifacts (Datadog/Grafana)
 */
function buildAlertArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const rawPayload = signalEvent.rawPayload || {};
  const extracted = signalEvent.extracted || {};
  
  const alertText = buildAlertSummary(rawPayload, extracted);
  const excerpt = createDeterministicExcerpt(alertText, 1200);
  
  return {
    alertData: {
      excerpt: excerpt.text,
      alertType: extracted.alertType || 'unknown',
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
  const iacSummary = parserArtifacts?.iacSummary || {};
  
  const changesText = buildIaCChangesText(extracted, iacSummary);
  const excerpt = createDeterministicExcerpt(changesText, 1600);
  
  return {
    iacChanges: {
      excerpt: excerpt.text,
      resourcesChanged: extracted.resourcesChanged || [],
      changeType: extracted.changeType || 'update',
      maxChars: 1600,
      lineBounded: excerpt.lineBounded
    }
  };
}

/**
 * Build CODEOWNERS artifacts
 */
function buildCodeownersArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const extracted = signalEvent.extracted || {};
  const codeownersDiff = parserArtifacts?.codeownersDiff || {};
  
  const ownershipText = buildOwnershipChangesText(extracted, codeownersDiff);
  const excerpt = createDeterministicExcerpt(ownershipText, 1000);
  
  return {
    ownershipChanges: {
      excerpt: excerpt.text,
      pathsChanged: extracted.pathsChanged || [],
      ownersAdded: extracted.ownersAdded || [],
      ownersRemoved: extracted.ownersRemoved || [],
      maxChars: 1000,
      lineBounded: excerpt.lineBounded
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
function buildIncidentTimeline(incident: any, extracted: any): string {
  return `Incident: ${incident.title || 'Unknown'}\nStatus: ${incident.status || 'unknown'}\nSummary: ${incident.summary || extracted.summary || 'No summary available'}`;
}

function buildAlertSummary(rawPayload: any, extracted: any): string {
  return `Alert: ${rawPayload.alert_name || 'Unknown'}\nCondition: ${rawPayload.condition || 'unknown'}\nValue: ${rawPayload.current_value || 'unknown'}`;
}

function buildIaCChangesText(extracted: any, iacSummary: any): string {
  return `IaC Changes: ${extracted.summary || 'Unknown changes'}\nResources: ${(extracted.resourcesChanged || []).join(', ')}`;
}

function buildOwnershipChangesText(extracted: any, codeownersDiff: any): string {
  return `Ownership Changes: ${extracted.summary || 'Unknown changes'}\nPaths: ${(extracted.pathsChanged || []).join(', ')}`;
}
