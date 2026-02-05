## ADDED Requirements

### Requirement: Add display terms

The system SHALL provide a code action "Add display terms" that inserts preferred terms after each bare concept ID in the selected expression. The system SHALL look up each concept via the FHIR terminology service and insert the preferred term in pipe-delimited format (`|term|`). Concept IDs that already have a display term SHALL be skipped. If the terminology service is unavailable, the action SHALL leave the expression unchanged.

#### Scenario: Add terms to expression with bare concept IDs

- **WHEN** cursor is on an expression `< 404684003 : 363698007 = < 39057004` and user selects "Add display terms"
- **THEN** the expression is replaced with `< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|`

#### Scenario: Skip concept IDs that already have terms

- **WHEN** cursor is on `< 404684003 |Clinical finding| AND < 19829001` and user selects "Add display terms"
- **THEN** only `19829001` gets a term added; `404684003` is unchanged

#### Scenario: Terminology service unavailable

- **WHEN** the FHIR server is unreachable and user selects "Add display terms"
- **THEN** the expression is left unchanged

### Requirement: Strip display terms

The system SHALL provide a code action "Strip display terms" that removes all pipe-delimited display terms from the selected expression. The resulting expression SHALL contain only concept IDs with no `|term|` annotations.

#### Scenario: Strip all terms

- **WHEN** cursor is on `< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung|` and user selects "Strip display terms"
- **THEN** the expression is replaced with `< 404684003 AND < 19829001`

#### Scenario: No terms to strip

- **WHEN** cursor is on `< 404684003 AND < 19829001` and user selects "Strip display terms"
- **THEN** the action SHALL NOT be offered (no lightbulb)

### Requirement: Simplify redundant constraints

The system SHALL provide a code action "Simplify expression" when a compound expression contains logically redundant operands. The system SHALL detect pairs of operands where the same concept ID appears with constraint operators in a subsumption relationship within an AND or OR compound.

For AND compounds: the more restrictive operand subsumes the less restrictive one:

- `<< X AND < X` → `< X` (descendants are a subset of descendantsOrSelf)
- `<< X AND X` → `X` (self is a subset of descendantsOrSelf)
- `< X AND X` → `X` (self is not a descendant, intersection is just self)

For OR compounds: the less restrictive operand covers the more restrictive one:

- `<< X OR < X` → `<< X` (descendantsOrSelf includes descendants)
- `<< X OR X` → `<< X` (descendantsOrSelf includes self)

#### Scenario: Simplify AND with redundant descendantOrSelf

- **WHEN** cursor is on `<< 404684003 AND < 404684003` and user selects "Simplify expression"
- **THEN** the expression is replaced with `< 404684003`

#### Scenario: Simplify OR with redundant descendant

- **WHEN** cursor is on `<< 404684003 OR < 404684003` and user selects "Simplify expression"
- **THEN** the expression is replaced with `<< 404684003`

#### Scenario: No redundancy detected

- **WHEN** cursor is on `< 404684003 AND < 19829001` (different concepts)
- **THEN** the "Simplify expression" action SHALL NOT be offered

### Requirement: Factor out common focus concept

The system SHALL provide a code action "Factor out common focus" when a compound OR expression contains multiple refined expressions that share the same focus concept (identical concept ID and constraint operator). The action SHALL merge the refinements into a single refined expression with the shared focus and combined attributes joined by OR.

#### Scenario: Factor two refined expressions with same focus

- **WHEN** cursor is on `(< 404684003 : 363698007 = < 39057004) OR (< 404684003 : 116676008 = < 72651009)` and user selects "Factor out common focus"
- **THEN** the expression is replaced with `< 404684003 : 363698007 = < 39057004 OR 116676008 = < 72651009`

#### Scenario: Different focus concepts

- **WHEN** cursor is on `(< 404684003 : 363698007 = < 39057004) OR (< 19829001 : 116676008 = < 72651009)`
- **THEN** the "Factor out common focus" action SHALL NOT be offered

### Requirement: Cycle constraint operator

The system SHALL provide a code action on any sub-expression with a constraint operator that cycles to the next operator in the sequence: `<` → `<<` → `<!` → `<<!` → `>` → `>>` → `>!` → `>>!` → _(none/self)_ → `<`. The action title SHALL indicate the target operator, e.g., "Change to descendantOrSelfOf (`<<`)".

#### Scenario: Cycle from descendant to descendantOrSelf

- **WHEN** cursor is on `< 404684003` and user selects "Change to descendantOrSelfOf (`<<`)"
- **THEN** the expression is replaced with `<< 404684003`

#### Scenario: Cycle from no operator to descendant

- **WHEN** cursor is on `404684003` (self constraint, no operator) and user selects "Change to descendantOf (`<`)"
- **THEN** the expression is replaced with `< 404684003`

#### Scenario: Cycle from ancestorOrSelfExclusive to self

- **WHEN** cursor is on `>>! 404684003` and user selects "Remove constraint operator"
- **THEN** the expression is replaced with `404684003`

### Requirement: Add explicit parentheses

The system SHALL provide a code action "Add explicit parentheses" when a compound expression contains mixed AND and OR operators without parentheses. The action SHALL wrap operands to make the operator precedence explicit according to ECL evaluation rules (AND binds tighter than OR).

#### Scenario: Mixed AND/OR without parentheses

- **WHEN** cursor is on `< 404684003 AND < 19829001 OR < 301867009` and user selects "Add explicit parentheses"
- **THEN** the expression is replaced with `(< 404684003 AND < 19829001) OR < 301867009`

#### Scenario: Already parenthesized or single operator

- **WHEN** cursor is on `< 404684003 AND < 19829001` (single operator type)
- **THEN** the "Add explicit parentheses" action SHALL NOT be offered

### Requirement: Add history supplement

The system SHALL provide a code action "Add history supplement" on any sub-expression that does not already have a history supplement. The action SHALL append `{{ + HISTORY-MIN }}` after the sub-expression.

#### Scenario: Add history supplement to simple expression

- **WHEN** cursor is on `< 404684003` and user selects "Add history supplement"
- **THEN** the expression is replaced with `< 404684003 {{ + HISTORY-MIN }}`

#### Scenario: Expression already has history supplement

- **WHEN** cursor is on `< 404684003 {{ + HISTORY-MIN }}`
- **THEN** the "Add history supplement" action SHALL NOT be offered

### Requirement: Add description filter

The system SHALL provide a code action "Add description filter" on any sub-expression that does not already have a description filter. The action SHALL append `{{ D term = "" }}` after the sub-expression and position the cursor between the quotes.

#### Scenario: Add description filter to simple expression

- **WHEN** cursor is on `< 404684003` and user selects "Add description filter"
- **THEN** the expression is replaced with `< 404684003 {{ D term = "" }}`

#### Scenario: Expression already has description filter

- **WHEN** cursor is on `< 404684003 {{ D term = "heart" }}`
- **THEN** the "Add description filter" action SHALL NOT be offered
