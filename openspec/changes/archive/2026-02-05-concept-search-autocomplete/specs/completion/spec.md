## ADDED Requirements

### Requirement: Offer concept search in completion list

The completion provider SHALL include a "🔍 Search for concept..." option at positions where concept IDs are syntactically valid.

#### Scenario: Show search option after constraint operator

- **WHEN** user triggers completion after "< " or "<< " or "> " or ">> "
- **THEN** completion list includes "🔍 Search for concept..." option

#### Scenario: Show search option after logical operator

- **WHEN** user triggers completion after "AND " or "OR " or "MINUS "
- **THEN** completion list includes "🔍 Search for concept..." alongside concept ID would be valid

#### Scenario: Show search option in refinement value position

- **WHEN** user triggers completion after ": " or "= "
- **THEN** completion list includes "🔍 Search for concept..." option

#### Scenario: Omit search option where only operators valid

- **WHEN** cursor position only allows operators (e.g., between two complete expressions)
- **THEN** completion list does NOT include concept search option

### Requirement: Trigger concept search from completion selection

The completion provider SHALL invoke the concept search command when user selects the search option.

#### Scenario: Selection opens search dialog

- **WHEN** user selects "🔍 Search for concept..." from completion list
- **THEN** system immediately opens concept search dialog without inserting text

#### Scenario: Search dialog positioned at cursor

- **WHEN** concept search is invoked via completion
- **THEN** search dialog opens with insertion point at the triggering cursor position

### Requirement: Maintain existing completion behavior

The completion provider SHALL continue to provide existing operator and keyword suggestions alongside the new concept search option.

#### Scenario: Operators still suggested

- **WHEN** completion is triggered at valid operator position
- **THEN** completion list includes AND, OR, MINUS, <, <<, >, >> as before

#### Scenario: Existing completion order preserved

- **WHEN** completion list contains both operators and search option
- **THEN** operators maintain their existing priority order with search option added appropriately

### Requirement: Visual distinction for search option

The completion provider SHALL visually distinguish the concept search option from operator/keyword completions.

#### Scenario: Icon prefix on search option

- **WHEN** completion list is displayed
- **THEN** search option shows 🔍 icon prefix to distinguish from operators

#### Scenario: Different completion item kind

- **WHEN** rendering completion items
- **THEN** search option uses CompletionItemKind.Function or similar to differ from Keyword/Operator kinds

#### Scenario: Descriptive detail text

- **WHEN** search option is highlighted in completion list
- **THEN** detail text shows "Search SNOMED CT concepts via FHIR" or similar explanation
