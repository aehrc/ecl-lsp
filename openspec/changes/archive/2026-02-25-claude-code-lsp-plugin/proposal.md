> **SUPERSEDED** — Absorbed into `ecl-platform-restructuring` (Phase 7: Claude Code plugin with bundled server). Archived 2026-02-28.

## Why

Claude Code has native LSP plugin support. When an LSP plugin is installed, Claude gets automatic diagnostics after every `.ecl` file edit and access to LSP operations (hover, completion, etc.). Packaging the existing ECL language server as a Claude Code LSP plugin gives Claude the same validation, concept warnings, and semantic checks that IDE users get.

## What Changes

- **Marketplace descriptor**: `clients/claude-code/.claude-plugin/marketplace.json` registers an `ecl-lsp` plugin that launches `ecl-lsp-server --stdio` for `.ecl` files
- **README**: Installation instructions (npm link server, register marketplace, install plugin)
- **No server changes needed**: The server's `createConnection(ProposedFeatures.all)` auto-detects `--stdio` transport from `process.argv`

## Capabilities

### New Capabilities

- `claude-code-lsp-plugin`: Claude Code LSP plugin that provides real-time ECL diagnostics, hover, completion, and formatting when editing `.ecl` files

### Modified Capabilities

_(none)_

## Impact

- **New files**: `clients/claude-code/.claude-plugin/marketplace.json`, `clients/claude-code/plugins/ecl-lsp/README.md`
- **Prerequisite**: Server must be globally installable via `npm link` from `server/`

## Reference

The complete plugin files are saved in `reference/claude-code/`.
