# @aehrc/ecl-core

Zero-dependency core library for SNOMED CT Expression Constraint Language (ECL) 2.2 — parsing, formatting, validation, completion, refactoring, and terminology integration.

## Install

```bash
npm install @aehrc/ecl-core
```

**Runtime dependencies:**

- `antlr4ts` — ANTLR4 TypeScript runtime (required)
- `node-fetch` — HTTP client for FHIR integration (optional; not needed if you provide your own `ITerminologyService`)

## API Overview

### Parsing

```typescript
import { parseECL, extractConceptIds, groupIntoExpressions } from '@aehrc/ecl-core';

// Parse an ECL expression into an AST
const result = parseECL('< 404684003 |Clinical finding|');
console.log(result.ast); // ExpressionNode
console.log(result.errors); // ParseError[]

// Extract all concept IDs referenced in the AST
const concepts = extractConceptIds(result.ast);
// [{ id: '404684003', term: 'Clinical finding', range: { ... } }]

// Split a multi-expression document into individual expressions
const expressions = groupIntoExpressions(text);
```

**AST types:** `ExpressionNode`, `CompoundExpressionNode`, `RefinedExpressionNode`, `SubExpressionNode`, `AttributeNode`, `FilterConstraintNode`, `HistorySupplementNode`

### Formatting

```typescript
import { formatDocument, defaultFormattingOptions } from '@aehrc/ecl-core';

const formatted = formatDocument('<<404684003:246075003=<<19829001', {
  ...defaultFormattingOptions,
  maxLineLength: 80,
});
```

**Options:** `indentSize`, `indentStyle`, `spaceAroundOperators`, `maxLineLength`, `alignTerms`, `wrapComments`, `breakOnOperators`, `breakOnRefinementComma`, `breakAfterColon`

Range formatting is also supported via `expandToExpressionBoundaries`, `getExpressionsInRange`, and `formatRangeExpressions`.

### Validation

```typescript
import { refineParseError } from '@aehrc/ecl-core';

// Convert ANTLR error messages to user-friendly diagnostics
const refined = refineParseError({ line, column, message, expression });
```

### Semantic Validation

```typescript
import { validateSemantics, FhirTerminologyService } from '@aehrc/ecl-core';

const terminology = new FhirTerminologyService({ baseUrl: 'https://tx.ontoserver.csiro.au/fhir' });
const diagnostics = await validateSemantics(ast, text, terminology);
```

### Completion

```typescript
import { getCompletionItems, getCompletionItemsWithSearch } from '@aehrc/ecl-core';

// Synchronous completions (operators, keywords, snippets)
const items = getCompletionItems(text, offset);

// With FHIR concept search (async)
const items = await getCompletionItemsWithSearch(text, offset, terminology);
```

### Refactoring

```typescript
import { getRefactoringActions } from '@aehrc/ecl-core';

const actions = getRefactoringActions({ text, range, ast, errors });
// Returns: strip/add display terms, simplify, add/remove parentheses,
//          history supplement, description filter
```

The Simplify action's engine is also available as a plain function. It never
changes the set of concepts the expression selects, and it reports each step it
applied. Without a terminology service only the syntactic techniques run
(`subsumption: 'not-run'`).

```typescript
import { simplifyExpression } from '@aehrc/ecl-core';

const result = await simplifyExpression('< 404684003 OR << 404684003', terminologyService);
// result.expression  → '<< 404684003'
// result.steps       → [{ technique: 'rankOperators', removed: ['< 404684003'], ... }]
// result.subsumption → 'complete' | 'partial' | 'not-applicable' (no AND/OR left to check) | 'not-run' (no service)
```

### Terminology

```typescript
import { FhirTerminologyService } from '@aehrc/ecl-core';

const fhir = new FhirTerminologyService({
  baseUrl: 'https://tx.ontoserver.csiro.au/fhir', // default
  timeout: 2000, // lookup timeout (ms)
  snomedVersion: '', // SNOMED version URI (empty = server default)
});

const concept = await fhir.getConceptInfo('404684003');
// { id, fsn, pt, active } or null when the server does not know it

const results = await fhir.evaluateEcl('< 404684003');
// { concepts: [...], total }
```

### Deriving ECL from a Concept List

The opposite of `$expand`: given a code list or a reference set, propose ECL
that selects it, ranked, each with exact counts and samples of what it adds and
misses. The server does every set operation (`expandCompose`, a POSTed inline
ValueSet), so lists of 100,000 codes work. No language model is involved.

```typescript
import { deriveEcl, FhirTerminologyService } from '@aehrc/ecl-core';

const result = await deriveEcl({ conceptIds: ['46635009', '44054006' /* … */] }, new FhirTerminologyService());
// or: deriveEcl({ refsetId: '929360061000036106' }, terminology)

result.input; // { members, inactive, unknown, malformed, duplicates } — what was left out, and why
result.candidates[0];
// { expression: '<< 73211009 | Diabetes |', ecl: '<< 73211009',
//   covered: 121, additions: { count: 0, sample: [] }, misses: { count: 0, sample: [] },
//   exact: true, clauses: 1, construction: { kind: 'hierarchy', roots: ['73211009'], … } }
```

Candidates come from the IS-A hierarchy: an exact cover of the set's roots with
`MINUS` exclusions, cheaper covers by ancestors outside the set (with their
additions reported), a greedy grouping, a cost-based cover, and always the
enumeration or `^ refset` itself. They are ranked by clauses + additions +
misses.

The hierarchy candidates are built from one IS-A subgraph around the set,
fetched in about four expansions that return each concept's parents
(`expandCompose` with `parents: true`, FHIR `property=parent`): the set, its
ancestors, their children, and the descendants of the ancestors worth trying
as groupers. Candidates are built and ranked on that graph without further
requests, and only the best are counted again on the server, so every count
reported comes from the server. A graph candidate that by its local counts
costs at least as much as the input itself (listing every member, or the
expression given) is not counted, with a note.

The cost-based cover treats the set as a weighted set cover: a grouper costs its own clause plus the exclusions that
make it exact, a listed member costs one clause, and groupers are taken while
they cover more members per clause than listing them would. When the server
does not return parents, or a fetch would hold more than `maxGraphConcepts`
concepts (default 200,000), the hierarchy candidates fall back to a query per
count, with a note. Set `useGraph: false` to always use that path. When only
the descendants of every root and grouper are too many, they are loaded for
greedy grouping's groupers alone: the graph is partial, forms that need the
others are left out, and a note says so. `maxAncestorRoots` and
`maxAncestorCandidates` limit the per-query path only. `maxRoots` limits the
per-query path's hierarchy candidates, and on either path how many roots are
used for refinement candidates.

The greedy grouping follows REFACTOR, the grouping algorithm in NHS England's
DMWB (Jeremy Rogers). It scores every ancestor of the set by how much of it is
in the set, picks groupers while it relaxes its fit threshold, and lists the
members left over. It then excludes what the groupers add, so it is always
exact. It is not limited by the number of roots, so it also works on clinical
sets with hundreds of roots. It is offered only on the graph path: it needs
the subgraph, so without a server that returns parents, or with
`useGraph: false`, it is skipped. Set `greedyGrouping: false` to leave
it out.

Sets that cut across the hierarchy (many roots and no short exact IS-A cover,
e.g. AMT products) also
get attribute refinement candidates, `focus : attribute = values`. The
attributes come from the relationships of a sample of members
(`getDefiningRelationships`). Their values are compressed with the IS-A
candidates. The focus is the most specific concept above every member, or a
refset named in an ECL input, or `refinementFocus`. Set `refinements: 'always'`
or `'never'` to override.

Refinement values can be concepts (`<< x`), concrete values (`#500`, a shared
value, a range with `>=` and `<=`, or `= *`) and cardinalities
(`[2..*] attribute = *`). When no refinement is exact, a subtraction
`(C) MINUS (D)` is also tried, with D describing what the refinement C adds.

`deriveEcl({ ecl }, terminology)` takes the set an expression selects. For
pasted text, `deriveInputFromText(text)` picks the input: a list of bare
concepts joined by OR, AND or commas becomes `{ conceptIds }` (so inactive and
unknown ids are reported), any other valid expression `{ ecl }`, and anything
else is read by `parseConceptIdList` (one id per line or CSV rows; a line of
only ids, such as `id id id` or a JSON array, gives all of them). Text holding
several expressions separated by `/* ECL-END */` is refused. The language
server's derive request uses it.
To make
an expression shorter, use `compressExpression`. It compresses the expression's
OR group, keeps what surrounds the group (`AND ^ refset`, a refinement) as
written, and counts what the whole expression then adds and misses. The
original and its exact simplification are always among the candidates.

```typescript
import { compressExpression } from '@aehrc/ecl-core';

const { candidates } = await compressExpression('(<< 372594008 OR << 372767007 OR …) AND ^ 929360081000036101', fhir);
// candidates[i]: { expression, ecl, additions, misses, exact, clauses, source: 'derived' | 'simplified' | 'original' }
```

#### Critique of the list

With `critique: true` (or an object of limits), `deriveEcl` also returns
`result.critique`: structural checks that point to a list worth fixing before
it is turned into ECL. They follow checks of the NHS ValueSet Management Tool
(CHK numbers below), and all are advisory. `formatDeriveReport` prints them
under "Review:". The checks:

| Field              | Check | Flags                                                                                                                                                                                                                                        | Limit (default)                                                   |
| ------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `clauses`          | CHK16 | The best exact candidate needs more clauses than the limit                                                                                                                                                                                   | `maxClauses` (35)                                                 |
| `nearMisses`       | CHK12 | Concepts X where the list holds most, but not all, of `<< X`, with the missing concepts counted on the server. Only the outermost of nested ones is listed                                                                                   | `nearMissShare` (0.9), `nearMissMinSize` (5), `maxNearMisses` (5) |
| `spansHierarchies` | CHK15 | Members in more than one top-level hierarchy (`hierarchies` gives the counts)                                                                                                                                                                |                                                                   |
| `inactive`         | CHK07 | Inactive ids in the input, or a reference set's inactive members                                                                                                                                                                             |                                                                   |
| `impliedInactive`  | CHK08 | Inactive concepts the members' history implies but the input leaves out. Off unless asked for; needs ECL history supplements on the server                                                                                                   | `impliedInactive` (false; `true` is `'HISTORY-MOD'`)              |
| `duplicateTerms`   | CHK13 | Different members with the same preferred term (e.g. a procedure and an observable entity), with FSNs to tell them apart. Whitespace and the case of the first letter are ignored. Skipped for lists of more than `maxGraphConcepts` members | `maxDuplicateTerms` (20; 0 turns it off)                          |

Near misses need the IS-A subgraph (see `useGraph`); without it they are
skipped with a note. Only groupers whose subtree the subgraph loaded are judged:
those the covers and greedy grouping consider, which have mostly members below
them. A grouper over mostly non-members is not, even if the list holds enough
of it.

Cost: on the graph path, the clause limit, hierarchies and a list's inactive ids
need no extra request (off it, the hierarchies need the summary's queries, even
with `hierarchySummary: false`, which only leaves them out of
`result.hierarchies`). Near misses take one request per concept reported, plus
one for their terms; a reference set's inactive members one count (and two
listings when there are any); implied inactive codes one. The language server's
derive request turns the critique on.

```typescript
const result = await deriveEcl({ conceptIds }, fhir, { critique: { maxClauses: 40, impliedInactive: true } });
// result.critique: { clauses, nearMisses, hierarchies, spansHierarchies, inactive, impliedInactive? }
```

#### Benchmark

`scripts/derive-benchmark.cjs` runs `deriveEcl` over a file of reference sets
and, optionally, judges reference ECL for the same sets on the same release.
It reads the compiled library, so run `npm run compile` first.

```bash
node scripts/derive-benchmark.cjs \
  --sets members.tsv --reference refactor.tsv \
  --version http://snomed.info/sct/83821000000107/version/20230830 \
  --base-url https://tx.ontoserver.csiro.au/fhir --max-size 10000 \
  --out results.jsonl
node scripts/derive-benchmark.cjs --out results.jsonl --summary
```

The input files use the layout of the NHS England DMWB export (tab-separated,
latin1, with `ID`, `DESCRIPTION` and `SCTRULE` columns, `SCTRULE` holding the
ECL). The UK clinical reference sets used in development came from the DMWB
export of the 37.0.0 release, with REFACTOR's intensional definitions as the
reference; the data files are not part of this repository. Results are judged
on the release given with `--version`, so a reference made on another release
can add or miss concepts there. Each output line holds the set's top
candidate, its best exact candidate, the reference, the time taken and the
number of `expandCompose` requests. The run is resumable (sets already in
`--out` are skipped), retries a failed set once after 30 s, and pauses 1.5 s
between sets to stay inside public servers' rate limits. `--no-graph` runs the
per-query path for comparison, and `--only id,id` limits the run to some sets.
`--summary` prints win/tie/loss against the reference by cost and by exact
clauses, total clauses, and median and maximum time and requests.

### Canonical Comparison

```typescript
import { canonicalise, compareExpressions } from '@aehrc/ecl-core';

// Normalise to a deterministic canonical form (strips terms, sorts operands/attributes)
canonicalise('< 404684003 |Clinical finding| OR < 19829001');
// → '<19829001 OR <404684003'

// Compare two expressions for structural equivalence
compareExpressions('< 404684003 OR < 19829001', '< 19829001 OR < 404684003');
// → 'structurally_equivalent'
```

Returns `'identical'`, `'structurally_equivalent'`, or `'different'`. Throws `CanonicaliseError` for unparseable input. Pure, synchronous, zero-network-dependency.

### Historical Associations

```typescript
import { FhirTerminologyService } from '@aehrc/ecl-core';

const fhir = new FhirTerminologyService({ baseUrl: 'https://tx.ontoserver.csiro.au/fhir' });

// Look up historical association targets for an inactive concept
const associations = await fhir.getHistoricalAssociations('261282001');
// [{ type: 'same-as', refsetId: '900000000000527005', targets: [{ code: '52323007', display: 'Helleborus niger' }] }]
```

Queries SNOMED CT historical association reference sets (SAME AS, REPLACED BY, POSSIBLY EQUIVALENT TO, ALTERNATIVE) via FHIR `ConceptMap/$translate`.

### Knowledge

Structured ECL reference documentation — 50 articles across 6 categories.

```typescript
import { getArticle, getArticlesByCategory, getOperatorHoverDoc, getGuide } from '@aehrc/ecl-core';

const doc = getOperatorHoverDoc('<<'); // Hover documentation for descendantOrSelfOf
const articles = getArticlesByCategory('operators');
```

### Semantic Tokens

```typescript
import { computeSemanticTokens, eclTokenTypes, eclTokenModifiers } from '@aehrc/ecl-core';

const tokens = computeSemanticTokens(text);
```

### Utility

```typescript
import { isValidSnomedId, isValidConceptId, isValidDescriptionId } from '@aehrc/ecl-core';
import { checkMixedRefinementOperators } from '@aehrc/ecl-core';
import { analyzeExpression } from '@aehrc/ecl-core';
```

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
