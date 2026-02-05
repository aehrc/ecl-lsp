// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { KnowledgeArticle } from './types';

/**
 * Refinement documentation — attributes, groups, cardinality, reverse, common attributes.
 */
export const refinementArticles: KnowledgeArticle[] = [
  {
    id: 'ref:basic',
    category: 'refinement',
    name: 'Basic Refinement',
    summary: 'Constrain concepts by a single attribute-value pair',
    content: `The colon (\`:\`) separates the focus concept from attribute constraints.

\`\`\`ecl
<< 404684003 : 363698007 |Finding site| = << 39057004 |Pulmonary structure|
\`\`\`

This finds all clinical findings with a finding site that is a pulmonary structure.`,
    examples: ['<< 404684003 : 363698007 = << 39057004'],
    related: ['ref:multipleAttributes', 'ref:groups'],
  },
  {
    id: 'ref:multipleAttributes',
    category: 'refinement',
    name: 'Multiple Attributes',
    summary: 'Combine multiple attribute constraints with AND/OR',
    content: `Multiple attribute constraints can be combined with AND or OR:

\`\`\`ecl
<< 404684003 :
  363698007 |Finding site| = << 39057004 AND
  116676008 |Associated morphology| = << 55641003 |Infarct|
\`\`\`

AND means both attributes must be present (but may be in different relationship groups).
OR means at least one attribute must match.`,
    examples: ['<< 404684003 : 363698007 = << 39057004 AND 116676008 = << 55641003'],
    related: ['ref:basic', 'ref:groups'],
  },
  {
    id: 'ref:groups',
    category: 'refinement',
    name: 'Attribute Groups',
    summary: 'Group attributes that must co-occur in the same relationship group',
    content: `Curly braces group attributes that must co-occur in the same relationship group:

\`\`\`ecl
<< 404684003 : {
  363698007 |Finding site| = << 39057004,
  116676008 |Associated morphology| = << 55641003
}
\`\`\`

Without grouping, SNOMED CT might match concepts where the attributes exist in different groups. Grouping ensures they appear together.`,
    examples: ['<< 404684003 : { 363698007 = << 39057004, 116676008 = << 55641003 }'],
    related: ['ref:multipleAttributes', 'ref:cardinality'],
  },
  {
    id: 'ref:cardinality',
    category: 'refinement',
    name: 'Cardinality',
    summary: 'Constrain how many times an attribute or group can occur',
    content: `Cardinality constrains attribute or group occurrence count:

\`\`\`ecl
<< 404684003 : [1..3] 363698007 = << 39057004
\`\`\`

Common patterns:
- \`[0..0]\` — attribute must NOT exist
- \`[1..*]\` — at least one occurrence
- \`[2..2]\` — exactly two occurrences
- \`[0..1]\` — zero or one occurrence`,
    examples: ['<< 404684003 : [1..3] 363698007 = << 39057004', '<< 404684003 : [0..0] 246075003 = *'],
    related: ['ref:basic', 'ref:groups'],
  },
  {
    id: 'ref:reverse',
    category: 'refinement',
    name: 'Reverse Attributes',
    summary: 'Reverse the direction of attribute lookup with R',
    content: `The \`R\` flag reverses the attribute direction — finds concepts that are the VALUE of the attribute, rather than having the attribute:

\`\`\`ecl
<< 404684003 : R 246075003 |Causative agent| = << 387517004
\`\`\`

This finds concepts where the specified concept appears as the causative agent value.`,
    examples: ['<< 404684003 : R 246075003 = << 387517004'],
    related: ['ref:basic'],
  },
  {
    id: 'ref:nested',
    category: 'refinement',
    name: 'Nested Refinements',
    summary: 'Use a constrained expression as an attribute value',
    content: `Attribute values can be constrained expressions with their own refinements:

\`\`\`ecl
<< 404684003 : 363698007 = (<< 39057004 : 272741003 = << 7771000)
\`\`\`

The parenthesized sub-expression on the right side of the equals is itself a refined expression.`,
    examples: ['<< 404684003 : 363698007 = (<< 39057004 : 272741003 = << 7771000)'],
    related: ['ref:basic', 'ref:groups'],
  },
  {
    id: 'ref:commonAttributes',
    category: 'refinement',
    name: 'Common SNOMED CT Attributes',
    summary: 'Frequently used SNOMED CT attributes for refinements',
    content: `Common SNOMED CT attributes:

| SCTID | Name | Usage |
|-------|------|-------|
| 363698007 | Finding site | Body structure where finding occurs |
| 116676008 | Associated morphology | Morphological abnormality |
| 246075003 | Causative agent | Substance/organism causing condition |
| 370135005 | Pathological process | Underlying pathological process |
| 363714003 | Interprets | Observable entity being interpreted |
| 363713009 | Has interpretation | Interpretation of observable |
| 411116001 | Has dose form | Pharmaceutical dose form |
| 127489000 | Has active ingredient | Active ingredient of medication |
| 363704007 | Procedure site | Where a procedure is performed |
| 260686004 | Method | Technique used in a procedure |
| 405813007 | Procedure device | Device used in a procedure |`,
    examples: [],
    related: ['ref:basic'],
  },
];
