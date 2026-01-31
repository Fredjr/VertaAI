/**
 * Datadog/Grafana Alert Normalizer
 * 
 * Normalizes Datadog and Grafana alert webhooks into SignalEvent format.
 * Detects environment_tooling drift from alert configuration changes.
 * 
 * Phase 5 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 3.1
 */

// ============================================================================
// Types
// ============================================================================

export interface DatadogAlert {
  id: string;
  title: string;
  body?: string;
  last_updated?: string;
  event_type?: string;
  alert_type?: string;
  priority?: string;
  tags?: string[];
  host?: string;
  scope?: string;
  aggreg_key?: string;
  // Monitor details
  monitor_id?: number;
  monitor_name?: string;
  monitor_type?: string;
  // Metric details
  metric?: string;
  threshold?: number;
  value?: number;
}

export interface GrafanaAlert {
  dashboardId?: number;
  evalMatches?: Array<{ metric: string; value: number; tags?: Record<string, string> }>;
  imageUrl?: string;
  message?: string;
  orgId?: number;
  panelId?: number;
  ruleId?: number;
  ruleName?: string;
  ruleUrl?: string;
  state?: string;
  tags?: Record<string, string>;
  title?: string;
}

export interface NormalizedAlert {
  id: string;
  sourceType: 'datadog_alert';
  occurredAt: Date;
  service?: string;
  severity: string;
  extracted: {
    title: string;
    summary: string;
    keywords: string[];
    alertType: string;
    metric?: string;
    threshold?: number;
    currentValue?: number;
    tags: string[];
    // Drift detection hints
    driftTypeHints: string[];
    environmentDriftEvidence?: string;
  };
  rawPayload: unknown;
  alertId: string;
  alertUrl?: string;
}

// ============================================================================
// Normalizer Functions
// ============================================================================

/**
 * Extract service name from alert tags or scope
 */
function extractServiceName(alert: DatadogAlert | GrafanaAlert): string | undefined {
  if ('tags' in alert && Array.isArray(alert.tags)) {
    const serviceTag = alert.tags.find(t => t.startsWith('service:'));
    if (serviceTag) return serviceTag.replace('service:', '');
  }
  if ('tags' in alert && typeof alert.tags === 'object' && alert.tags !== null) {
    return (alert.tags as Record<string, string>).service;
  }
  if ('scope' in alert && alert.scope) {
    const match = alert.scope.match(/service:([^,\s]+)/);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Map alert priority/state to severity
 */
function mapSeverity(alert: DatadogAlert | GrafanaAlert): string {
  if ('priority' in alert) {
    const priority = alert.priority?.toLowerCase();
    if (priority === 'p1' || priority === 'critical') return 'critical';
    if (priority === 'p2' || priority === 'high') return 'high';
    if (priority === 'p3' || priority === 'medium') return 'medium';
    return 'low';
  }
  if ('state' in alert) {
    const state = alert.state?.toLowerCase();
    if (state === 'alerting') return 'high';
    if (state === 'pending') return 'medium';
    return 'low';
  }
  return 'medium';
}

/**
 * Extract keywords from alert content
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'it', 'its']);
  
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  return [...new Set(words)].slice(0, 20);
}

/**
 * Detect drift type hints from alert data
 */
function detectDriftTypeHints(alert: DatadogAlert | GrafanaAlert): string[] {
  const hints: string[] = [];
  const text = JSON.stringify(alert).toLowerCase();

  // Environment drift: infrastructure, deployment, config changes
  if (text.includes('deploy') || text.includes('config') || text.includes('infrastructure') ||
      text.includes('cpu') || text.includes('memory') || text.includes('disk') ||
      text.includes('threshold') || text.includes('scaling')) {
    hints.push('environment_tooling');
  }

  // Instruction drift: API, endpoint, service changes
  if (text.includes('api') || text.includes('endpoint') || text.includes('latency') ||
      text.includes('error rate') || text.includes('5xx') || text.includes('4xx')) {
    hints.push('instruction');
  }

  return hints.length > 0 ? hints : ['environment_tooling'];
}

/**
 * Build environment drift evidence from alert
 */
function buildEnvironmentDriftEvidence(alert: DatadogAlert | GrafanaAlert): string {
  const parts: string[] = [];

  if ('metric' in alert && alert.metric) {
    parts.push(`Metric: ${alert.metric}`);
  }
  if ('threshold' in alert && alert.threshold !== undefined) {
    parts.push(`Threshold: ${alert.threshold}`);
  }
  if ('value' in alert && alert.value !== undefined) {
    parts.push(`Current value: ${alert.value}`);
  }
  if ('monitor_type' in alert && alert.monitor_type) {
    parts.push(`Monitor type: ${alert.monitor_type}`);
  }
  if ('state' in alert && alert.state) {
    parts.push(`State: ${alert.state}`);
  }

  return parts.length > 0
    ? `Alert triggered: ${parts.join(', ')}. Documentation may need updating for new thresholds or monitoring configuration.`
    : 'Alert configuration change detected. Review documentation for accuracy.';
}

/**
 * Normalize a Datadog alert into SignalEvent format
 */
export function normalizeDatadogAlert(
  alert: DatadogAlert,
  workspaceId: string
): NormalizedAlert {
  const driftTypeHints = detectDriftTypeHints(alert);
  const textForKeywords = [
    alert.title,
    alert.body || '',
    alert.monitor_name || '',
    ...(alert.tags || []),
  ].join(' ');

  return {
    id: `datadog_alert_${alert.id}`,
    sourceType: 'datadog_alert',
    occurredAt: alert.last_updated ? new Date(alert.last_updated) : new Date(),
    service: extractServiceName(alert),
    severity: mapSeverity(alert),
    extracted: {
      title: alert.title,
      summary: alert.body || alert.title,
      keywords: extractKeywords(textForKeywords),
      alertType: alert.alert_type || alert.monitor_type || 'unknown',
      metric: alert.metric,
      threshold: alert.threshold,
      currentValue: alert.value,
      tags: alert.tags || [],
      driftTypeHints,
      environmentDriftEvidence: buildEnvironmentDriftEvidence(alert),
    },
    rawPayload: alert,
    alertId: alert.id,
    alertUrl: alert.monitor_id ? `https://app.datadoghq.com/monitors/${alert.monitor_id}` : undefined,
  };
}

/**
 * Normalize a Grafana alert into SignalEvent format
 */
export function normalizeGrafanaAlert(
  alert: GrafanaAlert,
  workspaceId: string
): NormalizedAlert {
  const driftTypeHints = detectDriftTypeHints(alert);
  const textForKeywords = [
    alert.title || '',
    alert.message || '',
    alert.ruleName || '',
    ...(alert.evalMatches?.map(m => m.metric) || []),
  ].join(' ');

  const alertId = `grafana_${alert.orgId || 0}_${alert.ruleId || Date.now()}`;

  return {
    id: `datadog_alert_${alertId}`, // Using same sourceType for unified handling
    sourceType: 'datadog_alert',
    occurredAt: new Date(),
    service: extractServiceName(alert),
    severity: mapSeverity(alert),
    extracted: {
      title: alert.title || alert.ruleName || 'Grafana Alert',
      summary: alert.message || alert.title || 'Alert triggered',
      keywords: extractKeywords(textForKeywords),
      alertType: 'grafana',
      metric: alert.evalMatches?.[0]?.metric,
      currentValue: alert.evalMatches?.[0]?.value,
      tags: alert.tags ? Object.entries(alert.tags).map(([k, v]) => `${k}:${v}`) : [],
      driftTypeHints,
      environmentDriftEvidence: buildEnvironmentDriftEvidence(alert),
    },
    rawPayload: alert,
    alertId,
    alertUrl: alert.ruleUrl,
  };
}

/**
 * Check if an alert is significant enough for drift detection
 */
export function isSignificantAlert(alert: DatadogAlert | GrafanaAlert): boolean {
  // High priority/severity alerts are always significant
  if ('priority' in alert && (alert.priority === 'P1' || alert.priority === 'P2')) {
    return true;
  }

  // Alerting state in Grafana is significant
  if ('state' in alert && alert.state === 'alerting') {
    return true;
  }

  // Alerts with specific event types
  if ('event_type' in alert && alert.event_type === 'alert') {
    return true;
  }

  return false;
}

