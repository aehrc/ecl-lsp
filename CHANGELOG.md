# Changelog

All notable changes to the ECL Language Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- **ecl-core**: Zero-dependency core library (parser, formatter, completion, refactoring, semantic validation, terminology, knowledge)
- **ecl-lsp-server**: Thin LSP adapter mapping ecl-core types to LSP protocol
- **ecl-mcp-server**: MCP server with 6 tools (validate, evaluate, lookup, search, format, editions) and 6 ECL literacy resources
- **ecl-editor-core**: Monaco editor integration (diagnostics engine, completion/hover/formatting/code action/semantic token providers)
- **ecl-editor-react**: React component wrapping Monaco editor with ECL support
- **ecl-editor**: Web component (`<ecl-editor>`) wrapping Monaco editor with ECL support

#### IDE Clients

- **VSCode**: Full-featured extension (VSIX-ready) with bundled server
- **IntelliJ IDEA**: Plugin for IntelliJ Ultimate with bundled server, status bar widget, edition/version picker, settings UI
- **Eclipse**: Plugin via LSP4E + TM4E with bundled server, preferences page
- **Claude Code**: Plugin using PATH-based LSP server
- **Neovim, Sublime Text, Emacs**: Configuration guides for LSP setup

#### Quality & CI

- 1650+ tests across all packages (ecl-core, ecl-lsp-server, ecl-mcp-server, browser editors, VSCode E2E, IntelliJ, Eclipse)
- GitHub Actions CI with build, lint, format check, unit tests, E2E tests, IntelliJ/Eclipse plugin builds, security scanning (Trivy + Semgrep), license compliance, and packaging
- ESLint with typescript-eslint, eslint-plugin-sonarjs, and eslint-plugin-unicorn
- Prettier formatting enforcement
- Pre-commit hooks for lint, format check, and secret scanning
- Node.js 20+ required (tested on Node 20 and 22)
