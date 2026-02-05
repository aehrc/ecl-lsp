# Changelog

All notable changes to the ECL Language Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-21

Initial release with full ECL 2.2 support.

### Added

- **Parser**: ANTLR4-based parser using official IHTSDO ECL 2.2 grammar with complete AST visitor
- **Syntax highlighting**: TextMate grammar for ECL syntax coloring in VSCode
- **Diagnostics**: Real-time syntax errors with user-friendly messages, inactive/unknown concept warnings, semantic validation
- **Completion**: Context-aware operator suggestions, extended operators (`<!`, `<<!`, `>!`, `>>!`), filter block keywords, refinement items, inline concept search, 18 ECL snippets
- **Hover**: Operator documentation for all ECL operators; concept info (FSN, PT, active status) via FHIR
- **Code Lens**: "Evaluate" lens above each expression with `ValueSet/$expand`, result count display
- **Formatting**: Document and range formatting with 9 configuration options (indent, line breaking, term alignment, comment wrapping, break-on-operator modes)
- **SNOMED CT edition/version**: Status bar picker for switching editions and pinning versions
- **Quick fixes**: One-click fixes for duplicate operators, missing operators
- **Expression grouping**: Multiple expressions per file via `/* ECL-END */` delimiters
- **FHIR integration**: `CodeSystem/$lookup` for concept info, `ValueSet/$expand` for search and evaluation, 10,000-concept LRU cache, graceful offline degradation
- **Error analysis**: Tokenizer with 7 heuristic detectors, ANTLR error refinement to user-friendly messages
- **Semantic validation**: Attribute scope, value constraints, empty sub-expression detection
- **Test suite**: 1240 tests across 28 files covering all functionality
