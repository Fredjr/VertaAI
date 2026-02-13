/**
 * Helper script to find GitHub App installation_id
 * 
 * This script helps you find the installation_id in multiple ways:
 * 1. From GitHub API using your personal access token
 * 2. From the GitHub App settings page URL
 * 3. Manual instructions
 */

import { Octokit } from 'octokit';

async function findInstallationId() {
  console.log('\n🔍 Finding GitHub App Installation ID\n');
  console.log('=' .repeat(60));
  
  // Method 1: Manual lookup from GitHub UI
  console.log('\n📋 Method 1: Manual Lookup from GitHub UI');
  console.log('-'.repeat(60));
  console.log('1. Go to: https://github.com/settings/installations');
  console.log('2. Find "VertaAI Drift Detector" in the list');
  console.log('3. Click on it');
  console.log('4. Look at the URL - it will be:');
  console.log('   https://github.com/settings/installations/XXXXXXXX');
  console.log('   The XXXXXXXX is your installation_id');
  
  // Method 2: Using GitHub API (requires personal access token)
  console.log('\n\n📋 Method 2: Using GitHub API');
  console.log('-'.repeat(60));
  console.log('If you have a GitHub personal access token, you can run:');
  console.log('');
  console.log('  GITHUB_TOKEN=your_token npx tsx scripts/find-installation-id.ts');
  console.log('');
  
  const token = process.env.GITHUB_TOKEN;
  
  if (token) {
    try {
      const octokit = new Octokit({ auth: token });
      
      console.log('Fetching installations...\n');
      
      // Get user installations
      const { data: installations } = await octokit.request('GET /user/installations', {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      
      console.log(`Found ${installations.total_count} installation(s):\n`);
      
      for (const installation of installations.installations) {
        console.log(`  App: ${installation.app_slug}`);
        console.log(`  Installation ID: ${installation.id}`);
        console.log(`  Account: ${installation.account.login}`);
        console.log(`  Target Type: ${installation.target_type}`);
        console.log('');
        
        if (installation.app_slug === 'vertaai-drift-detector' || 
            installation.app_slug?.includes('verta')) {
          console.log('  ✅ This looks like the VertaAI app!');
          console.log(`  📝 Installation ID: ${installation.id}`);
          console.log('');
          console.log('  Run this command to create the integration:');
          console.log(`  cd apps/api && npx tsx scripts/create-github-integration.ts e887c992-63e1-4719-91cf-8ba165c893cd ${installation.id}`);
          console.log('');
        }
      }
    } catch (error: any) {
      console.error('Error fetching installations:', error.message);
      console.log('\nMake sure your token has the following scopes:');
      console.log('  - read:org');
      console.log('  - read:user');
    }
  }
  
  // Method 3: From webhook payload
  console.log('\n📋 Method 3: From Webhook Payload');
  console.log('-'.repeat(60));
  console.log('The installation_id should be in the webhook payload at:');
  console.log('  req.body.installation.id');
  console.log('');
  console.log('However, some webhook events (like ping) may not include it.');
  console.log('Try creating a PR or pushing a commit to trigger a webhook with the installation object.');
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Once you have the installation_id, run:');
  console.log('   cd apps/api');
  console.log('   npx tsx scripts/create-github-integration.ts \\');
  console.log('     e887c992-63e1-4719-91cf-8ba165c893cd \\');
  console.log('     <INSTALLATION_ID>');
  console.log('');
}

findInstallationId().catch(console.error);

