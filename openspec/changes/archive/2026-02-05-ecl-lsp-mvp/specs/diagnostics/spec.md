## ADDED Requirements

### Requirement: Report syntax errors in real-time

The LSP server SHALL provide syntax error diagnostics as the user types in the editor.

#### Scenario: Report unclosed parenthesis

- **WHEN** user types `< 19829001 AND (< 301867009`
- **THEN** diagnostic shows "Unclosed parenthesis" with position at opening `(`

#### Scenario: Report unexpected token

- **WHEN** user types `< 19829001 AND AND < 301867009`
- **THEN** diagnostic shows "Unexpected token 'AND'" at second AND position

#### Scenario: Report missing operand

- **WHEN** user types `< 19829001 AND`
- **THEN** diagnostic shows "Expected operand after AND operator"

#### Scenario: Clear diagnostics when errors are fixed

- **WHEN** user corrects a syntax error
- **THEN** diagnostic is removed from the editor

### Requirement: Provide actionable, AI-friendly error messages

Diagnostics SHALL include clear error messages with precise position information and concrete fix suggestions that AI agents can understand and apply.

#### Scenario: Error message includes token position

- **WHEN** syntax error is detected
- **THEN** diagnostic includes line number, column, and character range

#### Scenario: Error message describes expected input with example

- **WHEN** parser encounters unexpected token
- **THEN** diagnostic message includes both what was expected AND a concrete example (e.g., "Expected operand after AND operator. Example: < 19829001 AND < 301867009")

#### Scenario: Error messages suggest specific fixes

- **WHEN** parser detects unclosed parenthesis
- **THEN** diagnostic message suggests where to add closing parenthesis and shows corrected example

#### Scenario: Multiple errors reported independently

- **WHEN** document contains multiple syntax errors
- **THEN** each error is reported with its own diagnostic entry, each with actionable fix suggestion

#### Scenario: Error messages are structured for machine parsing

- **WHEN** diagnostic message is generated
- **THEN** message follows consistent format: [Problem description]. [Expected input]. [Example fix]

### Requirement: Categorize diagnostic severity

Diagnostics SHALL be categorized by severity level (error, warning, information).

#### Scenario: Syntax errors marked as Error severity

- **WHEN** parser detects syntax error (unclosed parenthesis, invalid operator)
- **THEN** diagnostic has severity level ERROR

#### Scenario: Inactive concepts marked as Warning severity

- **WHEN** terminology service indicates concept is inactive
- **THEN** diagnostic has severity level WARNING with bold, prominent message

### Requirement: Detect and warn about inactive concepts

Diagnostics SHALL check concept IDs against FHIR terminology service and generate bold warnings for inactive concepts.

#### Scenario: Warn when concept is inactive

- **WHEN** user types concept ID `123456001` and FHIR indicates concept is inactive
- **THEN** diagnostic shows "⚠️ Concept 123456001 is INACTIVE. This may cause unexpected results or empty result sets on some terminology servers."

#### Scenario: No warning when concept is active

- **WHEN** user types concept ID `404684003` and FHIR indicates concept is active
- **THEN** no inactive concept diagnostic is generated

#### Scenario: Check all concept IDs in expression

- **WHEN** ECL contains multiple concept IDs `< 123456001 AND < 789012003`
- **THEN** inactive check is performed for each concept ID independently

#### Scenario: Skip inactive check when FHIR unavailable

- **WHEN** FHIR terminology server is unavailable or times out
- **THEN** no inactive concept diagnostics are generated (graceful degradation)

#### Scenario: Use cached concept status

- **WHEN** concept ID was previously checked and cached
- **THEN** inactive status is determined from cache without FHIR request

#### Scenario: Bold warning with emoji for visibility

- **WHEN** inactive concept diagnostic is displayed
- **THEN** message includes warning emoji (⚠️) and emphasizes "INACTIVE" in caps for prominence

### Requirement: Syntax validation works independently

MVP diagnostics SHALL provide syntax error detection regardless of terminology service availability.

#### Scenario: Syntax errors detected without FHIR

- **WHEN** FHIR terminology server is unavailable
- **THEN** syntax errors are still detected and reported normally

#### Scenario: No advanced semantic validation

- **WHEN** user types syntactically correct ECL with potentially invalid refinements
- **THEN** diagnostics do not validate attribute appropriateness (advanced semantic validation out of scope)
