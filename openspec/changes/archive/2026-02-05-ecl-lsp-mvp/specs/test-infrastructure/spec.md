## ADDED Requirements

### Requirement: Provide unit test framework

The project SHALL include a unit test framework for testing parser, diagnostics, completion, and hover features.

#### Scenario: Test framework configured

- **WHEN** developer runs `npm test`
- **THEN** test framework (Jest or Mocha) executes all unit tests

#### Scenario: Tests organized by module

- **WHEN** viewing test directory structure
- **THEN** tests are organized to mirror source structure (e.g., `test/parser/`, `test/diagnostics/`)

#### Scenario: Test coverage reporting

- **WHEN** developer runs `npm run test:coverage`
- **THEN** coverage report is generated showing line and branch coverage

### Requirement: Include example ECL files

The project SHALL include example ECL files demonstrating valid and invalid syntax.

#### Scenario: Valid ECL examples

- **WHEN** viewing `examples/valid/` directory
- **THEN** directory contains 5+ ECL files demonstrating different operators and patterns

#### Scenario: Invalid ECL examples

- **WHEN** viewing `examples/invalid/` directory
- **THEN** directory contains ECL files with intentional syntax errors for testing diagnostics

#### Scenario: Examples include comments

- **WHEN** reading example ECL files
- **THEN** files include comments explaining what each expression demonstrates

### Requirement: Test parser with example files

Tests SHALL validate parser behavior against example ECL files.

#### Scenario: Parse all valid examples without errors

- **WHEN** parser processes files from `examples/valid/`
- **THEN** all files parse successfully with no syntax errors

#### Scenario: Detect errors in invalid examples

- **WHEN** parser processes files from `examples/invalid/`
- **THEN** parser detects expected syntax errors in each file

#### Scenario: Golden test for AST output

- **WHEN** parser processes a valid ECL example
- **THEN** generated AST matches expected structure (snapshot or golden file comparison)

### Requirement: Test LSP protocol integration

Tests SHALL validate LSP server message handling and protocol compliance.

#### Scenario: Initialize LSP server in tests

- **WHEN** test creates LSP server instance
- **THEN** server responds to initialize request with correct capabilities

#### Scenario: Test document synchronization

- **WHEN** test sends didOpen and didChange notifications
- **THEN** server updates internal document state correctly

#### Scenario: Test diagnostic publishing

- **WHEN** test sends document with syntax errors
- **THEN** server publishes diagnostics with expected error messages

### Requirement: Provide test utilities

The project SHALL include helper utilities for common test scenarios.

#### Scenario: Helper for creating test documents

- **WHEN** test needs to create an in-memory ECL document
- **THEN** test utility provides `createTestDocument(content: string)` helper

#### Scenario: Helper for asserting diagnostics

- **WHEN** test validates diagnostic output
- **THEN** test utility provides `expectDiagnostics(doc, expected)` assertion helper

#### Scenario: Helper for triggering completion

- **WHEN** test validates completion behavior
- **THEN** test utility provides `getCompletionsAt(doc, position)` helper

### Requirement: Document how to run tests

The project SHALL include documentation for running and writing tests.

#### Scenario: README includes test commands

- **WHEN** developer reads README
- **THEN** README documents how to run tests, coverage, and watch mode

#### Scenario: Test file templates provided

- **WHEN** developer needs to write a new test
- **THEN** project includes example test file showing recommended structure and patterns
