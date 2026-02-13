/**
 * Workspace Settings API Routes
 * 
 * Phase 5 - Advanced workflow configuration for power users
 * Provides endpoints for:
 * - Workflow preferences (drift types, input sources, output targets)
 * - Ownership source ranking
 * - Confidence thresholds
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 5
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';
import { isFeatureEnabled } from '../config/featureFlags.js';

const router: RouterType = Router();

// Default workflow preferences
const DEFAULT_DRIFT_TYPES = ['instruction', 'process', 'ownership', 'coverage', 'environment_tooling'];
const DEFAULT_INPUT_SOURCES = ['github_pr', 'pagerduty_incident', 'slack_cluster', 'datadog_alert', 'github_iac'];
const DEFAULT_OUTPUT_TARGETS = ['confluence', 'notion', 'github_readme', 'github_swagger', 'backstage', 'github_code_comments', 'gitbook'];

// Type definitions for workflow preferences
// These are user-facing workspace settings that map onto internal
// feature flags and routing behavior. Keep names product-language,
// not implementation-detail flag names.
interface WorkflowPreferences {
	  enabledDriftTypes: string[];
	  enabledInputSources: string[];
	  enabledOutputTargets: string[];
	  outputTargetPriority: string[];

	  // UX toggles for advanced behavior – backed by internal flags
	  // Evidence-grounded patching: wired to ENABLE_TYPED_DELTAS + ENABLE_EVIDENCE_TO_LLM
	  evidenceGroundedPatching: boolean;
	  // Skip low-value patches: wired to ENABLE_MATERIALITY_GATE
	  skipLowValuePatches: boolean;
	  // Expanded context mode (slower, more accurate): wired to ENABLE_CONTEXT_EXPANSION
	  expandedContextMode: boolean;
	  // Track cumulative drift over time: wired to ENABLE_TEMPORAL_ACCUMULATION
	  trackCumulativeDrift: boolean;

	  // PHASE 3: Materiality threshold (0-1 scale, default 0.3)
	  // Lower = more patches, Higher = fewer patches
	  materialityThreshold: number;
	}

/**
 * GET /api/workspaces/:workspaceId/settings
 * Returns the workspace settings including workflow preferences
 */
router.get('/:workspaceId/settings', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  // Check feature flag
  if (!isFeatureEnabled('ENABLE_WORKFLOW_SETTINGS', workspaceId)) {
    return res.status(403).json({ 
      error: 'Settings feature not enabled for this workspace',
      code: 'FEATURE_DISABLED',
    });
  }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        workflowPreferences: true,
        ownershipSourceRanking: true,
        highConfidenceThreshold: true,
        mediumConfidenceThreshold: true,
        primaryDocRequired: true,
        allowPrLinkOverride: true,
        digestChannel: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

	    // Parse workflow preferences with defaults
	    const storedPrefs = (workspace.workflowPreferences || {}) as Partial<WorkflowPreferences>;
	    const workflowPreferences: WorkflowPreferences = {
	      enabledDriftTypes: storedPrefs.enabledDriftTypes || DEFAULT_DRIFT_TYPES,
	      enabledInputSources: storedPrefs.enabledInputSources || DEFAULT_INPUT_SOURCES,
	      enabledOutputTargets: storedPrefs.enabledOutputTargets || DEFAULT_OUTPUT_TARGETS,
	      outputTargetPriority: storedPrefs.outputTargetPriority || DEFAULT_OUTPUT_TARGETS,

	      // UX toggles: default to conservative behavior (off) unless explicitly enabled
	      evidenceGroundedPatching: storedPrefs.evidenceGroundedPatching ?? false,
	      skipLowValuePatches: storedPrefs.skipLowValuePatches ?? false,
	      expandedContextMode: storedPrefs.expandedContextMode ?? false,
	      trackCumulativeDrift: storedPrefs.trackCumulativeDrift ?? false,

	      // PHASE 3: Materiality threshold (default 0.3 = skip patches with score < 0.3)
	      materialityThreshold: storedPrefs.materialityThreshold ?? 0.3,
	    };

    return res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      workflowPreferences,
      ownershipSourceRanking: workspace.ownershipSourceRanking,
      confidenceThresholds: {
        high: workspace.highConfidenceThreshold,
        medium: workspace.mediumConfidenceThreshold,
      },
      docResolution: {
        primaryDocRequired: workspace.primaryDocRequired,
        allowPrLinkOverride: workspace.allowPrLinkOverride,
      },
      notifications: {
        digestChannel: workspace.digestChannel,
      },
      // Available options for UI dropdowns
      availableOptions: {
        driftTypes: DEFAULT_DRIFT_TYPES,
        inputSources: DEFAULT_INPUT_SOURCES,
        outputTargets: DEFAULT_OUTPUT_TARGETS,
      },
    });
  } catch (error: any) {
    console.error('[Settings] Error fetching settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch settings' });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId/settings
 * Updates workspace settings
 */
router.patch('/:workspaceId/settings', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  // Check feature flag
  if (!isFeatureEnabled('ENABLE_WORKFLOW_SETTINGS', workspaceId)) {
    return res.status(403).json({ 
      error: 'Settings feature not enabled for this workspace',
      code: 'FEATURE_DISABLED',
    });
  }

  try {
    const { 
      workflowPreferences, 
      ownershipSourceRanking, 
      confidenceThresholds,
      docResolution,
      notifications,
    } = req.body;

    // Build update object
    const updateData: Record<string, any> = {};

    if (workflowPreferences) {
      // Validate drift types
      if (workflowPreferences.enabledDriftTypes) {
        const validDriftTypes = workflowPreferences.enabledDriftTypes.filter(
          (t: string) => DEFAULT_DRIFT_TYPES.includes(t)
        );
        workflowPreferences.enabledDriftTypes = validDriftTypes;
      }
      updateData.workflowPreferences = workflowPreferences;
    }

    if (ownershipSourceRanking && Array.isArray(ownershipSourceRanking)) {
      updateData.ownershipSourceRanking = ownershipSourceRanking;
    }

    if (confidenceThresholds) {
      if (typeof confidenceThresholds.high === 'number') {
        updateData.highConfidenceThreshold = Math.max(0, Math.min(1, confidenceThresholds.high));
      }
      if (typeof confidenceThresholds.medium === 'number') {
        updateData.mediumConfidenceThreshold = Math.max(0, Math.min(1, confidenceThresholds.medium));
      }
    }

    if (docResolution) {
      if (typeof docResolution.primaryDocRequired === 'boolean') {
        updateData.primaryDocRequired = docResolution.primaryDocRequired;
      }
      if (typeof docResolution.allowPrLinkOverride === 'boolean') {
        updateData.allowPrLinkOverride = docResolution.allowPrLinkOverride;
      }
    }

    if (notifications) {
      if (notifications.digestChannel !== undefined) {
        updateData.digestChannel = notifications.digestChannel || null;
      }
    }

    // Update workspace
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
      select: {
        id: true,
        name: true,
        workflowPreferences: true,
        ownershipSourceRanking: true,
        highConfidenceThreshold: true,
        mediumConfidenceThreshold: true,
      },
    });

    console.log(`[Settings] Updated settings for workspace ${workspaceId}:`, Object.keys(updateData));

    return res.json({
      success: true,
      workspace,
      updated: Object.keys(updateData),
    });
  } catch (error: any) {
    console.error('[Settings] Error updating settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to update settings' });
  }
});

export default router;

