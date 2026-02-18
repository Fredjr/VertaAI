# Phase 1 Features - User Guide

## Overview

This guide covers all new features introduced in Phase 1 of the Policy Pack system enhancement. Phase 1 adds powerful metadata management, scope precedence, and pack-level defaults to give you fine-grained control over your policy packs.

---

## Table of Contents

1. [Phase 1.2: Enhanced Metadata](#phase-12-enhanced-metadata)
2. [Phase 1.3: Scope Precedence](#phase-13-scope-precedence)
3. [Phase 1.4: Pack-Level Defaults](#phase-14-pack-level-defaults)
4. [Best Practices](#best-practices)
5. [Examples](#examples)

---

## Phase 1.2: Enhanced Metadata

### Pack Status Lifecycle

Policy packs now support a formal lifecycle with 5 status values:

| Status | Description | Use Case |
|--------|-------------|----------|
| **DRAFT** | Work in progress, not yet ready | Initial development, testing |
| **IN_REVIEW** | Under review by stakeholders | Peer review, approval process |
| **ACTIVE** | Currently enforced | Production use |
| **DEPRECATED** | Still active but being phased out | Migration period |
| **ARCHIVED** | No longer active, kept for history | Retired policies |

**How to Use:**
1. Navigate to **Overview & Identity** step in the wizard
2. Select status from the **Status** dropdown
3. Status is displayed in pack listings and can be filtered

**Best Practice:** Always start with DRAFT, move to IN_REVIEW for approval, then ACTIVE for production.

---

### Owners (Teams and Users)

Define who is responsible for maintaining and approving changes to a policy pack.

**Features:**
- Add both **teams** and **users** as owners
- Visual distinction: Teams (blue badges), Users (green badges)
- Multiple owners supported

**How to Use:**
1. In **Overview & Identity** step, find the **Owners** section
2. To add a team: Enter team name (e.g., `platform-team`) and click the blue **+** button
3. To add a user: Enter username (e.g., `@alice`) and click the green **+** button
4. Remove owners by clicking the **X** on their badge

**YAML Format:**
```yaml
metadata:
  owners:
    - team: platform-team
    - team: security-team
    - user: @alice
    - user: @bob
```

**Use Cases:**
- Route approval requests to specific teams
- Track ownership for compliance
- Enable notifications to responsible parties

---

### Labels (Key-Value Pairs)

Categorize and filter policy packs using custom labels.

**Features:**
- Arbitrary key-value pairs
- Useful for filtering, searching, and grouping
- Purple badges for visual identification

**How to Use:**
1. In **Overview & Identity** step, find the **Labels** section
2. Enter a key (e.g., `environment`) and value (e.g., `production`)
3. Click the purple **+** button to add
4. Remove labels by clicking the **X** on their badge

**YAML Format:**
```yaml
metadata:
  labels:
    environment: production
    team: platform
    compliance: sox
    region: us-east-1
```

**Common Label Keys:**
- `environment`: production, staging, development
- `team`: owning team name
- `compliance`: sox, pci, hipaa, gdpr
- `region`: geographic region
- `criticality`: high, medium, low
- `service-tier`: tier-1, tier-2, tier-3

---

### Version Notes

Document changes and updates to your policy pack.

**Features:**
- Free-form text area for changelog
- Displayed in pack history
- Helps track evolution of policies

**How to Use:**
1. In **Overview & Identity** step, find **Version Notes**
2. Enter a description of changes (e.g., "Added new security rules for API authentication")
3. Notes are saved with the pack version

**Best Practice:**
```
Version 2.1.0 - 2026-02-18
- Added mandatory code review rule for production deployments
- Increased timeout for external API checks from 5s to 10s
- Fixed bug in branch pattern matching
```

---

## Phase 1.3: Scope Precedence

### Overview

When multiple policy packs apply to the same PR, scope precedence determines which pack takes priority and how conflicts are resolved.

---

### Scope Priority (0-100)

Assign a numeric priority to each pack. Higher numbers = higher priority.

**Default:** 50

**How to Use:**
1. In **Scope Configuration** step, find **Scope Priority**
2. Enter a number between 0 and 100
3. Packs with higher priority are evaluated first

**YAML Format:**
```yaml
scope:
  priority: 75
```

**Priority Guidelines:**

| Priority Range | Use Case | Example |
|----------------|----------|---------|
| 90-100 | Critical security/compliance | SOX compliance, PCI-DSS |
| 70-89 | Important organizational policies | Production deployment gates |
| 50-69 | Standard policies | Code quality, documentation |
| 30-49 | Team-specific policies | Service-level customizations |
| 0-29 | Experimental/optional | Beta features, soft recommendations |

**Example Scenario:**
```
Pack A: Workspace-level security pack (priority: 90)
Pack B: Service-level API pack (priority: 60)
Pack C: Repo-level custom pack (priority: 40)

Evaluation order: A → B → C
```

---

### Scope Merge Strategy

Defines how to handle conflicts when multiple packs apply.

**Options:**

#### 1. MOST_RESTRICTIVE (Default)
Takes the strictest rule from all applicable packs.

**Use Case:** Security and compliance - ensure no pack can weaken requirements

**Example:**
```
Pack A requires 2 approvals
Pack B requires 1 approval
Result: 2 approvals required (most restrictive)
```

#### 2. HIGHEST_PRIORITY
Uses rules only from the highest priority pack; ignores lower priority packs.

**Use Case:** Service-specific overrides - allow services to completely override workspace defaults

**Example:**
```
Pack A (priority 90): Requires security team approval
Pack B (priority 60): Requires platform team approval
Result: Only security team approval required (from Pack A)
```

#### 3. EXPLICIT
Requires manual conflict resolution; fails if packs conflict.

**Use Case:** Strict governance - prevent accidental policy conflicts

**Example:**
```
Pack A and Pack B both define rules for the same condition
Result: Evaluation fails with error, requires admin to resolve
```

**How to Use:**
1. In **Scope Configuration** step, find **Merge Strategy**
2. Select from dropdown
3. Strategy applies when this pack conflicts with others

**YAML Format:**
```yaml
scope:
  mergeStrategy: MOST_RESTRICTIVE
```

---





## Phase 1.4: Pack-Level Defaults

### Overview

Pack-level defaults allow you to set default values that are inherited by all rules in the pack. Individual rules can override these defaults when needed.

**Benefits:**
- Reduce repetition across rules
- Ensure consistency within a pack
- Easy to update all rules at once
- Clear separation of pack-wide vs rule-specific settings

---

### Timeouts

Set default timeout values for policy evaluation.

#### Comparator Timeout
Maximum time (in milliseconds) for a single comparator to execute.

**Default:** System default (typically 5000ms)

**How to Use:**
1. In **Pack Defaults** step, expand **Timeout Defaults**
2. Enter **Comparator Timeout** in milliseconds
3. Leave blank to use system default

**YAML Format:**
```yaml
defaults:
  timeouts:
    comparatorTimeout: 5000
```

**Use Cases:**
- Increase for slow external API checks (e.g., 10000ms)
- Decrease for fast local checks (e.g., 1000ms)

#### Total Evaluation Timeout
Maximum time (in milliseconds) for the entire pack evaluation.

**Default:** System default (typically 30000ms)

**How to Use:**
1. Enter **Total Evaluation Timeout** in milliseconds
2. Should be greater than comparatorTimeout × number of rules

**YAML Format:**
```yaml
defaults:
  timeouts:
    totalEvaluationTimeout: 30000
```

**Best Practice:**
```yaml
# For a pack with 10 rules, each taking up to 5s
defaults:
  timeouts:
    comparatorTimeout: 5000
    totalEvaluationTimeout: 60000  # 10 rules × 5s + buffer
```

---

### Severity

Set default severity levels for rule violations.

#### Default Severity Level
The severity assigned to violations when not specified in the rule.

**Options:** low, medium, high, critical

**How to Use:**
1. In **Pack Defaults** step, expand **Severity Defaults**
2. Select **Default Severity Level** from dropdown
3. Leave as "Not set" to require rules to specify severity

**YAML Format:**
```yaml
defaults:
  severity:
    defaultLevel: medium
```

**Severity Guidelines:**

| Level | Description | Example |
|-------|-------------|---------|
| **critical** | Security vulnerabilities, compliance violations | Exposed secrets, missing encryption |
| **high** | Important best practices, breaking changes | Missing required approvals, API contract breaks |
| **medium** | Code quality, documentation | Missing tests, outdated docs |
| **low** | Style, minor improvements | Formatting, typos |

#### Escalation Threshold
Number of violations before automatically escalating severity.

**How to Use:**
1. Enter **Escalation Threshold** (e.g., 3)
2. After N violations, severity increases one level
3. Leave blank to disable auto-escalation

**YAML Format:**
```yaml
defaults:
  severity:
    defaultLevel: medium
    escalationThreshold: 3
```

**Example:**
```
Violation 1: medium
Violation 2: medium
Violation 3: medium
Violation 4: high (escalated)
Violation 5: high
Violation 6: high
Violation 7: critical (escalated again)
```

---

### Approvals

Set default approval requirements for all rules.

#### Minimum Approval Count
Default number of approvals required.

**How to Use:**
1. In **Pack Defaults** step, expand **Approval Defaults**
2. Enter **Minimum Approval Count** (e.g., 2)
3. Rules inherit this unless they specify otherwise

**YAML Format:**
```yaml
defaults:
  approvals:
    minCount: 2
```

#### Required Teams
Teams that must approve by default.

**How to Use:**
1. Enter team name (e.g., `security-team`)
2. Click blue **+** button to add
3. Multiple teams can be required

**YAML Format:**
```yaml
defaults:
  approvals:
    requiredTeams:
      - security-team
      - platform-team
```

#### Required Users
Specific users that must approve by default.

**How to Use:**
1. Enter username (e.g., `@alice`)
2. Click green **+** button to add
3. Multiple users can be required

**YAML Format:**
```yaml
defaults:
  approvals:
    requiredUsers:
      - "@alice"
      - "@bob"
```

**Complete Example:**
```yaml
defaults:
  approvals:
    minCount: 2
    requiredTeams:
      - security-team
    requiredUsers:
      - "@security-lead"
```

**Interpretation:** Requires 2 total approvals, AND security-team approval, AND @security-lead approval.

---

### Obligations

Set default behavior for obligation failures.

#### Default Decision on Failure
What happens when an obligation check fails.

**Options:**
- **block**: Fail the PR check (strict enforcement)
- **warn**: Pass with warning (soft enforcement)
- **pass**: Ignore failure (monitoring only)

**How to Use:**
1. In **Pack Defaults** step, expand **Obligation Defaults**
2. Select **Default Decision on Failure** from dropdown

**YAML Format:**
```yaml
defaults:
  obligations:
    defaultDecisionOnFail: warn
```

**Use Cases:**

| Decision | Use Case | Example |
|----------|----------|---------|
| **block** | Critical requirements | Security scans, compliance checks |
| **warn** | Best practices, gradual rollout | Documentation requirements, new policies |
| **pass** | Monitoring, data collection | Experimental checks, metrics gathering |

#### Default Obligation Severity
Severity level for obligation violations.

**Options:** low, medium, high, critical

**How to Use:**
1. Select **Default Obligation Severity** from dropdown
2. Applies when obligation fails

**YAML Format:**
```yaml
defaults:
  obligations:
    defaultDecisionOnFail: warn
    defaultSeverity: medium
```

---

### Triggers

Set default PR events that trigger policy evaluation.

#### Default PR Events
Which GitHub PR events should trigger this pack by default.

**Options:**
- **opened**: When a PR is first created
- **synchronize**: When new commits are pushed
- **reopened**: When a closed PR is reopened
- **labeled**: When labels are added/removed

**How to Use:**
1. In **Pack Defaults** step, expand **Trigger Defaults**
2. Check the events you want to trigger evaluation
3. Rules inherit these unless they specify otherwise

**YAML Format:**
```yaml
defaults:
  triggers:
    defaultPrEvents:
      - opened
      - synchronize
```

**Common Patterns:**

| Pattern | Events | Use Case |
|---------|--------|----------|
| **Standard** | opened, synchronize | Most policies - check on creation and updates |
| **Initial only** | opened | One-time checks (e.g., PR template validation) |
| **Continuous** | opened, synchronize, reopened | Strict enforcement, always re-check |
| **Label-based** | labeled | Conditional policies based on labels |

**Complete Example:**
```yaml
defaults:
  triggers:
    defaultPrEvents:
      - opened
      - synchronize
      - reopened
```

---


## Best Practices

### 1. Status Lifecycle Management

**DO:**
- Start all packs in DRAFT status
- Move to IN_REVIEW before activating
- Use DEPRECATED for gradual migration
- Archive old packs instead of deleting

**DON'T:**
- Skip the review process
- Leave packs in DRAFT in production
- Delete packs (use ARCHIVED instead)

### 2. Ownership and Accountability

**DO:**
- Assign at least one team owner
- Include individual owners for critical packs
- Use labels to track ownership hierarchy
- Document ownership in version notes

**DON'T:**
- Leave packs without owners
- Use generic team names
- Forget to update owners when teams change

### 3. Priority Assignment

**DO:**
- Reserve 90-100 for security/compliance
- Use 50-70 for standard policies
- Document priority rationale in labels
- Review priorities quarterly

**DON'T:**
- Use priority 100 for everything
- Change priorities without review
- Create priority conflicts

### 4. Merge Strategy Selection

**Use MOST_RESTRICTIVE when:**
- Security and compliance are paramount
- Multiple teams contribute policies
- You want defense-in-depth

**Use HIGHEST_PRIORITY when:**
- Services need complete override capability
- Clear hierarchy exists
- Conflicts are rare

**Use EXPLICIT when:**
- Strict governance required
- Conflicts must be manually reviewed
- Audit trail is critical

### 5. Pack Defaults

**DO:**
- Set conservative defaults (higher timeouts, stricter approvals)
- Use defaults for 80% of rules
- Document why rules override defaults
- Review defaults when adding many overrides

**DON'T:**
- Set defaults too strict (rules will override)
- Set defaults too loose (defeats the purpose)
- Change defaults without testing impact

---

## Examples

### Example 1: Production Security Pack

A high-priority security pack for production deployments.

```yaml
metadata:
  name: Production Security Pack
  description: Security requirements for production deployments
  status: ACTIVE
  owners:
    - team: security-team
    - user: "@security-lead"
  labels:
    environment: production
    compliance: sox
    criticality: high

scope:
  type: workspace
  priority: 95
  mergeStrategy: MOST_RESTRICTIVE
  branchesInclude:
    - main
    - release/*

defaults:
  timeouts:
    comparatorTimeout: 10000
    totalEvaluationTimeout: 60000
  severity:
    defaultLevel: high
    escalationThreshold: 2
  approvals:
    minCount: 2
    requiredTeams:
      - security-team
  obligations:
    defaultDecisionOnFail: block
    defaultSeverity: critical
  triggers:
    defaultPrEvents:
      - opened
      - synchronize
      - reopened

trackA:
  rules:
    - id: require-security-scan
      description: All PRs must pass security scan
      # Inherits all defaults from pack

    - id: require-codeowners-approval
      description: CODEOWNERS must approve
      approvals:
        minCount: 1  # Override: only need 1 CODEOWNERS approval
```

**Key Features:**
- High priority (95) ensures it takes precedence
- MOST_RESTRICTIVE merge strategy for defense-in-depth
- Strict defaults (block on fail, high severity)
- Security team required for all approvals
- Individual rules can override (e.g., minCount: 1)

---

### Example 2: Service-Level API Pack

A service-specific pack that overrides workspace defaults.

```yaml
metadata:
  name: Payment Service API Pack
  description: API contract validation for payment service
  status: ACTIVE
  owners:
    - team: payment-team
  labels:
    service: payment-service
    team: payments
    tier: tier-1

scope:
  type: service
  ref: payment-service
  priority: 70
  mergeStrategy: HIGHEST_PRIORITY

defaults:
  timeouts:
    comparatorTimeout: 15000  # Payment APIs are slower
  severity:
    defaultLevel: critical  # Payment errors are critical
  approvals:
    minCount: 1
    requiredTeams:
      - payment-team
  obligations:
    defaultDecisionOnFail: block
  triggers:
    defaultPrEvents:
      - opened
      - synchronize

trackA:
  rules:
    - id: api-contract-validation
      description: Validate OpenAPI contract changes
      # Uses service-specific defaults
```

**Key Features:**
- Service-scoped (only applies to payment-service)
- Priority 70 (overrides standard packs, but not security)
- HIGHEST_PRIORITY merge (service team has final say)
- Higher timeout for slow payment APIs
- Critical severity by default

---

### Example 3: Documentation Pack (Observe Mode)

A low-priority pack for documentation requirements in observe mode.

```yaml
metadata:
  name: Documentation Standards
  description: Documentation requirements (observe mode)
  status: IN_REVIEW
  owners:
    - team: platform-team
  labels:
    category: documentation
    enforcement: soft
  versionNotes: |
    v1.0.0 - Initial rollout in observe mode
    Will move to enforce mode after 2 weeks of monitoring

scope:
  type: workspace
  priority: 40
  mergeStrategy: MOST_RESTRICTIVE

defaults:
  timeouts:
    comparatorTimeout: 3000  # Fast checks
  severity:
    defaultLevel: low
  approvals:
    minCount: 0  # No approvals required in observe mode
  obligations:
    defaultDecisionOnFail: warn  # Warn only, don't block
    defaultSeverity: low
  triggers:
    defaultPrEvents:
      - opened  # Only check on PR creation

trackA:
  rules:
    - id: readme-exists
      description: Repository must have README.md

    - id: api-docs-updated
      description: API changes must update documentation
```

**Key Features:**
- IN_REVIEW status (not yet active)
- Low priority (40) - won't override other packs
- Observe mode (warn, don't block)
- Version notes document rollout plan
- Only triggers on PR open (not every commit)

---

### Example 4: Multi-Environment Pack with Labels

Using labels for environment-specific filtering.

```yaml
metadata:
  name: Multi-Environment Deployment Pack
  description: Environment-specific deployment rules
  status: ACTIVE
  owners:
    - team: platform-team
    - team: sre-team
  labels:
    category: deployment
    environments: all
    automation: enabled

scope:
  type: workspace
  priority: 60
  mergeStrategy: MOST_RESTRICTIVE
  branchesInclude:
    - main
    - staging
    - develop

defaults:
  severity:
    defaultLevel: medium
  approvals:
    minCount: 1
  triggers:
    defaultPrEvents:
      - opened
      - synchronize
      - labeled  # Re-evaluate when labels change

trackA:
  rules:
    - id: production-requires-approval
      description: Production deployments need SRE approval
      conditions:
        - label: environment=production
      approvals:
        minCount: 2
        requiredTeams:
          - sre-team
      severity: high

    - id: staging-auto-deploy
      description: Staging can auto-deploy
      conditions:
        - label: environment=staging
      approvals:
        minCount: 0
      severity: low
```

**Key Features:**
- Label-based conditional rules
- Different requirements per environment
- Triggers on label changes
- Clear ownership across teams

---

## Migration Guide

### Migrating Existing Packs to Phase 1

If you have existing policy packs, here's how to migrate them:

#### Step 1: Add Status
```yaml
metadata:
  status: ACTIVE  # Add this to all existing packs
```

#### Step 2: Add Owners
```yaml
metadata:
  owners:
    - team: your-team  # Add responsible team
```

#### Step 3: Add Priority (if multiple packs exist)
```yaml
scope:
  priority: 50  # Start with default, adjust as needed
```

#### Step 4: Extract Common Values to Defaults
**Before:**
```yaml
trackA:
  rules:
    - id: rule1
      approvals:
        minCount: 2
      severity: high
    - id: rule2
      approvals:
        minCount: 2
      severity: high
```

**After:**
```yaml
defaults:
  approvals:
    minCount: 2
  severity:
    defaultLevel: high

trackA:
  rules:
    - id: rule1
      # Inherits defaults
    - id: rule2
      # Inherits defaults
```

---

## Troubleshooting

### Issue: Multiple packs applying, unclear which takes precedence

**Solution:** Check priority values and merge strategy
```bash
# List all packs with priority
GET /api/policy-packs?sort=priority:desc

# Check which packs apply to a specific PR
GET /api/policy-packs/match?repo=owner/repo&branch=main
```

### Issue: Rules not inheriting defaults

**Check:**
1. Defaults are in correct YAML structure
2. Rule doesn't explicitly override the value
3. Pack validation passes (no schema errors)

### Issue: Pack conflicts causing failures

**Solution:** Review merge strategy
- If using EXPLICIT, resolve conflicts manually
- If using MOST_RESTRICTIVE, check which pack is strictest
- If using HIGHEST_PRIORITY, verify priority values

---

## FAQ

**Q: Can I change a pack's priority after it's active?**
A: Yes, but review impact first. Higher priority packs override lower ones.

**Q: What happens if I don't set defaults?**
A: Rules must specify all values explicitly. Defaults are optional but recommended.

**Q: Can rules override pack defaults?**
A: Yes, rules can override any default value.

**Q: How do I test a new pack without affecting production?**
A: Use DRAFT status and test in a non-production branch first.

**Q: What's the difference between owners and approvals?**
A: Owners are responsible for the pack itself. Approvals are required for PRs that trigger the pack.

**Q: Can I use wildcards in labels?**
A: No, labels are exact key-value matches. Use multiple labels for categorization.

---

## Additional Resources

- [YAML DSL Reference](./YAML_DSL_REFERENCE.md)
- [Comparator Registry](./COMPARATOR_REGISTRY.md)
- [API Documentation](./API_REFERENCE.md)
- [Phase 2 Features](./PHASE_2_USER_GUIDE.md) (coming soon)

---

**Last Updated:** 2026-02-18
**Version:** 1.0.0
**Phase:** 1 (Foundation)
