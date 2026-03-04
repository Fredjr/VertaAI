/**
 * VertaAI Governance VSCode Extension — Phase 6
 *
 * Embeds real-time AI capability drift alerts directly into the developer's
 * code editor, working alongside ANY AI coding assistant (Claude Code, Augment,
 * GitHub Copilot, ChatGPT, etc.) without requiring configuration.
 *
 * HOW IT WORKS:
 * 1. Watches .claude/GOVERNANCE.md in the open workspace.
 *    VertaAI's runtimeDriftMonitor writes this file after each non-petty drift
 *    detection event (Phase 3: claudeMdWriter.ts). The file changes within
 *    seconds of a CloudTrail/GCP observation being ingested.
 *
 * 2. Parses the compact governance markdown to determine severity.
 *
 * 3. Updates the VSCode status bar (always visible, regardless of AI assistant).
 *
 * 4. Fires VSCode notifications for critical/operational alerts with a 5-minute
 *    per-severity cooldown to prevent alert fatigue.
 *
 * 5. Provides a "View Governance" command that opens the file in a side panel —
 *    the developer can read the full alert details without switching windows.
 *
 * COMPATIBILITY:
 * - Claude Code: also receives governance context via MCP (Phase 4)
 * - Augment: also receives governance context via MCP if configured
 *   (add "vertaai" MCP server in Augment settings → mcpServers)
 * - GitHub Copilot, ChatGPT, others: VSCode notification is the signal;
 *   the developer pastes the governance snapshot into their prompt if needed.
 *
 * FALLBACK (no .claude/GOVERNANCE.md):
 * - If configured, polls GET /api/workspaces/:id/governance-summary/compact
 *   every 60 seconds as a fallback for repos that don't have GitHub integration.
 */

import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GOVERNANCE_FILE_GLOB = '**/.claude/GOVERNANCE.md';
const EXTENSION_NAME = 'VertaAI';
const POLL_INTERVAL_MS = 60_000; // API polling fallback: 60 seconds

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let lastNotificationBySeverity: Record<string, number> = {};
let pollTimer: NodeJS.Timeout | undefined;
let governanceFileFound = false;

// ─────────────────────────────────────────────────────────────────────────────
// Activation
// ─────────────────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  // Status bar — always visible, click to view governance file
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'vertaai.showGovernance';
  setStatusBar('idle');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vertaai.showGovernance', openGovernanceFile),
    vscode.commands.registerCommand('vertaai.refresh', refresh),
  );

  // File system watcher — triggers on write from claudeMdWriter.ts (Phase 3)
  const watcher = vscode.workspace.createFileSystemWatcher(GOVERNANCE_FILE_GLOB);
  watcher.onDidChange(uri => readGovernanceFile(uri));
  watcher.onDidCreate(uri => {
    governanceFileFound = true;
    stopPollFallback(); // file exists → stop polling
    readGovernanceFile(uri);
  });
  watcher.onDidDelete(() => {
    governanceFileFound = false;
    setStatusBar('idle');
    startPollFallback(); // file gone → resume polling if configured
  });
  context.subscriptions.push(watcher);

  // Initial load — find the file if it already exists
  vscode.workspace.findFiles(GOVERNANCE_FILE_GLOB, null, 1).then(files => {
    if (files.length > 0) {
      governanceFileFound = true;
      readGovernanceFile(files[0]!);
    } else {
      setStatusBar('idle');
      startPollFallback(); // try API if configured
    }
  });

  console.log(`[${EXTENSION_NAME}] Extension activated — watching for .claude/GOVERNANCE.md`);
}

export function deactivate(): void {
  stopPollFallback();
  statusBarItem?.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance file reader
// ─────────────────────────────────────────────────────────────────────────────

async function readGovernanceFile(uri: vscode.Uri): Promise<void> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    processGovernanceMarkdown(content, 'file');
  } catch {
    // File may have been deleted between the watcher firing and the read
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
  /** First critical service headline, if any. */
  headline: string | null;
  /** Raw content for side panel. */
  content: string;
}

function parseGovernanceMarkdown(content: string): GovernanceState {
  const isCritical = content.includes('### 🚨 Critical');
  const isOperational = content.includes('### ⚠️ Operational');
  const isClean = content.includes('✅ **No active drift alerts**');

  if (isCritical) {
    // Extract first service + behavior from the critical section
    // Format: **service-name** · `capability:target` · ...
    const match = content.match(/\*\*([^*]+)\*\*\s·\s(`[^`]+`)/);
    const headline = match ? `${match[1]}: ${match[2]}` : 'critical capability drift detected';
    return { severity: 'critical', headline, content };
  }
  if (isOperational) {
    const match = content.match(/\*\*([^*]+)\*\*\s·\s(`[^`]+`)/);
    const headline = match ? `${match[1]}: ${match[2]}` : 'operational drift detected';
    return { severity: 'operational', headline, content };
  }
  if (isClean) {
    return { severity: 'clean', headline: null, content };
  }
  return { severity: 'idle', headline: null, content };
}

// ─────────────────────────────────────────────────────────────────────────────
// State → VSCode UI update
// ─────────────────────────────────────────────────────────────────────────────

function processGovernanceMarkdown(content: string, source: 'file' | 'api'): void {
  const state = parseGovernanceMarkdown(content);
  const config = vscode.workspace.getConfiguration('vertaai');
  const cooldownMs = (config.get<number>('notificationCooldownMinutes') ?? 5) * 60_000;

  setStatusBar(state.severity, state.headline ?? undefined);
  maybeNotify(state, cooldownMs);

  if (source === 'file') {
    console.log(`[${EXTENSION_NAME}] Governance file updated — severity: ${state.severity}`);
  }
}

function setStatusBar(
  severity: 'critical' | 'operational' | 'clean' | 'idle',
  headline?: string,
): void {
  switch (severity) {
    case 'critical':
      statusBarItem.text = '$(error) VertaAI CRITICAL';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      statusBarItem.tooltip = headline
        ? `🚨 VertaAI: ${headline}\nClick to view full governance report`
        : '🚨 VertaAI: Critical drift detected — click to view';
      break;

    case 'operational':
      statusBarItem.text = '$(warning) VertaAI';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.tooltip = headline
        ? `⚠️ VertaAI: ${headline}\nTeam review needed before next release`
        : '⚠️ VertaAI: Operational drift — click to view';
      break;

    case 'clean':
      statusBarItem.text = '$(check) VertaAI ✓';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = 'VertaAI: All observed services are compliant — safe to ship';
      break;

    default: // idle
      statusBarItem.text = '$(shield) VertaAI';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = 'VertaAI: Waiting for governance data…\nRun the drift monitor or check your workspace ID.';
  }
}

function maybeNotify(state: GovernanceState, cooldownMs: number): void {
  const now = Date.now();
  const lastForSeverity = lastNotificationBySeverity[state.severity] ?? 0;
  if (now - lastForSeverity < cooldownMs) return; // throttled

  if (state.severity === 'critical') {
    lastNotificationBySeverity['critical'] = now;
    const headline = state.headline ? `— ${state.headline}` : '';
    vscode.window
      .showErrorMessage(
        `🚨 VertaAI: Critical runtime drift ${headline}`.slice(0, 120),
        'View Governance',
        'Dismiss',
      )
      .then(action => {
        if (action === 'View Governance') openGovernanceFile();
      });
  } else if (state.severity === 'operational') {
    lastNotificationBySeverity['operational'] = now;
    vscode.window
      .showWarningMessage(
        `⚠️ VertaAI: Operational capability drift — team review needed before next release`,
        'View',
      )
      .then(action => {
        if (action === 'View') openGovernanceFile();
      });
  }
  // clean + idle: no notification (ATC: don't interrupt for non-issues)
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function openGovernanceFile(): Promise<void> {
  const files = await vscode.workspace.findFiles(GOVERNANCE_FILE_GLOB, null, 1);
  if (files.length > 0) {
    const doc = await vscode.workspace.openTextDocument(files[0]!);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
    });
  } else {
    // No file — show the API content if configured
    const content = await fetchApiContent();
    if (content) {
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: true,
      });
    } else {
      vscode.window.showInformationMessage(
        `${EXTENSION_NAME}: No governance file found. Configure vertaai.workspaceId and vertaai.apiUrl to enable API fallback.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API polling fallback
// (used when .claude/GOVERNANCE.md doesn't exist in the repo yet)
// ─────────────────────────────────────────────────────────────────────────────

function startPollFallback(): void {
  const config = vscode.workspace.getConfiguration('vertaai');
  const workspaceId = config.get<string>('workspaceId');
  const apiUrl = config.get<string>('apiUrl');
  if (!workspaceId || !apiUrl) return; // not configured

  stopPollFallback();
  pollTimer = setInterval(pollApiOnce, POLL_INTERVAL_MS);
  pollApiOnce(); // immediate first check
}

function stopPollFallback(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

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
  if (governanceFileFound) return; // file watcher is primary; skip poll
  const content = await fetchApiContent();
  if (content) {
    processGovernanceMarkdown(content, 'api');
  }
}
