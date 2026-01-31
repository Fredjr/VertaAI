/**
 * PagerDuty Incident Normalizer
 * 
 * Normalizes PagerDuty incident data into SignalEvent format for drift detection.
 * Extracts timeline, responders, and keywords for process and ownership drift detection.
 * 
 * Phase 3 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 8.2.1
 */

// ============================================================================
// Types
// ============================================================================

export interface PagerDutyIncident {
  id: string;
  incident_number: number;
  title: string;
  description?: string;
  status: string;
  urgency: string;
  service: { id: string; summary: string; name?: string };
  created_at: string;
  resolved_at?: string;
  updated_at?: string;
  assignments: Array<{
    at: string;
    assignee: { id: string; summary: string; name?: string; email?: string };
  }>;
  acknowledgements: Array<{
    at: string;
    acknowledger: { id: string; summary: string; name?: string };
  }>;
  last_status_change_at: string;
  escalation_policy: { id: string; summary: string };
  teams: Array<{ id: string; summary: string }>;
  priority?: { id: string; summary: string; name?: string };
  html_url: string;
  resolved_by?: { id: string; summary: string; name?: string };
  notes?: Array<{ content: string; created_at: string; user: { summary: string } }>;
}

export interface TimelineEvent {
  event: string;
  at: string;
  by?: string;
  details?: string;
}

export interface NormalizedIncident {
  id: string;
  sourceType: 'pagerduty_incident';
  occurredAt: Date;
  service?: string;
  severity: string;
  extracted: {
    title: string;
    summary: string;
    keywords: string[];
    responders: string[];
    timeline: TimelineEvent[];
    escalationPolicy: string;
    teams: string[];
    duration?: number;
    resolvedBy?: string;
    priority?: string;
    notes?: string[];
    // Drift detection hints
    driftTypeHints: string[];
    processDriftEvidence?: string;
    ownershipDriftEvidence?: string;
  };
  rawPayload: unknown;
  incidentId: string;
  incidentUrl: string;
  responders: string[];
}

// ============================================================================
// Normalizer Functions
// ============================================================================

/**
 * Map PagerDuty urgency to severity
 */
function mapSeverity(urgency: string | undefined, priority?: string): string {
  // Priority takes precedence if available
  if (priority) {
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes('p1') || priorityLower.includes('critical')) return 'sev1';
    if (priorityLower.includes('p2') || priorityLower.includes('high')) return 'sev2';
    if (priorityLower.includes('p3') || priorityLower.includes('medium')) return 'sev3';
    if (priorityLower.includes('p4') || priorityLower.includes('low')) return 'sev4';
  }
  
  // Fall back to urgency
  if (urgency === 'high') return 'sev1';
  if (urgency === 'low') return 'sev3';
  return 'sev2';
}

/**
 * Extract service name from incident
 */
function extractServiceName(incident: PagerDutyIncident): string | undefined {
  const serviceName = incident.service?.summary || incident.service?.name;
  if (!serviceName) return undefined;
  return serviceName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Extract keywords from incident text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'was', 'were', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'or', 'but', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'also', 'just', 'more', 'most', 'less', 'least',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'he', 'she', 'him', 'her', 'his', 'hers', 'we', 'us', 'our', 'ours',
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .filter((word, index, self) => self.indexOf(word) === index) // Unique
    .slice(0, 15);
}

/**
 * Build timeline from incident events
 */
function buildTimeline(incident: PagerDutyIncident): TimelineEvent[] {
  const timeline: TimelineEvent[] = [];
  
  // Created event
  timeline.push({
    event: 'created',
    at: incident.created_at,
  });
  
  // Acknowledgements
  for (const ack of incident.acknowledgements || []) {
    timeline.push({
      event: 'acknowledged',
      at: ack.at,
      by: ack.acknowledger?.summary || ack.acknowledger?.name,
    });
  }
  
  // Assignments
  for (const assignment of incident.assignments || []) {
    timeline.push({
      event: 'assigned',
      at: assignment.at,
      by: assignment.assignee?.summary || assignment.assignee?.name,
    });
  }

  // Notes (can indicate process steps taken)
  for (const note of incident.notes || []) {
    timeline.push({
      event: 'note',
      at: note.created_at,
      by: note.user?.summary,
      details: note.content,
    });
  }

  // Resolved event
  if (incident.resolved_at) {
    timeline.push({
      event: 'resolved',
      at: incident.resolved_at,
      by: incident.resolved_by?.summary || incident.resolved_by?.name,
    });
  }

  // Sort by time
  return timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/**
 * Calculate incident duration in milliseconds
 */
function calculateDuration(createdAt: string, resolvedAt: string | undefined): number | undefined {
  if (!resolvedAt) return undefined;
  return new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
}

/**
 * Extract responder emails/names
 */
function extractResponders(incident: PagerDutyIncident): string[] {
  const responders = new Set<string>();

  for (const assignment of incident.assignments || []) {
    const email = assignment.assignee?.email;
    const name = assignment.assignee?.summary || assignment.assignee?.name;
    if (email) responders.add(email);
    else if (name) responders.add(name);
  }

  for (const ack of incident.acknowledgements || []) {
    const name = ack.acknowledger?.summary || ack.acknowledger?.name;
    if (name) responders.add(name);
  }

  if (incident.resolved_by) {
    const name = incident.resolved_by.summary || incident.resolved_by.name;
    if (name) responders.add(name);
  }

  return Array.from(responders);
}

/**
 * Detect drift type hints from incident data
 */
function detectDriftTypeHints(incident: PagerDutyIncident, timeline: TimelineEvent[]): string[] {
  const hints: string[] = [];

  // Process drift: Multiple responders or long timeline suggests process issues
  const responderCount = new Set((incident.assignments || []).map(a => a.assignee?.id)).size;
  const hasNotes = (incident.notes?.length || 0) > 0;

  if (responderCount > 2 || timeline.length > 4 || hasNotes) {
    hints.push('process');
  }

  // Ownership drift: Escalation or multiple assignments
  const hasEscalation = (incident.acknowledgements?.length || 0) > (incident.assignments?.length || 0);
  if (hasEscalation || responderCount > 1) {
    hints.push('ownership');
  }

  // Always include process for resolved incidents (post-mortem opportunity)
  if (incident.status === 'resolved' && !hints.includes('process')) {
    hints.push('process');
  }

  return hints;
}

/**
 * Generate process drift evidence summary
 */
function generateProcessDriftEvidence(timeline: TimelineEvent[]): string | undefined {
  if (timeline.length < 3) return undefined;

  const steps = timeline
    .filter(t => ['acknowledged', 'assigned', 'note', 'resolved'].includes(t.event))
    .map(t => {
      if (t.event === 'note') return `Note by ${t.by}: "${t.details?.substring(0, 50)}..."`;
      return `${t.event} by ${t.by || 'unknown'}`;
    });

  if (steps.length === 0) return undefined;

  return `Incident resolution timeline: ${steps.join(' → ')}`;
}

/**
 * Normalize a PagerDuty incident into SignalEvent format
 */
export function normalizeIncident(
  incident: PagerDutyIncident,
  workspaceId: string
): NormalizedIncident {
  const timeline = buildTimeline(incident);
  const responders = extractResponders(incident);
  const driftTypeHints = detectDriftTypeHints(incident, timeline);
  const textForKeywords = [
    incident.title,
    incident.description || '',
    incident.service?.summary || '',
    ...(incident.notes?.map(n => n.content) || []),
  ].join(' ');

  return {
    id: `pagerduty_incident_${incident.id}`,
    sourceType: 'pagerduty_incident',
    occurredAt: new Date(incident.resolved_at || incident.updated_at || incident.created_at),
    service: extractServiceName(incident),
    severity: mapSeverity(incident.urgency, incident.priority?.summary),
    extracted: {
      title: incident.title,
      summary: incident.description || incident.title,
      keywords: extractKeywords(textForKeywords),
      responders,
      timeline,
      escalationPolicy: incident.escalation_policy?.summary || 'Unknown',
      teams: (incident.teams || []).map(t => t.summary),
      duration: calculateDuration(incident.created_at, incident.resolved_at),
      resolvedBy: incident.resolved_by?.summary,
      priority: incident.priority?.summary,
      notes: incident.notes?.map(n => n.content),
      driftTypeHints,
      processDriftEvidence: generateProcessDriftEvidence(timeline),
      ownershipDriftEvidence: responders.length > 1
        ? `Multiple responders involved: ${responders.join(', ')}`
        : undefined,
    },
    rawPayload: incident,
    incidentId: incident.id,
    incidentUrl: incident.html_url,
    responders,
  };
}

/**
 * Check if an incident is significant enough for drift detection
 */
export function isSignificantIncident(incident: PagerDutyIncident): boolean {
  // Only process resolved incidents
  if (incident.status !== 'resolved') return false;

  // High urgency incidents are always significant
  if (incident.urgency === 'high') return true;

  // Incidents with notes are significant (shows troubleshooting steps)
  if ((incident.notes?.length || 0) > 0) return true;

  // Incidents with multiple responders are significant
  const responderCount = new Set((incident.assignments || []).map(a => a.assignee?.id)).size;
  if (responderCount > 1) return true;

  // Long-running incidents (> 30 minutes) are significant
  const duration = calculateDuration(incident.created_at, incident.resolved_at);
  if (duration && duration > 30 * 60 * 1000) return true;

  return false;
}

/**
 * Create process drift signal from incident timeline
 */
export function createProcessDriftSignal(
  normalized: NormalizedIncident,
  repoFullName: string
): {
  driftType: 'process';
  driftDomains: string[];
  evidenceSummary: string;
  confidence: number;
} | null {
  const { extracted } = normalized;

  // Need timeline with actual steps
  if (extracted.timeline.length < 3) return null;

  // Need evidence of process (notes or multiple actions)
  const hasProcessSteps = extracted.notes && extracted.notes.length > 0;
  const hasMultipleActions = extracted.timeline.filter(t =>
    ['acknowledged', 'assigned', 'note'].includes(t.event)
  ).length >= 2;

  if (!hasProcessSteps && !hasMultipleActions) return null;

  return {
    driftType: 'process',
    driftDomains: ['runbook', 'incident-response', normalized.service || 'unknown'],
    evidenceSummary: extracted.processDriftEvidence ||
      `Incident ${normalized.incidentId} resolved with ${extracted.timeline.length} steps`,
    confidence: hasProcessSteps ? 0.75 : 0.60,
  };
}

/**
 * Create ownership drift signal from incident responders
 */
export function createOwnershipDriftSignal(
  normalized: NormalizedIncident,
  documentedOwner?: string
): {
  driftType: 'ownership';
  driftDomains: string[];
  evidenceSummary: string;
  confidence: number;
} | null {
  const { extracted, responders } = normalized;

  // Need multiple responders to detect ownership issues
  if (responders.length < 2) return null;

  // If we know the documented owner, compare
  if (documentedOwner && !responders.some(r =>
    r.toLowerCase().includes(documentedOwner.toLowerCase())
  )) {
    return {
      driftType: 'ownership',
      driftDomains: ['service-ownership', normalized.service || 'unknown'],
      evidenceSummary: `Documented owner "${documentedOwner}" was not among incident responders: ${responders.join(', ')}`,
      confidence: 0.85,
    };
  }

  // Multiple responders suggests unclear ownership
  return {
    driftType: 'ownership',
    driftDomains: ['service-ownership', normalized.service || 'unknown'],
    evidenceSummary: extracted.ownershipDriftEvidence ||
      `Multiple responders for ${normalized.service}: ${responders.join(', ')}`,
    confidence: 0.60,
  };
}

