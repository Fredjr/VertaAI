/**
 * Baseline Check Patterns
 *
 * Defines regex patterns for detecting drift-relevant content in documentation.
 * These patterns are used in the baseline check step of the Universal Detection Pattern.
 *
 * Point 10: Source-specific domain detection patterns added
 *
 * @see VERTAAI_MVP_SPEC.md Section 5.4
 * @see Point 10 in Multi-Source Enrichment Plan
 */

import type { InputSourceType } from '../docs/adapters/types.js';

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

// ============================================================================
// PROCESS DRIFT RESULT TYPES
// Per spec Section D - Structured process drift detection
// ============================================================================

export type ProcessFindingKind =
  | 'step_list'
  | 'decision_logic'
  | 'approval_gate'
  | 'rollback_gate'
  | 'escalation_gate';

export type ProcessMismatchType =
  | 'order_change'
  | 'new_gate'
  | 'removed_gate'
  | 'decision_change'
  | 'unknown';

export interface ProcessBaselineFinding {
  kind: ProcessFindingKind;
  doc_snippet: string;
  doc_location: {
    section_id?: string;
    start_char: number;
    end_char: number;
  };
  matched_patterns: string[];
}

export interface ProcessDriftResult {
  detected: boolean;
  confidence_suggestion: number;
  mismatch_type: ProcessMismatchType;
  affected_section_ids: string[];
  findings: ProcessBaselineFinding[];
  doc_flow: string[];    // Step skeleton extracted from document
  pr_flow: string[];     // PR signals and changes detected
  recommended_patch_style: 'add_note' | 'reorder_steps' | 'add_section';
  recommended_action: 'generate_patch' | 'annotate_only' | 'review_queue';
  rationale: string;
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

// ============================================================================
// PROCESS DRIFT SIGNAL EXTRACTION (Per Spec Section 3.2)
// Functions for extracting structured signals from PR for process drift comparison
// ============================================================================

/**
 * Signals extracted from PR for process drift comparison.
 * Per spec: prSignals: { gatesAdded:[], gatesRemoved:[], orderHints:[], mentionsWorkflowFiles:boolean }
 */
export interface ProcessSignals {
  gatesAdded: string[];
  gatesRemoved: string[];
  orderHints: string[];
  mentionsWorkflowFiles: boolean;
  explicitProcessChange: boolean;
}

// Patterns for detecting gate additions/removals in PR
const PR_GATE_ADD_PATTERNS = [
  /add(?:s|ed|ing)?\s+(?:a\s+)?(?:new\s+)?(?:approval|review|gate|check|step|requirement)/gi,
  /introduc(?:e|es|ed|ing)\s+(?:a\s+)?(?:new\s+)?(?:approval|review|gate|check|step)/gi,
  /require(?:s|d|ing)?\s+(?:additional\s+)?(?:approval|review|sign[\-\s]?off)/gi,
  /now\s+requires?\s+/gi,
  /must\s+(?:now\s+)?(?:be\s+)?(?:approved|reviewed)/gi,
  /\+\s*(?:approval|review|gate|check)\s*required/gi,
];

const PR_GATE_REMOVE_PATTERNS = [
  /remov(?:e|es|ed|ing)\s+(?:the\s+)?(?:approval|review|gate|check|step|requirement)/gi,
  /no\s+longer\s+require(?:s|d)?\s+/gi,
  /skip(?:s|ped|ping)?\s+(?:the\s+)?(?:approval|review|gate|check)/gi,
  /bypass(?:es|ed|ing)?\s+(?:the\s+)?(?:approval|review|gate)/gi,
  /deprecat(?:e|es|ed|ing)\s+(?:the\s+)?(?:approval|review|gate|step)/gi,
  /-\s*(?:approval|review|gate|check)\s*required/gi,
];

const PR_ORDER_HINT_PATTERNS = [
  /(?:now\s+)?(?:before|after|prior\s+to|following)\s+([^,.\n]+)/gi,
  /reorder(?:s|ed|ing)?\s+(?:the\s+)?(?:steps?|process|workflow)/gi,
  /mov(?:e|es|ed|ing)\s+(?:the\s+)?(?:step|check|gate)\s+(?:before|after)/gi,
  /swap(?:s|ped|ping)?\s+(?:the\s+)?(?:order|sequence)/gi,
  /(?:step|check|gate)\s+(?:\d+\s+)?(?:is\s+)?(?:now\s+)?(?:before|after)/gi,
  /change(?:s|d|ing)?\s+(?:the\s+)?(?:order|sequence|flow)/gi,
];

const WORKFLOW_FILE_PATTERNS = [
  /\.github\/workflows\//i,
  /\.circleci\//i,
  /Jenkinsfile/i,
  /\.gitlab-ci\.yml/i,
  /buildkite\.yml/i,
  /azure-pipelines\.yml/i,
  /deploy\.ya?ml/i,
  /runbook/i,
  /playbook/i,
];

const EXPLICIT_PROCESS_CHANGE_PATTERNS = [
  /change(?:s|d|ing)?\s+(?:the\s+)?(?:deploy|release|rollout)\s+(?:process|procedure|workflow)/gi,
  /updat(?:e|es|ed|ing)\s+(?:the\s+)?(?:deploy|release|rollout)\s+(?:process|procedure|workflow)/gi,
  /modif(?:y|ies|ied|ying)\s+(?:the\s+)?(?:deploy|release|rollout)\s+(?:process|procedure|workflow)/gi,
  /new\s+(?:deploy|release|rollout)\s+(?:process|procedure|workflow)/gi,
  /refactor(?:s|ed|ing)?\s+(?:the\s+)?(?:deploy|release|rollout)/gi,
];

/**
 * Extract structured process signals from PR text and changed files.
 * Per spec Section 3.2: extractProcessSignalsFromPR()
 */
export function extractProcessSignalsFromPR(
  prText: string,
  changedFiles: string[]
): ProcessSignals {
  const gatesAdded: string[] = [];
  const gatesRemoved: string[] = [];
  const orderHints: string[] = [];

  // Extract gates added
  for (const pattern of PR_GATE_ADD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(prText)) !== null) {
      gatesAdded.push(match[0].trim());
    }
  }

  // Extract gates removed
  for (const pattern of PR_GATE_REMOVE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(prText)) !== null) {
      gatesRemoved.push(match[0].trim());
    }
  }

  // Extract order hints
  for (const pattern of PR_ORDER_HINT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(prText)) !== null) {
      orderHints.push(match[0].trim());
    }
  }

  // Check if PR mentions workflow files
  const mentionsWorkflowFiles = changedFiles.some(file =>
    WORKFLOW_FILE_PATTERNS.some(pattern => pattern.test(file))
  );

  // Check for explicit process change language
  let explicitProcessChange = false;
  for (const pattern of EXPLICIT_PROCESS_CHANGE_PATTERNS) {
    if (pattern.test(prText)) {
      explicitProcessChange = true;
      break;
    }
  }

  return {
    gatesAdded: [...new Set(gatesAdded)],
    gatesRemoved: [...new Set(gatesRemoved)],
    orderHints: [...new Set(orderHints)],
    mentionsWorkflowFiles,
    explicitProcessChange,
  };
}

/**
 * Loosely match a PR gate against a doc gate.
 * Per spec Section 3.2: looselyMatches(docGate, prGate)
 */
export function looselyMatches(docGate: string, prGate: string): boolean {
  const docNorm = docGate.toLowerCase().replace(/[^a-z0-9]/g, '');
  const prNorm = prGate.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Direct substring match
  if (docNorm.includes(prNorm) || prNorm.includes(docNorm)) {
    return true;
  }

  // Key term matching
  const keyTerms = ['approval', 'review', 'signoff', 'check', 'gate', 'verify', 'validate', 'test', 'ci', 'cd'];
  const docTerms = keyTerms.filter(t => docNorm.includes(t));
  const prTerms = keyTerms.filter(t => prNorm.includes(t));

  // If they share key terms, consider it a match
  if (docTerms.some(t => prTerms.includes(t))) {
    return true;
  }

  return false;
}

/**
 * Detect order mismatch between PR hints and doc steps.
 * Per spec Section 3.2: detectOrderMismatch(prSignals.orderHints, docSteps)
 */
export function detectOrderMismatch(
  orderHints: string[],
  docSteps: string[]
): string | null {
  if (orderHints.length === 0 || docSteps.length === 0) {
    return null;
  }

  const docStepsLower = docSteps.map(s => s.toLowerCase());

  for (const hint of orderHints) {
    const hintLower = hint.toLowerCase();

    // Check for "before X" patterns
    const beforeMatch = hintLower.match(/before\s+(.+)/);
    if (beforeMatch && beforeMatch[1]) {
      const target = beforeMatch[1].trim();
      // If doc has this step, there might be an order change
      if (docStepsLower.some(s => s.includes(target) || target.includes(s.substring(0, 10)))) {
        return `PR suggests something should happen before "${target}"`;
      }
    }

    // Check for "after X" patterns
    const afterMatch = hintLower.match(/after\s+(.+)/);
    if (afterMatch && afterMatch[1]) {
      const target = afterMatch[1].trim();
      if (docStepsLower.some(s => s.includes(target) || target.includes(s.substring(0, 10)))) {
        return `PR suggests something should happen after "${target}"`;
      }
    }

    // Check for explicit reorder language
    if (hintLower.includes('reorder') || hintLower.includes('swap') || hintLower.includes('move')) {
      return `PR indicates step reordering: "${hint}"`;
    }
  }

  return null;
}

/**
 * Check if text has a clean numbered list structure.
 * Per spec Section 3.2: hasNumberedList(text)
 */
export function hasNumberedList(text: string): boolean {
  // Match numbered lists: "1.", "1)", "Step 1", etc.
  const numberedPatterns = [
    /^\s*\d+\.\s+/gm,           // "1. Step"
    /^\s*\d+\)\s+/gm,           // "1) Step"
    /^\s*Step\s+\d+[:\.\)]/gim, // "Step 1:" or "Step 1."
    /^\s*\[\d+\]/gm,            // "[1] Step"
  ];

  let totalMatches = 0;
  for (const pattern of numberedPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      totalMatches += matches.length;
    }
  }

  // Consider it a numbered list if we have 3+ numbered items
  return totalMatches >= 3;
}

/**
 * Extract step skeleton from document text.
 * Per spec Section 3.2: extractStepSkeleton(text)
 */
export function extractStepSkeleton(text: string): string[] {
  const steps: string[] = [];

  // Pattern 1: Numbered steps "1. Do something"
  const numberedStepPattern = /^\s*(?:Step\s+)?(\d+)[\.\):\s]+(.+?)(?:\n|$)/gim;
  let match;
  while ((match = numberedStepPattern.exec(text)) !== null) {
    const stepText = match[2]?.trim();
    if (stepText && stepText.length > 5 && stepText.length < 200) {
      steps.push(stepText);
    }
  }

  // Pattern 2: Checkbox items "- [ ] Do something"
  const checkboxPattern = /^\s*-\s*\[.\]\s+(.+?)(?:\n|$)/gim;
  while ((match = checkboxPattern.exec(text)) !== null) {
    const stepText = match[1]?.trim();
    if (stepText && stepText.length > 5 && stepText.length < 200) {
      steps.push(stepText);
    }
  }

  // Pattern 3: Bullet points with action verbs
  const actionVerbPattern = /^\s*[-*]\s+((?:Check|Verify|Deploy|Run|Execute|Start|Stop|Restart|Update|Configure|Set|Enable|Disable|Create|Delete|Remove|Add|Install|Uninstall|Monitor|Watch|Wait|Confirm|Approve|Review|Test|Validate|Ensure|Make sure)[^.\n]+)/gim;
  while ((match = actionVerbPattern.exec(text)) !== null) {
    const stepText = match[1]?.trim();
    if (stepText && stepText.length > 5 && stepText.length < 200 && !steps.includes(stepText)) {
      steps.push(stepText);
    }
  }

  return steps.slice(0, 20); // Limit to 20 steps
}

/**
 * Extract decision markers from document text.
 * Per spec Section 3.2: extractDecisionMarkers(text)
 */
export function extractDecisionMarkers(text: string): string[] {
  const decisions: string[] = [];

  const decisionPatterns = [
    /if\s+.{5,80}(?:,\s*)?then\s+.{5,80}/gi,
    /when\s+.{5,80}(?:,\s*)?(?:do|then)\s+.{5,80}/gi,
    /unless\s+.{5,80}/gi,
    /in\s+case\s+(?:of\s+)?.{5,80}/gi,
    /(?:otherwise|else)\s*[,:]?\s*.{5,80}/gi,
  ];

  for (const pattern of decisionPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const decision = match[0].trim().replace(/\s+/g, ' ');
      if (decision.length < 200) {
        decisions.push(decision);
      }
    }
  }

  return [...new Set(decisions)].slice(0, 10);
}

/**
 * Extract gates from document text.
 * Per spec Section 3.2: extractGates(text)
 */
export function extractGates(text: string): string[] {
  const gates: string[] = [];

  const gatePatterns = [
    // Approval gates
    /(?:requires?|needs?|must\s+have)\s+(?:approval|sign[\-\s]?off|review)\s+(?:from\s+)?[^.\n]{0,50}/gi,
    /(?:get|obtain)\s+(?:approval|sign[\-\s]?off)\s+(?:from\s+)?[^.\n]{0,50}/gi,
    // CI gates
    /(?:ci|tests?|checks?)\s+must\s+(?:pass|succeed|be\s+green)/gi,
    /(?:wait\s+for|ensure)\s+(?:ci|tests?|checks?|pipeline)/gi,
    // Canary/rollout gates
    /(?:canary|rollout)\s+(?:must|should)\s+[^.\n]{0,50}/gi,
    /(?:verify|check|monitor)\s+(?:canary|rollout|metrics)/gi,
    // Feature flag gates
    /(?:feature\s+flag|flag)\s+(?:must|should)\s+be\s+(?:enabled|disabled)/gi,
    /(?:enable|disable)\s+(?:feature\s+)?flag\s+[^.\n]{0,30}/gi,
  ];

  for (const pattern of gatePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const gate = match[0].trim().replace(/\s+/g, ' ');
      if (gate.length > 10 && gate.length < 150) {
        gates.push(gate);
      }
    }
  }

  return [...new Set(gates)].slice(0, 15);
}

// ============================================================================
// PROCESS DRIFT DETAILED ANALYSIS
// Per spec Section D - Enhanced process drift detection with structured result
// ============================================================================

// Gate detection patterns
const APPROVAL_GATE_PATTERNS = [
  /requires?\s+approval/gi,
  /get\s+sign[\-\s]?off/gi,
  /must\s+be\s+approved/gi,
  /approval\s+from/gi,
  /needs?\s+review/gi,
];

const ROLLBACK_GATE_PATTERNS = [
  /rollback\s+if/gi,
  /revert\s+when/gi,
  /rollback\s+procedure/gi,
  /undo\s+steps?/gi,
  /recovery\s+steps?/gi,
];

const ESCALATION_GATE_PATTERNS = [
  /escalate\s+to/gi,
  /page\s+(on[\-\s]?call|oncall)/gi,
  /contact\s+on[\-\s]?call/gi,
  /notify\s+(?:manager|lead|team)/gi,
  /alert\s+(?:sev|severity)/gi,
];

/**
 * Find process-related snippets in document and return their locations
 */
function findProcessFindings(
  docText: string,
  patterns: RegExp[],
  kind: ProcessFindingKind
): ProcessBaselineFinding[] {
  const findings: ProcessBaselineFinding[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(docText)) !== null) {
      // Expand snippet to include surrounding context (50 chars before/after)
      const snippetStart = Math.max(0, match.index - 50);
      const snippetEnd = Math.min(docText.length, match.index + match[0].length + 50);
      const snippet = docText.substring(snippetStart, snippetEnd);

      findings.push({
        kind,
        doc_snippet: snippet.replace(/\n/g, ' ').trim(),
        doc_location: {
          start_char: match.index,
          end_char: match.index + match[0].length,
        },
        matched_patterns: [match[0]],
      });
    }
  }

  return findings;
}

/**
 * Enhanced process drift detection with structured result.
 * Per spec Section 3.2 - Process Drift Handler with PR signal comparison
 *
 * @param docText - Current document content
 * @param prInfo - PR information for comparison
 * @param sectionIds - Optional section IDs from DocContext
 */
export function checkProcessBaselineDetailed(
  docText: string,
  prInfo?: {
    prTitle?: string;
    prDescription?: string;
    diffExcerpt?: string;
    changedFiles?: string[];
  },
  sectionIds?: string[]
): ProcessDriftResult {
  // ============================================================================
  // Step 1: Extract doc flow skeleton (deterministic)
  // ============================================================================
  const docSteps = extractStepSkeleton(docText);
  const docDecisions = extractDecisionMarkers(docText);
  const docGates = extractGates(docText);

  // Build findings from doc extraction
  const findings: ProcessBaselineFinding[] = [];

  // Add step findings
  for (const step of docSteps.slice(0, 5)) {
    const idx = docText.indexOf(step.substring(0, 20));
    findings.push({
      kind: 'step_list',
      doc_snippet: step.substring(0, 100),
      doc_location: { start_char: idx >= 0 ? idx : 0, end_char: idx >= 0 ? idx + step.length : 0 },
      matched_patterns: ['numbered_step'],
    });
  }

  // Add decision findings
  for (const decision of docDecisions.slice(0, 3)) {
    findings.push({
      kind: 'decision_logic',
      doc_snippet: decision,
      doc_location: { start_char: 0, end_char: decision.length },
      matched_patterns: ['if_then_marker'],
    });
  }

  // Add gate findings
  for (const gate of docGates.slice(0, 5)) {
    findings.push({
      kind: 'approval_gate',
      doc_snippet: gate,
      doc_location: { start_char: 0, end_char: gate.length },
      matched_patterns: ['gate_marker'],
    });
  }

  // ============================================================================
  // Step 2: Extract PR process signals
  // ============================================================================
  const prText = [
    prInfo?.prTitle || '',
    prInfo?.prDescription || '',
    prInfo?.diffExcerpt || '',
  ].join('\n');
  const changedFiles = prInfo?.changedFiles || [];
  const prSignals = extractProcessSignalsFromPR(prText, changedFiles);

  // ============================================================================
  // Step 3: Compare PR signals against doc gates/steps
  // ============================================================================
  let detected = false;
  let mismatchType: ProcessMismatchType = 'unknown';
  let rationale = '';
  const prFlow: string[] = [];

  // Check for new gate introduced
  const newGate = prSignals.gatesAdded.find(
    g => !docGates.some(dg => looselyMatches(dg, g))
  );
  if (newGate) {
    detected = true;
    mismatchType = 'new_gate';
    rationale = `PR indicates a new gate/requirement (${newGate}) that is not present in the runbook steps.`;
    prFlow.push(`New gate: ${newGate}`);
  }

  // Check for removed gate
  if (!detected) {
    const removedGate = prSignals.gatesRemoved.find(
      g => docGates.some(dg => looselyMatches(dg, g))
    );
    if (removedGate) {
      detected = true;
      mismatchType = 'removed_gate';
      rationale = `PR indicates a gate/step was removed (${removedGate}), but runbook still references it.`;
      prFlow.push(`Removed gate: ${removedGate}`);
    }
  }

  // Check for order change hints
  if (!detected && prSignals.orderHints.length > 0 && docSteps.length > 0) {
    const orderMismatch = detectOrderMismatch(prSignals.orderHints, docSteps);
    if (orderMismatch) {
      detected = true;
      mismatchType = 'order_change';
      rationale = `PR suggests process order changed (${orderMismatch}), but doc step order appears different.`;
      prFlow.push(`Order hint: ${orderMismatch}`);
    }
  }

  // Add all PR signals to prFlow for visibility
  prSignals.gatesAdded.forEach(g => {
    if (!prFlow.some(p => p.includes(g))) prFlow.push(`Gate added: ${g}`);
  });
  prSignals.gatesRemoved.forEach(g => {
    if (!prFlow.some(p => p.includes(g))) prFlow.push(`Gate removed: ${g}`);
  });
  prSignals.orderHints.forEach(h => {
    if (!prFlow.some(p => p.includes(h))) prFlow.push(`Order hint: ${h}`);
  });
  if (prSignals.mentionsWorkflowFiles) prFlow.push('Modifies workflow files');
  if (prSignals.explicitProcessChange) prFlow.push('Explicit process change');

  // ============================================================================
  // Step 4: Calculate confidence suggestion
  // ============================================================================
  let conf = 0;
  if (detected) {
    if (prSignals.explicitProcessChange) conf += 0.5;
    if (prSignals.mentionsWorkflowFiles) conf += 0.2;
    if (docSteps.length > 0) conf += 0.2;
    conf = Math.min(conf, 0.95);
  }

  // ============================================================================
  // Step 5: Determine safe patch style
  // ============================================================================
  const hasCleanNumberedSteps = hasNumberedList(docText) && docSteps.length >= 3;
  let recommendedPatchStyle: 'add_note' | 'reorder_steps' | 'add_section' = 'add_note';

  if (detected && mismatchType === 'order_change' && conf >= 0.75 && hasCleanNumberedSteps) {
    recommendedPatchStyle = 'reorder_steps';
  } else if (detected && mismatchType === 'new_gate' && conf >= 0.7) {
    recommendedPatchStyle = 'add_note'; // or add_section for larger additions
  }

  // ============================================================================
  // Step 6: Determine recommended action
  // FIX F4: Increase threshold to 0.80 and default to annotate_only for safety
  // Process drift patches are high-risk for reviewer fatigue if wrong
  // ============================================================================
  let recommendedAction: 'generate_patch' | 'annotate_only' | 'review_queue' = 'annotate_only';
  if (detected && conf >= 0.80) {
    // Only generate patch if we have very high confidence (0.80+)
    recommendedAction = 'generate_patch';
  } else if (detected && conf >= 0.60 && conf < 0.80) {
    // Medium confidence: annotate only, don't reorder steps
    recommendedAction = 'annotate_only';
  } else if (detected && conf < 0.60) {
    // Low confidence: send to review queue for human decision
    recommendedAction = 'review_queue';
  }

  // Use provided section IDs or generate placeholder IDs
  const affectedSectionIds = sectionIds && sectionIds.length > 0
    ? sectionIds
    : findings.slice(0, 5).map((_, i) => `section-${i}`);

  return {
    detected,
    confidence_suggestion: conf,
    mismatch_type: mismatchType,
    affected_section_ids: affectedSectionIds,
    findings: findings.slice(0, 10),
    doc_flow: docSteps,
    pr_flow: prFlow,
    recommended_patch_style: recommendedPatchStyle,
    recommended_action: recommendedAction,
    rationale: detected
      ? rationale
      : 'No process mismatch detected with current heuristics.',
  };
}

// ============================================================================
// Point 10: Source-Specific Domain Detection Patterns
// ============================================================================

/**
 * Domain detection patterns per source type
 * Different sources have different indicators for drift domains
 */
export const SOURCE_DOMAIN_PATTERNS: Record<InputSourceType, Record<string, RegExp[]>> = {
  github_pr: {
    rollback: [
      /revert/gi,
      /rollback/gi,
      /roll\s+back/gi,
      /undo/gi,
      /previous\s+version/gi,
    ],
    auth: [
      /auth/gi,
      /authentication/gi,
      /authorization/gi,
      /oauth/gi,
      /jwt/gi,
      /token/gi,
      /session/gi,
      /login/gi,
      /logout/gi,
    ],
    deployment: [
      /deploy/gi,
      /release/gi,
      /ci\/cd/gi,
      /pipeline/gi,
      /build/gi,
    ],
    api: [
      /\/api\//gi,
      /endpoint/gi,
      /route/gi,
      /controller/gi,
      /handler/gi,
    ],
  },

  pagerduty_incident: {
    rollback: [
      /rolled\s+back/gi,
      /reverted/gi,
      /previous\s+version/gi,
    ],
    deployment: [
      /deployment\s+failed/gi,
      /deploy\s+issue/gi,
      /release\s+problem/gi,
    ],
    infra: [
      /infrastructure/gi,
      /server/gi,
      /database/gi,
      /redis/gi,
      /postgres/gi,
      /kubernetes/gi,
    ],
    observability: [
      /monitoring/gi,
      /alert/gi,
      /metric/gi,
      /dashboard/gi,
      /log/gi,
    ],
  },

  slack_cluster: {
    onboarding: [
      /how\s+do\s+i/gi,
      /getting\s+started/gi,
      /new\s+to/gi,
      /first\s+time/gi,
    ],
    api: [
      /api/gi,
      /endpoint/gi,
      /request/gi,
      /response/gi,
    ],
    config: [
      /configuration/gi,
      /config/gi,
      /setting/gi,
      /environment\s+variable/gi,
    ],
  },

  datadog_alert: {
    observability: [
      /cpu/gi,
      /memory/gi,
      /disk/gi,
      /latency/gi,
      /error\s+rate/gi,
    ],
    infra: [
      /host/gi,
      /container/gi,
      /pod/gi,
      /node/gi,
    ],
  },

  github_iac: {
    infra: [
      /resource/gi,
      /module/gi,
      /provider/gi,
      /terraform/gi,
      /pulumi/gi,
    ],
    config: [
      /variable/gi,
      /output/gi,
      /parameter/gi,
    ],
    deployment: [
      /stack/gi,
      /environment/gi,
      /region/gi,
    ],
  },

  github_codeowners: {
    ownership_routing: [
      /CODEOWNERS/gi,
      /@[a-zA-Z0-9_-]+/g,
      /team/gi,
    ],
  },
};

/**
 * Get domain patterns for a source type
 */
export function getDomainPatternsForSource(sourceType: InputSourceType): Record<string, RegExp[]> {
  return SOURCE_DOMAIN_PATTERNS[sourceType] || {};
}

/**
 * Detect domains from text using source-specific patterns
 */
export function detectDomainsFromSource(
  text: string,
  sourceType: InputSourceType
): string[] {
  const patterns = getDomainPatternsForSource(sourceType);
  const detectedDomains: string[] = [];

  for (const [domain, regexes] of Object.entries(patterns)) {
    for (const regex of regexes) {
      if (regex.test(text)) {
        detectedDomains.push(domain);
        break;  // Domain detected, move to next domain
      }
    }
  }

  return detectedDomains;
}
