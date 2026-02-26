# Phase 4: UI Components for Policy Evaluation Graph

**Date**: 2026-02-26  
**Status**: PLANNING  
**Dependencies**: Phase 3 (Policy Evaluation Graph) - ✅ COMPLETE

---

## Executive Summary

**Goal**: Build rich, interactive UI components that visualize the Policy Evaluation Graph, making contract enforcement explainable, trustworthy, and action-guiding.

**Current State**: 
- ✅ Policy Evaluation Graph is built during evaluation
- ✅ Graph data is available in `PackEvaluationResult.evaluationGraph`
- ✅ Basic narrative output in GitHub checks
- ❌ No interactive UI visualization
- ❌ No drill-down capabilities
- ❌ No graph-based navigation

**Target State**:
- Interactive graph visualization showing evaluation flow
- Drill-down from decision → obligations → evidence
- Confidence breakdown by surface
- Timeline view of evaluation steps
- Export capabilities (JSON, PDF, Markdown)

---

## Architecture Overview

### Component Hierarchy

```
PolicyEvaluationViewer (Root)
├── EvaluationSummaryCard (Layer 1: Decision Card)
│   ├── MergeImpactBadge
│   ├── ConfidenceScore
│   └── ActionList
├── EvaluationNarrative (Layer 2: Story)
│   ├── SurfaceDetectionPanel
│   │   ├── SurfaceCard (for each surface)
│   │   └── FileList
│   ├── RuleEvaluationPanel
│   │   ├── RuleCard (for each rule)
│   │   ├── ObligationList
│   │   └── EvidenceViewer
│   └── InvariantCheckPanel
│       └── InvariantCard (for each invariant)
└── StructuredPayload (Layer 3: Machine-readable)
    ├── JSONViewer
    └── ExportButton
```

---

## Component Specifications

### 1. PolicyEvaluationViewer (Root Component)

**Purpose**: Main container that orchestrates the 3-layer output model

**Props**:
```typescript
interface PolicyEvaluationViewerProps {
  evaluationGraph: PackEvaluationGraph;
  mode?: 'full' | 'summary' | 'narrative-only';
  onActionClick?: (action: string) => void;
}
```

**Features**:
- Tab navigation between layers (Summary / Narrative / Payload)
- Responsive layout (mobile, tablet, desktop)
- Dark mode support
- Print-friendly view

---

### 2. EvaluationSummaryCard (Layer 1)

**Purpose**: High-level decision card - answers "Can I merge?"

**Visual Design**:
```
┌─────────────────────────────────────────────────────┐
│  🚫 MERGE BLOCKED                                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                     │
│  Confidence: 🟡 Medium (75%)                        │
│  3/4 checks evaluated, 1 not evaluable              │
│                                                     │
│  📋 Actions Required:                               │
│  1. Add CODEOWNERS file at repository root          │
│  2. Configure check run: VertaAI / Baseline         │
│  3. Review 2 warnings before merging                │
│                                                     │
│  Pack: Baseline Contract v1.0.0                     │
│  Evaluated in 12ms                                  │
└─────────────────────────────────────────────────────┘
```

**Components**:
- `MergeImpactBadge`: Visual indicator (✅/⚠️/🚫)
- `ConfidenceScore`: Progress bar with label
- `ActionList`: Numbered, clickable action items

---

### 3. SurfaceDetectionPanel (Layer 2)

**Purpose**: Shows WHY the evaluation triggered

**Visual Design**:
```
🎯 Detected Change Surfaces

┌─────────────────────────────────────────────────────┐
│ OpenAPI specification changed (2 files)             │
│ Confidence: High (100%)                             │
│ Detection: path-glob                                │
│                                                     │
│ Files:                                              │
│ • api/openapi.yaml                                  │
│ • api/v2/openapi.yaml                               │
│                                                     │
│ Matched globs:                                      │
│ • **/*.openapi.yaml                                 │
│ • **/openapi.yaml                                   │
└─────────────────────────────────────────────────────┘
```

**Features**:
- Expandable file lists
- Confidence visualization
- Detection method badges
- Link to files in GitHub

---

### 4. RuleEvaluationPanel (Layer 2)

**Purpose**: Shows WHAT was checked and the results

**Visual Design**:
```
📋 Triggered Rules (3)

┌─────────────────────────────────────────────────────┐
│ ❌ OpenAPI Spec Must Be Updated When API Changes    │
│ Confidence: 100% | Evaluation: 8ms                  │
│                                                     │
│ Obligations (2):                                    │
│ ✅ OpenAPI file present                             │
│    Found: api/openapi.yaml                          │
│                                                     │
│ ❌ OpenAPI file updated in this PR                  │
│    Expected: api/openapi.yaml to be modified        │
│    Found: File not in changeset                     │
│                                                     │
│ Decision: BLOCK (1 obligation failed)               │
└─────────────────────────────────────────────────────┘
```

**Features**:
- Collapsible rule cards
- Obligation status indicators
- Evidence drill-down
- Timeline of evaluation steps

---

### 5. InvariantCheckPanel (Layer 2)

**Purpose**: Shows cross-artifact consistency checks

**Visual Design**:
```
🔗 Invariant Checks (1)

┌─────────────────────────────────────────────────────┐
│ ✅ OpenAPI Spec ↔ Implementation Parity              │
│                                                     │
│ Source: api/openapi.yaml                            │
│ Target: src/handlers/*.ts                           │
│                                                     │
│ Status: PASS                                        │
│ All endpoints in spec have matching handlers        │
└─────────────────────────────────────────────────────┘
```

**Features**:
- Source/target artifact visualization
- Mismatch highlighting
- Diff view for inconsistencies

---

### 6. StructuredPayload (Layer 3)

**Purpose**: Machine-readable JSON for integrations

**Features**:
- Syntax-highlighted JSON viewer
- Copy to clipboard
- Download as JSON file
- Schema documentation link

---

## Implementation Plan

### Phase 4.1: Core Components (Week 1)

**Tasks**:
1. Create `PolicyEvaluationViewer` root component
2. Implement `EvaluationSummaryCard` with badges
3. Add `ConfidenceScore` visualization
4. Build `ActionList` with click handlers

**Files to Create**:
- `apps/web/src/components/PolicyEvaluation/PolicyEvaluationViewer.tsx`
- `apps/web/src/components/PolicyEvaluation/EvaluationSummaryCard.tsx`
- `apps/web/src/components/PolicyEvaluation/ConfidenceScore.tsx`
- `apps/web/src/components/PolicyEvaluation/ActionList.tsx`

**Effort**: 2-3 days

---

### Phase 4.2: Narrative Components (Week 1-2)

**Tasks**:
1. Build `SurfaceDetectionPanel` with surface cards
2. Implement `RuleEvaluationPanel` with collapsible rules
3. Add `ObligationList` with status indicators
4. Create `EvidenceViewer` with drill-down

**Files to Create**:
- `apps/web/src/components/PolicyEvaluation/SurfaceDetectionPanel.tsx`
- `apps/web/src/components/PolicyEvaluation/SurfaceCard.tsx`
- `apps/web/src/components/PolicyEvaluation/RuleEvaluationPanel.tsx`
- `apps/web/src/components/PolicyEvaluation/RuleCard.tsx`
- `apps/web/src/components/PolicyEvaluation/ObligationList.tsx`
- `apps/web/src/components/PolicyEvaluation/EvidenceViewer.tsx`

**Effort**: 3-4 days

---

### Phase 4.3: Advanced Features (Week 2)

**Tasks**:
1. Add `InvariantCheckPanel` with diff view
2. Implement `StructuredPayload` JSON viewer
3. Add export functionality (JSON, PDF, Markdown)
4. Build timeline view of evaluation steps

**Files to Create**:
- `apps/web/src/components/PolicyEvaluation/InvariantCheckPanel.tsx`
- `apps/web/src/components/PolicyEvaluation/InvariantCard.tsx`
- `apps/web/src/components/PolicyEvaluation/StructuredPayload.tsx`
- `apps/web/src/components/PolicyEvaluation/TimelineView.tsx`
- `apps/web/src/components/PolicyEvaluation/ExportButton.tsx`

**Effort**: 2-3 days

---

### Phase 4.4: Integration & Polish (Week 2-3)

**Tasks**:
1. Integrate with existing PR detail page
2. Add responsive design for mobile
3. Implement dark mode support
4. Add loading states and error handling
5. Write Storybook stories for all components
6. Add unit tests

**Effort**: 3-4 days

---

## API Integration

### Fetch Evaluation Graph

```typescript
// apps/web/src/hooks/usePolicyEvaluation.ts
export function usePolicyEvaluation(prId: string) {
  return useQuery({
    queryKey: ['policy-evaluation', prId],
    queryFn: async () => {
      const response = await fetch(`/api/prs/${prId}/policy-evaluation`);
      const data = await response.json();
      return data.evaluationGraph as PackEvaluationGraph;
    },
  });
}
```

### Backend Endpoint

```typescript
// apps/api/src/routes/prs.ts
router.get('/prs/:prId/policy-evaluation', async (req, res) => {
  const { prId } = req.params;

  // Fetch latest evaluation result from database
  const evaluation = await db.policyEvaluations.findOne({
    where: { prId },
    order: [['createdAt', 'DESC']],
  });

  if (!evaluation) {
    return res.status(404).json({ error: 'No evaluation found' });
  }

  return res.json({
    evaluationGraph: evaluation.evaluationGraph,
    timestamp: evaluation.createdAt,
  });
});
```

---

## Design System Integration

### Color Palette

```typescript
// Confidence levels
const confidenceColors = {
  high: 'green.500',    // 90-100%
  medium: 'yellow.500', // 70-89%
  low: 'red.500',       // 0-69%
};

// Decision outcomes
const decisionColors = {
  pass: 'green.500',
  warn: 'yellow.500',
  block: 'red.500',
};

// Detection methods
const detectionBadges = {
  'path-glob': { bg: 'blue.100', color: 'blue.800' },
  'heuristic': { bg: 'purple.100', color: 'purple.800' },
  'explicit': { bg: 'gray.100', color: 'gray.800' },
};
```

### Typography

```typescript
// Headings
const headings = {
  h1: { fontSize: '2xl', fontWeight: 'bold' },
  h2: { fontSize: 'xl', fontWeight: 'semibold' },
  h3: { fontSize: 'lg', fontWeight: 'medium' },
};

// Body text
const body = {
  default: { fontSize: 'md', lineHeight: '1.5' },
  small: { fontSize: 'sm', lineHeight: '1.4' },
};
```

---

## Testing Strategy

### Unit Tests

```typescript
// PolicyEvaluationViewer.test.tsx
describe('PolicyEvaluationViewer', () => {
  it('renders summary card with correct decision', () => {
    const graph = mockPackEvaluationGraph({ decision: 'block' });
    render(<PolicyEvaluationViewer evaluationGraph={graph} />);
    expect(screen.getByText(/MERGE BLOCKED/i)).toBeInTheDocument();
  });

  it('shows confidence score with correct percentage', () => {
    const graph = mockPackEvaluationGraph({
      coverage: { evaluable: 3, total: 4, notEvaluable: 1 }
    });
    render(<PolicyEvaluationViewer evaluationGraph={graph} />);
    expect(screen.getByText(/75%/i)).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
// PolicyEvaluation.integration.test.tsx
describe('Policy Evaluation Integration', () => {
  it('fetches and displays evaluation graph', async () => {
    mockAPI.get('/api/prs/123/policy-evaluation').reply(200, {
      evaluationGraph: mockGraph,
    });

    render(<PRDetailPage prId="123" />);

    await waitFor(() => {
      expect(screen.getByText(/Policy Evaluation/i)).toBeInTheDocument();
    });
  });
});
```

---

## Success Metrics

### User Experience
- ✅ Users can understand WHY a rule triggered in < 10 seconds
- ✅ Users can find actionable remediation in < 5 seconds
- ✅ Confidence score helps users trust the decision

### Technical
- ✅ All components have > 80% test coverage
- ✅ Page load time < 2 seconds
- ✅ Mobile-responsive on all screen sizes
- ✅ Accessible (WCAG 2.1 AA compliant)

### Product
- ✅ 50% reduction in "Why did this fail?" support tickets
- ✅ 30% increase in policy pack adoption
- ✅ 90% user satisfaction score

---

## Future Enhancements (Phase 5+)

1. **Graph Visualization**: Interactive node-edge graph showing evaluation flow
2. **Historical Comparison**: Compare evaluations across PR commits
3. **AI-Powered Suggestions**: Use LLM to suggest fixes based on failures
4. **Slack/Teams Integration**: Send evaluation summaries to chat
5. **Custom Dashboards**: Team-level policy compliance dashboards

---

**Last Updated**: 2026-02-26 21:00 UTC
**Status**: Ready for implementation
**Dependencies**: Phase 3 complete ✅


