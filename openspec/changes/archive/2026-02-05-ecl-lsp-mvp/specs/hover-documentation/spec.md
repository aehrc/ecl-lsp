## ADDED Requirements

### Requirement: Display operator documentation on hover

The LSP server SHALL display documentation when user hovers over ECL operators.

#### Scenario: Hover over descendant operator

- **WHEN** user hovers over `<` operator in expression `< 404684003 |Clinical finding|`
- **THEN** hover popup shows "Descendant-of operator" with description and example

#### Scenario: Hover over ancestor operator

- **WHEN** user hovers over `>` operator
- **THEN** hover popup shows "Ancestor-of operator" with description and example

#### Scenario: Hover over descendant-or-self operator

- **WHEN** user hovers over `<<` operator
- **THEN** hover popup shows "Descendant-or-self-of operator" with description and example

#### Scenario: Hover over binary operators

- **WHEN** user hovers over `AND`, `OR`, or `MINUS` keywords
- **THEN** hover popup shows operator description and usage example

### Requirement: Include multiple AI-friendly usage examples in hover

Hover documentation SHALL include 2-3 concrete usage examples for each operator, progressing from simple to complex patterns.

#### Scenario: Multiple examples for descendant operator

- **WHEN** hover documentation is shown for `<`
- **THEN** hover includes at least 2 examples: simple usage `< 404684003 |Clinical finding|` and with refinement

#### Scenario: Example for refinement shows complete pattern

- **WHEN** hover documentation is shown for `:` (refinement separator)
- **THEN** hover includes complete example: `< 19829001 |Disorder of lung| : 116676008 |Associated morphology| = < 79654002 |Edema|`

#### Scenario: Examples progress from simple to complex

- **WHEN** hover documentation is shown for `AND`
- **THEN** hover shows simple example first, then example with refinements or nested expressions

#### Scenario: Each example is syntactically complete

- **WHEN** hover includes usage examples
- **THEN** all examples are valid, complete ECL expressions that AI agents can learn from and adapt

### Requirement: Format hover content as Markdown

Hover documentation SHALL be formatted using Markdown for readability.

#### Scenario: Markdown formatting in hover

- **WHEN** hover is displayed
- **THEN** content uses Markdown with headers, code blocks, and emphasis

#### Scenario: Code examples use code blocks

- **WHEN** hover includes usage examples
- **THEN** examples are wrapped in Markdown code blocks for syntax highlighting

### Requirement: Provide operator semantics description

Hover documentation SHALL explain what the operator does in plain language.

#### Scenario: Descendant operator semantics

- **WHEN** user hovers over `<`
- **THEN** hover explains "Matches all concepts that are descendants of the specified concept (excluding the concept itself)"

#### Scenario: Refinement operator semantics

- **WHEN** user hovers over `:` in refinement context
- **THEN** hover explains "Constrains concepts based on their attributes and relationships"

### Requirement: Display concept information from FHIR on hover

Hover documentation SHALL display real concept information retrieved from FHIR terminology server when user hovers over concept IDs.

#### Scenario: Hover over concept ID shows FHIR data

- **WHEN** user hovers over concept ID `404684003`
- **THEN** hover popup shows concept information retrieved from FHIR including FSN (Fully Specified Name) and PT (Preferred Term)

#### Scenario: Concept hover displays FSN and PT

- **WHEN** hover retrieves concept information for `404684003`
- **THEN** hover displays "Clinical finding (finding)" as FSN and "Clinical finding" as PT in structured Markdown format

#### Scenario: Hover fails gracefully when FHIR unavailable

- **WHEN** user hovers over concept ID and FHIR server is unreachable
- **THEN** no hover popup is shown (graceful degradation, LSP continues working)

#### Scenario: Hover uses cached concept data

- **WHEN** user hovers over previously looked-up concept ID
- **THEN** hover displays cached concept information without network call

#### Scenario: No hover for concept term text

- **WHEN** user hovers over term text `|Clinical finding|`
- **THEN** no hover popup is shown (only concept IDs trigger lookups)
