## ADDED Requirements

### Requirement: Zero-dependency core library

The ecl-core package SHALL have zero dependencies on LSP-specific packages (`vscode-languageserver`, `vscode-languageserver-textdocument`). All ECL intelligence (parser, formatter, completion, semantic validation, refactoring, error refinement, terminology) SHALL be accessible through ecl-core's public API without any LSP runtime.

#### Scenario: No LSP imports in ecl-core source

- **WHEN** scanning all source files in `packages/ecl-core/src/`
- **THEN** no file imports from `vscode-languageserver` or `vscode-languageserver-textdocument`

#### Scenario: No LSP packages in ecl-core dependencies

- **WHEN** inspecting `packages/ecl-core/package.json`
- **THEN** neither `dependencies` nor `devDependencies` includes `vscode-languageserver` or `vscode-languageserver-textdocument`

#### Scenario: ecl-core builds independently

- **WHEN** running `npm run compile` in `packages/ecl-core/`
- **THEN** compilation succeeds with zero errors and produces `dist/` output

### Requirement: Core-native type system

The ecl-core package SHALL define its own type interfaces for positions, ranges, text edits, code actions, completion items, and diagnostics. These types SHALL be structurally compatible with but independent of LSP protocol types.

#### Scenario: CorePosition and CoreRange defined

- **WHEN** importing from ecl-core
- **THEN** `CorePosition` (line, character) and `CoreRange` (start, end) interfaces are available

#### Scenario: CoreTextEdit defined

- **WHEN** importing from ecl-core
- **THEN** `CoreTextEdit` with `range: CoreRange` and `newText: string` is available

#### Scenario: CoreCodeAction defined

- **WHEN** importing from ecl-core
- **THEN** `CoreCodeAction` with `title`, `kind` ('quickfix' | 'refactor'), optional `edits`, and optional `data` is available

#### Scenario: CoreCompletionItem defined

- **WHEN** importing from ecl-core
- **THEN** `CoreCompletionItem` with `label`, `kind`, optional `detail`, `documentation`, `insertText`, `insertTextFormat`, `textEdit`, `sortText`, `filterText`, and `command` is available

#### Scenario: CoreDiagnostic defined

- **WHEN** importing from ecl-core
- **THEN** `CoreDiagnostic` with `range`, `message`, `severity` ('error' | 'warning' | 'information' | 'hint'), and optional `source` is available

### Requirement: Parser module in ecl-core

The ecl-core package SHALL export the full parser module including `parseECL`, AST types, concept extraction, expression grouping, refinement checking, error analysis, and position detection.

#### Scenario: parseECL exported

- **WHEN** importing `parseECL` from ecl-core
- **THEN** calling `parseECL(eclString)` returns a `ParseResult` with optional `ast`, `errors`, and `warnings`

#### Scenario: AST types exported

- **WHEN** importing AST types from ecl-core
- **THEN** all node types (`ExpressionNode`, `CompoundExpressionNode`, `RefinedExpressionNode`, `SubExpressionNode`, `AttributeNode`, `FilterConstraintNode`, `HistorySupplementNode`) are available

#### Scenario: Concept extraction exported

- **WHEN** importing `extractConceptIds` from ecl-core
- **THEN** calling it with an AST returns an array of `ConceptReference` objects with `conceptId`, `term`, and `range`

#### Scenario: All parser tests pass in ecl-core

- **WHEN** running ecl-core test suite
- **THEN** all parser, AST, concept extraction, expression grouper, refinement check, error analysis, and position detector tests pass

### Requirement: Terminology module in ecl-core

The ecl-core package SHALL export the terminology module including `FhirTerminologyService`, Verhoeff validation, and all terminology types.

#### Scenario: FhirTerminologyService exported

- **WHEN** importing from ecl-core
- **THEN** `FhirTerminologyService` class is available with methods for concept lookup, ECL evaluation, bulk expand, and search

#### Scenario: Verhoeff validation exported

- **WHEN** importing from ecl-core
- **THEN** `isValidSnomedId`, `isValidConceptId`, and `isValidDescriptionId` functions are available

#### Scenario: All terminology tests pass in ecl-core

- **WHEN** running ecl-core test suite
- **THEN** all Verhoeff, SNOMED version, terminology edge case, and FHIR filter cache tests pass

### Requirement: Formatter module in ecl-core

The ecl-core package SHALL export the formatter module with document formatting, range formatting, formatting rules, and configuration validation. The formatter SHALL NOT depend on LSP `Connection` or `TextDocument` types.

#### Scenario: formatDocument exported

- **WHEN** importing `formatDocument` from ecl-core
- **THEN** calling it with ECL text and formatting options returns formatted text

#### Scenario: Range formatting works with plain text

- **WHEN** calling range formatting functions from ecl-core
- **THEN** they accept plain text and `CoreRange` (not LSP `TextDocument` and `Range`)

#### Scenario: All formatter tests pass in ecl-core

- **WHEN** running ecl-core test suite
- **THEN** all formatter, range formatter, and config validation tests pass

### Requirement: Refactoring module in ecl-core

The ecl-core package SHALL export the refactoring module with all 8 refactoring engines returning `CoreCodeAction` types instead of LSP `CodeAction` types.

#### Scenario: getRefactoringActions returns CoreCodeAction array

- **WHEN** calling `getRefactoringActions` from ecl-core
- **THEN** it returns `CoreCodeAction[]` with `kind` set to `'refactor'`

#### Scenario: Refactoring accepts plain text input

- **WHEN** calling refactoring functions from ecl-core
- **THEN** they accept document URI, document text, and `CoreRange` (not LSP `TextDocument`)

#### Scenario: All refactoring tests pass in ecl-core

- **WHEN** running ecl-core test suite
- **THEN** all 8 refactoring engine tests pass including sub-expression targeting

### Requirement: Completion module in ecl-core

The ecl-core package SHALL export the completion module returning `CoreCompletionItem` types instead of LSP `CompletionItem` types.

#### Scenario: Completion items use core types

- **WHEN** calling completion functions from ecl-core
- **THEN** they return `CoreCompletionItem[]` with `kind` as string literals ('keyword', 'operator', 'snippet', etc.)

#### Scenario: All completion tests pass in ecl-core

- **WHEN** running ecl-core test suite
- **THEN** all context detection, context items, filter cache, and completion provider tests pass

### Requirement: Validation and semantic modules in ecl-core

The ecl-core package SHALL export the error refinement and semantic validation modules.

#### Scenario: refineParseError exported

- **WHEN** importing `refineParseError` from ecl-core
- **THEN** calling it with an ANTLR error returns a user-friendly diagnostic message and highlight range

#### Scenario: Semantic validation exported

- **WHEN** importing semantic validation from ecl-core
- **THEN** `validateSemantics` and ECL text extraction functions are available

#### Scenario: All validation tests pass in ecl-core

- **WHEN** running ecl-core test suite
- **THEN** all error refinement, semantic validation, and ECL text extraction tests pass

### Requirement: Monorepo workspace configuration

The root `package.json` SHALL configure npm workspaces including `packages/ecl-core`, `packages/ecl-lsp-server`, and `clients/vscode` (and other packages as added).

#### Scenario: npm install resolves workspace dependencies

- **WHEN** running `npm install` at the repository root
- **THEN** all workspace packages are linked and their dependencies installed

#### Scenario: ecl-lsp-server can import from ecl-core

- **WHEN** ecl-lsp-server's `package.json` lists `"ecl-core": "file:../ecl-core"` as a dependency
- **THEN** `import { parseECL } from 'ecl-core'` resolves correctly

### Requirement: Independent package versioning

Each package under `packages/` SHALL have its own `package.json` with independent `version` field. Only packages with actual changes SHALL be published.

#### Scenario: ecl-core has its own version

- **WHEN** inspecting `packages/ecl-core/package.json`
- **THEN** it has a `version` field independent of ecl-lsp-server

#### Scenario: Version bump in ecl-core does not require ecl-lsp-server bump

- **WHEN** ecl-core has a patch fix with no API changes
- **THEN** ecl-lsp-server version can remain unchanged
