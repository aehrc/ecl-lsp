# Changelog

All notable changes to the ECL Language Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-08-19

> **Note for `@aehrc/ecl-core` consumers:** this release changes the failure
> contract of `FhirTerminologyService`. `getConceptInfo` and `validateConcepts`
> could not previously throw and now can, and `searchConcepts` no longer throws
> the literal string `Terminology server unavailable`. See _Changed_ below for
> the migration. This is a breaking change to that contract, released as a minor
> version because the previous behaviour was itself the defect being fixed.

### Fixed

- **Parser: bare multi-digit concrete integers** (`ecl-core`) ([#69](https://github.com/aehrc/ecl-lsp/issues/69)): `parseECL` rejected `#20`, `#100` and `#-20` while accepting `#5` and `#20.0`. The ECL grammar anchors no rule with `EOF`, so under full-context `LL` prediction the `digit*` loop in `integervalue` could exit after one digit and still reach a legal accept state, truncating the value. Parsing now runs SLL-first with LL as a fallback, which restores greedy loop resolution while leaving error messages for genuinely invalid input unchanged.
- **Formatter: `OR` between refinement attributes was rewritten as `,`** (`ecl-core`) ([#73](https://github.com/aehrc/ecl-lsp/issues/73)): the AST flattened refinement attribute sets, so a disjunction was printed as a conjunction and the formatted expression selected a different set of concepts (5965 vs 168 for the reported expression). `RefinementNode` now carries a structural member tree with operator and grouping, and the printer emits `OR` as `OR` while retaining load-bearing parentheses. A semantic guard compares a structural signature of the input and the formatted output and returns the input unchanged rather than emit an expression that means something else.
- **Formatter: `spaceAroundOperators: false` emitted unparseable ECL** (`ecl-core`): the option applied only to the `AND`, `OR` and `MINUS` keywords — exactly the operators the grammar requires mandatory whitespace around — so `< 404684003 AND < 19829001` became `< 404684003AND< 19829001`. Keyword operators now always keep their spaces. The option is retained and documented as having no effect, matching `alignTerms`; constraint operators were never affected by it.
- **ECL evaluation: term annotations and description filters corrupted the request** (`ecl-core`) ([#68](https://github.com/aehrc/ecl-lsp/issues/68)): a `|` inside an expression was read by the server as the canonical URL's `system|version` delimiter, so everything after the last pipe became a version string. Reserved characters are now percent-encoded within the ECL before the canonical URL is assembled, with `%` escaped first to keep the transform injective. This also fixes a silent wrong answer: an expression containing a literal `%7C` previously returned HTTP 200 with `total=0` rather than an error.
- **ECL evaluation on servers without implicit ValueSet support** (`ecl-core`, `ecl-lsp-server`, VS Code) ([#55](https://github.com/aehrc/ecl-lsp/issues/55)): evaluation now falls back to `POST ValueSet/$expand` with `compose.include.filter` `property: "constraint"` when a server cannot serve the implicit `fhir_vs=ecl` URL, latching the choice once it succeeds. The fallback deliberately does not trigger on HTTP 422, so genuine ECL syntax errors are not retried.
- **Repeated futile bulk `$expand` attempts** (`ecl-core`) ([#55](https://github.com/aehrc/ecl-lsp/issues/55)): a server that rejects the bulk `ValueSet/$expand` with a 4xx had the same doomed request reissued on every validation pass. The rejection is now latched and concept validation goes straight to individual lookups. A 5xx is treated as transient and does not latch.

### Added

- **Typed terminology errors** (`ecl-core`): `TerminologyTransportError` and `TerminologyHttpError`, both extending `TerminologyError`, with a `kind` discriminant, the HTTP `status` where there was one, and the original error as `cause`. Guards `isTerminologyError`, `isTerminologyTransportError` and `isTerminologyHttpError` are exported alongside them.
- **`evaluationStrategy` setting** (`ecl-core`, `ecl-lsp-server`, VS Code): `auto` (default), `implicit-url` or `post`, selecting how ECL expressions are sent to the terminology server. Exposed in VS Code as `ecl.terminology.evaluationStrategy`.

### Changed

- **Terminology failures are no longer reported as concept absence** (`ecl-core`) ([#70](https://github.com/aehrc/ecl-lsp/issues/70), [#71](https://github.com/aehrc/ecl-lsp/issues/71)): `getConceptInfo` returned `null` for both "concept absent" and "request failed", so a network outage was rendered to callers as a factual claim about SNOMED CT. It now returns `null` only for a well-formed FHIR not-found response and rejects with a typed error otherwise. `searchConcepts` no longer collapses every failure to `Error('Terminology server unavailable')`, and `validateConcepts` rethrows transport failures rather than returning a map of nulls.

  **Migration:** wrap `getConceptInfo` and `validateConcepts` calls in a `try`/`catch` if you do not already, and classify with `isTerminologyTransportError` / `isTerminologyHttpError` instead of matching on error message text. A `null` return now means the concept genuinely does not exist.

- **Editors and clients degrade gracefully on terminology failure**: the LSP server publishes no diagnostic when the terminology server cannot be reached, and hover reports that the concept's status is unknown rather than that it was not found. The Monaco hover provider does the same.

## [1.1.2] - 2026-04-09

### Fixed

- **Monaco editor: inactive concept replacement** (`ecl-editor-core`): The web component and React editor now offer the same inactive concept replacement quick fix as the LSP server
- **E2E test**: Added Playwright test verifying the inactive concept replacement quick fix appears in the Monaco editor

## [1.1.1] - 2026-04-08

### Fixed

- **Monaco editor: inactive concept replacement** (`ecl-editor-core`): The web component and React editor now offer the same inactive concept replacement quick fix as the LSP server — previously only available in VS Code/IntelliJ/Eclipse

## [1.1.0] - 2026-04-03

### Added

- **Canonical ECL comparison** (`ecl-core`): `canonicalise()` and `compareExpressions()` for structural equivalence checking without FHIR calls — strips display terms, sorts AND/OR operands and refinement attributes (numeric by SCTID), flattens same-operator compounds, removes redundant parentheses
- **Historical association lookups** (`ecl-core`): `getHistoricalAssociations()` on `FhirTerminologyService` queries SNOMED CT historical association reference sets (SAME AS, REPLACED BY, POSSIBLY EQUIVALENT TO, ALTERNATIVE) via FHIR `ConceptMap/$translate`
- **Inactive concept replacement quick fixes** (`ecl-lsp-server`): Code actions to replace inactive concepts with their active equivalents from historical association maps, with each association type shown as a separate action
- **Slack bot: multiple expressions**: Use backticks to send multiple ECL expressions in one message, processed in parallel. Mixed single and triple backticks supported
- **Slack bot: inactive concept replacement**: Second message with suggested replacement ECL where inactive concepts are substituted with the OR'd union of their historical association targets, including evaluation results
- **Remove redundant parentheses** (`ecl-core`): New `removeRedundantParentheses` formatter option that removes parens which don't change the meaning of an expression — removes non-compound wrappers like `(404684003)`, flattens same-operator nesting like `(A AND B) AND C`, and keeps parens where required by different operators
- **Toggle display terms** (Shift+Alt+T): Smart toggle keyboard shortcut for the web component and React editor — adds display terms via FHIR lookup when concept IDs are bare, strips them when all are present
- **`registerToggleTermsAction()`**: New export from `@aehrc/ecl-editor-core` for registering the toggle action on any Monaco editor instance
- **`getTerminologyService()`**: New method on `EclEditorDisposable` to access the current terminology service

### Fixed

- **Slack bot: closing brace preservation**: `extractEclFromProse()` no longer strips `}` from ECL expressions ending with attribute groups
- **Slack bot: simplified text handling**: Replaced fragile prose extraction with direct approach — everything after the bot mention is ECL, or use backticks to delimit multiple expressions
- **Shared language registration**: Web component now shares a single `registerEclLanguage` call across multiple `<ecl-editor>` instances, preventing duplicate hover tooltips and completions
- **Line highlight disabled**: `renderLineHighlight: 'none'` for cleaner embedded appearance

## [1.0.4] - 2026-04-01

### Fixed

- **Uncaught errors from Monaco providers**: Added try-catch to the completion provider, code action resolver, and filter completion enrichment so FHIR server errors during incomplete ECL editing return empty results instead of uncaught promise rejections.

## [1.0.3] - 2026-03-31

### Fixed

- **ecl-core browser compatibility**: Switched ecl-core to a Vite bundle that inlines antlr4ts with assert/util polyfills. Browser consumers (Webpack 5, CRA) no longer need Node builtin polyfill configuration.
- **Removed sourcemaps from all published packages**: Sourcemaps referenced src/\*.ts files not included in npm packages, causing warnings for consumers.

### Changed

- **ECL knowledge guides**: Updated `!!<` and `!!>` operator docs to show both bare and scoped (subexpression) forms. Added "Leaf-Most Within a Set" pattern. Added operator composability note to grammar reference.

## [1.0.2] - 2026-03-31

### Fixed

- **Concept search completion overwrites surrounding text**: Selecting a concept from autocomplete could delete preceding brackets, operators, or other content. The edit range now replaces exactly the typed search query instead of using `lastIndexOf` which could match text earlier in the line.
- **Concept search not triggering without space after grouping operators**: Typing a search term directly after `(`, `{`, or `,` without a space (e.g., `(food`) would not trigger concept search. The query extraction now accepts zero or more whitespace after these operators.

## [1.0.0] - 2026-03-04

Initial release with full ECL 2.2 support across five IDE platforms.

### Added

#### Core Language Features

- **Parser**: ANTLR4-based parser using official IHTSDO ECL 2.2 grammar with complete AST visitor covering compound, refined, dotted, and all constraint operator expressions
- **Syntax highlighting**: TextMate grammar for ECL syntax coloring (shared across all IDE clients)
- **Diagnostics**: Real-time syntax errors with user-friendly messages, inactive/unknown concept warnings via FHIR, description ID validation in filter blocks, semantic validation (attribute scope, value constraints, empty sub-expressions)
- **Completion**: Context-aware operator suggestions, extended operators (`<!`, `<<!`, `>!`, `>>!`), filter block keywords with keyword-aware value completions (typeId, dialectId, moduleId with FHIR-powered dynamic expansion; definitionStatusId static; language codes), refinement items, inline concept search, 18 ECL snippets; triggers on `^`, `:`, `=`, `{`
- **Hover**: Operator documentation for all 15 ECL operators (including `<!`, `<<!`, `>!`, `>>!`, `^`, `!!>`, `!!<`); concept info (FSN, PT, active status) via FHIR
- **Code Lens**: "Evaluate" lens above each expression with `ValueSet/$expand`, result count display, per-session result caching
- **Formatting**: Document and range formatting with 9 configuration options (indent, line breaking at configurable max length with parenthesis-depth awareness, term alignment, comment wrapping, break-on-operator modes, filter block normalization)
- **Code Actions**: Quick fixes for common errors (duplicate/missing operators) plus 8 refactoring actions: strip/add display terms, unified simplify (5 techniques with bottom-up nesting and FHIR subsumption), add/remove parentheses, add history supplement (4 profiles), add description filter
- **Semantic tokens**: Semantic token provider for enhanced syntax highlighting
- **SNOMED CT edition/version**: Status bar picker for switching editions and pinning versions
- **Expression grouping**: Multiple expressions per file via `/* ECL-END */` delimiters
- **Error analysis**: Tokenizer with 7 heuristic detectors, ANTLR error refinement to user-friendly messages
- **Knowledge module**: 50 structured ECL reference articles across 6 categories (operators, refinements, filters, patterns, grammar, history)

#### FHIR Terminology Integration

- `CodeSystem/$lookup` for concept info with inactive concept detection via nested property parsing
- `ValueSet/$expand` for ECL evaluation and concept search
- 10,000-concept LRU cache for performance
- 2-second timeout per concept lookup, 15-second timeout for ECL evaluation
- Graceful offline degradation

#### Packages

- **@aehrc/ecl-core**: Zero-dependency core library (parser, formatter, completion, refactoring, semantic validation, terminology, knowledge)
- **@aehrc/ecl-lsp-server**: Thin LSP adapter mapping ecl-core types to LSP protocol
- **@aehrc/ecl-editor-core**: Monaco editor integration (diagnostics engine, completion/hover/formatting/code action/semantic token providers)
- **@aehrc/ecl-editor-react**: React component wrapping Monaco editor with ECL support
- **@aehrc/ecl-editor**: Web component (`<ecl-editor>`) wrapping Monaco editor with ECL support
- **@aehrc/ecl-slack-bot**: Slack bot for validating, formatting, and evaluating ECL expressions — slash command (`/ecl`), @mention, and direct message support with SNOMED CT edition switching and Shrimp browser links

#### IDE Clients

- **VSCode**: Full-featured extension (VSIX-ready) with bundled server
- **IntelliJ IDEA**: Plugin for IntelliJ Ultimate with bundled server, status bar widget, edition/version picker, settings UI
- **Eclipse**: Plugin via LSP4E + TM4E with bundled server, preferences page
- **Claude Code**: Plugin using PATH-based LSP server
- **Neovim, Sublime Text, Emacs**: Configuration guides for LSP setup

#### Quality & CI

- 1650+ tests across all packages (@aehrc/ecl-core, @aehrc/ecl-lsp-server, browser editors, VSCode E2E, IntelliJ, Eclipse)
- GitHub Actions CI with build, lint, format check, unit tests, E2E tests, IntelliJ/Eclipse plugin builds, security scanning (Trivy + Semgrep), license compliance, and packaging
- ESLint with typescript-eslint, eslint-plugin-sonarjs, and eslint-plugin-unicorn
- Prettier formatting enforcement
- Pre-commit hooks for lint, format check, and secret scanning
- Node.js 20+ required (tested on Node 20 and 22)
