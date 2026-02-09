/**
 * Phase 1 Day 1 Task 1.2: Universal Artifact Extractor
 * 
 * Extracts baseline artifacts from any source type for deterministic drift detection.
 */

import type { BaselineArtifacts, ExtractArtifactsArgs } from './types.js';

/**
 * Extract baseline artifacts from any source type
 * This is the universal artifact extractor that works across all sources
 */
export function extractArtifacts(args: ExtractArtifactsArgs): BaselineArtifacts {
  const { sourceType, sourceEvidence } = args;
  
  // Route to source-specific extractor
  switch (sourceType) {
    case 'github_pr':
      return extractGitHubPRArtifacts(sourceEvidence);
    
    case 'pagerduty_incident':
      return extractPagerDutyArtifacts(sourceEvidence);
    
    case 'slack_cluster':
      return extractSlackArtifacts(sourceEvidence);
    
    case 'datadog_alert':
    case 'grafana_alert':
      return extractAlertArtifacts(sourceEvidence);
    
    case 'github_iac':
      return extractIaCArtifacts(sourceEvidence);
    
    case 'github_codeowners':
      return extractCodeownersArtifacts(sourceEvidence);
    
    case 'doc':
      // Special case: extracting from documentation
      return extractDocArtifacts(sourceEvidence);
    
    default:
      console.warn(`[ArtifactExtractor] Unknown source type: ${sourceType}`);
      return {};
  }
}

/**
 * Extract artifacts from GitHub PR
 * Enhanced version of existing evidencePack.ts logic
 */
function extractGitHubPRArtifacts(evidence: any): BaselineArtifacts {
  const prDiff = evidence?.artifacts?.prDiff;
  const diffText = prDiff?.excerpt || '';
  const filesChanged = prDiff?.filesChanged || [];
  
  return {
    // Instruction artifacts
    commands: extractCommands(diffText),
    configKeys: extractConfigKeys(diffText),
    endpoints: extractEndpoints(diffText),
    tools: extractTools(diffText),
    
    // Process artifacts
    steps: extractSteps(diffText),
    decisions: extractDecisions(diffText),
    
    // Ownership artifacts
    teams: extractTeams(diffText),
    owners: extractOwners(diffText),
    paths: filesChanged,
    
    // Environment artifacts
    platforms: extractPlatforms(diffText),
    versions: extractVersions(diffText),
    dependencies: extractDependencies(diffText),
    
    // Coverage artifacts
    scenarios: extractScenarios(diffText),
    features: extractFeatures(diffText),
    errors: extractErrors(diffText),
  };
}

/**
 * Extract artifacts from PagerDuty incident
 */
function extractPagerDutyArtifacts(evidence: any): BaselineArtifacts {
  const incident = evidence?.artifacts?.incidentTimeline;
  const timeline = incident?.excerpt || '';
  const responders = incident?.responders || [];
  
  return {
    // Instruction artifacts (from resolution steps)
    commands: extractCommandsFromTimeline(timeline),
    tools: extractToolsFromTimeline(timeline),
    configKeys: extractConfigFromTimeline(timeline),
    endpoints: extractEndpointsFromTimeline(timeline),
    
    // Process artifacts (from incident flow)
    steps: extractIncidentSteps(timeline),
    decisions: extractEscalationDecisions(timeline),
    
    // Ownership artifacts
    teams: responders.map((r: any) => r.team).filter(Boolean),
    owners: responders.map((r: any) => r.name).filter(Boolean),
    channels: extractChannelsFromTimeline(timeline),
    
    // Environment artifacts
    platforms: extractPlatformsFromIncident(timeline),
    versions: extractVersionsFromIncident(timeline),
    
    // Coverage artifacts (new failure modes)
    scenarios: extractNewScenarios(timeline),
    errors: extractErrorCodes(timeline),
  };
}

/**
 * Extract artifacts from Slack cluster
 */
function extractSlackArtifacts(evidence: any): BaselineArtifacts {
  const cluster = evidence?.artifacts?.slackCluster;
  const messages = cluster?.excerpt || '';
  const themes = cluster?.themes || [];
  
  return {
    // Instruction artifacts (from messages)
    commands: extractCommandsFromMessages(messages),
    tools: extractToolMentions(messages),
    endpoints: extractURLsFromMessages(messages),
    
    // Process artifacts (from conversation flow)
    steps: extractStepsFromConversation(messages),
    
    // Ownership artifacts
    channels: [cluster?.channelId].filter(Boolean),
    teams: extractTeamsFromMessages(messages),
    
    // Coverage artifacts (new questions/issues)
    scenarios: themes,
    errors: extractErrorsFromMessages(messages),
  };
}

/**
 * Extract artifacts from Datadog/Grafana alerts
 */
function extractAlertArtifacts(evidence: any): BaselineArtifacts {
  const alert = evidence?.artifacts?.alertData;
  const alertText = alert?.excerpt || '';
  const services = alert?.affectedServices || [];
  
  return {
    // Instruction artifacts (from alert config)
    endpoints: extractEndpointsFromAlert(alertText),
    tools: extractMonitoringTools(alertText),
    configKeys: extractMetricNames(alertText),
    
    // Process artifacts (from alert rules)
    steps: extractAlertSteps(alertText),
    decisions: extractThresholds(alertText),

    // Ownership artifacts
    teams: services.map((s: any) => s.team).filter(Boolean),

    // Environment artifacts
    platforms: services.map((s: any) => s.platform).filter(Boolean),
    versions: extractVersionsFromAlert(alertText),

    // Coverage artifacts
    scenarios: extractAlertScenarios(alertText),
  };
}

/**
 * Extract artifacts from IaC changes
 */
function extractIaCArtifacts(evidence: any): BaselineArtifacts {
  const iac = evidence?.artifacts?.iacChanges;
  const changes = iac?.excerpt || '';
  const resources = iac?.resourcesChanged || [];

  return {
    // Instruction artifacts (from resource configs)
    endpoints: extractEndpointsFromIaC(changes),
    configKeys: extractIaCConfigKeys(changes),
    tools: extractIaCTools(changes),

    // Process artifacts
    steps: extractDeploymentSteps(changes),

    // Ownership artifacts
    paths: resources,

    // Environment artifacts
    platforms: extractPlatformsFromIaC(changes),
    versions: extractVersionsFromIaC(changes),
    dependencies: extractDependenciesFromIaC(changes),

    // Coverage artifacts
    scenarios: extractNewInfraScenarios(changes),
  };
}

/**
 * Extract artifacts from CODEOWNERS changes
 */
function extractCodeownersArtifacts(evidence: any): BaselineArtifacts {
  const codeowners = evidence?.artifacts?.codeownersDiff;
  const pathsAdded = codeowners?.pathsAdded || [];
  const ownersAdded = codeowners?.ownersAdded || [];

  return {
    // Ownership artifacts (primary focus)
    paths: pathsAdded,
    owners: ownersAdded,
    teams: extractTeamsFromOwners(ownersAdded),

    // Coverage artifacts
    scenarios: pathsAdded.map((p: string) => `New ownership for ${p}`),
  };
}

/**
 * Extract artifacts from documentation
 * Used to extract baseline from doc content for comparison
 */
function extractDocArtifacts(evidence: any): BaselineArtifacts {
  const docText = evidence?.docText || evidence?.text || '';

  return {
    // Instruction artifacts
    commands: extractCommands(docText),
    configKeys: extractConfigKeys(docText),
    endpoints: extractEndpoints(docText),
    tools: extractTools(docText),

    // Process artifacts
    steps: extractSteps(docText),
    decisions: extractDecisions(docText),

    // Ownership artifacts
    teams: extractTeams(docText),
    owners: extractOwners(docText),
    channels: extractChannels(docText),

    // Environment artifacts
    platforms: extractPlatforms(docText),
    versions: extractVersions(docText),
    dependencies: extractDependencies(docText),

    // Coverage artifacts
    scenarios: extractScenarios(docText),
    features: extractFeatures(docText),
    errors: extractErrors(docText),
  };
}

// ============================================================================
// HELPER FUNCTIONS - Generic Pattern Matching
// ============================================================================

/**
 * Extract CLI commands from text
 */
function extractCommands(text: string): string[] {
  const commands: string[] = [];
  const patterns = [
    /`([a-z0-9-]+\s+[a-z0-9-]+[^`]*)`/gi,  // Backtick commands
    /\$\s*([a-z0-9-]+\s+[a-z0-9-]+[^\n]*)/gi,  // Shell commands with $
    /run\s+([a-z0-9-]+\s+[a-z0-9-]+)/gi,  // "run kubectl restart"
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const cmd = match[1]?.trim().toLowerCase();
      if (cmd && cmd.length > 3 && cmd.length < 200) {
        commands.push(cmd);
      }
    }
  }

  return [...new Set(commands)].slice(0, 20);
}

/**
 * Extract configuration keys from text
 */
function extractConfigKeys(text: string): string[] {
  const keys: string[] = [];
  const patterns = [
    /([A-Z_]{3,})\s*=/g,  // ENV_VAR=value
    /config\.([a-z0-9_.]+)/gi,  // config.key.name
    /env\.([a-z0-9_]+)/gi,  // env.KEY_NAME
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const key = match[1]?.trim();
      if (key && key.length > 2) {
        keys.push(key);
      }
    }
  }

  return [...new Set(keys)].slice(0, 30);
}

/**
 * Extract API endpoints from text
 */
function extractEndpoints(text: string): string[] {
  const endpoints: string[] = [];
  const patterns = [
    /['"`](\/api\/[^'"`\s]+)['"`]/gi,  // "/api/users"
    /router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/gi,  // router.get('/health')
    /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/gi,  // app.get('/metrics')
    /@(Get|Post|Put|Delete|Patch)\(['"]([^'"]+)['"]\)/gi,  // @Get('/users')
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const endpoint = (match[2] || match[1])?.trim();
      if (endpoint && endpoint.startsWith('/')) {
        endpoints.push(endpoint);
      }
    }
  }

  return [...new Set(endpoints)].slice(0, 25);
}

/**
 * Extract tool mentions from text
 */
function extractTools(text: string): string[] {
  const tools: string[] = [];
  const toolNames = [
    'kubectl', 'docker', 'terraform', 'ansible', 'jenkins', 'github', 'gitlab',
    'datadog', 'grafana', 'prometheus', 'elasticsearch', 'kibana', 'redis',
    'postgres', 'mysql', 'mongodb', 'kafka', 'rabbitmq', 'nginx', 'apache',
    'kubernetes', 'k8s', 'aws', 'gcp', 'azure', 'cloudflare', 'vercel',
  ];

  const lowerText = text.toLowerCase();
  for (const tool of toolNames) {
    if (lowerText.includes(tool)) {
      tools.push(tool);
    }
  }

  return [...new Set(tools)].slice(0, 15);
}

/**
 * Extract process steps from text
 */
function extractSteps(text: string): string[] {
  const steps: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for numbered steps or bullet points
    if (/^\d+\.|^[-*]\s/.test(trimmed)) {
      steps.push(trimmed.substring(0, 150));
    }
  }

  return steps.slice(0, 15);
}

/**
 * Extract decision points from text
 */
function extractDecisions(text: string): string[] {
  const decisions: string[] = [];
  const patterns = [
    /if\s+([^{]+)/gi,  // if conditions
    /when\s+([^,\n]+)/gi,  // when clauses
    /threshold:\s*([^\n]+)/gi,  // thresholds
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const decision = match[1]?.trim().substring(0, 100);
      if (decision) {
        decisions.push(decision);
      }
    }
  }

  return [...new Set(decisions)].slice(0, 10);
}

/**
 * Extract team names from text
 */
function extractTeams(text: string): string[] {
  const teams: string[] = [];
  const patterns = [
    /@([a-z0-9-]+\/[a-z0-9-]+)/gi,  // @org/team
    /team:\s*([a-z0-9-]+)/gi,  // team: platform
    /#([a-z0-9-]+)-team/gi,  // #platform-team
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const team = match[1]?.toLowerCase();
      if (team) {
        teams.push(team);
      }
    }
  }

  return [...new Set(teams)].slice(0, 10);
}

/**
 * Extract owner names from text
 */
function extractOwners(text: string): string[] {
  const owners: string[] = [];
  const patterns = [
    /@([a-z0-9-]+)\b/gi,  // @username
    /owner:\s*([a-z0-9@.-]+)/gi,  // owner: user@example.com
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const owner = match[1]?.toLowerCase();
      if (owner && owner.length > 2 && !owner.includes('/')) {
        owners.push(owner);
      }
    }
  }

  return [...new Set(owners)].slice(0, 15);
}

/**
 * Extract Slack channels from text
 */
function extractChannels(text: string): string[] {
  const channels: string[] = [];
  const pattern = /#([a-z0-9-]+)/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const channel = match[1]?.toLowerCase();
    if (channel) {
      channels.push(channel);
    }
  }

  return [...new Set(channels)].slice(0, 10);
}

/**
 * Extract platforms from text
 */
function extractPlatforms(text: string): string[] {
  const platforms: string[] = [];
  const platformNames = [
    'linux', 'ubuntu', 'debian', 'centos', 'rhel', 'windows', 'macos',
    'aws', 'gcp', 'azure', 'kubernetes', 'k8s', 'docker', 'ecs', 'eks',
    'lambda', 'cloudrun', 'appengine', 'heroku', 'vercel', 'netlify',
  ];

  const lowerText = text.toLowerCase();
  for (const platform of platformNames) {
    if (lowerText.includes(platform)) {
      platforms.push(platform);
    }
  }

  return [...new Set(platforms)].slice(0, 10);
}

/**
 * Extract version numbers from text
 */
function extractVersions(text: string): string[] {
  const versions: string[] = [];
  const patterns = [
    /v?(\d+\.\d+\.\d+)/g,  // v1.2.3 or 1.2.3
    /version:\s*([0-9.]+)/gi,  // version: 1.2.3
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const version = match[1];
      if (version) {
        versions.push(version);
      }
    }
  }

  return [...new Set(versions)].slice(0, 10);
}

/**
 * Extract dependencies from text
 */
function extractDependencies(text: string): string[] {
  const deps: string[] = [];
  const patterns = [
    /"([a-z0-9@/-]+)":\s*"[^"]+"/gi,  // package.json style
    /import\s+.*from\s+['"]([^'"]+)['"]/gi,  // ES6 imports
    /require\(['"]([^'"]+)['"]\)/gi,  // CommonJS requires
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const dep = match[1];
      if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
        deps.push(dep);
      }
    }
  }

  return [...new Set(deps)].slice(0, 20);
}

/**
 * Extract scenarios from text
 */
function extractScenarios(text: string): string[] {
  const scenarios: string[] = [];
  const patterns = [
    /scenario:\s*([^\n]+)/gi,
    /use case:\s*([^\n]+)/gi,
    /when\s+([^,\n]{10,})/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const scenario = match[1]?.trim().substring(0, 100);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
  }

  return [...new Set(scenarios)].slice(0, 10);
}

/**
 * Extract features from text
 */
function extractFeatures(text: string): string[] {
  const features: string[] = [];
  const patterns = [
    /feature:\s*([^\n]+)/gi,
    /add(s|ed)?\s+([a-z0-9\s]{5,30})/gi,
    /new\s+([a-z0-9\s]{5,30})/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const feature = (match[2] || match[1])?.trim();
      if (feature && feature.length > 4) {
        features.push(feature.substring(0, 50));
      }
    }
  }

  return [...new Set(features)].slice(0, 10);
}

/**
 * Extract error codes/messages from text
 */
function extractErrors(text: string): string[] {
  const errors: string[] = [];
  const patterns = [
    /error:\s*([^\n]+)/gi,
    /exception:\s*([^\n]+)/gi,
    /\b(500|502|503|504|400|401|403|404)\b/g,  // HTTP error codes
    /ERROR_([A-Z_]+)/g,  // ERROR_CODE_NAME
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      errors.push((match[1] || match[0]).substring(0, 100));
    }
  }

  return [...new Set(errors)].slice(0, 15);
}

// ============================================================================
// HELPER FUNCTIONS - PagerDuty Specific
// ============================================================================

function extractCommandsFromTimeline(timeline: string): string[] {
  return extractCommands(timeline);
}

function extractToolsFromTimeline(timeline: string): string[] {
  return extractTools(timeline);
}

function extractConfigFromTimeline(timeline: string): string[] {
  return extractConfigKeys(timeline);
}

function extractEndpointsFromTimeline(timeline: string): string[] {
  return extractEndpoints(timeline);
}

function extractIncidentSteps(timeline: string): string[] {
  return extractSteps(timeline);
}

function extractEscalationDecisions(timeline: string): string[] {
  const decisions: string[] = [];
  const patterns = [
    /escalat(e|ed) to\s+([^\n]+)/gi,
    /contact(ed)?\s+([^\n]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(timeline)) !== null) {
      const decision = match[2]?.trim().substring(0, 100);
      if (decision) {
        decisions.push(decision);
      }
    }
  }

  return [...new Set(decisions)].slice(0, 10);
}

function extractChannelsFromTimeline(timeline: string): string[] {
  return extractChannels(timeline);
}

function extractPlatformsFromIncident(timeline: string): string[] {
  return extractPlatforms(timeline);
}

function extractVersionsFromIncident(timeline: string): string[] {
  return extractVersions(timeline);
}

function extractNewScenarios(timeline: string): string[] {
  return extractScenarios(timeline);
}

function extractErrorCodes(timeline: string): string[] {
  return extractErrors(timeline);
}

// ============================================================================
// HELPER FUNCTIONS - Slack Specific
// ============================================================================

function extractCommandsFromMessages(messages: string): string[] {
  return extractCommands(messages);
}

function extractToolMentions(messages: string): string[] {
  return extractTools(messages);
}

function extractURLsFromMessages(messages: string): string[] {
  return extractEndpoints(messages);
}

function extractStepsFromConversation(messages: string): string[] {
  return extractSteps(messages);
}

function extractTeamsFromMessages(messages: string): string[] {
  return extractTeams(messages);
}

function extractErrorsFromMessages(messages: string): string[] {
  return extractErrors(messages);
}

// ============================================================================
// HELPER FUNCTIONS - Alert Specific (Datadog/Grafana)
// ============================================================================

function extractEndpointsFromAlert(alertText: string): string[] {
  return extractEndpoints(alertText);
}

function extractMonitoringTools(alertText: string): string[] {
  return extractTools(alertText);
}

function extractMetricNames(alertText: string): string[] {
  const metrics: string[] = [];
  const patterns = [
    /metric:\s*([a-z0-9_.]+)/gi,
    /\b([a-z0-9_]+\.(count|rate|gauge|histogram))\b/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(alertText)) !== null) {
      const metric = match[1]?.toLowerCase();
      if (metric) {
        metrics.push(metric);
      }
    }
  }

  return [...new Set(metrics)].slice(0, 15);
}

function extractAlertSteps(alertText: string): string[] {
  return extractSteps(alertText);
}

function extractThresholds(alertText: string): string[] {
  const thresholds: string[] = [];
  const patterns = [
    /threshold:\s*([^\n]+)/gi,
    />\s*(\d+)/g,
    /<\s*(\d+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(alertText)) !== null) {
      const threshold = match[1];
      if (threshold) {
        thresholds.push(threshold);
      }
    }
  }

  return [...new Set(thresholds)].slice(0, 10);
}

function extractVersionsFromAlert(alertText: string): string[] {
  return extractVersions(alertText);
}

function extractAlertScenarios(alertText: string): string[] {
  return extractScenarios(alertText);
}

// ============================================================================
// HELPER FUNCTIONS - IaC Specific
// ============================================================================

function extractEndpointsFromIaC(changes: string): string[] {
  return extractEndpoints(changes);
}

function extractIaCConfigKeys(changes: string): string[] {
  return extractConfigKeys(changes);
}

function extractIaCTools(changes: string): string[] {
  return extractTools(changes);
}

function extractDeploymentSteps(changes: string): string[] {
  return extractSteps(changes);
}

function extractPlatformsFromIaC(changes: string): string[] {
  return extractPlatforms(changes);
}

function extractVersionsFromIaC(changes: string): string[] {
  return extractVersions(changes);
}

function extractDependenciesFromIaC(changes: string): string[] {
  return extractDependencies(changes);
}

function extractNewInfraScenarios(changes: string): string[] {
  return extractScenarios(changes);
}

// ============================================================================
// HELPER FUNCTIONS - CODEOWNERS Specific
// ============================================================================

function extractTeamsFromOwners(owners: string[]): string[] {
  const teams: string[] = [];

  for (const owner of owners) {
    // Extract team from @org/team format
    if (owner.includes('/')) {
      const parts = owner.split('/');
      const team = parts[1];
      if (team) {
        teams.push(team);
      }
    }
  }

  return [...new Set(teams)];
}

