import { describe, it, expect } from 'vitest';
import { TerraformRunbookComparator } from '../../services/contracts/comparators/terraform';
import type { ComparatorInput, Invariant, ArtifactSnapshot } from '../../services/contracts/types';

describe('TerraformRunbookComparator', () => {
  const comparator = new TerraformRunbookComparator();

  const createMockInvariant = (comparatorType: string): Invariant => ({
    invariantId: 'inv-123',
    comparatorType,
    description: 'Test invariant',
    enabled: true,
    config: {},
  });

  const createMockSnapshot = (
    artifactType: string,
    content: string
  ): ArtifactSnapshot => ({
    workspaceId: 'ws-123',
    id: `snap-${artifactType}-123`,
    artifactId: `artifact-${artifactType}-123`,
    contractId: 'contract-123',
    artifactType: artifactType as any,
    artifactRef: { type: 'github_file', value: 'test.tf' },
    version: { type: 'git_sha', value: 'abc123', capturedAt: new Date().toISOString() },
    extract: content, // Store content in extract field
    extractSchema: 'raw_text',
    triggeredBy: { signalEventId: 'signal-123' },
    ttlDays: 1,
    compressed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createMockInput = (
    terraformContent: string,
    runbookContent: string
  ): ComparatorInput => ({
    invariant: createMockInvariant('terraform_runbook_parity'),
    leftSnapshot: createMockSnapshot('iac_terraform', terraformContent),
    rightSnapshot: createMockSnapshot('confluence_page', runbookContent),
    context: {
      workspaceId: 'ws-123',
      contractId: 'contract-123',
      signalEventId: 'signal-123',
      service: 'test-service',
      repo: 'test-repo',
    },
  });

  describe('canCompare', () => {
    it('should return true for terraform + runbook with correct comparator type', () => {
      const invariant = createMockInvariant('terraform_runbook_parity');
      const snapshots = [
        createMockSnapshot('iac_terraform', ''),
        createMockSnapshot('confluence_page', ''),
      ];

      expect(comparator.canCompare(invariant, snapshots)).toBe(true);
    });

    it('should return false for wrong comparator type', () => {
      const invariant = createMockInvariant('openapi_docs_endpoint_parity');
      const snapshots = [
        createMockSnapshot('iac_terraform', ''),
        createMockSnapshot('confluence_page', ''),
      ];

      expect(comparator.canCompare(invariant, snapshots)).toBe(false);
    });

    it('should return false if terraform is missing', () => {
      const invariant = createMockInvariant('terraform_runbook_parity');
      const snapshots = [
        createMockSnapshot('confluence_page', ''),
        createMockSnapshot('readme', ''),
      ];

      expect(comparator.canCompare(invariant, snapshots)).toBe(false);
    });

    it('should return false if runbook is missing', () => {
      const invariant = createMockInvariant('terraform_runbook_parity');
      const snapshots = [
        createMockSnapshot('terraform', ''),
        createMockSnapshot('openapi', ''),
      ];

      expect(comparator.canCompare(invariant, snapshots)).toBe(false);
    });
  });

  describe('Resource Parity Detection', () => {
    it('should detect missing resources (in Terraform but not in runbook)', async () => {
      const terraformContent = `
resource "aws_instance" "web" {
  ami           = "ami-123456"
  instance_type = "t2.micro"
}

resource "aws_db_instance" "main" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
}
`;

      const runbookContent = `
## Resources

- aws_instance.web: Web server instance
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      expect(result.evaluated).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);

      const missingResource = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'resource_missing')
      );
      expect(missingResource).toBeDefined();
      expect(missingResource?.severity).toBe('critical'); // Database is critical

      // Check evidence contains the missing resource
      const evidence = missingResource?.evidence.find(e => e.kind === 'resource_missing');
      expect(evidence?.leftValue).toBeDefined();
      expect((evidence?.leftValue as any)?.type).toContain('aws_db_instance');
    });

    it('should detect deprecated resources (in runbook but not in Terraform)', async () => {
      const terraformContent = `
resource "aws_instance" "web" {
  ami           = "ami-123456"
  instance_type = "t2.micro"
}
`;

      const runbookContent = `
## Resources

- aws_instance.web: Web server instance
- aws_instance.old_worker: Legacy worker instance (deprecated)
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      expect(result.evaluated).toBe(true);
      const deprecatedResource = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'resource_deprecated')
      );
      expect(deprecatedResource).toBeDefined();
      expect(deprecatedResource?.severity).toBe('medium');

      // Check evidence contains the deprecated resource
      const evidence = deprecatedResource?.evidence.find(e => e.kind === 'resource_deprecated');
      expect((evidence?.rightValue as any)?.name).toContain('old_worker');
    });

    it('should assign correct severity based on resource type', async () => {
      const terraformContent = `
resource "aws_db_instance" "database" {
  engine = "postgres"
}

resource "aws_s3_bucket" "assets" {
  bucket = "my-assets"
}
`;

      const runbookContent = `
## Resources
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      const dbFinding = result.findings.find(f =>
        f.evidence.some(e => (e.leftValue as any)?.type?.includes('aws_db_instance'))
      );
      const s3Finding = result.findings.find(f =>
        f.evidence.some(e => (e.leftValue as any)?.type?.includes('aws_s3_bucket'))
      );

      expect(dbFinding?.severity).toBe('critical'); // Database is critical
      expect(s3Finding?.severity).toBe('medium'); // S3 is medium
    });
  });

  describe('Variable Parity Detection', () => {
    it('should detect undocumented variables', async () => {
      const terraformContent = `
variable "database_url" {
  type        = string
  description = "Database connection string"
}

variable "api_key" {
  type = string
}

variable "region" {
  type    = string
  default = "us-east-1"
}
`;

      const runbookContent = `
## Variables

- database_url: Database connection string
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      const undocumentedVars = result.findings.filter(f =>
        f.evidence.some(e => e.kind === 'variable_undocumented')
      );
      expect(undocumentedVars.length).toBe(2); // api_key and region

      const apiKeyFinding = undocumentedVars.find(f =>
        f.evidence.some(e => (e.leftValue as any)?.name === 'api_key')
      );
      const regionFinding = undocumentedVars.find(f =>
        f.evidence.some(e => (e.leftValue as any)?.name === 'region')
      );

      expect(apiKeyFinding?.severity).toBe('high'); // No default = high severity
      expect(regionFinding?.severity).toBe('medium'); // Has default = medium severity
    });

    it('should not flag documented variables', async () => {
      const terraformContent = `
variable "database_url" {
  type        = string
  description = "Database connection string"
}
`;

      const runbookContent = `
## Variables

- database_url: Database connection string
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      const undocumentedVars = result.findings.filter(f =>
        f.evidence.some(e => e.kind === 'variable_undocumented')
      );
      expect(undocumentedVars.length).toBe(0);
    });
  });

  describe('Deployment Step Parity Detection', () => {
    it('should detect missing terraform commands in deployment steps', async () => {
      const terraformContent = `
output "api_endpoint" {
  value       = aws_instance.web.public_ip
  description = "API endpoint URL"
}
`;

      const runbookContent = `
## Deployment

1. Build the application
2. Run tests
3. Deploy to production
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      const missingStep = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'deployment_step_missing')
      );
      expect(missingStep).toBeDefined();
      expect(missingStep?.severity).toBe('high');
    });

    it('should not flag when terraform commands are present', async () => {
      const terraformContent = `
output "api_endpoint" {
  value = aws_instance.web.public_ip
}
`;

      const runbookContent = `
## Deployment

1. Run \`terraform plan\` to preview changes
2. Run \`terraform apply\` to deploy
3. Verify deployment
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      const missingStep = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'deployment_step_missing')
      );
      expect(missingStep).toBeUndefined();
    });

    it('should detect unreferenced outputs', async () => {
      const terraformContent = `
output "api_endpoint" {
  value       = aws_instance.web.public_ip
  description = "API endpoint URL"
}

output "database_url" {
  value       = aws_db_instance.main.endpoint
  description = "Database connection URL"
}
`;

      const runbookContent = `
## Deployment

1. Run \`terraform apply\`
2. Use the api_endpoint output to configure DNS
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      const unreferencedOutput = result.findings.find(f =>
        f.evidence.some(e =>
          e.kind === 'output_not_referenced' &&
          (e.leftValue as any)?.name === 'database_url'
        )
      );
      expect(unreferencedOutput).toBeDefined();
      expect(unreferencedOutput?.severity).toBe('medium');
    });
  });

  describe('Coverage Calculation', () => {
    it('should calculate coverage correctly', async () => {
      const terraformContent = `
resource "aws_instance" "web" {
  ami = "ami-123"
}

variable "region" {
  type = string
}

output "endpoint" {
  value = aws_instance.web.public_ip
}
`;

      const runbookContent = `
## Resources

- aws_instance.web: Web server

## Variables

- region: AWS region

## Deployment

1. Run \`terraform apply\`
2. Use endpoint output
`;

      const input = createMockInput(terraformContent, runbookContent);
      const result = await comparator.compare(input);

      expect(result.coverage).toBeDefined();
      expect(result.coverage.artifactsChecked).toBeDefined();
      expect(result.coverage.artifactsChecked.length).toBe(2); // terraform + runbook
      expect(result.coverage.artifactsSkipped).toBeDefined();
      expect(result.coverage.completeness).toBeGreaterThanOrEqual(0);
      expect(result.coverage.completeness).toBeLessThanOrEqual(1);
    });
  });
});
