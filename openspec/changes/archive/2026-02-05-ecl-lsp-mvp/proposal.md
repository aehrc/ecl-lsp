## Why

SNOMED CT Expression Constraint Language (ECL) is used to define and retrieve sets of clinical concepts, but developers—both human and AI agents—currently lack tooling support for writing ECL queries. A Language Server Protocol implementation will provide real-time syntax checking, intelligent completions, contextual documentation, and live concept information from FHIR terminology servers, significantly improving the developer experience. **Critically, this LSP must be optimized for AI agents and LLM-based coding assistants**, providing rich, structured, example-driven responses that enable AI tools to efficiently write correct ECL expressions with real SNOMED CT context.

## What Changes

- New TypeScript-based LSP server for SNOMED CT ECL
- ECL parser supporting core syntax (operators, constraints, refinements)
- Real-time diagnostics for syntax errors with actionable, AI-parseable error messages
- **Inactive concept detection** - Bold warnings when concept IDs are inactive, preventing subtle execution failures
- Intelligent completion for ECL operators and keywords with rich examples
- Hover documentation for operators and concept IDs showing usage examples, syntax patterns, and live SNOMED CT data
- **Syntax highlighting** via TextMate grammar for ECL operators, concept IDs, terms, and syntax elements
- **AI-optimized responses**: Structured, example-rich completions and hover content designed for LLM comprehension
- **FHIR terminology server integration**: Live concept lookups from configurable FHIR endpoints (default: Ontoserver CSIRO)
- Aggressive caching and graceful degradation for terminology service
- Mock terminology service for unit tests and offline development
- Test harness with example ECL files for validation
- Basic VSCode client extension with TextMate grammar for syntax highlighting

## Capabilities

### New Capabilities

- `ecl-parsing`: Parse ECL syntax into an abstract syntax tree, supporting core operators (AND, OR, descendant, ancestor, refinement)
- `diagnostics`: Provide real-time syntax error detection with AI-friendly error messages, and semantic validation for inactive concepts with bold warnings
- `completion`: Offer context-aware completion suggestions with rich, structured documentation and multiple usage examples optimized for AI agents
- `hover-documentation`: Display operator documentation and live concept information (FSN, PT) with progressive examples in structured Markdown format for AI comprehension
- `terminology-fhir`: FHIR terminology service integration with CodeSystem/$lookup for concept details, aggressive caching, configurable endpoints, and graceful degradation
- `test-infrastructure`: Test harness with unit tests, mock terminology service for offline testing, and example ECL files for validation

### Modified Capabilities

<!-- No existing capabilities are being modified -->

## Impact

- New TypeScript project structure with package.json, tsconfig, and build configuration
- Dependencies: vscode-languageserver, vscode-languageserver-textdocument, ANTLR4, TypeScript toolchain, HTTP client for FHIR
- New source directories: parser, server, diagnostics, completion, hover, terminology
- FHIR terminology server integration requiring network access (configurable endpoint)
- Test infrastructure with mock terminology service and example ECL files demonstrating valid and invalid syntax
- Documentation for running and testing the LSP server, configuring FHIR endpoints
- Production-ready FHIR integration with Ontoserver (tx.ontoserver.fhir.au) as default
