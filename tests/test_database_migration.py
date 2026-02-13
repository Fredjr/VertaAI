"""
Tests for Database Migration Service
"""

import unittest
import os
import tempfile
import shutil
from datetime import datetime
from src.services.database_migration import (
    DatabaseMigrationService,
    Migration,
    MigrationStatus
)


class TestDatabaseMigrationService(unittest.TestCase):
    """Test cases for DatabaseMigrationService"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.service = DatabaseMigrationService(
            connection_string="postgresql://test:test@localhost/test",
            migrations_dir=self.temp_dir
        )
    
    def tearDown(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir)
    
    def create_test_migration(self, version: str, name: str) -> str:
        """Helper to create a test migration file"""
        content = f"""-- UP
CREATE TABLE test_{name} (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- DOWN
DROP TABLE test_{name};
"""
        filepath = os.path.join(self.temp_dir, f"{version}__{name}.sql")
        with open(filepath, 'w') as f:
            f.write(content)
        return filepath
    
    def test_calculate_checksum(self):
        """Test checksum calculation"""
        content = "SELECT * FROM users;"
        checksum1 = self.service.calculate_checksum(content)
        checksum2 = self.service.calculate_checksum(content)
        
        # Same content should produce same checksum
        self.assertEqual(checksum1, checksum2)
        
        # Different content should produce different checksum
        different_content = "SELECT * FROM posts;"
        checksum3 = self.service.calculate_checksum(different_content)
        self.assertNotEqual(checksum1, checksum3)
    
    def test_load_migrations_empty_directory(self):
        """Test loading migrations from empty directory"""
        migrations = self.service.load_migrations()
        self.assertEqual(len(migrations), 0)
    
    def test_load_migrations_with_files(self):
        """Test loading migrations from directory with files"""
        self.create_test_migration("V001", "create_users")
        self.create_test_migration("V002", "create_posts")
        
        migrations = self.service.load_migrations()
        
        self.assertEqual(len(migrations), 2)
        self.assertEqual(migrations[0].version, "V001")
        self.assertEqual(migrations[0].name, "create_users")
        self.assertEqual(migrations[1].version, "V002")
        self.assertEqual(migrations[1].name, "create_posts")
    
    def test_migration_sorting(self):
        """Test that migrations are sorted by version"""
        self.create_test_migration("V003", "create_comments")
        self.create_test_migration("V001", "create_users")
        self.create_test_migration("V002", "create_posts")
        
        migrations = self.service.load_migrations()
        
        versions = [m.version for m in migrations]
        self.assertEqual(versions, ["V001", "V002", "V003"])
    
    def test_migration_checksum_generation(self):
        """Test that checksums are generated for migrations"""
        self.create_test_migration("V001", "create_users")
        
        migrations = self.service.load_migrations()
        
        self.assertEqual(len(migrations), 1)
        self.assertIsNotNone(migrations[0].checksum)
        self.assertEqual(len(migrations[0].checksum), 64)  # SHA-256 hex length
    
    def test_apply_migration_dry_run(self):
        """Test applying migration in dry-run mode"""
        migration = Migration(
            version="V001",
            name="test_migration",
            description="Test migration",
            up_sql="CREATE TABLE test (id INT);",
            down_sql="DROP TABLE test;",
            checksum="abc123"
        )
        
        result = self.service.apply_migration(migration, dry_run=True)
        
        self.assertTrue(result)
        self.assertEqual(migration.status, MigrationStatus.PENDING)  # Should not change in dry-run
    
    def test_rollback_migration_dry_run(self):
        """Test rolling back migration in dry-run mode"""
        migration = Migration(
            version="V001",
            name="test_migration",
            description="Test migration",
            up_sql="CREATE TABLE test (id INT);",
            down_sql="DROP TABLE test;",
            checksum="abc123",
            status=MigrationStatus.COMPLETED
        )
        
        result = self.service.rollback_migration(migration, dry_run=True)
        
        self.assertTrue(result)
        self.assertEqual(migration.status, MigrationStatus.COMPLETED)  # Should not change in dry-run
    
    def test_get_migration_status_empty(self):
        """Test getting migration status with no migrations"""
        status = self.service.get_migration_status()
        
        self.assertEqual(status['total_migrations'], 0)
        self.assertEqual(status['applied_count'], 0)
        self.assertEqual(status['pending_count'], 0)
        self.assertIsNone(status['current_version'])
        self.assertIsNone(status['latest_version'])
    
    def test_get_migration_status_with_migrations(self):
        """Test getting migration status with migrations"""
        self.create_test_migration("V001", "create_users")
        self.create_test_migration("V002", "create_posts")
        
        status = self.service.get_migration_status()
        
        self.assertEqual(status['total_migrations'], 2)
        self.assertEqual(status['pending_count'], 2)
        self.assertEqual(status['latest_version'], "V002")


if __name__ == '__main__':
    unittest.main()

