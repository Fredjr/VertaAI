/**
 * VertaAI Governance MCP Server — Phase 4
 *
 * Exposes real-time AI capability governance state as an MCP resource:
 *   Resource URI: vertaai://governance/{workspaceId}
 *   Content-Type: text/markdown
 *
 * The resource is readable by any MCP-compatible client (Claude Code, Cursor, etc.)
 * Clients can subscribe to receive push notifications when drift state changes.
 *
 * SUBSCRIPTION MODEL:
 * - Each Claude Code / Cursor session creates one McpServer via createGovernanceMcpServer()
 * - The API registers the session (registerSession) so notifyDriftUpdated() can reach it
 * - After each non-petty drift cluster create/update, the API calls notifyDriftUpdated()
 * - Only sessions associated with the affected workspaceId receive the notification
 *
 * WORKSPACE ISOLATION:
 * - Sessions are registered with an optional workspaceId (passed via ?workspaceId= query param)
 * - notifyDriftUpdated() only broadcasts to sessions whose workspaceId matches
 * - Sessions with no associated workspaceId receive notifications for all workspaces
 *   (backwards-compatible for single-workspace deployments)
 * - The list callback only returns the session's workspace if one is set
 *
 * TOOL:
 * - get_governance_status(workspaceId) — convenience tool; developer can ask "is it safe to ship?"
 *
 * USAGE (in apps/api/src/index.ts):
 * ```typescript
 * const workspaceId = req.query.workspaceId as string | undefined;
 * const server = createGovernanceMcpServer({ readGovernanceMarkdown, listWorkspaces, workspaceId });
 * registerSession(transport.sessionId!, server, workspaceId);
 * transport.onclose = () => unregisterSession(transport.sessionId!);
 * await server.connect(transport);
 * ```
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result returned by the checkCapabilityIntent callback. */
export interface CapabilityIntentCheckResult {
  /** True only if all requested capabilities are declared and no critical drifts exist. */
  allowed: boolean;
  /** Requested capabilities that are NOT in the current IntentArtifact declaration. */
  undeclaredRequested: Array<{ type: string; target: string; reason: string }>;
  /** Active (pending) drift clusters for this service at time of check. */
  activeDrifts: Array<{
    id: string;
    severity: string;
    materialityTier: string;
    driftCount: number;
    createdAt: string;
  }>;
  /** Capabilities declared in the latest IntentArtifact for this service. */
  declaredCapabilities: Array<{ type: string; target: string }>;
  service: string;
  /** Current session file budget — null if no active session. */
  sessionBudget?: {
    filesUsed: number;
    filesMax: number;
    warningAt: number;
    atWarning: boolean;
    atLimit: boolean;
  } | null;
}

export interface GovernanceMcpOpts {
  /**
   * Fetch the compact governance markdown for a workspace.
   * Provided by apps/api — mirrors the HTTP endpoint logic (Prisma queries + buildCompactSummary).
   */
  readGovernanceMarkdown: (workspaceId: string) => Promise<string>;
  /**
   * List workspaces visible to this session.
   * If the session has a fixed workspaceId, this should return only that workspace.
   */
  listWorkspaces: () => Promise<Array<{ id: string; name: string }>>;
  /**
   * Pre-flight capability check: given capabilities a developer intends to use,
   * verify they are declared and no blocking drifts exist.
   * Optional — tool is omitted from the server if not provided.
   */
  checkCapabilityIntent?: (
    workspaceId: string,
    service: string,
    capabilities: Array<{ type: string; target?: string }>,
  ) => Promise<CapabilityIntentCheckResult>;
  /**
   * Declare a new vibe coding session intent at the start of a session.
   * Stores the developer's natural language prompt and session context so
   * Track 0 and Track 1 have live intent during the agent coding session.
   * Optional — tool is omitted from the server if not provided.
   */
  declareSessionIntent?: (
    workspaceId: string,
    sessionId: string,
    rawPrompt: string,
    service?: string,
    ticketRef?: string,
    scopeHint?: string,
  ) => Promise<{
    sessionIntentId: string;
    policy: Record<string, unknown>;
    structuralContext?: {
      existingAbstractions: Array<{ file: string; capability: string }>;
      activeTechnicalDebt: Array<{ prNumber: number; score: number; authorType: string }>;
      duplicateAbstractionFrequency: number;
      missingTestFrequency: number;
    };
  }>;
  /**
   * Optional workspace this session is scoped to.
   * If set, notifications are filtered and the resource list is scoped to this workspace.
   */
  workspaceId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session registry
// ─────────────────────────────────────────────────────────────────────────────

interface SessionEntry {
  server: McpServer;
  /** Workspace this session is scoped to, if known. Undefined = broadcast all. */
  workspaceId?: string;
}

/**
 * Active session registry: sessionId → { server, workspaceId }.
 * One entry per live Streamable HTTP session.
 * Sessions are added by registerSession() and removed by unregisterSession().
 */
const _activeSessions = new Map<string, SessionEntry>();

/** Register an active MCP session so drift notifications can reach it. */
export function registerSession(sessionId: string, server: McpServer, workspaceId?: string): void {
  _activeSessions.set(sessionId, { server, workspaceId });
}

/** Remove a session from the registry (call from transport.onclose). */
export function unregisterSession(sessionId: string): void {
  _activeSessions.delete(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift notification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Push notifications/resources/updated to relevant active sessions for the given workspace.
 * Only notifies sessions that are:
 *   - Scoped to this exact workspaceId, OR
 *   - Not scoped to any workspace (backwards-compatible single-workspace deployments)
 *
 * Synchronous + fire-and-forget: errors are silently suppressed so the drift
 * detection pipeline is never blocked by a disconnected MCP session.
 */
export function notifyDriftUpdated(workspaceId: string): void {
  const uri = `vertaai://governance/${workspaceId}`;
  for (const [, session] of _activeSessions) {
    // Workspace isolation: skip sessions scoped to a *different* workspace
    if (session.workspaceId && session.workspaceId !== workspaceId) continue;

    session.server.server.sendResourceUpdated({ uri }).catch(() => {
      // Client may have disconnected between the drift event and this notification.
      // Suppress — the session will unregister via transport.onclose.
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a configured McpServer for one Streamable HTTP session.
 * Each session gets its own McpServer instance (required for per-session subscriptions).
 *
 * @param opts  Callback functions that bridge MCP into the API's service layer.
 * @returns     A ready-to-connect McpServer (call server.connect(transport) after registerSession).
 */
export function createGovernanceMcpServer(opts: GovernanceMcpOpts): McpServer {
  const mcpServer = new McpServer({
    name: 'vertaai-governance',
    version: '1.0.0',
  });

  // ── Resource: vertaai://governance/{workspaceId} ─────────────────────────
  mcpServer.registerResource(
    'governance',
    new ResourceTemplate('vertaai://governance/{workspaceId}', {
      list: async () => {
        // Return only the workspaces this session is authorized to see.
        // If the session has a fixed workspaceId, listWorkspaces() is already scoped
        // (the caller in apps/api/src/index.ts filters by the session workspace).
        const workspaces = await opts.listWorkspaces();
        return {
          resources: workspaces.map(ws => ({
            uri: `vertaai://governance/${ws.id}`,
            name: `${ws.name} — Governance`,
            mimeType: 'text/markdown',
            description: 'Real-time AI capability drift alerts. Read before shipping.',
          })),
        };
      },
    }),
    {
      title: 'VertaAI Governance Snapshot',
      description: 'Active runtime capability drift alerts for a workspace. Updated after each drift detection event.',
      mimeType: 'text/markdown',
    },
    async (uri, { workspaceId }) => {
      const wsId = String(workspaceId);
      // If session is scoped to a specific workspace, enforce it
      if (opts.workspaceId && opts.workspaceId !== wsId) {
        return {
          contents: [{
            uri: uri.href,
            text: `# Access denied\n\nThis session is scoped to workspace \`${opts.workspaceId}\`.`,
            mimeType: 'text/markdown',
          }],
        };
      }
      return {
        contents: [{
          uri: uri.href,
          text: await opts.readGovernanceMarkdown(wsId),
          mimeType: 'text/markdown',
        }],
      };
    },
  );

  // ── Tool: get_governance_status ─────────────────────────────────────────
  // Convenience tool so a developer can ask "is it safe to ship?" and get
  // the full governance snapshot without knowing the URI pattern.
  mcpServer.registerTool(
    'get_governance_status',
    {
      description:
        'Get real-time AI capability drift alerts for a VertaAI workspace. ' +
        'Returns a markdown governance snapshot: critical alerts, operational issues, ' +
        'compliant services, and suppressed petty signals. ' +
        'Call this before shipping to check if any services have undeclared runtime behaviors.',
      inputSchema: {
        workspaceId: z.string().optional().describe(
          'The VertaAI workspace ID to check governance status for. ' +
          'Defaults to the workspace this session was initialized for.',
        ),
      },
    },
    async ({ workspaceId }) => {
      // Use the session-scoped workspace as default if caller doesn't specify
      const wsId = workspaceId ?? opts.workspaceId;
      if (!wsId) {
        return {
          content: [{
            type: 'text' as const,
            text: '# Error\n\nNo workspace ID provided and this session has no default workspace. ' +
              'Pass a `workspaceId` argument or initialize the session with `?workspaceId=<id>`.',
          }],
        };
      }
      // Enforce workspace isolation
      if (opts.workspaceId && opts.workspaceId !== wsId) {
        return {
          content: [{
            type: 'text' as const,
            text: `# Access denied\n\nThis session is scoped to workspace \`${opts.workspaceId}\`.`,
          }],
        };
      }
      return {
        content: [{
          type: 'text' as const,
          text: await opts.readGovernanceMarkdown(wsId),
        }],
      };
    },
  );

  // ── Tool: check_capability_intent ────────────────────────────────────────
  // Pre-flight governance check. Developer tells the AI which capabilities they
  // intend to use; the tool verifies they are declared and no blocking drifts exist.
  // Enables Track 0: prompt-time governance before code is written.
  if (opts.checkCapabilityIntent) {
    mcpServer.registerTool(
      'check_capability_intent',
      {
        description:
          'Pre-flight governance check: before writing code that uses a capability (e.g. s3_write, ' +
          'iam_modify, db_write), verify it is declared in the current IntentArtifact and no blocking ' +
          'drift clusters exist. Returns allowed/blocked status, any undeclared capabilities, and ' +
          'active drift alerts. Call this before implementing any new infrastructure access.',
        inputSchema: {
          service: z.string().describe('The service name to check (e.g. "user-service", "payment-api").'),
          capabilities: z.array(z.object({
            type: z.string().describe(
              'Capability type: db_read|db_write|db_admin|s3_read|s3_write|s3_delete|' +
              'api_endpoint|iam_modify|infra_create|infra_modify|infra_delete|' +
              'secret_read|secret_write|network_public|network_private|cost_increase|' +
              'schema_modify|deployment_modify',
            ),
            target: z.string().optional().describe('Specific resource (e.g. "users_table", "s3://my-bucket/*"). Defaults to "*".'),
          })).describe('The capabilities you intend to use.'),
          workspaceId: z.string().optional().describe('Workspace ID. Defaults to the session workspace.'),
        },
      },
      async ({ service, capabilities, workspaceId }) => {
        const wsId = workspaceId ?? opts.workspaceId;
        if (!wsId) {
          return {
            content: [{
              type: 'text' as const,
              text: '# Error\n\nNo workspace ID. Pass `workspaceId` or initialize the session with `?workspaceId=<id>`.',
            }],
          };
        }
        if (opts.workspaceId && opts.workspaceId !== wsId) {
          return {
            content: [{
              type: 'text' as const,
              text: `# Access denied\n\nThis session is scoped to workspace \`${opts.workspaceId}\`.`,
            }],
          };
        }

        const result = await opts.checkCapabilityIntent!(wsId, service, capabilities);

        const lines: string[] = [];
        const statusIcon = result.allowed ? '✅' : '🚫';
        lines.push(`# ${statusIcon} Capability Pre-Flight: \`${service}\``);
        lines.push('');

        if (result.allowed) {
          lines.push('**All requested capabilities are declared and no blocking drifts exist. Safe to proceed.**');
        } else {
          lines.push('**One or more capabilities require governance action before proceeding.**');
        }
        lines.push('');

        if (result.undeclaredRequested.length > 0) {
          lines.push('## ⚠ Undeclared capabilities');
          lines.push('These capabilities are NOT in the current IntentArtifact. Add them to the spec before shipping:');
          for (const u of result.undeclaredRequested) {
            lines.push(`- \`${u.type}:${u.target}\` — ${u.reason}`);
          }
          lines.push('');
        }

        if (result.activeDrifts.length > 0) {
          lines.push('## 🔴 Active drift alerts');
          for (const d of result.activeDrifts) {
            lines.push(`- Cluster \`${d.id.slice(0, 8)}\` — severity: **${d.severity}**, materiality: ${d.materialityTier}, ${d.driftCount} drift(s) since ${d.createdAt.slice(0, 10)}`);
          }
          lines.push('');
        }

        if (result.declaredCapabilities.length > 0) {
          lines.push('## ✅ Currently declared capabilities');
          for (const c of result.declaredCapabilities) {
            lines.push(`- \`${c.type}:${c.target}\``);
          }
        } else {
          lines.push('## ℹ No capabilities declared yet');
          lines.push('No IntentArtifact found for this service. All capabilities are undeclared by default.');
        }

        // Session budget warning — surface spaghetti risk inline
        if (result.sessionBudget) {
          const b = result.sessionBudget;
          lines.push('');
          if (b.atLimit) {
            lines.push(`## 🚫 Session budget EXCEEDED: ${b.filesUsed}/${b.filesMax} files modified`);
            lines.push('Stop and scope this PR before making further changes. This session has exceeded the file-change budget.');
          } else if (b.atWarning) {
            lines.push(`## ⚠️ Session budget warning: ${b.filesUsed}/${b.filesMax} files modified (${Math.round(b.filesUsed / b.filesMax * 100)}%)`);
            lines.push('Consider scoping this PR. You are approaching the session file-change limit.');
          } else {
            lines.push(`*Session: ${b.filesUsed}/${b.filesMax} files modified this session.*`);
          }
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      },
    );
  }

  // ── Tool: declare_session_intent ─────────────────────────────────────────
  // Called at the START of a vibe coding session (before the agent writes code).
  // Stores the developer's natural language prompt so Track 0 and Track 1 have
  // live intent context throughout the session — not just when the PR opens.
  // The tool returns the effective policy envelope so the agent knows its budget.
  if (opts.declareSessionIntent) {
    mcpServer.registerTool(
      'declare_session_intent',
      {
        description:
          'Declare the intent of this coding session at session start. Call this FIRST — before writing ' +
          'any code — with the developer\'s natural language prompt and any known context. ' +
          'This enables real-time in-editor governance feedback (Track 1) aligned to your actual intent. ' +
          'Returns the active permission envelope and session budgets so you know your boundaries.',
        inputSchema: {
          sessionId: z.string().describe(
            'A unique identifier for this coding session. Use a UUID or a short descriptive string. ' +
            'Must be stable across reconnects for the same session (e.g., store in workspace state).',
          ),
          rawPrompt: z.string().describe(
            'The developer\'s natural language prompt or task description for this session. ' +
            'E.g., "Add S3 upload to the user profile service" or "Refactor the auth module to use JWT".',
          ),
          service: z.string().optional().describe('Primary service name this session targets (e.g. "user-service").'),
          ticketRef: z.string().optional().describe('Ticket reference (e.g. "JIRA-123", "GH-456").'),
          scopeHint: z.string().optional().describe('Short scope description (e.g. "auth refactor", "add S3 upload").'),
          workspaceId: z.string().optional().describe('Workspace ID. Defaults to the session workspace.'),
        },
      },
      async ({ sessionId, rawPrompt, service, ticketRef, scopeHint, workspaceId }) => {
        const wsId = workspaceId ?? opts.workspaceId;
        if (!wsId) {
          return {
            content: [{
              type: 'text' as const,
              text: '# Error\n\nNo workspace ID. Pass `workspaceId` or initialize the session with `?workspaceId=<id>`.',
            }],
          };
        }
        if (opts.workspaceId && opts.workspaceId !== wsId) {
          return {
            content: [{
              type: 'text' as const,
              text: `# Access denied\n\nThis session is scoped to workspace \`${opts.workspaceId}\`.`,
            }],
          };
        }

        const result = await opts.declareSessionIntent!(wsId, sessionId, rawPrompt, service, ticketRef, scopeHint);

        const policy = result.policy as {
          maxFilesChanged?: number;
          maxNewAbstractions?: number;
          blockedCapabilities?: string[];
          requireDeclaration?: string[];
          warningThresholdPercent?: number;
        };

        const ctx = result.structuralContext;

        const lines: string[] = [
          '# ✅ Session Intent Declared',
          '',
          `**Session ID**: \`${sessionId}\``,
          `**Workspace**: \`${wsId}\``,
          rawPrompt ? `**Intent**: "${rawPrompt}"` : '',
          service ? `**Service**: \`${service}\`` : '',
          ticketRef ? `**Ticket**: ${ticketRef}` : '',
          '',
          '## Active Session Policy',
          `- Max files changed: **${policy.maxFilesChanged ?? 20}** (warning at ${policy.warningThresholdPercent ?? 80}%)`,
          `- Max new abstractions: **${policy.maxNewAbstractions ?? 3}**`,
          `- 🚫 BLOCKED capabilities: ${(policy.blockedCapabilities ?? []).join(', ') || 'none'}`,
          `- ⚠️ REQUIRES DECLARATION: ${(policy.requireDeclaration ?? []).join(', ') || 'none'}`,
        ];

        // Structural context — prevents duplicate abstractions before the agent writes a line
        if (ctx && (ctx.existingAbstractions.length > 0 || ctx.duplicateAbstractionFrequency > 0)) {
          lines.push('', '## Existing Abstractions (check before creating new utilities)');
          for (const a of ctx.existingAbstractions.slice(0, 10)) {
            lines.push(`- \`${a.file}\` — ${a.capability}`);
          }
          if (ctx.existingAbstractions.length > 10) {
            lines.push(`- …and ${ctx.existingAbstractions.length - 10} more`);
          }
          if (ctx.duplicateAbstractionFrequency > 0) {
            lines.push('', `> ⚠️ ${ctx.duplicateAbstractionFrequency} of the last 10 PRs introduced duplicate abstractions — check the list above before creating new utility functions.`);
          }
          if (ctx.missingTestFrequency > 0) {
            lines.push(`> ⚠️ ${ctx.missingTestFrequency} of the last 10 PRs were missing tests — add tests before committing.`);
          }
          if (ctx.activeTechnicalDebt.length > 0) {
            lines.push('', '## Active Technical Debt');
            for (const d of ctx.activeTechnicalDebt.slice(0, 5)) {
              lines.push(`- PR #${d.prNumber} (${d.authorType}): quality score ${d.score}/100`);
            }
          }
        }

        lines.push(
          '',
          'Track 1 real-time in-editor alerts are now active for this session. ',
          'Track 0 governance rules are loaded. Call `check_capability_intent` before using any listed capabilities.',
        );

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      },
    );
  }

  return mcpServer;
}
