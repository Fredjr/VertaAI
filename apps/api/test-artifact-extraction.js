// Quick test of artifact extraction
import { extractArtifacts } from './dist/services/baseline/artifactExtractor.js';

const testDiff = `
diff --git a/apps/api/routes/monitoring.ts b/apps/api/routes/monitoring.ts
+++ b/apps/api/routes/monitoring.ts
@@ -1,0 +1,10 @@
+router.get('/api/monitoring/health', async (req, res) => {
+  const dbStatus = await checkDatabase();
+  res.json({ status: 'ok', database: dbStatus });
+});
+
+router.post('/api/monitoring/metrics', async (req, res) => {
+  const metrics = await getMetrics();
+  res.json(metrics);
+});
`;

try {
  console.log('Testing artifact extraction...');
  const result = extractArtifacts({
    sourceType: 'github_pr',
    sourceEvidence: {
      artifacts: {
        prDiff: {
          excerpt: testDiff,
          filesChanged: ['apps/api/routes/monitoring.ts'],
        },
      },
    },
  });
  
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\nEndpoints found:', result.endpoints);
  console.log('Commands found:', result.commands);
} catch (error) {
  console.error('ERROR:', error);
  process.exit(1);
}
