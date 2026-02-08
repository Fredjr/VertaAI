# VertaAI Transformation: Project Build Order

## Overview
**Total Duration**: 10 weeks (50 working days)  
**Team Size**: 3-4 engineers + 1 PM + 1 designer  
**Methodology**: Agile with 2-week sprints  

## Phase 1: Foundation (Weeks 1-2) - 10 days

### Sprint 1.1: EvidenceBundle Pattern (Days 1-5)
**Priority**: P0 (Blocking for all other work)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create EvidenceBundle type definitions | Backend Lead | 1 day | - | `apps/api/src/services/evidence/types.ts` |
| Implement buildEvidenceBundle() core | Backend Lead | 2 days | Types | `apps/api/src/services/evidence/builder.ts` |
| Add source-specific evidence builders | Backend Dev | 2 days | Core builder | 7 source extractors (GitHub, PagerDuty, etc.) |
| Create deterministic excerpt extractors | Backend Dev | 1 day | Evidence builders | Diff, timeline, message extractors |
| Unit tests for EvidenceBundle | QA/Backend | 1 day | All builders | 90%+ test coverage |

### Sprint 1.2: Multi-Source Impact Assessment (Days 6-10)
**Priority**: P0 (Enables deterministic decisions)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create ImpactInputs type system | Backend Lead | 1 day | EvidenceBundle | `apps/api/src/services/impact/types.ts` |
| Implement buildImpactInputs() | Backend Dev | 2 days | Types | 7 source-specific adapters |
| Create target surface classification | Backend Dev | 1 day | Types | `getTargetSurface()` function |
| Update impact engine for multi-source | Backend Lead | 1 day | Impact inputs | Enhanced `computeImpact()` |
| Integration tests | QA | 1 day | All components | End-to-end impact assessment |

## Phase 2: Truth-Making System (Weeks 3-4) - 10 days

### Sprint 2.1: DocClaim Extraction (Days 11-15)
**Priority**: P0 (Eliminates LLM hallucination)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create DocClaim type definitions | Backend Lead | 0.5 days | - | `DocClaim` and `DocClaimResult` types |
| Implement extractDocClaims() router | Backend Lead | 0.5 days | Types | Main extraction function |
| Build 8 doc-system extractors | Backend Dev | 3 days | Router | Confluence, Swagger, Backstage, etc. |
| Create helper functions | Backend Dev | 1 day | Extractors | `findTokenWindow()`, `extractStepSkeleton()` |
| Unit tests for all extractors | QA | 1 day | All extractors | Test coverage for each doc system |

### Sprint 2.2: Deterministic Feedback Loop (Days 16-20)
**Priority**: P1 (Prevents fatigue death spiral)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create fingerprint generation | Backend Dev | 1 day | - | 3-level fingerprint system |
| Implement suppression checking | Backend Dev | 1 day | Fingerprints | `isSuppressed()` function |
| Create outcome recording | Backend Dev | 1 day | Suppression | False positive/snooze/verified handlers |
| Database migration for suppressions | Backend Lead | 0.5 days | - | `DriftSuppression` table |
| Update Slack handlers for outcomes | Frontend Dev | 1.5 days | Outcome recording | Button click handlers |

## Phase 3: Control-Plane Architecture (Weeks 5-6) - 10 days

### Sprint 3.1: DriftPlan System (Days 21-25)
**Priority**: P0 (Core control-plane component)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create DriftPlan data model | Backend Lead | 1 day | - | Prisma schema + types |
| Implement plan resolver algorithm | Backend Lead | 2 days | Data model | 5-step fallback hierarchy |
| Create plan templates | Backend Dev | 1 day | Resolver | JSON templates for common patterns |
| Build /plans API endpoints | Backend Dev | 1 day | Templates | CRUD operations for plans |
| Create plan management UI | Frontend Dev | 2 days | API | React components for plan editing |

### Sprint 3.2: Coverage Health Monitoring (Days 26-30)
**Priority**: P1 (Enables proactive monitoring)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create CoverageSnapshot model | Backend Lead | 0.5 days | - | Database schema |
| Implement coverage calculation | Backend Dev | 1.5 days | Model | Mapping/processing coverage logic |
| Create daily snapshot job | Backend Dev | 1 day | Calculation | QStash scheduled job |
| Build coverage dashboard | Frontend Dev | 2 days | Snapshot job | React dashboard with charts |
| Add coverage obligations | Backend Dev | 1 day | Dashboard | Alert thresholds + notifications |

## Phase 4: Enterprise Features (Weeks 7-8) - 10 days

### Sprint 4.1: Advanced Suppression & State Machine (Days 31-35)
**Priority**: P1 (Production readiness)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Integrate EvidenceBundle into state machine | Backend Lead | 2 days | EvidenceBundle | Updated state handlers |
| Implement escalation logic | Backend Dev | 1 day | State machine | Strict → medium fingerprint escalation |
| Create Slack message from bundle | Frontend Dev | 2 days | State machine | Zero-LLM Slack blocks |
| Add suppression to eligibility check | Backend Dev | 1 day | Escalation | Early suppression filtering |
| Performance optimization | Backend Lead | 1 day | All components | Query optimization + caching |

### Sprint 4.2: Audit & Compliance (Days 36-40)
**Priority**: P2 (Enterprise sales enabler)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create audit trail storage | Backend Dev | 1 day | EvidenceBundle | Immutable audit log |
| Implement evidence bundle queries | Backend Dev | 1 day | Audit storage | Search/filter API |
| Build audit dashboard | Frontend Dev | 2 days | Query API | Compliance reporting UI |
| Add plan version tracking | Backend Dev | 1 day | DriftPlan | SHA-256 versioning |
| Create compliance export | Backend Dev | 1 day | Audit dashboard | CSV/PDF export for auditors |

## Phase 5: Scale & Polish (Weeks 9-10) - 10 days

### Sprint 5.1: Performance & Analytics (Days 41-45)
**Priority**: P2 (Scale preparation)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Database indexing optimization | Backend Lead | 1 day | All schemas | Optimized queries |
| Implement bundle caching | Backend Dev | 1 day | EvidenceBundle | Redis caching layer |
| Create analytics dashboard | Frontend Dev | 2 days | All data | Metrics and KPI tracking |
| Add performance monitoring | DevOps | 1 day | Analytics | APM integration |
| Load testing | QA | 1 day | Monitoring | Performance benchmarks |

### Sprint 5.2: Enterprise Onboarding (Days 46-50)
**Priority**: P2 (Go-to-market enabler)

| Task | Owner | Effort | Dependencies | Deliverables |
|------|-------|--------|--------------|--------------|
| Create onboarding wizard | Frontend Dev | 2 days | All features | Step-by-step setup flow |
| Build plan template library | Product | 1 day | Templates | Pre-built enterprise patterns |
| Create admin panel | Frontend Dev | 1 day | Onboarding | Multi-tenant management |
| Documentation and guides | Technical Writer | 1 day | Admin panel | User guides and API docs |
| Beta customer testing | PM | 1 day | Documentation | Feedback collection and iteration |

## Dependencies & Critical Path

### Critical Path (40 days)
1. EvidenceBundle Pattern (5 days)
2. Multi-Source Impact Assessment (5 days) 
3. DocClaim Extraction (5 days)
4. DriftPlan System (5 days)
5. State Machine Integration (5 days)
6. Slack Message from Bundle (5 days)
7. Performance Optimization (5 days)
8. Enterprise Onboarding (5 days)

### Parallel Workstreams
- **Frontend**: Can work on UI components while backend APIs are being built
- **QA**: Can write tests in parallel with feature development
- **DevOps**: Can set up infrastructure while features are being developed

## Resource Allocation

### Backend Team (2 engineers)
- **Backend Lead**: Architecture, complex algorithms, performance
- **Backend Dev**: Feature implementation, integrations, testing

### Frontend Team (1 engineer)
- **Frontend Dev**: React components, dashboards, Slack integration

### Cross-Functional (2 people)
- **PM**: Coordination, requirements, customer feedback
- **QA/DevOps**: Testing, infrastructure, deployment

## Risk Mitigation

### Technical Risks
- **Complexity Overload**: Phased rollout with feature flags
- **Performance Issues**: Early load testing and optimization
- **Integration Failures**: Comprehensive integration testing

### Timeline Risks
- **Scope Creep**: Strict sprint boundaries and backlog prioritization
- **Resource Constraints**: Cross-training and knowledge sharing
- **External Dependencies**: Early identification and mitigation plans

## Success Criteria

### Phase 1 Success
- ✅ EvidenceBundle pattern working for all 7 source types
- ✅ Multi-source impact assessment with deterministic scoring
- ✅ <5% false positive rate improvement

### Phase 2 Success  
- ✅ Zero LLM hallucination in doc claim extraction
- ✅ Suppression system reducing notification fatigue by 60%
- ✅ Complete audit trail for all decisions

### Phase 3 Success
- ✅ DriftPlan system managing 100+ plans across workspaces
- ✅ Coverage health monitoring with proactive alerts
- ✅ Plan templates enabling rapid enterprise onboarding

### Final Success
- ✅ 90%+ documentation coverage across critical services
- ✅ <2 hour response time for high-impact drift
- ✅ Enterprise-ready with SOX/SOC2 compliance features
- ✅ 40-60% reduction in LLM token costs
