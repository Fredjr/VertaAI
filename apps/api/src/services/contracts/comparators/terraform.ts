import { BaseComparator } from './base.js';
import { getComparatorRegistry } from './registry.js';
import type {
  ComparatorInput,
  IntegrityFinding,
  Invariant,
  ArtifactSnapshot,
} from '../types.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TerraformResource {
  type: string;
  name: string;
  config?: Record<string, any>;
}

interface TerraformVariable {
  name: string;
  type?: string;
  default?: any;
  description?: string;
}

interface TerraformOutput {
  name: string;
  value?: string;
  description?: string;
}

interface TerraformData {
  resources: TerraformResource[];
  variables: TerraformVariable[];
  outputs: TerraformOutput[];
}

interface RunbookResource {
  type: string;
  name: string;
  description?: string;
}

interface RunbookDeploymentStep {
  step: number;
  command?: string;
  description: string;
}

interface RunbookVariable {
  name: string;
  description?: string;
}

interface RunbookData {
  resources: RunbookResource[];
  deploymentSteps: RunbookDeploymentStep[];
  variables: RunbookVariable[];
}

// ============================================================================
// TERRAFORM ↔ RUNBOOK COMPARATOR
// ============================================================================

export class TerraformRunbookComparator extends BaseComparator {
  readonly comparatorType = 'terraform_runbook_parity';
  readonly supportedArtifactTypes = ['iac_terraform', 'confluence_page', 'notion_page', 'readme'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    const hasTerraform = snapshots.some(s => s.artifactType === 'iac_terraform');
    const hasRunbook = snapshots.some(s =>
      ['confluence_page', 'notion_page', 'readme'].includes(s.artifactType)
    );

    return hasTerraform && hasRunbook;
  }

  extractData(snapshot: ArtifactSnapshot): TerraformData | RunbookData {
    if (snapshot.artifactType === 'iac_terraform') {
      return this.extractTerraformData(snapshot);
    } else {
      return this.extractRunbookData(snapshot);
    }
  }

  async performComparison(
    left: TerraformData | RunbookData,
    right: TerraformData | RunbookData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Determine which is Terraform and which is Runbook
    const terraformData = 'outputs' in left ? left : right as TerraformData;
    const runbookData = 'deploymentSteps' in left ? left : right as RunbookData;

    // 1. Compare resources
    findings.push(...this.compareResources(terraformData.resources, runbookData.resources, input));

    // 2. Compare variables
    findings.push(...this.compareVariables(terraformData.variables, runbookData.variables, input));

    // 3. Compare deployment steps
    findings.push(...this.compareDeploymentSteps(terraformData.outputs, runbookData.deploymentSteps, input));

    return findings;
  }

  // ============================================================================
  // TERRAFORM DATA EXTRACTION
  // ============================================================================

  private extractTerraformData(snapshot: ArtifactSnapshot): TerraformData {
    // Try to get content from extract.content or extract itself
    const extract = snapshot.extract as any;
    const content = extract?.content || extract || '';

    return {
      resources: this.extractTerraformResources(content),
      variables: this.extractTerraformVariables(content),
      outputs: this.extractTerraformOutputs(content),
    };
  }

  private extractTerraformResources(content: string): TerraformResource[] {
    const resources: TerraformResource[] = [];
    const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{([^}]*)\}/gs;
    let match;

    while ((match = resourceRegex.exec(content)) !== null) {
      if (match[1] && match[2]) {
        resources.push({
          type: match[1],
          name: match[2],
          config: this.parseResourceConfig(match[3] || ''),
        });
      }
    }

    return resources;
  }

  private extractTerraformVariables(content: string): TerraformVariable[] {
    const variables: TerraformVariable[] = [];
    const variableRegex = /variable\s+"([^"]+)"\s*\{([^}]*)\}/gs;
    let match;

    while ((match = variableRegex.exec(content)) !== null) {
      if (match[1]) {
        const block = match[2] || '';
        const typeMatch = block.match(/type\s*=\s*([^\n]+)/);
        const defaultMatch = block.match(/default\s*=\s*([^\n]+)/);
        const descMatch = block.match(/description\s*=\s*"([^"]+)"/);

        variables.push({
          name: match[1],
          type: typeMatch && typeMatch[1] ? typeMatch[1].trim() : undefined,
          default: defaultMatch && defaultMatch[1] ? defaultMatch[1].trim() : undefined,
          description: descMatch && descMatch[1] ? descMatch[1] : undefined,
        });
      }
    }

    return variables;
  }

  private extractTerraformOutputs(content: string): TerraformOutput[] {
    const outputs: TerraformOutput[] = [];
    const outputRegex = /output\s+"([^"]+)"\s*\{([^}]*)\}/gs;
    let match;

    while ((match = outputRegex.exec(content)) !== null) {
      if (match[1]) {
        const block = match[2] || '';
        const valueMatch = block.match(/value\s*=\s*([^\n]+)/);
        const descMatch = block.match(/description\s*=\s*"([^"]+)"/);

        outputs.push({
          name: match[1],
          value: valueMatch && valueMatch[1] ? valueMatch[1].trim() : undefined,
          description: descMatch && descMatch[1] ? descMatch[1] : undefined,
        });
      }
    }

    return outputs;
  }

  private parseResourceConfig(configBlock: string): Record<string, any> {
    const config: Record<string, any> = {};

    // Extract key-value pairs (simplified parsing)
    const kvRegex = /(\w+)\s*=\s*"?([^"\n]+)"?/g;
    let match;

    while ((match = kvRegex.exec(configBlock)) !== null) {
      if (match[1] && match[2]) {
        config[match[1]] = match[2].trim();
      }
    }

    return config;
  }

  // ============================================================================
  // RUNBOOK DATA EXTRACTION
  // ============================================================================

  private extractRunbookData(snapshot: ArtifactSnapshot): RunbookData {
    // Try to get content from extract.content or extract itself
    const extract = snapshot.extract as any;
    const content = extract?.content || extract || '';

    return {
      resources: this.extractRunbookResources(content),
      deploymentSteps: this.extractRunbookDeploymentSteps(content),
      variables: this.extractRunbookVariables(content),
    };
  }

  private extractRunbookResources(content: string): RunbookResource[] {
    const resources: RunbookResource[] = [];

    // Look for resource mentions in markdown (e.g., "## Resources", "### aws_instance.web")
    const resourceSectionRegex = /##\s*(?:Resources|Infrastructure)[\s\S]*?(?=##|$)/gi;
    const sectionMatch = content.match(resourceSectionRegex);

    if (sectionMatch) {
      const section = sectionMatch[0];

      // Extract resource mentions (e.g., "- aws_instance.web: Web server")
      const resourceLineRegex = /[-*]\s*`?([a-z_]+\.[a-z_]+)`?:?\s*([^\n]+)/gi;
      let match;

      while ((match = resourceLineRegex.exec(section)) !== null) {
        if (match[1]) {
          const [type, name] = match[1].split('.');
          if (type && name) {
            resources.push({
              type,
              name,
              description: match[2] ? match[2].trim() : undefined,
            });
          }
        }
      }
    }

    return resources;
  }

  private extractRunbookDeploymentSteps(content: string): RunbookDeploymentStep[] {
    const steps: RunbookDeploymentStep[] = [];

    // Look for deployment/setup sections
    const deploymentSectionRegex = /##\s*(?:Deployment|Setup|Installation)[\s\S]*?(?=##|$)/gi;
    const sectionMatch = content.match(deploymentSectionRegex);

    if (sectionMatch) {
      const section = sectionMatch[0];

      // Extract numbered steps
      const stepRegex = /(?:^|\n)(\d+)\.\s+([^\n]+)/g;
      let match;

      while ((match = stepRegex.exec(section)) !== null) {
        if (match[1] && match[2]) {
          const stepText = match[2].trim();
          const commandMatch = stepText.match(/`([^`]+)`/);

          steps.push({
            step: parseInt(match[1], 10),
            command: commandMatch ? commandMatch[1] : undefined,
            description: stepText,
          });
        }
      }
    }

    return steps;
  }

  private extractRunbookVariables(content: string): RunbookVariable[] {
    const variables: RunbookVariable[] = [];

    // Look for variables/configuration sections
    const variableSectionRegex = /##\s*(?:Variables|Configuration|Environment)[\s\S]*?(?=##|$)/gi;
    const sectionMatch = content.match(variableSectionRegex);

    if (sectionMatch) {
      const section = sectionMatch[0];

      // Extract variable mentions (e.g., "- DATABASE_URL: Connection string")
      const varLineRegex = /[-*]\s*`?([A-Z_][A-Z0-9_]*)`?:?\s*([^\n]+)/gi;
      let match;

      while ((match = varLineRegex.exec(section)) !== null) {
        if (match[1]) {
          variables.push({
            name: match[1],
            description: match[2] ? match[2].trim() : undefined,
          });
        }
      }
    }

    return variables;
  }

  // ============================================================================
  // COMPARISON METHODS
  // ============================================================================

  private compareResources(
    terraformResources: TerraformResource[],
    runbookResources: RunbookResource[],
    input: ComparatorInput
  ): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Create lookup maps
    const runbookMap = new Map<string, RunbookResource>();
    runbookResources.forEach(r => {
      runbookMap.set(`${r.type}.${r.name}`, r);
    });

    const terraformMap = new Map<string, TerraformResource>();
    terraformResources.forEach(r => {
      terraformMap.set(`${r.type}.${r.name}`, r);
    });

    // Check for missing resources (in Terraform but not in runbook)
    for (const tfResource of terraformResources) {
      const key = `${tfResource.type}.${tfResource.name}`;
      if (!runbookMap.has(key)) {
        const evidence = [
          {
            kind: 'resource_missing',
            leftValue: { type: tfResource.type, name: tfResource.name, config: tfResource.config },
            rightValue: null,
            pointers: {
              left: `resource.${key}`,
              right: null,
            },
          },
        ];

        findings.push(
          this.createFinding({
            workspaceId: input.context.workspaceId,
            contractId: input.context.contractId,
            invariantId: input.invariant.invariantId,
            driftType: 'instruction',
            severity: this.getResourceSeverity(tfResource.type),
            compared: {
              left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
              right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
            },
            evidence,
            context: {
              service: input.context.service,
              repo: input.context.repo,
              signalEventId: input.context.signalEventId,
            },
          })
        );
      }
    }

    // Check for deprecated resources (in runbook but not in Terraform)
    for (const rbResource of runbookResources) {
      const key = `${rbResource.type}.${rbResource.name}`;
      if (!terraformMap.has(key)) {
        const evidence = [
          {
            kind: 'resource_deprecated',
            leftValue: null,
            rightValue: { type: rbResource.type, name: rbResource.name, description: rbResource.description },
            pointers: {
              left: null,
              right: `resource.${key}`,
            },
          },
        ];

        findings.push(
          this.createFinding({
            workspaceId: input.context.workspaceId,
            contractId: input.context.contractId,
            invariantId: input.invariant.invariantId,
            driftType: 'instruction',
            severity: 'medium',
            compared: {
              left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
              right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
            },
            evidence,
            context: {
              service: input.context.service,
              repo: input.context.repo,
              signalEventId: input.context.signalEventId,
            },
          })
        );
      }
    }

    return findings;
  }

  private compareVariables(
    terraformVariables: TerraformVariable[],
    runbookVariables: RunbookVariable[],
    input: ComparatorInput
  ): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Create lookup map for runbook variables
    const runbookMap = new Map<string, RunbookVariable>();
    runbookVariables.forEach(v => {
      runbookMap.set(v.name, v);
    });

    // Check for undocumented variables
    for (const tfVar of terraformVariables) {
      if (!runbookMap.has(tfVar.name)) {
        const evidence = [
          {
            kind: 'variable_undocumented',
            leftValue: { name: tfVar.name, type: tfVar.type, default: tfVar.default, description: tfVar.description },
            rightValue: null,
            pointers: {
              left: `variable.${tfVar.name}`,
              right: null,
            },
          },
        ];

        findings.push(
          this.createFinding({
            workspaceId: input.context.workspaceId,
            contractId: input.context.contractId,
            invariantId: input.invariant.invariantId,
            driftType: 'instruction',
            severity: tfVar.default === undefined ? 'high' : 'medium',
            compared: {
              left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
              right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
            },
            evidence,
            context: {
              service: input.context.service,
              repo: input.context.repo,
              signalEventId: input.context.signalEventId,
            },
          })
        );
      }
    }

    return findings;
  }

  private compareDeploymentSteps(
    terraformOutputs: TerraformOutput[],
    runbookSteps: RunbookDeploymentStep[],
    input: ComparatorInput
  ): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Extract all commands from deployment steps
    const commands = runbookSteps
      .map(s => s.command)
      .filter((c): c is string => c !== undefined);

    // Check if terraform apply/plan is mentioned
    const hasTerraformCommand = commands.some(cmd =>
      cmd.includes('terraform apply') || cmd.includes('terraform plan')
    );

    if (!hasTerraformCommand && terraformOutputs.length > 0) {
      const evidence = [
        {
          kind: 'deployment_step_missing',
          leftValue: { outputs: terraformOutputs.map(o => o.name) },
          rightValue: { steps: runbookSteps.length, commands },
          pointers: {
            left: 'outputs',
            right: 'deployment_steps',
          },
        },
      ];

      findings.push(
        this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity: 'high',
          compared: {
            left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
            right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
          },
          evidence,
          context: {
            service: input.context.service,
            repo: input.context.repo,
            signalEventId: input.context.signalEventId,
          },
        })
      );
    }

    // Check if outputs are referenced in deployment steps
    for (const output of terraformOutputs) {
      const isReferenced = runbookSteps.some(step =>
        step.description.includes(output.name) || (step.command && step.command.includes(output.name))
      );

      if (!isReferenced) {
        const evidence = [
          {
            kind: 'output_not_referenced',
            leftValue: { name: output.name, value: output.value, description: output.description },
            rightValue: null,
            pointers: {
              left: `output.${output.name}`,
              right: null,
            },
          },
        ];

        findings.push(
          this.createFinding({
            workspaceId: input.context.workspaceId,
            contractId: input.context.contractId,
            invariantId: input.invariant.invariantId,
            driftType: 'instruction',
            severity: 'medium',
            compared: {
              left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
              right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
            },
            evidence,
            context: {
              service: input.context.service,
              repo: input.context.repo,
              signalEventId: input.context.signalEventId,
            },
          })
        );
      }
    }

    return findings;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private getResourceSeverity(resourceType: string): 'critical' | 'high' | 'medium' | 'low' {
    // Critical infrastructure resources
    const criticalTypes = [
      'aws_db_instance',
      'aws_rds_cluster',
      'aws_elasticache_cluster',
      'aws_lb',
      'aws_alb',
      'aws_elb',
      'aws_ecs_cluster',
      'aws_eks_cluster',
      'google_sql_database_instance',
      'google_container_cluster',
      'azurerm_sql_database',
      'azurerm_kubernetes_cluster',
    ];

    // High-priority resources
    const highPriorityTypes = [
      'aws_instance',
      'aws_ecs_service',
      'aws_lambda_function',
      'google_compute_instance',
      'azurerm_virtual_machine',
    ];

    if (criticalTypes.some(t => resourceType.includes(t))) {
      return 'critical';
    }

    if (highPriorityTypes.some(t => resourceType.includes(t))) {
      return 'high';
    }

    return 'medium';
  }
}

// ============================================================================
// AUTO-REGISTRATION
// ============================================================================

// Auto-register this comparator when the module is imported
const terraformRunbookComparator = new TerraformRunbookComparator();
getComparatorRegistry().register(terraformRunbookComparator);
