/**
 * Impact Inputs Type System
 * 
 * Defines source-specific input structures for impact assessment.
 * Each source type has its own normalized input format that feeds into
 * the impact assessment engine.
 */

import type { SourceEvidence, TargetEvidence, TargetSurface } from './types.js';

/**
 * Normalized inputs for impact assessment from different source types
 */
export interface ImpactInputs {
  sourceType: SourceEvidence['sourceType'];
  targetSurface: TargetSurface;
  
  // Common fields across all sources
  severity: 'low' | 'medium' | 'high' | 'critical';
  scope: {
    services: string[];
    teams: string[];
    systems: string[];
  };
  
  // Source-specific normalized data
  sourceSpecific: 
    | GitHubPRInputs
    | PagerDutyInputs
    | SlackInputs
    | AlertInputs
    | IaCInputs
    | CodeownersInputs
    | SwaggerInputs;
}

/**
 * GitHub PR specific inputs
 */
export interface GitHubPRInputs {
  type: 'github_pr';
  linesChanged: number;
  filesChanged: number;
  criticalFiles: string[]; // Files that match critical patterns (config, auth, etc.)
  deploymentRelated: boolean;
  authRelated: boolean;
  apiContractChanged: boolean;
}

/**
 * PagerDuty incident specific inputs
 */
export interface PagerDutyInputs {
  type: 'pagerduty_incident';
  incidentSeverity: 'low' | 'medium' | 'high' | 'critical';
  responderCount: number;
  duration: number; // in minutes
  isRecurring: boolean;
  affectedServices: string[];
}

/**
 * Slack cluster specific inputs
 */
export interface SlackInputs {
  type: 'slack_cluster';
  messageCount: number;
  participantCount: number;
  theme: string;
  urgencySignals: number; // Count of urgent keywords
  confusionSignals: number; // Count of confusion keywords
  escalationMentions: number; // @here, @channel, etc.
}

/**
 * Alert (DataDog/Grafana) specific inputs
 */
export interface AlertInputs {
  type: 'alert';
  alertSeverity: 'low' | 'medium' | 'high' | 'critical';
  alertType: string;
  threshold: string;
  duration: number; // in minutes
  affectedServices: string[];
  isRecurring: boolean;
}

/**
 * Infrastructure as Code specific inputs
 */
export interface IaCInputs {
  type: 'iac';
  resourcesAdded: number;
  resourcesModified: number;
  resourcesDeleted: number;
  changeTypes: string[]; // compute, network, storage, security, etc.
  criticalResources: string[]; // Resources matching critical patterns
  productionImpact: boolean;
}

/**
 * CODEOWNERS specific inputs
 */
export interface CodeownersInputs {
  type: 'codeowners';
  pathsAdded: number;
  pathsRemoved: number;
  pathsModified: number;
  criticalPaths: string[]; // Paths matching critical patterns
  ownershipGaps: number; // Paths without owners
  crossTeamImpact: boolean;
}

/**
 * Swagger/OpenAPI specific inputs
 */
export interface SwaggerInputs {
  type: 'swagger';
  endpointsAdded: number;
  endpointsModified: number;
  endpointsDeprecated: number;
  breakingChanges: number;
  authChanges: boolean;
  publicApiImpact: boolean;
}

/**
 * Build impact inputs from source and target evidence
 */
export async function buildImpactInputs(args: {
  sourceEvidence: SourceEvidence;
  targetEvidence: TargetEvidence;
}): Promise<ImpactInputs> {
  const { sourceEvidence, targetEvidence } = args;
  
  // Determine base severity from source type
  const baseSeverity = determineBaseSeverity(sourceEvidence);
  
  // Extract scope information
  const scope = extractScope(sourceEvidence);
  
  // Build source-specific inputs using adapters
  const sourceSpecific = await buildSourceSpecificInputs(sourceEvidence);
  
  return {
    sourceType: sourceEvidence.sourceType,
    targetSurface: targetEvidence.surface,
    severity: baseSeverity,
    scope,
    sourceSpecific
  };
}

/**
 * Determine base severity from source evidence
 */
function determineBaseSeverity(source: SourceEvidence): 'low' | 'medium' | 'high' | 'critical' {
  switch (source.sourceType) {
    case 'pagerduty_incident':
      return source.artifacts.incidentTimeline?.severity as any || 'high';
    case 'datadog_alert':
    case 'grafana_alert':
      return source.artifacts.alertData?.severity as any || 'medium';
    case 'github_pr':
      // Determine from PR size and files changed
      const linesChanged = (source.artifacts.prDiff?.linesAdded || 0) + (source.artifacts.prDiff?.linesRemoved || 0);
      if (linesChanged > 500) return 'high';
      if (linesChanged > 100) return 'medium';
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Extract scope information from source evidence
 */
function extractScope(source: SourceEvidence): { services: string[]; teams: string[]; systems: string[] } {
  // This would be enhanced with actual extraction logic
  return {
    services: [],
    teams: [],
    systems: []
  };
}

/**
 * Build source-specific inputs using type-specific adapters
 */
async function buildSourceSpecificInputs(source: SourceEvidence): Promise<ImpactInputs['sourceSpecific']> {
  switch (source.sourceType) {
    case 'github_pr':
      return buildGitHubPRInputs(source);
    case 'pagerduty_incident':
      return buildPagerDutyInputs(source);
    case 'slack_cluster':
      return buildSlackInputs(source);
    case 'datadog_alert':
    case 'grafana_alert':
      return buildAlertInputs(source);
    case 'github_iac':
      return buildIaCInputs(source);
    case 'github_codeowners':
      return buildCodeownersInputs(source);
    default:
      throw new Error(`Unknown source type: ${source.sourceType}`);
  }
}

/**
 * Source-specific adapter functions
 */

function buildGitHubPRInputs(source: SourceEvidence): GitHubPRInputs {
  const prDiff = source.artifacts.prDiff;
  if (!prDiff) {
    throw new Error('Missing prDiff artifacts for GitHub PR source');
  }

  const linesChanged = prDiff.linesAdded + prDiff.linesRemoved;
  const filesChanged = prDiff.filesChanged.length;

  // Detect critical files
  const criticalPatterns = [
    /auth/i, /security/i, /config/i, /env/i,
    /deploy/i, /migration/i, /schema/i
  ];
  const criticalFiles = prDiff.filesChanged.filter((file: string) =>
    criticalPatterns.some(pattern => pattern.test(file))
  );

  return {
    type: 'github_pr',
    linesChanged,
    filesChanged,
    criticalFiles,
    deploymentRelated: /deploy|infra|k8s|docker|terraform/i.test(prDiff.excerpt),
    authRelated: /auth|login|token|credential|password/i.test(prDiff.excerpt),
    apiContractChanged: /api|endpoint|route|swagger|openapi/i.test(prDiff.excerpt)
  };
}

function buildPagerDutyInputs(source: SourceEvidence): PagerDutyInputs {
  const incident = source.artifacts.incidentTimeline;
  if (!incident) {
    throw new Error('Missing incidentTimeline artifacts for PagerDuty source');
  }

  return {
    type: 'pagerduty_incident',
    incidentSeverity: incident.severity as any || 'high',
    responderCount: incident.responders.length,
    duration: parseDuration(incident.duration),
    isRecurring: /recurring|again|repeated/i.test(incident.excerpt),
    affectedServices: extractServices(incident.excerpt)
  };
}

function buildSlackInputs(source: SourceEvidence): SlackInputs {
  const slack = source.artifacts.slackMessages;
  if (!slack) {
    throw new Error('Missing slackMessages artifacts for Slack source');
  }

  const excerpt = slack.messagesExcerpt || slack.excerpt;

  return {
    type: 'slack_cluster',
    messageCount: slack.messageCount,
    participantCount: slack.userCount || slack.participants.length,
    theme: slack.theme || 'unknown',
    urgencySignals: countMatches(excerpt, /urgent|asap|immediately|critical|emergency/gi),
    confusionSignals: countMatches(excerpt, /confused|unclear|not sure|don't know|help/gi),
    escalationMentions: countMatches(excerpt, /@here|@channel|@everyone/gi)
  };
}

function buildAlertInputs(source: SourceEvidence): AlertInputs {
  const alert = source.artifacts.alertData;
  if (!alert) {
    throw new Error('Missing alertData artifacts for Alert source');
  }

  return {
    type: 'alert',
    alertSeverity: alert.severity as any || 'medium',
    alertType: alert.alertType,
    threshold: alert.threshold,
    duration: parseDuration(alert.duration),
    affectedServices: alert.affectedServices || extractServices(alert.excerpt),
    isRecurring: /recurring|repeated|frequent/i.test(alert.excerpt)
  };
}

function buildIaCInputs(source: SourceEvidence): IaCInputs {
  const iac = source.artifacts.iacChanges;
  if (!iac) {
    throw new Error('Missing iacChanges artifacts for IaC source');
  }

  const criticalPatterns = [
    /security|firewall|iam|role|policy/i,
    /database|rds|dynamodb/i,
    /production|prod/i
  ];
  const criticalResources = iac.resourcesChanged.filter((resource: string) =>
    criticalPatterns.some(pattern => pattern.test(resource))
  );

  return {
    type: 'iac',
    resourcesAdded: iac.resourcesAdded?.length || 0,
    resourcesModified: iac.resourcesModified?.length || 0,
    resourcesDeleted: iac.resourcesDeleted?.length || 0,
    changeTypes: iac.changeTypes || [],
    criticalResources,
    productionImpact: /production|prod/i.test(iac.excerpt)
  };
}

function buildCodeownersInputs(source: SourceEvidence): CodeownersInputs {
  const codeowners = source.artifacts.ownershipChanges;
  if (!codeowners) {
    throw new Error('Missing ownershipChanges artifacts for CODEOWNERS source');
  }

  const criticalPatterns = [
    /\/api\//i, /\/auth\//i, /\/security\//i,
    /\/config\//i, /\/deploy\//i
  ];
  const criticalPaths = codeowners.pathsChanged.filter((path: string) =>
    criticalPatterns.some(pattern => pattern.test(path))
  );

  return {
    type: 'codeowners',
    pathsAdded: codeowners.pathsAdded?.length || 0,
    pathsRemoved: codeowners.pathsRemoved?.length || 0,
    pathsModified: codeowners.pathsChanged.length,
    criticalPaths,
    ownershipGaps: codeowners.ownersRemoved.length - codeowners.ownersAdded.length,
    crossTeamImpact: codeowners.ownersAdded.length > 1 || codeowners.ownersRemoved.length > 1
  };
}

/**
 * Helper functions
 */

function parseDuration(duration: string): number {
  // Parse duration string like "2h 30m" to minutes
  const hours = duration.match(/(\d+)h/);
  const minutes = duration.match(/(\d+)m/);
  return (hours && hours[1] ? parseInt(hours[1]) * 60 : 0) + (minutes && minutes[1] ? parseInt(minutes[1]) : 0);
}

function extractServices(text: string): string[] {
  // Extract service names from text
  const servicePattern = /(?:service|api|app)[-_]?(\w+)/gi;
  const matches = text.matchAll(servicePattern);
  return Array.from(matches, m => m[0]).slice(0, 5); // Limit to 5 services
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

