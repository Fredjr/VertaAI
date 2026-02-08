// Deterministic Document Claim Extractor
// Extracts claims from documentation without LLM hallucination
// Based on GAP_ANALYSIS.md Appendix C specifications

import { DocClaim } from './types.js';

interface ExtractDocClaimsArgs {
  docContext: any;
  driftType: string;
  docSystem: string;
}

/**
 * Main function to extract deterministic doc claims
 */
export async function extractDocClaims(args: ExtractDocClaimsArgs): Promise<DocClaim[]> {
  const { docContext, driftType, docSystem } = args;
  
  if (!docContext || !docContext.content) {
    return [];
  }
  
  const docText = docContext.content;
  const claims: DocClaim[] = [];
  
  // Route to appropriate extractor based on doc system and drift type
  switch (docSystem) {
    case 'confluence':
      claims.push(...extractConfluenceClaims(docText, driftType));
      break;
    
    case 'github_swagger':
      claims.push(...extractSwaggerClaims(docText, driftType));
      break;
    
    case 'backstage':
      claims.push(...extractBackstageClaims(docText, driftType));
      break;
    
    case 'github_readme':
      claims.push(...extractReadmeClaims(docText, driftType));
      break;
    
    case 'github_code_comments':
      claims.push(...extractCodeCommentClaims(docText, driftType));
      break;
    
    case 'notion':
      claims.push(...extractNotionClaims(docText, driftType));
      break;
    
    case 'gitbook':
      claims.push(...extractGitBookClaims(docText, driftType));
      break;
    
    default:
      // Generic extraction for unknown doc systems
      claims.push(...extractGenericClaims(docText, driftType));
  }
  
  return claims;
}

/**
 * Extract claims from Confluence pages
 */
function extractConfluenceClaims(docText: string, driftType: string): DocClaim[] {
  const claims: DocClaim[] = [];
  
  if (driftType === 'instruction') {
    // Look for instruction tokens: "run", "execute", "deploy"
    const instructionTokens = ['run', 'execute', 'deploy', 'start', 'stop', 'restart'];
    for (const token of instructionTokens) {
      const tokenWindow = findTokenWindow(docText, token, 4);
      if (tokenWindow) {
        claims.push({
          claimType: 'instruction_block',
          label: `Instruction containing "${token}"`,
          snippet: tokenWindow.snippet,
          location: {
            startLine: tokenWindow.startLine,
            endLine: tokenWindow.endLine
          },
          confidence: 0.8,
          extractionMethod: 'token_pattern'
        });
      }
    }
  }
  
  if (driftType === 'process') {
    // Look for process steps: numbered lists, "step", "then"
    const processPatterns = [/^\s*\d+\.\s+/gm, /step \d+/gi, /then\s+/gi];
    for (const pattern of processPatterns) {
      const matches = docText.matchAll(pattern);
      for (const match of matches) {
        const stepSkeleton = extractStepSkeleton(docText, match.index || 0);
        if (stepSkeleton) {
          claims.push({
            claimType: 'process_step',
            label: 'Process step',
            snippet: stepSkeleton.snippet,
            location: {
              startLine: stepSkeleton.startLine,
              endLine: stepSkeleton.endLine
            },
            confidence: 0.9,
            extractionMethod: 'token_pattern'
          });
        }
      }
    }
  }
  
  return claims;
}

/**
 * Extract claims from Swagger/OpenAPI documentation
 */
function extractSwaggerClaims(docText: string, driftType: string): DocClaim[] {
  const claims: DocClaim[] = [];
  
  if (driftType === 'instruction' || driftType === 'process') {
    // Look for API endpoints and operations
    const endpointPattern = /^\s*(get|post|put|delete|patch):\s*$/gmi;
    const matches = docText.matchAll(endpointPattern);
    
    for (const match of matches) {
      const endpointBlock = extractBlockAroundPatterns(docText, match.index || 0, 10);
      if (endpointBlock) {
        claims.push({
          claimType: 'api_endpoint',
          label: `API endpoint: ${match[1]?.toUpperCase() || 'UNKNOWN'}`,
          snippet: endpointBlock.snippet,
          location: {
            startLine: endpointBlock.startLine,
            endLine: endpointBlock.endLine
          },
          confidence: 0.95,
          extractionMethod: 'yaml_parse'
        });
      }
    }
  }
  
  return claims;
}

/**
 * Extract claims from Backstage catalog-info.yaml
 */
function extractBackstageClaims(docText: string, driftType: string): DocClaim[] {
  const claims: DocClaim[] = [];
  
  if (driftType === 'ownership') {
    // Look for owner field in YAML
    const ownerLine = findTokenWindow(docText, 'owner:', 4);
    if (ownerLine) {
      claims.push({
        claimType: 'owner_block',
        label: 'Backstage owner field',
        snippet: ownerLine.snippet,
        location: {
          startLine: ownerLine.startLine,
          endLine: ownerLine.endLine
        },
        confidence: 0.95,
        extractionMethod: 'yaml_parse'
      });
    }
  }
  
  return claims;
}

/**
 * Extract claims from README files
 */
function extractReadmeClaims(docText: string, driftType: string): DocClaim[] {
  const claims: DocClaim[] = [];
  
  if (driftType === 'environment_tooling') {
    // Look for tool references: kubectl, helm, docker, etc.
    const toolTokens = ['kubectl', 'helm', 'docker', 'terraform', 'ansible'];
    for (const tool of toolTokens) {
      const toolWindow = findTokenWindow(docText, tool, 3);
      if (toolWindow) {
        claims.push({
          claimType: 'tool_reference',
          label: `Tool reference: ${tool}`,
          snippet: toolWindow.snippet,
          location: {
            startLine: toolWindow.startLine,
            endLine: toolWindow.endLine
          },
          confidence: 0.85,
          extractionMethod: 'token_pattern'
        });
      }
    }
  }
  
  return claims;
}

/**
 * Extract claims from code comments
 */
function extractCodeCommentClaims(docText: string, driftType: string): DocClaim[] {
  const claims: DocClaim[] = [];
  
  // Look for TODO, FIXME, NOTE comments
  const commentPatterns = [/\/\/\s*(TODO|FIXME|NOTE):/gi, /\/\*\s*(TODO|FIXME|NOTE):/gi];
  for (const pattern of commentPatterns) {
    const matches = docText.matchAll(pattern);
    for (const match of matches) {
      const commentBlock = extractBlockAroundPatterns(docText, match.index || 0, 3);
      if (commentBlock) {
        claims.push({
          claimType: 'instruction_block',
          label: `Code comment: ${match[1]}`,
          snippet: commentBlock.snippet,
          location: {
            startLine: commentBlock.startLine,
            endLine: commentBlock.endLine
          },
          confidence: 0.7,
          extractionMethod: 'code_comment'
        });
      }
    }
  }
  
  return claims;
}

/**
 * Extract claims from Notion pages
 */
function extractNotionClaims(docText: string, driftType: string): DocClaim[] {
  // Similar to Confluence but with Notion-specific patterns
  return extractConfluenceClaims(docText, driftType);
}

/**
 * Extract claims from GitBook
 */
function extractGitBookClaims(docText: string, driftType: string): DocClaim[] {
  // Similar to README but with GitBook-specific patterns
  return extractReadmeClaims(docText, driftType);
}

/**
 * Generic claim extraction for unknown doc systems
 */
function extractGenericClaims(docText: string, driftType: string): DocClaim[] {
  const claims: DocClaim[] = [];
  
  // Look for coverage gaps (empty sections, TODO markers)
  const gapPatterns = [/TODO/gi, /FIXME/gi, /\[TBD\]/gi, /\[TODO\]/gi];
  for (const pattern of gapPatterns) {
    const matches = docText.matchAll(pattern);
    for (const match of matches) {
      const gapBlock = extractBlockAroundPatterns(docText, match.index || 0, 2);
      if (gapBlock) {
        claims.push({
          claimType: 'coverage_gap',
          label: 'Coverage gap detected',
          snippet: gapBlock.snippet,
          location: {
            startLine: gapBlock.startLine,
            endLine: gapBlock.endLine
          },
          confidence: 0.6,
          extractionMethod: 'token_pattern'
        });
      }
    }
  }
  
  return claims;
}

// Helper functions for text extraction

function findTokenWindow(text: string, token: string, windowLines: number): { snippet: string; startLine: number; endLine: number } | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.toLowerCase().includes(token.toLowerCase())) {
      const start = Math.max(0, i - Math.floor(windowLines / 2));
      const end = Math.min(lines.length - 1, i + Math.floor(windowLines / 2));
      return {
        snippet: lines.slice(start, end + 1).join('\n'),
        startLine: start + 1,
        endLine: end + 1
      };
    }
  }
  return null;
}

function extractStepSkeleton(text: string, index: number): { snippet: string; startLine: number; endLine: number } | null {
  const lines = text.split('\n');
  const charIndex = index;
  let lineIndex = 0;
  let charCount = 0;
  
  // Find line containing the match
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && charCount + line.length >= charIndex) {
      lineIndex = i;
      break;
    }
    charCount += (line?.length || 0) + 1; // +1 for newline
  }
  
  // Extract 3 lines around the match
  const start = Math.max(0, lineIndex - 1);
  const end = Math.min(lines.length - 1, lineIndex + 1);
  
  return {
    snippet: lines.slice(start, end + 1).join('\n'),
    startLine: start + 1,
    endLine: end + 1
  };
}

function extractBlockAroundPatterns(text: string, index: number, windowLines: number): { snippet: string; startLine: number; endLine: number } | null {
  const lines = text.split('\n');
  let lineIndex = 0;
  let charCount = 0;
  
  // Find line containing the match
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && charCount + line.length >= index) {
      lineIndex = i;
      break;
    }
    charCount += (line?.length || 0) + 1;
  }
  
  const start = Math.max(0, lineIndex - Math.floor(windowLines / 2));
  const end = Math.min(lines.length - 1, lineIndex + Math.floor(windowLines / 2));
  
  return {
    snippet: lines.slice(start, end + 1).join('\n'),
    startLine: start + 1,
    endLine: end + 1
  };
}
