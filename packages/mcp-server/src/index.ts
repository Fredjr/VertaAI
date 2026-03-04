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
 * - All subscribed sessions receive notifications/resources/updated → LLM re-reads the resource
 *
 * TOOL:
 * - get_governance_status(workspaceId) — convenience tool; developer can ask "is it safe to ship?"
 *
 * USAGE (in apps/api/src/index.ts):
 * ```typescript
 * const server = createGovernanceMcpServer({ readGovernanceMarkdown, listWorkspaces });
 * registerSession(transport.sessionId!, server);
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
   * List all workspaces. Used to populate resources/list so clients can discover available workspaces.
   */
  listWorkspaces: () => Promise<Array<{ id: string; name: string }>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Active session registry: sessionId → McpServer.
 * One entry per live Streamable HTTP session.
 * Sessions are added by registerSession() and removed by unregisterSession().
 */
const _activeSessions = new Map<string, McpServer>();

/** Register an active MCP session so drift notifications can reach it. */
export function registerSession(sessionId: string, server: McpServer): void {
  _activeSessions.set(sessionId, server);
}

/** Remove a session from the registry (call from transport.onclose). */
export function unregisterSession(sessionId: string): void {
  _activeSessions.delete(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift notification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Push notifications/resources/updated to all active sessions for the given workspace.
 * Call this from runtimeDriftMonitor after each non-petty cluster create/update.
 *
 * Synchronous + fire-and-forget: errors are silently suppressed so the drift
 * detection pipeline is never blocked by a disconnected MCP session.
 */
export function notifyDriftUpdated(workspaceId: string): void {
  const uri = `vertaai://governance/${workspaceId}`;
  for (const [, server] of _activeSessions) {
    server.server.sendResourceUpdated({ uri }).catch(() => {
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
    async (uri, { workspaceId }) => ({
      contents: [{
        uri: uri.href,
        text: await opts.readGovernanceMarkdown(String(workspaceId)),
        mimeType: 'text/markdown',
      }],
    }),
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
        workspaceId: z.string().describe('The VertaAI workspace ID to check governance status for.'),
      },
    },
    async ({ workspaceId }) => ({
      content: [{
        type: 'text' as const,
        text: await opts.readGovernanceMarkdown(workspaceId),
      }],
    }),
  );

  return mcpServer;
}
