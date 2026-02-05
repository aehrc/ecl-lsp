// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { KnowledgeArticle } from './types';

/**
 * Grammar summary and history supplement documentation.
 */
export const grammarArticles: KnowledgeArticle[] = [
  {
    id: 'grammar:structure',
    category: 'grammar',
    name: 'Expression Structure',
    summary: 'Top-level ECL expression grammar rules',
    content: `## Expression Structure
\`\`\`
expressionConstraint = subExpressionConstraint
                     | compoundExpressionConstraint

compoundExpressionConstraint =
    conjunctionExpressionConstraint
  | disjunctionExpressionConstraint
  | exclusionExpressionConstraint

subExpressionConstraint = [constraintOperator] [memberOf] ecl-focusConcept
                          [filterConstraint*] [historySupplement]

ecl-focusConcept = eclConceptReference | wildCard | "(" expressionConstraint ")"
\`\`\``,
    examples: [],
    related: ['grammar:operators', 'grammar:refinements'],
  },
  {
    id: 'grammar:operators',
    category: 'grammar',
    name: 'Constraint Operators Grammar',
    summary: 'Grammar rules for constraint operators',
    content: `## Constraint Operators
\`\`\`
constraintOperator = childOf | childOrSelfOf | descendantOf | descendantOrSelfOf
                   | parentOf | parentOrSelfOf | ancestorOf | ancestorOrSelfOf

descendantOf        = "<"
descendantOrSelfOf  = "<<"
childOf             = "<!"
childOrSelfOf       = "<<!"
ancestorOf          = ">"
ancestorOrSelfOf    = ">>"
parentOf            = ">!"
parentOrSelfOf      = ">>!"
\`\`\``,
    examples: [],
    related: ['grammar:structure'],
  },
  {
    id: 'grammar:concepts',
    category: 'grammar',
    name: 'Concept References Grammar',
    summary: 'Grammar rules for concept references',
    content: `## Concept References
\`\`\`
eclConceptReference = conceptId [ws "|" term "|"]
conceptId           = sctId  (6-18 digit SNOMED identifier)
\`\`\``,
    examples: [],
    related: ['grammar:structure'],
  },
  {
    id: 'grammar:refinements',
    category: 'grammar',
    name: 'Refinements Grammar',
    summary: 'Grammar rules for refinements',
    content: `## Refinements
\`\`\`
eclRefinement = subRefinement (ws conjunctionRefinementSet | ws disjunctionRefinementSet)?
subRefinement = eclAttributeSet | eclAttributeGroup | "(" eclRefinement ")"
eclAttributeGroup = [cardinality] "{" eclAttributeSet "}"
eclAttributeSet = subAttributeSet (ws conjunctionAttributeSet | ws disjunctionAttributeSet)?
eclAttribute = [cardinality] [reverseFlag] eclAttributeName comparisonOperator expressionValue
\`\`\``,
    examples: [],
    related: ['grammar:structure', 'grammar:filters'],
  },
  {
    id: 'grammar:filters',
    category: 'grammar',
    name: 'Filters Grammar',
    summary: 'Grammar rules for filter constraints',
    content: `## Filters
\`\`\`
filterConstraint = "{{" ws filterType ws "}}"
filterType = descriptionFilter | conceptFilter | memberFilter
descriptionFilter = "D" ws descriptionFilterComponent ("," ws descriptionFilterComponent)*
conceptFilter = "C" ws conceptFilterComponent ("," ws conceptFilterComponent)*
memberFilter = "M" ws memberFilterComponent ("," ws memberFilterComponent)*
\`\`\``,
    examples: [],
    related: ['grammar:refinements', 'grammar:history'],
  },
  {
    id: 'grammar:history',
    category: 'grammar',
    name: 'History Supplement Grammar',
    summary: 'Grammar rules for history supplements',
    content: `## History Supplement
\`\`\`
historySupplement = "{{" ws "+" ws historyKeyword [historyProfileSuffix] [ws historySubsetExpression] ws "}}"
historyKeyword = "HISTORY"
historyProfileSuffix = "-MIN" | "-MOD" | "-MAX"
\`\`\``,
    examples: [],
    related: ['grammar:filters'],
  },
  {
    id: 'grammar:logical',
    category: 'grammar',
    name: 'Logical Operators Grammar',
    summary: 'Grammar rules for logical operators',
    content: `## Logical Operators
\`\`\`
conjunction = ws "AND" ws    (case-insensitive)
disjunction = ws "OR" ws     (case-insensitive)
exclusion   = ws "MINUS" ws  (case-insensitive)
\`\`\`

## Operator Precedence
1. Constraint operators (<, <<, >, >>, etc.)
2. Refinement (:)
3. AND/OR/MINUS (left to right, no implicit precedence — use parentheses)`,
    examples: [],
    related: ['grammar:structure'],
  },
];

export const historyArticles: KnowledgeArticle[] = [
  {
    id: 'history:min',
    category: 'history',
    name: 'HISTORY-MIN',
    summary: 'Include only SAME AS historical associations',
    content: `HISTORY-MIN includes concepts with SAME AS associations to inactivated concepts.

\`\`\`ecl
<< 73211009 {{ + HISTORY-MIN }}
\`\`\`

Use when you need strict equivalence mapping only.`,
    examples: ['<< 73211009 {{ + HISTORY-MIN }}'],
    related: ['history:mod', 'history:max'],
  },
  {
    id: 'history:mod',
    category: 'history',
    name: 'HISTORY-MOD',
    summary: 'Include SAME AS + POSSIBLY/PROBABLY EQUIVALENT TO',
    content: `HISTORY-MOD includes SAME AS + POSSIBLY EQUIVALENT TO + PROBABLY EQUIVALENT TO:

\`\`\`ecl
<< 73211009 {{ + HISTORY-MOD }}
\`\`\`

Use for moderate clinical safety — catches likely equivalents.`,
    examples: ['<< 73211009 {{ + HISTORY-MOD }}'],
    related: ['history:min', 'history:max'],
  },
  {
    id: 'history:max',
    category: 'history',
    name: 'HISTORY-MAX',
    summary: 'Include all historical association types',
    content: `HISTORY-MAX includes all association types (SAME AS, POSSIBLY/PROBABLY EQUIVALENT, REPLACED BY, WAS A, ALTERNATIVE, MOVED TO, etc.):

\`\`\`ecl
<< 73211009 {{ + HISTORY-MAX }}
\`\`\`

Use for maximum recall — catches all historically related concepts.`,
    examples: ['<< 73211009 {{ + HISTORY-MAX }}'],
    related: ['history:min', 'history:mod'],
  },
  {
    id: 'history:full',
    category: 'history',
    name: 'HISTORY (Full)',
    summary: 'Include all associations with optional subset filter',
    content: `HISTORY (no suffix) includes all associations, optionally filtered to a subset expression:

\`\`\`ecl
<< 73211009 {{ + HISTORY }}
<< 73211009 {{ + HISTORY (^ 816080008) }}
\`\`\`

The optional subset expression filters which historical associations to include.`,
    examples: ['<< 73211009 {{ + HISTORY }}', '<< 73211009 {{ + HISTORY (^ 816080008) }}'],
    related: ['history:min', 'history:mod', 'history:max'],
  },
  {
    id: 'history:when-to-use',
    category: 'history',
    name: 'When to Use History Supplements',
    summary: 'Clinical guidance for choosing the right history profile',
    content: `## When to Use History Supplements

| Scenario | Recommended Profile |
|----------|-------------------|
| Data warehouse migration | HISTORY-MIN or HISTORY-MOD |
| Clinical decision support | HISTORY-MOD |
| Analytics / reporting | HISTORY-MAX |
| Reference set maintenance | HISTORY with subset filter |
| Drug safety monitoring | HISTORY-MOD |

## Clinical Importance
Without history supplements, ECL queries silently miss data coded with concepts that have since been inactivated. For example, if a diabetes concept was inactivated and replaced, patient records using the old concept would not be found by a standard ECL query for diabetes types.`,
    examples: [],
    related: ['history:min', 'history:mod', 'history:max', 'history:full'],
  },
];
