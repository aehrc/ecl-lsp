> **SUPERSEDED** — Absorbed into `ecl-platform-restructuring` (Phase 3: VSCode client fixes). Archived 2026-02-28.

## Why

The VSCode extension had several issues: (1) TextMate grammar path pointed to `../../shared/syntaxes/` which doesn't work in a packaged VSIX — needs a local copy. (2) `activationEvents` included `"*"` (activate on everything) which is wasteful. (3) Server module path assumed monorepo layout only — needs to also check for a bundled server path for VSIX distribution. (4) After the server added `executeCommandProvider`, `vscode-languageclient` auto-registers the `ecl.evaluateExpression` command, and the extension's `.then()` callback trying to register the same command causes "command already exists" error that prevents the client from fully starting.

## What Changes

- **Local TextMate grammar**: Grammar path in `package.json` changed from `../../shared/syntaxes/ecl.tmLanguage.json` to `./syntaxes/ecl.tmLanguage.json` — grammar is copied into the extension directory
- **Remove `"*"` activation**: `activationEvents` reduced to just `"onLanguage:ecl"`
- **Bundled server path**: `extension.ts` tries `server/dist/server.js` (VSIX layout) before `../../server/dist/server.js` (monorepo layout)
- **Command registration before client.start()**: All three commands (`ecl.searchConcept`, `ecl.evaluateExpression`, `ecl.selectSnomedEdition`) registered before `client.start()` to prevent conflict with `vscode-languageclient`'s auto-registration of server-declared commands
- **New files**: `syntaxes/` directory with local copy of TextMate grammar, `.vscodeignore` for clean VSIX packaging

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

_(none — these are bug fixes for the existing VSCode extension)_

## Impact

- **Files**: `clients/vscode/package.json`, `clients/vscode/src/extension.ts`
- **New files**: `clients/vscode/syntaxes/`, `clients/vscode/.vscodeignore`
- **Critical fix**: The command registration order fix resolves the "command already exists" startup crash

## Reference

The full diff is saved in `reference/changes.diff`. Untracked files saved in `reference/`.
