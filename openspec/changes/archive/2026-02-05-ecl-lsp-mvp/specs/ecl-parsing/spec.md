## ADDED Requirements

### Requirement: Parse ECL expression syntax

The parser SHALL parse valid ECL expression syntax including operators, constraints, and refinements into an internal representation (AST).

#### Scenario: Parse simple descendant constraint

- **WHEN** input is `< 404684003 |Clinical finding|`
- **THEN** parser produces AST with descendant operator node and concept reference

#### Scenario: Parse conjunction (AND)

- **WHEN** input is `< 19829001 |Disorder of lung| AND < 301867009 |Edema of trunk|`
- **THEN** parser produces AST with AND operator joining two descendant constraints

#### Scenario: Parse disjunction (OR)

- **WHEN** input is `< 19829001 |Disorder of lung| OR < 301867009 |Edema of trunk|`
- **THEN** parser produces AST with OR operator joining two descendant constraints

#### Scenario: Parse refinement

- **WHEN** input is `< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|`
- **THEN** parser produces AST with refinement containing attribute and value constraint

#### Scenario: Parse nested expressions with parentheses

- **WHEN** input is `< 19829001 |Disorder of lung| AND (< 301867009 |Edema of trunk| OR < 195967001 |Asthma|)`
- **THEN** parser produces AST respecting operator precedence and grouping

### Requirement: Tokenize ECL input

The parser SHALL tokenize ECL input into a stream of tokens with position information (line, column, offset).

#### Scenario: Tokenize operators

- **WHEN** input contains `<`, `<<`, `>`, `>>`, `AND`, `OR`
- **THEN** lexer produces tokens with correct type and position for each operator

#### Scenario: Tokenize concept references

- **WHEN** input contains `404684003 |Clinical finding|`
- **THEN** lexer produces CONCEPT_ID token and TERM token with position ranges

#### Scenario: Tokenize whitespace and preserve positions

- **WHEN** input contains whitespace and newlines
- **THEN** token positions accurately reflect original source locations for error reporting

### Requirement: Handle invalid syntax gracefully

The parser SHALL detect syntax errors and continue parsing to provide multiple diagnostics.

#### Scenario: Detect unclosed parenthesis

- **WHEN** input is `< 19829001 |Disorder of lung| AND (< 301867009 |Edema of trunk|`
- **THEN** parser detects unclosed parenthesis and reports error with position

#### Scenario: Detect invalid operator sequence

- **WHEN** input is `< 19829001 AND AND < 301867009`
- **THEN** parser detects consecutive operators and reports error

#### Scenario: Continue parsing after error

- **WHEN** input contains multiple syntax errors
- **THEN** parser attempts error recovery and reports all errors found, not just the first

### Requirement: Support ECL 2.0 core syntax

The parser SHALL support the core ECL 2.0 specification syntax elements.

#### Scenario: Support descendant operators

- **WHEN** input uses `<` (descendant) or `<<` (descendant-or-self)
- **THEN** parser recognizes and correctly represents these operators

#### Scenario: Support ancestor operators

- **WHEN** input uses `>` (ancestor) or `>>` (ancestor-or-self)
- **THEN** parser recognizes and correctly represents these operators

#### Scenario: Support wildcard

- **WHEN** input uses `*` as a wildcard
- **THEN** parser recognizes wildcard in valid contexts

#### Scenario: Support attribute refinements

- **WHEN** input includes `: attribute = value` refinement syntax
- **THEN** parser correctly parses attribute name and value constraint
