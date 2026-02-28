# Cross-Artifact Integrity Graph - Implementation Plan

**Date:** 2026-02-28  
**Status:** 📋 **PLANNING**  
**Target:** Governance Layer (Not Bot)

---

## 🎯 **Target State: Cross-Artifact Integrity Graph**

### **11.1 Artifact Graph Architecture**

Build a **small artifact graph** that enforces **parity invariants across edges**:

```
service → openapi → endpoints
service → dashboards → alerts
service → runbook → ownership
service → SLO → alert thresholds
```

This is the **"governance layer"** differentiator, not a bot.

---

## 📊 **Graph Structure**

### **Nodes (Artifacts)**
- **Service** (code, implementation)
- **OpenAPI Spec** (API contract)
- **Endpoints** (actual HTTP routes)
- **Dashboards** (monitoring/observability)
- **Alerts** (incident detection)
- **Runbook** (operational procedures)
- **Ownership** (CODEOWNERS, team assignments)
- **SLO** (service level objectives)
- **Alert Thresholds** (SLO-derived thresholds)

### **Edges (Parity Invariants)**

| Edge | Invariant | Violation Example |
|------|-----------|-------------------|
| `service → openapi` | Code implements all spec endpoints | Endpoint in spec, not in code |
| `openapi → endpoints` | Spec matches actual routes | Route exists, not in spec |
| `service → dashboards` | Service metrics are monitored | New service, no dashboard |
| `dashboards → alerts` | Monitored metrics have alerts | Dashboard exists, no alerts |
| `service → runbook` | Service has operational docs | Service deployed, no runbook |
| `runbook → ownership` | Runbook references owners | Runbook exists, no CODEOWNERS |
| `service → SLO` | Service has defined SLOs | Production service, no SLO |
| `SLO → alert thresholds` | Alerts match SLO targets | SLO 99.9%, alert at 95% |

---

## 🏗️ **Implementation Architecture**

### **Phase 1: Graph Data Model**

```typescript
// apps/api/src/services/gatekeeper/artifact-graph/types.ts

export type ArtifactType = 
  | 'service'
  | 'openapi'
  | 'endpoints'
  | 'dashboard'
  | 'alert'
  | 'runbook'
  | 'ownership'
  | 'slo'
  | 'alert_threshold';

export interface ArtifactNode {
  id: string;
  type: ArtifactType;
  path: string;  // File path or identifier
  metadata: Record<string, any>;
  lastModified?: Date;
}

export interface ParityEdge {
  from: ArtifactNode;
  to: ArtifactNode;
  invariant: string;  // e.g., "openapi_code_parity"
  status: 'valid' | 'drift' | 'missing';
  lastChecked: Date;
  violations?: ParityViolation[];
}

export interface ParityViolation {
  type: 'missing' | 'mismatch' | 'orphaned';
  description: string;
  evidence: any;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ArtifactGraph {
  nodes: Map<string, ArtifactNode>;
  edges: ParityEdge[];
  serviceId: string;
  repoId: string;
  lastUpdated: Date;
}
```

### **Phase 2: Graph Builder**

```typescript
// apps/api/src/services/gatekeeper/artifact-graph/builder.ts

export class ArtifactGraphBuilder {
  async buildGraph(context: PRContext): Promise<ArtifactGraph> {
    const nodes = new Map<string, ArtifactNode>();
    const edges: ParityEdge[] = [];

    // Discover artifacts from PR files
    await this.discoverServiceArtifacts(context, nodes);
    await this.discoverOpenAPIArtifacts(context, nodes);
    await this.discoverDashboardArtifacts(context, nodes);
    await this.discoverRunbookArtifacts(context, nodes);
    await this.discoverOwnershipArtifacts(context, nodes);
    await this.discoverSLOArtifacts(context, nodes);

    // Build parity edges
    edges.push(...await this.buildServiceOpenAPIEdges(nodes));
    edges.push(...await this.buildOpenAPIEndpointEdges(nodes));
    edges.push(...await this.buildServiceDashboardEdges(nodes));
    edges.push(...await this.buildDashboardAlertEdges(nodes));
    edges.push(...await this.buildServiceRunbookEdges(nodes));
    edges.push(...await this.buildRunbookOwnershipEdges(nodes));
    edges.push(...await this.buildServiceSLOEdges(nodes));
    edges.push(...await this.buildSLOAlertThresholdEdges(nodes));

    return {
      nodes,
      edges,
      serviceId: context.repo,
      repoId: context.repo,
      lastUpdated: new Date(),
    };
  }
}
```

### **Phase 3: Parity Validators**

```typescript
// apps/api/src/services/gatekeeper/artifact-graph/validators/

// Each edge type has a dedicated validator
export interface ParityValidator {
  validate(from: ArtifactNode, to: ArtifactNode): Promise<ParityViolation[]>;
}

// Example: OpenAPI → Code Parity
export class OpenAPICodeParityValidator implements ParityValidator {
  async validate(openapi: ArtifactNode, service: ArtifactNode): Promise<ParityViolation[]> {
    // Already implemented in cross-artifact comparators!
    // Reuse: openapiCodeParity.ts
  }
}
```

---

## 🔄 **Integration with Existing Comparators**

**Good News:** We've already implemented 5 cross-artifact comparators!

| Comparator | Graph Edge | Status |
|------------|------------|--------|
| `OPENAPI_CODE_PARITY` | `service → openapi` | ✅ Implemented |
| `SCHEMA_MIGRATION_PARITY` | `schema → migration` | ✅ Implemented |
| `CONTRACT_IMPLEMENTATION_PARITY` | `contract → service` | ✅ Implemented |
| `DOC_CODE_PARITY` | `docs → service` | ✅ Implemented |
| `TEST_IMPLEMENTATION_PARITY` | `tests → service` | ✅ Implemented |

**To Add:**
- `service → dashboards`
- `dashboards → alerts`
- `service → runbook`
- `runbook → ownership`
- `service → SLO`
- `SLO → alert thresholds`

---

## 📈 **Next Steps**

1. **✅ Complete auto-invocation** (in progress - commit `1afd566`)
2. **📋 Design graph schema** (Prisma models for persistence)
3. **🔨 Implement graph builder** (artifact discovery)
4. **🔍 Add missing validators** (6 new edge types)
5. **💾 Persist graph state** (for drift history)
6. **📊 Build graph visualization** (UI component)

---

**This is the foundation for "Governance Layer, not Bot"** 🎯

