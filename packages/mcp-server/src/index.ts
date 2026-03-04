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

  return mcpServer;
}
