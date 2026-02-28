# Governance Memory + Drift History - Implementation Plan

**Date:** 2026-02-28  
**Status:** 📋 **PLANNING**  
**Target:** Longitudinal Governance (Not Bot)

---

## 🎯 **Target State: Governance Memory + Drift History**

### **11.2 Per Service/Repo Tracking**

Track **longitudinal governance metrics**:

- **Recurring violations** (same issue, multiple PRs)
- **Time-to-fix** (violation detected → resolved)
- **Policy adherence trend** (improving vs. degrading)
- **Historical context** ("this repo never had CODEOWNERS for 120 days")

**Bots don't do longitudinal governance.** This is the differentiator.

---

## 📊 **Data Model**

### **Governance Memory Schema**

```typescript
// apps/api/src/services/gatekeeper/governance-memory/types.ts

export interface GovernanceMemory {
  id: string;
  repoId: string;
  serviceId: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Violation tracking
  violations: ViolationHistory[];
  
  // Metrics
  metrics: GovernanceMetrics;
  
  // Trends
  trends: GovernanceTrends;
}

export interface ViolationHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  category: 'cross-artifact' | 'safety' | 'governance' | 'evidence';
  
  // Occurrence tracking
  firstDetected: Date;
  lastDetected: Date;
  occurrences: ViolationOccurrence[];
  
  // Resolution tracking
  status: 'open' | 'resolved' | 'recurring' | 'ignored';
  resolvedAt?: Date;
  timeToFix?: number;  // milliseconds
  
  // Context
  affectedArtifacts: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ViolationOccurrence {
  prNumber: number;
  prUrl: string;
  detectedAt: Date;
  evidence: any;
  decision: 'block' | 'warn' | 'info';
}

export interface GovernanceMetrics {
  // Violation stats
  totalViolations: number;
  openViolations: number;
  resolvedViolations: number;
  recurringViolations: number;
  
  // Time metrics
  avgTimeToFix: number;  // milliseconds
  medianTimeToFix: number;
  maxTimeToFix: number;
  
  // Adherence metrics
  adherenceScore: number;  // 0-100
  policyCompliance: Record<string, number>;  // per-policy compliance %
  
  // Trend indicators
  violationTrend: 'improving' | 'stable' | 'degrading';
  adherenceTrend: 'improving' | 'stable' | 'degrading';
}

export interface GovernanceTrends {
  // Time-series data (last 90 days)
  daily: DailyGovernanceSnapshot[];
  weekly: WeeklyGovernanceSnapshot[];
  monthly: MonthlyGovernanceSnapshot[];
}

export interface DailyGovernanceSnapshot {
  date: Date;
  violations: number;
  resolved: number;
  adherenceScore: number;
}
```

---

## 🏗️ **Implementation Architecture**

### **Phase 1: Persistence Layer**

```prisma
// apps/api/prisma/schema.prisma

model GovernanceMemory {
  id        String   @id @default(cuid())
  repoId    String
  serviceId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  violations ViolationHistory[]
  snapshots  GovernanceSnapshot[]

  @@unique([repoId, serviceId])
  @@index([repoId])
  @@index([serviceId])
}

model ViolationHistory {
  id              String   @id @default(cuid())
  memoryId        String
  memory          GovernanceMemory @relation(fields: [memoryId], references: [id])
  
  ruleId          String
  ruleName        String
  category        String
  
  firstDetected   DateTime
  lastDetected    DateTime
  status          String
  resolvedAt      DateTime?
  timeToFix       Int?
  
  severity        String
  affectedArtifacts Json
  
  occurrences     ViolationOccurrence[]
  
  @@index([memoryId, ruleId])
  @@index([status])
}

model ViolationOccurrence {
  id          String   @id @default(cuid())
  historyId   String
  history     ViolationHistory @relation(fields: [historyId], references: [id])
  
  prNumber    Int
  prUrl       String
  detectedAt  DateTime
  evidence    Json
  decision    String
  
  @@index([historyId])
  @@index([prNumber])
}

model GovernanceSnapshot {
  id              String   @id @default(cuid())
  memoryId        String
  memory          GovernanceMemory @relation(fields: [memoryId], references: [id])
  
  snapshotDate    DateTime
  period          String  // 'daily' | 'weekly' | 'monthly'
  
  violations      Int
  resolved        Int
  adherenceScore  Float
  metrics         Json
  
  @@index([memoryId, snapshotDate])
  @@index([period])
}
```

### **Phase 2: Memory Manager**

```typescript
// apps/api/src/services/gatekeeper/governance-memory/manager.ts

export class GovernanceMemoryManager {
  /**
   * Record a violation from PR evaluation
   */
  async recordViolation(
    repoId: string,
    serviceId: string,
    finding: Finding,
    prContext: PRContext
  ): Promise<void> {
    const memory = await this.getOrCreateMemory(repoId, serviceId);
    
    // Check if this is a recurring violation
    const existing = await this.findExistingViolation(
      memory.id,
      finding.ruleId
    );
    
    if (existing) {
      // Recurring violation
      await this.recordRecurrence(existing, finding, prContext);
    } else {
      // New violation
      await this.createViolationHistory(memory.id, finding, prContext);
    }
    
    // Update metrics
    await this.updateMetrics(memory.id);
  }
  
  /**
   * Mark violation as resolved
   */
  async resolveViolation(
    repoId: string,
    serviceId: string,
    ruleId: string
  ): Promise<void> {
    const memory = await this.getMemory(repoId, serviceId);
    const violation = await this.findExistingViolation(memory.id, ruleId);
    
    if (violation && violation.status === 'open') {
      const timeToFix = Date.now() - violation.firstDetected.getTime();
      
      await prisma.violationHistory.update({
        where: { id: violation.id },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          timeToFix,
        },
      });
      
      await this.updateMetrics(memory.id);
    }
  }
  
  /**
   * Get governance report for a service
   */
  async getGovernanceReport(
    repoId: string,
    serviceId: string
  ): Promise<GovernanceReport> {
    const memory = await this.getMemory(repoId, serviceId);
    const violations = await this.getViolationHistory(memory.id);
    const metrics = await this.calculateMetrics(memory.id);
    const trends = await this.calculateTrends(memory.id);
    
    return {
      memory,
      violations,
      metrics,
      trends,
      insights: this.generateInsights(violations, metrics, trends),
    };
  }
}
```

### **Phase 3: Insights Generator**

```typescript
// apps/api/src/services/gatekeeper/governance-memory/insights.ts

export class GovernanceInsightsGenerator {
  generateInsights(
    violations: ViolationHistory[],
    metrics: GovernanceMetrics,
    trends: GovernanceTrends
  ): GovernanceInsight[] {
    const insights: GovernanceInsight[] = [];
    
    // Insight: Long-standing violations
    const longStanding = violations.filter(v => 
      v.status === 'open' && 
      Date.now() - v.firstDetected.getTime() > 120 * 24 * 60 * 60 * 1000  // 120 days
    );
    
    if (longStanding.length > 0) {
      insights.push({
        type: 'long_standing_violation',
        severity: 'high',
        message: `This repo has ${longStanding.length} violations open for >120 days`,
        violations: longStanding.map(v => v.ruleId),
        actionable: true,
        recommendation: 'Prioritize resolution of long-standing violations',
      });
    }
    
    // Insight: Recurring violations
    const recurring = violations.filter(v => v.status === 'recurring');
    if (recurring.length > 0) {
      insights.push({
        type: 'recurring_violation',
        severity: 'medium',
        message: `${recurring.length} violations keep recurring`,
        violations: recurring.map(v => v.ruleId),
        actionable: true,
        recommendation: 'Implement preventive measures or update policy',
      });
    }
    
    // Insight: Degrading adherence
    if (metrics.adherenceTrend === 'degrading') {
      insights.push({
        type: 'degrading_adherence',
        severity: 'high',
        message: 'Policy adherence is degrading over time',
        actionable: true,
        recommendation: 'Review recent changes and reinforce governance practices',
      });
    }
    
    return insights;
  }
}
```

---

## 📈 **Integration with PackEvaluator**

```typescript
// In packEvaluator.ts evaluate() method

// After generating findings
for (const finding of findings) {
  if (finding.evaluationStatus === 'evaluated' && 
      (finding.comparatorResult?.status === 'fail' || 
       finding.comparatorResult?.status === 'unknown')) {
    
    // Record in governance memory
    await governanceMemoryManager.recordViolation(
      context.repo,
      context.repo,  // or extract service ID
      finding,
      context
    );
  }
}

// Check for resolved violations
const memory = await governanceMemoryManager.getMemory(context.repo, context.repo);
for (const violation of memory.violations.filter(v => v.status === 'open')) {
  const stillViolating = findings.some(f => f.ruleId === violation.ruleId);
  if (!stillViolating) {
    await governanceMemoryManager.resolveViolation(
      context.repo,
      context.repo,
      violation.ruleId
    );
  }
}
```

---

## 🎯 **Key Differentiators**

1. **Longitudinal Tracking:** Not just "this PR", but "this repo over 120 days"
2. **Recurring Pattern Detection:** Identifies systemic issues
3. **Time-to-Fix Metrics:** Measures governance effectiveness
4. **Trend Analysis:** Shows improvement or degradation
5. **Actionable Insights:** Generates recommendations

**This is governance memory, not bot reactions.** 🧠

---

## 📋 **Next Steps**

1. **✅ Complete auto-invocation** (in progress)
2. **📋 Design Prisma schema** (governance memory tables)
3. **🔨 Implement memory manager** (CRUD operations)
4. **📊 Build metrics calculator** (adherence scores, trends)
5. **🧠 Implement insights generator** (pattern detection)
6. **📈 Create governance dashboard** (UI for trends/insights)

---

**Bots don't do longitudinal governance. We do.** 🚀

