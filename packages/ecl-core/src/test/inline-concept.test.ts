// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { extractConceptSearchQuery, getCompletionItemsWithSearch, clearFilterCache } from '../completion/provider';
import { MockTerminologyService } from '../terminology/mock-service';

// ─── Helpers ─────────────────────────────────────────────────────────

const mockService = new MockTerminologyService();

function conceptLabels(items: { label: string }[]): string[] {
  return items.filter((i: any) => i.kind === 'concept').map((i) => i.label);
}

// ═════════════════════════════════════════════════════════════════════
// 1. QUERY EXTRACTION TESTS
// ═════════════════════════════════════════════════════════════════════

describe('extractConceptSearchQuery', () => {
  // ── Valid extractions ──────────────────────────────────────────────

  it('extracts query after << operator', () => {
    const r = extractConceptSearchQuery('<< diab');
    assert.deepStrictEqual(r, { query: 'diab', startOffset: 3 });
  });

  it('extracts query after < operator', () => {
    const r = extractConceptSearchQuery('< clinical f');
    assert.deepStrictEqual(r, { query: 'clinical f', startOffset: 2 });
  });

  it('extracts query after > operator', () => {
    const r = extractConceptSearchQuery('> disorder');
    assert.deepStrictEqual(r, { query: 'disorder', startOffset: 2 });
  });

  it('extracts query after >> operator', () => {
    const r = extractConceptSearchQuery('>> finding');
    assert.deepStrictEqual(r, { query: 'finding', startOffset: 3 });
  });

  it('extracts query after AND operator', () => {
    const r = extractConceptSearchQuery('AND disorder');
    assert.deepStrictEqual(r, { query: 'disorder', startOffset: 4 });
  });

  it('extracts query after OR operator', () => {
    const r = extractConceptSearchQuery('OR disease');
    assert.deepStrictEqual(r, { query: 'disease', startOffset: 3 });
  });

  it('extracts query after MINUS operator', () => {
    const r = extractConceptSearchQuery('MINUS edema');
    assert.deepStrictEqual(r, { query: 'edema', startOffset: 6 });
  });

  it('extracts query after : operator', () => {
    const r = extractConceptSearchQuery(': finding');
    assert.deepStrictEqual(r, { query: 'finding', startOffset: 2 });
  });

  it('extracts query after = operator', () => {
    const r = extractConceptSearchQuery('= lung str');
    assert.deepStrictEqual(r, { query: 'lung str', startOffset: 2 });
  });

  it('extracts query after ( operator with space', () => {
    const r = extractConceptSearchQuery('( disorder');
    assert.deepStrictEqual(r, { query: 'disorder', startOffset: 2 });
  });

  it('extracts query after ( operator without space', () => {
    const r = extractConceptSearchQuery('(disorder');
    assert.deepStrictEqual(r, { query: 'disorder', startOffset: 1 });
  });

  it('extracts query after ( operator with preceding content', () => {
    const r = extractConceptSearchQuery('255620007 |Food| OR (clinical');
    assert.deepStrictEqual(r, { query: 'clinical', startOffset: 21 });
  });

  it('extracts multi-word query', () => {
    const r = extractConceptSearchQuery('<< disorder of lung');
    assert.deepStrictEqual(r, { query: 'disorder of lung', startOffset: 3 });
  });

  it('extracts query in a longer line context', () => {
    const r = extractConceptSearchQuery('< 404684003 AND << clinical');
    assert.deepStrictEqual(r, { query: 'clinical', startOffset: 19 });
  });

  // ── Null returns ───────────────────────────────────────────────────

  it('returns null for empty string', () => {
    assert.strictEqual(extractConceptSearchQuery(''), null);
  });

  it('returns query for bare text without operator (fallback search)', () => {
    const r = extractConceptSearchQuery('diabetes');
    assert.deepStrictEqual(r, { query: 'diabetes', startOffset: 0 });
  });

  it('returns null for query shorter than 3 characters', () => {
    assert.strictEqual(extractConceptSearchQuery('<< di'), null);
  });

  it('returns null for purely numeric text (concept ID)', () => {
    assert.strictEqual(extractConceptSearchQuery('< 404684003'), null);
  });

  it('returns null for operator keyword AND', () => {
    assert.strictEqual(extractConceptSearchQuery('<< AND'), null);
  });

  it('returns null for operator keyword OR', () => {
    assert.strictEqual(extractConceptSearchQuery('<< OR'), null);
  });

  it('returns null for operator keyword MINUS', () => {
    assert.strictEqual(extractConceptSearchQuery('<< MINUS'), null);
  });

  it('returns null when only whitespace after operator', () => {
    assert.strictEqual(extractConceptSearchQuery('<< '), null);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. ASYNC COMPLETION WITH SEARCH TESTS
// ═════════════════════════════════════════════════════════════════════

describe('getCompletionItemsWithSearch', () => {
  // ── Concept results ────────────────────────────────────────────────

  it('returns concept items for "disorder" search', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 12, 0, mockService);
    const concepts = conceptLabels(items);
    assert.ok(
      concepts.some((l) => l.includes('Disorder of lung')),
      `Expected "Disorder of lung" in ${JSON.stringify(concepts)}`,
    );
  });

  it('returns concept items for "clinical" search', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< clinical', '<< clinical', 11, 0, mockService);
    const concepts = conceptLabels(items);
    assert.ok(
      concepts.some((l) => l.includes('Clinical finding')),
      `Expected "Clinical finding" in ${JSON.stringify(concepts)}`,
    );
  });

  it('returns concept items for "disease" search', async () => {
    const items = await getCompletionItemsWithSearch(true, '< disease', '< disease', 9, 0, mockService);
    const concepts = conceptLabels(items);
    assert.ok(
      concepts.some((l) => l.includes('Disease')),
      `Expected "Disease" in ${JSON.stringify(concepts)}`,
    );
  });

  // ── No search triggered ────────────────────────────────────────────

  it('returns only base items when no query text after operator', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< ', '<< ', 3, 0, mockService);
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
  });

  it('returns only base items for nonexistent search term', async () => {
    const items = await getCompletionItemsWithSearch(
      true,
      '<< xyznonexistent',
      '<< xyznonexistent',
      18,
      0,
      mockService,
    );
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
  });

  it('returns only snippets when not in an expression', async () => {
    const items = await getCompletionItemsWithSearch(false, '', '', 0, 0, mockService);
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
    assert.ok(items.length > 0, 'Should have snippet items');
  });

  it('returns base items when terminologyService is null', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 12, 0, null);
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
    assert.ok(items.length > 0, 'Should have base items');
  });

  it('returns base items when query is too short', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< di', '<< di', 5, 0, mockService);
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
  });

  it('returns base items when query is numeric (concept ID)', async () => {
    const items = await getCompletionItemsWithSearch(true, '< 404684003', '< 404684003', 12, 0, mockService);
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
  });

  it('gracefully handles terminology service errors', async () => {
    const failingService = {
      async getConceptInfo() {
        return null;
      },
      async validateConcepts() {
        return new Map();
      },
      async searchConcepts() {
        throw new Error('Network error');
      },
      async evaluateEcl() {
        return { total: 0, concepts: [], truncated: false };
      },
    };
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 12, 0, failingService);
    // Should return base items without throwing
    assert.ok(items.length > 0, 'Should have base items');
    const concepts = conceptLabels(items);
    assert.strictEqual(concepts.length, 0, 'Should have no concept items');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. TEXT EDIT RANGE TESTS
// ═════════════════════════════════════════════════════════════════════

describe('getCompletionItemsWithSearch — textEdit ranges', () => {
  it('sets correct textEdit range for "<< disorder"', async () => {
    // "<< disorder" — query "disorder" starts at col 3, cursor at col 11
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 11, 5, mockService);
    const conceptItem = items.find(
      (i: any) => i.kind === 'concept' && String(i.label).includes('Disorder of lung'),
    ) as any;
    assert.ok(conceptItem, 'Should find Disorder of lung concept item');
    assert.ok(conceptItem.textEdit, 'Should have textEdit');
    assert.deepStrictEqual(conceptItem.textEdit.range.start, { line: 5, character: 3 });
    assert.deepStrictEqual(conceptItem.textEdit.range.end, { line: 5, character: 11 });
    assert.ok(
      conceptItem.textEdit.newText.includes('19829001'),
      `Should insert concept ID, got: ${conceptItem.textEdit.newText}`,
    );
    assert.ok(
      conceptItem.textEdit.newText.includes('|Disorder of lung|'),
      `Should insert term with pipes, got: ${conceptItem.textEdit.newText}`,
    );
  });

  it('sets correct textEdit range for "< clinical finding"', async () => {
    // "< clinical finding" — query starts at col 2, cursor at col 18
    const items = await getCompletionItemsWithSearch(
      true,
      '< clinical finding',
      '< clinical finding',
      18,
      0,
      mockService,
    );
    const conceptItem = items.find(
      (i: any) => i.kind === 'concept' && String(i.label).includes('Clinical finding'),
    ) as any;
    assert.ok(conceptItem, 'Should find Clinical finding concept item');
    assert.deepStrictEqual(conceptItem.textEdit.range.start, { line: 0, character: 2 });
    assert.deepStrictEqual(conceptItem.textEdit.range.end, { line: 0, character: 18 });
  });

  it('uses correct lineNumber in textEdit range', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 11, 42, mockService);
    const conceptItem = items.find((i: any) => i.kind === 'concept') as any;
    assert.ok(conceptItem, 'Should have a concept item');
    assert.strictEqual(conceptItem.textEdit.range.start.line, 42);
    assert.strictEqual(conceptItem.textEdit.range.end.line, 42);
  });

  it('inserts concept ID with pipes in textEdit newText', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< clinical', '<< clinical', 11, 0, mockService);
    const conceptItem = items.find(
      (i: any) => i.kind === 'concept' && String(i.label).includes('Clinical finding'),
    ) as any;
    assert.ok(conceptItem, 'Should find concept item');
    assert.strictEqual(conceptItem.textEdit.newText, '404684003 |Clinical finding|');
  });

  it('sets filterText to preferred term for VS Code fuzzy matching', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< clinical', '<< clinical', 11, 0, mockService);
    const conceptItem = items.find(
      (i: any) => i.kind === 'concept' && String(i.label).includes('Clinical finding'),
    ) as any;
    assert.ok(conceptItem, 'Should find concept item');
    assert.strictEqual(conceptItem.filterText, 'Clinical finding');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. FHIR FILTER COMPLETION TESTS
// ═════════════════════════════════════════════════════════════════════

describe('getCompletionItemsWithSearch — FHIR filter completions', () => {
  beforeEach(() => {
    clearFilterCache();
  });

  it('returns FHIR concepts for typeId = in description filter', async () => {
    const text = '< 404684003 {{ D typeId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    const lbls = items.map((i) => i.label);
    // Should include static items AND FHIR items
    assert.ok(
      lbls.some((l) => l.includes('900000000000003001')),
      'Should include FSN type (static or FHIR)',
    );
    assert.ok(
      lbls.some((l) => l.includes('900000000000013009')),
      'Should include Synonym type',
    );
    assert.ok(
      lbls.some((l) => l.includes('900000000000550004')),
      'Should include Definition type',
    );
  });

  it('returns FHIR concepts for dialectId = in description filter', async () => {
    const text = '< 404684003 {{ D dialectId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    const lbls = items.map((i) => i.label);
    assert.ok(
      lbls.some((l) => l.includes('900000000000509007')),
      'Should include US English',
    );
    assert.ok(
      lbls.some((l) => l.includes('900000000000508004')),
      'Should include GB English',
    );
  });

  it('returns FHIR concepts for moduleId = in description filter', async () => {
    const text = '< 404684003 {{ D moduleId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    const lbls = items.map((i) => i.label);
    assert.ok(
      lbls.some((l) => l.includes('900000000000207008')),
      'Should include SNOMED CT core module',
    );
  });

  it('returns FHIR concepts for moduleId = in concept filter', async () => {
    const text = '< 404684003 {{ C moduleId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    const lbls = items.map((i) => i.label);
    assert.ok(
      lbls.some((l) => l.includes('900000000000207008')),
      'Should include SNOMED CT core module',
    );
  });

  it('returns FHIR concepts for moduleId = in member filter', async () => {
    const text = '< 404684003 {{ M moduleId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    const lbls = items.map((i) => i.label);
    assert.ok(
      lbls.some((l) => l.includes('900000000000207008')),
      'Should include SNOMED CT core module',
    );
  });

  it('deduplicates FHIR items that match static items', async () => {
    const text = '< 404684003 {{ D typeId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    // Count how many items contain '900000000000003001'
    const fsnItems = items.filter((i) => i.label.includes('900000000000003001'));
    assert.strictEqual(fsnItems.length, 1, 'Should not have duplicate FSN type entries');
  });

  it('does not add FHIR items for definitionStatusId', async () => {
    const text = '< 404684003 {{ C definitionStatusId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, mockService);
    // Should only have static definitionStatusId values (Primitive, Defined)
    assert.ok(items.length <= 2, 'definitionStatusId should only have static items');
  });

  it('returns base items when terminology service is null', async () => {
    const text = '< 404684003 {{ D typeId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, null);
    const lbls = items.map((i) => i.label);
    // Should still have static items
    assert.ok(
      lbls.some((l) => l.includes('900000000000003001')),
      'Should have static FSN type',
    );
    // But no additional FHIR items beyond the static ones
    const fsnItems = items.filter((i) => i.label.includes('900000000000003001'));
    assert.strictEqual(fsnItems.length, 1, 'Only static items when no terminology service');
  });

  it('gracefully handles FHIR errors for filter completions', async () => {
    const failingService = {
      async getConceptInfo() {
        return null;
      },
      async validateConcepts() {
        return new Map();
      },
      async searchConcepts(): Promise<any> {
        return { results: [], hasMore: false };
      },
      async evaluateEcl() {
        throw new Error('FHIR timeout');
      },
    };
    const text = '< 404684003 {{ D typeId = ';
    const items = await getCompletionItemsWithSearch(true, text, text, text.length, 0, failingService);
    // Should still return static items
    assert.ok(items.length > 0, 'Should have static items despite FHIR error');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. SORT ORDER TESTS
// ═════════════════════════════════════════════════════════════════════

describe('getCompletionItemsWithSearch — sort order', () => {
  it('concept items have sortText starting with "g"', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 11, 0, mockService);
    const conceptItems = items.filter((i: any) => i.kind === 'concept');
    assert.ok(conceptItems.length > 0, 'Should have concept items');
    for (const item of conceptItems) {
      assert.ok(item.sortText?.startsWith('g'), `Expected sortText starting with "g", got "${item.sortText}"`);
    }
  });

  it('concept sortText comes after operator sortText (no sortText = "a")', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 11, 0, mockService);
    const conceptItems = items.filter((i: any) => i.kind === 'concept');
    // Operators have sortText starting with "a-".
    // Concept items with "g*" sort after operators but before snippets ("z*").
    for (const item of conceptItems) {
      assert.ok(item.sortText! < 'z', `Concept sortText "${item.sortText}" should be before snippets "z*"`);
    }
  });

  it('concept sortText comes before snippet sortText', async () => {
    const items = await getCompletionItemsWithSearch(true, '<< disorder', '<< disorder', 11, 0, mockService);
    const snippetItems = items.filter((i: any) => i.kind === 'snippet');
    const conceptItems = items.filter((i: any) => i.kind === 'concept');
    if (snippetItems.length > 0 && conceptItems.length > 0) {
      const conceptSortTexts = conceptItems.map((i) => i.sortText!).sort((a, b) => a.localeCompare(b));
      const maxConceptSort = conceptSortTexts.at(-1)!;
      const snippetSortTexts = snippetItems.map((i) => i.sortText ?? '').sort((a, b) => a.localeCompare(b));
      const minSnippetSort = snippetSortTexts[0];
      assert.ok(
        maxConceptSort < minSnippetSort,
        `Concept max sortText "${maxConceptSort}" should be before snippet min sortText "${minSnippetSort}"`,
      );
    }
  });
});
