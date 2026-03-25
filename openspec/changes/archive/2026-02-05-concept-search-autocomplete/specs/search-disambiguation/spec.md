## ADDED Requirements

### Requirement: Detect ambiguous cursor positions

The system SHALL identify cursor positions where both constraint operators AND bare concept IDs are syntactically valid.

#### Scenario: Start of expression allows operator or bare concept

- **WHEN** cursor is at the beginning of a line or after opening parenthesis "("
- **THEN** system recognizes both constraint operators (<, <<, >, >>) and bare concept IDs are valid

#### Scenario: After refinement separator allows operator or bare concept

- **WHEN** cursor is positioned after ": " (refinement separator)
- **THEN** system recognizes both constraint operators (<, <<) and bare concept IDs are valid

#### Scenario: After attribute operator allows operator or bare concept

- **WHEN** cursor is positioned after "= " (attribute value separator)
- **THEN** system recognizes both constraint operators and bare concept IDs are valid

#### Scenario: Non-ambiguous position after logical operator

- **WHEN** cursor is positioned after "AND " or "OR " or "MINUS "
- **THEN** system recognizes operators (<, <<, >, >>) and concepts are valid, but this is NOT ambiguous since logical operators cannot be followed by bare concepts

### Requirement: Provide disambiguation UI in completion list

The system SHALL include a "🔍 Search for concept..." option in the completion list at positions where concept IDs are valid.

#### Scenario: Show search option alongside operators at ambiguous positions

- **WHEN** completion is triggered at start of expression or after "("
- **THEN** completion list shows both constraint operators (<, <<, >, >>) AND "🔍 Search for concept..."

#### Scenario: Show search option at concept-only positions

- **WHEN** completion is triggered after "< " or "AND " where constraint operator already present
- **THEN** completion list shows "🔍 Search for concept..." as primary suggestion

#### Scenario: Search option triggers concept search command

- **WHEN** user selects "🔍 Search for concept..." from completion list
- **THEN** system invokes the concept search dialog

### Requirement: Prioritize completion items based on context

The system SHALL order completion suggestions based on syntactic context and user intent probability.

#### Scenario: Prioritize constraint operators at ambiguous start position

- **WHEN** cursor is at start of line or after "("
- **THEN** completion list shows constraint operators (<, <<, >, >>) before "🔍 Search for concept..." since operators are more common

#### Scenario: Prioritize concept search after constraint operator

- **WHEN** cursor follows "< " or "<< " or "> " or ">> "
- **THEN** completion list shows "🔍 Search for concept..." as first or only option

#### Scenario: Prioritize concept search after logical operator

- **WHEN** cursor follows "AND " or "OR " or "MINUS "
- **THEN** completion list shows constraint operators first, then concept search, since starting new constraint with operator is more common

### Requirement: Keyboard navigation for disambiguation

The system SHALL support keyboard-only workflow for selecting between operators and concept search.

#### Scenario: Arrow keys navigate completion list

- **WHEN** completion list is open
- **THEN** user can navigate with Up/Down arrow keys between operators and search option

#### Scenario: Enter key selects highlighted item

- **WHEN** user presses Enter with item highlighted
- **THEN** system inserts selected operator or opens concept search dialog

#### Scenario: Escape key dismisses completion

- **WHEN** user presses Escape while completion list is open
- **THEN** completion list closes without inserting anything
