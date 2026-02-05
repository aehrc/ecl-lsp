# Claude Context: ECL Language Server Project

## Project Overview

This is a Language Server Protocol (LSP) implementation for SNOMED CT Expression Constraint Language (ECL) 2.2, providing IDE support for writing ECL expressions in VSCode, IntelliJ IDEA, Neovim, Sublime Text, and Emacs.

## Current Status: Production Ready ✅

**Version:** 1.0.0
**Test Coverage:** 1653+ tests (all passing)
**FHIR Integration:** Live (tx.ontoserver.csiro.au)

## Core Features Implemented

### 1. Syntax Highlighting & Parsing

- ANTLR4-based parser using official SNOMED ECL grammar
- TextMate grammar for syntax coloring
- Real-time syntax error detection with clear messages
- Multi-line expression support with comment handling

### 2. LSP Features

- **Diagnostics:** Syntax errors (red) + concept warnings (yellow) + description ID validation in filter blocks
- **Completion:** Context-aware operators, extended operators (`<!`, `<<!`, `>!`, `>>!`), filter block keywords with keyword-aware value completions (typeId, dialectId, moduleId with FHIR-powered dynamic expansion; definitionStatusId static; language codes), refinement items, concept search, 18 snippets; triggers on `^`, `:`, `=`, `{`
- **Hover:** Operator documentation (all 15 operators including `<!`, `<<!`, `>!`, `>>!`, `^`, `!!>`, `!!<`) + concept information
- **Code Actions:** Quick fixes for common errors + 8 refactoring actions (add/strip display terms, unified simplify, add/remove parentheses, add history supplement with 4 profile choices, add description filter)
- **Code Lens:** "Evaluate" action above each expression; shows concept count after evaluation
- **Expression Evaluation:** On-demand evaluation via Code Lens or Command Palette, results in "ECL Evaluation" output channel

### 3. Formatting

- **Document & Range formatting** with 9 configuration options
- **Line breaking** at configurable max length (parenthesis-depth aware)
- **Term alignment**, comment wrapping, break-on-operator modes
- **Filter block normalization** — keyword casing (typeId, moduleId, etc.), spacing, type letter

### 4. SNOMED CT Edition & Version

- **Status bar** showing current edition/version
- **QuickPick selector** for switching between editions (International, AU, US, UK, etc.)
- **Version pinning** or latest mode

### 5. FHIR Terminology Integration

- **Inactive Concept Detection:** Warns when using inactive SNOMED concepts
- **Unknown Concept Detection:** Warns when concept not found in terminology server
- **Concept Hover:** Shows FSN, PT, and active status for any concept ID
- **ECL Evaluation:** `ValueSet/$expand` with SNOMED CT implicit value set URLs (15s timeout, configurable result limit)
- **Semantic Validation:** Attribute scope, value constraints, empty sub-expressions
- **Caching:** 10,000 concept LRU cache for performance (evaluation results cached per-session in code lens)
- **Graceful Degradation:** Works offline

## Architecture

```
ecl-lsp/
├── grammar/              ANTLR4 ECL grammar (official, repo root)
├── shared/               Shared resources across clients
│   └── syntaxes/         TextMate grammar (single source of truth)
├── packages/
│   ├── ecl-core/         Zero-dependency core library
│   │   └── src/
│   │       ├── parser/       Parser + AST + concept extraction + refinement checks
│   │       ├── formatter/    Document formatter (7 modules)
│   │       ├── completion/   Context-aware completion engine (4 modules)
│   │       ├── refactoring/  8 refactoring code actions (7 modules)
│   │       ├── semantic/     Semantic validation engine
│   │       ├── validation/   Error refinement (pure functions)
│   │       ├── terminology/  FHIR service integration
│   │       ├── knowledge/    Structured ECL reference documentation
│   │       ├── test/         1439 tests across 30 files
│   │       └── types.ts      Core-native types (no LSP dependency)
│   ├── ecl-lsp-server/   Thin LSP adapter (depends on ecl-core + vscode-languageserver)
│   │   └── src/
│   │       ├── server.ts     Main LSP server (type mapping, lifecycle)
│   │       ├── code-lens.ts  Code Lens builder
│   │       ├── semantic-tokens.ts  Semantic token provider
│   │       └── test/         61 tests (unit + LSP protocol integration)
│   └── ecl-mcp-server/   MCP server (depends on ecl-core + @modelcontextprotocol/sdk)
│       └── src/
│           ├── server.ts     6 MCP tools (validate, evaluate, lookup, search, format, editions)
│           ├── resources.ts  ECL literacy guides (from ecl-core knowledge module)
│           └── test/         15 tests
├── clients/              IDE client extensions
│   ├── vscode/           VSCode extension (VSIX-ready)
│   ├── intellij/         IntelliJ IDEA Ultimate plugin (Kotlin/Gradle)
│   ├── eclipse/          Eclipse IDE plugin (LSP4E + TM4E, Maven/Tycho)
│   ├── claude-code/      Claude Code plugin (PATH-based LSP)
│   ├── neovim/           Neovim LSP config guide
│   ├── sublime/          Sublime Text LSP config guide
│   └── emacs/            Emacs (eglot/lsp-mode) config guide
└── examples/             Test ECL files
```

## Key Technical Decisions

### Parser: ANTLR4 with Official Grammar

- Uses official SNOMED ECL grammar from IHTSDO
- Ensures spec compliance
- Grammar file: `grammar/ECL.g4` (286 lines, at repo root)
- **Single-entry parse cache** — `parseECL()` caches the last result; same input string returns cached result (eliminates redundant parsing across validation, code actions, and hover)

### AST Visitor: Complete Tree Coverage

- Visitor implements all core ECL expression types: compound (AND/OR/MINUS), refined (`:` with attributes), dotted (`.` chains), and all constraint operators
- CompoundExpressionNode uses N-ary `operands[]` array (not binary left/right)
- SubExpressionNode includes constraint operator, memberOf flag, optional `filters[]`, and optional `historySupplement`
- AttributeNode is a full ASTNode with range, reversed flag, and flexible value (expression or raw)
- FilterConstraintNode extracts concept-bearing parts from description (`{{D}}`), concept (`{{C}}`), and member (`{{M}}`) filters (typeId, moduleId, dialectId, definitionStatusId, memberfieldfilter expression values)
- HistorySupplementNode captures profile suffix (MIN/MOD/MAX) and optional subset expression

### Concept Extraction: AST-Only

- AST traversal for all concepts — focus concepts, attribute names, attribute values, filter constraints, and history supplements
- Extracts from ConceptReference, AttributeName, FilterConstraintNode (conceptExpressions + conceptReferences), and HistorySupplementNode (subsetExpression)
- No regex fallback — the AST covers all concept-bearing ECL constructs since filter and history supplement support was added
- Deduplication of results
- `extractConceptIdsFromText` remains as a standalone utility (used by its own tests) but is not called by `extractConceptIds`

### Refactoring Code Actions

8 refactoring actions in `server/src/refactoring/`, orchestrated by `index.ts`:

| Action                       | Sync/Async   | Description                                                                                         |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| Strip display terms          | Sync         | Remove all `\|...\|` display terms from expression                                                  |
| Add display terms            | Async (FHIR) | Add FSN display terms to bare concept IDs via `$lookup`                                             |
| Simplify                     | Async (FHIR) | Unified bottom-up simplification engine (see below)                                                 |
| Add explicit parentheses     | Sync         | Disambiguate mixed AND/OR/MINUS by precedence, or refinement ambiguity (multiple colons at depth 0) |
| Remove redundant parentheses | Sync         | Remove unnecessary `(...)` around single sub-expressions                                            |
| Add history supplement       | Sync         | 4 profile-specific actions: HISTORY-MIN, HISTORY-MOD, HISTORY-MAX, HISTORY                          |
| Add description filter       | Sync         | Append `{{ D term = "" }}`                                                                          |

**Unified simplify engine:** A single "Simplify" action replaces the previous three separate actions (simplify expression, simplify by subsumption, factor common focus). It walks the expression tree bottom-up (innermost parenthesized sub-expressions first) and applies a chain of techniques at each AND/OR compound node:

1. **Remove exact duplicates** — text-identical operand removal
2. **Same-concept operator ranking** — AND keeps most restrictive (`self > < > <<`), OR keeps broadest
3. **Factor common focus (OR)** — `(< F : a=v1) OR (< F : a=v2)` → `< F : a=v1 OR a=v2`
4. **Merge same-focus refinements (AND)** — `(< F : a=v1) AND (< F : a=v2)` → `< F : a=v1 AND a=v2`
5. **FHIR subsumption via MINUS** — `(A) MINUS (B) = 0` means A ⊆ B; AND keeps smaller, OR keeps larger

After any technique transforms the expression, the chain restarts to catch cascading simplifications. Uses the LSP code action resolve pattern (FHIR calls happen only when the user selects the action).

**Subsumption safeguards:** Pre-evaluates each operand individually. Operands that are empty (unknown/inactive concepts) are never removed — only genuine subset relationships between non-empty concept sets justify simplification. Per-pair error handling ensures one failed FHIR call doesn't abort the entire resolution.

**Sub-expression support:** When the cursor is inside a parenthesized group, non-simplification refactorings (parentheses, etc.) are offered for that inner sub-expression (labelled with `(sub-expression)` suffix). The unified simplify engine handles nesting internally, so no separate sub-expression simplify action is needed.

**Case-insensitive operators:** All refactoring modules, error analysis, error refinement, and hover/code action handlers treat ECL operators (AND, OR, MINUS) as case-insensitive per the ANTLR grammar.

### FHIR Integration: Real Server with Caching

- Endpoint: `https://tx.ontoserver.csiro.au/fhir`
- Operations: `CodeSystem/$lookup` for concept info, `ValueSet/$expand` for ECL evaluation
- Correctly parses SNOMED's nested `inactive` property structure
- 2-second timeout per concept lookup, 15-second timeout for ECL evaluation
- Returns null on error (graceful degradation)

### Validation: Debounced Two-Phase

- **Immediate phase:** Syntax parsing + error diagnostics sent instantly on every keystroke
- **Debounced phase:** FHIR-dependent concept and semantic validation fires 500ms after last edit
- Parses each non-empty, non-comment line independently
- Collects all diagnostics before sending to client

## Recent Bugs Fixed

### Bug 1: Validation Stopping at Empty Lines

**Issue:** Used `return` instead of `continue` in for loop
**Impact:** All syntax errors after first empty line were missed
**Fix:** Changed to `continue` to properly skip empty lines

### Bug 2: Inactive Concepts Showing as Active

**Issue:** FHIR parsing expected top-level `active` parameter
**Reality:** SNOMED uses nested property structure:

```json
{
  "name": "property",
  "part": [
    { "name": "code", "valueCode": "inactive" },
    { "name": "value", "valueBoolean": true }
  ]
}
```

**Fix:** Updated parser to traverse property array correctly

## Test Coverage (1653+ tests)

- ✅ Parser: Valid/invalid expressions, AST structure, edge cases
- ✅ Parser helpers
- ✅ Diagnostics: Error messages, multi-line, comments, case-insensitive operators
- ✅ Concept extraction: AST, fallback, regex
- ✅ Inactive concept detection
- ✅ Inline concept autocomplete
- ✅ Full completion provider: operators, refinements, filters, extended operators, snippets, language codes
- ✅ FHIR filter completion cache: TTL, error handling, deduplication
- ✅ Completion context integration + context detector
- ✅ ECL evaluation + Code Lens
- ✅ Formatter: Rules, comments, config validation, idempotence, range formatting
- ✅ Semantic validation + FHIR integration
- ✅ SNOMED ID validation + Verhoeff check digit + description ID validation
- ✅ ECL 2.2 specification compliance (102 tests from official spec §6.1–§6.11)
- ✅ Error analysis: tokenizer + 7 heuristic detectors, case-insensitive operator recognition
- ✅ Error refinement: ANTLR message → user-friendly diagnostics
- ✅ ECL text extraction: extractText, extractRefinementInfo, extractCompoundOperands
- ✅ Refinement check: mixed AND/OR detection in refinements
- ✅ Expression grouper
- ✅ Position detector for concept search trigger
- ✅ FHIR concept search logic
- ✅ SNOMED CT edition/version selection
- ✅ Terminology edge cases
- ✅ Refactoring: strip/add display terms, unified simplify (duplicates, operator ranking, factor focus, merge focus, FHIR subsumption, bottom-up nesting, re-check cascade), add/remove parentheses (mixed operators + refinement ambiguity), history supplement (4 profiles), description filter, null-expression guards, sub-expression targeting
- ✅ VSCode E2E: Extension activation, diagnostics (error + valid), completion, hover, formatting (6 tests)
- ✅ IntelliJ E2E: File type recognition, server descriptor, extension points, settings, bundled server integrity (18+ tests)
- ✅ Eclipse E2E: Content types, bundle state, preferences, bundled server integrity (deps + Node.js load test), LSP4E wiring, TextMate grammar (24 tests)

## Example Diagnostics

### Syntax Errors (Red Squiggles)

```ecl
< 404684003 AND AND < 19829001  // Duplicate operator
< 404684003 < 19829001          // Missing operator
< 404684003 AND                 // Incomplete expression
```

### Concept Warnings (Yellow Squiggles)

```ecl
< 399144008 |Bronze diabetes|   // INACTIVE concept
< 123456789 |Invalid|           // Unknown concept
```

## Files to Know About

### ecl-core (packages/ecl-core/src/)

- `parser/index.ts` - ANTLR parser wrapper
- `parser/ast.ts` - AST node types (complete ECL tree including filters and history supplements)
- `parser/visitor.ts` - ANTLR visitor (compound, refined, dotted, operators, filters, history supplements)
- `parser/concept-extractor.ts` - AST-based concept extraction
- `parser/refinement-check.ts` - Mixed AND/OR detection in refinements (IHTSDO #12 workaround)
- `completion/provider.ts` - Main completion provider
- `completion/context-detector.ts` - Cursor position context analysis
- `completion/context-items.ts` - Completion item generation per context
- `completion/snippets.ts` - ECL snippet definitions
- `completion/filter-cache.ts` - FHIR filter expansion cache
- `formatter/formatter.ts` - Main document formatter
- `formatter/rules.ts` - Formatting rules
- `formatter/range.ts` - Range formatting
- `formatter/comments.ts` - Comment extraction/reinsertion
- `semantic/validator.ts` - Semantic validation engine
- `semantic/ecl-text.ts` - ECL text extraction utilities
- `terminology/fhir-service.ts` - FHIR integration (lookup + evaluation + search)
- `validation/error-refinement.ts` - Pure function: ANTLR error → user-friendly diagnostic
- `refactoring/index.ts` - Refactoring orchestrator
- `refactoring/simplify-expression.ts` - Unified bottom-up simplify engine (5 techniques)
- `knowledge/index.ts` - ECL reference documentation (operators, refinements, filters, patterns, grammar, history)

### ecl-lsp-server (packages/ecl-lsp-server/src/)

- `server.ts` - Main LSP server (type mapping ecl-core → LSP, lifecycle)
- `code-lens.ts` - Code Lens builder for expression evaluation
- `semantic-tokens.ts` - Semantic token provider

### ecl-mcp-server (packages/ecl-mcp-server/src/)

- `server.ts` - MCP server with 6 tools (validate, evaluate, lookup, search, format, editions)
- `resources.ts` - ECL literacy guides (sourced from ecl-core knowledge module)

### IntelliJ Client

- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclLspServerSupportProvider.kt` - LSP server activation on .ecl file open
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclLspServerDescriptor.kt` - Server launch config + workspace/configuration
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclLsp4jClient.kt` - Custom LSP client (ecl/resolvedSnomedVersion notification)
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclLanguageServer.kt` - Custom server interface (ecl/getSnomedEditions, ecl/searchConcept)
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclSettings.kt` - Persistent settings state
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclSettingsConfigurable.kt` - Settings UI (Kotlin UI DSL v2)
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/SnomedEditionWidget.kt` - Status bar widget
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/SnomedEditionPicker.kt` - Two-step edition/version picker popup
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclFileType.kt` - .ecl file type + language registration
- `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclTextMateBundleProvider.kt` - TextMate grammar registration
- `clients/intellij/src/main/resources/META-INF/plugin.xml` - Plugin descriptor
- `clients/intellij/build.gradle.kts` - Gradle build config (bundleServer task bundles all npm deps)

### Eclipse Client

- `clients/eclipse/au.csiro.ecl.eclipse/plugin.xml` - Plugin descriptor (content type, LSP4E with `languageServer` attribute, TM4E, preferences)
- `clients/eclipse/au.csiro.ecl.eclipse/src/au/csiro/ecl/eclipse/EclStreamConnectionProvider.java` - LSP4E connection provider (bundled + PATH fallback)
- `clients/eclipse/au.csiro.ecl.eclipse/src/au/csiro/ecl/eclipse/EclPreferencePage.java` - Preferences UI (FHIR, formatting, evaluation)
- `clients/eclipse/au.csiro.ecl.eclipse/src/au/csiro/ecl/eclipse/EclPreferenceInitializer.java` - Default preference values
- `clients/eclipse/au.csiro.ecl.eclipse/src/au/csiro/ecl/eclipse/EclPlugin.java` - Plugin activator
- `clients/eclipse/au.csiro.ecl.eclipse/pom.xml` - Plugin POM (bundles server + all npm deps via maven-resources-plugin)
- `clients/eclipse/au.csiro.ecl.eclipse.test/` - Test fragment (24 headless tests: server integrity, LSP4E wiring, preferences)
- `clients/eclipse/au.csiro.ecl.eclipse.target/ecl-eclipse.target` - Target platform (Eclipse 2024-12)
- `clients/eclipse/pom.xml` - Maven/Tycho parent POM
- Build: `cd clients/eclipse && mvn clean verify`

### Tests

**ecl-core** (1439 tests in `packages/ecl-core/src/test/`):

- Parser, diagnostics, completion, formatter, semantic, ECL spec compliance (§6.1–§6.11), knowledge module

**ecl-lsp-server** (61 tests in `packages/ecl-lsp-server/src/test/`):

- Unit tests (code lens, semantic tokens) + LSP protocol integration tests (9 tests spawning real server)

**ecl-mcp-server** (15 tests in `packages/ecl-mcp-server/src/test/`):

- Tool logic, resource serving, configuration

**Browser editors** (138 tests):

- ecl-editor-monaco (71 tests): Diagnostics engine, Monaco adapter mapping
- ecl-editor-react (33 tests): React component, hook behavior
- ecl-editor-element (34 tests): Web component, attribute binding

**VSCode E2E** (6 tests in `clients/vscode/src/test/e2e/`):

- Extension activation, diagnostics (error + valid), completion, hover, formatting
- Run: `cd clients/vscode && npm run test:e2e`

**IntelliJ** (18+ tests in `clients/intellij/src/test/kotlin/`):

- File type recognition, server descriptor, extension points, settings, bundled server integrity
- Run: `cd clients/intellij && ./gradlew test`

**Eclipse** (24 tests in `clients/eclipse/au.csiro.ecl.eclipse.test/`):

- Content types, bundle state, preferences, bundled server integrity (deps + Node.js load), LSP4E wiring, TextMate grammar
- 2 integration tests (gated: `-Decl.test.integration=true`, needs UI harness)
- Run: `cd clients/eclipse && mvn clean verify`

### Examples

- `examples/real-fhir-test.ecl` - Real SNOMED concepts
- `examples/manual-test.ecl` - Manual testing guide
- `examples/test-simplify.ecl` - Unified simplify engine examples (all 5 techniques)

## Working with This Project

### Build & Test

```bash
npm run compile  # Compiles all packages (ecl-core → ecl-lsp-server → ecl-mcp-server → vscode client)
npm test         # Runs 1515+ tests across all packages

# VSCode E2E tests (launches real VSCode instance)
cd clients/vscode && npm run test:e2e

# IntelliJ plugin
cd clients/intellij
./gradlew build        # Compile plugin
./gradlew buildPlugin  # Build distributable ZIP
./gradlew runIde       # Launch sandboxed IDE with plugin
./gradlew test         # Run IntelliJ platform tests

# Eclipse plugin (Maven/Tycho)
cd clients/eclipse
mvn clean verify       # Build + run 24 headless tests
# Integration tests (needs display or Xvfb on Linux):
mvn clean verify -Decl.test.integration=true
```

### Debug in VSCode

1. Open project in VSCode
2. Press F5 → Launches Extension Development Host
3. Open any `.ecl` file
4. Check Output panel → "ECL Language Server"

### Debug in IntelliJ

1. Run `cd clients/intellij && ./gradlew runIde`
2. Open any `.ecl` file in the launched IDE
3. Enable LSP logging: Help → Diagnostic Tools → Debug Log Settings → add `#com.intellij.platform.lsp`

### Common Tasks

**Regenerate parser from grammar:**

```bash
cd packages/ecl-core
npm run antlr4ts
```

**Add new test:**

- Add to appropriate `packages/ecl-core/src/test/*.test.ts` or `packages/ecl-lsp-server/src/test/*.test.ts` file
- Run `npm test` to verify

**Modify FHIR parsing:**

- Edit `packages/ecl-core/src/terminology/fhir-service.ts`
- Tests use `MockTerminologyService` for offline testing

## Known Limitations

- Filter constraint internals (term values, language codes, effective times, active flags) are not modelled in the AST — only concept-bearing parts are extracted
- ANTLR grammar allows mixed AND/OR in refinements ([IHTSDO #12](https://github.com/IHTSDO/snomed-expression-constraint-language/issues/12)) — workaround via post-parse `refinement-check.ts` (removable when grammar is fixed)
- Eclipse client requires Maven/Tycho build (not part of npm workflow)

## Future Enhancements

- Go to definition for concept references
- JetBrains Marketplace publishing for IntelliJ plugin
- Eclipse Marketplace publishing

## Dependencies

**ecl-core:**

- `antlr4ts` ^0.5.0-alpha.4
- `node-fetch` ^2.7.0

**ecl-lsp-server:**

- `ecl-core` (workspace dependency)
- `vscode-languageserver` ^9.0.1
- `vscode-languageserver-textdocument` ^1.0.11

**ecl-mcp-server:**

- `ecl-core` (workspace dependency)
- `@modelcontextprotocol/sdk` ^1.12.1
- `zod` ^3.24.4

**VSCode Client:**

- `vscode-languageclient` ^9.0.1

**IntelliJ Client:**

- Kotlin 2.0 + IntelliJ Platform Gradle Plugin 2.11.0
- IntelliJ IDEA Ultimate 2024.2+ (`com.intellij.modules.lsp`)
- TextMate grammar shared from `shared/syntaxes/`

**Eclipse Client:**

- Java 17 + Maven/Tycho 4.0.8
- Eclipse 2024-12 target platform (LSP4E, TM4E, JUnit 4)
- Bundles ecl-lsp-server with all npm deps (LSP protocol, antlr4ts, node-fetch)

## OpenSpec Integration

This project uses OpenSpec for ALL change management, design documents, and implementation plans. Do NOT create plans or design docs under `docs/plans/` — use OpenSpec changes exclusively (`openspec/changes/`). Use the `opsx` skills for creating and managing changes.

- Active changes: `openspec/changes/<change-name>/`
- Archived changes: `openspec/changes/archive/`
- Live specs: `openspec/specs/`

## Resources

- [SNOMED ECL Spec](https://confluence.ihtsdotools.org/display/DOCECL)
- [ECL Grammar Repo](https://github.com/IHTSDO/snomed-expression-constraint-language)
- [LSP Spec](https://microsoft.github.io/language-server-protocol/)
- [FHIR Terminology](https://hl7.org/fhir/terminology-service.html)

---

**Last Updated:** 2026-03-03
**Last Change:** IDE client E2E tests — VSCode (6 tests), IntelliJ (18+ tests), Eclipse (24 tests). Fixed Eclipse LSP4E wiring (missing `languageServer` attribute), server bundling (all npm deps), and IntelliJ bundled dep gaps (`vscode-jsonrpc`, `antlr4ts`, `node-fetch`).
**Status:** Production Ready ✅
