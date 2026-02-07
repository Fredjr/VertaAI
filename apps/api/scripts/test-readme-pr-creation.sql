-- Test README PR Creation Path
-- Create a signal for a service that ONLY has README mapping (no Confluence)

-- First, create a README-only doc mapping for 'frontend' service
INSERT INTO doc_mappings_v2 (workspace_id, doc_system, doc_id, doc_title, repo, service, is_primary, created_at, updated_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'github_readme',
  'Fredjr/VertaAI/apps/frontend/README.md',
  'Frontend README',
  'Fredjr/VertaAI',
  'frontend',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, doc_system, doc_id) DO NOTHING;

-- Create a test signal for frontend service
INSERT INTO signal_events (workspace_id, id, source_type, repo, service, extracted, raw_payload, created_at, occurred_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'github_pr_frontend_readme_test',
  'github_pr',
  'Fredjr/VertaAI',
  'frontend',  -- Different service with only README mapping
  '{
    "prTitle": "feat: Add React Router v6 navigation",
    "prBody": "Migrated from React Router v5 to v6. Breaking change: Route syntax changed. All developers need to update their local setup instructions.",
    "prNumber": 200,
    "merged": true,
    "authorLogin": "Fredjr",
    "changedFiles": [
      {"filename": "apps/frontend/src/App.tsx", "status": "modified", "additions": 80, "deletions": 45},
      {"filename": "apps/frontend/src/routes/index.tsx", "status": "modified", "additions": 120, "deletions": 90}
    ],
    "totalChanges": 155
  }'::jsonb,
  '{
    "action": "closed",
    "pull_request": {
      "number": 200,
      "merged": true,
      "merged_at": "2026-02-07T11:00:00Z"
    },
    "diff": "diff --git a/apps/frontend/src/App.tsx b/apps/frontend/src/App.tsx\n--- a/apps/frontend/src/App.tsx\n+++ b/apps/frontend/src/App.tsx\n@@ -1,10 +1,15 @@\n-import { BrowserRouter, Route, Switch } from \"react-router-dom\";\n+import { BrowserRouter, Routes, Route } from \"react-router-dom\";\n \n export function App() {\n   return (\n     <BrowserRouter>\n-      <Switch>\n-        <Route path=\"/\" component={Home} />\n-        <Route path=\"/about\" component={About} />\n-      </Switch>\n+      <Routes>\n+        <Route path=\"/\" element={<Home />} />\n+        <Route path=\"/about\" element={<About />} />\n+      </Routes>\n     </BrowserRouter>\n   );\n }\n\ndiff --git a/apps/frontend/src/routes/index.tsx b/apps/frontend/src/routes/index.tsx\n--- a/apps/frontend/src/routes/index.tsx\n+++ b/apps/frontend/src/routes/index.tsx\n@@ -1,5 +1,5 @@\n-import { useHistory } from \"react-router-dom\";\n+import { useNavigate } from \"react-router-dom\";\n \n export function NavigationExample() {\n-  const history = useHistory();\n-  history.push(\"/dashboard\");\n+  const navigate = useNavigate();\n+  navigate(\"/dashboard\");\n }\n"
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (workspace_id, id) DO UPDATE
SET extracted = EXCLUDED.extracted, raw_payload = EXCLUDED.raw_payload;

-- Create drift candidate
INSERT INTO drift_candidates (workspace_id, id, signal_event_id, source_type, repo, service, state, created_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  gen_random_uuid(),
  'github_pr_frontend_readme_test',
  'github_pr',
  'Fredjr/VertaAI',
  'frontend',
  'INGESTED',
  NOW()
)
RETURNING id;

