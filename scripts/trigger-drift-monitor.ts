/**
 * One-shot script to trigger the Runtime Drift Monitor for all workspaces.
 * Run with: pnpm tsx scripts/trigger-drift-monitor.ts
 *
 * This rebuilds all DriftClusters based on current intent artifacts and observations.
 * Safe to run multiple times — the monitor upserts existing clusters rather than
 * creating duplicates.
 */

import { runRuntimeDriftMonitor } from '../apps/api/src/services/runtime/runtimeDriftMonitor.js';

async function main() {
  console.log('🔍 Triggering Runtime Drift Monitor...\n');

  const results = await runRuntimeDriftMonitor();

  console.log('\n' + '='.repeat(60));
  console.log('📊 DRIFT MONITOR RESULTS');
  console.log('='.repeat(60));

  for (const r of results) {
    const icon = r.severity === 'critical' ? '🚨'
      : r.severity === 'high' ? '⚠️'
      : r.severity === 'medium' ? '🔔'
      : '✅';
    console.log(`\n${icon}  ${r.workspaceId} / ${r.service}`);
    console.log(`   Severity:              ${r.severity.toUpperCase()}`);
    console.log(`   Drifts detected:       ${r.driftsDetected}`);
    console.log(`   Undeclared usage:      ${r.undeclaredUsage}`);
    console.log(`   Unused declarations:   ${r.unusedDeclarations}`);
    console.log(`   DriftCluster updated:  ${!r.driftPlanCreated ? 'yes (existing cluster refreshed)' : 'yes (new cluster)'}`);
    console.log(`   PagerDuty alert:       ${r.pagerdutyAlertSent}`);
    console.log(`   GitHub check posted:   ${r.githubCheckPosted}`);
    console.log(`   Slack alert sent:      ${r.slackAlertSent}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Done. Processed ${results.length} service(s).`);
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('❌ Drift monitor failed:', err);
  process.exit(1);
});

