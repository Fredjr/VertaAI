/**
 * Multi-Source Architecture Tests (Phase 1)
 * Tests for adapters, CODEOWNERS parser, feature flags, and doc resolution
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// CODEOWNERS PARSER TESTS
// ============================================================================
import {
  parseCodeOwners,
  diffCodeOwners,
  isCodeOwnersFile,
  createOwnershipDriftSignal as createCodeownersOwnershipDriftSignal,
} from '../services/signals/codeownersParser.js';

describe('CODEOWNERS Parser', () => {
  describe('isCodeOwnersFile', () => {
    it('should recognize CODEOWNERS in root', () => {
      expect(isCodeOwnersFile('CODEOWNERS')).toBe(true);
    });

    it('should recognize CODEOWNERS in .github folder', () => {
      expect(isCodeOwnersFile('.github/CODEOWNERS')).toBe(true);
    });

    it('should recognize CODEOWNERS in docs folder', () => {
      expect(isCodeOwnersFile('docs/CODEOWNERS')).toBe(true);
    });

    it('should not match other files', () => {
      expect(isCodeOwnersFile('README.md')).toBe(false);
      expect(isCodeOwnersFile('src/codeowners.ts')).toBe(false);
    });
  });

  describe('parseCodeOwners', () => {
    it('should parse simple CODEOWNERS file', () => {
      const content = `# Global owners
* @global-team

# Frontend
/src/frontend/ @frontend-team
*.tsx @frontend-team @design-team

# Backend
/src/api/ @backend-team
`;
      const result = parseCodeOwners(content);

      expect(result.rules.length).toBe(4);
      expect(result.globalOwners).toEqual(['@global-team']);
      expect(result.errors.length).toBe(0);
    });

    it('should handle empty lines and comments', () => {
      const content = `# Comment line
* @owner

# Another comment

/path/ @team
`;
      const result = parseCodeOwners(content);
      expect(result.rules.length).toBe(2);
    });

    it('should extract multiple owners per rule', () => {
      const content = `/src/ @team-a @team-b user@example.com`;
      const result = parseCodeOwners(content);

      expect(result.rules[0]?.owners).toContain('@team-a');
      expect(result.rules[0]?.owners).toContain('@team-b');
      expect(result.rules[0]?.owners).toContain('user@example.com');
    });

    it('should handle patterns without owners (clears ownership)', () => {
      const content = `/vendor/`;
      const result = parseCodeOwners(content);

      expect(result.rules.length).toBe(1);
      expect(result.rules[0]?.owners).toEqual([]);
    });
  });

  describe('diffCodeOwners', () => {
    it('should detect added rules', () => {
      const oldContent = `* @global-team`;
      const newContent = `* @global-team
/src/new/ @new-team`;

      const diff = diffCodeOwners(oldContent, newContent);

      expect(diff.hasOwnershipDrift).toBe(true);
      expect(diff.changes.some(c => c.type === 'added')).toBe(true);
    });

    it('should detect removed rules', () => {
      const oldContent = `* @global-team
/src/old/ @old-team`;
      const newContent = `* @global-team`;

      const diff = diffCodeOwners(oldContent, newContent);

      expect(diff.hasOwnershipDrift).toBe(true);
      expect(diff.changes.some(c => c.type === 'removed')).toBe(true);
    });

    it('should detect modified owners', () => {
      const oldContent = `/src/ @team-a`;
      const newContent = `/src/ @team-b`;

      const diff = diffCodeOwners(oldContent, newContent);

      expect(diff.hasOwnershipDrift).toBe(true);
      expect(diff.changes.some(c => c.type === 'modified')).toBe(true);
    });

    it('should handle null content (new or deleted file)', () => {
      const diff1 = diffCodeOwners(null, `* @team`);
      expect(diff1.hasOwnershipDrift).toBe(true);

      const diff2 = diffCodeOwners(`* @team`, null);
      expect(diff2.hasOwnershipDrift).toBe(true);
    });

    it('should return no drift for identical content', () => {
      const content = `* @team
/src/ @other-team`;

      const diff = diffCodeOwners(content, content);
      expect(diff.hasOwnershipDrift).toBe(false);
    });
  });

  describe('createOwnershipDriftSignal', () => {
    it('should create signal from diff with changes', () => {
      const diff = diffCodeOwners(`* @old-team`, `* @new-team`);
      const signal = createCodeownersOwnershipDriftSignal(diff, 'owner/repo', 123);

      expect(signal).not.toBeNull();
      expect(signal?.driftType).toBe('ownership');
      expect(signal?.confidence).toBeGreaterThan(0);
    });

    it('should return null for no drift', () => {
      const diff = diffCodeOwners(`* @team`, `* @team`);
      const signal = createCodeownersOwnershipDriftSignal(diff, 'owner/repo', 123);

      expect(signal).toBeNull();
    });
  });
});

// ============================================================================
// FEATURE FLAGS TESTS
// ============================================================================
import {
  isFeatureEnabled,
  getFeatureFlags,
  getAllFeatureFlags,
  FEATURE_FLAGS,
} from '../config/featureFlags.js';

describe('Feature Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isFeatureEnabled', () => {
    it('should return default value when no override', () => {
      // Phase 1 flags are enabled by default
      expect(isFeatureEnabled('ENABLE_README_ADAPTER')).toBe(true);
      expect(isFeatureEnabled('ENABLE_CODEOWNERS_DETECTION')).toBe(true);

      // Phase 2 & 3 flags are now enabled by default
      expect(isFeatureEnabled('ENABLE_SWAGGER_ADAPTER')).toBe(true);
      expect(isFeatureEnabled('ENABLE_BACKSTAGE_ADAPTER')).toBe(true);
      expect(isFeatureEnabled('ENABLE_PAGERDUTY_WEBHOOK')).toBe(true);
      expect(isFeatureEnabled('ENABLE_PROCESS_DRIFT')).toBe(true);
      expect(isFeatureEnabled('ENABLE_ONCALL_OWNERSHIP')).toBe(true);

      // Phase 4 flags are now enabled
      expect(isFeatureEnabled('ENABLE_SLACK_CLUSTERING')).toBe(true);
      expect(isFeatureEnabled('ENABLE_COVERAGE_DRIFT')).toBe(true);
    });

    it('should respect environment variable override', () => {
      process.env.FF_ENABLE_SWAGGER_ADAPTER = 'true';
      expect(isFeatureEnabled('ENABLE_SWAGGER_ADAPTER')).toBe(true);

      process.env.FF_ENABLE_README_ADAPTER = 'false';
      expect(isFeatureEnabled('ENABLE_README_ADAPTER')).toBe(false);
    });

    it('should handle case-insensitive env values', () => {
      process.env.FF_ENABLE_SWAGGER_ADAPTER = 'TRUE';
      expect(isFeatureEnabled('ENABLE_SWAGGER_ADAPTER')).toBe(true);

      process.env.FF_ENABLE_SWAGGER_ADAPTER = 'True';
      expect(isFeatureEnabled('ENABLE_SWAGGER_ADAPTER')).toBe(true);
    });
  });

  describe('getFeatureFlags', () => {
    it('should return multiple flags at once', () => {
      const flags = getFeatureFlags([
        'ENABLE_README_ADAPTER',
        'ENABLE_SWAGGER_ADAPTER',
        'ENABLE_SLACK_CLUSTERING',
      ]);

      expect(flags.ENABLE_README_ADAPTER).toBe(true);
      expect(flags.ENABLE_SWAGGER_ADAPTER).toBe(true);
      expect(flags.ENABLE_SLACK_CLUSTERING).toBe(true); // Phase 4 now enabled
    });
  });

  describe('getAllFeatureFlags', () => {
    it('should return all flags', () => {
      const allFlags = getAllFeatureFlags();

      expect(Object.keys(allFlags).length).toBe(Object.keys(FEATURE_FLAGS).length);
      expect('ENABLE_README_ADAPTER' in allFlags).toBe(true);
      expect('ENABLE_PAGERDUTY_WEBHOOK' in allFlags).toBe(true);
    });
  });
});

// ============================================================================
// ADAPTER TYPES TESTS
// ============================================================================
import {
  DOC_CATEGORIES,
  DOC_SYSTEMS,
  type DocCategory,
  type DocSystem,
} from '../services/docs/adapters/types.js';

describe('Adapter Types', () => {
  describe('DOC_CATEGORIES', () => {
    it('should have all expected categories', () => {
      expect(DOC_CATEGORIES).toContain('functional');
      expect(DOC_CATEGORIES).toContain('developer');
      expect(DOC_CATEGORIES).toContain('operational');
      expect(DOC_CATEGORIES.length).toBe(3);
    });
  });

  describe('DOC_SYSTEMS', () => {
    it('should have all expected systems', () => {
      expect(DOC_SYSTEMS).toContain('confluence');
      expect(DOC_SYSTEMS).toContain('notion');
      expect(DOC_SYSTEMS).toContain('github_readme');
      expect(DOC_SYSTEMS).toContain('github_swagger');
      expect(DOC_SYSTEMS).toContain('backstage');
      // Phase 5: Code Comments and GitBook
      expect(DOC_SYSTEMS).toContain('github_code_comments');
      expect(DOC_SYSTEMS).toContain('gitbook');
      expect(DOC_SYSTEMS.length).toBe(7);
    });
  });
});

// ============================================================================
// DOC RESOLUTION CATEGORY MAPPING TESTS
// ============================================================================
import {
  getDocCategoriesForDriftTypes,
  DRIFT_TYPE_TO_DOC_CATEGORY,
} from '../services/docs/docResolution.js';

describe('Doc Resolution - Category Mapping', () => {
  describe('DRIFT_TYPE_TO_DOC_CATEGORY', () => {
    it('should map instruction drift to developer and functional', () => {
      expect(DRIFT_TYPE_TO_DOC_CATEGORY.instruction).toContain('developer');
      expect(DRIFT_TYPE_TO_DOC_CATEGORY.instruction).toContain('functional');
    });

    it('should map process drift to functional and operational', () => {
      expect(DRIFT_TYPE_TO_DOC_CATEGORY.process).toContain('functional');
      expect(DRIFT_TYPE_TO_DOC_CATEGORY.process).toContain('operational');
    });

    it('should map ownership drift to functional and operational', () => {
      expect(DRIFT_TYPE_TO_DOC_CATEGORY.ownership).toContain('functional');
      expect(DRIFT_TYPE_TO_DOC_CATEGORY.ownership).toContain('operational');
    });
  });

  describe('getDocCategoriesForDriftTypes', () => {
    it('should return all categories when no drift types provided', () => {
      const categories = getDocCategoriesForDriftTypes(undefined);
      expect(categories).toContain('functional');
      expect(categories).toContain('developer');
      expect(categories).toContain('operational');
    });

    it('should return all categories for empty array', () => {
      const categories = getDocCategoriesForDriftTypes([]);
      expect(categories.length).toBe(3);
    });

    it('should return developer first for instruction drift', () => {
      const categories = getDocCategoriesForDriftTypes(['instruction']);
      expect(categories[0]).toBe('developer');
    });

    it('should combine categories for multiple drift types', () => {
      const categories = getDocCategoriesForDriftTypes(['instruction', 'process']);
      expect(categories).toContain('developer');
      expect(categories).toContain('functional');
      expect(categories).toContain('operational');
    });
  });
});

// ============================================================================
// ADAPTER REGISTRY TESTS
// ============================================================================
import { getDefaultCategory } from '../services/docs/adapters/registry.js';

describe('Adapter Registry', () => {
  describe('getDefaultCategory', () => {
    it('should return functional for confluence', () => {
      expect(getDefaultCategory('confluence')).toBe('functional');
    });

    it('should return functional for notion', () => {
      expect(getDefaultCategory('notion')).toBe('functional');
    });

    it('should return developer for github_readme', () => {
      expect(getDefaultCategory('github_readme')).toBe('developer');
    });

    it('should return developer for github_swagger', () => {
      expect(getDefaultCategory('github_swagger')).toBe('developer');
    });

    it('should return operational for backstage', () => {
      expect(getDefaultCategory('backstage')).toBe('operational');
    });
  });
});

// ============================================================================
// README ADAPTER TESTS (Unit tests - mocked GitHub API)
// ============================================================================
import { createReadmeAdapter } from '../services/docs/adapters/readmeAdapter.js';

describe('README Adapter', () => {
  describe('createReadmeAdapter', () => {
    it('should create adapter with correct system and category', () => {
      const adapter = createReadmeAdapter({
        installationId: 12345,
      });

      expect(adapter.system).toBe('github_readme');
      expect(adapter.category).toBe('developer');
    });

    it('should not support direct writeback', () => {
      const adapter = createReadmeAdapter({
        installationId: 12345,
      });

      expect(adapter.supportsDirectWriteback()).toBe(false);
    });

    it('should generate correct doc URL', () => {
      const adapter = createReadmeAdapter({
        installationId: 12345,
      });

      // owner/repo come from DocRef, not config
      const url = adapter.getDocUrl({
        docId: 'readme',
        docSystem: 'github_readme',
        owner: 'test-owner',
        repo: 'test-repo',
        filePath: 'README.md',
      });

      expect(url).toContain('github.com');
      expect(url).toContain('test-owner');
      expect(url).toContain('test-repo');
    });
  });
});

// ============================================================================
// NOTION ADAPTER TESTS (Unit tests)
// ============================================================================
import { createNotionAdapter } from '../services/docs/adapters/notionAdapter.js';

// ============================================================================
// BACKSTAGE ADAPTER TESTS (Phase 2)
// ============================================================================
import { createBackstageAdapter } from '../services/docs/adapters/backstageAdapter.js';

// ============================================================================
// PAGERDUTY NORMALIZER TESTS (Phase 3)
// ============================================================================
import {
  normalizeIncident,
  isSignificantIncident,
  createProcessDriftSignal,
  createOwnershipDriftSignal,
  type PagerDutyIncident,
  type NormalizedIncident,
} from '../services/signals/pagerdutyNormalizer.js';

// ============================================================================
// OPENAPI PARSER TESTS (Phase 2)
// ============================================================================
import {
  parseOpenApiSpec,
  isOpenApiFile,
  isValidOpenApiSpec,
  diffOpenApiSpecs,
  createApiDriftSignal,
} from '../services/signals/openApiParser.js';

describe('OpenAPI Parser', () => {
  describe('isOpenApiFile', () => {
    it('should recognize openapi.yaml', () => {
      expect(isOpenApiFile('openapi.yaml')).toBe(true);
      expect(isOpenApiFile('openapi.yml')).toBe(true);
      expect(isOpenApiFile('openapi.json')).toBe(true);
    });

    it('should recognize swagger files', () => {
      expect(isOpenApiFile('swagger.yaml')).toBe(true);
      expect(isOpenApiFile('swagger.yml')).toBe(true);
      expect(isOpenApiFile('swagger.json')).toBe(true);
    });

    it('should recognize api spec files in paths', () => {
      expect(isOpenApiFile('docs/openapi.yaml')).toBe(true);
      expect(isOpenApiFile('api/swagger.json')).toBe(true);
    });

    it('should not match non-spec files', () => {
      expect(isOpenApiFile('README.md')).toBe(false);
      expect(isOpenApiFile('package.json')).toBe(false);
      expect(isOpenApiFile('config.yaml')).toBe(false);
    });
  });

  describe('parseOpenApiSpec', () => {
    it('should parse JSON OpenAPI spec', () => {
      const spec = parseOpenApiSpec(JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: { '/users': { get: { summary: 'Get users' } } },
      }));

      expect(spec).not.toBeNull();
      expect(spec?.openapi).toBe('3.0.0');
      expect(spec?.info?.title).toBe('Test API');
    });

    it('should validate spec structure', () => {
      const validSpec = parseOpenApiSpec(JSON.stringify({
        openapi: '3.0.0',
        paths: {},
      }));
      expect(isValidOpenApiSpec(validSpec)).toBe(true);

      const invalidSpec = parseOpenApiSpec(JSON.stringify({ foo: 'bar' }));
      expect(isValidOpenApiSpec(invalidSpec)).toBe(false);
    });
  });

  describe('diffOpenApiSpecs', () => {
    const baseSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': { get: { summary: 'Get users' } },
        '/posts': { get: { summary: 'Get posts' } },
      },
    });

    it('should detect added endpoints', () => {
      const newSpec = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.1.0' },
        paths: {
          '/users': { get: { summary: 'Get users' } },
          '/posts': { get: { summary: 'Get posts' } },
          '/comments': { get: { summary: 'Get comments' } },
        },
      });

      const diff = diffOpenApiSpecs(baseSpec, newSpec);
      expect(diff.addedEndpoints).toBe(1);
      expect(diff.removedEndpoints).toBe(0);
      expect(diff.hasBreakingChanges).toBe(false);
    });

    it('should detect removed endpoints as breaking', () => {
      const newSpec = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '2.0.0' },
        paths: {
          '/users': { get: { summary: 'Get users' } },
        },
      });

      const diff = diffOpenApiSpecs(baseSpec, newSpec);
      expect(diff.removedEndpoints).toBe(1);
      expect(diff.hasBreakingChanges).toBe(true);
    });

    it('should detect modified endpoints', () => {
      const newSpec = JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.1' },
        paths: {
          '/users': { get: { summary: 'List all users' } },
          '/posts': { get: { summary: 'Get posts' } },
        },
      });

      const diff = diffOpenApiSpecs(baseSpec, newSpec);
      expect(diff.modifiedEndpoints).toBe(1);
    });

    it('should handle null old spec (new file)', () => {
      const diff = diffOpenApiSpecs(null, baseSpec);
      expect(diff.addedEndpoints).toBe(2);
      expect(diff.hasBreakingChanges).toBe(false);
    });

    it('should handle null new spec (deleted file)', () => {
      const diff = diffOpenApiSpecs(baseSpec, null);
      expect(diff.removedEndpoints).toBe(2);
      expect(diff.hasBreakingChanges).toBe(true);
    });
  });

  describe('createApiDriftSignal', () => {
    it('should create signal from diff with changes', () => {
      const diff = diffOpenApiSpecs(
        JSON.stringify({ openapi: '3.0.0', paths: {} }),
        JSON.stringify({
          openapi: '3.0.0',
          paths: { '/new': { get: { summary: 'New endpoint' } } },
        })
      );

      const signal = createApiDriftSignal(diff, 'owner/repo', 42);
      expect(signal).not.toBeNull();
      expect(signal?.driftType).toBe('instruction');
      expect(signal?.driftDomains).toContain('api');
    });

    it('should return null for no changes', () => {
      const spec = JSON.stringify({ openapi: '3.0.0', paths: {} });
      const diff = diffOpenApiSpecs(spec, spec);
      const signal = createApiDriftSignal(diff, 'owner/repo', 42);
      expect(signal).toBeNull();
    });
  });
});

describe('Notion Adapter', () => {
  describe('createNotionAdapter', () => {
    it('should create adapter with correct system and category', () => {
      const adapter = createNotionAdapter('test-token');

      expect(adapter.system).toBe('notion');
      expect(adapter.category).toBe('functional');
    });

    it('should support direct writeback', () => {
      const adapter = createNotionAdapter('test-token');
      expect(adapter.supportsDirectWriteback()).toBe(true);
    });

    it('should generate correct doc URL', () => {
      const adapter = createNotionAdapter('test-token');

      const url = adapter.getDocUrl({
        docId: 'abc123def456',
        docSystem: 'notion',
      });

      expect(url).toContain('notion.so');
    });

    it('should use provided docUrl if available', () => {
      const adapter = createNotionAdapter('test-token');

      const url = adapter.getDocUrl({
        docId: 'abc123',
        docSystem: 'notion',
        docUrl: 'https://custom.notion.site/page',
      });

      expect(url).toBe('https://custom.notion.site/page');
    });
  });

  // =========================================================================
  // Backstage Adapter (Phase 2)
  // =========================================================================
  describe('Backstage Adapter', () => {
    it('should create adapter with correct system and category', () => {
      const adapter = createBackstageAdapter({
        installationId: 12345,
        owner: 'test-org',
        repo: 'test-repo',
      });

      expect(adapter.system).toBe('backstage');
      expect(adapter.category).toBe('operational');
    });

    it('should not support direct writeback', () => {
      const adapter = createBackstageAdapter({
        installationId: 12345,
        owner: 'test-org',
        repo: 'test-repo',
      });
      expect(adapter.supportsDirectWriteback()).toBe(false);
    });

    it('should generate correct doc URL', () => {
      const adapter = createBackstageAdapter({
        installationId: 12345,
        owner: 'test-org',
        repo: 'test-repo',
      });

      const url = adapter.getDocUrl({
        docId: 'catalog-info.yaml',
        docSystem: 'backstage',
      });

      expect(url).toContain('github.com');
      expect(url).toContain('test-org');
      expect(url).toContain('test-repo');
      expect(url).toContain('catalog-info.yaml');
    });

    it('should use custom file path', () => {
      const adapter = createBackstageAdapter({
        installationId: 12345,
        owner: 'test-org',
        repo: 'test-repo',
        filePath: 'services/api/catalog-info.yml',
      });

      const url = adapter.getDocUrl({
        docId: 'catalog-info.yml',
        docSystem: 'backstage',
      });

      expect(url).toContain('services/api/catalog-info.yml');
    });
  });
});

// =============================================================================
// PagerDuty Normalizer (Phase 3)
// =============================================================================
describe('PagerDuty Normalizer', () => {
  // Imports are at the top of the file

  describe('normalizeIncident', () => {
    const mockIncident = {
      id: 'PABC123',
      incident_number: 42,
      title: 'High CPU on payment-service',
      description: 'Payment service experiencing high CPU usage',
      status: 'resolved',
      urgency: 'high',
      service: { id: 'svc1', summary: 'Payment Service' },
      created_at: '2024-01-15T10:00:00Z',
      resolved_at: '2024-01-15T11:30:00Z',
      updated_at: '2024-01-15T11:30:00Z',
      assignments: [
        { at: '2024-01-15T10:05:00Z', assignee: { id: 'user1', summary: 'Jane Doe', email: 'jane@example.com' } },
        { at: '2024-01-15T10:30:00Z', assignee: { id: 'user2', summary: 'John Smith' } },
      ],
      acknowledgements: [
        { at: '2024-01-15T10:05:00Z', acknowledger: { id: 'user1', summary: 'Jane Doe' } },
      ],
      last_status_change_at: '2024-01-15T11:30:00Z',
      escalation_policy: { id: 'ep1', summary: 'Payment On-Call' },
      teams: [{ id: 'team1', summary: 'Payment Team' }],
      priority: { id: 'p1', summary: 'P1' },
      html_url: 'https://pagerduty.com/incidents/PABC123',
      resolved_by: { id: 'user1', summary: 'Jane Doe' },
      notes: [{ content: 'Restarted the service', created_at: '2024-01-15T10:45:00Z', user: { summary: 'Jane Doe' } }],
    };

    it('should normalize incident correctly', () => {
      const normalized = normalizeIncident(mockIncident, 'workspace-1');

      expect(normalized.id).toBe('pagerduty_incident_PABC123');
      expect(normalized.sourceType).toBe('pagerduty_incident');
      expect(normalized.service).toBe('payment-service');
      expect(normalized.severity).toBe('sev1'); // High urgency with P1
      expect(normalized.extracted.title).toBe('High CPU on payment-service');
    });

    it('should extract responders', () => {
      const normalized = normalizeIncident(mockIncident, 'workspace-1');

      expect(normalized.responders).toContain('jane@example.com');
      expect(normalized.responders).toContain('John Smith');
    });

    it('should build timeline', () => {
      const normalized = normalizeIncident(mockIncident, 'workspace-1');

      expect(normalized.extracted.timeline.length).toBeGreaterThan(0);
      const firstEvent = normalized.extracted.timeline[0];
      expect(firstEvent?.event).toBe('created');
    });

    it('should detect drift type hints', () => {
      const normalized = normalizeIncident(mockIncident, 'workspace-1');

      // Multiple responders + notes should suggest process drift
      expect(normalized.extracted.driftTypeHints).toContain('process');
    });

    it('should extract keywords', () => {
      const normalized = normalizeIncident(mockIncident, 'workspace-1');

      expect(normalized.extracted.keywords.length).toBeGreaterThan(0);
      // Should extract meaningful keywords from title/description
      expect(normalized.extracted.keywords.some(k => k.includes('payment') || k.includes('service'))).toBe(true);
    });
  });

  describe('isSignificantIncident', () => {
    // Helper to create a minimal incident for testing significance checks
    const createMinimalIncident = (overrides: Partial<PagerDutyIncident>): PagerDutyIncident => ({
      id: 'test1',
      incident_number: 1,
      title: 'Test Incident',
      status: 'resolved',
      urgency: 'low',
      service: { id: 'svc1', summary: 'Test Service' },
      created_at: '2024-01-15T10:00:00Z',
      assignments: [],
      acknowledgements: [],
      last_status_change_at: '2024-01-15T10:00:00Z',
      escalation_policy: { id: 'ep1', summary: 'Test Policy' },
      teams: [],
      html_url: 'https://pagerduty.com/incidents/test1',
      ...overrides,
    });

    it('should return true for high urgency resolved incidents', () => {
      const incident = createMinimalIncident({
        status: 'resolved',
        urgency: 'high',
        resolved_at: '2024-01-15T10:30:00Z',
      });
      expect(isSignificantIncident(incident)).toBe(true);
    });

    it('should return false for unresolved incidents', () => {
      const incident = createMinimalIncident({
        status: 'triggered',
        urgency: 'high',
      });
      expect(isSignificantIncident(incident)).toBe(false);
    });

    it('should return true for incidents with notes', () => {
      const incident = createMinimalIncident({
        status: 'resolved',
        urgency: 'low',
        resolved_at: '2024-01-15T10:30:00Z',
        notes: [{ content: 'Fixed by restarting', created_at: '2024-01-15T10:15:00Z', user: { summary: 'User' } }],
      });
      expect(isSignificantIncident(incident)).toBe(true);
    });

    it('should return true for long-running incidents', () => {
      const incident = createMinimalIncident({
        status: 'resolved',
        urgency: 'low',
        resolved_at: '2024-01-15T11:00:00Z', // 60 minutes
      });
      expect(isSignificantIncident(incident)).toBe(true);
    });
  });

  describe('createProcessDriftSignal', () => {
    // Helper to create minimal NormalizedIncident for testing
    const createMinimalNormalizedIncident = (overrides: Partial<NormalizedIncident>): NormalizedIncident => ({
      id: 'pagerduty_incident_test',
      sourceType: 'pagerduty_incident',
      occurredAt: new Date('2024-01-15T10:00:00Z'),
      service: 'payment-service',
      severity: 'sev2',
      extracted: {
        title: 'Test Incident',
        summary: 'Test incident summary',
        keywords: ['test'],
        responders: [],
        timeline: [],
        escalationPolicy: 'Test Policy',
        teams: [],
        driftTypeHints: [],
        ...overrides.extracted,
      },
      rawPayload: {},
      incidentId: 'test',
      incidentUrl: 'https://pagerduty.com/incidents/test',
      responders: [],
      ...overrides,
    } as NormalizedIncident);

    it('should create signal for incident with notes', () => {
      const normalized = createMinimalNormalizedIncident({
        extracted: {
          title: 'Test Incident',
          summary: 'Test incident summary',
          keywords: ['test'],
          responders: [],
          escalationPolicy: 'Test Policy',
          teams: [],
          driftTypeHints: [],
          timeline: [
            { event: 'created', at: '2024-01-15T10:00:00Z' },
            { event: 'acknowledged', at: '2024-01-15T10:05:00Z', by: 'User 1' },
            { event: 'note', at: '2024-01-15T10:15:00Z', by: 'User 1', details: 'Restarted service' },
            { event: 'resolved', at: '2024-01-15T10:30:00Z', by: 'User 1' },
          ],
          notes: ['Restarted service'],
          processDriftEvidence: 'Steps taken to resolve',
        },
      });

      const signal = createProcessDriftSignal(normalized, 'test-org/test-repo');

      expect(signal).not.toBeNull();
      expect(signal?.driftType).toBe('process');
      expect(signal?.driftDomains).toContain('runbook');
      expect(signal?.confidence).toBeGreaterThan(0.5);
    });

    it('should return null for simple incidents', () => {
      const normalized = createMinimalNormalizedIncident({
        extracted: {
          title: 'Test Incident',
          summary: 'Test incident summary',
          keywords: ['test'],
          responders: [],
          escalationPolicy: 'Test Policy',
          teams: [],
          driftTypeHints: [],
          timeline: [
            { event: 'created', at: '2024-01-15T10:00:00Z' },
            { event: 'resolved', at: '2024-01-15T10:05:00Z' },
          ],
        },
      });

      const signal = createProcessDriftSignal(normalized, 'test-org/test-repo');
      expect(signal).toBeNull();
    });
  });

  describe('createOwnershipDriftSignal', () => {
    // Helper to create minimal NormalizedIncident for testing
    const createMinimalNormalizedIncident = (overrides: Partial<NormalizedIncident>): NormalizedIncident => ({
      id: 'pagerduty_incident_test',
      sourceType: 'pagerduty_incident',
      occurredAt: new Date('2024-01-15T10:00:00Z'),
      service: 'payment-service',
      severity: 'sev2',
      extracted: {
        title: 'Test Incident',
        summary: 'Test incident summary',
        keywords: ['test'],
        responders: [],
        timeline: [],
        escalationPolicy: 'Test Policy',
        teams: [],
        driftTypeHints: [],
        ...overrides.extracted,
      },
      rawPayload: {},
      incidentId: 'test',
      incidentUrl: 'https://pagerduty.com/incidents/test',
      responders: [],
      ...overrides,
    } as NormalizedIncident);

    it('should create signal for multiple responders', () => {
      const normalized = createMinimalNormalizedIncident({
        responders: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        extracted: {
          title: 'Test Incident',
          summary: 'Test incident summary',
          keywords: ['test'],
          responders: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
          timeline: [],
          escalationPolicy: 'Test Policy',
          teams: [],
          driftTypeHints: [],
          ownershipDriftEvidence: 'Multiple responders involved',
        },
      });

      const signal = createOwnershipDriftSignal(normalized);

      expect(signal).not.toBeNull();
      expect(signal?.driftType).toBe('ownership');
      expect(signal?.driftDomains).toContain('service-ownership');
    });

    it('should return null for single responder', () => {
      const normalized = createMinimalNormalizedIncident({
        responders: ['user1@example.com'],
      });

      const signal = createOwnershipDriftSignal(normalized);
      expect(signal).toBeNull();
    });

    it('should flag when documented owner not in responders', () => {
      const normalized = createMinimalNormalizedIncident({
        responders: ['random1@example.com', 'random2@example.com'],
      });

      const signal = createOwnershipDriftSignal(normalized, 'documented-owner@example.com');

      expect(signal).not.toBeNull();
      expect(signal?.confidence).toBeGreaterThan(0.8); // High confidence when documented owner missing
    });
  });
});

