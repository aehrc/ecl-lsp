## ADDED Requirements

### Requirement: Attribute scope validation

The system SHALL validate that attributes in ECL refinements are descendants of `106237007 |Linkage concept|`. For a refinement `A : B = C`, the system SHALL evaluate `(<B-ecl>) MINUS (< 106237007)` and produce a warning diagnostic on the attribute name if the result total is greater than 0. The warning message SHALL include up to 5 of the out-of-scope concept IDs and their display terms.

#### Scenario: Valid attribute produces no warning

- **WHEN** the expression is `< 404684003 : 363698007 = < 39057004` and `363698007` is a descendant of `106237007`
- **THEN** no attribute scope warning is produced for `363698007`

#### Scenario: Invalid attribute produces warning

- **WHEN** the expression is `< 404684003 : 999999011 = < 39057004` and `999999011 MINUS < 106237007` returns results
- **THEN** a warning diagnostic is produced on `999999011` indicating it is not a valid SNOMED CT attribute

#### Scenario: ECL-valued attribute with out-of-scope concepts

- **WHEN** the attribute is an ECL expression and `(<attribute-ecl>) MINUS (< 106237007)` returns 3 concepts
- **THEN** the warning message includes the first 3 out-of-scope concept IDs with display terms

#### Scenario: Attribute in attribute group

- **WHEN** the expression is `< 404684003 : { 363698007 = < 39057004 }` with a valid attribute inside a group
- **THEN** the attribute scope check applies identically within attribute groups

### Requirement: Value constraint validation

For a refinement `A : B = C`, the system SHALL check whether the value constraint `C` is compatible with the valid range for attribute `B` on focus concept `A`. The valid range is defined by the dotted attribute expression `A.B`. The system SHALL evaluate `(<C-ecl>) AND (<A-ecl>.<B-ecl>)` and produce a warning diagnostic on the value if the result total is 0, indicating complete disjointness.

#### Scenario: Compatible value produces no warning

- **WHEN** the expression is `< 404684003 : 363698007 = < 39057004` and `(< 39057004) AND (< 404684003 . 363698007)` returns results
- **THEN** no value constraint warning is produced

#### Scenario: Disjoint value produces warning

- **WHEN** the expression is `< 404684003 : 363698007 = < 71388002` and `(< 71388002) AND (< 404684003 . 363698007)` returns 0 results
- **THEN** a warning diagnostic is produced on the value `< 71388002` indicating no matching values exist for this attribute on this focus concept

#### Scenario: Single concept value checked against range

- **WHEN** the value is a single concept `39057004` (no constraint operator) and `39057004 AND (< 404684003 . 363698007)` returns 0 results
- **THEN** a warning diagnostic is produced on the value concept

#### Scenario: Multiple attributes checked independently

- **WHEN** the expression has two attributes `A : B1 = C1, B2 = C2`
- **THEN** the system checks `C1 AND A.B1` and `C2 AND A.B2` independently, producing warnings only for disjoint pairs

### Requirement: Wildcard exclusion

The system SHALL skip all semantic checks (attribute scope and value constraint) when the value in a refinement is a wildcard (`*`). The system SHALL also skip value constraint checks when the focus concept is a wildcard.

#### Scenario: Wildcard value skips value check

- **WHEN** the expression is `< 404684003 : 363698007 = *`
- **THEN** no value constraint warning is produced for the wildcard value

#### Scenario: Wildcard value still checks attribute scope

- **WHEN** the expression is `< 404684003 : 999999011 = *`
- **THEN** the attribute scope check still runs for `999999011` (wildcard exclusion only applies to value checks)

#### Scenario: Wildcard focus skips value check

- **WHEN** the expression is `* : 363698007 = < 39057004`
- **THEN** no value constraint check is performed (dotted attribute `*. 363698007` is not meaningful)

### Requirement: Empty sub-expression detection

The system SHALL evaluate sub-expressions within compound expressions (AND, OR, MINUS) and produce a warning diagnostic if any sub-expression evaluates to 0 matches. The system SHALL also check the focus concept expression in refinements.

#### Scenario: Empty operand in AND expression

- **WHEN** the expression is `< 404684003 AND < 999999999` and `< 999999999` evaluates to 0 matches
- **THEN** a warning diagnostic is produced on `< 999999999` indicating it matches no concepts

#### Scenario: Empty operand in OR expression

- **WHEN** the expression is `< 404684003 OR < 999999999` and `< 999999999` evaluates to 0 matches
- **THEN** a warning diagnostic is produced on `< 999999999` indicating it matches no concepts

#### Scenario: Non-empty operands produce no warning

- **WHEN** both operands in `< 404684003 AND < 19829001` evaluate to non-zero results
- **THEN** no empty sub-expression warnings are produced

#### Scenario: Empty focus in refinement

- **WHEN** the expression is `< 999999999 : 363698007 = < 39057004` and `< 999999999` evaluates to 0 matches
- **THEN** a warning diagnostic is produced on the focus expression

### Requirement: Individual refinement validation

For a refined expression with multiple attributes `A : B1 = C1, B2 = C2`, the system SHALL evaluate each attribute's refinement independently as `<focus-ecl> : <attr-name-ecl> = <attr-value-ecl>`. If any individual refinement evaluates to 0 results, the system SHALL produce a warning diagnostic on that specific attribute-value pair. Wildcard values (`*`) SHALL be skipped.

#### Scenario: One impossible refinement among multiple

- **WHEN** the expression is `< 404684003 : 363698007 = < 39057004, 116676008 = < 999999999` and `< 404684003 : 116676008 = < 999999999` evaluates to 0 results but `< 404684003 : 363698007 = < 39057004` evaluates to non-zero results
- **THEN** a warning diagnostic is produced on `116676008 = < 999999999` but not on `363698007 = < 39057004`

#### Scenario: All refinements valid

- **WHEN** the expression is `< 404684003 : 363698007 = < 39057004, 116676008 = < 72651009` and both individual refinements evaluate to non-zero results
- **THEN** no individual refinement warnings are produced

#### Scenario: Wildcard value skips refinement check

- **WHEN** the expression is `< 404684003 : 363698007 = *, 116676008 = < 72651009`
- **THEN** the individual refinement check is skipped for `363698007 = *` but runs for `116676008 = < 72651009`

#### Scenario: Single attribute refinement

- **WHEN** the expression is `< 404684003 : 363698007 = < 39057004` and this evaluates to 0 results
- **THEN** a warning diagnostic is produced on the attribute-value pair

### Requirement: Parallel FHIR execution

The system SHALL execute all independent FHIR requests within semantic validation concurrently. Attribute scope checks, value constraint checks, and empty sub-expression checks for different attributes or operands SHALL run in parallel.

#### Scenario: Multiple attribute checks run in parallel

- **WHEN** the expression has 3 attributes requiring scope checks
- **THEN** all 3 `$expand` requests are sent concurrently, not sequentially

#### Scenario: Attribute and value checks for different attributes run in parallel

- **WHEN** the expression is `A : B1 = C1, B2 = C2`
- **THEN** the attribute scope check for B1, value check for C1, attribute scope check for B2, and value check for C2 all execute concurrently

### Requirement: Configurable semantic validation

The system SHALL provide a configuration setting `ecl.semanticValidation.enabled` (boolean, default `true`) that controls whether semantic validation is performed. When disabled, no FHIR requests for semantic validation SHALL be made.

#### Scenario: Enabled by default

- **WHEN** no configuration is set for `ecl.semanticValidation.enabled`
- **THEN** semantic validation runs on document change

#### Scenario: Disabled via configuration

- **WHEN** `ecl.semanticValidation.enabled` is set to `false`
- **THEN** no semantic validation FHIR requests are made and no semantic diagnostics are produced

#### Scenario: Re-enabled after being disabled

- **WHEN** `ecl.semanticValidation.enabled` changes from `false` to `true`
- **THEN** semantic validation runs on the next document change

### Requirement: Graceful degradation on FHIR errors

The system SHALL handle FHIR request failures gracefully during semantic validation. If a validation query fails, the system SHALL skip that specific check and continue with remaining checks. Semantic validation failures SHALL NOT block syntax or concept diagnostics.

#### Scenario: Failed attribute check does not block other checks

- **WHEN** the attribute scope `$expand` request fails with a network error
- **THEN** the system skips that attribute check but continues with value constraint and empty sub-expression checks

#### Scenario: Failed dotted attribute query skips value check

- **WHEN** the dotted attribute `$expand` request (`A.B`) fails (e.g., server doesn't support dotted attributes)
- **THEN** the system skips the value constraint check for that attribute and logs a warning

#### Scenario: Syntax diagnostics unaffected by semantic failures

- **WHEN** all semantic validation FHIR requests fail
- **THEN** syntax error diagnostics and concept existence warnings are still reported normally
