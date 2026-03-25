// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { KnowledgeArticle, OperatorHoverDoc } from './types';

/**
 * All 15+ ECL operators with meanings, syntax, and examples.
 */
export const operatorArticles: KnowledgeArticle[] = [
  {
    id: 'op:selfOf',
    category: 'operator',
    name: 'Self (Concept Reference)',
    summary: 'Matches the exact concept only',
    content: `A bare concept reference (no constraint operator) matches only the concept itself.

\`\`\`ecl
404684003 |Clinical finding|
\`\`\`

This is the most specific constraint — it returns exactly one concept.`,
    examples: ['404684003 |Clinical finding|', '73211009 |Diabetes mellitus|'],
    related: ['op:descendantOrSelfOf'],
  },
  {
    id: 'op:descendantOf',
    category: 'operator',
    name: 'Descendant Of (<)',
    summary: 'All descendants, excluding the concept itself',
    content: `The \`<\` operator matches all descendants (children, grandchildren, etc.) of the specified concept, **excluding** the concept itself.

\`\`\`ecl
< 404684003 |Clinical finding|
\`\`\`

This returns all clinical findings in SNOMED CT but NOT the root "Clinical finding" concept.`,
    examples: ['< 404684003 |Clinical finding|', '< 19829001 |Disorder of lung|'],
    related: ['op:descendantOrSelfOf', 'op:childOf', 'op:ancestorOf'],
  },
  {
    id: 'op:descendantOrSelfOf',
    category: 'operator',
    name: 'Descendant Or Self Of (<<)',
    summary: 'All descendants including the concept itself',
    content: `The \`<<\` operator matches all descendants of the specified concept **including** the concept itself.

\`\`\`ecl
<< 404684003 |Clinical finding|
\`\`\`

This is the most commonly used operator. Use it when you want "this concept and all its subtypes".`,
    examples: ['<< 73211009 |Diabetes mellitus|', '<< 19829001 |Disorder of lung|'],
    related: ['op:descendantOf', 'op:childOrSelfOf'],
  },
  {
    id: 'op:childOf',
    category: 'operator',
    name: 'Child Of (<!)',
    summary: 'Immediate children only (one level down)',
    content: `The \`<!\` operator matches only the **direct children** (one level below) of the specified concept.

\`\`\`ecl
<! 404684003 |Clinical finding|
\`\`\`

Unlike \`<\`, this does not recurse into grandchildren and deeper descendants.`,
    examples: ['<! 404684003 |Clinical finding|'],
    related: ['op:descendantOf', 'op:childOrSelfOf', 'op:parentOf'],
  },
  {
    id: 'op:childOrSelfOf',
    category: 'operator',
    name: 'Child Or Self Of (<<!)',
    summary: 'Direct children plus the concept itself',
    content: `The \`<<!\` operator matches the **direct children** plus the concept itself.

\`\`\`ecl
<<! 404684003 |Clinical finding|
\`\`\``,
    examples: ['<<! 404684003 |Clinical finding|'],
    related: ['op:childOf', 'op:descendantOrSelfOf'],
  },
  {
    id: 'op:ancestorOf',
    category: 'operator',
    name: 'Ancestor Of (>)',
    summary: 'All ancestors, excluding the concept itself',
    content: `The \`>\` operator matches all ancestors (parents, grandparents, etc.) of the specified concept, **excluding** the concept itself.

\`\`\`ecl
> 404684003 |Clinical finding|
\`\`\`

This navigates up the hierarchy to find broader concepts.`,
    examples: ['> 404684003 |Clinical finding|', '> 19829001 |Disorder of lung|'],
    related: ['op:ancestorOrSelfOf', 'op:parentOf', 'op:descendantOf'],
  },
  {
    id: 'op:ancestorOrSelfOf',
    category: 'operator',
    name: 'Ancestor Or Self Of (>>)',
    summary: 'All ancestors including the concept itself',
    content: `The \`>>\` operator matches all ancestors of the specified concept **including** the concept itself.

\`\`\`ecl
>> 19829001 |Disorder of lung|
\`\`\``,
    examples: ['>> 19829001 |Disorder of lung|'],
    related: ['op:ancestorOf', 'op:parentOrSelfOf'],
  },
  {
    id: 'op:parentOf',
    category: 'operator',
    name: 'Parent Of (>!)',
    summary: 'Immediate parents only (one level up)',
    content: `The \`>!\` operator matches only the **direct parents** (one level above) of the specified concept.

\`\`\`ecl
>! 19829001 |Disorder of lung|
\`\`\`

Unlike \`>\`, this does not recurse into grandparents and higher ancestors.`,
    examples: ['>! 19829001 |Disorder of lung|'],
    related: ['op:ancestorOf', 'op:parentOrSelfOf', 'op:childOf'],
  },
  {
    id: 'op:parentOrSelfOf',
    category: 'operator',
    name: 'Parent Or Self Of (>>!)',
    summary: 'Direct parents plus the concept itself',
    content: `The \`>>!\` operator matches the **direct parents** plus the concept itself.

\`\`\`ecl
>>! 19829001 |Disorder of lung|
\`\`\``,
    examples: ['>>! 19829001 |Disorder of lung|'],
    related: ['op:parentOf', 'op:ancestorOrSelfOf'],
  },
  {
    id: 'op:memberOf',
    category: 'operator',
    name: 'Member Of (^)',
    summary: 'All concepts in a reference set',
    content: `The \`^\` operator matches all members of the specified reference set.

\`\`\`ecl
^ 816080008 |International Patient Summary|
\`\`\`

Reference sets are curated lists of concepts used for specific purposes (e.g., value sets, maps, clinical subsets).`,
    examples: ['^ 816080008 |International Patient Summary|', '^ 900000000000497000 |CTV3 simple map|'],
    related: ['op:wildcard'],
  },
  {
    id: 'op:wildcard',
    category: 'operator',
    name: 'Any Concept (*)',
    summary: 'Matches any active concept',
    content: `The wildcard \`*\` matches any active concept in the code system.

\`\`\`ecl
*
\`\`\`

Useful in refinements to match any attribute value:
\`\`\`ecl
<< 404684003 : 363698007 = *
\`\`\``,
    examples: ['*', '<< 404684003 : 363698007 = *'],
    related: ['op:descendantOrSelfOf'],
  },
  {
    id: 'op:top',
    category: 'operator',
    name: 'Top (!!>)',
    summary: 'The root concept (SNOMED CT Concept)',
    content: `The \`!!>\` operator matches the root concept (SNOMED CT Concept 138875005).

\`\`\`ecl
!!>
\`\`\``,
    examples: ['!!>'],
    related: ['op:bottom'],
  },
  {
    id: 'op:bottom',
    category: 'operator',
    name: 'Bottom (!!<)',
    summary: 'Leaf concepts (no children)',
    content: `The \`!!<\` operator matches leaf concepts — concepts that have no children.

\`\`\`ecl
!!<
\`\`\``,
    examples: ['!!<'],
    related: ['op:top'],
  },
  {
    id: 'op:and',
    category: 'operator',
    name: 'AND (Conjunction)',
    summary: 'Both conditions must be satisfied',
    content: `The \`AND\` operator computes the **intersection** of two concept sets.

\`\`\`ecl
< 404684003 |Clinical finding| AND < 19829001 |Disorder|
\`\`\`

Case-insensitive: \`AND\`, \`and\`, \`And\` are all equivalent.`,
    examples: ['< 404684003 AND < 19829001', '<< 73211009 AND << 46635009'],
    related: ['op:or', 'op:minus'],
  },
  {
    id: 'op:or',
    category: 'operator',
    name: 'OR (Disjunction)',
    summary: 'Either condition may be satisfied',
    content: `The \`OR\` operator computes the **union** of two concept sets.

\`\`\`ecl
< 19829001 |Disorder of lung| OR < 301867009 |Edema|
\`\`\`

Case-insensitive: \`OR\`, \`or\`, \`Or\` are all equivalent.`,
    examples: ['< 19829001 OR < 73211009', '(<< 404684003) OR (<< 71388002)'],
    related: ['op:and', 'op:minus'],
  },
  {
    id: 'op:minus',
    category: 'operator',
    name: 'MINUS (Exclusion)',
    summary: 'First set excluding the second set',
    content: `The \`MINUS\` operator computes the **set difference** — concepts in the first set that are NOT in the second.

\`\`\`ecl
< 404684003 |Clinical finding| MINUS < 19829001 |Disorder|
\`\`\`

Case-insensitive: \`MINUS\`, \`minus\`, \`Minus\` are all equivalent.`,
    examples: ['<< 73211009 MINUS << 46635009', '< 404684003 |Clinical finding| MINUS < 19829001 |Disorder|'],
    related: ['op:and', 'op:or'],
  },
  {
    id: 'op:refinement',
    category: 'operator',
    name: 'Refinement (:)',
    summary: 'Constrain by attribute-value relationships',
    content: `The colon \`:\` separates the focus concept from attribute constraints (refinements).

\`\`\`ecl
< 404684003 : 363698007 |Finding site| = < 39057004
\`\`\`

Refinements allow filtering concepts by their defining relationships.`,
    examples: ['<< 404684003 : 363698007 = << 39057004', '<< 71388002 : 363704007 = << 80891009'],
    related: ['op:and', 'op:or'],
  },
];

/**
 * Hover documentation for all operators — concise markdown for IDE tooltips.
 */
export const operatorHoverDocs: OperatorHoverDoc[] = [
  {
    operator: '<',
    markdown:
      '**Descendant Of**\n\nMatches all descendants (children, grandchildren, etc.) of the specified concept, excluding the concept itself.\n\n**Example:**\n```ecl\n< 404684003 |Clinical finding|\n```',
  },
  {
    operator: '<<',
    markdown:
      '**Descendant Or Self Of**\n\nMatches all descendants of the specified concept, including the concept itself.\n\n**Example:**\n```ecl\n<< 19829001 |Disorder of lung|\n```',
  },
  {
    operator: '<!',
    markdown:
      '**Child Of**\n\nMatches immediate children only (one level below the specified concept).\n\n**Example:**\n```ecl\n<! 404684003 |Clinical finding|\n```',
  },
  {
    operator: '<<!',
    markdown:
      '**Child Or Self Of**\n\nMatches immediate children plus the concept itself.\n\n**Example:**\n```ecl\n<<! 404684003 |Clinical finding|\n```',
  },
  {
    operator: '>',
    markdown:
      '**Ancestor Of**\n\nMatches all ancestors (parents, grandparents, etc.) of the specified concept, excluding the concept itself.\n\n**Example:**\n```ecl\n> 404684003 |Clinical finding|\n```',
  },
  {
    operator: '>>',
    markdown:
      '**Ancestor Or Self Of**\n\nMatches all ancestors of the specified concept, including the concept itself.\n\n**Example:**\n```ecl\n>> 19829001 |Disorder of lung|\n```',
  },
  {
    operator: '>!',
    markdown:
      '**Parent Of**\n\nMatches immediate parents only (one level above the specified concept).\n\n**Example:**\n```ecl\n>! 19829001 |Disorder of lung|\n```',
  },
  {
    operator: '>>!',
    markdown:
      '**Parent Or Self Of**\n\nMatches immediate parents plus the concept itself.\n\n**Example:**\n```ecl\n>>! 19829001 |Disorder of lung|\n```',
  },
  {
    operator: '^',
    markdown:
      '**Member Of**\n\nMatches members of the specified reference set.\n\n**Example:**\n```ecl\n^ 900000000000497000 |CTV3 simple map|\n```',
  },
  {
    operator: '!!>',
    markdown: '**Top**\n\nMatches the root concept (SNOMED CT Concept 138875005).\n\n**Example:**\n```ecl\n!!>\n```',
  },
  {
    operator: '!!<',
    markdown: '**Bottom**\n\nMatches leaf concepts (concepts with no children).\n\n**Example:**\n```ecl\n!!<\n```',
  },
  {
    operator: 'AND',
    markdown:
      '**Logical AND**\n\nCombines two constraints - both must be satisfied.\n\n**Example:**\n```ecl\n< 404684003 |Clinical finding| AND < 19829001 |Disorder|\n```',
  },
  {
    operator: 'OR',
    markdown:
      '**Logical OR**\n\nCombines two constraints - at least one must be satisfied.\n\n**Example:**\n```ecl\n< 19829001 |Disorder of lung| OR < 301867009 |Edema|\n```',
  },
  {
    operator: 'MINUS',
    markdown:
      '**Exclusion (MINUS)**\n\nExcludes concepts that match the right operand from the left operand.\n\n**Example:**\n```ecl\n< 404684003 |Clinical finding| MINUS < 19829001 |Disorder|\n```',
  },
  {
    operator: ':',
    markdown:
      '**Refinement**\n\nRefines a concept by specifying attribute-value pairs.\n\n**Example:**\n```ecl\n< 404684003 : 363698007 |Finding site| = < 39057004\n```',
  },
];
