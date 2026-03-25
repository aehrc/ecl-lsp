## 1. Project Setup

- [x] 1.1 Initialize monorepo/workspace structure with server and client packages
- [x] 1.2 Initialize server package with package.json
- [x] 1.3 Add TypeScript dependencies and tsconfig.json for server
- [x] 1.4 Add vscode-languageserver and vscode-languageserver-textdocument dependencies
- [x] 1.5 Add ANTLR4 dependencies (antlr4ts, antlr4ts-cli) for parser generation
- [x] 1.5a Add HTTP client dependency (node-fetch or axios) for FHIR requests
- [x] 1.6 Create server directory structure (server/src/parser, server/src/diagnostics, server/src/completion, server/src/hover, server/src/terminology, server/grammar)
- [x] 1.7 Initialize client package with package.json
- [x] 1.8 Add vscode-languageclient dependency to client
- [x] 1.9 Configure build scripts in root and packages (build, watch, clean, antlr4ts for grammar generation)
- [x] 1.10 Add .gitignore for node_modules, dist, coverage, \*.vsix, generated ANTLR files

## 2. Parser Implementation

- [x] 2.1 Add ANTLR4 dependencies (antlr4ts, antlr4ts-cli) to project
- [x] 2.2 Clone or download ECL grammar from https://github.com/IHTSDO/snomed-expression-constraint-language
- [x] 2.3 Locate ECL 2.2 grammar file (latest version) from repo
- [x] 2.4 Copy official ECL 2.2 .g4 grammar file to server/grammar/ directory
- [x] 2.5 Configure ANTLR4 build step to generate TypeScript parser and lexer from official grammar
- [x] 2.6 Test grammar with valid ECL examples from official repo to verify correctness
- [x] 2.7 Define AST node types (ExpressionNode, OperatorNode, ConceptNode, RefinementNode)
- [x] 2.8 Implement ANTLR visitor to transform parse tree to AST
- [x] 2.9 Create custom error listener for LSP-friendly, AI-optimized diagnostics
- [x] 2.10 Add utility to extract tokens with position information from ANTLR parse tree
- [x] 2.11 Test parser error recovery with malformed ECL expressions
- [x] 2.12 Verify parser handles all ECL 2.2 operators using test cases from official repo

## 3. LSP Server Core

- [x] 3.1 Create LSP server entry point (server/src/server.ts)
- [x] 3.2 Implement server initialization handling
- [x] 3.3 Configure server capabilities (diagnostics, completion, hover)
- [x] 3.4 Implement document manager for tracking open ECL documents
- [x] 3.5 Add didOpen, didChange, didClose notification handlers
- [x] 3.6 Set up connection between server and client (stdio transport)
- [x] 3.7 Add server lifecycle management (initialized, shutdown, exit)

## 4. VSCode Client Extension

- [x] 4.1 Create VSCode extension manifest (client/package.json) with activation events for .ecl files
- [x] 4.2 Define .ecl language ID and file associations in manifest
- [x] 4.3 Create TextMate grammar (client/syntaxes/ecl.tmLanguage.json)
- [x] 4.4 Define grammar patterns for operators (AND, OR, MINUS, <, <<, >, >>, :)
- [x] 4.5 Define grammar patterns for concept IDs (6-18 digit numbers)
- [x] 4.6 Define grammar patterns for terms (pipe-delimited text)
- [x] 4.7 Define grammar patterns for parentheses, wildcards, and other syntax
- [x] 4.8 Register grammar in extension manifest
- [x] 4.9 Create extension entry point (client/src/extension.ts)
- [x] 4.10 Implement extension activation function
- [x] 4.11 Configure LanguageClient to spawn server process
- [x] 4.12 Set up client-server connection using stdio transport
- [x] 4.13 Add extension deactivation cleanup
- [x] 4.14 Create minimal tsconfig for client
- [x] 4.15 Test syntax highlighting with example ECL files
- [x] 4.16 Test extension launches server and connects successfully

## 5. Diagnostics

- [x] 5.1 Create diagnostic provider module
- [x] 5.2 Implement function to convert parser errors to LSP diagnostics
- [x] 5.3 Map parser error types to diagnostic messages
- [x] 5.4 Add severity levels (Error for syntax errors, Warning for inactive concepts)
- [x] 5.5 Implement real-time diagnostic updates on document change
- [x] 5.6 Add diagnostic clearing when errors are fixed
- [x] 5.7 Implement concept ID extraction from AST
- [x] 5.8 Implement inactive concept detection using terminology service
- [x] 5.9 Generate bold warning diagnostics for inactive concepts (with ⚠️ emoji)
- [x] 5.10 Skip inactive checks when FHIR unavailable (graceful degradation)
- [x] 5.11 Use cached concept status from terminology service
- [x] 5.12 Test diagnostics with syntax errors and inactive concepts

## 6. Completion

- [x] 6.1 Create completion provider module
- [x] 6.2 Define completion items for all ECL operators (<, <<, >, >>, AND, OR, MINUS, :)
- [x] 6.3 Add documentation text for each operator completion item
- [x] 6.4 Add usage examples to completion item details
- [x] 6.5 Implement context analysis to determine valid completions at cursor position
- [x] 6.6 Filter completions based on partial input
- [x] 6.7 Configure completion trigger characters (whitespace, opening parenthesis)
- [x] 6.8 Test completion in various contexts (after operator, after expression, etc.)

## 7. Hover

- [x] 7.1 Create hover provider module
- [x] 7.2 Implement token detection at hover position
- [x] 7.3 Define hover content for descendant operators (<, <<)
- [x] 7.4 Define hover content for ancestor operators (>, >>)
- [x] 7.5 Define hover content for binary operators (AND, OR, MINUS)
- [x] 7.6 Define hover content for refinement separator (:)
- [x] 7.7 Format hover content as Markdown with code examples
- [x] 7.8 Implement concept ID detection (recognize numeric SCTID pattern)
- [x] 7.9 Call terminology service when hovering over concept IDs
- [x] 7.10 Format concept info as Markdown (FSN, PT) with structured layout
- [x] 7.11 Handle null responses from terminology service gracefully (no hover)
- [x] 7.12 Test hover on all operator types and concept IDs

## 8. FHIR Terminology Service

- [x] 8.1 Define ITerminologyService interface with getConceptInfo method
- [x] 8.2 Define ConceptInfo type (id, fsn, pt, active)
- [x] 8.3 Implement FhirTerminologyService with CodeSystem/$lookup integration
- [x] 8.4 Configure default FHIR endpoint (https://tx.ontoserver.csiro.au/fhir)
- [x] 8.5 Implement HTTP client with 2-second timeout for FHIR requests
- [x] 8.5a Add User-Agent header to all FHIR requests (e.g., "ecl-lsp/1.0.0")
- [x] 8.6 Implement FHIR Parameters response parsing (extract FSN, PT, and active status)
- [x] 8.7 Implement in-memory caching with Map<string, ConceptInfo>
- [x] 8.8 Implement LRU cache eviction (max 10,000 concepts)
- [x] 8.9 Implement graceful error handling (return null on failure)
- [x] 8.10 Implement MockTerminologyService with hardcoded common concepts for unit tests
- [x] 8.11 Add mock data for 10+ common SNOMED CT concepts
- [x] 8.12 Add dependency injection for terminology service in server initialization
- [x] 8.13 Add configuration support for custom FHIR endpoint URL

## 9. Testing

- [x] 9.1 Add Jest test framework and configuration
- [x] 9.2 Configure code coverage reporting with >80% target for parser and core features
- [x] 9.3 Create test utilities (createTestDocument, expectDiagnostics, getCompletionsAt)
- [x] 9.4 Download official ECL examples from https://github.com/IHTSDO/snomed-expression-constraint-language/tree/main/examples
- [x] 9.5 Create examples/valid/ directory with valid ECL 2.2 examples from official sources
- [x] 9.6 Create examples/invalid/ directory with invalid ECL examples for testing diagnostics
- [x] 9.7 Write parser unit tests for valid expressions using official examples
- [x] 9.8 Write parser unit tests for error cases
- [x] 9.9 Write diagnostics tests verifying syntax error detection
- [x] 9.10 Write diagnostics tests verifying inactive concept warnings
- [x] 9.11 Write completion tests for different contexts
- [x] 9.12 Write hover tests for all operator types and concept IDs
- [x] 9.13 Write LSP integration tests (initialize, didOpen, didChange)
- [x] 9.14 Write FHIR integration tests with mock server
- [x] 9.15 Verify >80% code coverage for parser and core features
- [x] 9.16 Add npm scripts for test, test:watch, test:coverage

## 10. Documentation

- [x] 10.1 Create README.md with project overview
- [x] 10.2 Document installation and setup instructions for development
- [x] 10.3 Document how to build and run the LSP server and client
- [x] 10.4 Document how to run tests
- [x] 10.5 Document LSP server capabilities and limitations
- [x] 10.6 Document FHIR terminology service integration and configuration (endpoint URL, caching, offline mode)
- [x] 10.7 Add example ECL 2.2 expressions to README from official specification
- [x] 10.8 Document ECL 2.2 syntax support coverage and link to official resources
- [x] 10.9 Reference official ECL specification (https://docs.snomed.org) and grammar repo (https://github.com/IHTSDO/snomed-expression-constraint-language)
- [x] 10.10 Document future plans for IntelliJ integration and FHIR authentication
