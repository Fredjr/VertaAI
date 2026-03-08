/**
 * VertaAI Governance VSCode Extension
 *
 * THREE real-time signals — fires without waiting for a PR or commit:
 *
 * 1. FILE WATCHER (.claude/GOVERNANCE.md)
 *    Written by claudeMdWriter.ts within seconds of a CloudTrail/GCP event.
 *    Fires instantly when the file changes. Primary signal.
 *
 * 2. SSE STREAM (/api/governance/events/:workspaceId)
 *    Opened on activation when configured. Receives drift_updated events pushed
 *    directly from runtimeDriftMonitor after every non-petty drift cluster event.
 *    Sub-second latency from CloudTrail ingest to VSCode notification.
 *    Replaces the 60-second polling fallback.
 *
 * 3. LOCAL CAPABILITY SCANNER (Track 0 + pre-commit Track 1)
 *    Watches all source files (*.ts, *.js, *.py, *.go) for saves.
 *    Detects capability-indicating code patterns (S3 writes, IAM calls, DB writes, etc.)
 *    Shows inline DiagnosticCollection hints BEFORE code is committed or pushed.
 *    Developer sees the warning the moment the LLM writes the code.
 *
 * TRACK 0 — CLAUDE.md injection (setup wizard)
 *    Writes .claude/CLAUDE.md with governance rules that instruct Claude Code to
 *    call check_capability_intent before writing any infrastructure code.
 *    This makes Track 0 automatic — the AI reads the rules on every session start.
 *
 * COMPATIBILITY:
 *   Claude Code: MCP resource + CLAUDE.md rules (Track 0 + Track 1)
 *   Augment:     MCP resource via augment settings (Track 1)
 *   Copilot:     VSCode Language Model Tool (vscode.lm.registerTool) + .github/copilot-instructions.md (Track 0)
 *   Cursor:      .cursor/mcp.json (Track 0 via MCP)
 *   VS Code MCP: .vscode/mcp.json (Track 0 via native MCP, VS Code 1.99+)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GOVERNANCE_FILE_GLOB = '**/.claude/GOVERNANCE.md';
const EXTENSION_NAME = 'VertaAI';

// File extensions that the capability scanner watches
const CODE_FILE_GLOB = '**/*.{ts,tsx,js,jsx,py,go,java,rb,rs}';

// Headline regex: matches "**service** · `capability:target`" or "**service** — `capability:target`"
const HEADLINE_RE = /\*\*([^*]+)\*\*\s[·\u2014]\s(`[^`]+`)/u;

// ─────────────────────────────────────────────────────────────────────────────
// Local capability scanner — detects infrastructure access in source files
// Fires on every save, before commit, before push.
// Patterns are conservative: only flag high-confidence capability indicators.
// ─────────────────────────────────────────────────────────────────────────────

interface CapabilityPattern {
  pattern: RegExp;
  type: string;
  label: string;
  /** DiagnosticSeverity: 0=Error, 1=Warning, 2=Info, 3=Hint */
  severity: vscode.DiagnosticSeverity;
}

const CAPABILITY_PATTERNS: CapabilityPattern[] = [
  // S3 writes — always flag; typically need declaration
  { pattern: /(?:s3|S3Client|s3Client)[\s\S]{0,60}(?:putObject|upload|copyObject|PutObjectCommand|createMultipartUpload)/,
    type: 's3_write', label: 'S3 write', severity: vscode.DiagnosticSeverity.Warning },
  // S3 reads
  { pattern: /(?:s3|S3Client|s3Client)[\s\S]{0,60}(?:getObject|headObject|GetObjectCommand|listObjects|getSignedUrl)/,
    type: 's3_read', label: 'S3 read', severity: vscode.DiagnosticSeverity.Information },
  // S3 deletes
  { pattern: /(?:s3|S3Client|s3Client)[\s\S]{0,60}(?:deleteObject|DeleteObjectCommand)/,
    type: 's3_delete', label: 'S3 delete', severity: vscode.DiagnosticSeverity.Warning },
  // IAM — always critical
  { pattern: /(?:iam|IAMClient|iamClient)[\s\S]{0,60}(?:createRole|putRolePolicy|attachRolePolicy|CreateRoleCommand|createPolicy|PutRolePolicyCommand)/,
    type: 'iam_modify', label: 'IAM modification', severity: vscode.DiagnosticSeverity.Error },
  // Secrets read
  { pattern: /(?:secretsManager|SecretsManager|ssm|SSMClient)[\s\S]{0,60}(?:getSecretValue|GetSecretValueCommand|getParameter|GetParameterCommand)/,
    type: 'secret_read', label: 'Secrets read', severity: vscode.DiagnosticSeverity.Warning },
  // Secrets write
  { pattern: /(?:secretsManager|SecretsManager)[\s\S]{0,60}(?:putSecretValue|createSecret|PutSecretValueCommand|CreateSecretCommand)/,
    type: 'secret_write', label: 'Secrets write', severity: vscode.DiagnosticSeverity.Error },
  // DB writes (Prisma)
  { pattern: /prisma\.\w+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/,
    type: 'db_write', label: 'DB write', severity: vscode.DiagnosticSeverity.Information },
  // DB admin (raw queries / schema)
  { pattern: /prisma\.\$(?:executeRaw|executeRawUnsafe|queryRaw)|CREATE TABLE|ALTER TABLE|DROP TABLE/i,
    type: 'db_admin', label: 'DB admin (schema change)', severity: vscode.DiagnosticSeverity.Warning },
  // Infra creation
  { pattern: /new\s+(?:\w+\.)?(?:Stack|App)\s*\(|new\s+(?:aws_)?Construct\s*\(/,
    type: 'infra_create', label: 'Infrastructure definition', severity: vscode.DiagnosticSeverity.Information },
];

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let lastNotificationBySeverity: Record<string, number> = {};
let governanceFileFound = false;
let sseRequest: http.ClientRequest | undefined;
let sseReconnectTimer: NodeJS.Timeout | undefined;
let capabilityDiagnostics: vscode.DiagnosticCollection;

// ── Track 0/1 enhanced: session tracking, policy budgets, coding drift ────────

/** UUID for the current coding session — stable across file saves, reset on new window. */
let currentSessionId: string | undefined;

/** Relative paths of files saved/modified in this session (for spaghetti budget). */
const sessionFilesTouched = new Set<string>();

/** Policy thresholds fetched from effective-policy-summary at session start. */
let policyBudgets = {
  maxFilesChanged: 20,
  maxNewAbstractions: 3,
  blockedCapabilities: [] as string[],
  requireDeclaration: [] as string[],
};

/** Accumulated capabilities from local scanner — drained by reportScanToApi (debounced). */
const pendingCapabilities: Array<{ type: string; target?: string; file: string; line: number }> = [];

/** Debounce timer for reportScanToApi. */
let scanReportTimer: NodeJS.Timeout | undefined;

/** Interval for polling git diff (P2 — unstaged changes). */
let gitDiffTimer: NodeJS.Timeout | undefined;

/** Last known set of unstaged file paths (for delta detection). */
let lastGitDiffFiles = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// CodeLens provider — AI provenance at line 0
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shows a CodeLens at line 0 of each source file showing which AI agent introduced it,
 * the PR number, quality score, and test coverage status.
 *
 * Queries the /code-provenance endpoint which searches IntentArtifact.specBuildFindings
 * for the relative file path — no new DB schema required.
 *
 * Cache TTL: 30 seconds per file to avoid hammering the API.
 */
class VertaAICodeLensProvider implements vscode.CodeLensProvider {
  private readonly lensCache = new Map<string, { lenses: vscode.CodeLens[]; ts: number }>();
  private readonly TTL_MS = 30_000;

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const cfg = vscode.workspace.getConfiguration('vertaai');
    const workspaceId = cfg.get<string>('workspaceId', '');
    const apiUrl = cfg.get<string>('apiUrl', 'http://localhost:3001');
    if (!workspaceId) return [];

    const filePath = vscode.workspace.asRelativePath(document.uri);
    const cacheKey = `${workspaceId}:${filePath}`;
    const cached = this.lensCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.TTL_MS) return cached.lenses;

    try {
      const resp = await fetch(
        `${apiUrl}/api/workspaces/${workspaceId}/code-provenance?filePath=${encodeURIComponent(filePath)}`
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      if (!data.provenance?.length) return [];

      const top = data.provenance[0];
      const agentLabel = top.agentIdentity?.id
        ?? (top.authorType === 'AGENT' ? 'AI agent' : 'Human');
      const qualityLabel = top.qualityScore != null ? ` | Quality: ${top.qualityScore}/100` : '';
      const testLabel = top.hasTests ? '' : ' | \u26a0 0 tests';

      const lens = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: `\uD83E\uDD16 ${agentLabel} \u00b7 PR #${top.prNumber}${qualityLabel}${testLabel}`,
        command: 'vertaai.showGovernance',
        tooltip: `Introduced by ${agentLabel} in PR #${top.prNumber}. Click for governance details.`,
        arguments: [],
      });

      const lenses = [lens];
      this.lensCache.set(cacheKey, { lenses, ts: Date.now() });
      return lenses;
    } catch {
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation
// ─────────────────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  // Status bar — always visible, click to open governance panel
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'vertaai.showGovernance';
  setStatusBar('idle');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Diagnostic collection for inline capability hints
  capabilityDiagnostics = vscode.languages.createDiagnosticCollection('vertaai-capabilities');
  context.subscriptions.push(capabilityDiagnostics);

  // CodeLens provider — AI provenance at line 0 of source files
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*.{ts,tsx,js,jsx,py,go,java,rb}' },
      new VertaAICodeLensProvider()
    )
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vertaai.showGovernance', openGovernanceFile),
    vscode.commands.registerCommand('vertaai.refresh', refresh),
    vscode.commands.registerCommand('vertaai.setup', runSetupWizard),
  );

  // ── First-run detection ───────────────────────────────────────────────────
  // If this is a new install (no workspaceId configured), prompt the developer
  // to run Setup so they know the extension is active and needs configuration.
  const cfg = vscode.workspace.getConfiguration('vertaai');
  if (!cfg.get<string>('workspaceId')) {
    // Only show once per VS Code session to avoid being annoying on every window open
    const shownKey = 'vertaai.setupPromptShown';
    if (!context.globalState.get<boolean>(shownKey)) {
      context.globalState.update(shownKey, true);
      vscode.window
        .showInformationMessage(
          '$(shield) VertaAI Governance is installed. Run setup to activate real-time drift alerts.',
          'Run Setup Now',
          'Later',
        )
        .then(action => {
          if (action === 'Run Setup Now') vscode.commands.executeCommand('vertaai.setup');
        });
    }
  }

  // ── Signal 1: GOVERNANCE.md file watcher ─────────────────────────────────
  const watcher = vscode.workspace.createFileSystemWatcher(GOVERNANCE_FILE_GLOB);
  watcher.onDidChange(uri => readGovernanceFile(uri));
  watcher.onDidCreate(uri => {
    governanceFileFound = true;
    readGovernanceFile(uri);
  });
  watcher.onDidDelete(() => {
    governanceFileFound = false;
    setStatusBar('idle');
  });
  context.subscriptions.push(watcher);

  // ── Signal 3: Local capability scanner ───────────────────────────────────
  // Fires on every file save — before commit, before push.
  // Also tracks files touched for spaghetti budget enforcement (GAP 6).
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (/\.(ts|tsx|js|jsx|py|go|java|rb|rs)$/.test(doc.fileName)) {
        // Track file for session budget
        const rel = vscode.workspace.asRelativePath(doc.uri);
        sessionFilesTouched.add(rel);
        checkSpaghettibudget();

        // Run inline diagnostics + accumulate for API report
        scanDocumentForCapabilities(doc);

        // Schedule debounced report to API (GAP 2)
        scheduleScanReport();
      }
    }),
  );

  // Scan already-open documents on activation
  vscode.workspace.textDocuments.forEach(doc => {
    if (/\.(ts|tsx|js|jsx|py|go|java|rb|rs)$/.test(doc.fileName)) {
      scanDocumentForCapabilities(doc);
    }
  });

  // Initial governance file load
  vscode.workspace.findFiles(GOVERNANCE_FILE_GLOB, null, 1).then(files => {
    if (files.length > 0) {
      governanceFileFound = true;
      readGovernanceFile(files[0]!);
    } else {
      setStatusBar('idle');
    }
  });

  // ── Track 0: VSCode Language Model Tool ──────────────────────────────────
  // Registers check_capability_intent as a vscode.lm tool so Copilot (and any
  // future LM-connected assistant in VS Code) can call it as a pre-flight check.
  // The tool declaration in package.json contributes.languageModelTools makes VS Code
  // surface it to the LM. The handler here executes it via the REST API.
  if (vscode.lm && typeof vscode.lm.registerTool === 'function') {
    context.subscriptions.push(
      vscode.lm.registerTool<{ service: string; capabilities: Array<{ type: string; target?: string }> }>(
        'vertaai_check_capability_intent',
        {
          invoke: async (options, _token) => {
            const { service, capabilities } = options.input;
            const resultText = await callCapabilityIntentCheckApi(service, capabilities);
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(resultText),
            ]);
          },
        },
      ),
    );

    // declare_session_intent — call this at the START of a vibe coding session
    context.subscriptions.push(
      vscode.lm.registerTool<{
        rawPrompt: string;
        service?: string;
        ticketRef?: string;
        scopeHint?: string;
      }>(
        'vertaai_declare_session_intent',
        {
          invoke: async (options, _token) => {
            const { rawPrompt, service, ticketRef, scopeHint } = options.input;
            const resultText = await callDeclareSessionIntentApi(rawPrompt, service, ticketRef, scopeHint);
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(resultText),
            ]);
          },
        },
      ),
    );

    console.log(`[${EXTENSION_NAME}] VSCode LM Tools registered — Track 0 active for Copilot`);
  }

  // ── Signal 2: SSE stream (if configured) ─────────────────────────────────
  // Connect after a short delay to let the workspace fully initialize.
  setTimeout(() => connectSseStream(), 2_000);

  // Reconnect SSE when settings change (new workspaceId or apiUrl)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('vertaai.apiUrl') || e.affectsConfiguration('vertaai.workspaceId')) {
        disconnectSseStream();
        setTimeout(() => connectSseStream(), 500);
        // Re-initialize session with new config
        setTimeout(() => initSession(), 1_000);
      }
    }),
  );

  // ── Track 0/1: Session initialization ────────────────────────────────────
  // Generate a stable session ID and declare the session to the API so Track 1
  // has live context. Also fetches the effective policy for local budget enforcement.
  setTimeout(() => initSession(), 3_000); // after SSE connects

  // ── Track 1: Git diff watcher (P2) ───────────────────────────────────────
  // Polls `git diff --name-only HEAD` every 30s to detect unstaged changes.
  // Tracks files the agent has touched (even before a save) for budget counting.
  gitDiffTimer = setInterval(() => checkGitDiff(), 30_000);
  context.subscriptions.push({ dispose: () => { if (gitDiffTimer) clearInterval(gitDiffTimer); } });

  console.log(`[${EXTENSION_NAME}] Activated — file watcher + SSE stream + capability scanner ready`);
}

export function deactivate(): void {
  disconnectSseStream();
  capabilityDiagnostics?.dispose();
  statusBarItem?.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 2: SSE stream connection
// ─────────────────────────────────────────────────────────────────────────────

function connectSseStream(): void {
  const config = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = config.get<string>('workspaceId');
  const apiUrl = config.get<string>('apiUrl');
  if (!workspaceId || !apiUrl) return; // not configured

  let url: URL;
  try {
    url = new URL(`/api/governance/events/${workspaceId}`, apiUrl);
  } catch {
    return; // malformed URL
  }

  const transport = url.protocol === 'https:' ? https : http;

  sseRequest = transport.get(url.toString(), {
    headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
  }, res => {
    if (res.statusCode !== 200) {
      console.warn(`[${EXTENSION_NAME}] SSE: unexpected status ${res.statusCode} — retrying in 30s`);
      scheduleReconnect(30_000);
      return;
    }

    res.setEncoding('utf-8');
    let buffer = '';

    res.on('data', (chunk: string) => {
      buffer += chunk;
      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const eventLine = part.match(/^event:\s*(.+)$/m)?.[1]?.trim();
        const dataLine = part.match(/^data:\s*(.+)$/m)?.[1]?.trim();

        if (eventLine === 'drift_updated') {
          // Track B: production drift — refresh governance file + GOVERNANCE.md
          onSseDriftUpdated();
        } else if (eventLine === 'coding_drift' && dataLine) {
          // Track 1: coding-time drift — server confirmed undeclared capabilities in live code
          try {
            const payload = JSON.parse(dataLine);
            onSseCodingDrift(payload);
          } catch { /* malformed data — ignore */ }
        }
      }
    });

    res.on('end', () => {
      console.log(`[${EXTENSION_NAME}] SSE stream closed — reconnecting in 5s`);
      scheduleReconnect(5_000);
    });
  });

  sseRequest.on('error', (err: Error) => {
    console.warn(`[${EXTENSION_NAME}] SSE error: ${err.message} — retrying in 15s`);
    scheduleReconnect(15_000);
  });

  sseRequest.end();
  console.log(`[${EXTENSION_NAME}] SSE stream connected for workspace ${workspaceId}`);
}

function disconnectSseStream(): void {
  if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = undefined; }
  if (sseRequest) { sseRequest.destroy(); sseRequest = undefined; }
}

function scheduleReconnect(delayMs: number): void {
  if (sseReconnectTimer) return; // already scheduled
  sseReconnectTimer = setTimeout(() => {
    sseReconnectTimer = undefined;
    connectSseStream();
  }, delayMs);
}

/** Called immediately when an SSE drift_updated event arrives. */
function onSseDriftUpdated(): void {
  // If the governance file exists, re-read it to get the latest content.
  // claudeMdWriter.ts updates it within milliseconds of a drift cluster write.
  vscode.workspace.findFiles(GOVERNANCE_FILE_GLOB, null, 1).then(files => {
    if (files.length > 0) {
      readGovernanceFile(files[0]!);
    } else {
      // No local file — fetch from API and update status bar + dynamically write GOVERNANCE.md (GAP 5)
      fetchApiContent().then(content => {
        if (content) {
          processGovernanceMarkdown(content, 'api');
          writeGovernanceMd(content); // persist so future reads are file-based
        }
      });
    }
  });
}

/**
 * Handle a coding_drift SSE event from the server (GAP 3).
 * The server fires this when the scan-report endpoint detected undeclared capabilities.
 * Show a warning notification and reinforce the existing inline squiggles.
 */
function onSseCodingDrift(payload: {
  sessionId?: string;
  undeclared?: Array<{ type: string; target?: string; file: string; line: number }>;
  sessionBudget?: { filesUsed: number; filesWarning: number; filesMax: number };
}): void {
  const undeclared = payload.undeclared ?? [];
  const budget = payload.sessionBudget;

  if (undeclared.length === 0) return;

  const typeList = [...new Set(undeclared.map(u => u.type))].join(', ');
  const budgetMsg = budget && budget.filesUsed >= budget.filesWarning
    ? ` | Budget: ${budget.filesUsed}/${budget.filesMax} files`
    : '';

  const now = Date.now();
  if (now - (lastNotificationBySeverity['coding_drift'] ?? 0) < 60_000) return; // 1min cooldown
  lastNotificationBySeverity['coding_drift'] = now;

  vscode.window
    .showWarningMessage(
      `⚠️ VertaAI: Undeclared capability detected in live code — ${typeList}${budgetMsg}`,
      'View Details',
      'Dismiss',
    )
    .then(action => {
      if (action === 'View Details') openGovernanceFile();
    });

  console.log(`[${EXTENSION_NAME}] coding_drift: ${undeclared.length} undeclared capabilities — ${typeList}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 3: Local capability scanner
// ─────────────────────────────────────────────────────────────────────────────

function scanDocumentForCapabilities(doc: vscode.TextDocument): void {
  const text = doc.getText();
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = vscode.workspace.asRelativePath(doc.uri);

  // Remove stale pending entries for this file before re-scanning
  for (let i = pendingCapabilities.length - 1; i >= 0; i--) {
    if (pendingCapabilities[i]!.file === filePath) pendingCapabilities.splice(i, 1);
  }

  for (const { pattern, type, label, severity } of CAPABILITY_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');

    while ((match = globalPattern.exec(text)) !== null) {
      const pos = doc.positionAt(match.index);
      const endPos = doc.positionAt(match.index + match[0].length);
      const range = new vscode.Range(pos, endPos);

      const message =
        `VertaAI: \`${type}\` (${label}) detected — ` +
        `verify this capability is declared in your IntentArtifact. ` +
        `Ask Claude: "check_capability_intent for ${type}"`;

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.source = 'VertaAI';
      diagnostic.code = type;
      diagnostics.push(diagnostic);

      // Also accumulate for API scan-report (GAP 2)
      pendingCapabilities.push({ type, file: filePath, line: pos.line });

      if (diagnostics.length >= 20) break;
    }
    if (diagnostics.length >= 20) break;
  }

  capabilityDiagnostics.set(doc.uri, diagnostics);
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance file reader (Signal 1)
// ─────────────────────────────────────────────────────────────────────────────

async function readGovernanceFile(uri: vscode.Uri): Promise<void> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    processGovernanceMarkdown(content, 'file');
  } catch {
    setStatusBar('idle');
  }
}

async function refresh(): Promise<void> {
  const files = await vscode.workspace.findFiles(GOVERNANCE_FILE_GLOB, null, 1);
  if (files.length > 0) {
    await readGovernanceFile(files[0]!);
    vscode.window.showInformationMessage(`${EXTENSION_NAME}: Governance status refreshed`);
  } else {
    await pollApiOnce();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown parser → severity classification
// ─────────────────────────────────────────────────────────────────────────────

interface GovernanceState {
  severity: 'critical' | 'operational' | 'clean' | 'idle';
  headline: string | null;
  content: string;
}

function parseGovernanceMarkdown(content: string): GovernanceState {
  const isCritical = content.includes('### 🚨 Critical');
  const isOperational = content.includes('### ⚠️ Operational');
  const isClean = content.includes('✅ **No active drift alerts**');

  if (isCritical) {
    const match = content.match(HEADLINE_RE);
    return { severity: 'critical', headline: match ? `${match[1]}: ${match[2]}` : 'critical capability drift', content };
  }
  if (isOperational) {
    const match = content.match(HEADLINE_RE);
    return { severity: 'operational', headline: match ? `${match[1]}: ${match[2]}` : 'operational drift detected', content };
  }
  if (isClean) return { severity: 'clean', headline: null, content };
  return { severity: 'idle', headline: null, content };
}

// ─────────────────────────────────────────────────────────────────────────────
// State → VSCode UI
// ─────────────────────────────────────────────────────────────────────────────

function processGovernanceMarkdown(content: string, source: 'file' | 'api'): void {
  const state = parseGovernanceMarkdown(content);
  const config = vscode.workspace.getConfiguration('vertaai');
  const cooldownMs = (config.get<number>('notificationCooldownMinutes') ?? 5) * 60_000;

  setStatusBar(state.severity, state.headline ?? undefined);
  maybeNotify(state, cooldownMs);

  if (source === 'file') {
    console.log(`[${EXTENSION_NAME}] Governance updated — severity: ${state.severity}`);
  }
}

function setStatusBar(severity: 'critical' | 'operational' | 'clean' | 'idle', headline?: string): void {
  switch (severity) {
    case 'critical':
      statusBarItem.text = '$(error) VertaAI CRITICAL';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarItem.tooltip = headline
        ? `🚨 VertaAI: ${headline}\nClick to view full governance report`
        : '🚨 VertaAI: Critical drift — click to view';
      break;
    case 'operational':
      statusBarItem.text = '$(warning) VertaAI';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.tooltip = headline
        ? `⚠️ VertaAI: ${headline}\nTeam review needed`
        : '⚠️ VertaAI: Operational drift — click to view';
      break;
    case 'clean':
      statusBarItem.text = '$(check) VertaAI ✓';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = 'VertaAI: All services compliant — safe to ship';
      break;
    default:
      statusBarItem.text = '$(shield) VertaAI';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = 'VertaAI: Monitoring…\nRun "VertaAI: Setup" to configure.';
  }
}

function maybeNotify(state: GovernanceState, cooldownMs: number): void {
  const now = Date.now();
  if (now - (lastNotificationBySeverity[state.severity] ?? 0) < cooldownMs) return;

  if (state.severity === 'critical') {
    lastNotificationBySeverity['critical'] = now;
    vscode.window
      .showErrorMessage(
        `🚨 VertaAI: Critical drift${state.headline ? ` — ${state.headline}` : ''}`.slice(0, 120),
        'View Governance', 'Dismiss',
      )
      .then(action => { if (action === 'View Governance') openGovernanceFile(); });
  } else if (state.severity === 'operational') {
    lastNotificationBySeverity['operational'] = now;
    vscode.window
      .showWarningMessage('⚠️ VertaAI: Operational drift — team review needed before next release', 'View')
      .then(action => { if (action === 'View') openGovernanceFile(); });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function openGovernanceFile(): Promise<void> {
  const files = await vscode.workspace.findFiles(GOVERNANCE_FILE_GLOB, null, 1);
  if (files.length > 0) {
    const doc = await vscode.workspace.openTextDocument(files[0]!);
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  } else {
    const content = await fetchApiContent();
    if (content) {
      const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
    } else {
      vscode.window
        .showInformationMessage(`${EXTENSION_NAME}: No governance data. Run "VertaAI: Setup" first.`, 'Run Setup')
        .then(action => { if (action === 'Run Setup') vscode.commands.executeCommand('vertaai.setup'); });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup wizard — generates all config files in one step
// ─────────────────────────────────────────────────────────────────────────────

async function runSetupWizard(): Promise<void> {
  const config = vscode.workspace.getConfiguration('vertaai');

  const apiUrl = await vscode.window.showInputBox({
    title: 'VertaAI Setup (1/2) — API URL',
    prompt: 'Enter your VertaAI API base URL',
    value: config.get<string>('apiUrl') || 'https://api.vertaai.com',
    placeHolder: 'https://api.vertaai.com',
    validateInput: v => (!v || !v.startsWith('http') ? 'Must be a valid http(s) URL' : null),
  });
  if (!apiUrl) return;

  const workspaceId = await vscode.window.showInputBox({
    title: 'VertaAI Setup (2/2) — Workspace ID',
    prompt: 'Enter your VertaAI workspace ID',
    value: config.get<string>('workspaceId') ?? '',
    placeHolder: 'e.g. demo-workspace',
    validateInput: v => (!v ? 'Workspace ID is required' : null),
  });
  if (!workspaceId) return;

  await config.update('apiUrl', apiUrl, vscode.ConfigurationTarget.Workspace);
  await config.update('workspaceId', workspaceId, vscode.ConfigurationTarget.Workspace);

  const mcpUrl = `${apiUrl}/mcp?workspaceId=${workspaceId}`;

  // Option A: Claude Code MCP config
  await writeConfigFile(
    '.mcp.json',
    JSON.stringify({ mcpServers: { vertaai: { type: 'http', url: mcpUrl } } }, null, 2),
    'Claude Code (.mcp.json)',
  );

  // Option C: Augment MCP config
  await writeConfigFile(
    path.join('.augment', 'settings.json'),
    JSON.stringify({ mcpServers: { vertaai: { transport: 'http', url: mcpUrl } } }, null, 2),
    'Augment (.augment/settings.json)',
  );

  // Track 0: Write .claude/CLAUDE.md — governance rules injected into every Claude Code session.
  // Appends the agent permission envelope so AI assistants know what they can/cannot do.
  const claudeMdContent = await buildClaudeMdWithPermissions(workspaceId, apiUrl);
  await writeConfigFile(
    path.join('.claude', 'CLAUDE.md'),
    claudeMdContent,
    'Claude Code governance rules (.claude/CLAUDE.md)',
  );

  // Track 0: Write .github/copilot-instructions.md — Copilot's equivalent of CLAUDE.md.
  // GitHub Copilot reads this as workspace-level custom instructions for every chat session.
  await writeConfigFile(
    path.join('.github', 'copilot-instructions.md'),
    await buildCopilotInstructions(workspaceId, apiUrl),
    'Copilot governance rules (.github/copilot-instructions.md)',
  );

  // Track 0: Write .cursor/mcp.json — Cursor MCP config.
  // Cursor picks this up and exposes the VertaAI MCP server to the AI assistant.
  await writeConfigFile(
    path.join('.cursor', 'mcp.json'),
    JSON.stringify({ mcpServers: { vertaai: { type: 'http', url: mcpUrl } } }, null, 2),
    'Cursor MCP config (.cursor/mcp.json)',
  );

  // Track 0: Write .cursor/rules/vertaai-permissions.mdc — Cursor agent rules file.
  // Cursor injects .mdc files from .cursor/rules/ into every AI context automatically,
  // giving Cursor agents their VertaAI permission boundaries without needing an MCP call.
  const cursorRulesContent = await buildCursorPermissionRules(workspaceId, apiUrl);
  await writeConfigFile(
    path.join('.cursor', 'rules', 'vertaai-permissions.mdc'),
    cursorRulesContent,
    'Cursor agent permission rules (.cursor/rules/vertaai-permissions.mdc)',
  );

  // Track 0: Write .vscode/mcp.json — VS Code 1.99+ native MCP support.
  // (Also picked up by Windsurf as its MCP config source)
  await writeConfigFile(
    path.join('.vscode', 'mcp.json'),
    JSON.stringify({ servers: { vertaai: { type: 'http', url: mcpUrl } } }, null, 2),
    'VS Code MCP config (.vscode/mcp.json)',
  );

  // Track 0: Write .windsurfrules — Windsurf project-level agent rules.
  // Windsurf auto-injects this file into every AI context, so Windsurf agents receive
  // their VertaAI permission boundaries without needing an explicit MCP call.
  const windsurfRulesContent = await buildWindsurfPermissionRules(workspaceId, apiUrl);
  await writeConfigFile(
    '.windsurfrules',
    windsurfRulesContent,
    'Windsurf agent permission rules (.windsurfrules)',
  );

  // Track 0: Write .augment/settings.json — Augment MCP + inline guidelines.
  // The `guidelines` field is injected into every Augment AI session automatically.
  const augmentPermissionText = await buildAugmentPermissionGuidelines(workspaceId, apiUrl);
  await writeConfigFile(
    path.join('.augment', 'settings.json'),
    JSON.stringify({
      mcpServers: { vertaai: { transport: 'http', url: mcpUrl } },
      guidelines: augmentPermissionText,
    }, null, 2),
    'Augment MCP config + guidelines (.augment/settings.json)',
  );

  // Connect SSE stream with the new config
  disconnectSseStream();
  setTimeout(() => connectSseStream(), 500);

  await pollApiOnce();

  vscode.window.showInformationMessage(
    `✅ VertaAI configured for "${workspaceId}". ` +
    `Track 0 active for Claude Code, Copilot, Cursor, Windsurf, and Augment. ` +
    `Real-time drift alerts active via SSE. Restart your AI assistants to pick up new configs.`,
  );
}

/**
 * Build the CLAUDE.md content that instructs Claude Code to automatically run
 * governance pre-flight checks before writing infrastructure code (Track 0).
 */
function buildClaudeMd(workspaceId: string, apiUrl: string): string {
  return [
    '# VertaAI Governance — Active',
    '',
    'This workspace is governed by **VertaAI** runtime capability governance.',
    `Workspace ID: \`${workspaceId}\` | API: \`${apiUrl}\``,
    '',
    '## Pre-flight rule (MANDATORY)',
    '',
    'Before writing code that touches **any** of the following, call the',
    '`check_capability_intent` MCP tool to verify governance clearance:',
    '',
    '| Capability | Triggered by |',
    '|---|---|',
    '| `db_write` | `prisma.*.create/update/delete/upsert`, raw INSERT/UPDATE/DELETE |',
    '| `db_read` | `prisma.*.findMany/findFirst/findUnique`, raw SELECT |',
    '| `db_admin` | `prisma.$executeRaw`, CREATE/ALTER/DROP TABLE |',
    '| `s3_write` | `s3.putObject`, `s3.upload`, `PutObjectCommand` |',
    '| `s3_read` | `s3.getObject`, `s3.headObject`, `GetObjectCommand` |',
    '| `s3_delete` | `s3.deleteObject`, `DeleteObjectCommand` |',
    '| `iam_modify` | `iam.createRole`, `iam.putRolePolicy`, `AttachRolePolicyCommand` |',
    '| `secret_read` | `secretsManager.getSecretValue`, `ssm.getParameter` |',
    '| `secret_write` | `secretsManager.putSecretValue`, `secretsManager.createSecret` |',
    '| `api_endpoint` | New external HTTP endpoints, `fetch()`, `axios`, `http.request` |',
    '| `infra_create` | CDK `new Stack()`, Terraform resources, Pulumi components |',
    '| `deployment_modify` | Changes to CI/CD pipelines, deploy scripts, Helm values |',
    '',
    '## How to check',
    '',
    '```',
    'check_capability_intent({',
    '  service: "<service-name>",',
    '  capabilities: [{ type: "s3_write", target: "bucket-name/*" }]',
    '})',
    '```',
    '',
    '## Live governance state',
    '',
    `- MCP resource: \`vertaai://governance/${workspaceId}\``,
    '- Local file: `.claude/GOVERNANCE.md` (updated within seconds of production events)',
    `- Dashboard: ${apiUrl.replace('/api', '')}/governance?workspace=${workspaceId}`,
    '',
    '## Adding capabilities to the spec',
    '',
    'If `check_capability_intent` returns blocked, ask the developer to declare the',
    'capability in the IntentArtifact before proceeding. Do not bypass governance.',
  ].join('\n');
}

/**
 * Build CLAUDE.md base content and append the live agent permission envelope
 * fetched from the API. Falls back to base content if the API call fails.
 */
async function buildClaudeMdWithPermissions(workspaceId: string, apiUrl: string): Promise<string> {
  const base = buildClaudeMd(workspaceId, apiUrl);

  try {
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/agent-permissions`);
    if (!resp.ok) return base;
    const data = await resp.json() as any;

    const lines = [
      '',
      '## Agent Permission Envelope',
      `> Compiled ${new Date(data.compiledAt ?? Date.now()).toUTCString()}${(data.compiledFromPacks?.length ?? 0) > 0 ? ` from packs: ${(data.compiledFromPacks as string[]).join(', ')}` : ' (baseline)'}`,
      '',
      `On every session start, call \`get_governance_status\` to load the abstraction`,
      `inventory and technical debt context before writing any code.`,
      '',
      `\uD83D\uDEAB **BLOCKED** (never use): ${(data.blocked as string[] ?? []).join(', ')}`,
      `\u26A0\uFE0F **REQUIRES DECLARATION**: ${(data.requireDeclaration as string[] ?? []).join(', ')}`,
      `\u2705 **ALWAYS ALLOWED**: ${(data.alwaysAllowed as string[] ?? []).join(', ')}`,
      `\uD83D\uDC64 **REQUIRES HUMAN APPROVAL**: ${(data.requireHumanApproval as string[] ?? []).join(', ')}`,
      '',
      '## Session Budgets',
      `- Max files changed per session: ${data.sessionBudgets?.maxFilesChanged ?? 20}`,
      `- Max new abstractions per session: ${data.sessionBudgets?.maxNewAbstractions ?? 3}`,
      `- Tests required before committing: ${(data.sessionBudgets?.requireTestFor as string[] ?? []).join(', ')}`,
    ];
    return base + '\n' + lines.join('\n');
  } catch {
    return base; // Non-blocking — base content is still valuable
  }
}

/**
 * Build the .github/copilot-instructions.md content — Copilot's equivalent of CLAUDE.md.
 * GitHub Copilot reads this as workspace-level custom instructions for every chat session,
 * making the governance pre-flight check automatic for Copilot users (Track 0).
 * The VSCode LM Tool (registered above) handles the actual execution when Copilot calls it.
 * Fetches the agent permission envelope from the API and appends it so Copilot agents
 * receive their permission boundaries from the VertaAI workspace on every session.
 */
async function buildCopilotInstructions(workspaceId: string, apiUrl: string): Promise<string> {
  const base = [
    '# VertaAI Governance — Active',
    '',
    'This workspace is governed by **VertaAI** runtime capability governance.',
    `Workspace ID: \`${workspaceId}\``,
    '',
    '## MANDATORY pre-flight rule',
    '',
    'Before writing any code that uses the capabilities below, call the',
    '`vertaai_check_capability_intent` tool to verify governance clearance.',
    'If the tool returns **BLOCKED**, do not write the code — ask the developer to',
    'declare the capability in the IntentArtifact first.',
    '',
    '| Capability | Triggered by |',
    '|---|---|',
    '| `db_write` | `prisma.*.create/update/delete/upsert`, INSERT/UPDATE/DELETE |',
    '| `db_read` | `prisma.*.findMany/findFirst`, SELECT |',
    '| `db_admin` | `prisma.$executeRaw`, CREATE/ALTER/DROP TABLE |',
    '| `s3_write` | `s3.putObject`, `s3.upload`, `PutObjectCommand` |',
    '| `s3_read` | `s3.getObject`, `GetObjectCommand` |',
    '| `s3_delete` | `s3.deleteObject`, `DeleteObjectCommand` |',
    '| `iam_modify` | `iam.createRole`, `iam.putRolePolicy`, `AttachRolePolicyCommand` |',
    '| `secret_read` | `secretsManager.getSecretValue`, `ssm.getParameter` |',
    '| `secret_write` | `secretsManager.putSecretValue`, `secretsManager.createSecret` |',
    '| `api_endpoint` | New external HTTP endpoints, `fetch()`, `axios`, `http.request` |',
    '| `infra_create` | CDK `new Stack()`, Terraform resources |',
    '',
    '## How to call the tool',
    '',
    '```json',
    '{',
    '  "service": "<service-name>",',
    '  "capabilities": [{ "type": "s3_write", "target": "bucket-name/*" }]',
    '}',
    '```',
    '',
    '## Live governance',
    `- Dashboard: ${apiUrl.replace('/api', '')}/governance?workspace=${workspaceId}`,
    '- Local file: `.claude/GOVERNANCE.md` (updated seconds after production events)',
  ].join('\n');

  // Fetch and append the agent permission envelope from the VertaAI workspace
  try {
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/agent-permissions`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (resp.ok) {
      const env = await resp.json() as any;
      const lines: string[] = [
        '',
        '## Agent Permission Envelope',
        `> Compiled from VertaAI workspace \`${workspaceId}\``,
        '',
        `🚫 **BLOCKED** (never use): ${(env.blocked ?? []).join(', ')}`,
        `⚠️ **REQUIRES DECLARATION**: ${(env.requireDeclaration ?? []).join(', ')}`,
        `✅ **ALWAYS ALLOWED**: ${(env.alwaysAllowed ?? []).join(', ')}`,
        `👤 **REQUIRES HUMAN APPROVAL**: ${(env.requireHumanApproval ?? []).join(', ')}`,
        '',
        '## Session Budgets',
        `- Max files changed per session: ${env.sessionBudgets?.maxFilesChanged ?? 20}`,
        `- Max new abstractions per session: ${env.sessionBudgets?.maxNewAbstractions ?? 3}`,
        `- Tests required before committing: ${(env.sessionBudgets?.requireTestFor ?? []).join(', ')}`,
      ];
      return base + '\n' + lines.join('\n');
    }
  } catch { /* non-blocking — base is still valuable */ }
  return base;
}

/**
 * Build the .cursor/rules/vertaai-permissions.mdc content.
 * Cursor injects all .mdc files in .cursor/rules/ into every AI session automatically,
 * so Cursor agents receive their VertaAI workspace permission boundaries without needing
 * an explicit MCP call at session start.
 */
async function buildCursorPermissionRules(workspaceId: string, apiUrl: string): Promise<string> {
  const header = [
    '---',
    'description: VertaAI governance — agent permission boundaries (auto-loaded)',
    'alwaysApply: true',
    '---',
    '',
    '# VertaAI Agent Permissions',
    '',
    `This workspace is governed by **VertaAI**. Workspace ID: \`${workspaceId}\``,
    '',
    '## MANDATORY pre-flight rule',
    '',
    'Before writing code that uses any capability below, call `get_governance_status` via MCP',
    'or use the `vertaai_check_capability_intent` tool to verify governance clearance.',
    '',
  ].join('\n');

  try {
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/agent-permissions`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (resp.ok) {
      const env = await resp.json() as any;
      const lines: string[] = [
        '## Permission Envelope',
        `> Compiled from VertaAI workspace \`${workspaceId}\``,
        '',
        `🚫 **BLOCKED** (never use): ${(env.blocked ?? []).join(', ')}`,
        `⚠️ **REQUIRES DECLARATION**: ${(env.requireDeclaration ?? []).join(', ')}`,
        `✅ **ALWAYS ALLOWED**: ${(env.alwaysAllowed ?? []).join(', ')}`,
        `👤 **REQUIRES HUMAN APPROVAL**: ${(env.requireHumanApproval ?? []).join(', ')}`,
        '',
        '## Session Budgets',
        `- Max files changed per session: ${env.sessionBudgets?.maxFilesChanged ?? 20}`,
        `- Max new abstractions per session: ${env.sessionBudgets?.maxNewAbstractions ?? 3}`,
        `- Tests required before committing: ${(env.sessionBudgets?.requireTestFor ?? []).join(', ')}`,
      ];
      return header + lines.join('\n');
    }
  } catch { /* non-blocking — fallback below */ }

  // Fallback: static baseline without workspace-specific overrides
  return header + [
    '## Permission Envelope (baseline — workspace overrides unavailable)',
    '',
    '🚫 **BLOCKED**: iam_modify, secret_write, db_admin, infra_delete, deployment_modify',
    '⚠️ **REQUIRES DECLARATION**: s3_delete, s3_write, schema_modify, network_public, infra_create, infra_modify, secret_read',
    '✅ **ALWAYS ALLOWED**: db_read, s3_read, api_endpoint',
    '👤 **REQUIRES HUMAN APPROVAL**: iam_modify, secret_write',
    '',
    '## Session Budgets',
    '- Max files changed per session: 20',
    '- Max new abstractions per session: 3',
    '- Tests required before committing: db_write, s3_write, schema_modify',
  ].join('\n');
}

/**
 * Build the .windsurfrules content for Windsurf agents.
 * Windsurf auto-injects .windsurfrules (project root) into every AI context,
 * giving Windsurf agents permission boundaries from the VertaAI workspace
 * without requiring an explicit MCP call at session start.
 */
async function buildWindsurfPermissionRules(workspaceId: string, apiUrl: string): Promise<string> {
  const header = [
    '# VertaAI Governance — Agent Permissions',
    '',
    `This workspace is governed by **VertaAI**. Workspace ID: \`${workspaceId}\``,
    '',
    '## MANDATORY pre-flight rule',
    '',
    'Before writing code that uses any capability below, call `get_governance_status` via MCP',
    'or use the `vertaai_check_capability_intent` tool to verify governance clearance.',
    "If the check returns **BLOCKED**, do not write the code — ask the developer to declare",
    'the capability in the IntentArtifact first.',
    '',
  ].join('\n');

  try {
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/agent-permissions`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (resp.ok) {
      const env = await resp.json() as any;
      const lines: string[] = [
        '## Permission Envelope',
        `> Compiled from VertaAI workspace \`${workspaceId}\``,
        '',
        `🚫 **BLOCKED** (never use): ${(env.blocked ?? []).join(', ')}`,
        `⚠️ **REQUIRES DECLARATION**: ${(env.requireDeclaration ?? []).join(', ')}`,
        `✅ **ALWAYS ALLOWED**: ${(env.alwaysAllowed ?? []).join(', ')}`,
        `👤 **REQUIRES HUMAN APPROVAL**: ${(env.requireHumanApproval ?? []).join(', ')}`,
        '',
        '## Session Budgets',
        `- Max files changed per session: ${env.sessionBudgets?.maxFilesChanged ?? 20}`,
        `- Max new abstractions per session: ${env.sessionBudgets?.maxNewAbstractions ?? 3}`,
        `- Tests required before committing: ${(env.sessionBudgets?.requireTestFor ?? []).join(', ')}`,
      ];
      return header + lines.join('\n');
    }
  } catch { /* non-blocking */ }

  return header + [
    '## Permission Envelope (baseline)',
    '',
    '🚫 **BLOCKED**: iam_modify, secret_write, db_admin, infra_delete, deployment_modify',
    '⚠️ **REQUIRES DECLARATION**: s3_delete, s3_write, schema_modify, network_public, infra_create, infra_modify, secret_read',
    '✅ **ALWAYS ALLOWED**: db_read, s3_read, api_endpoint',
    '👤 **REQUIRES HUMAN APPROVAL**: iam_modify, secret_write',
  ].join('\n');
}

/**
 * Build the plain-text guidelines string for Augment's `guidelines` field.
 * Augment injects this text into every AI session automatically alongside the MCP URL,
 * ensuring Augment agents receive permission boundaries from the VertaAI workspace
 * without needing to call get_governance_status proactively.
 */
async function buildAugmentPermissionGuidelines(workspaceId: string, apiUrl: string): Promise<string> {
  const header = [
    `VertaAI Governance active for workspace ${workspaceId}.`,
    '',
    'MANDATORY: Before writing code that uses any infrastructure capability (db_write, s3_write,',
    'iam_modify, secret_read, infra_create, schema_modify, etc.), call the vertaai_check_capability_intent',
    'MCP tool to verify governance clearance. Do not implement code that uses BLOCKED capabilities.',
    '',
  ].join('\n');

  try {
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/agent-permissions`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (resp.ok) {
      const env = await resp.json() as any;
      return header + [
        `BLOCKED (never use): ${(env.blocked ?? []).join(', ')}`,
        `REQUIRES DECLARATION: ${(env.requireDeclaration ?? []).join(', ')}`,
        `ALWAYS ALLOWED: ${(env.alwaysAllowed ?? []).join(', ')}`,
        `REQUIRES HUMAN APPROVAL: ${(env.requireHumanApproval ?? []).join(', ')}`,
        `Session limits: max ${env.sessionBudgets?.maxFilesChanged ?? 20} files, max ${env.sessionBudgets?.maxNewAbstractions ?? 3} new abstractions.`,
      ].join('\n');
    }
  } catch { /* non-blocking */ }

  return header + [
    'BLOCKED: iam_modify, secret_write, db_admin, infra_delete, deployment_modify',
    'REQUIRES DECLARATION: s3_delete, s3_write, schema_modify, network_public, infra_create, infra_modify, secret_read',
    'ALWAYS ALLOWED: db_read, s3_read, api_endpoint',
    'Session limits: max 20 files, max 3 new abstractions.',
  ].join('\n');
}

async function writeConfigFile(relPath: string, content: string, label: string): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const root = folders[0]!.uri.fsPath;
  const filePath = path.join(root, relPath);
  const dirPath = path.dirname(filePath);

  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    if (fs.existsSync(filePath)) {
      const choice = await vscode.window.showWarningMessage(
        `${relPath} already exists. Overwrite with VertaAI ${label} config?`,
        'Overwrite', 'Skip',
      );
      if (choice !== 'Overwrite') return;
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[${EXTENSION_NAME}] Wrote ${relPath} (${label})`);
  } catch (err: any) {
    console.warn(`[${EXTENSION_NAME}] Could not write ${relPath}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API fallback (when no local GOVERNANCE.md and SSE not connected)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchApiContent(): Promise<string | null> {
  const config = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = config.get<string>('workspaceId');
  const apiUrl = config.get<string>('apiUrl');
  if (!workspaceId || !apiUrl) return null;

  try {
    const url = `${apiUrl}/api/workspaces/${workspaceId}/governance-summary/compact`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function pollApiOnce(): Promise<void> {
  if (governanceFileFound) return;
  const content = await fetchApiContent();
  if (content) processGovernanceMarkdown(content, 'api');
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 0: Capability intent check — called by VSCode LM Tool (Copilot, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls POST /api/workspaces/:workspaceId/capability-intent-check and returns
 * a markdown string suitable for returning to the calling LLM.
 */
async function callCapabilityIntentCheckApi(
  service: string,
  capabilities: Array<{ type: string; target?: string }>,
): Promise<string> {
  const config = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = config.get<string>('workspaceId');
  const apiUrl = config.get<string>('apiUrl');

  if (!workspaceId || !apiUrl) {
    return '⚠️ VertaAI: Not configured. Run "VertaAI: Setup" to set workspace ID and API URL.';
  }

  try {
    const url = `${apiUrl}/api/workspaces/${workspaceId}/capability-intent-check`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, capabilities }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      return `⚠️ VertaAI: Governance check failed (HTTP ${response.status}): ${err}`;
    }

    const data = await response.json() as {
      allowed: boolean;
      undeclaredRequested: Array<{ type: string; target?: string }>;
      activeDrifts: number;
      declaredCapabilities: Array<{ capabilityType: string; capabilityTarget: string }>;
      service: string;
    };

    if (data.allowed) {
      return [
        `✅ **VertaAI: Governance check PASSED** for \`${data.service}\``,
        '',
        `All ${capabilities.length} requested ${capabilities.length === 1 ? 'capability is' : 'capabilities are'} declared in the IntentArtifact.`,
        data.activeDrifts > 0
          ? `\n⚠️ Note: ${data.activeDrifts} active drift ${data.activeDrifts === 1 ? 'cluster' : 'clusters'} exist for this service — review .claude/GOVERNANCE.md.`
          : '\nNo active drift clusters. Safe to proceed.',
      ].join('\n');
    } else {
      const undeclaredList = data.undeclaredRequested
        .map(c => `- \`${c.type}${c.target && c.target !== '*' ? `:${c.target}` : ''}\``)
        .join('\n');
      return [
        `🚫 **VertaAI: Governance check BLOCKED** for \`${data.service}\``,
        '',
        `**${data.undeclaredRequested.length} undeclared ${data.undeclaredRequested.length === 1 ? 'capability' : 'capabilities'}:**`,
        undeclaredList,
        '',
        'Ask the developer to declare these capabilities in the IntentArtifact before proceeding.',
        'Do not implement code that uses undeclared capabilities.',
        data.activeDrifts > 0
          ? `\n⚠️ ${data.activeDrifts} active drift ${data.activeDrifts === 1 ? 'cluster' : 'clusters'} also exist for this service.`
          : '',
      ].join('\n');
    }
  } catch (err: any) {
    return `⚠️ VertaAI: Could not reach governance API — ${err.message}. Proceed with caution.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 0/1: Session intent (GAP 1) + declare_session_intent LM Tool (GAP 1)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a simple UUID-like session ID stable for the current extension process. */
function generateSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Initialize the coding session:
 * 1. Generate a session ID if none exists.
 * 2. POST to /session-intent to register the session with the API.
 * 3. Fetch and cache the effective policy (session budgets, blocked capabilities).
 * Called at activation and after config changes.
 */
async function initSession(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = cfg.get<string>('workspaceId');
  const apiUrl = cfg.get<string>('apiUrl');
  if (!workspaceId || !apiUrl) return;

  if (!currentSessionId) currentSessionId = generateSessionId();

  try {
    // Declare session intent (no prompt yet — extension activates before the user types)
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/session-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      // Cache policy budgets for local enforcement
      if (data.policy) {
        policyBudgets.maxFilesChanged = data.policy.maxFilesChanged ?? 20;
        policyBudgets.maxNewAbstractions = data.policy.maxNewAbstractions ?? 3;
        policyBudgets.blockedCapabilities = data.policy.blockedCapabilities ?? [];
        policyBudgets.requireDeclaration = data.policy.requireDeclaration ?? [];
      }
      console.log(`[${EXTENSION_NAME}] Session initialized: ${currentSessionId}`);
    }
  } catch (err: any) {
    // Non-blocking — extension works fine even if session declaration fails
    console.warn(`[${EXTENSION_NAME}] Session init failed: ${err.message}`);
  }

  // Also fetch the full policy summary to ensure budgets are current (GAP 4)
  await pollPolicySummary();
}

/**
 * Fetch /effective-policy-summary and cache the thresholds locally (GAP 4).
 * Called at session start and every 5 minutes to stay current with pack changes.
 */
async function pollPolicySummary(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = cfg.get<string>('workspaceId');
  const apiUrl = cfg.get<string>('apiUrl');
  if (!workspaceId || !apiUrl) return;

  try {
    const resp = await fetch(
      `${apiUrl}/api/workspaces/${workspaceId}/effective-policy-summary`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!resp.ok) return;
    const data = await resp.json() as any;
    policyBudgets.maxFilesChanged = data.maxFilesChanged ?? 20;
    policyBudgets.maxNewAbstractions = data.maxNewAbstractions ?? 3;
    policyBudgets.blockedCapabilities = data.blockedCapabilities ?? [];
    policyBudgets.requireDeclaration = data.requireDeclaration ?? [];
    console.log(`[${EXTENSION_NAME}] Policy synced — maxFiles: ${policyBudgets.maxFilesChanged}, maxAbstractions: ${policyBudgets.maxNewAbstractions}`);
  } catch { /* non-blocking */ }
}

/**
 * Called by the `vertaai_declare_session_intent` LM Tool.
 * The agent calls this at the START of a coding session with the developer's prompt.
 * Stores intent in the API, updates cached policy, returns markdown to the LLM.
 */
async function callDeclareSessionIntentApi(
  rawPrompt: string,
  service?: string,
  ticketRef?: string,
  scopeHint?: string,
): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = cfg.get<string>('workspaceId');
  const apiUrl = cfg.get<string>('apiUrl');

  if (!workspaceId || !apiUrl) {
    return '⚠️ VertaAI: Not configured. Run "VertaAI: Setup" to set workspace ID and API URL.';
  }

  if (!currentSessionId) currentSessionId = generateSessionId();

  try {
    const resp = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/session-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId, rawPrompt, service, ticketRef, scopeHint }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return `⚠️ VertaAI: Failed to declare session intent (HTTP ${resp.status}).`;
    }

    const data = await resp.json() as any;
    const policy = data.policy ?? {};

    // Update local cache
    if (policy.maxFilesChanged) policyBudgets.maxFilesChanged = policy.maxFilesChanged;
    if (policy.maxNewAbstractions) policyBudgets.maxNewAbstractions = policy.maxNewAbstractions;
    if (policy.blockedCapabilities) policyBudgets.blockedCapabilities = policy.blockedCapabilities;
    if (policy.requireDeclaration) policyBudgets.requireDeclaration = policy.requireDeclaration;

    return [
      `✅ **VertaAI: Session intent declared**`,
      '',
      `**Session**: \`${currentSessionId}\``,
      rawPrompt ? `**Intent**: "${rawPrompt}"` : '',
      service ? `**Service**: \`${service}\`` : '',
      ticketRef ? `**Ticket**: ${ticketRef}` : '',
      '',
      '## Active Session Policy',
      `- Max files: **${policy.maxFilesChanged ?? 20}** (warn at ${policy.warningThresholdPercent ?? 80}%)`,
      `- Max abstractions: **${policy.maxNewAbstractions ?? 3}**`,
      `- 🚫 BLOCKED: ${(policy.blockedCapabilities ?? []).join(', ') || 'none'}`,
      `- ⚠️ REQUIRES DECLARATION: ${(policy.requireDeclaration ?? []).join(', ') || 'none'}`,
      '',
      'Track 1 real-time alerts are now active. Call `check_capability_intent` before using any listed capabilities.',
    ].filter(Boolean).join('\n');
  } catch (err: any) {
    return `⚠️ VertaAI: Could not reach governance API — ${err.message}.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 1: Scan report — POST local scanner results to API (GAP 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a debounced POST of accumulated capability scan results to the API.
 * The API checks them against recent IntentArtifacts and fires coding_drift SSE
 * if any are undeclared. Debounced to 10 seconds to batch rapid file saves.
 */
function scheduleScanReport(): void {
  if (scanReportTimer) clearTimeout(scanReportTimer);
  scanReportTimer = setTimeout(() => {
    scanReportTimer = undefined;
    reportScanToApi();
  }, 10_000);
}

/**
 * POST current pendingCapabilities and sessionFilesTouched to the scan-report endpoint.
 * Handles the response to show budget warnings via status bar.
 */
async function reportScanToApi(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = cfg.get<string>('workspaceId');
  const apiUrl = cfg.get<string>('apiUrl');
  if (!workspaceId || !apiUrl || !currentSessionId) return;
  if (pendingCapabilities.length === 0 && sessionFilesTouched.size === 0) return;

  const capsSnapshot = [...pendingCapabilities];
  const filesSnapshot = [...sessionFilesTouched];

  try {
    const resp = await fetch(
      `${apiUrl}/api/workspaces/${workspaceId}/session-intent/${currentSessionId}/scan-report`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectedCapabilities: capsSnapshot,
          filesModified: filesSnapshot,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) return;
    const data = await resp.json() as {
      undeclared: Array<{ type: string; file: string; line: number }>;
      sessionBudget: { filesUsed: number; filesWarning: number; filesMax: number };
      budgetWarning: boolean;
      budgetExceeded: boolean;
    };

    // Show budget warning in status bar tooltip when approaching limit (GAP 6)
    if (data.budgetExceeded) {
      setStatusBar('operational', `Session budget exceeded: ${data.sessionBudget.filesUsed}/${data.sessionBudget.filesMax} files`);
    } else if (data.budgetWarning) {
      // Don't override critical/operational drift status — just log
      console.warn(`[${EXTENSION_NAME}] Spaghetti warning: ${data.sessionBudget.filesUsed}/${data.sessionBudget.filesMax} files touched this session`);
      const now = Date.now();
      if (now - (lastNotificationBySeverity['budget_warning'] ?? 0) > 10 * 60_000) {
        lastNotificationBySeverity['budget_warning'] = now;
        vscode.window.showWarningMessage(
          `⚠️ VertaAI: Session budget at ${data.sessionBudget.filesUsed}/${data.sessionBudget.filesMax} files — consider scoping this PR.`,
        );
      }
    }
  } catch (err: any) {
    console.warn(`[${EXTENSION_NAME}] Scan report failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 1 (GAP 6): Spaghetti prevention — local budget enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether the session has exceeded or is approaching the session file budget.
 * Shows inline CodeLens-style warning via status bar tooltip.
 * This fires locally on every save without needing an API round-trip.
 */
function checkSpaghettibudget(): void {
  const used = sessionFilesTouched.size;
  const max = policyBudgets.maxFilesChanged;
  const warningAt = Math.floor(max * 0.8);

  if (used >= max) {
    setStatusBar('operational', `Session budget EXCEEDED: ${used}/${max} files (spaghetti risk)`);
  } else if (used >= warningAt) {
    // Update status bar tooltip without overriding severity colour
    if (statusBarItem.backgroundColor === undefined) {
      // Only show budget warning if there's no active drift alert
      statusBarItem.tooltip = `⚠️ VertaAI: Session budget ${used}/${max} files (${Math.round(used / max * 100)}%) — consider scoping this PR.`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 1 (GAP 5): Dynamic GOVERNANCE.md regeneration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write or overwrite the .claude/GOVERNANCE.md file with fresh content.
 * Called when a drift_updated SSE arrives and no local file was found.
 * Keeps the agent's context current without requiring the developer to run Setup again.
 */
function writeGovernanceMd(content: string): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const root = folders[0]!.uri.fsPath;
  const dir = path.join(root, '.claude');
  const filePath = path.join(dir, 'GOVERNANCE.md');

  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    governanceFileFound = true;
    console.log(`[${EXTENSION_NAME}] GOVERNANCE.md refreshed from SSE drift event`);
  } catch (err: any) {
    console.warn(`[${EXTENSION_NAME}] Could not write GOVERNANCE.md: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 1 (P2): Git diff watcher — detect unstaged changes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs `git diff --name-only HEAD` every 30s to detect files the agent has modified
 * but not yet saved (or that were saved but not captured by onDidSaveTextDocument).
 * Adds newly discovered files to sessionFilesTouched for budget tracking.
 */
function checkGitDiff(): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const cwd = folders[0]!.uri.fsPath;
  const { execFile } = require('child_process') as typeof import('child_process');

  execFile('git', ['diff', '--name-only', 'HEAD'], { cwd, timeout: 5_000 }, (err: any, stdout: string) => {
    if (err) return; // Not a git repo or git unavailable — silently skip

    const currentFiles = new Set(
      stdout.split('\n').map(l => l.trim()).filter(Boolean),
    );

    // Find newly appeared files since last check
    const newFiles: string[] = [];
    for (const f of currentFiles) {
      if (!lastGitDiffFiles.has(f)) newFiles.push(f);
    }
    lastGitDiffFiles = currentFiles;

    if (newFiles.length === 0) return;

    // Add to session tracking
    for (const f of newFiles) sessionFilesTouched.add(f);
    checkSpaghettibudget();

    // Schedule a scan report since new files were detected
    scheduleScanReport();

    console.log(`[${EXTENSION_NAME}] Git diff: ${newFiles.length} new file(s) modified — session total: ${sessionFilesTouched.size}`);
  });
}
