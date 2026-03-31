# Changelog

All notable changes to the ECL Language Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Toggle display terms** (Shift+Alt+T): Smart toggle keyboard shortcut for the web component and React editor — adds display terms via FHIR lookup when concept IDs are bare, strips them when all are present
- **`registerToggleTermsAction()`**: New export from `@aehrc/ecl-editor-core` for registering the toggle action on any Monaco editor instance
- **`getTerminologyService()`**: New method on `EclEditorDisposable` to access the current terminology service

### Fixed

- **Shared language registration**: Web component now shares a single `registerEclLanguage` call across multiple `<ecl-editor>` instances, preventing duplicate hover tooltips and completions
- **Line highlight disabled**: `renderLineHighlight: 'none'` for cleaner embedded appearance

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
