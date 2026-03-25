## ADDED Requirements

### Requirement: ECL reference documentation module

The ecl-core package SHALL contain a `knowledge/` module with structured ECL reference documentation condensed from the official ECL specification and grammar repository examples. This content SHALL be usable by both the LSP server (hover docs, completion context) and the MCP server (agent literacy resources).

#### Scenario: Operator documentation available

- **WHEN** requesting knowledge for ECL operators
- **THEN** the module provides documentation for all 15+ operators (< << > >> <! <<! >! >>! ^ !!> !!< AND OR MINUS memberOf) including meaning, syntax, and examples

#### Scenario: Refinement documentation available

- **WHEN** requesting knowledge for ECL refinements
- **THEN** the module provides documentation covering attribute refinement syntax, attribute groups, cardinality, reverse flags, and common SNOMED CT attributes

#### Scenario: Filter documentation available

- **WHEN** requesting knowledge for ECL filters
- **THEN** the module provides documentation for description filters ({{D}}), concept filters ({{C}}), and member filters ({{M}}) with their sub-properties

#### Scenario: Pattern documentation available

- **WHEN** requesting knowledge for common ECL patterns
- **THEN** the module provides documented patterns for typical tasks (finding descendants, filtering by attribute, combining constraints, using history supplements)

#### Scenario: Grammar summary available

- **WHEN** requesting the grammar reference
- **THEN** the module provides a condensed ECL 2.2 grammar summary

#### Scenario: History supplement documentation available

- **WHEN** requesting knowledge for history supplements
- **THEN** the module provides documentation for HISTORY-MIN, HISTORY-MOD, HISTORY-MAX, and HISTORY profiles

### Requirement: Structured content format

The knowledge module SHALL provide content as structured data (not raw markdown strings) so consumers can select specific sections, compose content for different contexts, and format appropriately for their output medium.

#### Scenario: Content retrievable by topic

- **WHEN** a consumer requests documentation for a specific topic (e.g., "operators", "refinements")
- **THEN** the module returns structured content for that topic without requiring the consumer to parse a large document

#### Scenario: Examples included with documentation

- **WHEN** documentation is retrieved for any ECL construct
- **THEN** each construct includes at least one concrete ECL example expression

### Requirement: No NLP or reasoning logic

The knowledge module SHALL contain only reference material (descriptions, examples, syntax guides). It SHALL NOT contain natural language processing, expression explanation, or pattern suggestion logic. LLM agents and LSP hover providers consume the reference material and perform reasoning themselves.

#### Scenario: Module has no LLM dependencies

- **WHEN** inspecting the knowledge module's imports
- **THEN** it has no dependencies on AI/ML/NLP libraries

#### Scenario: Content is static reference material

- **WHEN** inspecting the knowledge module's exports
- **THEN** they return static documentation content, not computed explanations or suggestions
