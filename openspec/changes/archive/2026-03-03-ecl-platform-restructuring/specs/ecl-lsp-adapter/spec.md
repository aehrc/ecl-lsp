## ADDED Requirements

### Requirement: Thin LSP adapter over ecl-core

The ecl-lsp-server package SHALL be a thin adapter that imports all ECL intelligence from ecl-core and maps core types to LSP protocol types. It SHALL NOT contain parser, formatter, completion, refactoring, validation, or terminology logic directly.

#### Scenario: All core logic imported from ecl-core

- **WHEN** scanning `packages/ecl-lsp-server/src/` for parsing, formatting, or validation logic
- **THEN** all such logic is imported from `ecl-core`, not implemented locally

#### Scenario: CoreCodeAction mapped to LSP CodeAction

- **WHEN** ecl-core returns a `CoreCodeAction` with `kind: 'refactor'`
- **THEN** the adapter maps it to LSP `CodeAction` with `kind: CodeActionKind.Refactor` and converts `CoreTextEdit[]` to LSP `TextEdit[]`

#### Scenario: CoreCompletionItem mapped to LSP CompletionItem

- **WHEN** ecl-core returns a `CoreCompletionItem` with `kind: 'keyword'`
- **THEN** the adapter maps it to LSP `CompletionItem` with `kind: CompletionItemKind.Keyword`

#### Scenario: CoreDiagnostic mapped to LSP Diagnostic

- **WHEN** ecl-core returns a `CoreDiagnostic` with `severity: 'warning'`
- **THEN** the adapter maps it to LSP `Diagnostic` with `severity: DiagnosticSeverity.Warning`

### Requirement: LSP connection and handler registration

The ecl-lsp-server SHALL manage the LSP connection lifecycle, register all LSP request handlers, and delegate to ecl-core for the actual computation.

#### Scenario: Server initializes with full capability set

- **WHEN** the LSP client sends `initialize`
- **THEN** the server responds with capabilities for completion, hover, diagnostics, formatting, range formatting, code actions, code lens, and semantic tokens

#### Scenario: Server handles textDocument/didChange

- **WHEN** a document changes
- **THEN** the server triggers immediate syntax validation and debounced semantic validation via ecl-core

#### Scenario: Server handles textDocument/completion

- **WHEN** a completion request arrives
- **THEN** the server calls ecl-core completion, maps results to LSP CompletionItems, and responds

### Requirement: executeCommand provider

The ecl-lsp-server SHALL register an `executeCommandProvider` with the `ecl.evaluateExpression` command, enabling Code Lens actions to work in clients that use workspace/executeCommand (e.g., IntelliJ) instead of direct command execution.

#### Scenario: executeCommand capability registered

- **WHEN** server capabilities are sent during initialization
- **THEN** `executeCommandProvider.commands` includes `'ecl.evaluateExpression'`

#### Scenario: executeCommand triggers evaluation

- **WHEN** workspace/executeCommand is received with command `ecl.evaluateExpression` and arguments `[uri, line]`
- **THEN** the server evaluates the expression at that line and returns results through the same channel as Code Lens evaluation

### Requirement: Code Lens and semantic tokens stay in LSP server

Code Lens building and semantic token computation SHALL remain in ecl-lsp-server since they are LSP-specific presentation concerns.

#### Scenario: Code Lens builder in ecl-lsp-server

- **WHEN** a textDocument/codeLens request arrives
- **THEN** the ecl-lsp-server builds CodeLens items using ecl-core's parser for expression detection

#### Scenario: Semantic tokens in ecl-lsp-server

- **WHEN** a textDocument/semanticTokens request arrives
- **THEN** the ecl-lsp-server computes tokens using ecl-core's parser output

### Requirement: Standalone binary entry point

The ecl-lsp-server package SHALL provide a `bin/ecl-lsp-server.js` entry point that starts the server via stdio, usable by any LSP client.

#### Scenario: Server starts via node

- **WHEN** running `node bin/ecl-lsp-server.js --stdio`
- **THEN** the server starts and listens on stdin/stdout for LSP messages

#### Scenario: Package bin field registered

- **WHEN** inspecting `packages/ecl-lsp-server/package.json`
- **THEN** `"bin": { "ecl-lsp-server": "bin/ecl-lsp-server.js" }` is present

### Requirement: Custom LSP requests preserved

The ecl-lsp-server SHALL continue to support custom requests: `ecl/evaluateExpression`, `ecl/getSnomedEditions`, `ecl/searchConcept`, and the `ecl/resolvedSnomedVersion` notification.

#### Scenario: ecl/getSnomedEditions returns editions

- **WHEN** client sends `ecl/getSnomedEditions` request
- **THEN** server returns available SNOMED CT editions from the terminology service

#### Scenario: ecl/resolvedSnomedVersion notification sent

- **WHEN** the first FHIR response resolves the actual SNOMED version
- **THEN** server sends `ecl/resolvedSnomedVersion` notification to the client
