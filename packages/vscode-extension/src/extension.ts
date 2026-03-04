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
 *   Copilot/others: VSCode notification + inline diagnostics (Track 1)
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

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vertaai.showGovernance', openGovernanceFile),
    vscode.commands.registerCommand('vertaai.refresh', refresh),
    vscode.commands.registerCommand('vertaai.setup', runSetupWizard),
  );

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
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (/\.(ts|tsx|js|jsx|py|go|java|rb|rs)$/.test(doc.fileName)) {
        scanDocumentForCapabilities(doc);
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

  // ── Signal 2: SSE stream (if configured) ─────────────────────────────────
  // Connect after a short delay to let the workspace fully initialize.
  setTimeout(() => connectSseStream(), 2_000);

  // Reconnect SSE when settings change (new workspaceId or apiUrl)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('vertaai.apiUrl') || e.affectsConfiguration('vertaai.workspaceId')) {
        disconnectSseStream();
        setTimeout(() => connectSseStream(), 500);
      }
    }),
  );

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
        if (eventLine === 'drift_updated') {
          // New drift cluster detected — refresh governance state immediately
          onSseDriftUpdated();
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
      // No local file — fetch from API and update status bar
      pollApiOnce();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 3: Local capability scanner
// ─────────────────────────────────────────────────────────────────────────────

function scanDocumentForCapabilities(doc: vscode.TextDocument): void {
  const text = doc.getText();
  const diagnostics: vscode.Diagnostic[] = [];

  for (const { pattern, type, label, severity } of CAPABILITY_PATTERNS) {
    // Reset lastIndex for global patterns
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

      // Prevent runaway matches on long files
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
  // Claude Code reads this file as part of its system context on every session start,
  // making check_capability_intent automatic without any developer action.
  await writeConfigFile(
    path.join('.claude', 'CLAUDE.md'),
    buildClaudeMd(workspaceId, apiUrl),
    'Claude Code governance rules (.claude/CLAUDE.md)',
  );

  // Connect SSE stream with the new config
  disconnectSseStream();
  setTimeout(() => connectSseStream(), 500);

  await pollApiOnce();

  vscode.window.showInformationMessage(
    `✅ VertaAI configured for "${workspaceId}". ` +
    `Real-time drift alerts active. Restart Claude Code to pick up .claude/CLAUDE.md.`,
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
