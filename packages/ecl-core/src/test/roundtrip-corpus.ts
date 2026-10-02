// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Valid ECL covering every grammar construct, for round-trip tests of the code that reprints
// from the AST (formatter, canonical form). Each defect found so far — !!>/!!< (#127),
// attribute-name operators (#135), alternate identifiers, concrete-value comparisons, member
// field selection — was an AST that silently dropped part of the source.

const CONSTRAINT_OPERATORS = ['<', '<<', '>', '>>', '<!', '<<!', '>!', '>>!', '!!>', '!!<'];

export const roundTripCorpus: string[] = [
  ...CONSTRAINT_OPERATORS.flatMap((op) => [
    `${op} 404684003`,
    `${op} (<< 404684003)`,
    `< 404684003 : ${op} 363698007 = 39057004`,
    `< 404684003 : 363698007 = ${op} 39057004`,
    `< 404684003 : { ${op} 363698007 = ${op} 39057004 }`,
    `< 404684003 . ${op} 363698007`,
    `${op} 404684003 {{ term = "heart" }}`,
  ]),

  // Member-of and member field selection
  '^ 700043003',
  '< ^ 700043003',
  '^ [referencedComponentId] 700043003',
  '^ [*] 700043003',
  '^ [refsetId, referencedComponentId] (< 446609009)',
  '^ (< 446609009)',
  '< 404684003 : ^ 700043003 = *',
  '< 404684003 : 363698007 = ^ 700043003',

  // Wildcards, alternate identifiers
  '*',
  '< 404684003 : * = 39057004',
  'LOINC#54486-6',
  '"LOINC#54486-6"',
  'LOINC#54486-6 |Some term|',
  '< 404684003 : 363698007 = LOINC#54486-6',

  // Dotted attributes
  '< 19829001 . 363698007',
  '(< 125605004) . 363698007 . 116676008',

  // Refinements: cardinality, reverse flag, comparisons, concrete values, grouping
  '< 404684003 : [1..3] 363698007 = 39057004',
  '< 404684003 : [0..*] 363698007 = 39057004',
  '< 404684003 : [1..1] { 363698007 = 39057004 }',
  '< 404684003 : R 363698007 = 39057004',
  '< 404684003 : [0..1] R 363698007 = 39057004',
  '< 404684003 : 363698007 != << 39057004',
  ...['=', '!=', '<', '<=', '>', '>='].flatMap((op) => [
    `< 373873005 : 1142135004 ${op} #10`,
    `< 373873005 : 1142135004 ${op} #2.5`,
  ]),
  '< 373873005 : 1142135004 = "text"',
  '< 373873005 : 1142135004 != "text"',
  '< 373873005 : 1142135004 = true',
  '< 373873005 : 1142135004 != false',
  '< 404684003 : 363698007 = 39057004, 116676008 = 72704001',
  '< 404684003 : 363698007 = 39057004 AND 116676008 = 72704001',
  '< 404684003 : 363698007 = 39057004 OR 116676008 = 72704001',
  '< 404684003 : { 363698007 = 39057004, 116676008 = 72704001 }, { 363698007 = 80891009 }',
  '< 404684003 : { 363698007 = 39057004 } OR { 116676008 = 72704001 }',
  '< 404684003 : (363698007 = 39057004 OR 116676008 = 72704001), 246075003 = 373873005',
  '< 404684003 : 363698007 = (< 39057004 OR < 80891009)',
  '< 404684003 : 363698007 = (< 39057004 MINUS 80891009)',
  '< 404684003 : 363698007 = (< 39057004 : 116676008 = *)',
  '(< 404684003 : 363698007 = 39057004) : 116676008 = 72704001',

  // Compound expressions
  '< 404684003 AND < 19829001',
  '< 404684003 OR < 19829001',
  '< 404684003 MINUS < 19829001',
  '(< 404684003 OR < 19829001) AND < 123456789',
  '< 404684003 MINUS (< 19829001 MINUS < 123456789)',
  '(< 404684003 MINUS < 19829001) MINUS < 123456789',
  '(< 404684003 : 363698007 = 39057004) OR < 19829001',
  '< 91723000 AND (< 125605004 . 363698007)',

  // Description filters
  '< 404684003 {{ term = "heart" }}',
  '< 404684003 {{ D term = match:"heart att" }}',
  '< 404684003 {{ term = wild:"hear*" }}',
  '< 404684003 {{ term = ("heart" "card") }}',
  '< 404684003 {{ language = en }}',
  '< 404684003 {{ type = (syn fsn) }}',
  '< 404684003 {{ typeId = 900000000000013009 }}',
  '< 404684003 {{ dialect = en-au (prefer) }}',
  '< 404684003 {{ dialectId = 32570271000036106 (900000000000548007) }}',
  '< 404684003 {{ id = (3756161018 3756162013) }}',
  '< 404684003 {{ D term = "heart", type = syn }}',

  // Concept filters
  '< 404684003 {{ C definitionStatus = primitive }}',
  '< 404684003 {{ C definitionStatusId = 900000000000074008 }}',
  '< 404684003 {{ C moduleId != 32506021000036107 }}',
  '< 404684003 {{ C effectiveTime >= "20200131" }}',
  '< 404684003 {{ C active = true }}',

  // Member filters
  '^ 447562003 {{ M mapTarget = "J45.9" }}',
  '^ 447562003 {{ M mapGroup >= #2 }}',
  '^ 447562003 {{ M referencedComponentId = << 404684003 }}',
  '^ [mapTarget] 447562003 {{ M mapPriority = #1 }}',

  // History supplements
  '< 404684003 {{ +HISTORY-MIN }}',
  '< 404684003 {{ +HISTORY (^ 900000000000527005) }}',

  // Combinations
  '< 404684003 {{ C active = true }} : 363698007 = 39057004',
  '<< 763158003 : << 127489000 = << 387207008',
  '!!> (<< 404684003 : 363698007 = *)',
];

/** Source text with comments removed, terms blanked and whitespace and case normalised. */
export function surfaceForm(ecl: string): string {
  return ecl
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\|[^|]*\|/g, '||')
    .replaceAll(/\s+/g, '')
    .toLowerCase();
}

/** Pairs that differ in meaning and must never be reported as equivalent. */
export const distinctPairs: [string, string][] = [
  ['< 404684003 : 363698007 = LOINC#54486-6', '< 404684003 : 363698007 = *'],
  ['< 373873005 : 1142135004 < #10', '< 373873005 : 1142135004 = #10'],
  ['< 373873005 : 1142135004 > #10', '< 373873005 : 1142135004 = #10'],
  ['^ [referencedComponentId] 700043003', '^ 700043003'],
  ['^ [refsetId] 700043003', '^ [referencedComponentId] 700043003'],
  ['< 404684003 MINUS (< 19829001 MINUS < 123456789)', '(< 404684003 MINUS < 19829001) MINUS < 123456789'],
  ['763158003 : << 127489000 = *', '763158003 : 127489000 = *'],
  ['!!> 404684003', '!!< 404684003'],
];
