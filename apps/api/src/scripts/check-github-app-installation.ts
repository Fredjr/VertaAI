/**
 * Check GitHub App installation status and repository access
 * This helps debug why webhooks aren't being received
 */

import { App } from 'octokit';

async function main() {
  const appId = process.env.GH_APP_ID;
  const privateKey = process.env.GH_APP_PRIVATE_KEY;
  const installationId = 105899665;

  if (!appId || !privateKey) {
    console.error('❌ Missing GH_APP_ID or GH_APP_PRIVATE_KEY environment variables');
    console.log('\nPlease set these in your .env file:');
    console.log('GH_APP_ID=2755713');
    console.log('GH_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n..."');
    process.exit(1);
  }

  console.log('🔍 Checking GitHub App installation...\n');
  console.log(`App ID: ${appId}`);
  console.log(`Installation ID: ${installationId}\n`);

  try {
    const app = new App({
      appId,
      privateKey,
    });

    // Get installation details
    const octokit = await app.getInstallationOctokit(installationId);

    // List repositories accessible to this installation
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    console.log(`✅ Installation is active!`);
    console.log(`\n📦 Repositories with access (${data.repositories.length}):\n`);

    if (data.repositories.length === 0) {
      console.log('❌ No repositories have access to this GitHub App installation!');
      console.log('\n📝 To fix this:');
      console.log('1. Go to: https://github.com/settings/apps/vertaai-app');
      console.log('2. Click "Install App" tab');
      console.log('3. Install on your account and select repositories');
      console.log('4. Or go to: https://github.com/apps/vertaai-app/installations/new');
    } else {
      data.repositories.forEach((repo, index) => {
        console.log(`${index + 1}. ${repo.full_name}`);
        console.log(`   - Private: ${repo.private}`);
        console.log(`   - URL: ${repo.html_url}`);
        console.log('');
      });

      // Check if our test repo is in the list
      const hasTestRepo = data.repositories.some(
        (repo) => repo.full_name === 'Fredjr/vertaai-e2e-test'
      );

      if (hasTestRepo) {
        console.log('✅ Test repository "Fredjr/vertaai-e2e-test" has access!');
        console.log('\n📝 Next steps:');
        console.log('1. Webhooks should now work for this repository');
        console.log('2. Create a new PR or re-trigger the existing PR');
        console.log('3. Check Railway logs for webhook activity');
      } else {
        console.log('❌ Test repository "Fredjr/vertaai-e2e-test" does NOT have access!');
        console.log('\n📝 To add access:');
        console.log('1. Go to: https://github.com/settings/installations/105899665');
        console.log('2. Click "Configure"');
        console.log('3. Under "Repository access", select "Fredjr/vertaai-e2e-test"');
        console.log('4. Save changes');
      }
    }

    // Get installation metadata
    const installation = await octokit.rest.apps.getInstallation({
      installation_id: installationId,
    });

    console.log('\n📊 Installation Details:');
    console.log(`   Account: ${installation.data.account?.login}`);
    console.log(`   Type: ${installation.data.target_type}`);
    console.log(`   Created: ${installation.data.created_at}`);
    console.log(`   Updated: ${installation.data.updated_at}`);

  } catch (error: any) {
    console.error('❌ Error checking installation:', error.message);
    
    if (error.status === 404) {
      console.log('\n💡 Installation not found. This could mean:');
      console.log('1. The installation ID is incorrect');
      console.log('2. The GitHub App credentials are wrong');
      console.log('3. The installation was deleted');
    }
  }
}

main();

