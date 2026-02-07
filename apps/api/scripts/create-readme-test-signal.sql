-- Create a proper test signal for GitHub PR → README path
-- This signal should trigger instruction drift and target github_readme

INSERT INTO signal_events (workspace_id, id, source_type, repo, service, extracted, raw_payload, created_at, occurred_at)
VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'github_pr_readme_proper_test',
  'github_pr',
  'Fredjr/VertaAI',
  'api',
  '{
    "prTitle": "feat: Add OAuth2 authentication with PKCE flow",
    "prBody": "This PR adds comprehensive OAuth2 authentication support with PKCE flow. Breaking change: JWT tokens are deprecated. All API clients must migrate to OAuth2. Documentation needs to be updated in README.md to reflect new authentication flow.",
    "prNumber": 150,
    "merged": true,
    "authorLogin": "Fredjr",
    "changedFiles": [
      {"filename": "apps/api/src/auth/oauth.ts", "status": "added", "additions": 120, "deletions": 0},
      {"filename": "apps/api/src/auth/jwt.ts", "status": "modified", "additions": 10, "deletions": 80},
      {"filename": "apps/api/src/middleware/auth.ts", "status": "modified", "additions": 45, "deletions": 30}
    ],
    "totalChanges": 205
  }'::jsonb,
  '{
    "action": "closed",
    "pull_request": {
      "number": 150,
      "merged": true,
      "merged_at": "2026-02-07T10:00:00Z"
    },
    "diff": "diff --git a/apps/api/src/auth/oauth.ts b/apps/api/src/auth/oauth.ts\nnew file mode 100644\n--- /dev/null\n+++ b/apps/api/src/auth/oauth.ts\n@@ -0,0 +1,120 @@\n+import { OAuth2Client } from \"@auth/oauth2\";\n+\n+/**\n+ * OAuth2 Authentication Handler\n+ * \n+ * Implements OAuth2 with PKCE flow for secure authentication.\n+ * This replaces the deprecated JWT token system.\n+ * \n+ * @example\n+ * ```typescript\n+ * const auth = new OAuth2Handler({\n+ *   clientId: process.env.OAUTH2_CLIENT_ID,\n+ *   redirectUri: process.env.OAUTH2_REDIRECT_URI\n+ * });\n+ * \n+ * // Start auth flow\n+ * const authUrl = await auth.getAuthorizationUrl();\n+ * \n+ * // Exchange code for token\n+ * const tokens = await auth.exchangeCodeForTokens(code, codeVerifier);\n+ * ```\n+ */\n+export class OAuth2Handler {\n+  private client: OAuth2Client;\n+\n+  constructor(config: OAuth2Config) {\n+    this.client = new OAuth2Client(config);\n+  }\n+\n+  async getAuthorizationUrl(): Promise<string> {\n+    // Implementation\n+  }\n+\n+  async exchangeCodeForTokens(code: string, verifier: string): Promise<Tokens> {\n+    // Implementation\n+  }\n+}\n\ndiff --git a/apps/api/src/auth/jwt.ts b/apps/api/src/auth/jwt.ts\n--- a/apps/api/src/auth/jwt.ts\n+++ b/apps/api/src/auth/jwt.ts\n@@ -1,80 +1,10 @@\n import jwt from \"jsonwebtoken\";\n \n+/**\n+ * @deprecated Use OAuth2Handler instead. JWT tokens will be removed in v2.0.\n+ */\n export function verifyJWT(token: string) {\n-  return jwt.verify(token, process.env.JWT_SECRET);\n+  console.warn(\"JWT authentication is deprecated. Please migrate to OAuth2.\");\n+  return jwt.verify(token, process.env.JWT_SECRET || \"fallback\");\n }\n"
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
  'github_pr_readme_proper_test',
  'github_pr',
  'Fredjr/VertaAI',
  'api',
  'INGESTED',
  NOW()
)
RETURNING id;

