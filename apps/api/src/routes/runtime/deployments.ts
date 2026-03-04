/**
 * Deployment Event Webhook + Query Routes
 *
 *   POST /api/runtime/deployments          — record a deployment event
 *   GET  /api/runtime/deployments/:workspaceId/:service — list recent deployments
 *
 * Deployment events anchor drift detection: an undeclared capability first
 * observed after a specific deployment is causally attributed to that deploy.
 * CI/CD systems (GitHub Actions, ArgoCD, Helm) POST to this endpoint on every
 * successful deploy.
 *
 * Body for POST:
 *   workspaceId  string        (required)
 *   service      string        (required)
 *   deployedAt   ISO timestamp (optional, defaults to now)
 *   version      string?       semver | git SHA | image tag
 *   deployedBy   string?       username or CI bot name
 *   source       string?       "github_actions"|"argocd"|"helm"|"terraform"|"manual"
 *   environment  string?       "prod"|"staging"|"dev"
 *   notes        string?
 */

import { Router } from 'express';
import { prisma } from '../../lib/db.js';

const router = Router();

const VALID_SOURCES = ['github_actions', 'argocd', 'manual', 'helm', 'terraform'];
const VALID_ENVS = ['prod', 'staging', 'dev'];

// POST /api/runtime/deployments
router.post('/', async (req, res) => {
  const { workspaceId, service, deployedAt, version, deployedBy, source, environment, notes } = req.body;

  if (!workspaceId || !service) {
    res.status(400).json({ success: false, error: 'workspaceId and service are required' });
    return;
  }
  if (source && !VALID_SOURCES.includes(source)) {
    res.status(400).json({ success: false, error: `source must be one of: ${VALID_SOURCES.join(', ')}` });
    return;
  }
  if (environment && !VALID_ENVS.includes(environment)) {
    res.status(400).json({ success: false, error: `environment must be one of: ${VALID_ENVS.join(', ')}` });
    return;
  }

  try {
    const event = await prisma.deploymentEvent.create({
      data: {
        workspaceId,
        service,
        deployedAt: deployedAt ? new Date(deployedAt) : new Date(),
        version: version ?? null,
        deployedBy: deployedBy ?? null,
        source: source ?? 'manual',
        environment: environment ?? 'prod',
        notes: notes ?? null,
      },
    });
    res.status(201).json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/runtime/deployments/:workspaceId/:service
// Returns the 20 most recent deployments for a service
router.get('/:workspaceId/:service', async (req, res) => {
  const { workspaceId, service } = req.params;
  const limit = Math.min(Number(req.query['limit'] ?? 20), 100);

  try {
    const events = await prisma.deploymentEvent.findMany({
      where: { workspaceId, service },
      orderBy: { deployedAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, events });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
