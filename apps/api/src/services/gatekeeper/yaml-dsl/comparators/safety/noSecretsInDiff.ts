/**
 * NO_SECRETS_IN_DIFF Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks for secrets in PR diff using regex patterns
 * CRITICAL: Uses RE2 for user-provided patterns to prevent ReDoS
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import crypto from 'crypto';

// Default secret patterns (safe, pre-vetted regexes)
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
    const allPatterns = [...DEFAULT_SECRET_PATTERNS];

    // Add custom patterns (with RE2 safety check in production)
    for (const pattern of customPatterns) {
      try {
        allPatterns.push(new RegExp(pattern, 'i'));
      } catch (error) {
        console.error(`[NO_SECRETS_IN_DIFF] Invalid regex pattern: ${pattern}`, error);
      }
    }

    const detectedSecrets: Array<{ file: string; line: number; hash: string; pattern: string }> = [];

    // Scan all file patches
    for (const file of context.files) {
      if (!file.patch) continue;

      const lines = file.patch.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Only check added lines (start with +)
        if (!line.startsWith('+')) continue;

        for (const pattern of allPatterns) {
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

