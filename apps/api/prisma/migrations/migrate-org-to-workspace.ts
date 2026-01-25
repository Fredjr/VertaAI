/**
 * Data Migration Script: Organization → Workspace
 * 
 * This script migrates existing Organization records to the new Workspace model,
 * creating Integration records for each OAuth connection (Slack, Confluence, GitHub).
 * 
 * Run with: npx ts-node prisma/migrations/migrate-org-to-workspace.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateOrganizationsToWorkspaces() {
  console.log('Starting Organization → Workspace migration...\n');

  const orgs = await prisma.organization.findMany();
  console.log(`Found ${orgs.length} organizations to migrate.\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const org of orgs) {
    // Check if workspace already exists (idempotent migration)
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { id: org.id }
    });

    if (existingWorkspace) {
      console.log(`⏭️  Skipping ${org.name} - workspace already exists`);
      skippedCount++;
      continue;
    }

    try {
      // Create workspace from organization (use same ID for easier migration)
      const workspace = await prisma.workspace.create({
        data: {
          id: org.id, // Keep same ID to maintain relationships
          name: org.name,
          slug: org.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          ownerEmail: 'admin@vertaai.com', // Default owner - update as needed
        }
      });

      console.log(`✅ Created workspace: ${workspace.name} (${workspace.id})`);

      // Create Slack integration if connected
      if (org.slackWorkspaceId && org.slackBotToken) {
        await prisma.integration.create({
          data: {
            workspaceId: workspace.id,
            type: 'slack',
            status: 'connected',
            config: {
              teamId: org.slackWorkspaceId,
              botToken: org.slackBotToken,
              teamName: org.slackTeamName || null,
              botUserId: (org.settings as any)?.slackBotUserId || null,
            }
          }
        });
        console.log(`   └─ ✅ Created Slack integration`);
      }

      // Create Confluence integration if connected
      if (org.confluenceCloudId && org.confluenceAccessToken) {
        await prisma.integration.create({
          data: {
            workspaceId: workspace.id,
            type: 'confluence',
            status: 'connected',
            config: {
              cloudId: org.confluenceCloudId,
              accessToken: org.confluenceAccessToken,
              siteName: (org.settings as any)?.confluenceSiteName || null,
              refreshToken: (org.settings as any)?.confluenceRefreshToken || null,
            }
          }
        });
        console.log(`   └─ ✅ Created Confluence integration`);
      }

      // Create GitHub integration if connected
      if (org.githubInstallationId) {
        await prisma.integration.create({
          data: {
            workspaceId: workspace.id,
            type: 'github',
            status: 'connected',
            config: {
              installationId: org.githubInstallationId.toString(),
            }
          }
        });
        console.log(`   └─ ✅ Created GitHub integration`);
      }

      migratedCount++;
    } catch (error) {
      console.error(`❌ Failed to migrate ${org.name}:`, error);
    }
  }

  console.log('\n========================================');
  console.log('Migration Summary:');
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped:  ${skippedCount}`);
  console.log(`  Total:    ${orgs.length}`);
  console.log('========================================\n');
}

// Main execution
migrateOrganizationsToWorkspaces()
  .then(() => {
    console.log('Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

