/**
 * Check GitHub App permissions for demo-workspace
 * Usage: GITHUB_TOKEN=<token> npx tsx src/scripts/check-github-app-permissions.ts
 */

import { Octokit } from 'octokit';

async function main() {
  const installationId = 105899665;
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    console.log('Usage: GITHUB_TOKEN=<token> npx tsx src/scripts/check-github-app-permissions.ts');
    process.exit(1);
  }

  console.log(`🔍 Checking GitHub App permissions for installation ${installationId}...\n`);

  try {
    const octokit = new Octokit({ auth: token });

    // Get installation details using the user installation endpoint
    // This works with personal access tokens
    const { data: installation } = await octokit.request('GET /user/installations/{installation_id}', {
      installation_id: installationId,
    });

    console.log('✅ Installation found:');
    console.log(`   Account: ${installation.account?.login}`);
    console.log(`   Type: ${installation.target_type}`);
    console.log(`   App ID: ${installation.app_id}`);
    console.log(`   Created: ${installation.created_at}`);
    console.log('');

    console.log('📋 Permissions:');
    const permissions = installation.permissions || {};

    for (const [key, value] of Object.entries(permissions)) {
      const icon = value === 'write' ? '✅' : value === 'read' ? '📖' : '❌';
      console.log(`   ${icon} ${key}: ${value}`);
    }

    console.log('');

    // Check specifically for checks permission
    if (permissions.checks === 'write') {
      console.log('✅ checks:write permission is granted!');
    } else if (permissions.checks === 'read') {
      console.log('⚠️  checks:read permission granted, but checks:write is needed');
    } else {
      console.log('❌ checks permission is NOT granted');
      console.log('');
      console.log('To fix this:');
      console.log('1. Go to: https://github.com/settings/apps/vertaai-app/permissions');
      console.log('2. Under "Repository permissions", find "Checks"');
      console.log('3. Change to "Read and write"');
      console.log('4. Save changes');
      console.log('5. Go to: https://github.com/settings/installations/105899665');
      console.log('6. Accept the new permissions');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.status === 404) {
      console.log('\nThis could mean:');
      console.log('- The installation ID is incorrect');
      console.log('- The token does not have permission to view this installation');
      console.log('- The GitHub App has been uninstalled');
    }
    process.exit(1);
  }
}

main();

