## Context

The ECL Language Server currently provides syntax validation, hover documentation, and basic completion for ECL operators. Users must manually look up SNOMED CT concept IDs outside the editor and copy-paste them into ECL expressions, which disrupts workflow.

The LSP already integrates with a FHIR terminology server (`https://tx.ontoserver.csiro.au/fhir`) for concept validation and hover information using `CodeSystem/$lookup`. This change extends FHIR integration to provide interactive concept search using `ValueSet/$expand` with filtering.

**Current State:**

- `FhirTerminologyService` implements `CodeSystem/$lookup` with caching (10k concepts, LRU)
- Hover provider detects concept IDs via regex `/\b(\d{6,18})\b/g`
- Completion provider returns static list of ECL operators (AND, OR, MINUS, <, <<, >, >>)
- No context-aware completion or search capabilities

**Constraints:**

- Must maintain graceful degradation when FHIR server unavailable
- LSP command execution requires client-side UI for search dialog
- VSCode Quick Pick API must be used from client extension, not server
- Completion items can trigger commands via `command` property

**Stakeholders:**

- ECL authors who need to reference SNOMED CT concepts frequently
- Clinical terminology specialists who know concept names but not IDs

## Goals / Non-Goals

**Goals:**

- Enable FHIR-powered concept search directly from the editor (command palette, keyboard shortcut, completion)
- Insert selected concepts at cursor in ECL format: `SCTID |Term|`
- Support search by concept description (fuzzy matching) and concept ID (exact lookup)
- Integrate search option into completion list at positions where concept IDs are valid
- Maintain existing operator completion behavior
- Cache search results to minimize FHIR queries

**Non-Goals:**

- Context-aware keyword filtering (showing only syntactically valid operators at each position) - deferred to future enhancement
- Advanced search features (semantic filters, relationship traversal, ECL-based filtering)
- Offline concept database or search capability
- Custom concept browsers or terminology exploration UI beyond basic search

## Decisions

### Decision 1: Client-side command vs server-side search coordination

**Options:**

- **A) Pure client-side search** - Client handles FHIR queries, search UI, and insertion
- **B) Hybrid approach** - Client handles UI, server provides FHIR search API via LSP custom requests
- **C) Server-driven with command trigger** - Server provides search logic, client only shows UI and sends selection back

**Chosen: B) Hybrid approach**

**Rationale:**

- Server already has `FhirTerminologyService` with caching and error handling
- Client has access to VSCode Quick Pick API for search dialog
- Custom LSP request (`ecl/searchConcept`) allows server to perform FHIR queries and return results
- Client can debounce user input and send search queries to server
- Separation of concerns: server handles terminology logic, client handles UI

**Alternatives considered:**

- Option A: Would duplicate FHIR logic in client, lose caching benefits
- Option C: Harder to implement real-time search with user typing feedback

### Decision 2: Search result caching strategy

**Options:**

- **A) No caching** - Query FHIR on every search
- **B) LRU cache with timed eviction** - Cache query results, expire after 5 minutes, max 100 entries
- **C) Persistent cache** - Store to disk, survive LSP restarts

**Chosen: B) LRU cache with timed eviction**

**Rationale:**

- FHIR `ValueSet/$expand` queries can take 200-500ms
- Users often search for same concepts repeatedly during a session
- 5-minute expiration balances freshness with performance
- 100 query limit prevents unbounded memory growth
- Aligns with existing `FhirTerminologyService` caching pattern

**Alternatives considered:**

- Option A: Poor user experience with noticeable latency on every keystroke
- Option C: Over-engineering for terminology data that rarely changes, adds complexity

### Decision 3: Completion integration approach

**Options:**

- **A) Command-only completion item** - Only show "🔍 Search for concept..." in completion list
- **B) Dynamic concept suggestions** - Query FHIR in completion provider based on partial input
- **C) Hybrid** - Show search option + pre-cache common concepts for auto-suggest

**Chosen: A) Command-only completion item**

**Rationale:**

- Completion provider runs synchronously and must return quickly
- Async FHIR queries would block completion UI
- Search option delegates to command which can show proper async search dialog
- Simpler implementation, clearer user model (explicit search vs auto-suggest)

**Alternatives considered:**

- Option B: Would require background pre-loading or slow completion response
- Option C: Premature optimization, unclear which concepts are "common"

### Decision 4: Concept ID detection for search positioning

**Options:**

- **A) AST-based position detection** - Use parser to determine valid concept positions
- **B) Regex-based pattern matching** - Detect operators/keywords before cursor
- **C) Always show search option** - Let user invoke search anywhere

**Chosen: B) Regex-based pattern matching**

**Rationale:**

- ECL grammar has clear patterns for concept positions (after `< `, `AND `, `: `, `= `)
- AST from current parser is incomplete (doesn't handle compound expressions well)
- Regex is fast and reliable for this use case
- Matches existing hover implementation approach

**Alternatives considered:**

- Option A: Would require expanding AST visitor, higher complexity
- Option C: Poor UX, search option shown where insertion would be invalid

### Decision 5: Search query strategy for numeric input

**Options:**

- **A) Always use ValueSet/$expand with filter** - Treat all input as description search
- **B) Validate SNOMED CT ID format, then route** - Check Verhoeff checksum, use $lookup if valid, $expand if invalid
- **C) Parallel search** - Run both $lookup and $expand for all numeric input

**Chosen: B) Validate SNOMED CT ID format, then route**

**Rationale:**

- SNOMED CT identifiers have a [specific format](https://docs.snomed.org/snomed-ct-specifications/snomed-ct-release-file-specification/snomed-ct-identifiers/6.1-sctid-data-type): 6-18 digits with [Verhoeff check digit](https://docs.snomed.org/snomed-ct-specifications/snomed-ct-release-file-specification/snomed-ct-identifiers/6.4-check-digit)
- Valid SNOMED CT IDs are extremely unlikely to appear in concept descriptions
- Validation algorithm: (1) Check if 6-18 digits, (2) Validate Verhoeff check digit, (3) Check partition identifier (penultimate two digits)
- If valid format → use `CodeSystem/$lookup` only (direct concept retrieval)
- If numeric but invalid format → use `ValueSet/$expand` with filter (search descriptions containing that number)
- Avoids redundant FHIR queries when input is clearly a concept ID
- Single targeted query is faster and more efficient than parallel queries

**Alternatives considered:**

- Option A: Misses direct concept ID lookup, slower and less accurate for known IDs
- Option C: Wastes FHIR query on $expand when valid ID won't appear in descriptions

### Decision 6: FHIR API integration for search

**Options:**

- **A) ValueSet/$expand only** - Use filter parameter for all searches
- **B) CodeSystem/$lookup for IDs, ValueSet/$expand for descriptions** - Dual approach based on input
- **C) ValueSet/$validate-code** - Check if concepts exist

**Chosen: B) CodeSystem/$lookup for IDs, ValueSet/$expand for descriptions**

**Rationale:**

- FHIR `ValueSet/$expand` with filter searches concept descriptions (FSN, synonyms)
- FHIR `CodeSystem/$lookup` validates and retrieves specific concept by ID
- `$expand` only returns active concepts (automatic filtering)
- `$lookup` returns full concept details including inactive status
- Combining both provides comprehensive search

**Alternatives considered:**

- Option A: Doesn't support direct ID lookup efficiently
- Option C: Wrong use case, intended for validation not search

### Decision 7: Insertion format and cursor position handling

**Options:**

- **A) Insert concept ID only** - Just the SCTID
- **B) Insert with pipe syntax** - `SCTID |Term|`
- **C) Smart insertion** - Detect existing concept and replace vs insert new

**Chosen: C) Smart insertion with pipe syntax**

**Rationale:**

- ECL best practice includes human-readable terms: `404684003 |Clinical finding|`
- Improves readability without changing semantics
- If cursor is on existing concept ID, replace it (user is correcting/changing concept)
- If cursor is at empty position, insert new concept
- Falls back to ID-only if preferred term unavailable

**Alternatives considered:**

- Option A: Valid ECL but poor readability
- Option B: Always inserts, doesn't handle replacement elegantly

## Risks / Trade-offs

### Risk: FHIR service latency impacts search responsiveness

**Mitigation:**

- Implement 300ms debouncing on search input (wait for user to stop typing)
- Set 5-second timeout on FHIR queries
- Show loading indicator during search
- Cache search results for 5 minutes with LRU eviction
- Graceful degradation: show error message if FHIR unavailable

### Risk: Completion list becomes cluttered with search option

**Mitigation:**

- Only show search option at positions where concepts are valid
- Use visual distinction (🔍 icon, different `CompletionItemKind.Function`)
- Prioritize operators before search option at ambiguous positions (start of line, after `(`)
- Prioritize search option after constraint operators (`< `, `<< `)

### Risk: Search results may be ambiguous or too numerous

**Mitigation:**

- Limit results to 20 with "more available" indicator
- Show both SCTID and FSN in search results for clear identification
- Format as "SCTID | FSN (PT)" for disambiguation
- Direct ID lookup results appear first when numeric input detected

### Risk: Network failures disrupt workflow

**Mitigation:**

- Graceful error messages: "Terminology server unavailable"
- Provide "Retry" button in error dialogs
- LSP continues to function (syntax validation, operator completion still work)
- Cache prevents repeated failures for same query

### Risk: Users expect search at all cursor positions

**Trade-off:**

- Search option only appears where concept IDs are syntactically valid
- This prevents confusing errors when user tries to insert concept at operator-only position
- Users can still invoke via command palette anywhere, but insertion will only succeed at valid positions
- Clear error message if insertion attempted at invalid position

## Migration Plan

**Deployment:**

1. **Phase 1: Server-side FHIR search API**
   - Add `ValueSet/$expand` support to `FhirTerminologyService`
   - Add search result caching with LRU eviction
   - Implement custom LSP request handler `ecl/searchConcept`
   - Add unit tests for search logic

2. **Phase 2: Client-side command and UI**
   - Register LSP command `ecl.searchConcept` in client extension
   - Implement VSCode Quick Pick for search results
   - Wire up command to LSP custom request
   - Handle concept insertion via `workspace.applyEdit`

3. **Phase 3: Completion integration**
   - Enhance completion provider to detect concept positions
   - Add "🔍 Search for concept..." completion item with command trigger
   - Implement prioritization logic based on cursor context

4. **Testing:**
   - Unit tests for FHIR search and caching
   - Integration tests for LSP command flow
   - Manual testing with real FHIR server and offline scenarios

**Rollback:**

- Feature is additive, can be disabled by removing command registration
- No breaking changes to existing features
- No schema changes or data migrations

**Backward Compatibility:**

- Fully backward compatible
- Existing operator completion still works
- Existing hover and validation features unchanged

## Open Questions

None - all design decisions have been made. Implementation ready to proceed.
