/**
 * CODEOWNERS Parser
 * 
 * Parses CODEOWNERS files to detect ownership changes in PRs.
 * Generates ownership drift signals when CODEOWNERS is modified.
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 6.3.2
 */

/**
 * Represents a single CODEOWNERS rule
 */
export interface CodeOwnerRule {
  pattern: string;        // File pattern (e.g., "*.js", "/src/api/")
  owners: string[];       // Array of owners (e.g., ["@team-frontend", "@jsmith"])
  lineNumber: number;     // Line number in CODEOWNERS file
}

/**
 * Represents the parsed CODEOWNERS file
 */
export interface ParsedCodeOwners {
  rules: CodeOwnerRule[];
  globalOwners: string[];  // Default owners (first rule without pattern)
  errors: string[];        // Parse errors/warnings
}

/**
 * Result of comparing two CODEOWNERS files
 */
export interface CodeOwnersChange {
  type: 'added' | 'removed' | 'modified';
  pattern: string;
  oldOwners?: string[];
  newOwners?: string[];
  impactedPaths?: string[];  // Paths affected by this change
}

export interface CodeOwnersDiff {
  changes: CodeOwnersChange[];
  hasOwnershipDrift: boolean;
  summary: string;
  impactedTeams: string[];
  impactedUsers: string[];
}

/**
 * Common CODEOWNERS file paths
 */
export const CODEOWNERS_PATHS = [
  'CODEOWNERS',
  '.github/CODEOWNERS',
  'docs/CODEOWNERS',
] as const;

/**
 * Check if a file path is a CODEOWNERS file
 */
export function isCodeOwnersFile(filePath: string): boolean {
  return CODEOWNERS_PATHS.includes(filePath as typeof CODEOWNERS_PATHS[number]) ||
    filePath.endsWith('/CODEOWNERS') ||
    filePath === 'CODEOWNERS';
}

/**
 * Parse a CODEOWNERS file content
 */
export function parseCodeOwners(content: string): ParsedCodeOwners {
  const rules: CodeOwnerRule[] = [];
  const errors: string[] = [];
  let globalOwners: string[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;

    const line = rawLine.trim();
    const lineNumber = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Parse line: pattern owners...
    // Pattern can contain spaces if escaped, but typically it's the first token
    const parts = line.split(/\s+/);

    if (parts.length < 2) {
      // Line with pattern but no owners (clears ownership)
      const firstPart = parts[0];
      if (parts.length === 1 && firstPart) {
        rules.push({
          pattern: firstPart,
          owners: [],
          lineNumber,
        });
      }
      continue;
    }

    const pattern = parts[0] ?? '';
    const owners = parts.slice(1).filter(o => o.startsWith('@') || o.includes('@'));

    // First rule with * pattern sets global owners
    if (pattern === '*' && rules.length === 0) {
      globalOwners = owners;
    }

    rules.push({
      pattern,
      owners,
      lineNumber,
    });
  }

  return { rules, globalOwners, errors };
}

/**
 * Compare two CODEOWNERS files and detect changes
 */
export function diffCodeOwners(
  oldContent: string | null,
  newContent: string | null
): CodeOwnersDiff {
  const changes: CodeOwnersChange[] = [];
  const impactedTeams = new Set<string>();
  const impactedUsers = new Set<string>();

  // Parse both files
  const oldParsed = oldContent ? parseCodeOwners(oldContent) : { rules: [], globalOwners: [], errors: [] };
  const newParsed = newContent ? parseCodeOwners(newContent) : { rules: [], globalOwners: [], errors: [] };

  // Create maps by pattern for comparison
  const oldRulesMap = new Map<string, CodeOwnerRule>();
  const newRulesMap = new Map<string, CodeOwnerRule>();

  for (const rule of oldParsed.rules) {
    oldRulesMap.set(rule.pattern, rule);
  }
  for (const rule of newParsed.rules) {
    newRulesMap.set(rule.pattern, rule);
  }

  // Find added and modified rules
  for (const [pattern, newRule] of newRulesMap) {
    const oldRule = oldRulesMap.get(pattern);
    
    if (!oldRule) {
      // New rule added
      changes.push({
        type: 'added',
        pattern,
        newOwners: newRule.owners,
      });
      newRule.owners.forEach(o => o.startsWith('@') && (o.includes('/') ? impactedTeams.add(o) : impactedUsers.add(o)));
    } else if (!arraysEqual(oldRule.owners, newRule.owners)) {
      // Rule modified
      changes.push({
        type: 'modified',
        pattern,
        oldOwners: oldRule.owners,
        newOwners: newRule.owners,
      });
      [...oldRule.owners, ...newRule.owners].forEach(o => 
        o.startsWith('@') && (o.includes('/') ? impactedTeams.add(o) : impactedUsers.add(o))
      );
    }
  }

  // Find removed rules
  for (const [pattern, oldRule] of oldRulesMap) {
    if (!newRulesMap.has(pattern)) {
      changes.push({
        type: 'removed',
        pattern,
        oldOwners: oldRule.owners,
      });
      oldRule.owners.forEach(o => o.startsWith('@') && (o.includes('/') ? impactedTeams.add(o) : impactedUsers.add(o)));
    }
  }

  // Generate summary
  const summaryParts: string[] = [];
  const addedCount = changes.filter(c => c.type === 'added').length;
  const removedCount = changes.filter(c => c.type === 'removed').length;
  const modifiedCount = changes.filter(c => c.type === 'modified').length;

  if (addedCount > 0) summaryParts.push(`${addedCount} rule(s) added`);
  if (removedCount > 0) summaryParts.push(`${removedCount} rule(s) removed`);
  if (modifiedCount > 0) summaryParts.push(`${modifiedCount} rule(s) modified`);

  const summary = summaryParts.length > 0
    ? `CODEOWNERS changes: ${summaryParts.join(', ')}`
    : 'No ownership changes detected';

  return {
    changes,
    hasOwnershipDrift: changes.length > 0,
    summary,
    impactedTeams: Array.from(impactedTeams),
    impactedUsers: Array.from(impactedUsers),
  };
}

/**
 * Helper to compare arrays for equality
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Get owners for a specific file path based on CODEOWNERS rules
 * Rules are matched bottom-up (later rules override earlier ones)
 */
export function getOwnersForPath(rules: CodeOwnerRule[], filePath: string): string[] {
  let matchedOwners: string[] = [];

  for (const rule of rules) {
    if (matchesPattern(rule.pattern, filePath)) {
      matchedOwners = rule.owners;
    }
  }

  return matchedOwners;
}

/**
 * Match a CODEOWNERS pattern against a file path
 *
 * Pattern syntax:
 * - * matches any file
 * - /path/ matches directory at root
 * - path/ matches directory anywhere
 * - *.ext matches file extension
 * - /path/* matches direct children
 * - /path/** matches all descendants
 */
function matchesPattern(pattern: string, filePath: string): boolean {
  // Normalize paths
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

  // Simple patterns
  if (pattern === '*') return true;

  // Directory patterns
  if (pattern.endsWith('/')) {
    const dir = pattern.startsWith('/') ? pattern : `/${pattern}`;
    return normalizedPath.startsWith(dir) || normalizedPath === dir.slice(0, -1);
  }

  // Extension patterns (e.g., *.js)
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1); // .js
    return normalizedPath.endsWith(ext);
  }

  // Glob patterns with **
  if (pattern.includes('**')) {
    const regex = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\//g, '\\/');
    const fullRegex = pattern.startsWith('/')
      ? new RegExp(`^${regex}`)
      : new RegExp(`(^|/)${regex}`);
    return fullRegex.test(normalizedPath);
  }

  // Glob patterns with single *
  if (pattern.includes('*')) {
    const regex = pattern
      .replace(/\*/g, '[^/]*')
      .replace(/\//g, '\\/');
    const fullRegex = pattern.startsWith('/')
      ? new RegExp(`^${regex}$`)
      : new RegExp(`(^|/)${regex}$`);
    return fullRegex.test(normalizedPath);
  }

  // Exact path match
  const exactPattern = pattern.startsWith('/') ? pattern : `/${pattern}`;
  return normalizedPath === exactPattern || normalizedPath.startsWith(`${exactPattern}/`);
}

/**
 * Extract ownership drift signal data from CODEOWNERS changes
 */
export function createOwnershipDriftSignal(
  diff: CodeOwnersDiff,
  repoFullName: string,
  prNumber: number
): {
  driftType: 'ownership';
  driftDomains: string[];
  evidenceSummary: string;
  confidence: number;
} | null {
  if (!diff.hasOwnershipDrift) {
    return null;
  }

  const driftDomains = [
    ...diff.impactedTeams.map(t => `team:${t}`),
    ...diff.impactedUsers.map(u => `user:${u}`),
  ];

  const evidenceLines = diff.changes.map(c => {
    if (c.type === 'added') {
      return `+ ${c.pattern}: ${c.newOwners?.join(', ') || '(no owners)'}`;
    } else if (c.type === 'removed') {
      return `- ${c.pattern}: ${c.oldOwners?.join(', ')}`;
    } else {
      return `~ ${c.pattern}: ${c.oldOwners?.join(', ')} → ${c.newOwners?.join(', ')}`;
    }
  });

  return {
    driftType: 'ownership',
    driftDomains,
    evidenceSummary: `CODEOWNERS modified in ${repoFullName} PR#${prNumber}:\n${evidenceLines.join('\n')}`,
    confidence: 0.90, // CODEOWNERS changes are high-confidence ownership drift
  };
}

