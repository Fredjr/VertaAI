/**
 * GitHub API Routes
 * 
 * Provides endpoints for:
 * - Fetching repositories accessible to the workspace
 * - Fetching branches for a specific repository
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { getGitHubClient } from '../services/github-client.js';

const router: RouterType = Router();

/**
 * GET /api/workspaces/:workspaceId/github/repos
 * Returns list of repositories accessible to the workspace's GitHub integration
 */
router.get('/workspaces/:workspaceId/github/repos', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  try {
    const octokit = await getGitHubClient(workspaceId);

    if (!octokit) {
      return res.status(400).json({ 
        error: 'GitHub integration not configured for this workspace',
        repos: []
      });
    }

    // Fetch repositories accessible to the installation
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    const repos = data.repositories.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      defaultBranch: repo.default_branch,
      description: repo.description,
      url: repo.html_url,
    }));

    return res.json({ repos });
  } catch (err: any) {
    console.error(`[GitHub] Error fetching repos for workspace ${workspaceId}:`, err);
    return res.status(500).json({ 
      error: err.message,
      repos: []
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/github/repos/:owner/:repo/branches
 * Returns list of branches for a specific repository
 */
router.get('/workspaces/:workspaceId/github/repos/:owner/:repo/branches', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const owner = req.params.owner as string;
  const repo = req.params.repo as string;

  try {
    const octokit = await getGitHubClient(workspaceId);

    if (!octokit) {
      return res.status(400).json({ 
        error: 'GitHub integration not configured for this workspace',
        branches: []
      });
    }

    // Fetch branches for the repository
    const { data } = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });

    const branches = data.map((branch: any) => ({
      name: branch.name,
      protected: branch.protected,
      commit: {
        sha: branch.commit.sha,
        url: branch.commit.url,
      },
    }));

    return res.json({ branches });
  } catch (err: any) {
    console.error(`[GitHub] Error fetching branches for ${owner}/${repo}:`, err);
    return res.status(500).json({ 
      error: err.message,
      branches: []
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/github/status
 * Returns GitHub integration status for the workspace
 */
router.get('/workspaces/:workspaceId/github/status', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  try {
    const octokit = await getGitHubClient(workspaceId);

    if (!octokit) {
      return res.json({ 
        connected: false,
        status: 'not_configured'
      });
    }

    // Test the connection by fetching the authenticated user/app
    try {
      const { data } = await octokit.rest.users.getAuthenticated();
      return res.json({ 
        connected: true,
        status: 'connected',
        user: {
          login: data.login,
          type: data.type,
        }
      });
    } catch (authError) {
      return res.json({ 
        connected: false,
        status: 'authentication_failed'
      });
    }
  } catch (err: any) {
    console.error(`[GitHub] Error checking status for workspace ${workspaceId}:`, err);
    return res.status(500).json({ 
      error: err.message,
      connected: false,
      status: 'error'
    });
  }
});

export default router;

