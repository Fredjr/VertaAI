# VertaAI Governance

Real-time AI capability drift alerts embedded in your code editor.

Works with **Claude Code**, **Copilot**, **Cursor**, **Augment**, **Windsurf**, and any VS Code AI assistant — no matter which AI you use, governance travels with your workspace.

---

## What it does

When your AI assistant writes code that touches cloud infrastructure (S3, IAM, databases, secrets), VertaAI checks whether that capability was declared in the project's IntentArtifact **before** the code is committed. If it wasn't — you get an inline warning, a status bar alert, and a blocked pre-flight check returned to the AI.

Three signals fire in real time:

| Signal | When it fires | Latency |
|---|---|---|
| **Status bar + popup** | Drift cluster detected in production | < 1 second via SSE |
| **Inline diagnostic** | Capability-indicating code saved to disk | < 100 ms |
| **AI pre-flight block** | AI calls `check_capability_intent` before coding | Synchronous |

---

## Quick setup (30 seconds)

1. Install this extension from the VS Code Marketplace
2. Open Command Palette: `Cmd+Shift+P` → **VertaAI: Setup**
3. Enter your **API URL** and **Workspace ID** (from your VertaAI dashboard)
4. Done — restart your AI assistant to pick up the governance rules

The setup wizard automatically writes config files for every AI assistant you have installed:

| File written | For |
|---|---|
| `.claude/CLAUDE.md` | Claude Code (Track 0 auto-injection) |
| `.github/copilot-instructions.md` | GitHub Copilot (workspace custom instructions) |
| `.cursor/mcp.json` | Cursor (MCP server config) |
| `.vscode/mcp.json` | VS Code 1.99+ native MCP |
| `.mcp.json` | Claude Code MCP |
| `.augment/settings.json` | Augment |

---

## How each AI assistant gets governance

### Claude Code
Claude Code reads `.claude/CLAUDE.md` on every session start. The setup wizard writes a governance rule table that instructs Claude to call `check_capability_intent` before writing any infrastructure code. No developer action needed after setup.

### GitHub Copilot
The extension registers `vertaai_check_capability_intent` as a VS Code Language Model Tool (VS Code 1.90+). Copilot can call this tool directly. The wizard also writes `.github/copilot-instructions.md` with mandatory pre-flight rules.

### Cursor
The wizard writes `.cursor/mcp.json` pointing to your VertaAI MCP server. Cursor loads it as an MCP integration, giving the AI access to `check_capability_intent` and `vertaai://governance/{workspaceId}`.

### Augment
The wizard writes `.augment/settings.json` with the MCP server URL. Augment picks it up on next restart.

### Windsurf + others
Real-time drift alerts appear in the status bar regardless of which AI you use. The local capability scanner shows inline warnings in any editor.

---

## Status bar

| State | Meaning |
|---|---|
| `$(shield) VertaAI` | Monitoring, no alerts |
| `$(check) VertaAI ✓` | All services compliant |
| `$(warning) VertaAI` | Operational drift — team review needed |
| `$(error) VertaAI CRITICAL` | Critical drift — block current release |

Click the status bar item to open the full governance report.

---

## Inline capability warnings

The extension scans every saved file for capability-indicating code patterns:

```typescript
// This line triggers a VertaAI warning:
await s3.putObject({ Bucket: 'my-bucket', Key: key, Body: data });
// VertaAI: `s3_write` detected — verify this capability is declared in your IntentArtifact
```

Warnings appear as VS Code diagnostics (Problems panel + inline squiggles). Severity:
- **Error** (red): `iam_modify`, `secret_write`
- **Warning** (amber): `s3_write`, `s3_delete`, `db_admin`, `secret_read`
- **Info** (blue): `db_write`, `s3_read`, `db_read`, `infra_create`

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `vertaai.apiUrl` | `http://localhost:3001` | VertaAI API base URL |
| `vertaai.workspaceId` | _(empty)_ | Your workspace ID from the VertaAI dashboard |
| `vertaai.notificationCooldownMinutes` | `5` | Minutes between repeat alert popups |

---

## Requirements

- VS Code 1.90+ (or Cursor, Windsurf, any VS Code-compatible editor)
- A VertaAI workspace (sign up at [vertaai.com](https://vertaai.com))

---

## Get your workspace ID

1. Go to [vertaai.com](https://vertaai.com) and sign in
2. Open **Settings → Workspace**
3. Copy your **Workspace ID**
4. Run `Cmd+Shift+P` → **VertaAI: Setup** and paste it in

---

## License

MIT — see [LICENSE](LICENSE)
