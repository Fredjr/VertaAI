/**
 * EvidencePack Extraction
 * 
 * Deterministic extraction of structured evidence from PR data.
 * This provides the "evidence" side of drift comparison.
 * 
 * @see Spec: EvidencePack type definition
 */

// ============================================================================
// Types
// ============================================================================

export interface EvidencePack {
  pr: {
    title: string;
    body: string;
    files_changed: string[];
    diff_excerpt: string;
  };
  extracted: {
    keywords: string[];        // from title/body + matched rule keywords
    tool_mentions: string[];   // helm/kubectl/argo/circleci etc
    commands: string[];        // extracted commands from diff excerpt
    config_keys: string[];     // env var-like strings (FOO_BAR)
    endpoints: string[];       // /v1/... patterns
  };
  rule_hits: string[];         // eligibility rule ids that matched
}

// ============================================================================
// Extraction Patterns
// ============================================================================

// Tool/platform mentions to extract
const TOOL_PATTERNS: RegExp[] = [
  /\b(kubectl|helm|terraform|docker|podman)\b/gi,
  /\b(aws|gcloud|az|azure)\b/gi,
  /\b(circleci|buildkite|jenkins|travis|github\s*actions?|gitlab[\s-]?ci)\b/gi,
  /\b(argocd|flux|spinnaker|harness)\b/gi,
  /\b(datadog|newrelic|grafana|prometheus|splunk|honeycomb)\b/gi,
  /\b(launchdarkly|split\.io|optimizely|flagsmith)\b/gi,
  /\b(redis|postgres|mysql|mongodb|elasticsearch)\b/gi,
  /\b(kafka|rabbitmq|sqs|sns|pubsub)\b/gi,
  /\b(npm|yarn|pnpm|pip|poetry|cargo|go\s+mod)\b/gi,
];

// Command patterns to extract from diff
const COMMAND_PATTERNS: RegExp[] = [
  /`(kubectl\s+[^`]+)`/gi,
  /`(helm\s+[^`]+)`/gi,
  /`(terraform\s+[^`]+)`/gi,
  /`(docker\s+[^`]+)`/gi,
  /`(aws\s+[^`]+)`/gi,
  /`(gcloud\s+[^`]+)`/gi,
  /`(npm\s+[^`]+)`/gi,
  /`(yarn\s+[^`]+)`/gi,
  /`(make\s+\w+)`/gi,
  /`(\.\/[^\s`]+)`/gi,
  /\$\s*(kubectl\s+[^\n]+)/gi,
  /\$\s*(helm\s+[^\n]+)/gi,
  /\$\s*(docker\s+[^\n]+)/gi,
];

// Config key patterns (ENV_VAR style)
const CONFIG_KEY_PATTERNS: RegExp[] = [
  /\b([A-Z][A-Z0-9_]{2,})\s*[=:]/g,           // FOO_BAR=value or FOO_BAR: value
  /\benv\s*\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/gi, // env["FOO_BAR"]
  /\bprocess\.env\.([A-Z][A-Z0-9_]+)/gi,      // process.env.FOO_BAR
  /\bos\.environ\[["']([A-Z][A-Z0-9_]+)["']\]/gi, // os.environ["FOO_BAR"]
];

// Endpoint patterns
const ENDPOINT_PATTERNS: RegExp[] = [
  /["'](\/v\d+\/[^"'\s]+)["']/gi,             // "/v1/users"
  /["'](\/api\/[^"'\s]+)["']/gi,              // "/api/users"
  /https?:\/\/[^\s"']+/gi,                     // Full URLs
  /router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/gi,  // router.get('/path')
  /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/gi,     // app.get('/path')
  /@(Get|Post|Put|Delete|Patch)\(['"]([^'"]+)['"]\)/gi,       // @Get('/path') decorators
];

// High-risk keywords that suggest drift
const HIGH_RISK_KEYWORDS = [
  'breaking', 'migrate', 'deprecate', 'deprecated', 'remove', 'rename',
  'rollback', 'deploy', 'release', 'config', 'endpoint', 'auth',
  'api', 'env', 'secret', 'database', 'schema', 'migration',
  'upgrade', 'downgrade', 'replace', 'swap', 'switch',
];

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract structured evidence from PR data.
 * This is deterministic - same input always produces same output.
 */
export function extractEvidencePack(input: {
  prTitle: string;
  prBody: string | null;
  changedFiles: string[];
  diff: string;
  ruleHits?: string[];
}): EvidencePack {
  const { prTitle, prBody, changedFiles, diff, ruleHits = [] } = input;
  
  // Combine text sources for extraction
  const allText = [prTitle, prBody || '', diff].join('\n');
  
  // Extract tool mentions
  const toolMentions = extractMatches(allText, TOOL_PATTERNS);
  
  // Extract commands (primarily from diff)
  const commands = extractMatches(diff, COMMAND_PATTERNS);
  
  // Extract config keys
  const configKeys = extractMatches(allText, CONFIG_KEY_PATTERNS);
  
  // Extract endpoints
  const endpoints = extractMatches(allText, ENDPOINT_PATTERNS);
  
  // Extract keywords from title/body
  const keywords = extractKeywords(prTitle, prBody || '');
  
  return {
    pr: {
      title: prTitle,
      body: prBody || '',
      files_changed: changedFiles,
      diff_excerpt: diff.substring(0, 8000), // Bounded
    },
    extracted: {
      keywords,
      tool_mentions: toolMentions,
      commands,
      config_keys: configKeys,
      endpoints,
    },
    rule_hits: ruleHits,
  };
}

/**
 * Extract unique matches from text using multiple patterns.
 */
function extractMatches(text: string, patterns: RegExp[]): string[] {
  const matches = new Set<string>();
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Use capture group if present, otherwise full match
      const value = (match[1] || match[0]).trim().toLowerCase();
      if (value.length > 1) {
        matches.add(value);
      }
    }
  }
  
  return [...matches].slice(0, 50); // Limit to 50 items
}

/**
 * Extract keywords from PR title and body.
 */
function extractKeywords(title: string, body: string): string[] {
  const text = `${title} ${body}`.toLowerCase();
  const keywords = new Set<string>();

  // Check for high-risk keywords
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      keywords.add(keyword);
    }
  }

  // Extract significant words from title (>3 chars, not common words)
  const commonWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been']);
  const titleWords = title.toLowerCase().split(/\s+/);
  for (const word of titleWords) {
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (clean.length > 3 && !commonWords.has(clean)) {
      keywords.add(clean);
    }
  }

  return [...keywords].slice(0, 30);
}

// ============================================================================
// Tool Migration Detection (Gap 6)
// ============================================================================

// Tool migration pairs: [old_tool, new_tool, file_patterns]
const TOOL_MIGRATION_PAIRS: Array<{
  oldTool: string;
  newTool: string;
  oldFilePatterns: RegExp[];
  newFilePatterns: RegExp[];
}> = [
  {
    oldTool: 'circleci',
    newTool: 'github_actions',
    oldFilePatterns: [/\.circleci\/config\.yml/i, /circle\.yml/i],
    newFilePatterns: [/\.github\/workflows\//i],
  },
  {
    oldTool: 'jenkins',
    newTool: 'github_actions',
    oldFilePatterns: [/Jenkinsfile/i, /jenkins\//i],
    newFilePatterns: [/\.github\/workflows\//i],
  },
  {
    oldTool: 'travis',
    newTool: 'github_actions',
    oldFilePatterns: [/\.travis\.yml/i],
    newFilePatterns: [/\.github\/workflows\//i],
  },
  {
    oldTool: 'kubectl',
    newTool: 'helm',
    oldFilePatterns: [/k8s\/.*\.ya?ml$/i, /kubernetes\/.*\.ya?ml$/i],
    newFilePatterns: [/charts?\//i, /helm\//i, /Chart\.yaml/i],
  },
  {
    oldTool: 'docker_compose',
    newTool: 'kubernetes',
    oldFilePatterns: [/docker-compose\.ya?ml/i],
    newFilePatterns: [/k8s\//i, /kubernetes\//i, /\.github\/workflows\//i],
  },
  {
    oldTool: 'npm',
    newTool: 'yarn',
    oldFilePatterns: [/package-lock\.json/i],
    newFilePatterns: [/yarn\.lock/i],
  },
  {
    oldTool: 'yarn',
    newTool: 'pnpm',
    oldFilePatterns: [/yarn\.lock/i],
    newFilePatterns: [/pnpm-lock\.yaml/i],
  },
];

export interface ToolMigration {
  oldTool: string;
  newTool: string;
  confidence: number;
  removedFiles: string[];
  addedFiles: string[];
}

/**
 * Detect tool migrations from changed files.
 * Returns detected migrations with confidence scores.
 */
export function detectToolMigrations(changedFiles: Array<{
  filename: string;
  status: string;
}>): ToolMigration[] {
  const migrations: ToolMigration[] = [];

  const removedFiles = changedFiles.filter(f => f.status === 'removed').map(f => f.filename);
  const addedFiles = changedFiles.filter(f => f.status === 'added').map(f => f.filename);
  const modifiedFiles = changedFiles.filter(f => f.status === 'modified').map(f => f.filename);

  for (const pair of TOOL_MIGRATION_PAIRS) {
    const matchedOldRemoved = removedFiles.filter(f =>
      pair.oldFilePatterns.some(p => p.test(f))
    );
    const matchedNewAdded = addedFiles.filter(f =>
      pair.newFilePatterns.some(p => p.test(f))
    );

    // Also check if old files are modified (might be removal in progress)
    const matchedOldModified = modifiedFiles.filter(f =>
      pair.oldFilePatterns.some(p => p.test(f))
    );

    // Migration detected if: old files removed/modified AND new files added
    if ((matchedOldRemoved.length > 0 || matchedOldModified.length > 0) && matchedNewAdded.length > 0) {
      let confidence = 0.5; // Base confidence

      // Higher confidence if old files are actually removed
      if (matchedOldRemoved.length > 0) {
        confidence += 0.3;
      }

      // Higher confidence if multiple new files added
      if (matchedNewAdded.length > 1) {
        confidence += 0.1;
      }

      migrations.push({
        oldTool: pair.oldTool,
        newTool: pair.newTool,
        confidence: Math.min(confidence, 0.95),
        removedFiles: matchedOldRemoved,
        addedFiles: matchedNewAdded,
      });
    }
  }

  return migrations;
}

// ============================================================================
// Coverage Scenario Extraction (Gap 5)
// ============================================================================

// Scenario keywords that indicate new operational scenarios
export const SCENARIO_KEYWORDS = [
  'canary', 'blue-green', 'blue/green', 'bluegreen',
  'rollback', 'rollforward', 'hotfix',
  'feature flag', 'feature-flag', 'featureflag',
  'migration', 'data migration', 'schema migration',
  'failover', 'disaster recovery', 'dr',
  'rate limit', 'rate-limit', 'ratelimit',
  'circuit breaker', 'circuit-breaker',
  'backfill', 'reindex', 'rebuild',
  'emergency', 'incident', 'outage',
  'region', 'multi-region', 'cross-region',
  'auth', 'authentication', 'authorization', 'oauth', 'sso',
  'cache', 'caching', 'invalidation',
  'queue', 'async', 'background job',
];

/**
 * Extract scenario keywords from PR that might indicate new operational scenarios.
 */
export function extractScenarioKeywords(prTitle: string, prBody: string | null, diff: string): string[] {
  const text = `${prTitle} ${prBody || ''} ${diff}`.toLowerCase();
  const found: string[] = [];

  for (const keyword of SCENARIO_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      found.push(keyword);
    }
  }

  return [...new Set(found)];
}

