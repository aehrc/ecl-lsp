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

const terminology = new FhirTerminologyService('https://tx.ontoserver.csiro.au/fhir');
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

### Terminology

```typescript
import { FhirTerminologyService } from '@aehrc/ecl-core';

const fhir = new FhirTerminologyService(
  'https://tx.ontoserver.csiro.au/fhir', // server URL
  2000, // lookup timeout (ms)
  '', // SNOMED version URI (empty = server default)
);

const concept = await fhir.lookupConcept('404684003');
// { id, fsn, pt, active }

const results = await fhir.evaluateEcl('< 404684003');
// { concepts: [...], total }
```

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
