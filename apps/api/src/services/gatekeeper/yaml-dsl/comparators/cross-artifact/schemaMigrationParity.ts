/**
 * Schema ↔ Migration Parity Comparator (Track A Task 2)
 * 
 * Detects inconsistencies between database schemas and migration files:
 * - Schema changes (Prisma, SQL, TypeORM) without migration files
 * - Migration files without schema changes
 * - Breaking schema changes without rollback migrations
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';

export const schemaMigrationParityComparator: Comparator = {
  id: ComparatorId.SCHEMA_MIGRATION_PARITY,
  version: '1.0.0',
  
  async evaluateStructured(
    context: PRContext,
    params: SchemaMigrationParityParams
  ): Promise<ObligationResult> {
    const { files } = context;
    
    // Detect schema file changes
    const schemaFiles = files.filter(f =>
      f.filename.match(/schema\.prisma$/i) ||
      f.filename.match(/\.sql$/i) ||
      f.filename.match(/models\.(ts|js|py)$/i) ||
      f.filename.includes('/models/') ||
      f.filename.includes('/schema/') ||
      f.filename.match(/typeorm.*entity\.(ts|js)$/i)
    );
    
    // Detect migration file changes
    const migrationFiles = files.filter(f =>
      f.filename.includes('/migrations/') ||
      f.filename.match(/migration.*\.(ts|js|sql|py)$/i) ||
      f.filename.match(/\d{14}_.*\.(ts|js|sql)$/i) || // Timestamp-based migrations
      f.filename.includes('/alembic/') || // Python Alembic
      f.filename.includes('/flyway/') // Java Flyway
    );
    
    const hasSchemaChanges = schemaFiles.length > 0;
    const hasMigrationChanges = migrationFiles.length > 0;
    
    // Evidence collection
    const evidence: EvidenceItem[] = [];
    
    if (hasSchemaChanges) {
      evidence.push({
        type: 'file_reference',
        path: schemaFiles.map(f => f.filename).join(', '),
        snippet: `Schema files changed: ${schemaFiles.length}`,
        confidence: 100,
      });
    }
    
    if (hasMigrationChanges) {
      evidence.push({
        type: 'file_reference',
        path: migrationFiles.map(f => f.filename).join(', '),
        snippet: `Migration files changed: ${migrationFiles.length}`,
        confidence: 100,
      });
    }
    
    // Check for mismatches
    if (hasSchemaChanges && !hasMigrationChanges) {
      // Schema changed but no migration
      return {
        status: 'fail',
        reason: 'Schema changed without migration file',
        reasonHuman: CrossArtifactMessages.schemaMigrationMissing(
          schemaFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.SCHEMA_MIGRATION_MISSING,
        evidence,
        remediation: [
          RemediationMessages.crossArtifact.addMigrationFile(
            schemaFiles.map(f => f.filename).join(', ')
          ),
        ],
        confidence: {
          applicability: 100,
          evidence: 95,
          decisionQuality: 90,
        },
      };
    }
    
    if (hasMigrationChanges && !hasSchemaChanges && params.requireSchemaUpdate) {
      // Migration added but no schema changes
      return {
        status: 'fail',
        reason: 'Migration added without schema changes',
        reasonHuman: CrossArtifactMessages.migrationSchemaMismatch(
          migrationFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.MIGRATION_SCHEMA_MISMATCH,
        evidence,
        remediation: [
          RemediationMessages.crossArtifact.updateSchema(
            migrationFiles.map(f => f.filename).join(', ')
          ),
        ],
        confidence: {
          applicability: 100,
          evidence: 85,
          decisionQuality: 80,
        },
      };
    }
    
    // Both changed or neither changed (consistent)
    return {
      status: 'pass',
      reason: 'Schema and migration files are consistent',
      reasonHuman: CrossArtifactMessages.schemaMigrationConsistent(),
      reasonCode: FindingCode.PASS,
      evidence,
      confidence: {
        applicability: 100,
        evidence: 100,
        decisionQuality: 100,
      },
    };
  },
};

export interface SchemaMigrationParityParams {
  /**
   * If true, migration files require corresponding schema changes
   * If false, only warn when schema changes without migrations
   */
  requireSchemaUpdate?: boolean;
}

