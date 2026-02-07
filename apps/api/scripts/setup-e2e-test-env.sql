-- Setup E2E Test Environment
-- Creates all necessary doc mappings and mock integrations for testing

-- ============================================================================
-- Doc Mappings for All Output Targets
-- ============================================================================

-- GitHub README (already exists)
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'github_readme',
  'Fredjr/VertaAI/README.md',
  'VertaAI README',
  'Fredjr/VertaAI',
  'api',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- GitHub Swagger/OpenAPI
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'github_swagger',
  'Fredjr/VertaAI/docs/openapi.yaml',
  'VertaAI API Specification',
  'Fredjr/VertaAI',
  'api',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- GitHub Code Comments
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'github_code_comments',
  'Fredjr/VertaAI/apps/api/src/services/orchestrator/transitions.ts',
  'State Machine Transitions',
  'Fredjr/VertaAI',
  'api',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- GitBook
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'gitbook',
  'Fredjr/VertaAI/docs/runbook.md',
  'VertaAI Runbook',
  'Fredjr/VertaAI',
  'api',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- Backstage
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'backstage',
  'Fredjr/VertaAI/catalog-info.yaml',
  'VertaAI Service Catalog',
  'Fredjr/VertaAI',
  'api',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- Notion (mock)
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'notion',
  'mock-notion-page-123',
  'VertaAI Runbook (Notion)',
  'Fredjr/VertaAI',
  'api',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- ============================================================================
-- Mock Integrations for Testing
-- ============================================================================

-- Notion integration (mock)
INSERT INTO integrations (workspace_id, type, status, config, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'notion',
  'connected',
  '{"accessToken": "mock_notion_token", "mock": true}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, type) DO UPDATE
SET status = 'connected', config = '{"accessToken": "mock_notion_token", "mock": true}'::jsonb;

-- PagerDuty integration (mock)
INSERT INTO integrations (workspace_id, type, status, config, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'pagerduty',
  'connected',
  '{"apiKey": "mock_pagerduty_key", "mock": true}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, type) DO UPDATE
SET status = 'connected', config = '{"apiKey": "mock_pagerduty_key", "mock": true}'::jsonb;

-- Datadog integration (mock)
INSERT INTO integrations (workspace_id, type, status, config, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'datadog',
  'connected',
  '{"apiKey": "mock_datadog_key", "appKey": "mock_datadog_app_key", "mock": true}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, type) DO UPDATE
SET status = 'connected', config = '{"apiKey": "mock_datadog_key", "appKey": "mock_datadog_app_key", "mock": true}'::jsonb;

-- Verify setup
SELECT 'Doc Mappings:' as section, COUNT(*) as count FROM doc_mappings_v2 WHERE workspace_id = '63d61996-28c2-4050-a020-ebd784aa4076'
UNION ALL
SELECT 'Integrations:', COUNT(*) FROM integrations WHERE workspace_id = '63d61996-28c2-4050-a020-ebd784aa4076';

