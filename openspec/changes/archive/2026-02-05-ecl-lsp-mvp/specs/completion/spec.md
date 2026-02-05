## ADDED Requirements

### Requirement: Provide operator completion suggestions

The LSP server SHALL offer completion suggestions for ECL operators based on cursor context.

#### Scenario: Suggest binary operators between expressions

- **WHEN** user types `< 19829001 |Disorder|` and triggers completion after whitespace
- **THEN** completion list includes `AND`, `OR`, `MINUS`

#### Scenario: Suggest descendant/ancestor operators at start

- **WHEN** user triggers completion at document start or after `(` or binary operator
- **THEN** completion list includes `<`, `<<`, `>`, `>>`, `*`

#### Scenario: Suggest refinement syntax

- **WHEN** user types `< 19829001 |Disorder|` and triggers completion
- **THEN** completion list includes `:` (refinement separator) with description

#### Scenario: Filter completions by partial input

- **WHEN** user types `< 19829001 AN` and triggers completion
- **THEN** completion list shows `AND` as top suggestion, filtering out non-matching operators

### Requirement: Provide AI-optimized completion documentation

Each completion item SHALL include rich, example-driven documentation designed for both human developers and AI agents.

#### Scenario: Operator completion includes detailed description

- **WHEN** user selects `AND` from completion list
- **THEN** completion item shows documentation with description "Logical AND - Intersection of two concept sets"

#### Scenario: Operator completion includes multiple syntax examples

- **WHEN** completion documentation is displayed for `<` operator
- **THEN** documentation includes at least 2 examples showing different usage patterns (simple constraint, with refinement)

#### Scenario: Completion documentation uses structured Markdown

- **WHEN** completion documentation is formatted
- **THEN** documentation uses Markdown with clear sections (Syntax, Description, Examples) and code blocks for examples

#### Scenario: Examples are complete and runnable

- **WHEN** completion includes example ECL syntax
- **THEN** examples are valid, complete ECL expressions that can be copied and used directly

### Requirement: Context-aware completion filtering

Completion suggestions SHALL be filtered based on syntactic context.

#### Scenario: No binary operators in invalid position

- **WHEN** user triggers completion immediately after `AND` operator
- **THEN** completion list does NOT include `AND`, `OR` (expects operand, not operator)

#### Scenario: Refinement operator only after concept

- **WHEN** user triggers completion after incomplete expression (e.g., just `<`)
- **THEN** completion list does NOT include `:` (refinement requires complete concept constraint)

### Requirement: Completion triggered by user action

Completions SHALL be provided when user explicitly requests (Ctrl+Space) or after typing trigger characters.

#### Scenario: Manual completion trigger

- **WHEN** user presses Ctrl+Space (or platform equivalent)
- **THEN** completion list appears with context-appropriate suggestions

#### Scenario: Automatic trigger after whitespace

- **WHEN** user types whitespace after a complete expression
- **THEN** completion list automatically appears with operator suggestions

#### Scenario: Automatic trigger after opening parenthesis

- **WHEN** user types `(`
- **THEN** completion list automatically appears with constraint operator suggestions
