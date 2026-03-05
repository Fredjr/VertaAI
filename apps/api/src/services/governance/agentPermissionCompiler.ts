/**
 * Agent Permission Compiler
 *
 * Compiles a permission envelope for AI coding sessions from:
 * 1. CRITICAL_CAPABILITIES / HIGH_CAPABILITIES baseline (severityConstants.ts)
 * 2. Active policy pack overrides (agentPolicy section in published YAML)
 *
 * The envelope is injected into CLAUDE.md / copilot-instructions.md at setup wizard time
 * so every AI assistant receives its permission boundaries on the very first message.
 *
 * Cache: 60-second TTL per workspace to avoid hammering the DB.
 */

import { CRITICAL_CAPABILITIES, HIGH_CAPABILITIES } from '../runtime/severityConstants.js';
import { prisma } from '../../lib/db.js';
import type { CapabilityType } from '../../types/agentGovernance.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentPermissionEnvelope {
  /** Capabilities that AI agents must NEVER use — blocked at session start */
  blocked: CapabilityType[];
  /** Capabilities that are allowed but MUST be declared in IntentArtifact before use */
  requireDeclaration: CapabilityType[];
  /** Capabilities that are always allowed without declaration */
  alwaysAllowed: CapabilityType[];
  /** Capabilities that require a human approval step before use */
  requireHumanApproval: CapabilityType[];
  /** Session-level budgets and constraints */
  sessionBudgets: {
    maxFilesChanged: number;
    maxNewAbstractions: number;
    requireTestFor: CapabilityType[];
  };
  /** Policy pack names that contributed to this envelope (for auditability) */
  compiledFromPacks: string[];
  /** ISO timestamp when this envelope was compiled */
  compiledAt: string;
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  envelope: AgentPermissionEnvelope;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds

// ============================================================================
// Compiler
// ============================================================================

/**
 * Compile the agent permission envelope for a workspace.
 * Results are cached for 60 seconds per workspace.
 */
export async function compileAgentPermissions(workspaceId: string): Promise<AgentPermissionEnvelope> {
  const cached = cache.get(workspaceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.envelope;
  }

  // Fetch active Track A packs for this workspace
  // trackAConfig (JSON) is the formal config object; trackAConfigYamlPublished is the raw YAML
  const packs = await prisma.workspacePolicyPack.findMany({
    where: {
      workspaceId,
      status: 'ACTIVE',
      trackAEnabled: true,
    },
    select: {
      name: true,
      trackAConfig: true,
      trackAConfigYamlPublished: true,
    },
  });

  // Start from the security baseline derived from severityConstants
  const blocked: CapabilityType[]            = [...CRITICAL_CAPABILITIES];
  const requireDeclaration: CapabilityType[] = [...HIGH_CAPABILITIES];
  const alwaysAllowed: CapabilityType[]      = ['db_read', 's3_read', 'api_endpoint'];
  const requireHumanApproval: CapabilityType[] = ['iam_modify', 'secret_write'];

  // Session budget overrides: start from defaults; most restrictive pack wins
  let maxFilesChanged = 20;
  let maxNewAbstractions = 3;

  // Apply pack-level overrides from the formal agentPolicy schema field (set via UI),
  // falling back to YAML comment annotations for backward compat with hand-edited packs:
  //   # agentPolicy:
  //   #   additionalBlocked: [deployment_modify]
  //   #   requireApproval: [schema_modify]
  for (const pack of packs) {
    const yaml = pack.trackAConfigYamlPublished ?? '';

    // Prefer formal agentPolicy from trackAConfig (written by the Agent Policy UI tab)
    const formalPolicy = (pack.trackAConfig as any)?.agentPolicy as {
      additionalBlocked?: string[];
      requireApproval?: string[];
      sessionBudgets?: { maxFilesChanged?: number; maxNewAbstractions?: number };
    } | undefined;

    const additionalBlocked: string[] = formalPolicy?.additionalBlocked
      ?? extractYamlListComment(yaml, 'additionalBlocked');
    for (const c of additionalBlocked) {
      if (!blocked.includes(c as CapabilityType)) {
        blocked.push(c as CapabilityType);
      }
    }

    const requireApproval: string[] = formalPolicy?.requireApproval
      ?? extractYamlListComment(yaml, 'requireApproval');
    for (const c of requireApproval) {
      if (!requireHumanApproval.includes(c as CapabilityType)) {
        requireHumanApproval.push(c as CapabilityType);
      }
    }

    // Session budgets: most restrictive pack wins (lower value = more restrictive)
    const packMaxFiles = formalPolicy?.sessionBudgets?.maxFilesChanged;
    if (packMaxFiles != null && packMaxFiles < maxFilesChanged) maxFilesChanged = packMaxFiles;

    const packMaxAbstractions = formalPolicy?.sessionBudgets?.maxNewAbstractions;
    if (packMaxAbstractions != null && packMaxAbstractions < maxNewAbstractions) maxNewAbstractions = packMaxAbstractions;
  }

  const envelope: AgentPermissionEnvelope = {
    blocked,
    requireDeclaration,
    alwaysAllowed,
    requireHumanApproval,
    sessionBudgets: {
      maxFilesChanged,
      maxNewAbstractions,
      requireTestFor: ['db_write', 's3_write', 'schema_modify'],
    },
    compiledFromPacks: packs.map(p => p.name),
    compiledAt: new Date().toISOString(),
  };

  cache.set(workspaceId, { envelope, ts: Date.now() });
  return envelope;
}

/**
 * Format the permission envelope as a CLAUDE.md / copilot-instructions.md section.
 */
export function formatPermissionEnvelopeAsMarkdown(envelope: AgentPermissionEnvelope): string {
  const lines: string[] = [
    '',
    '## Agent Permission Envelope',
    `> Compiled ${new Date(envelope.compiledAt).toUTCString()}${envelope.compiledFromPacks.length ? ` from packs: ${envelope.compiledFromPacks.join(', ')}` : ' (baseline)'}`,
    '',
    `🚫 **BLOCKED** (never use): ${envelope.blocked.join(', ')}`,
    `⚠️ **REQUIRES DECLARATION**: ${envelope.requireDeclaration.join(', ')}`,
    `✅ **ALWAYS ALLOWED**: ${envelope.alwaysAllowed.join(', ')}`,
    `👤 **REQUIRES HUMAN APPROVAL**: ${envelope.requireHumanApproval.join(', ')}`,
    '',
    '## Session Budgets',
    `- Max files changed per session: ${envelope.sessionBudgets.maxFilesChanged}`,
    `- Max new abstractions per session: ${envelope.sessionBudgets.maxNewAbstractions}`,
    `- Tests required before committing: ${envelope.sessionBudgets.requireTestFor.join(', ')}`,
  ];
  return lines.join('\n');
}

/**
 * Invalidate the cached permission envelope for a workspace (call after pack changes).
 */
export function invalidatePermissionCache(workspaceId?: string): void {
  if (workspaceId) {
    cache.delete(workspaceId);
  } else {
    cache.clear();
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract a YAML comment list value like `# key: [val1, val2]` from pack YAML.
 * This allows packs to annotate agentPolicy without changing the YAML schema.
 */
function extractYamlListComment(yaml: string, key: string): string[] {
  const regex = new RegExp(`#\\s*${key}:\\s*\\[([^\\]]+)\\]`);
  const match = yaml.match(regex);
  if (!match) return [];
  return match[1].split(',').map(s => s.trim()).filter(Boolean);
}
