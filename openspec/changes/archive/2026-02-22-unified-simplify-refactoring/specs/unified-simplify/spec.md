## ADDED Requirements

### Requirement: Single simplify code action

The system SHALL offer a single "Simplify" code action that replaces the three separate simplification actions (simplify expression, simplify by subsumption, factor common focus). The action SHALL be offered when the expression contains any compound (AND/OR) node with 2+ operands, at any nesting level.

#### Scenario: Offered for top-level AND compound

- **WHEN** the expression is `<< 404684003 AND < 404684003`
- **THEN** a single "Simplify" code action is offered

#### Scenario: Offered for nested compound inside parens

- **WHEN** the expression is `(<< 404684003 OR < 404684003) AND < 19829001`
- **THEN** a single "Simplify" code action is offered (the inner OR is simplifiable)

#### Scenario: Not offered when no simplification possible

- **WHEN** the expression is `< 404684003 AND < 19829001` with no redundancy
- **THEN** no "Simplify" code action is offered

#### Scenario: Not offered for MINUS compounds

- **WHEN** the expression is `< 404684003 MINUS < 19829001`
- **THEN** no "Simplify" code action is offered (MINUS has set-difference semantics, not subsumption)

### Requirement: Bottom-up tree walking

The engine SHALL process compound nodes bottom-up, simplifying the innermost parenthesized sub-expressions first, then working outward to the root. Each level is simplified before its result feeds into the parent level.

#### Scenario: Inner groups simplified before outer

- **WHEN** the expression is `(<< 404684003 OR < 404684003) AND (<< 19829001 OR < 19829001)`
- **THEN** each inner OR group is simplified first (to `<< 404684003` and `<< 19829001`), then the outer AND is evaluated

#### Scenario: Single-level compound processed directly

- **WHEN** the expression is `<< 404684003 OR < 404684003 OR 404684003`
- **THEN** the engine processes the single compound node without recursion

### Requirement: Remove exact duplicate operands

At each compound node, the engine SHALL remove operands whose text is identical to an earlier operand in the same compound. This is the first technique applied.

#### Scenario: Duplicate removed in AND

- **WHEN** the expression is `< 404684003 AND < 19829001 AND < 404684003`
- **THEN** the result is `< 404684003 AND < 19829001`

#### Scenario: Duplicate removed in OR

- **WHEN** the expression is `< 404684003 OR < 19829001 OR < 404684003`
- **THEN** the result is `< 404684003 OR < 19829001`

#### Scenario: No duplicates leaves expression unchanged

- **WHEN** the expression is `< 404684003 AND < 19829001`
- **THEN** no duplicate removal is applied

### Requirement: Same-concept operator ranking

At each compound node, when multiple operands reference the same concept with different subsumption operators, the engine SHALL keep only the most appropriate operand. For AND, the most restrictive (self > descendantOf > descendantOrSelfOf). For OR, the broadest (descendantOrSelfOf > descendantOf > self).

#### Scenario: AND keeps more restrictive

- **WHEN** the expression is `<< 404684003 AND < 404684003`
- **THEN** the result is `< 404684003` (descendantOf is more restrictive than descendantOrSelfOf)

#### Scenario: AND keeps self over descendantOf

- **WHEN** the expression is `< 404684003 AND 404684003`
- **THEN** the result is `404684003` (self is the most restrictive)

#### Scenario: OR keeps broader

- **WHEN** the expression is `<< 404684003 OR < 404684003`
- **THEN** the result is `<< 404684003` (descendantOrSelfOf is the broadest)

#### Scenario: OR keeps descendantOf over self

- **WHEN** the expression is `< 404684003 OR 404684003`
- **THEN** the result is `< 404684003`

### Requirement: FHIR subsumption via MINUS evaluation

At each compound node, the engine SHALL check pairs of non-empty operands for subset relationships using FHIR `(A) MINUS (B)` evaluation. If `A MINUS B = 0`, then A is a subset of B. For AND, keep the smaller set (A). For OR, keep the larger set (B).

#### Scenario: AND removes superset operand

- **WHEN** the expression is `< 19829001 AND < 404684003` where `< 19829001` (disorders) is a subset of `< 404684003` (clinical findings)
- **THEN** the result is `< 19829001` (AND keeps the smaller set)

#### Scenario: OR removes subset operand

- **WHEN** the expression is `< 19829001 OR < 404684003` where `< 19829001` is a subset of `< 404684003`
- **THEN** the result is `< 404684003` (OR keeps the larger set)

#### Scenario: Empty operands preserved

- **WHEN** an operand evaluates to 0 results (unknown/inactive concept)
- **THEN** the operand is NOT removed (empty-set subsumption is vacuous, not real simplification)

#### Scenario: FHIR failure does not prevent other simplifications

- **WHEN** a FHIR call fails for one pair of operands
- **THEN** other pairs and other techniques are still applied

### Requirement: Factor common focus from OR compounds

At each OR compound node, when every operand is a parenthesized refined expression sharing the same focus concept and constraint operator, the engine SHALL factor out the common focus into a single refined expression.

#### Scenario: Common focus factored

- **WHEN** the expression is `(< 404684003 : a1 = v1) OR (< 404684003 : a2 = v2)`
- **THEN** the result is `< 404684003 : a1 = v1 OR a2 = v2`

#### Scenario: Different focus concepts not factored

- **WHEN** the expression is `(< 404684003 : a1 = v1) OR (< 19829001 : a2 = v2)`
- **THEN** factoring is not applied (focus concepts differ)

### Requirement: Merge same-focus refinements in AND compounds

At each AND compound node, when multiple operands share the same focus concept, constraint operator, and are refined expressions, the engine SHALL merge their refinements into a single expression with AND-joined attributes.

#### Scenario: Same-focus AND refinements merged

- **WHEN** the expression is `(< 404684003 : a1 = v1) AND (< 404684003 : a2 = v2)`
- **THEN** the result is `< 404684003 : a1 = v1 AND a2 = v2`

#### Scenario: Different focus not merged

- **WHEN** the expression is `(< 404684003 : a1 = v1) AND (< 19829001 : a2 = v2)`
- **THEN** merging is not applied (focus concepts differ)

### Requirement: Re-check after transformation

After any simplification technique transforms a compound node, the engine SHALL re-check the node with all techniques since one simplification may enable another.

#### Scenario: Duplicate removal enables operator ranking

- **WHEN** the expression is `< 404684003 OR << 404684003 OR < 404684003`
- **THEN** duplicate removal produces `< 404684003 OR << 404684003`, then operator ranking produces `<< 404684003`

### Requirement: Async resolve pattern

The unified simplify action SHALL use the LSP code action resolve pattern. The initial code action carries metadata (expression text, range, URI). The resolve handler performs FHIR calls and returns the edit.

#### Scenario: Resolve applies simplification

- **WHEN** the user selects the "Simplify" code action
- **THEN** the resolve handler evaluates FHIR subsumption queries and returns a TextEdit replacing the expression with the simplified form

#### Scenario: Resolve returns no edit when nothing simplifiable

- **WHEN** subsumption checks find no redundancy (after sync techniques already found none)
- **THEN** the resolve handler returns the code action without an edit

### Requirement: Non-simplification actions unchanged

The strip/add display terms, add parentheses, add history supplement, and add description filter refactoring actions SHALL continue to work exactly as before this change.

#### Scenario: Other actions still offered

- **WHEN** the expression is `< 404684003 |Clinical finding| AND < 19829001 |Disorder|`
- **THEN** "Strip display terms", "Add explicit parentheses", "Add history supplement", and "Add description filter" are still available alongside the unified "Simplify"
