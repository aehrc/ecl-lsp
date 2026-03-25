## Purpose

Provides context-aware completions within ECL refinement contexts, including cardinality snippets, attribute group openers, comparison operators, reverse flag, and wildcard values.

## Requirements

### Requirement: Offer cardinality snippets in refinement context

The completion provider SHALL offer cardinality pattern completions after `:` in refinement context and before attribute groups.

#### Scenario: Show cardinality options after refinement separator

- **WHEN** cursor is after `< 373873005 : `
- **THEN** completion list includes cardinality snippets: `[0..0]`, `[0..1]`, `[0..*]`, `[1..1]`, `[1..*]`

#### Scenario: Cardinality uses snippet tab stops

- **WHEN** user selects a cardinality completion
- **THEN** the min and max values are tab-stop fields allowing quick editing (e.g., `[${1:0}..${2:*}]`)

#### Scenario: Show cardinality before attribute group

- **WHEN** cursor is after `< 373873005 : ` and user has not yet typed an attribute or group
- **THEN** cardinality options appear alongside constraint operators and attribute group opener

### Requirement: Offer attribute group opener in refinement context

The completion provider SHALL offer `{ }` (attribute group) after `:` or after cardinality in refinement context.

#### Scenario: Show attribute group after refinement separator

- **WHEN** cursor is after `< 373873005 : `
- **THEN** completion list includes `{ }` with detail "Attribute group"

#### Scenario: Show attribute group after cardinality

- **WHEN** cursor is after `< 373873005 : [1..3] `
- **THEN** completion list includes `{ }` with detail "Attribute group"

#### Scenario: Attribute group uses snippet with cursor inside

- **WHEN** user selects `{ }` attribute group completion
- **THEN** text `{ $0 }` is inserted with cursor positioned inside the braces

### Requirement: Offer comparison operators after attribute names

The completion provider SHALL offer expression comparison operators (`=`, `!=`) after an attribute name in refinement context.

#### Scenario: Show comparison operators after attribute concept

- **WHEN** cursor is after `< 404684003 : 363698007 `
- **THEN** completion list includes `=` with detail "Equals" and `!=` with detail "Not equals"

#### Scenario: Show comparison operators after attribute name with term

- **WHEN** cursor is after `< 404684003 : 363698007 |Finding site| `
- **THEN** completion list includes `=` and `!=`

#### Scenario: Do not show comparison operators after constraint operators

- **WHEN** cursor is after `< 404684003 : < `
- **THEN** completion list does NOT include `=` or `!=` (concept expected here)

### Requirement: Offer reverse flag in attribute name position

The completion provider SHALL offer the reverse flag `R` in attribute name position within refinements.

#### Scenario: Show reverse flag after refinement separator

- **WHEN** cursor is after `< 91723000 : `
- **THEN** completion list includes `R` with detail "Reverse attribute flag"

#### Scenario: Show reverse flag after cardinality

- **WHEN** cursor is after `< 105590001 : [3..3] `
- **THEN** completion list includes `R` with detail "Reverse attribute flag"

#### Scenario: Do not show reverse flag after attribute name

- **WHEN** cursor is after `< 91723000 : 363698007 `
- **THEN** completion list does NOT include `R` (comparison operator expected here)

### Requirement: Offer wildcard in attribute value position

The completion provider SHALL offer `*` (any value) in attribute value position.

#### Scenario: Show wildcard after comparison operator

- **WHEN** cursor is after `< 404684003 : 363698007 = `
- **THEN** completion list includes `*` with detail "Any value (wildcard)"

#### Scenario: Show wildcard alongside constraint operators

- **WHEN** cursor is after `363698007 = `
- **THEN** `*` appears alongside `<`, `<<`, `>`, `>>` and concept search

### Requirement: Offer conjunction/disjunction in multi-attribute refinements

The completion provider SHALL offer `AND`, `OR`, and `,` (comma conjunction) after a complete attribute constraint within a refinement.

#### Scenario: Show refinement conjunctions after complete attribute

- **WHEN** cursor is after `< 404684003 : 363698007 = < 39057004 `
- **THEN** completion list includes `AND`, `OR`, `,` for chaining additional attributes
