## MODIFIED Requirements

### Requirement: Graceful degradation on FHIR errors

The system SHALL handle FHIR request failures gracefully during semantic validation. If a validation query fails, the system SHALL skip that specific check and continue with remaining checks. Semantic validation failures SHALL NOT block syntax or concept diagnostics. Additionally, the system SHALL skip concept validation entirely when syntax errors are present, to avoid false positives from partially parsed expressions.

#### Scenario: Failed attribute check does not block other checks

- **WHEN** the attribute scope `$expand` request fails with a network error
- **THEN** the system skips that attribute check but continues with value constraint and empty sub-expression checks

#### Scenario: Failed dotted attribute query skips value check

- **WHEN** the dotted attribute `$expand` request (`A.B`) fails (e.g., server doesn't support dotted attributes)
- **THEN** the system skips the value constraint check for that attribute and logs a warning

#### Scenario: Syntax diagnostics unaffected by semantic failures

- **WHEN** all semantic validation FHIR requests fail
- **THEN** syntax error diagnostics and concept existence warnings are still reported normally

#### Scenario: Skip concept validation when syntax errors present

- **WHEN** an ECL expression has one or more syntax errors (`result.errors.length > 0`)
- **THEN** concept validation (inactive/unknown concept checks) is skipped entirely for that expression

#### Scenario: Concept validation runs when expression is syntactically valid

- **WHEN** an ECL expression has zero syntax errors
- **THEN** concept validation proceeds normally, checking for inactive and unknown concepts

### Requirement: Null safety in semantic validator

The semantic validator SHALL handle null or undefined AST nodes gracefully, using optional chaining on `node.focus`, `node.source`, and `node.expression` properties. Incomplete or partially parsed AST nodes SHALL NOT cause runtime errors.

#### Scenario: Null focus concept does not crash

- **WHEN** a RefinedExpressionNode has `focus: undefined` (due to parse error recovery)
- **THEN** semantic validation skips the focus-dependent checks without throwing

#### Scenario: Null attribute value does not crash

- **WHEN** an AttributeNode has `value: undefined`
- **THEN** semantic validation skips value constraint checks for that attribute without throwing

#### Scenario: Null source expression does not crash

- **WHEN** a SubExpressionNode has `expression: undefined`
- **THEN** semantic validation skips checks for that sub-expression without throwing
