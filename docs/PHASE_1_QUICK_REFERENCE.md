# Phase 1 Quick Reference

## Status Values

| Value | Description |
|-------|-------------|
| `DRAFT` | Work in progress |
| `IN_REVIEW` | Under review |
| `ACTIVE` | Currently enforced |
| `DEPRECATED` | Being phased out |
| `ARCHIVED` | No longer active |

## Priority Ranges

| Range | Use Case |
|-------|----------|
| 90-100 | Critical security/compliance |
| 70-89 | Important organizational policies |
| 50-69 | Standard policies (default: 50) |
| 30-49 | Team-specific policies |
| 0-29 | Experimental/optional |

## Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `MOST_RESTRICTIVE` | Take strictest rule from all packs (default) |
| `HIGHEST_PRIORITY` | Use only highest priority pack |
| `EXPLICIT` | Fail on conflicts, require manual resolution |

## Severity Levels

| Level | Use Case |
|-------|----------|
| `critical` | Security vulnerabilities, compliance violations |
| `high` | Important best practices, breaking changes |
| `medium` | Code quality, documentation |
| `low` | Style, minor improvements |

## Obligation Decisions

| Decision | Behavior |
|----------|----------|
| `block` | Fail the PR check |
| `warn` | Pass with warning |
| `pass` | Ignore failure |

## PR Events

| Event | Trigger |
|-------|---------|
| `opened` | PR created |
| `synchronize` | New commits pushed |
| `reopened` | Closed PR reopened |
| `labeled` | Labels added/removed |

## YAML Structure

```yaml
metadata:
  name: string
  description: string
  status: DRAFT | IN_REVIEW | ACTIVE | DEPRECATED | ARCHIVED
  owners:
    - team: string
    - user: string
  labels:
    key: value
  versionNotes: string

scope:
  type: workspace | service | repo
  ref: string  # for service/repo types
  priority: 0-100  # default: 50
  mergeStrategy: MOST_RESTRICTIVE | HIGHEST_PRIORITY | EXPLICIT
  reposInclude: [string]
  reposExclude: [string]
  branchesInclude: [string]
  branchesExclude: [string]

defaults:
  timeouts:
    comparatorTimeout: number  # milliseconds
    totalEvaluationTimeout: number  # milliseconds
  severity:
    defaultLevel: low | medium | high | critical
    escalationThreshold: number
  approvals:
    minCount: number
    requiredTeams: [string]
    requiredUsers: [string]
  obligations:
    defaultDecisionOnFail: block | warn | pass
    defaultSeverity: low | medium | high | critical
  triggers:
    defaultPrEvents: [opened | synchronize | reopened | labeled]

trackA:
  rules:
    - id: string
      description: string
      # ... rule-specific config (can override defaults)
```

## Common Patterns

### High-Security Pack
```yaml
scope:
  priority: 95
  mergeStrategy: MOST_RESTRICTIVE
defaults:
  severity:
    defaultLevel: high
  approvals:
    minCount: 2
    requiredTeams: [security-team]
  obligations:
    defaultDecisionOnFail: block
```

### Service Override Pack
```yaml
scope:
  type: service
  priority: 70
  mergeStrategy: HIGHEST_PRIORITY
defaults:
  approvals:
    requiredTeams: [service-team]
```

### Observe Mode Pack
```yaml
metadata:
  status: IN_REVIEW
scope:
  priority: 40
defaults:
  obligations:
    defaultDecisionOnFail: warn
  triggers:
    defaultPrEvents: [opened]
```

## UI Wizard Steps

1. **Overview & Identity** - Name, description, status, owners, labels, version notes
2. **Scope Configuration** - Type, priority, merge strategy, filters
3. **Pack Defaults** - Timeouts, severity, approvals, obligations, triggers
4. **Policy Authoring** - Track A rules (YAML DSL)
5. **Drift Remediation** - Track B configuration
6. **Approval & Routing** - Approval tiers and routing

## CLI Commands

```bash
# List packs by priority
GET /api/policy-packs?sort=priority:desc

# Check which packs apply
GET /api/policy-packs/match?repo=owner/repo&branch=main

# Validate pack YAML
POST /api/policy-packs/validate
```

## Best Practices Checklist

- [ ] Set status to DRAFT initially
- [ ] Assign at least one team owner
- [ ] Use appropriate priority (50 for standard)
- [ ] Choose correct merge strategy
- [ ] Set conservative defaults
- [ ] Add descriptive labels
- [ ] Document changes in version notes
- [ ] Test in non-production first
- [ ] Move to IN_REVIEW before ACTIVE
- [ ] Archive instead of delete

---

**For detailed information, see [Phase 1 User Guide](./PHASE_1_USER_GUIDE.md)**

