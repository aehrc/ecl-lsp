## Why

The ECL language server is production-ready (1500+ tests, full LSP feature set) but tightly coupled to a single-package structure. Core logic (parser, formatter, completion, refactoring) imports LSP-specific types, making it impossible to reuse outside an LSP context. There's no path to non-LSP consumers like MCP servers or programmatic use. IDE clients lack self-contained packaging — users must install the server separately.

## What Changes

- **BREAKING**: Extract `ecl-core` as a zero-dependency core library. All parser, formatter, completion, semantic, refactoring, validation, and terminology modules move out of `server/` into `packages/ecl-core/`. LSP types (`CodeAction`, `CompletionItem`, `TextEdit`) replaced with core-native equivalents.
- **BREAKING**: Restructure from flat `server/` + `client/` to monorepo with `packages/` (ecl-core, ecl-lsp-server, ecl-mcp-server) and `clients/` (vscode, intellij, eclipse, claude-code, neovim, sublime, emacs).
- Slim `ecl-lsp-server` to a thin adapter that maps ecl-core results to LSP protocol types.
- New `ecl-mcp-server` package providing mechanical tools (validate, evaluate, format, lookup, search, list editions) and ECL literacy resources for AI agents.
- All IDE plugins (VSCode, IntelliJ, Eclipse) bundle the LSP server for zero-config install.
- New Claude Code plugin with bundled server.
- Text editor guides (Neovim, Sublime, Emacs) for config-only setup.
- New `knowledge` module in ecl-core with ECL reference documentation from the official spec, serving both LSP enrichment and MCP resources.

## Capabilities

### New Capabilities

- `ecl-core-extraction`: Extract all core ECL intelligence into a zero-dependency library with core-native types replacing LSP types
- `ecl-lsp-adapter`: Thin LSP server adapter over ecl-core with type mapping, executeCommand support, and semantic safety fixes
- `ecl-mcp-server`: MCP server with mechanical tools (validate, evaluate, format, lookup, search, list editions) and ECL literacy resources
- `ecl-knowledge`: Reference documentation module condensed from the ECL specification and grammar repo examples
- `eclipse-client`: Eclipse IDE plugin using LSP4E with bundled server
- `claude-code-plugin`: Claude Code LSP plugin with bundled server

### Modified Capabilities

- `completion`: Core completion engine decoupled from LSP types (CompletionItem -> CoreCompletionItem)
- `formatting`: Core formatter decoupled from LSP Connection and TextDocument types
- `semantic-validation`: Null safety guards added; skip concept validation when syntax errors present

## Impact

- **Package structure**: Monorepo with independent versioning per package under `packages/`
- **All server modules**: Move from `server/src/` to `packages/ecl-core/src/` with LSP type replacement
- **LSP server**: Moves to `packages/ecl-lsp-server/`, becomes thin adapter
- **VSCode client**: Updated server path resolution, grammar path fix, VSIX packaging
- **IntelliJ client**: Bundle server in plugin ZIP, update descriptor
- **Dependencies**: New `@modelcontextprotocol/sdk` for MCP server; ecl-core has zero LSP dependencies
- **Tests**: All 1397+ tests migrate to ecl-core; LSP-specific integration tests stay in ecl-lsp-server
- **Old `server/` directory**: Removed after migration complete
