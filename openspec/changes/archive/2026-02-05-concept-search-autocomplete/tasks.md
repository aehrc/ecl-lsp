## 1. Server - Verhoeff Validation

- [x] 1.1 Create `server/src/terminology/verhoeff.ts` with Verhoeff check digit validation algorithm
- [x] 1.2 Implement `isValidSnomedId(conceptId: string): boolean` function with length check (6-18 digits), Verhoeff validation, and partition identifier check
- [x] 1.3 Add unit tests for Verhoeff validation in `server/src/test/verhoeff.test.ts` (valid IDs, invalid check digits, edge cases)

## 2. Server - FHIR Search API

- [x] 2.1 Add `searchConcepts(query: string): Promise<ConceptSearchResult[]>` method to `FhirTerminologyService`
- [x] 2.2 Implement numeric input detection and routing (valid SCTID → $lookup, invalid/text → $expand with filter)
- [x] 2.3 Add `ValueSet/$expand` FHIR operation support with filter parameter
- [x] 2.4 Implement search result caching with LRU eviction (max 100 entries, 5-minute expiration)
- [x] 2.5 Add result limiting (max 20 results) and "more available" flag
- [x] 2.6 Format search results as `ConceptSearchResult` with id, fsn, pt fields
- [x] 2.7 Add 5-second timeout for FHIR search queries
- [x] 2.8 Add graceful error handling with retry capability
- [x] 2.9 Add unit tests for search logic in `server/src/test/fhir-search.test.ts` (text search, ID lookup, caching, errors)

## 3. Server - LSP Custom Request Handler

- [x] 3.1 Register custom LSP request handler `ecl/searchConcept` in `server.ts`
- [x] 3.2 Implement request handler that accepts `{ query: string }` and returns search results
- [x] 3.3 Wire handler to `FhirTerminologyService.searchConcepts()`
- [x] 3.4 Add error handling and timeout management in request handler

## 4. Server - Completion Position Detection

- [x] 4.1 Create `server/src/parser/position-detector.ts` with regex-based concept position detection
- [x] 4.2 Implement `isConceptPositionValid(line: string, cursorPosition: number): boolean` function
- [x] 4.3 Add detection for valid concept positions (after `< `, `<< `, `> `, `>> `, `AND `, `OR `, `MINUS `, `: `, `= `, start of line, after `(`)
- [x] 4.4 Add unit tests for position detection in `server/src/test/position-detector.test.ts`

## 5. Server - Enhanced Completion Provider

- [x] 5.1 Update `onCompletion` handler in `server.ts` to accept `CompletionParams` with position information
- [x] 5.2 Add position detection logic using `isConceptPositionValid()`
- [x] 5.3 Add "🔍 Search for concept..." completion item when position is valid
- [x] 5.4 Set completion item properties: `kind: CompletionItemKind.Function`, `detail: "Search SNOMED CT concepts via FHIR"`, `command: { command: "ecl.searchConcept", title: "Search Concept" }`
- [x] 5.5 Implement prioritization logic (operators before search at ambiguous positions, search first after constraint operators)
- [x] 5.6 Ensure existing operator completions are preserved

## 6. Client - Command Registration

- [x] 6.1 Register LSP command `ecl.searchConcept` in `client/src/extension.ts` during `activate()`
- [x] 6.2 Add command handler that opens VSCode Quick Pick for search
- [x] 6.3 Add package.json command declaration with title "ECL: Search for Concept"
- [x] 6.4 Add keyboard shortcut binding (suggest: Ctrl+Shift+F or Cmd+Shift+F)

## 7. Client - Search UI Implementation

- [x] 7.1 Create search UI using `vscode.window.createQuickPick()` with full control
- [x] 7.2 Implement debouncing (300ms) on search input using `onDidChangeValue` event
- [x] 7.3 Wire search input to LSP custom request `ecl/searchConcept`
- [x] 7.4 Format Quick Pick items with label showing "SCTID | FSN" and description showing PT
- [x] 7.5 Add loading indicator during FHIR query (use `busy: true` on Quick Pick)
- [x] 7.6 Add empty state message "No concepts found" when results are empty
- [x] 7.7 Add error handling with "Terminology server unavailable" message
- [x] 7.8 Add "more available" indicator when results exceed 20

## 8. Client - Concept Insertion Logic

- [x] 8.1 Implement concept insertion on Quick Pick selection
- [x] 8.2 Get active text editor and cursor position
- [x] 8.3 Detect if cursor is on existing concept ID (regex match at cursor position)
- [x] 8.4 Build replacement text in format `SCTID |Term|` (or just SCTID if term unavailable)
- [x] 8.5 Use `workspace.applyEdit()` with replace for existing or insert for new concept
- [x] 8.6 Handle edge cases (no active editor, invalid position)

## 9. Integration Testing

_Note: These are manual testing tasks for the user to perform in VSCode_

- [ ] 9.1 Test command invocation via command palette
- [ ] 9.2 Test command invocation via keyboard shortcut
- [ ] 9.3 Test completion trigger showing search option at valid positions
- [ ] 9.4 Test completion NOT showing search option at invalid positions
- [ ] 9.5 Test search by concept description (e.g., "diabetes")
- [ ] 9.6 Test search by valid SNOMED CT ID (e.g., "404684003")
- [ ] 9.7 Test search by invalid numeric string (e.g., "7311")
- [ ] 9.8 Test concept insertion at cursor (new insertion)
- [ ] 9.9 Test concept replacement (cursor on existing concept)
- [ ] 9.10 Test graceful degradation when FHIR server offline
- [ ] 9.11 Test caching behavior (repeated search returns cached results)
- [ ] 9.12 Test timeout handling (simulate slow FHIR response)

## 10. Documentation

- [x] 10.1 Update README.md with concept search feature description
- [x] 10.2 Add usage examples showing command palette, keyboard shortcut, and completion trigger
- [x] 10.3 Document search syntax (description vs ID)
- [ ] 10.4 Add screenshots or GIFs demonstrating the feature (optional - requires manual capture)
- [x] 10.5 Update IMPLEMENTATION_SUMMARY.md with new feature details
