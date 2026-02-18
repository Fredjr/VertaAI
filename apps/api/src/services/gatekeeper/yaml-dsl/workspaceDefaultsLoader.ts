/**
 * Workspace Defaults Loader
 * Migration Plan v5.0 - Sprint 3
 * 
 * Loads workspace defaults from database
 */

import type { PrismaClient } from '@prisma/client';
import { parseWorkspaceDefaults, DEFAULT_WORKSPACE_DEFAULTS, type WorkspaceDefaults } from './workspaceDefaultsSchema.js';

/**
 * Load workspace defaults from database
 * Falls back to DEFAULT_WORKSPACE_DEFAULTS if not configured
 */
export async function loadWorkspaceDefaults(
  prisma: PrismaClient,
  workspaceId: string
): Promise<WorkspaceDefaults> {
  try {
    // Try to load from database
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { workspaceDefaultsYaml: true },
    });

    if (workspace?.workspaceDefaultsYaml) {
      return parseWorkspaceDefaults(workspace.workspaceDefaultsYaml);
    }

    console.log(`[WorkspaceDefaults] No defaults configured for workspace ${workspaceId}, using defaults`);
    return DEFAULT_WORKSPACE_DEFAULTS;
  } catch (error) {
    console.error(`[WorkspaceDefaults] Failed to load defaults for workspace ${workspaceId}:`, error);
    return DEFAULT_WORKSPACE_DEFAULTS;
  }
}

