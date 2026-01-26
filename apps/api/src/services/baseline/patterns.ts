/**
 * Baseline Check Patterns
 * 
 * Defines regex patterns for detecting drift-relevant content in documentation.
 * These patterns are used in the baseline check step of the Universal Detection Pattern.
 * 
 * @see VERTAAI_MVP_SPEC.md Section 5.4
 */

// ============================================================================
// INSTRUCTION PATTERNS
// Used to detect command/config/URL references in documentation
// ============================================================================

export const INSTRUCTION_PATTERNS: RegExp[] = [
  // Command patterns - DevOps tools
  /`kubectl\s+[^`]+`/gi,
  /`helm\s+[^`]+`/gi,
  /`terraform\s+[^`]+`/gi,
  /`curl\s+[^`]+`/gi,
  /`aws\s+[^`]+`/gi,
  /`gcloud\s+[^`]+`/gi,
  /`psql\s+[^`]+`/gi,
  /`redis-cli\s+[^`]+`/gi,
  /`systemctl\s+[^`]+`/gi,
  /`make\s+\w+`/gi,
  /`\.\/scripts\/[^`]+`/gi,
  /`gh\s+workflow\s+[^`]+`/gi,
  /`argo\s+[^`]+`/gi,
  /`flux\s+[^`]+`/gi,
  /`docker\s+[^`]+`/gi,
  
  // Package managers
  /`npm\s+[^`]+`/gi,
  /`yarn\s+[^`]+`/gi,
  /`pnpm\s+[^`]+`/gi,
  /`pip\s+[^`]+`/gi,
  /`poetry\s+[^`]+`/gi,
  /`cargo\s+[^`]+`/gi,
  /`go\s+run\s+[^`]+`/gi,
  /`pytest\s+[^`]+`/gi,
  
  // Config key patterns
  /^[A-Z0-9_]{3,}=/gm,
  /feature_flags:/gi,
  /config:/gi,
  
  // Endpoint patterns
  /\/v1\//gi,
  /\/v2\//gi,
  /https?:\/\/[^\s]+/gi,
];

// ============================================================================
// PROCESS PATTERNS
// Used to detect step sequences, decision trees, and escalation logic
// ============================================================================

export const PROCESS_PATTERNS: RegExp[] = [
  // Ordered steps
  /^(?:Step\s+)?\d+[\.\)]\s+/gm,
  /^-\s+\[.\]\s+/gm,  // Checkbox lists
  
  // Decision trees
  /\bif\b.*\bthen\b/gi,
  /\bwhen\b.*\bdo\b/gi,
  /\belse\b/gi,
  
  // Escalation logic
  /escalate\s+to/gi,
  /notify\s+/gi,
  /page\s+/gi,
];

// ============================================================================
// OWNERSHIP PATTERNS
// Used to detect owner/contact/team information in documentation
// ============================================================================

export const OWNERSHIP_PATTERNS: RegExp[] = [
  // Section headers
  /^#+\s*(?:owner|contact|team|escalat|on-?call)/gim,
  
  // Mentions
  /@[a-zA-Z0-9_-]+/g,  // @mentions
  /#[a-zA-Z0-9_-]+/g,  // #channels
  
  // Labeled owner info
  /owner:\s*[^\n]+/gi,
  /team:\s*[^\n]+/gi,
  /contact:\s*[^\n]+/gi,
];

// ============================================================================
// COVERAGE KEYWORDS
// Used to detect common operational scenarios that should be documented
// ============================================================================

export const COVERAGE_KEYWORDS: string[] = [
  'canary', 'blue/green', 'rollback', 'feature flags',
  'migration', 'region failover', 'rate limiting',
  'circuit breaker', 'backfill', 'reindex',
  'disaster recovery', 'failover', 'hotfix',
  'emergency deploy', 'rollforward', 'data restore',
];

// ============================================================================
// ENVIRONMENT/TOOLING PATTERNS
// Used to detect tool references in documentation
// ============================================================================

export const ENVIRONMENT_PATTERNS: RegExp[] = [
  // CI/CD
  /circleci/gi, /buildkite/gi, /jenkins/gi, /github\s*actions/gi,
  /travis/gi, /gitlab\s*ci/gi,
  
  // Observability
  /datadog/gi, /new\s*relic/gi, /grafana/gi, /prometheus/gi,
  /splunk/gi, /honeycomb/gi, /lightstep/gi,
  
  // Feature flags
  /launchdarkly/gi, /split\.io/gi, /optimizely/gi, /flagsmith/gi,
  
  // Deployment controllers
  /argocd/gi, /flux/gi, /spinnaker/gi, /harness/gi,
  
  // Cloud providers
  /\baws\b/gi, /\bgcloud\b/gi, /\baz\b/gi, /azure/gi,
];

// ============================================================================
// Pattern Matching Utilities
// ============================================================================

export interface PatternMatch {
  pattern: RegExp;
  matches: string[];
  count: number;
}

/**
 * Find all matches for a set of patterns in text.
 */
export function findPatternMatches(text: string, patterns: RegExp[]): PatternMatch[] {
  return patterns.map(pattern => {
    // Reset lastIndex for global patterns
    const safePattern = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(safePattern) || [];
    return {
      pattern: safePattern,
      matches,
      count: matches.length,
    };
  }).filter(pm => pm.count > 0);
}

/**
 * Check if text contains any coverage keywords.
 */
export function findCoverageKeywords(text: string): string[] {
  const textLower = text.toLowerCase();
  return COVERAGE_KEYWORDS.filter(keyword =>
    textLower.includes(keyword.toLowerCase())
  );
}

/**
 * Extract owner information from text.
 */
export function extractOwnerInfo(text: string): {
  owners: string[];
  teams: string[];
  channels: string[];
} {
  const owners: string[] = [];
  const teams: string[] = [];
  const channels: string[] = [];

  // Extract @mentions
  const mentions = text.match(/@[a-zA-Z0-9_-]+/g) || [];
  owners.push(...mentions);

  // Extract #channels
  const channelMatches = text.match(/#[a-zA-Z0-9_-]+/g) || [];
  channels.push(...channelMatches);

  // Extract labeled owner info
  const ownerMatches = text.match(/owner:\s*([^\n]+)/gi) || [];
  ownerMatches.forEach(m => {
    const value = m.replace(/owner:\s*/i, '').trim();
    if (value) owners.push(value);
  });

  // Extract team info
  const teamMatches = text.match(/team:\s*([^\n]+)/gi) || [];
  teamMatches.forEach(m => {
    const value = m.replace(/team:\s*/i, '').trim();
    if (value) teams.push(value);
  });

  return {
    owners: [...new Set(owners)],
    teams: [...new Set(teams)],
    channels: [...new Set(channels)],
  };
}

// ============================================================================
// Baseline Check Functions
// ============================================================================

export interface BaselineCheckResult {
  driftType: 'instruction' | 'process' | 'ownership' | 'coverage' | 'environment';
  hasMatch: boolean;
  matches: string[];
  mismatchReason?: string;
}

/**
 * Check if document references old instruction that should be updated.
 * @param docText - Current document content
 * @param oldToken - Token to check for (e.g., old command, config key)
 * @param newToken - New replacement token (optional)
 */
export function checkInstructionBaseline(
  docText: string,
  oldToken: string,
  newToken?: string
): BaselineCheckResult {
  const hasOld = docText.toLowerCase().includes(oldToken.toLowerCase());
  const hasNew = newToken ? docText.toLowerCase().includes(newToken.toLowerCase()) : false;

  return {
    driftType: 'instruction',
    hasMatch: hasOld && !hasNew,
    matches: hasOld ? [oldToken] : [],
    mismatchReason: hasOld && !hasNew
      ? `Document references '${oldToken}' but ${newToken ? `should use '${newToken}'` : 'token appears to be outdated'}`
      : undefined,
  };
}

/**
 * Check if document ownership differs from authoritative source.
 */
export function checkOwnershipBaseline(
  docText: string,
  authoritativeOwner: string
): BaselineCheckResult {
  const docOwners = extractOwnerInfo(docText);
  const allDocOwners = [...docOwners.owners, ...docOwners.teams].map(o => o.toLowerCase());
  const hasMatch = allDocOwners.some(o =>
    o.includes(authoritativeOwner.toLowerCase()) ||
    authoritativeOwner.toLowerCase().includes(o.replace('@', ''))
  );

  return {
    driftType: 'ownership',
    hasMatch: !hasMatch && allDocOwners.length > 0,
    matches: allDocOwners,
    mismatchReason: !hasMatch && allDocOwners.length > 0
      ? `Document states owner as '${allDocOwners[0]}' but authoritative source says '${authoritativeOwner}'`
      : undefined,
  };
}

/**
 * Check if document covers a scenario keyword.
 */
export function checkCoverageBaseline(
  docText: string,
  scenarioKeyword: string
): BaselineCheckResult {
  const textLower = docText.toLowerCase();
  const hasScenario = textLower.includes(scenarioKeyword.toLowerCase());

  return {
    driftType: 'coverage',
    hasMatch: !hasScenario,
    matches: [],
    mismatchReason: !hasScenario
      ? `Document lacks coverage for scenario '${scenarioKeyword}'`
      : undefined,
  };
}

/**
 * Check if document references old tool that has been replaced.
 */
export function checkEnvironmentBaseline(
  docText: string,
  oldTool: string,
  newTool?: string
): BaselineCheckResult {
  const hasOld = docText.toLowerCase().includes(oldTool.toLowerCase());
  const hasNew = newTool ? docText.toLowerCase().includes(newTool.toLowerCase()) : false;

  return {
    driftType: 'environment',
    hasMatch: hasOld,
    matches: hasOld ? [oldTool] : [],
    mismatchReason: hasOld
      ? `Document references '${oldTool}'${newTool ? ` which has been replaced by '${newTool}'` : ' which may be outdated'}`
      : undefined,
  };
}

/**
 * Check if document contains process/step sequences that may need updating.
 * Per spec Section 5.4.6 - Process Drift Baseline Checks
 *
 * @param docText - Current document content
 * @param signalSteps - Optional steps from incident timeline to compare
 */
export function checkProcessBaseline(
  docText: string,
  signalSteps?: string[]
): BaselineCheckResult {
  // Find all process patterns in the document
  const matches = findPatternMatches(docText, PROCESS_PATTERNS);
  const flatMatches = matches.flatMap(m => m.matches);

  // Extract step indicators for comparison
  const stepIndicators = ['First', 'Then', 'Next', 'Finally', 'Step 1', 'Step 2', 'Step 3'];
  const orderKeywords = ['before', 'after', 'prior to', 'following'];
  const conditionalLogic = ['If', 'Else', 'When', 'Unless'];

  const foundStepIndicators = stepIndicators.filter(s =>
    docText.toLowerCase().includes(s.toLowerCase())
  );
  const foundOrderKeywords = orderKeywords.filter(k =>
    docText.toLowerCase().includes(k.toLowerCase())
  );
  const foundConditionalLogic = conditionalLogic.filter(c =>
    docText.toLowerCase().includes(c.toLowerCase())
  );

  const allProcessIndicators = [
    ...flatMatches,
    ...foundStepIndicators,
    ...foundOrderKeywords,
    ...foundConditionalLogic,
  ];

  return {
    driftType: 'process',
    hasMatch: allProcessIndicators.length > 0,
    matches: [...new Set(allProcessIndicators)].slice(0, 10),
    mismatchReason: allProcessIndicators.length > 0
      ? `Document contains ${foundStepIndicators.length} step indicators, ${foundOrderKeywords.length} order keywords, and ${foundConditionalLogic.length} conditional logic patterns that may need updating`
      : undefined,
  };
}

