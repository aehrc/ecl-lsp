// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Context-specific completion item constants for ECL 2.2
//
// Organised by category with consistent sortText prefixes:
//   a- operators, b- keywords, c- filter openers, d- filter keywords,
//   e- value tokens, f- concept search

import type { CoreCompletionItem } from '../types';

// ── Constraint operators ─────────────────────────────────────────────────

export const descendantOf: CoreCompletionItem = {
  label: '<',
  kind: 'operator',
  detail: 'Descendant of',
  documentation: 'Matches all descendants (children, grandchildren, etc.) excluding the concept itself',
  sortText: 'a-01',
};

export const descendantOrSelfOf: CoreCompletionItem = {
  label: '<<',
  kind: 'operator',
  detail: 'Descendant or self of',
  documentation: 'Matches all descendants including the concept itself',
  sortText: 'a-02',
};

export const ancestorOf: CoreCompletionItem = {
  label: '>',
  kind: 'operator',
  detail: 'Ancestor of',
  documentation: 'Matches all ancestors (parents, grandparents, etc.) excluding the concept itself',
  sortText: 'a-03',
};

export const ancestorOrSelfOf: CoreCompletionItem = {
  label: '>>',
  kind: 'operator',
  detail: 'Ancestor or self of',
  documentation: 'Matches all ancestors including the concept itself',
  sortText: 'a-04',
};

export const childOf: CoreCompletionItem = {
  label: '<!',
  kind: 'operator',
  detail: 'Child of',
  documentation: 'Matches only direct children (one level below)',
  sortText: 'a-05',
};

export const childOrSelfOf: CoreCompletionItem = {
  label: '<<!',
  kind: 'operator',
  detail: 'Child or self of',
  documentation: 'Matches direct children including the concept itself',
  sortText: 'a-06',
};

export const parentOf: CoreCompletionItem = {
  label: '>!',
  kind: 'operator',
  detail: 'Parent of',
  documentation: 'Matches only direct parents (one level above)',
  sortText: 'a-07',
};

export const parentOrSelfOf: CoreCompletionItem = {
  label: '>>!',
  kind: 'operator',
  detail: 'Parent or self of',
  documentation: 'Matches direct parents including the concept itself',
  sortText: 'a-08',
};

export const memberOf: CoreCompletionItem = {
  label: '^',
  kind: 'operator',
  detail: 'Member of (reference set)',
  documentation: 'Matches concepts that are members of the specified reference set',
  sortText: 'a-09',
};

export const top: CoreCompletionItem = {
  label: '!!>',
  kind: 'operator',
  detail: 'Top (root concept)',
  documentation: 'Matches the root concept (SNOMED CT Concept)',
  sortText: 'a-10',
};

export const bottom: CoreCompletionItem = {
  label: '!!<',
  kind: 'operator',
  detail: 'Bottom (leaf concepts)',
  documentation: 'Matches leaf concepts with no children',
  sortText: 'a-11',
};

/** All constraint operators — offered at expression start and after logical operators. */
export const constraintOperators: CoreCompletionItem[] = [
  descendantOf,
  descendantOrSelfOf,
  ancestorOf,
  ancestorOrSelfOf,
  childOf,
  childOrSelfOf,
  parentOf,
  parentOrSelfOf,
  memberOf,
  top,
  bottom,
];

// ── Logical operators / keywords ─────────────────────────────────────────

export const andOperator: CoreCompletionItem = {
  label: 'AND',
  kind: 'keyword',
  detail: 'Logical AND operator',
  documentation: 'Combines two constraints — both must be satisfied',
  sortText: 'b-01',
};

export const orOperator: CoreCompletionItem = {
  label: 'OR',
  kind: 'keyword',
  detail: 'Logical OR operator',
  documentation: 'Combines two constraints — at least one must be satisfied',
  sortText: 'b-02',
};

export const minusOperator: CoreCompletionItem = {
  label: 'MINUS',
  kind: 'keyword',
  detail: 'Exclusion operator',
  documentation: 'Excludes concepts matching the right operand',
  sortText: 'b-03',
};

export const refinementColon: CoreCompletionItem = {
  label: ':',
  kind: 'keyword',
  detail: 'Refinement separator',
  documentation: 'Start a refinement — constrain by attribute values',
  sortText: 'b-04',
};

export const dotNotation: CoreCompletionItem = {
  label: '.',
  kind: 'keyword',
  detail: 'Dot notation (attribute traversal)',
  documentation: 'Traverse to attribute values of the matched concepts',
  sortText: 'b-05',
};

// ── Comparison operators ─────────────────────────────────────────────────

export const equalsOperator: CoreCompletionItem = {
  label: '=',
  kind: 'operator',
  detail: 'Equals',
  documentation: 'Attribute value must match the specified constraint',
  sortText: 'a-20',
};

export const notEqualsOperator: CoreCompletionItem = {
  label: '!=',
  kind: 'operator',
  detail: 'Not equals',
  documentation: 'Attribute value must NOT match the specified constraint',
  sortText: 'a-21',
};

// ── Refinement items ─────────────────────────────────────────────────────

export const reverseFlag: CoreCompletionItem = {
  label: 'R',
  kind: 'keyword',
  detail: 'Reverse flag',
  documentation: 'Reverse the direction of the attribute relationship (find source concepts)',
  sortText: 'b-10',
};

export const wildcardValue: CoreCompletionItem = {
  label: '*',
  kind: 'keyword',
  detail: 'Any value (wildcard)',
  documentation: 'Matches any attribute value',
  sortText: 'b-11',
};

export const attributeGroup: CoreCompletionItem = {
  label: '{ }',
  kind: 'snippet',
  detail: 'Attribute group',
  documentation: 'Group attributes together — co-occurring in the same relationship group',
  insertText: '{ ${1} }',
  insertTextFormat: 'snippet',
  sortText: 'b-12',
};

// ── Cardinality snippets ─────────────────────────────────────────────────

export const cardinality_0_0: CoreCompletionItem = {
  label: '[0..0]',
  kind: 'snippet',
  detail: 'Cardinality: exactly 0 (absence)',
  documentation: 'Attribute must NOT be present',
  insertText: '[${1:0}..${2:0}]',
  insertTextFormat: 'snippet',
  sortText: 'b-20',
};

export const cardinality_0_1: CoreCompletionItem = {
  label: '[0..1]',
  kind: 'snippet',
  detail: 'Cardinality: 0 or 1 (optional)',
  documentation: 'Attribute may appear at most once',
  insertText: '[${1:0}..${2:1}]',
  insertTextFormat: 'snippet',
  sortText: 'b-21',
};

export const cardinality_0_many: CoreCompletionItem = {
  label: '[0..*]',
  kind: 'snippet',
  detail: 'Cardinality: 0 or more',
  documentation: 'Attribute may appear any number of times',
  insertText: '[${1:0}..${2:*}]',
  insertTextFormat: 'snippet',
  sortText: 'b-22',
};

export const cardinality_1_1: CoreCompletionItem = {
  label: '[1..1]',
  kind: 'snippet',
  detail: 'Cardinality: exactly 1',
  documentation: 'Attribute must appear exactly once',
  insertText: '[${1:1}..${2:1}]',
  insertTextFormat: 'snippet',
  sortText: 'b-23',
};

export const cardinality_1_many: CoreCompletionItem = {
  label: '[1..*]',
  kind: 'snippet',
  detail: 'Cardinality: 1 or more (default)',
  documentation: 'Attribute must appear at least once (default)',
  insertText: '[${1:1}..${2:*}]',
  insertTextFormat: 'snippet',
  sortText: 'b-19',
};

export const cardinalitySnippets: CoreCompletionItem[] = [
  cardinality_1_many,
  cardinality_0_0,
  cardinality_0_1,
  cardinality_0_many,
  cardinality_1_1,
];

// ── Filter openers ───────────────────────────────────────────────────────

export const filterDescription: CoreCompletionItem = {
  label: '{{ D',
  kind: 'keyword',
  detail: 'Description filter',
  documentation: 'Filter by description properties (term, type, language, etc.)',
  insertText: '{{ D ${1} }}',
  insertTextFormat: 'snippet',
  sortText: 'c-01',
};

export const filterConcept: CoreCompletionItem = {
  label: '{{ C',
  kind: 'keyword',
  detail: 'Concept filter',
  documentation: 'Filter by concept properties (definitionStatus, moduleId, etc.)',
  insertText: '{{ C ${1} }}',
  insertTextFormat: 'snippet',
  sortText: 'c-02',
};

export const filterMember: CoreCompletionItem = {
  label: '{{ M',
  kind: 'keyword',
  detail: 'Member filter',
  documentation: 'Filter by reference set member properties (moduleId, active, etc.)',
  insertText: '{{ M ${1} }}',
  insertTextFormat: 'snippet',
  sortText: 'c-03',
};

export const historySupplement: CoreCompletionItem = {
  label: '{{ +',
  kind: 'keyword',
  detail: 'History supplement',
  documentation: 'Include historical associations for inactive concepts',
  insertText: '{{ + ${1|HISTORY,HISTORY-MIN,HISTORY-MOD,HISTORY-MAX|} }}',
  insertTextFormat: 'snippet',
  sortText: 'c-04',
};

export const filterOpeners: CoreCompletionItem[] = [filterDescription, filterConcept, filterMember, historySupplement];

// ── Description filter keywords ──────────────────────────────────────────

export const descriptionFilterKeywords: CoreCompletionItem[] = [
  { label: 'term', kind: 'property', detail: 'Description term text', sortText: 'd-01' },
  {
    label: 'type',
    kind: 'property',
    detail: 'Description type (syn/fsn/def)',
    sortText: 'd-02',
  },
  {
    label: 'typeId',
    kind: 'property',
    detail: 'Description type concept ID',
    sortText: 'd-03',
  },
  {
    label: 'language',
    kind: 'property',
    detail: 'Description language code',
    sortText: 'd-04',
  },
  {
    label: 'dialect',
    kind: 'property',
    detail: 'Dialect alias (e.g., en-gb)',
    sortText: 'd-05',
  },
  {
    label: 'dialectId',
    kind: 'property',
    detail: 'Dialect reference set concept ID',
    sortText: 'd-06',
  },
  { label: 'moduleId', kind: 'property', detail: 'Module concept ID', sortText: 'd-07' },
  {
    label: 'effectiveTime',
    kind: 'property',
    detail: 'Effective time (YYYYMMDD)',
    sortText: 'd-08',
  },
  {
    label: 'active',
    kind: 'property',
    detail: 'Active status (true/false/1/0)',
    sortText: 'd-09',
  },
  { label: 'id', kind: 'property', detail: 'Description SCTID', sortText: 'd-10' },
];

// ── Concept filter keywords ──────────────────────────────────────────────

export const conceptFilterKeywords: CoreCompletionItem[] = [
  {
    label: 'definitionStatus',
    kind: 'property',
    detail: 'Definition status (primitive/defined)',
    sortText: 'd-01',
  },
  {
    label: 'definitionStatusId',
    kind: 'property',
    detail: 'Definition status concept ID',
    sortText: 'd-02',
  },
  { label: 'moduleId', kind: 'property', detail: 'Module concept ID', sortText: 'd-03' },
  {
    label: 'effectiveTime',
    kind: 'property',
    detail: 'Effective time (YYYYMMDD)',
    sortText: 'd-04',
  },
  {
    label: 'active',
    kind: 'property',
    detail: 'Active status (true/false/1/0)',
    sortText: 'd-05',
  },
];

// ── Member filter keywords ───────────────────────────────────────────────

export const memberFilterKeywords: CoreCompletionItem[] = [
  { label: 'moduleId', kind: 'property', detail: 'Module concept ID', sortText: 'd-01' },
  {
    label: 'effectiveTime',
    kind: 'property',
    detail: 'Effective time (YYYYMMDD)',
    sortText: 'd-02',
  },
  {
    label: 'active',
    kind: 'property',
    detail: 'Active status (true/false/1/0)',
    sortText: 'd-03',
  },
];

// ── History supplement completions ───────────────────────────────────────

export const historyCompletions: CoreCompletionItem[] = [
  {
    label: 'HISTORY }}',
    kind: 'keyword',
    detail: 'All historical associations',
    sortText: 'd-01',
  },
  {
    label: 'HISTORY-MIN }}',
    kind: 'keyword',
    detail: 'Minimal history (SAME-AS, REPLACED-BY, MOVED-TO)',
    sortText: 'd-02',
  },
  {
    label: 'HISTORY-MOD }}',
    kind: 'keyword',
    detail: 'Moderate history (min + POSSIBLY-EQUIVALENT-TO)',
    sortText: 'd-03',
  },
  {
    label: 'HISTORY-MAX }}',
    kind: 'keyword',
    detail: 'Maximum history (all association types)',
    sortText: 'd-04',
  },
];

// ── Value tokens ─────────────────────────────────────────────────────────

export const descriptionTypeValues: CoreCompletionItem[] = [
  { label: 'syn', kind: 'value', detail: 'Synonym', sortText: 'e-01' },
  { label: 'fsn', kind: 'value', detail: 'Fully specified name', sortText: 'e-02' },
  { label: 'def', kind: 'value', detail: 'Definition', sortText: 'e-03' },
];

export const definitionStatusValues: CoreCompletionItem[] = [
  { label: 'primitive', kind: 'value', detail: 'Primitive concept', sortText: 'e-01' },
  { label: 'defined', kind: 'value', detail: 'Fully defined concept', sortText: 'e-02' },
];

export const booleanValues: CoreCompletionItem[] = [
  { label: 'true', kind: 'value', detail: 'Boolean true', sortText: 'e-01' },
  { label: 'false', kind: 'value', detail: 'Boolean false', sortText: 'e-02' },
  { label: '1', kind: 'value', detail: 'Boolean true (numeric)', sortText: 'e-03' },
  { label: '0', kind: 'value', detail: 'Boolean false (numeric)', sortText: 'e-04' },
];

// ── Filter keyword-specific concept ID values ───────────────────────────

export const typeIdValues: CoreCompletionItem[] = [
  {
    label: '900000000000003001 |Fully specified name|',
    kind: 'value',
    detail: 'FSN description type',
    sortText: 'e-10',
  },
  {
    label: '900000000000013009 |Synonym|',
    kind: 'value',
    detail: 'Synonym description type',
    sortText: 'e-11',
  },
  {
    label: '900000000000550004 |Definition|',
    kind: 'value',
    detail: 'Definition description type',
    sortText: 'e-12',
  },
];

export const dialectIdValues: CoreCompletionItem[] = [
  {
    label: '900000000000509007 |US English|',
    kind: 'value',
    detail: 'US English dialect',
    sortText: 'e-10',
  },
  {
    label: '900000000000508004 |GB English|',
    kind: 'value',
    detail: 'GB English dialect',
    sortText: 'e-11',
  },
  {
    label: '32570271000036106 |AU English|',
    kind: 'value',
    detail: 'Australian English dialect',
    sortText: 'e-12',
  },
  {
    label: '21000220103 |NZ English|',
    kind: 'value',
    detail: 'New Zealand English dialect',
    sortText: 'e-13',
  },
];

export const moduleIdValues: CoreCompletionItem[] = [
  {
    label: '900000000000207008 |SNOMED CT core|',
    kind: 'value',
    detail: 'SNOMED CT core module',
    sortText: 'e-10',
  },
  {
    label: '900000000000012004 |SNOMED CT model component|',
    kind: 'value',
    detail: 'Model component module',
    sortText: 'e-11',
  },
  {
    label: '32506021000036107 |AU module|',
    kind: 'value',
    detail: 'Australian module',
    sortText: 'e-12',
  },
  {
    label: '731000124108 |US module|',
    kind: 'value',
    detail: 'US National module',
    sortText: 'e-13',
  },
  {
    label: '999000011000000103 |UK module|',
    kind: 'value',
    detail: 'UK clinical module',
    sortText: 'e-14',
  },
];

export const definitionStatusIdValues: CoreCompletionItem[] = [
  {
    label: '900000000000074008 |Primitive|',
    kind: 'value',
    detail: 'Not fully defined',
    sortText: 'e-10',
  },
  {
    label: '900000000000073002 |Defined|',
    kind: 'value',
    detail: 'Fully defined concept',
    sortText: 'e-11',
  },
];

export const languageCodeValues: CoreCompletionItem[] = [
  { label: 'en', kind: 'value', detail: 'English', sortText: 'e-01' },
  { label: 'es', kind: 'value', detail: 'Spanish', sortText: 'e-02' },
  { label: 'fr', kind: 'value', detail: 'French', sortText: 'e-03' },
  { label: 'de', kind: 'value', detail: 'German', sortText: 'e-04' },
  { label: 'nl', kind: 'value', detail: 'Dutch', sortText: 'e-05' },
  { label: 'sv', kind: 'value', detail: 'Swedish', sortText: 'e-06' },
  { label: 'da', kind: 'value', detail: 'Danish', sortText: 'e-07' },
  { label: 'no', kind: 'value', detail: 'Norwegian', sortText: 'e-08' },
  { label: 'zh', kind: 'value', detail: 'Chinese', sortText: 'e-09' },
  { label: 'ja', kind: 'value', detail: 'Japanese', sortText: 'e-10' },
  { label: 'ko', kind: 'value', detail: 'Korean', sortText: 'e-11' },
  { label: 'pt', kind: 'value', detail: 'Portuguese', sortText: 'e-12' },
];

export const effectiveTimeHint: CoreCompletionItem = {
  label: '"YYYYMMDD"',
  kind: 'value',
  detail: 'Effective time format',
  documentation: 'Enter date in YYYYMMDD format, e.g. "20240101"',
  sortText: 'e-10',
};

// ── Concept search item ──────────────────────────────────────────────────

export const conceptSearch: CoreCompletionItem = {
  label: '🔍 Search for concept...',
  kind: 'function',
  detail: 'Search SNOMED CT concepts via FHIR',
  documentation: 'Open concept search dialog to find and insert SNOMED CT concepts',
  insertText: '',
  command: {
    command: 'ecl.searchConcept',
    title: 'Search Concept',
  },
  sortText: 'f-01',
};
