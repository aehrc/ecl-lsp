## 1. Extract ecl-core — Scaffold and Types

- [x] 1.1 Create `packages/ecl-core/` with package.json, tsconfig.json, and empty src/index.ts
- [x] 1.2 Update root package.json with npm workspaces including packages/ecl-core
- [x] 1.3 Define core-native types in `packages/ecl-core/src/types.ts` (CorePosition, CoreRange, CoreTextEdit, CoreCodeAction, CoreCompletionItem, CoreDiagnostic)
- [x] 1.4 Verify ecl-core compiles independently with `npm run compile`

## 2. Extract ecl-core — Move LSP-free Modules

- [x] 2.1 Move parser module to `packages/ecl-core/src/parser/` with all sub-files, verify zero LSP imports
- [x] 2.2 Move grammar to `grammar/ECL.g4` at repo root, update ANTLR build script in ecl-core
- [x] 2.3 Move terminology module to `packages/ecl-core/src/terminology/`, verify zero LSP imports
- [x] 2.4 Move validation module (`error-refinement.ts`) to `packages/ecl-core/src/validation/`
- [x] 2.5 Move semantic module to `packages/ecl-core/src/semantic/`, verify zero LSP imports
- [x] 2.6 Move parser/terminology/validation/semantic tests to `packages/ecl-core/src/test/`, verify all pass

## 3. Extract ecl-core — Decouple LSP-dependent Modules

- [x] 3.1 Move formatter to `packages/ecl-core/src/formatter/`, replace TextDocument with plain text interface in range.ts, extract pure config validators from config.ts
- [x] 3.2 Move refactoring module to `packages/ecl-core/src/refactoring/`, replace CodeAction/TextEdit/Range with CoreCodeAction/CoreTextEdit/CoreRange, replace TextDocument with plain text interface
- [x] 3.3 Move completion module to `packages/ecl-core/src/completion/`, replace CompletionItem/CompletionItemKind with CoreCompletionItem, update filter-cache to use core types
- [x] 3.4 Move formatter/refactoring/completion tests to ecl-core, update test helpers to use core types
- [x] 3.5 Export all public API from `packages/ecl-core/src/index.ts`
- [x] 3.6 Verify zero LSP imports across all ecl-core source: `grep -r "vscode-languageserver" packages/ecl-core/src/`
- [x] 3.7 Run full ecl-core test suite, verify all tests pass

## 4. Slim ecl-lsp-server

- [x] 4.1 Create `packages/ecl-lsp-server/` scaffold with package.json (depends on ecl-core + vscode-languageserver), tsconfig.json, and `bin/ecl-lsp-server.js` entry point
- [x] 4.2 Move server.ts to `packages/ecl-lsp-server/src/server.ts`, replace local imports with ecl-core imports, add type mapping adapter functions (toLspCodeAction, toLspCompletionItem, toLspDiagnostic, etc.)
- [x] 4.3 Move code-lens.ts and semantic-tokens.ts to ecl-lsp-server
- [x] 4.4 Add executeCommandProvider capability with `ecl.evaluateExpression` command and handler
- [x] 4.5 Add semantic safety: skip concept validation when `result.errors.length > 0`, add null safety guards (`?.`) on AST node properties in semantic validator
- [x] 4.6 Update root package.json workspaces to include packages/ecl-lsp-server
- [x] 4.7 Verify ecl-lsp-server compiles and all LSP integration tests pass

## 5. Remove Old server/ Directory

- [x] 5.1 Remove `server/src/` files that have been moved to ecl-core and ecl-lsp-server
- [x] 5.2 Update root package.json workspaces to remove old `server` entry
- [x] 5.3 Run full test suite from root to verify nothing is broken

## 6. Fix VSCode Client

- [x] 6.1 Update `clients/vscode/src/extension.ts` server path resolution: try VSIX-bundled layout first, fallback to monorepo layout
- [x] 6.2 Copy TextMate grammar to `clients/vscode/syntaxes/`, update package.json grammar path
- [x] 6.3 Fix activation events: remove `"*"`, use `onLanguage:ecl` only
- [x] 6.4 Fix command registration: register commands before `client.start()`
- [x] 6.5 Create `.vscodeignore` and add vsce build script to package.json
- [x] 6.6 Verify VSIX builds and extension activates correctly

## 7. Fix IntelliJ Client

- [x] 7.1 Update `build.gradle.kts` to copy ecl-lsp-server dist into plugin ZIP
- [x] 7.2 Update `EclLspServerDescriptor.kt` to find bundled server first, fallback to system PATH
- [x] 7.3 Add executeCommand support for Code Lens actions
- [x] 7.4 Delete dead files (EclFileType.kt, EclIcons.kt if unused) — TextMate grammar handles file association (kept: both are actively used by plugin.xml)
- [x] 7.5 Verify plugin builds and runs in sandboxed IDE

## 8. Build MCP Server

- [x] 8.1 Create `packages/ecl-mcp-server/` scaffold with package.json (depends on ecl-core + @modelcontextprotocol/sdk), tsconfig.json, and `bin/ecl-mcp-server.js`
- [x] 8.2 Implement `validate_ecl` tool: parse + validate + return errors/warnings
- [x] 8.3 Implement `evaluate_ecl` tool: FHIR $expand with per-call edition/server override
- [x] 8.4 Implement `lookup_concept` tool: FHIR $lookup with per-call override
- [x] 8.5 Implement `search_concepts` tool: FHIR search with per-call override
- [x] 8.6 Implement `format_ecl` tool: format expression with options
- [x] 8.7 Implement `list_snomed_editions` tool: query available editions/versions
- [x] 8.8 Add static defaults configuration (env vars: ECL_FHIR_SERVER, ECL_FHIR_TIMEOUT, ECL_SNOMED_VERSION)
- [x] 8.9 Add ECL literacy resources (operators, refinements, filters, patterns, grammar, history supplements)
- [x] 8.10 Write tests for all 6 tools and resource serving
- [x] 8.11 Verify MCP server starts and responds to tool calls

## 9. Build Eclipse Client

- [x] 9.1 Create `clients/eclipse/` with Eclipse PDE/LSP4E project structure
- [x] 9.2 Bundle ecl-lsp-server in the plugin
- [x] 9.3 Register .ecl file type with TextMate grammar from shared/syntaxes/
- [x] 9.4 Implement preferences page for FHIR server, timeout, edition, formatting, semantic validation
- [x] 9.5 Verify plugin activates on .ecl file open and LSP features work

## 10. Build Claude Code Plugin

- [x] 10.1 Create `clients/claude-code/` with plugin configuration descriptor
- [x] 10.2 Bundle ecl-lsp-server dist in `clients/claude-code/server/` (uses PATH-based ecl-lsp-server command instead)
- [x] 10.3 Define configuration schema for fhirServerUrl, snomedVersion, formatting, semanticValidation
- [x] 10.4 Verify plugin activates for .ecl files in Claude Code

## 11. Add Knowledge Module

- [x] 11.1 Create `packages/ecl-core/src/knowledge/` with structured ECL reference documentation
- [x] 11.2 Write operator documentation (all 15+ operators with meanings, syntax, examples)
- [x] 11.3 Write refinement documentation (attributes, groups, cardinality, reverse, common attributes)
- [x] 11.4 Write filter documentation (description, concept, member filters with sub-properties)
- [x] 11.5 Write patterns documentation (common ECL patterns for typical clinical terminology tasks)
- [x] 11.6 Write grammar summary and history supplement documentation
- [x] 11.7 Export knowledge module from ecl-core index.ts
- [x] 11.8 Integrate knowledge content with MCP server resources (ecl://guide/\* URIs)
- [x] 11.9 Integrate knowledge content with LSP hover and completion documentation
- [x] 11.10 Write tests for knowledge module content retrieval
