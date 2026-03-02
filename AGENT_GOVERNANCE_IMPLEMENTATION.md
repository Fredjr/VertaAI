# Agent Governance Implementation Progress

**Strategic Goal:** Expand VertaAI to govern agent-authored code through Spec–Build–Run triangle verification

**Positioning:** "VertaAI is the governance control plane for agent-built software"

---

## Phase 0: Foundation & Prerequisites (Week 1-2)

### ✅ Step 1: Database Schema Extensions (COMPLETED)

**Files Modified:**
- `apps/api/prisma/schema.prisma`

**Changes Made:**

1. **Added `IntentArtifact` Model** (lines 1292-1328)
   - Represents the "Spec" in Spec→Build→Run triangle
   - Captures structured intent claims (not LLM chain-of-thought)
   - Fields:
     - Author metadata (author, authorType, agentIdentity)
     - Structured claims (requestedCapabilities, constraints, affectedServices)
     - Expected side effects and risk acknowledgements
     - External links (ticket, design doc, PRD, runbook)
     - Signature/approval metadata (audit-grade)
   - Indexes for efficient querying by workspace, repo/PR, author type

2. **Added `AgentActionTrace` Model** (lines 1330-1359)
   - Captures detailed agent action traces for governance
   - Fields:
     - Agent identity (agentId, agentVersion)
     - Action traces (toolCalls, filesModified, externalActions)
     - Runtime effects (observed side effects)
   - Indexes for efficient querying by workspace, repo/PR, agent ID

3. **Added `AuthorType` Enum** (lines 1366-1370)
   - Distinguishes HUMAN vs AGENT vs UNKNOWN authorship
   - Used for filtering and scoping policy packs

4. **Updated `Workspace` Model** (lines 73-74)
   - Added relations to `IntentArtifact[]` and `AgentActionTrace[]`

**Database Migration Required:**
```bash
cd apps/api
npx prisma migrate dev --name add_agent_governance_models
```

---

### ✅ Step 2: TypeScript Type Definitions (COMPLETED)

**Files Created:**
- `apps/api/src/types/agentGovernance.ts` (272 lines)

**Type Definitions Added:**

1. **Author Types**
   - `AuthorType`: 'HUMAN' | 'AGENT' | 'UNKNOWN'
   - `AgentIdentity`: { id, version, platform }

2. **Capability Lattice**
   - `CapabilityType`: 18 capability types (db_read, db_write, s3_read, api_endpoint, etc.)
   - `Capability`: { type, resource, scope, justification }

3. **Constraints**
   - `Constraints`: read_only, no_new_infra, least_privilege, max_cost_increase, etc.

4. **Expected Side Effects**
   - `ExpectedSideEffects`: creates_table, modifies_schema, changes_permissions, etc.

5. **Risk Acknowledgements**
   - `RiskAcknowledgement`: { type, justification, approved_by, approval_tier }

6. **External Links**
   - `ExternalLinks`: ticket, design_doc, prd, runbook, slack_thread

7. **Signature/Approval**
   - `SignatureInfo`: { signed_by, signed_at, approval_tier, approval_method, signature_hash }

8. **Intent Artifact**
   - `IntentArtifact`: Complete type matching Prisma model

9. **Agent Action Trace**
   - `ToolCall`: { tool, args, result, status, timestamp, duration_ms }
   - `FileChange`: { path, changeType, linesAdded, linesDeleted, complexity_delta }
   - `ExternalAction`: { type, target, method, success, error }
   - `RuntimeEffect`: { type, description, observed_at, severity, evidence }
   - `AgentActionTrace`: Complete type matching Prisma model

10. **Intent Artifact Ingestion**
    - `IntentArtifactSource`: pr_template | agent_summary | ticket_metadata | manual
    - `IntentArtifactIngestion`: { source, artifact, validation }

11. **Capability Lattice Comparison**
    - `CapabilityViolation`: { type, declared, observed, severity, requires_approval }
    - `CapabilityComparisonResult`: { invariant, satisfied, violations, confidence, evidence }

---

## Next Steps

### Step 3: Intent Artifact Schema & Validation (Week 1)

**Tasks:**
- [ ] Create JSON schema for intent artifacts
- [ ] Create Zod validators for runtime validation
- [ ] Add validation utilities

**Files to Create:**
- `apps/api/src/schemas/intentArtifact.schema.json`
- `apps/api/src/services/agentGovernance/intentArtifactValidator.ts`

### Step 4: Intent Artifact Ingestion (Week 1-2)

**Tasks:**
- [ ] Build PR template parser (extract YAML from PR description)
- [ ] Build agent run summary parser
- [ ] Build ticket metadata extractor (Jira/Linear integration)
- [ ] Implement workspace defaults fallback
- [ ] Create ingestion service

**Files to Create:**
- `apps/api/src/services/agentGovernance/ingestion/prTemplateParser.ts`
- `apps/api/src/services/agentGovernance/ingestion/agentSummaryParser.ts`
- `apps/api/src/services/agentGovernance/ingestion/ticketMetadataExtractor.ts`
- `apps/api/src/services/agentGovernance/ingestion/intentArtifactIngestionService.ts`

### Step 5: New Comparator Types (Week 2)

**Tasks:**
- [ ] Implement `INTENT_CAPABILITY_PARITY` comparator (Spec→Build)
- [ ] Implement `INFRA_OWNERSHIP_PARITY` comparator (Build→Run)
- [ ] Implement `CHURN_COMPLEXITY_RISK` comparator (Build quality)
- [ ] Build capability lattice engine
- [ ] Add comparators to registry

**Files to Create:**
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/intentCapabilityParity.ts`
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/infraOwnershipParity.ts`
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/churnComplexityRisk.ts`
- `apps/api/src/services/agentGovernance/capabilityLattice.ts`

### Step 6: Policy Pack Extensions (Week 2)

**Tasks:**
- [ ] Create Agent Governance Starter Pack YAML template
- [ ] Create Infrastructure Contract Pack YAML template
- [ ] Create Permissions Contract Pack YAML template
- [ ] Add agent-authored filtering to pack scope
- [ ] Update pack evaluation logic

**Files to Create:**
- `apps/api/src/services/gatekeeper/yaml-dsl/templates/agent-governance-starter.yaml`
- `apps/api/src/services/gatekeeper/yaml-dsl/templates/infrastructure-contract.yaml`
- `apps/api/src/services/gatekeeper/yaml-dsl/templates/permissions-contract.yaml`

---

## Success Criteria

### Technical Success:
- ✅ Database schema supports intent artifacts and agent action traces
- ✅ TypeScript types defined for all governance primitives
- [ ] Intent artifacts collected for 80%+ of agent PRs
- [ ] <5% false positive rate on capability violations
- [ ] <2s evaluation latency for intent comparators
- [ ] 99.9% uptime for governance checks

### Product Success:
- [ ] Differentiated positioning (not "AI code review bot")
- [ ] Enterprise-grade primitives (signed intent, capability lattice)
- [ ] Audit-ready outputs (provenance, evidence, structured remediation)
- [ ] Natural extension of existing Track A/B architecture

---

## Architecture Principles

1. **Evolution, Not Rewrite**: Leverage existing Track A/B, comparators, policy pack system
2. **Audit-Grade Primitives**: Signed intent artifacts, not LLM chain-of-thought
3. **Deterministic Evidence**: Capability lattice, not semantic similarity
4. **Low-Friction Adoption**: Auto-extract intent, only require fields when risk is high
5. **Enterprise-Safe**: Privacy-safe, compliance-ready, structured remediation

