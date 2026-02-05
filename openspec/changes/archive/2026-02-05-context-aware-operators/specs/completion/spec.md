## ADDED Requirements

### Requirement: Filter operator completions based on cursor context

The completion provider SHALL analyze the ECL expression context before the cursor position and show only syntactically valid operators at that position.

#### Scenario: After complete constraint shows only logical operators and refinement

- **WHEN** cursor is positioned after a complete constraint (e.g., `< 404684003 |Clinical finding| `)
- **THEN** completion list includes only logical operators (AND, OR, MINUS) and refinement separator (:), not constraint operators (<, <<, >, >>)

#### Scenario: After constraint operator shows no operators

- **WHEN** cursor is positioned after a constraint operator with space (e.g., `< ` or `<< `)
- **THEN** completion list does NOT include any operators, only concept search option

#### Scenario: After logical operator shows only constraint operators

- **WHEN** cursor is positioned after a logical operator with space (e.g., `AND ` or `OR `)
- **THEN** completion list includes only constraint operators (<, <<, >, >>) to start a new constraint

#### Scenario: At start of expression shows only constraint operators

- **WHEN** cursor is at the beginning of an empty line or after opening parenthesis
- **THEN** completion list includes only constraint operators (<, <<, >, >>) and concept search

#### Scenario: Between complete expressions without operator shows logical operators

- **WHEN** cursor is positioned between two complete constraints without an operator between them (e.g., `< 404684003 █ < 19829001`)
- **THEN** completion list includes logical operators (AND, OR, MINUS) with quick fix suggestion

#### Scenario: In refinement after colon shows concept position context

- **WHEN** cursor is positioned after refinement separator `: `
- **THEN** completion list shows concept search and potentially attribute name guidance

#### Scenario: After attribute operator shows concept context

- **WHEN** cursor is positioned after attribute value separator `= `
- **THEN** completion list shows concept search and constraint operators for value constraints

#### Scenario: Ambiguous context shows all operators

- **WHEN** cursor context cannot be reliably determined by regex patterns
- **THEN** completion list includes all operators (fail open to avoid hiding valid options)

#### Scenario: Existing concept search integration preserved

- **WHEN** context-aware filtering is active
- **THEN** concept search option (🔍 Search for concept...) continues to appear at positions where concept IDs are valid

#### Scenario: Operator prioritization unchanged

- **WHEN** completion list contains both operators and concept search
- **THEN** prioritization order matches existing behavior (constraint operators first at start, concept search first after constraint operator)
