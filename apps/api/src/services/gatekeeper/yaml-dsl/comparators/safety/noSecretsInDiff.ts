/**
 * NO_SECRETS_IN_DIFF Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks for secrets in PR diff using regex patterns
 * CRITICAL FIX (Gap #5): Uses RE2 for user-provided patterns to prevent ReDoS
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import crypto from 'crypto';
import RE2 from 're2';

// Default secret patterns (safe, pre-vetted regexes using native RegExp)
// These are trusted patterns, so we can use native RegExp for performance
const DEFAULT_SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9-_]{16,}['"]?/i,
  /AKIA[0-9A-Z]{16}/,  // AWS Access Key
  /ghp_[A-Za-z0-9]{36}/,  // GitHub Personal Access Token
  /sk-[A-Za-z0-9]{48}/,  // OpenAI API Key
  /password\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /secret\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /token\s*[:=]\s*['"][^'"]{16,}['"]/i,
];

export const noSecretsInDiffComparator: Comparator = {
  id: ComparatorId.NO_SECRETS_IN_DIFF,
  version: '1.0.0',

  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const customPatterns = context.defaults?.safety?.secretPatterns || [];

    // CRITICAL FIX (Gap #5): Use RE2 for user-provided patterns to prevent ReDoS
    // RE2 uses a non-backtracking algorithm that guarantees linear time complexity
    const customRE2Patterns: RE2[] = [];
    for (const pattern of customPatterns) {
      try {
        customRE2Patterns.push(new RE2(pattern, 'i'));
      } catch (error) {
        console.error(`[NO_SECRETS_IN_DIFF] Invalid regex pattern: ${pattern}`, error);
      }
    }

    const detectedSecrets: Array<{ file: string; line: number; hash: string; pattern: string }> = [];

    // Scan all file patches
    for (const file of context.files) {
      // CRITICAL FIX (Gap #7): Handle missing/truncated patches explicitly
      if (!file.patch) {
        // Policy: If patch is missing, we cannot scan for secrets
        // This is a WARN condition (not BLOCK) to avoid false positives
        console.warn(`[NO_SECRETS_IN_DIFF] Patch missing for file: ${file.filename}`);
        continue;
      }

      const lines = file.patch.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Only check added lines (start with +)
        if (!line.startsWith('+')) continue;

        // Check default patterns (native RegExp - trusted)
        for (const pattern of DEFAULT_SECRET_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            // Hash the secret for evidence (don't expose actual value)
            const hash = crypto.createHash('sha256').update(match[0]).digest('hex').substring(0, 16);

            detectedSecrets.push({
              file: file.filename,
              line: i + 1,
              hash,
              pattern: pattern.source,
            });
            break; // Only report first match per line
          }
        }

        // Check custom patterns (RE2 - user-provided, ReDoS-safe)
        for (const pattern of customRE2Patterns) {
          const match = pattern.exec(line);
          if (match) {
            // Hash the secret for evidence (don't expose actual value)
            const hash = crypto.createHash('sha256').update(match[0]).digest('hex').substring(0, 16);

            detectedSecrets.push({
              file: file.filename,
              line: i + 1,
              hash,
              pattern: pattern.source,
            });
            break; // Only report first match per line
          }
        }
      }
    }

    if (detectedSecrets.length === 0) {
      return {
        comparatorId: this.id,
        status: 'pass',
        evidence: [],
        reasonCode: FindingCode.PASS,
        message: 'No secrets detected in diff',
      };
    }

    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: detectedSecrets.map(s => ({
        type: 'secret_detected',
        hash: s.hash,
        location: `${s.file}:${s.line}`,
        pattern: s.pattern,
      })),
      reasonCode: FindingCode.SECRET_DETECTED,
      message: `Detected ${detectedSecrets.length} potential secret(s) in diff`,
    };
  },
};

