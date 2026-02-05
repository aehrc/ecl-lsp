## MODIFIED Requirements

### Requirement: Filter operator completions based on cursor context

The completion provider SHALL analyze the ECL expression context before the cursor position and show only syntactically valid operators at that position.

#### Scenario: After complete constraint shows logical operators, refinement, dot, and filters

- **WHEN** cursor is positioned after a complete constraint (e.g., `< 404684003 |Clinical finding| `)
- **THEN** completion list includes logical operators (AND, OR, MINUS), refinement separator (:), dot notation (.), and filter openers ({{ D, {{ C, {{ +)

#### Scenario: After constraint operator shows no operators

- **WHEN** cursor is positioned after a constraint operator with space (e.g., `< ` or `<< `)
- **THEN** completion list does NOT include any operators, only concept search option

#### Scenario: After logical operator shows constraint operators plus member-of and child/parent

- **WHEN** cursor is positioned after a logical operator with space (e.g., `AND ` or `OR `)
- **THEN** completion list includes constraint operators (<, <<, >, >>), child/parent operators (<!, <<!, >!, >>!), member-of (^), and top/bottom (!!>, !!<)

#### Scenario: At start of expression shows all constraint operators

- **WHEN** cursor is at the beginning of an empty line or after opening parenthesis
- **THEN** completion list includes constraint operators (<, <<, >, >>), child/parent operators (<!, <<!, >!, >>!), member-of (^), and top/bottom (!!>, !!<)

#### Scenario: After refinement separator shows refinement-specific completions

- **WHEN** cursor is positioned after refinement separator `: `
- **THEN** completion list includes constraint operators, member-of (^), cardinality snippets ([N..M]), attribute group opener ({ }), reverse flag (R), and concept search

#### Scenario: After attribute comparison operator shows value completions

- **WHEN** cursor is positioned after attribute value separator `= `
- **THEN** completion list shows constraint operators, member-of (^), wildcard (\*), and concept search

#### Scenario: Between complete expressions without operator shows logical operators

- **WHEN** cursor is positioned between two complete constraints without an operator between them (e.g., `< 404684003 █ < 19829001`)
- **THEN** completion list includes logical operators (AND, OR, MINUS) with quick fix suggestion

#### Scenario: Ambiguous context shows all operators

- **WHEN** cursor context cannot be reliably determined by regex patterns
- **THEN** completion list includes all operators (fail open to avoid hiding valid options)

#### Scenario: Existing concept search integration preserved

- **WHEN** context-aware filtering is active
- **THEN** concept search option continues to appear at positions where concept IDs are valid
