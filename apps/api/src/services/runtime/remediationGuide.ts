/**
 * Remediation Guide — Runtime Capability Drift
 *
 * Generates specific, actionable remediation steps for each capability type
 * and drift direction. Replaces generic "remove or restrict" advice with
 * concrete policy statements, command snippets, and audit pointers.
 *
 * ARCHITECTURE:
 * - Called by runtimeDriftMonitor when building DriftCluster.clusterSummary
 * - Input: capabilityType + capabilityTarget + driftType
 * - Output: RemediationOption[] (id A/B/C with type-specific guidance)
 */

import type { CapabilityType } from '../../types/agentGovernance.js';

export interface RemediationStep {
  /** Short headline shown in UI card */
  title: string;
  /** Detailed explanation */
  description: string;
  /** Optional code / CLI snippet to copy-paste */
  snippet?: string;
  /** Link to documentation or audit console */
  link?: string;
}

export interface RemediationOption {
  id: 'A' | 'B' | 'C';
  label: string;
  description: string;
  requiresApproval: boolean;
  steps: RemediationStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-capability-type guidance generators
// ─────────────────────────────────────────────────────────────────────────────

function iamModifyGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Identify the IAM action',
      description: `Find the exact IAM API call on target "${target}" in CloudTrail (filter eventSource=iam.amazonaws.com).`,
      link: 'https://console.aws.amazon.com/cloudtrail/home#/events?ReadWriteType=WriteOnly',
    },
    {
      title: 'Remove the IAM permission from the task role',
      description: "Remove the offending action from the service's task/execution role policy.",
      snippet: `aws iam remove-role-policy --role-name <SERVICE_ROLE> --policy-name <POLICY_NAME>`,
    },
    {
      title: 'Replace with least-privilege inline policy',
      description: 'If IAM access is required, craft a tightly scoped policy limited to this specific resource.',
      snippet: `{
  "Effect": "Deny",
  "Action": "iam:*",
  "Resource": "*"
}`,
    },
    {
      title: 'Enable SCP guard',
      description: 'Add a Service Control Policy to block iam:PassRole and iam:CreateRole from service accounts.',
    },
  ];
}

function secretWriteGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Locate the write event',
      description: `Find secretsmanager:PutSecretValue calls for "${target}" in CloudTrail.`,
      snippet: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=PutSecretValue`,
    },
    {
      title: 'Revoke SecretsManager write permissions',
      description: 'Remove secretsmanager:PutSecretValue and CreateSecret from the service IAM role.',
      snippet: `aws iam delete-role-policy --role-name <ROLE> --policy-name AllowSecretWrite`,
    },
    {
      title: 'Add resource-based deny policy on the secret',
      description: "Add a Deny for PutSecretValue to the secret's resource policy as a backstop.",
    },
  ];
}

function secretReadGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Audit secret access',
      description: `Verify which principal accessed "${target}" and whether it is the expected service identity.`,
      link: 'https://console.aws.amazon.com/secretsmanager',
    },
    {
      title: 'Scope read access to required secrets only',
      description: 'Replace wildcard Resource ARN with the specific secret ARN in the IAM policy.',
      snippet: `{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:<REGION>:<ACCOUNT>:secret:<SECRET_NAME>"
}`,
    },
    {
      title: 'Add to intent artifact if access is legitimate',
      description: 'If this read is intentional, declare secret_read in the agent-intent.yaml to prevent future alerts.',
    },
  ];
}

function dbAdminGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Identify the privileged DB operation',
      description: `Check slow-query logs and pg_stat_activity for DDL / admin operations on "${target}".`,
    },
    {
      title: 'Revoke SUPERUSER / CREATE on the service DB user',
      description: 'Remove admin grants from the application user. Application users should never have DBA privileges.',
      snippet: `REVOKE ALL PRIVILEGES ON DATABASE ${target} FROM <SERVICE_USER>;
ALTER USER <SERVICE_USER> NOSUPERUSER NOCREATEDB NOCREATEROLE;`,
    },
    {
      title: 'Use a migration-specific user for schema changes',
      description: 'Migrate DDL operations to a dedicated migration user/role that is only active during deploy.',
    },
  ];
}

function s3WriteGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Confirm the S3 write was intentional',
      description: `Check if the write to bucket "${target}" was expected (e.g., artifact upload) or a misconfiguration.`,
      link: 'https://console.aws.amazon.com/s3',
    },
    {
      title: 'Restrict bucket policy to specific prefixes',
      description: 'If writes are needed, add a Condition on s3:prefix to restrict which paths the service can write.',
      snippet: `{
  "Effect": "Allow",
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::${target}/<ALLOWED_PREFIX>/*",
  "Condition": { "StringLike": { "s3:prefix": ["<ALLOWED_PREFIX>/*"] } }
}`,
    },
    {
      title: 'Enable S3 Object Lock / versioning for audit trail',
      description: 'Protect against accidental overwrites by enabling versioning on the bucket.',
    },
  ];
}

function s3DeleteGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Block delete unless explicitly required',
      description: `Deny s3:DeleteObject on bucket "${target}" for all service roles unless deletion is a declared capability.`,
      snippet: `{
  "Effect": "Deny",
  "Action": ["s3:DeleteObject", "s3:DeleteObjectVersion"],
  "Resource": "arn:aws:s3:::${target}/*"
}`,
    },
    {
      title: 'Enable MFA delete on the bucket',
      description: 'Require MFA for delete operations to prevent accidental or malicious data loss.',
    },
  ];
}

function networkPublicGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Identify the public endpoint exposure',
      description: `Check Security Group rules, NACLs, and ALB listeners for public access on "${target}".`,
    },
    {
      title: 'Remove 0.0.0.0/0 ingress rules',
      description: 'Replace open inbound rules with specific CIDR ranges or VPC endpoint policies.',
      snippet: `aws ec2 revoke-security-group-ingress --group-id <SG_ID> --protocol tcp --port <PORT> --cidr 0.0.0.0/0`,
    },
    {
      title: 'Move to private subnet or VPC endpoint',
      description: 'If the service should be internal, migrate to private subnets and use a VPC endpoint.',
    },
  ];
}

function infraDeleteGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Identify the infra deletion event',
      description: `Find the Terraform destroy / CloudFormation delete / GCP resource deletion for "${target}".`,
    },
    {
      title: 'Add deletion_protection to critical resources',
      description: 'Set deletion_protection=true in Terraform or enable termination protection.',
      snippet: `resource "aws_rds_cluster" "example" {
  deletion_protection = true
}`,
    },
    {
      title: 'Require manual approval in CI/CD for destroy operations',
      description: 'Gate terraform destroy behind a manual approval step in your pipeline.',
    },
  ];
}

function infraModifyGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Review the infrastructure change',
      description: `Inspect the Terraform plan / CloudFormation changeset for "${target}" to confirm it was intentional.`,
    },
    {
      title: 'Declare infra_modify in intent artifact if legitimate',
      description: 'If the change was planned, add infra_modify to agent-intent.yaml with a specific target.',
    },
    {
      title: 'Enable drift detection in your IaC tool',
      description: 'Use terraform plan --refresh-only or CloudFormation drift detection on a schedule.',
    },
  ];
}

function infraCreateGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Identify what was created',
      description: `Audit CloudTrail for resource creation events linked to "${target}" (e.g., RunInstances, CreateBucket).`,
    },
    {
      title: 'Apply resource tagging policy',
      description: 'Enforce mandatory tags (owner, cost-center, env) to make all created resources traceable.',
    },
    {
      title: 'Restrict CreateRole / CreateBucket to specific IAM paths',
      description: 'Use SCP conditions to limit resource creation to approved regions and naming patterns.',
    },
  ];
}

function deploymentModifyGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Check who triggered the deployment',
      description: `Audit CloudTrail / GCP Audit for the principal that modified deployment "${target}".`,
    },
    {
      title: 'Require PR-gated deployments',
      description: 'Enforce that all deployment changes go through a PR with Track A gatekeeper approval.',
    },
    {
      title: 'Add OIDC-based short-lived credentials for CI/CD',
      description: 'Replace long-lived CI secrets with OIDC federation to limit blast radius of a compromised pipeline.',
    },
  ];
}

function schemaModifyGuide(target: string): RemediationStep[] {
  return [
    {
      title: 'Identify the DDL change',
      description: `Check DB migration logs for ALTER TABLE / CREATE INDEX / DROP COLUMN on "${target}".`,
    },
    {
      title: 'Gate schema changes behind a migration PR',
      description: 'Require all schema changes to go through a reviewed migration file, not ad-hoc DDL.',
    },
    {
      title: 'Add schema_modify to intent artifact if planned',
      description: 'Declare schema_modify in agent-intent.yaml when the PR is a migration PR.',
    },
  ];
}

function genericGuide(capabilityType: string, target: string): RemediationStep[] {
  return [
    {
      title: `Investigate ${capabilityType} usage on "${target}"`,
      description: `Search CloudTrail / GCP Audit logs for the specific operation that triggered this capability detection.`,
    },
    {
      title: 'Declare in intent artifact if legitimate',
      description: `Add ${capabilityType} (target: ${target}) to agent-intent.yaml if this access is intentional.`,
    },
    {
      title: 'Remove access if unintentional',
      description: `Revoke the IAM permission or code path responsible for ${capabilityType} access to ${target}.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full A/B/C remediation option set for an undeclared capability drift.
 *
 * Option A — Tighten runtime (recommended): remove / restrict the capability in code/IAM
 * Option B — Expand intent (approval required): add to agent-intent.yaml with security review
 * Option C — Mark as false positive (approval required): dismiss with documented expiry
 */
export function buildRemediationOptions(
  capabilityType: CapabilityType,
  target: string,
): RemediationOption[] {
  const tightenSteps = getTightenSteps(capabilityType, target);

  return [
    {
      id: 'A',
      label: 'Tighten runtime (recommended)',
      description: `Remove or restrict the undeclared ${capabilityType} access. Spec remains unchanged.`,
      requiresApproval: false,
      steps: tightenSteps,
    },
    {
      id: 'B',
      label: 'Expand intent (requires security approval)',
      description: `Add ${capabilityType}:${target} to the intent artifact — triggers security review workflow.`,
      requiresApproval: true,
      steps: [
        {
          title: 'Update agent-intent.yaml',
          description: `Add the capability declaration to your agent-intent.yaml under requestedCapabilities.`,
          snippet: `requestedCapabilities:\n  - type: ${capabilityType}\n    target: "${target}"\n    justification: "<explain why this access is needed>"`,
        },
        {
          title: 'Open a PR for security team review',
          description: 'Create a PR with the updated intent file. Track A will enforce approval from the security team before merge.',
        },
        {
          title: 'Verify the capability is needed long-term',
          description: 'Confirm this is not a debugging artifact or temporary access that should be removed instead.',
        },
      ],
    },
    {
      id: 'C',
      label: 'Mark as false positive',
      description: `Dismiss with documented justification. Mandatory re-evaluation expiry (≤90 days).`,
      requiresApproval: true,
      steps: [
        {
          title: 'Document the justification',
          description: `Explain why ${capabilityType} on "${target}" is benign. Include the source of the signal and why it is not a real risk.`,
        },
        {
          title: 'Set an expiry date (≤90 days)',
          description: 'False positive suppressions must expire. Set a re-evaluation date ≤ 90 days from today.',
        },
        {
          title: 'Suppress in VertaAI dashboard',
          description: 'Use the "Mark as false positive" action in the drift cluster panel. This creates an audit record.',
        },
      ],
    },
  ];
}

/**
 * Generate the tighten-runtime steps (Option A) for a specific capability type.
 */
function getTightenSteps(capabilityType: CapabilityType, target: string): RemediationStep[] {
  switch (capabilityType) {
    case 'iam_modify': return iamModifyGuide(target);
    case 'secret_write': return secretWriteGuide(target);
    case 'secret_read': return secretReadGuide(target);
    case 'db_admin': return dbAdminGuide(target);
    case 's3_write': return s3WriteGuide(target);
    case 's3_delete': return s3DeleteGuide(target);
    case 'network_public': return networkPublicGuide(target);
    case 'infra_delete': return infraDeleteGuide(target);
    case 'infra_modify': return infraModifyGuide(target);
    case 'infra_create': return infraCreateGuide(target);
    case 'deployment_modify': return deploymentModifyGuide(target);
    case 'schema_modify': return schemaModifyGuide(target);
    default: return genericGuide(capabilityType, target);
  }
}
