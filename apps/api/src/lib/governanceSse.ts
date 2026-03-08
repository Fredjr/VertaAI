/**
 * Governance SSE Client Registry
 *
 * Manages Server-Sent Events connections from VSCode extensions and other
 * lightweight clients that want real-time governance alerts without setting
 * up a full MCP session.
 *
 * USAGE:
 *   - apps/api/src/index.ts: registers the GET /api/governance/events/:workspaceId endpoint
 *   - runtimeDriftMonitor.ts: calls notifyGovernanceSse(workspaceId) after each non-petty drift event
 *   - VSCode extension: connects via Node.js http.request() streaming
 *
 * EVENTS emitted (SSE format):
 *   event: connected     — on connection establish
 *   event: drift_updated — on new/updated drift cluster
 *   :ping               — heartbeat every 25s (keep-alive)
 */

import type { Response } from 'express';

/** Active SSE response streams per workspaceId. */
const clients = new Map<string, Set<Response>>();

/** Register an SSE client for a workspace. Called from the express route handler. */
export function registerSseClient(workspaceId: string, res: Response): void {
  if (!clients.has(workspaceId)) clients.set(workspaceId, new Set());
  clients.get(workspaceId)!.add(res);
}

/** Deregister an SSE client (call on request close). */
export function unregisterSseClient(workspaceId: string, res: Response): void {
  clients.get(workspaceId)?.delete(res);
}

/**
 * Push a drift_updated event to all SSE clients for the given workspace.
 * Fire-and-forget: failed writes (disconnected clients) are silently dropped.
 * Called from runtimeDriftMonitor alongside notifyDriftUpdated (MCP push).
 */
export function notifyGovernanceSse(workspaceId: string): void {
  const ws = clients.get(workspaceId);
  if (!ws || ws.size === 0) return;

  const payload = `event: drift_updated\ndata: ${JSON.stringify({
    workspaceId,
    updatedAt: new Date().toISOString(),
  })}\n\n`;

  for (const res of ws) {
    try {
      res.write(payload);
    } catch {
      // Client disconnected — will be cleaned up by req.on('close')
      ws.delete(res);
    }
  }
}

/**
 * Push a coding_drift event to all SSE clients for the given workspace.
 * Fired when the scan-report endpoint detects that the local scanner found
 * capabilities that are NOT declared in any recent IntentArtifact for the workspace.
 * This is distinct from drift_updated (which signals Track B runtime drift).
 *
 * The extension receives this event and shows inline squiggles at the exact
 * file + line where the undeclared capability was detected — before any PR is opened.
 */
export function notifyCodingDrift(
  workspaceId: string,
  payload: {
    sessionId: string;
    undeclared: Array<{ type: string; target?: string; file: string; line: number }>;
    sessionBudget: { filesUsed: number; filesWarning: number; filesMax: number };
  },
): void {
  const ws = clients.get(workspaceId);
  if (!ws || ws.size === 0) return;

  const data = `event: coding_drift\ndata: ${JSON.stringify({
    workspaceId,
    detectedAt: new Date().toISOString(),
    ...payload,
  })}\n\n`;

  for (const res of ws) {
    try {
      res.write(data);
    } catch {
      ws.delete(res);
    }
  }
}

/** Number of active SSE clients across all workspaces (for health endpoints). */
export function activeSseClientCount(): number {
  let count = 0;
  for (const set of clients.values()) count += set.size;
  return count;
}
