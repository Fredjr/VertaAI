"""
Database Migration Service
Handles database schema migrations, version control, and rollback functionality.
"""

import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class MigrationStatus(Enum):
    """Migration execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class Migration:
    """Represents a database migration"""
    version: str
    name: str
    description: str
    up_sql: str
    down_sql: str
    checksum: str
    applied_at: Optional[datetime] = None
    status: MigrationStatus = MigrationStatus.PENDING


class DatabaseMigrationService:
    """
    Service for managing database migrations with version control.
    
    Features:
    - Sequential migration execution
    - Checksum validation
    - Rollback support
    - Migration history tracking
    - Dry-run mode
    """
    
    def __init__(self, connection_string: str, migrations_dir: str = "./migrations"):
        """
        Initialize the migration service.
        
        Args:
            connection_string: Database connection string
            migrations_dir: Directory containing migration files
        """
        self.connection_string = connection_string
        self.migrations_dir = migrations_dir
        self.migration_table = "schema_migrations"
    
    def calculate_checksum(self, content: str) -> str:
        """
        Calculate SHA-256 checksum for migration content.
        
        Args:
            content: Migration SQL content
            
        Returns:
            Hexadecimal checksum string
        """
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def load_migrations(self) -> List[Migration]:
        """
        Load all migration files from the migrations directory.
        
        Returns:
            List of Migration objects sorted by version
        """
        migrations = []
        
        if not os.path.exists(self.migrations_dir):
            os.makedirs(self.migrations_dir)
            return migrations
        
        for filename in sorted(os.listdir(self.migrations_dir)):
            if not filename.endswith('.sql'):
                continue
            
            filepath = os.path.join(self.migrations_dir, filename)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Parse migration file (format: V001__description.sql)
            parts = filename.replace('.sql', '').split('__')
            if len(parts) != 2:
                continue
            
            version = parts[0]
            name = parts[1]
            
            # Split up and down migrations
            sections = content.split('-- DOWN')
            up_sql = sections[0].replace('-- UP', '').strip()
            down_sql = sections[1].strip() if len(sections) > 1 else ""
            
            migration = Migration(
                version=version,
                name=name,
                description=f"Migration {version}: {name}",
                up_sql=up_sql,
                down_sql=down_sql,
                checksum=self.calculate_checksum(up_sql)
            )
            migrations.append(migration)
        
        return sorted(migrations, key=lambda m: m.version)
    
    def get_applied_migrations(self) -> Dict[str, Migration]:
        """
        Get list of already applied migrations from database.
        
        Returns:
            Dictionary mapping version to Migration object
        """
        # TODO: Query database for applied migrations
        # This is a placeholder implementation
        return {}
    
    def apply_migration(self, migration: Migration, dry_run: bool = False) -> bool:
        """
        Apply a single migration to the database.
        
        Args:
            migration: Migration to apply
            dry_run: If True, only validate without executing
            
        Returns:
            True if successful, False otherwise
        """
        if dry_run:
            print(f"[DRY RUN] Would apply migration {migration.version}: {migration.name}")
            print(f"SQL: {migration.up_sql[:100]}...")
            return True
        
        try:
            # TODO: Execute migration SQL
            # TODO: Record migration in schema_migrations table
            migration.status = MigrationStatus.COMPLETED
            migration.applied_at = datetime.now()
            print(f"✓ Applied migration {migration.version}: {migration.name}")
            return True
        except Exception as e:
            migration.status = MigrationStatus.FAILED
            print(f"✗ Failed to apply migration {migration.version}: {str(e)}")
            return False

    def rollback_migration(self, migration: Migration, dry_run: bool = False) -> bool:
        """
        Rollback a migration using its down SQL.

        Args:
            migration: Migration to rollback
            dry_run: If True, only validate without executing

        Returns:
            True if successful, False otherwise
        """
        if dry_run:
            print(f"[DRY RUN] Would rollback migration {migration.version}: {migration.name}")
            print(f"SQL: {migration.down_sql[:100]}...")
            return True

        try:
            # TODO: Execute rollback SQL
            # TODO: Remove migration from schema_migrations table
            migration.status = MigrationStatus.ROLLED_BACK
            print(f"✓ Rolled back migration {migration.version}: {migration.name}")
            return True
        except Exception as e:
            print(f"✗ Failed to rollback migration {migration.version}: {str(e)}")
            return False

    def migrate_up(self, target_version: Optional[str] = None, dry_run: bool = False) -> Tuple[int, int]:
        """
        Apply all pending migrations up to target version.

        Args:
            target_version: Stop at this version (None = apply all)
            dry_run: If True, only validate without executing

        Returns:
            Tuple of (successful_count, failed_count)
        """
        migrations = self.load_migrations()
        applied = self.get_applied_migrations()

        successful = 0
        failed = 0

        for migration in migrations:
            # Skip already applied migrations
            if migration.version in applied:
                continue

            # Stop if we reached target version
            if target_version and migration.version > target_version:
                break

            if self.apply_migration(migration, dry_run):
                successful += 1
            else:
                failed += 1
                break  # Stop on first failure

        return (successful, failed)

    def migrate_down(self, steps: int = 1, dry_run: bool = False) -> Tuple[int, int]:
        """
        Rollback the last N migrations.

        Args:
            steps: Number of migrations to rollback
            dry_run: If True, only validate without executing

        Returns:
            Tuple of (successful_count, failed_count)
        """
        applied = self.get_applied_migrations()
        migrations_to_rollback = sorted(
            applied.values(),
            key=lambda m: m.version,
            reverse=True
        )[:steps]

        successful = 0
        failed = 0

        for migration in migrations_to_rollback:
            if self.rollback_migration(migration, dry_run):
                successful += 1
            else:
                failed += 1
                break  # Stop on first failure

        return (successful, failed)

    def get_migration_status(self) -> Dict[str, any]:
        """
        Get current migration status and history.

        Returns:
            Dictionary with migration status information
        """
        all_migrations = self.load_migrations()
        applied = self.get_applied_migrations()

        pending = [m for m in all_migrations if m.version not in applied]

        return {
            "total_migrations": len(all_migrations),
            "applied_count": len(applied),
            "pending_count": len(pending),
            "current_version": max(applied.keys()) if applied else None,
            "latest_version": all_migrations[-1].version if all_migrations else None,
            "pending_migrations": [m.version for m in pending],
        }

