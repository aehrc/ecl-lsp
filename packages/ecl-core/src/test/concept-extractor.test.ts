// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseECL } from '../parser';
import { extractConceptIds, extractConceptIdsFromText } from '../parser/concept-extractor';

describe('Concept Extractor', () => {
  describe('extractConceptIds from AST', () => {
    it('should extract concept ID from simple descendant constraint', () => {
      const text = '< 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should extract concept IDs from compound expression via AST', () => {
      const text = '< 404684003 AND < 19829001';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 2, `Expected 2 concepts, found ${concepts.length}`);

      const conceptIds = new Set(concepts.map((c) => c.id));
      assert.ok(conceptIds.has('404684003'), 'Should include first concept');
      assert.ok(conceptIds.has('19829001'), 'Should include second concept');
    });

    it('should extract concept IDs with terms', () => {
      const text = '< 404684003 |Clinical finding|';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
      assert.strictEqual(concepts[0].term, 'Clinical finding');
    });

    it('should extract concept IDs from refinement via AST', () => {
      const text = '< 404684003 : 363698007 = < 39057004';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3, `Expected 3 concepts, found ${concepts.length}`);

      const conceptIds = new Set(concepts.map((c) => c.id));
      assert.ok(conceptIds.has('404684003'), 'Should include focus concept');
      assert.ok(conceptIds.has('363698007'), 'Should include attribute concept');
      assert.ok(conceptIds.has('39057004'), 'Should include value concept');
    });

    it('should extract concept IDs from OR expression via AST', () => {
      const text = '< 19829001 OR < 301867009';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 2, `Expected 2 concepts, found ${concepts.length}`);

      const conceptIds = new Set(concepts.map((c) => c.id));
      assert.ok(conceptIds.has('19829001'), 'Should include first concept');
      assert.ok(conceptIds.has('301867009'), 'Should include second concept');
    });

    it('should handle nested expressions via AST', () => {
      const text = '< 19829001 AND (< 301867009 OR < 195967001)';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3, `Expected 3 concepts, found ${concepts.length}`);

      const conceptIds = new Set(concepts.map((c) => c.id));
      assert.ok(conceptIds.has('19829001'), 'Should include first concept');
      assert.ok(conceptIds.has('301867009'), 'Should include second concept');
      assert.ok(conceptIds.has('195967001'), 'Should include third concept');
    });

    it('should deduplicate concept IDs', () => {
      const text = '< 404684003 AND < 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1, 'Should deduplicate concepts');
      assert.strictEqual(concepts[0].id, '404684003');
    });
  });

  describe('AST-only extraction (no sourceText fallback)', () => {
    it('should extract compound expression concepts from AST alone', () => {
      const text = '< 404684003 AND < 19829001';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      // No sourceText argument — AST only
      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 2);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('19829001'));
    });

    it('should extract refinement concepts from AST alone', () => {
      const text = '< 404684003 : 363698007 = < 39057004';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('363698007'));
      assert.ok(ids.has('39057004'));
    });

    it('should extract N-ary conjunction concepts from AST alone', () => {
      const text = '< 404684003 AND < 19829001 AND < 301867009';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('19829001'));
      assert.ok(ids.has('301867009'));
    });

    it('should extract OR expression concepts from AST alone', () => {
      const text = '< 19829001 OR < 301867009';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 2);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('19829001'));
      assert.ok(ids.has('301867009'));
    });

    it('should extract MINUS expression concepts from AST alone', () => {
      const text = '< 404684003 MINUS < 19829001';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 2);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('19829001'));
    });

    it('should extract refinement with terms from AST alone', () => {
      const text = '< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('363698007'));
      assert.ok(ids.has('39057004'));
    });

    it('should extract nested parenthesized concepts from AST alone', () => {
      const text = '< 19829001 AND (< 301867009 OR < 195967001)';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('19829001'));
      assert.ok(ids.has('301867009'));
      assert.ok(ids.has('195967001'));
    });

    it('should extract wildcard refinement concept from AST alone', () => {
      const text = '< 404684003 : 363698007 = *';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      // Only 2 concepts — wildcard value is not a concept
      assert.strictEqual(concepts.length, 2);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('363698007'));
    });

    it('should extract concepts from attribute group', () => {
      const text = '< 404684003 : { 363698007 = < 39057004 }';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 3);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'));
      assert.ok(ids.has('363698007'));
      assert.ok(ids.has('39057004'));
    });

    it('should extract concept with descendantOrSelf from AST alone', () => {
      const text = '<< 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should extract concept with ancestor operator from AST alone', () => {
      const text = '> 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should extract concept with ancestorOrSelf operator from AST alone', () => {
      const text = '>> 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should extract plain concept ID from AST alone', () => {
      const text = '404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should deduplicate concepts in AST-only mode', () => {
      const text = '< 404684003 AND < 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should extract concepts from deeply nested expression', () => {
      const text = '(< 19829001 AND < 301867009) OR (< 195967001 AND < 404684003)';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 4);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('19829001'));
      assert.ok(ids.has('301867009'));
      assert.ok(ids.has('195967001'));
      assert.ok(ids.has('404684003'));
    });

    it('should preserve term info in AST-only extraction', () => {
      const text = '<< 404684003 |Clinical finding|';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0].id, '404684003');
      assert.strictEqual(concepts[0].term, 'Clinical finding');
    });

    it('should extract attribute name term in AST-only extraction', () => {
      const text = '< 404684003 : 363698007 |Finding site| = < 39057004';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const attrConcept = concepts.find((c) => c.id === '363698007');
      assert.ok(attrConcept, 'Should find attribute concept');
      assert.strictEqual(attrConcept.term, 'Finding site');
    });

    it('should have range info for AST-extracted concepts', () => {
      const text = '< 404684003';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
      assert.ok(concepts[0].range, 'Concept should have range');
      assert.ok(concepts[0].range.start.offset >= 0, 'Range should have valid start offset');
      assert.ok(concepts[0].range.end.offset > concepts[0].range.start.offset, 'Range end should be after start');
    });

    it('should extract multiple refinement attribute concepts from AST alone', () => {
      const text = '< 404684003 : 363698007 = < 39057004, 116676008 = < 72651009';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('363698007'), 'Should include first attribute name');
      assert.ok(ids.has('39057004'), 'Should include first attribute value');
      assert.ok(ids.has('116676008'), 'Should include second attribute name');
      assert.ok(ids.has('72651009'), 'Should include second attribute value');
      assert.strictEqual(concepts.length, 5);
    });
  });

  describe('compound expression attribute names', () => {
    it('should extract individual concepts from OR compound attribute name', () => {
      const text = '<< 763158003 : (<< 762949000 OR << 732943007) = << 105590001';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('763158003'), 'Should include focus concept');
      assert.ok(ids.has('762949000'), 'Should include first OR operand');
      assert.ok(ids.has('732943007'), 'Should include second OR operand');
      assert.ok(ids.has('105590001'), 'Should include attribute value');
      // Must NOT contain a concatenated garbage ID
      for (const c of concepts) {
        assert.ok(c.id.length <= 18, `Concept ID "${c.id}" looks like concatenated garbage`);
        assert.ok(/^\d+$/.test(c.id), `Concept ID "${c.id}" should be all digits`);
      }
    });

    it('should extract concepts from cardinality-constrained compound attribute name', () => {
      const text = '<< 763158003 : [0..0] { (<< 762949000 OR << 732943007 OR << 774160008) = << 105590001 }';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('763158003'), 'Should include focus concept');
      assert.ok(ids.has('762949000'), 'Should include first OR operand');
      assert.ok(ids.has('732943007'), 'Should include second OR operand');
      assert.ok(ids.has('774160008'), 'Should include third OR operand');
      assert.ok(ids.has('105590001'), 'Should include attribute value');
      // Must NOT contain a concatenated garbage ID
      for (const c of concepts) {
        assert.ok(c.id.length <= 18, `Concept ID "${c.id}" looks like concatenated garbage`);
        assert.ok(/^\d+$/.test(c.id), `Concept ID "${c.id}" should be all digits`);
      }
    });

    it('should extract concepts from large OR chain in attribute name', () => {
      // Mirrors the user-reported bug: many OR operands in an attribute name
      const text =
        '<< 763158003 : [0..0] { (<< 762949000 OR << 732943007 OR << 774160008 OR << 766939001 OR << 773957001) = << 105590001 }';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('762949000'), 'Should include 762949000');
      assert.ok(ids.has('732943007'), 'Should include 732943007');
      assert.ok(ids.has('774160008'), 'Should include 774160008');
      assert.ok(ids.has('766939001'), 'Should include 766939001');
      assert.ok(ids.has('773957001'), 'Should include 773957001');
      assert.ok(ids.has('105590001'), 'Should include value concept');
      // No concept should be longer than 18 digits (SNOMED max)
      for (const c of concepts) {
        assert.ok(c.id.length <= 18, `Concept ID "${c.id}" is too long — likely concatenated`);
      }
    });

    it('should not produce concatenated IDs from wildcard attribute name', () => {
      const text = '<< 763158003 : * = << 105590001';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('763158003'), 'Should include focus concept');
      assert.ok(ids.has('105590001'), 'Should include value concept');
      assert.strictEqual(concepts.length, 2, 'Should only have 2 concepts (wildcard is not a concept)');
    });
  });

  describe('description filter concept extraction', () => {
    it('should extract concept from typeId filter', () => {
      const text = '< 404684003 {{ D typeId = 900000000000003001 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000003001'), 'Should include typeId concept');
    });

    it('should extract concept from typeId subexpression filter', () => {
      const text = '< 404684003 {{ D typeId = << 900000000000003001 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000003001'), 'Should include typeId concept');
    });

    it('should extract concept from moduleId in description filter', () => {
      const text = '< 404684003 {{ D moduleId = 731000124108 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('731000124108'), 'Should include moduleId concept');
    });

    it('should extract concept from dialectId filter', () => {
      const text = '< 404684003 {{ D dialectId = 900000000000509007 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000509007'), 'Should include dialectId concept');
    });

    it('should not extract extra concepts from term-only filter', () => {
      const text = '< 404684003 {{ D term = "heart" }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1, 'Should only have focus concept');
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should not treat description IDs as concept IDs', () => {
      // descriptionidfilter uses description IDs, not concept IDs
      // The parser handles this, but we verify no spurious concepts leak
      const text = '< 404684003 {{ D term = "heart" }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1);
    });
  });

  describe('concept filter concept extraction', () => {
    it('should extract from definitionStatusId filter', () => {
      const text = '< 404684003 {{ C definitionStatusId = 900000000000074008 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000074008'), 'Should include definitionStatusId concept');
    });

    it('should extract from moduleId in concept filter', () => {
      const text = '< 404684003 {{ C moduleId = 731000124108 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('731000124108'), 'Should include moduleId concept');
    });

    it('should not extract extra concepts from token-only concept filter', () => {
      const text = '< 404684003 {{ C definitionStatus = primitive }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1, 'Should only have focus concept');
      assert.strictEqual(concepts[0].id, '404684003');
    });
  });

  describe('member filter concept extraction', () => {
    it('should extract from memberfieldfilter with expression comparison', () => {
      const text = '^ 404684003 {{ M mapTarget = 404684003 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include the concept');
      // Deduplication means we only get 1
      assert.strictEqual(concepts.length, 1);
    });

    it('should not extract extra concepts from string member field', () => {
      const text = '^ 404684003 {{ M mapTarget = "J45" }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1, 'Should only have focus concept');
      assert.strictEqual(concepts[0].id, '404684003');
    });

    it('should extract from moduleId in member filter', () => {
      const text = '^ 404684003 {{ M moduleId = 731000124108 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('731000124108'), 'Should include moduleId concept');
    });
  });

  describe('history supplement concept extraction', () => {
    it('should extract concept from history subset expression', () => {
      const text = '< 404684003 {{ + HISTORY (< 900000000000527005) }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000527005'), 'Should include history subset concept');
    });

    it('should extract concept from history subset with constraint operator', () => {
      const text = '<< 404684003 {{ + HISTORY (<< 900000000000527005) }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000527005'), 'Should include history subset concept');
    });

    it('should not extract extra concepts from HISTORY-MIN', () => {
      const text = '< 404684003 {{ + HISTORY-MIN }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1, 'Should only have focus concept');
      assert.strictEqual(concepts[0].id, '404684003');
    });
  });

  describe('combined filters and history', () => {
    it('should extract concepts from multiple filters on one expression', () => {
      const text = '< 404684003 {{ D typeId = 900000000000003001 }} {{ C definitionStatusId = 900000000000074008 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      const ids = new Set(concepts.map((c) => c.id));
      assert.ok(ids.has('404684003'), 'Should include focus concept');
      assert.ok(ids.has('900000000000003001'), 'Should include typeId concept');
      assert.ok(ids.has('900000000000074008'), 'Should include definitionStatusId concept');
      assert.strictEqual(concepts.length, 3);
    });

    it('should deduplicate across focus and filter concepts', () => {
      const text = '< 404684003 {{ D typeId = 404684003 }}';
      const result = parseECL(text);
      assert.ok(result.ast, 'AST should exist');

      const concepts = extractConceptIds(result.ast);
      assert.strictEqual(concepts.length, 1, 'Should deduplicate');
      assert.strictEqual(concepts[0].id, '404684003');
    });
  });

  describe('extractConceptIdsFromText (regex-based)', () => {
    it('should extract concept IDs from plain text', () => {
      const text = '< 404684003 |Clinical finding| AND < 19829001';
      const concepts = extractConceptIdsFromText(text);

      assert.strictEqual(concepts.length, 2);
      const conceptSet = new Set(concepts);
      assert.ok(conceptSet.has('404684003'));
      assert.ok(conceptSet.has('19829001'));
    });

    it('should deduplicate multiple occurrences', () => {
      const text = '< 404684003 : 363698007 = < 404684003';
      const concepts = extractConceptIdsFromText(text);

      // Now deduplicates
      assert.strictEqual(concepts.length, 2);
      const conceptSet = new Set(concepts);
      assert.ok(conceptSet.has('404684003'));
      assert.ok(conceptSet.has('363698007'));
    });

    it('should not match numbers that are too short', () => {
      const text = '< 12345 AND < 404684003';
      const concepts = extractConceptIdsFromText(text);

      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0], '404684003');
    });

    it('should not match numbers that are too long', () => {
      const text = '< 1234567890123456789 AND < 404684003';
      const concepts = extractConceptIdsFromText(text);

      assert.strictEqual(concepts.length, 1);
      assert.strictEqual(concepts[0], '404684003');
    });
  });
});
