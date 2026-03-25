## Why

Currently, users must manually look up SNOMED CT concept IDs outside the editor and copy them into their ECL expressions. This disrupts the development workflow and slows down ECL authoring. With FHIR terminology service integration already in place for concept validation and hover, we can leverage it to provide interactive concept search and insertion directly within the editor.

## What Changes

- Add LSP command to invoke concept search dialog
- Integrate FHIR terminology service `ValueSet/$expand` operation for concept search
- Provide completion provider that triggers concept search at valid concept ID positions
- Add UI mechanism to disambiguate between operator/keyword completion and concept search
- Insert selected concept ID (with optional term) at cursor position
- Support search by:
  - Concept display name/description (fuzzy matching)
  - Concept ID (exact or prefix matching)

## Capabilities

### New Capabilities

- `concept-search`: Search for SNOMED CT concepts using FHIR terminology service and insert at cursor position. Covers search interface, FHIR integration, result formatting, and insertion logic.
- `search-disambiguation`: Distinguish between user intent to insert operators/keywords vs search for concepts at positions where both are syntactically valid. Provides UI/interaction model for user choice.

### Modified Capabilities

- `completion`: Existing completion provider needs enhancement to offer "Search for concept..." option at positions where concept IDs are valid, alongside existing operator/keyword completions.

## Impact

**Affected Code:**

- `server/src/server.ts` - Add command handler and enhanced completion logic
- `server/src/terminology/fhir-service.ts` - Add `ValueSet/$expand` operation support
- `client/src/extension.ts` - Register LSP command, may need custom UI for search results

**New Dependencies:**

- May need VSCode Quick Pick API for search result selection
- FHIR `ValueSet/$expand` with filter parameter for search queries

**APIs:**

- New LSP command: `ecl.searchConcept` (invoked via command palette or completion)
- Enhanced completion provider to detect valid concept positions

**User Experience:**

- Users can trigger concept search via:
  - Completion suggestion "🔍 Search for concept..."
  - Command palette: "ECL: Search for Concept"
  - Keyboard shortcut (to be defined)
- Search dialog shows real-time FHIR results as user types
- Selected concept inserted as `SCTID |Term|` at cursor

**Performance Considerations:**

- FHIR search queries need debouncing (300ms delay)
- Result pagination/limiting (max 20 results initially)
- Caching of recent search results
- Graceful degradation if FHIR unavailable
