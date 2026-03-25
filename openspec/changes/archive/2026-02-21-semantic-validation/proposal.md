## Why

The language server currently validates syntax and checks whether individual concept IDs exist or are active, but it has no understanding of whether an ECL expression is _semantically_ correct. An author can write `< 404684003 : 12345678 = < 39057004` and receive no warning that `12345678` is not a valid SNOMED CT attribute — or that the value constraint is incompatible with the attribute. Since the FHIR terminology server can evaluate ECL, we can use it to validate attribute usage, value constraints, and detect expressions that will never return results. This catches real authoring errors before evaluation.

## What Changes

- **Attribute validation**: Warn when an attribute (or any concept in an attribute ECL expression) is not a descendant of `106237007 |Linkage concept|`. For ECL-valued attributes, evaluate `<attribute-ecl> MINUS < 106237007` — if results exist, warn with the first few out-of-scope concepts.
- **Value constraint validation**: For a refinement `A : B = C`, the valid value range is `A.B` (dotted attribute). Warn when `C` and `A.B` are disjoint — i.e., `C AND A.B` evaluates to 0 results, meaning none of the specified values are valid for that attribute on that focus concept. Single concept values and ECL-valued constraints both checked.
- **Empty sub-expression warnings**: Warn when any sub-expression within a larger ECL expression evaluates to 0 matches, as this means the containing expression will also return 0 results.
- **Wildcard exclusion**: All checks skip `*` (wildcard) values — the author is explicitly saying "any value", so validation is not applicable.
- **Parallel execution**: All independent FHIR requests within semantic validation should execute in parallel (e.g., attribute checks and value constraint checks for different refinements).
- **Configurable**: Semantic validation is on by default but can be disabled via `ecl.semanticValidation.enabled` setting, since it requires multiple FHIR server round-trips that may be slow or expensive.

## Capabilities

### New Capabilities

- `semantic-validation`: Core semantic validation engine — attribute scope checking, value constraint checking, empty sub-expression detection, and configuration

### Modified Capabilities

## Impact

- `server/src/server.ts` — New semantic validation pass after syntax/concept validation, triggered on document change
- `server/src/terminology/fhir-service.ts` — New helpers for evaluating compound ECL (MINUS, AND, dotted attributes)
- `server/src/parser/concept-extractor.ts` or new module — Extract structured refinement info (focus concept ECL, attribute ECL, value ECL) from AST
- `client/package.json` — New `ecl.semanticValidation.enabled` configuration setting
- Performance: Multiple parallel `$expand` calls per refinement; needs debouncing/caching strategy to avoid overwhelming the terminology server
