## ADDED Requirements

### Requirement: Offer member-of operator at constraint positions

The completion provider SHALL offer `^` (member-of) at positions where constraint operators are valid.

#### Scenario: Show member-of at expression start

- **WHEN** cursor is at the start of an expression
- **THEN** completion list includes `^` with detail "Member of (reference set)"

#### Scenario: Show member-of after logical operator

- **WHEN** cursor is after `< 404684003 AND `
- **THEN** completion list includes `^` alongside constraint operators

#### Scenario: Show member-of after refinement separator

- **WHEN** cursor is after `< 404684003 : `
- **THEN** completion list includes `^` for member-of attribute names

#### Scenario: Show member-of after attribute value operator

- **WHEN** cursor is after `363698007 = `
- **THEN** completion list includes `^` for member-of value constraints

### Requirement: Offer child and parent operators at constraint positions

The completion provider SHALL offer child-of (`<!`), child-or-self-of (`<<!`), parent-of (`>!`), and parent-or-self-of (`>>!`) alongside existing constraint operators.

#### Scenario: Show child/parent operators at expression start

- **WHEN** cursor is at the start of an expression
- **THEN** completion list includes `<!`, `<<!`, `>!`, `>>!` alongside `<`, `<<`, `>`, `>>`

#### Scenario: Show child/parent operators after logical operator

- **WHEN** cursor is after `AND `
- **THEN** completion list includes `<!`, `<<!`, `>!`, `>>!`

#### Scenario: Child-of operator documentation

- **WHEN** completion list includes `<!`
- **THEN** detail shows "Child of" and documentation explains it matches only direct children

#### Scenario: Parent-of operator documentation

- **WHEN** completion list includes `>!`
- **THEN** detail shows "Parent of" and documentation explains it matches only direct parents

### Requirement: Offer dot notation after complete expressions

The completion provider SHALL offer `.` (dot) for attribute traversal after a complete subexpression constraint.

#### Scenario: Show dot after complete concept constraint

- **WHEN** cursor is after `< 373873005 |Pharmaceutical / biologic product| `
- **THEN** completion list includes `.` with detail "Dot notation (attribute traversal)"

#### Scenario: Show dot after concept ID without term

- **WHEN** cursor is after `< 373873005 `
- **THEN** completion list includes `.` alongside logical operators and `:`

#### Scenario: Do not show dot at expression start

- **WHEN** cursor is at the start of an expression
- **THEN** completion list does NOT include `.`

#### Scenario: Do not show dot after logical operator

- **WHEN** cursor is after `AND `
- **THEN** completion list does NOT include `.`

### Requirement: Offer top and bottom operators at constraint positions

The completion provider SHALL offer `!!>` (top/root concept) and `!!<` (bottom/leaf concepts) at positions where constraint operators are valid.

#### Scenario: Show top/bottom operators at expression start

- **WHEN** cursor is at the start of an expression
- **THEN** completion list includes `!!>` with detail "Top (root concept)" and `!!<` with detail "Bottom (leaf concepts)"

#### Scenario: Show top/bottom after logical operator

- **WHEN** cursor is after `OR `
- **THEN** completion list includes `!!>` and `!!<`
