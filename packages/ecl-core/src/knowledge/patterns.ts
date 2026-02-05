// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { KnowledgeArticle } from './types';

/**
 * Common ECL patterns for typical clinical terminology tasks.
 */
export const patternArticles: KnowledgeArticle[] = [
  {
    id: 'pattern:disorders-by-site',
    category: 'pattern',
    name: 'Disorders by Body Site',
    summary: 'Find all disorders affecting a specific body site',
    content: `Find disorders by their anatomical finding site:

\`\`\`ecl
<< 404684003 |Clinical finding| :
  363698007 |Finding site| = << 80891009 |Heart structure|
\`\`\``,
    examples: [
      '<< 404684003 : 363698007 = << 80891009 |Heart structure|',
      '<< 404684003 : 363698007 = << 39057004 |Pulmonary structure|',
    ],
    related: ['pattern:medications', 'pattern:procedures'],
  },
  {
    id: 'pattern:medications',
    category: 'pattern',
    name: 'Medications by Ingredient',
    summary: 'Find medications containing a specific active ingredient',
    content: `Find medicinal products by their active ingredient:

\`\`\`ecl
<< 763158003 |Medicinal product| :
  127489000 |Has active ingredient| = << 387517004 |Paracetamol|
\`\`\``,
    examples: [
      '<< 763158003 : 127489000 = << 387517004 |Paracetamol|',
      '<< 763158003 : 127489000 = << 372687004 |Amoxicillin|',
    ],
    related: ['pattern:disorders-by-site', 'pattern:procedures'],
  },
  {
    id: 'pattern:procedures',
    category: 'pattern',
    name: 'Procedures by Site',
    summary: 'Find procedures performed on a specific body site',
    content: `Find procedures by their procedure site:

\`\`\`ecl
<< 71388002 |Procedure| :
  363704007 |Procedure site| = << 80891009 |Heart structure|
\`\`\``,
    examples: [
      '<< 71388002 : 363704007 = << 80891009 |Heart structure|',
      '<< 71388002 : 363704007 = << 39057004 |Pulmonary structure|',
    ],
    related: ['pattern:disorders-by-site', 'pattern:medications'],
  },
  {
    id: 'pattern:combine-conditions',
    category: 'pattern',
    name: 'Combine Conditions',
    summary: 'Unite multiple concept sets with OR',
    content: `Combine conditions affecting different body sites:

\`\`\`ecl
(<< 404684003 : 363698007 = << 39057004 |Pulmonary structure|)
OR
(<< 404684003 : 363698007 = << 80891009 |Heart structure|)
\`\`\``,
    examples: ['(<< 404684003 : 363698007 = << 39057004) OR (<< 404684003 : 363698007 = << 80891009)'],
    related: ['pattern:exclude-subset'],
  },
  {
    id: 'pattern:exclude-subset',
    category: 'pattern',
    name: 'Exclude a Subset',
    summary: 'Remove specific concepts from a broader set with MINUS',
    content: `Exclude a subset from a broader concept set:

\`\`\`ecl
<< 73211009 |Diabetes mellitus|
MINUS
<< 46635009 |Type 1 diabetes|
\`\`\``,
    examples: ['<< 73211009 MINUS << 46635009'],
    related: ['pattern:combine-conditions'],
  },
  {
    id: 'pattern:reference-sets',
    category: 'pattern',
    name: 'Reference Set Members',
    summary: 'Find all concepts in a reference set',
    content: `Get all members of a reference set:

\`\`\`ecl
^ 816080008 |International Patient Summary|
\`\`\``,
    examples: ['^ 816080008 |International Patient Summary|'],
    related: ['pattern:text-search'],
  },
  {
    id: 'pattern:text-search',
    category: 'pattern',
    name: 'Search by Description Text',
    summary: 'Find concepts by matching description text',
    content: `Search descriptions for matching text:

\`\`\`ecl
< 404684003 {{ D term = match:"chest pain" }}
\`\`\`

Three matching modes:
- Exact: \`term = "chest pain"\`
- Match (tokenized): \`term = match:"chest pain"\`
- Wildcard: \`term = wild:"*chest*"\``,
    examples: ['< 404684003 {{ D term = match:"chest pain" }}', '<< 73211009 {{ D term = wild:"*diabet*" }}'],
    related: ['pattern:active-only'],
  },
  {
    id: 'pattern:active-only',
    category: 'pattern',
    name: 'Active Concepts Only',
    summary: 'Filter to include only active concepts',
    content: `Restrict results to active concepts:

\`\`\`ecl
<< 73211009 {{ C active = true }}
\`\`\``,
    examples: ['<< 73211009 {{ C active = true }}'],
    related: ['pattern:text-search'],
  },
  {
    id: 'pattern:complex-grouped',
    category: 'pattern',
    name: 'Complex Grouped Refinement',
    summary: 'Find concepts with grouped attribute combinations',
    content: `Infectious diseases caused by bacteria affecting lungs — attributes grouped to ensure co-occurrence:

\`\`\`ecl
<< 40733004 |Infectious disease| :
  {
    246075003 |Causative agent| = << 409822003 |Domain Bacteria|,
    363698007 |Finding site| = << 39057004 |Pulmonary structure|
  }
\`\`\``,
    examples: ['<< 40733004 : { 246075003 = << 409822003, 363698007 = << 39057004 }'],
    related: ['pattern:disorders-by-site'],
  },
  {
    id: 'pattern:history-supplement',
    category: 'pattern',
    name: 'Include Historical Associations',
    summary: 'Extend queries to include historical concept mappings',
    content: `Use history supplements to catch data coded with inactivated concepts:

\`\`\`ecl
<< 73211009 {{ + HISTORY-MIN }}
\`\`\`

Profiles:
- **HISTORY-MIN** — SAME AS associations only
- **HISTORY-MOD** — + POSSIBLY/PROBABLY EQUIVALENT TO
- **HISTORY-MAX** — All association types
- **HISTORY** — All, with optional subset filter`,
    examples: ['<< 73211009 {{ + HISTORY-MIN }}', '<< 73211009 {{ + HISTORY-MOD }}'],
    related: [],
  },
];
