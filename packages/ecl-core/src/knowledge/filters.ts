// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { KnowledgeArticle } from './types';

/**
 * Filter documentation — description, concept, and member filters with sub-properties.
 */
export const filterArticles: KnowledgeArticle[] = [
  {
    id: 'filter:description',
    category: 'filter',
    name: 'Description Filters ({{ D }})',
    summary: 'Filter concepts by their description properties',
    content: `Description filters refine by description text, language, type, and dialect:

\`\`\`ecl
< 404684003 {{ D term = "heart" }}
< 404684003 {{ D term = match:"heart attack" }}
< 404684003 {{ D term = wild:"*heart*" }}
< 404684003 {{ D language = en }}
< 404684003 {{ D typeId = 900000000000003001 }}
< 404684003 {{ D dialectId = 900000000000509007 }}
\`\`\`

### Sub-properties
- **term** — Description text (exact, match, or wild)
- **language** — Language code (en, es, fr, etc.)
- **typeId** — Description type SCTID (FSN, synonym, definition)
- **type** — Shorthand: \`syn\`, \`fsn\`, \`def\`
- **dialectId** — Dialect reference set SCTID
- **dialect** — Shorthand dialect aliases
- **active** — Active status (true/false)`,
    examples: [
      '< 404684003 {{ D term = "heart" }}',
      '< 404684003 {{ D term = match:"chest pain" }}',
      '< 404684003 {{ D language = en }}',
    ],
    related: ['filter:concept', 'filter:member'],
  },
  {
    id: 'filter:concept',
    category: 'filter',
    name: 'Concept Filters ({{ C }})',
    summary: 'Filter concepts by their concept-level properties',
    content: `Concept filters refine by definition status, module, active status, and effective time:

\`\`\`ecl
< 404684003 {{ C definitionStatusId = 900000000000074008 }}
< 404684003 {{ C moduleId = 900000000000207008 }}
< 404684003 {{ C active = true }}
< 404684003 {{ C effectiveTime >= "20200101" }}
\`\`\`

### Sub-properties
- **definitionStatusId** — Primitive (900000000000074008) vs Fully Defined (900000000000073002)
- **moduleId** — Module membership
- **active** — Active status (true/false)
- **effectiveTime** — Release date (supports >, <, >=, <=)`,
    examples: ['<< 73211009 {{ C active = true }}', '< 404684003 {{ C definitionStatusId = 900000000000074008 }}'],
    related: ['filter:description', 'filter:member'],
  },
  {
    id: 'filter:member',
    category: 'filter',
    name: 'Member Filters ({{ M }})',
    summary: 'Filter reference set members by their membership properties',
    content: `Member filters refine reference set membership by module, active status, and additional fields:

\`\`\`ecl
^ 816080008 {{ M moduleId = 900000000000207008 }}
^ 816080008 {{ M active = true }}
\`\`\`

### Sub-properties
- **moduleId** — Module of the refset member
- **active** — Active status of membership
- **effectiveTime** — When the membership was asserted
- Any additional refset field as a member field filter`,
    examples: ['^ 816080008 {{ M moduleId = 900000000000207008 }}', '^ 816080008 {{ M active = true }}'],
    related: ['filter:description', 'filter:concept'],
  },
  {
    id: 'filter:combining',
    category: 'filter',
    name: 'Combining Filters',
    summary: 'Chain multiple filter blocks and use commas within blocks',
    content: `Multiple filter blocks can be chained. Within a block, use commas for AND logic:

\`\`\`ecl
< 404684003 {{ D term = "heart", language = en }} {{ C active = true }}
\`\`\`

This finds clinical findings with an English description containing "heart" that are also active concepts.`,
    examples: ['< 404684003 {{ D term = "heart", language = en }} {{ C active = true }}'],
    related: ['filter:description', 'filter:concept', 'filter:member'],
  },
];
