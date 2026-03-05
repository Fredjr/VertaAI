# Changelog

## [0.1.0] — 2026-03-04

### Added
- Real-time governance status bar (critical / operational / clean / idle states)
- SSE stream connection to VertaAI API — sub-second drift alert delivery
- Local capability scanner: inline diagnostics on file save for S3, IAM, DB, secrets, and infra code patterns
- Setup wizard (`VertaAI: Setup`) writes config files for Claude Code, Copilot, Cursor, Augment, and VS Code MCP
- VSCode Language Model Tool (`vertaai_check_capability_intent`) — callable by Copilot and any LM-connected assistant
- `.claude/CLAUDE.md` generation — Track 0 governance injection for Claude Code
- `.github/copilot-instructions.md` generation — mandatory pre-flight rules for Copilot
- `.cursor/mcp.json` and `.vscode/mcp.json` generation — MCP server config for Cursor and VS Code 1.99+
- First-run detection: setup prompt shown on first activation with no workspace configured
- `REST POST /capability-intent-check` API call for pre-flight results
- GOVERNANCE.md file watcher — triggers status update within milliseconds of production drift event
- Notification cooldown (configurable, default 5 min) to prevent alert fatigue
