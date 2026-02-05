## 1. Add Context Detection Logic

- [x] 1.1 Add `getValidOperatorsAtPosition(line: string, position: number): string[]` function to `server/src/parser/position-detector.ts`
- [x] 1.2 Implement pattern detection for "after complete constraint" context (returns AND, OR, MINUS, :)
- [x] 1.3 Implement pattern detection for "after constraint operator" context (returns empty array)
- [x] 1.4 Implement pattern detection for "after logical operator" context (returns <, <<, >, >>)
- [x] 1.5 Implement pattern detection for "start of expression" context (returns <, <<, >, >>)
- [x] 1.6 Implement pattern detection for "after refinement separator" context (returns appropriate operators)
- [x] 1.7 Implement pattern detection for "after attribute operator" context (returns appropriate operators)
- [x] 1.8 Add fallback for ambiguous contexts (returns all operators when uncertain)

## 2. Unit Tests for Context Detection

- [x] 2.1 Create test file `server/src/test/position-detector.test.ts` if not exists
- [x] 2.2 Add test: "detects after complete constraint context" (< 404684003 |term| █)
- [x] 2.3 Add test: "detects after constraint operator context" (< █)
- [x] 2.4 Add test: "detects after logical operator context" (AND █)
- [x] 2.5 Add test: "detects start of expression context" (empty line, after paren)
- [x] 2.6 Add test: "detects after refinement separator context" (: █)
- [x] 2.7 Add test: "detects after attribute operator context" (= █)
- [x] 2.8 Add test: "handles ambiguous context gracefully" (returns all operators)
- [x] 2.9 Add test: "handles malformed input" (empty string, only whitespace)
- [x] 2.10 Add test: "handles various cursor positions in same line"

## 3. Update Completion Handler

- [x] 3.1 Import `getValidOperatorsAtPosition` in `server/src/server.ts`
- [x] 3.2 In `onCompletion` handler, extract line text and cursor position
- [x] 3.3 Call `getValidOperatorsAtPosition(line, position)` to get valid operators
- [x] 3.4 Filter operator completion items based on valid operators list
- [x] 3.5 Preserve concept search integration (don't filter 🔍 Search option)
- [x] 3.6 Maintain existing operator prioritization logic
- [x] 3.7 Ensure completion still works when context detection returns empty array

## 4. Integration Tests for Completion Filtering

- [x] 4.1 Create test file `server/src/test/completion-context.test.ts`
- [x] 4.2 Add test: "completion after complete constraint shows only logical operators"
- [x] 4.3 Add test: "completion after constraint operator shows only concept search"
- [x] 4.4 Add test: "completion after logical operator shows only constraint operators"
- [x] 4.5 Add test: "completion at start of expression shows constraint operators"
- [x] 4.6 Add test: "completion preserves concept search option when concepts valid"
- [x] 4.7 Add test: "completion maintains operator prioritization order"
- [x] 4.8 Add test: "completion falls back to all operators for ambiguous context"

## 5. Edge Cases and Refinement

- [x] 5.1 Test completion with complex nested parentheses
- [x] 5.2 Test completion in multi-line expressions (context uses single line before cursor)
- [x] 5.3 Test completion with comments in expression
- [x] 5.4 Test completion with malformed/incomplete syntax
- [x] 5.5 Verify concept search still triggers from completion selection
- [x] 5.6 Verify operators can still be manually typed if not in completion list

## 6. Documentation and Cleanup

- [x] 6.1 Add inline comments explaining context detection patterns in position-detector.ts
- [x] 6.2 Update README.md to mention context-aware operator filtering feature
- [x] 6.3 Run `npm test` to ensure all tests pass
- [x] 6.4 Run `npm run compile` to verify TypeScript compilation succeeds
- [x] 6.5 Manual test: Open examples/real-fhir-test.ecl and verify filtered completions at various positions
