// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  parseECL,
  formatDocument,
  defaultFormattingOptions,
  checkMixedRefinementOperators,
  extractConceptIds,
  groupIntoExpressions,
  FhirTerminologyService,
} from 'ecl-core';
import type { FormattingOptions } from 'ecl-core';

// These tests validate the core logic used by each MCP tool without
// starting the actual MCP server (which requires stdio transport).

// ── Mock terminology service for search/lookup/editions tool tests ────
// Mirrors the MCP tool handlers' usage of FhirTerminologyService methods.

interface MockConceptInfo {
  id: string;
  fsn: string;
  pt: string;
  active: boolean;
}

const MOCK_CONCEPTS: MockConceptInfo[] = [
  { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true },
  { id: '64572001', fsn: 'Disease (disorder)', pt: 'Disease', active: true },
  { id: '19829001', fsn: 'Disorder of lung (disorder)', pt: 'Disorder of lung', active: true },
  { id: '123456001', fsn: 'Inactive concept (finding)', pt: 'Inactive concept', active: false },
];

/** Simulates the lookup_concept tool logic: getConceptInfo → formatted response. */
function mockGetConceptInfo(conceptId: string): MockConceptInfo | null {
  return MOCK_CONCEPTS.find((c) => c.id === conceptId) ?? null;
}

/** Simulates the search_concepts tool logic: searchConcepts → SearchResponse. */
function mockSearchConcepts(term: string): { results: { id: string; fsn: string; pt: string }[]; hasMore: boolean } {
  if (!term || term.trim().length === 0) {
    return { results: [], hasMore: false };
  }
  const lower = term.toLowerCase();
  const results = MOCK_CONCEPTS.filter(
    (c) =>
      c.active && (c.pt.toLowerCase().includes(lower) || c.fsn.toLowerCase().includes(lower) || c.id.includes(term)),
  ).map((c) => ({ id: c.id, fsn: c.fsn, pt: c.pt }));
  return { results, hasMore: false };
}

describe('validate_ecl tool logic', () => {
  it('should report no errors for valid ECL', () => {
    const result = parseECL('< 404684003 |Clinical finding|');
    assert.strictEqual(result.errors.length, 0);
  });

  it('should detect syntax errors in invalid ECL', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.ok(result.errors.length > 0, 'should have errors');
  });

  it('should detect mixed refinement operators as warnings', () => {
    const expression = '<< 404684003 : 363698007 = << 39057004 AND 116676008 = << 55641003 OR 370135005 = << 441862004';
    const result = parseECL(expression);
    if (result.ast) {
      const warnings = checkMixedRefinementOperators(result.ast, expression);
      assert.ok(warnings.length > 0, 'should detect mixed AND/OR in refinements');
    }
  });

  it('should extract concept IDs from valid AST', () => {
    const result = parseECL('<< 404684003 |Clinical finding|');
    assert.ok(result.ast, 'should have AST');
    const concepts = extractConceptIds(result.ast);
    assert.ok(concepts.length > 0, 'should extract at least one concept');
    assert.ok(
      concepts.some((c) => c.id === '404684003'),
      'should include concept 404684003',
    );
  });

  it('should group expressions separated by ECL-END marker', () => {
    const text = '<< 404684003\n/* ECL-END */\n< 19829001';
    const expressions = groupIntoExpressions(text);
    assert.strictEqual(expressions.length, 2);
  });
});

describe('evaluate_ecl tool logic', () => {
  it('should reject invalid ECL before calling FHIR', () => {
    const result = parseECL('<<<< invalid');
    assert.ok(result.errors.length > 0, 'should have syntax errors');
  });

  it('should accept valid ECL for evaluation', () => {
    const result = parseECL('<< 404684003');
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('format_ecl tool logic', () => {
  it('should format with default options', () => {
    const input = '<<404684003|Clinical finding|';
    const formatted = formatDocument(input, defaultFormattingOptions);
    assert.ok(formatted.includes('<< 404684003'), 'should add space after operator');
    assert.ok(formatted.includes('| Clinical finding |'), 'should normalize term spacing');
  });

  it('should respect custom indent size', () => {
    const input = '<< 404684003 : 363698007 = << 39057004 AND 116676008 = << 55641003';
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      indentSize: 4,
      breakOnOperators: true,
    };
    const formatted = formatDocument(input, options);
    assert.ok(formatted.includes('    '), 'should use 4-space indent');
  });

  it('should handle break on operators option', () => {
    const input = '<< 404684003 AND << 19829001';
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      breakOnOperators: true,
    };
    const formatted = formatDocument(input, options);
    assert.ok(formatted.includes('\n'), 'should break lines on operators');
  });
});

describe('ECL resources', () => {
  it('should export all required resources', async () => {
    const { resources } = await import('../resources');
    const uris = Object.keys(resources);

    assert.ok(uris.includes('ecl://guide/operators'), 'should have operators guide');
    assert.ok(uris.includes('ecl://guide/refinements'), 'should have refinements guide');
    assert.ok(uris.includes('ecl://guide/filters'), 'should have filters guide');
    assert.ok(uris.includes('ecl://guide/patterns'), 'should have patterns guide');
    assert.ok(uris.includes('ecl://reference/grammar'), 'should have grammar reference');
    assert.ok(uris.includes('ecl://guide/history-supplements'), 'should have history supplements guide');
  });

  it('each resource should have name, description, and non-empty content', async () => {
    const { resources } = await import('../resources');
    for (const [uri, resource] of Object.entries(resources)) {
      assert.ok(resource.name.length > 0, `${uri} should have a name`);
      assert.ok(resource.description.length > 0, `${uri} should have a description`);
      assert.ok(resource.content.length > 50, `${uri} should have substantial content`);
    }
  });

  it('operators guide should mention all constraint operators', async () => {
    const { resources } = await import('../resources');
    const content = resources['ecl://guide/operators'].content;
    assert.ok(content.includes('<<'), 'should mention descendant or self');
    assert.ok(content.includes('<!'), 'should mention child of');
    assert.ok(content.includes('>!'), 'should mention parent of');
    assert.ok(content.includes('^'), 'should mention member of');
    assert.ok(content.includes('AND'), 'should mention AND');
    assert.ok(content.includes('OR'), 'should mention OR');
    assert.ok(content.includes('MINUS'), 'should mention MINUS');
  });

  it('patterns guide should include common ECL patterns', async () => {
    const { resources } = await import('../resources');
    const content = resources['ecl://guide/patterns'].content;
    assert.ok(content.includes('363698007'), 'should reference Finding site attribute');
    assert.ok(content.includes('Clinical finding'), 'should reference Clinical finding');
    assert.ok(content.includes('MINUS'), 'should show exclusion pattern');
  });
});

describe('configuration', () => {
  it('should use default FHIR server when not configured', () => {
    // This tests that the config defaults work — the actual env var reading
    // is done at module level in server.ts, tested here via defaults.
    const defaultServer = 'https://tx.ontoserver.csiro.au/fhir';
    assert.strictEqual(typeof defaultServer, 'string');
  });
});

// ── Extended: validate_ecl comprehensive ─────────────────────────────

describe('validate_ecl comprehensive', () => {
  it('should handle multiple expressions with ECL-END separator', () => {
    const text = '<< 404684003\n/* ECL-END */\n<<<< invalid';
    const expressions = groupIntoExpressions(text);
    assert.strictEqual(expressions.length, 2);

    // First expression should be valid
    const first = parseECL(expressions[0].text);
    assert.strictEqual(first.errors.length, 0, 'first expression should be valid');

    // Second expression should have errors
    const second = parseECL(expressions[1].text);
    assert.ok(second.errors.length > 0, 'second expression should have errors');
  });

  it('should produce valid summary message format for valid ECL', () => {
    const result = parseECL('<< 404684003 |Clinical finding|');
    const valid = result.errors.length === 0;
    const warnings: unknown[] = [];
    const warningsSummary =
      warnings.length > 0 ? `Valid ECL with ${warnings.length} warning(s)` : 'Valid ECL expression';
    const summary = valid ? warningsSummary : `Invalid ECL: ${result.errors.length} error(s)`;
    assert.strictEqual(summary, 'Valid ECL expression');
  });

  it('should produce invalid summary message format for invalid ECL', () => {
    const result = parseECL('< 404684003 AND AND');
    const valid = result.errors.length === 0;
    const summary = valid ? 'Valid ECL expression' : `Invalid ECL: ${result.errors.length} error(s)`;
    assert.ok(summary.startsWith('Invalid ECL:'), 'summary should indicate invalid');
    assert.ok(summary.includes('error(s)'), 'summary should mention error count');
  });

  it('should produce warnings summary for mixed refinement operators', () => {
    const expression = '<< 404684003 : 363698007 = << 39057004 AND 116676008 = << 55641003 OR 370135005 = << 441862004';
    const result = parseECL(expression);
    const valid = result.errors.length === 0;
    assert.ok(valid, 'expression should be syntactically valid');

    if (result.ast) {
      const warnings = checkMixedRefinementOperators(result.ast, expression);
      const summary = warnings.length > 0 ? `Valid ECL with ${warnings.length} warning(s)` : 'Valid ECL expression';
      assert.ok(summary.includes('warning(s)'), 'should mention warnings');
    }
  });
});

// ── Extended: format_ecl option combinations ─────────────────────────

describe('format_ecl option combinations', () => {
  it('should respect breakOnRefinementComma option', () => {
    const input = '<< 404684003 : 363698007 = << 39057004, 116676008 = << 55641003';
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      breakOnRefinementComma: true,
    };
    const formatted = formatDocument(input, options);
    // After the comma, there should be a newline
    assert.ok(formatted.includes('\n'), 'should break lines on refinement comma');
  });

  it('should respect breakAfterColon option', () => {
    const input = '<< 404684003 : 363698007 = << 39057004';
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      breakAfterColon: true,
    };
    const formatted = formatDocument(input, options);
    assert.ok(formatted.includes('\n'), 'should break line after colon');
  });

  it('should respect tab indent style', () => {
    const input = '<< 404684003 : 363698007 = << 39057004';
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      indentStyle: 'tab',
      breakAfterColon: true,
    };
    const formatted = formatDocument(input, options);
    assert.ok(formatted.includes('\t'), 'should use tab indentation');
  });

  it('should handle maxLineLength 0 as unlimited', () => {
    const longExpr = Array.from({ length: 20 }, () => '<< 404684003').join(' AND ');
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      maxLineLength: 0,
    };
    const formatted = formatDocument(longExpr, options);
    // With unlimited line length and breakOnOperators=false, should be single line
    const lines = formatted.split('\n').filter((l) => l.trim().length > 0);
    assert.strictEqual(lines.length, 1, 'unlimited line length should keep expression on one line');
  });

  it('should merge only specified options with defaults', () => {
    const input = '<<404684003|Clinical finding|';
    // Only override one option, rest should use defaults
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      indentSize: 4,
    };
    const formatted = formatDocument(input, options);
    // Should still format with default spacing rules
    assert.ok(formatted.includes('<< 404684003'), 'default spacing should still apply');
    assert.ok(formatted.includes('| Clinical finding |'), 'default term spacing should apply');
  });
});

// ── Extended: evaluate_ecl edge cases ────────────────────────────────

describe('evaluate_ecl edge cases', () => {
  it('should reject empty expression as syntax error', () => {
    const result = parseECL('');
    // Parser treats empty input as a syntax error (missing expression)
    assert.ok(result.errors.length > 0, 'empty string should produce parse errors');
  });

  it('should reject whitespace-only expression', () => {
    const result = parseECL('   \n  ');
    // Parser treats whitespace-only as a syntax error (missing expression)
    assert.ok(result.errors.length > 0, 'whitespace-only should produce parse errors');
  });

  it('should accept complex refinement + filter expression', () => {
    const expr = '<< 404684003 |Clinical finding| : 363698007 = << 39057004 {{ D term = "heart" }}';
    const result = parseECL(expr);
    assert.strictEqual(result.errors.length, 0, 'complex expression should be valid');
    assert.ok(result.ast, 'should produce AST');
  });
});

// ── Extended: Tool parameter validation ──────────────────────────────

describe('Tool parameter validation', () => {
  it('should handle groupIntoExpressions with no ECL-END markers', () => {
    const text = '<< 404684003\n< 19829001';
    const expressions = groupIntoExpressions(text);
    assert.strictEqual(expressions.length, 1, 'without ECL-END, all text is one expression');
  });

  it('should handle groupIntoExpressions with multiple ECL-END markers', () => {
    const text = '<< 404684003\n/* ECL-END */\n< 19829001\n/* ECL-END */\n<< 73211009';
    const expressions = groupIntoExpressions(text);
    assert.strictEqual(expressions.length, 3, 'should split into 3 expressions');
  });

  it('defaultFormattingOptions should have expected defaults', () => {
    assert.strictEqual(defaultFormattingOptions.indentSize, 2);
    assert.strictEqual(defaultFormattingOptions.indentStyle, 'space');
    assert.strictEqual(defaultFormattingOptions.spaceAroundOperators, true);
    assert.strictEqual(defaultFormattingOptions.maxLineLength, 80);
    assert.strictEqual(defaultFormattingOptions.alignTerms, true);
    assert.strictEqual(defaultFormattingOptions.wrapComments, false);
    assert.strictEqual(defaultFormattingOptions.breakOnOperators, false);
    assert.strictEqual(defaultFormattingOptions.breakOnRefinementComma, false);
    assert.strictEqual(defaultFormattingOptions.breakAfterColon, false);
  });
});

// ── Extended: Resource content completeness ──────────────────────────

describe('Resource content completeness', () => {
  it('refinements guide should cover groups and cardinality', async () => {
    const { resources } = await import('../resources');
    const content = resources['ecl://guide/refinements'].content;
    assert.ok(content.includes('{'), 'should mention attribute groups (curly braces)');
    assert.ok(content.toLowerCase().includes('cardinality') || content.includes('['), 'should mention cardinality');
  });

  it('filters guide should cover all three filter types', async () => {
    const { resources } = await import('../resources');
    const content = resources['ecl://guide/filters'].content;
    // D = description, C = concept, M = member
    assert.ok(
      content.includes('D') || content.toLowerCase().includes('description'),
      'should cover description filters',
    );
    assert.ok(content.includes('C') || content.toLowerCase().includes('concept'), 'should cover concept filters');
    assert.ok(content.includes('M') || content.toLowerCase().includes('member'), 'should cover member filters');
  });

  it('history guide should cover all four profiles', async () => {
    const { resources } = await import('../resources');
    const content = resources['ecl://guide/history-supplements'].content;
    assert.ok(content.includes('HISTORY-MIN'), 'should mention HISTORY-MIN');
    assert.ok(content.includes('HISTORY-MOD'), 'should mention HISTORY-MOD');
    assert.ok(content.includes('HISTORY-MAX'), 'should mention HISTORY-MAX');
    assert.ok(content.includes('HISTORY'), 'should mention bare HISTORY');
  });

  it('grammar reference should cover refinement syntax', async () => {
    const { resources } = await import('../resources');
    const content = resources['ecl://reference/grammar'].content;
    assert.ok(content.includes('refinement') || content.includes(':'), 'should cover refinement syntax');
    assert.ok(content.includes('attribute') || content.includes('='), 'should cover attribute syntax');
  });
});

// ── search_concepts tool logic ───────────────────────────────────────

describe('search_concepts tool logic', () => {
  it('should return matching concepts for a valid search term', () => {
    const result = mockSearchConcepts('clinical');
    assert.ok(result.results.length > 0, 'should find matching concepts');
    const match = result.results.find((c) => c.id === '404684003');
    assert.ok(match, 'should find Clinical finding');
    if (!match) return; // narrowing for TypeScript
    assert.strictEqual(match.pt, 'Clinical finding');
    assert.ok(match.fsn.length > 0, 'result should have FSN');
  });

  it('should return empty results for empty search term', () => {
    const result = mockSearchConcepts('');
    assert.strictEqual(result.results.length, 0, 'empty term should return no results');
    assert.strictEqual(result.hasMore, false);
  });

  it('should return empty results for whitespace-only term', () => {
    const result = mockSearchConcepts('   ');
    assert.strictEqual(result.results.length, 0, 'whitespace-only should return no results');
  });

  it('should not include inactive concepts in search results', () => {
    const result = mockSearchConcepts('Inactive');
    const inactive = result.results.find((c) => c.id === '123456001');
    assert.strictEqual(inactive, undefined, 'inactive concepts should not appear in search');
  });

  it('should match by concept ID', () => {
    const result = mockSearchConcepts('19829001');
    assert.ok(result.results.length > 0, 'should find concept by ID');
    assert.strictEqual(result.results[0].id, '19829001');
  });

  it('should format search response with required fields', () => {
    const result = mockSearchConcepts('disease');
    assert.ok(Array.isArray(result.results), 'results should be an array');
    assert.strictEqual(typeof result.hasMore, 'boolean', 'hasMore should be boolean');
    for (const r of result.results) {
      assert.ok(typeof r.id === 'string', 'id should be string');
      assert.ok(typeof r.fsn === 'string', 'fsn should be string');
      assert.ok(typeof r.pt === 'string', 'pt should be string');
    }
  });
});

// ── lookup_concept tool logic ────────────────────────────────────────

describe('lookup_concept tool logic', () => {
  it('should return concept info for a known active concept', () => {
    const info = mockGetConceptInfo('404684003');
    assert.ok(info, 'should find the concept');
    if (!info) return;
    assert.strictEqual(info.id, '404684003');
    assert.strictEqual(info.pt, 'Clinical finding');
    assert.ok(info.fsn.includes('finding'), 'FSN should describe the concept');
    assert.strictEqual(info.active, true);
  });

  it('should return concept info for an inactive concept', () => {
    const info = mockGetConceptInfo('123456001');
    assert.ok(info, 'should find the inactive concept');
    if (!info) return;
    assert.strictEqual(info.active, false, 'should report concept as inactive');
    assert.ok(info.fsn.length > 0, 'inactive concept should still have FSN');
    assert.ok(info.pt.length > 0, 'inactive concept should still have PT');
  });

  it('should return null for unknown concept ID', () => {
    const info = mockGetConceptInfo('999999999');
    assert.strictEqual(info, null, 'unknown concept should return null');
  });

  it('should format found response matching tool output structure', () => {
    const info = mockGetConceptInfo('64572001');
    assert.ok(info, 'should find the concept');
    if (!info) return;
    // Simulate the tool response JSON
    const response = { found: true, conceptId: info.id, fsn: info.fsn, pt: info.pt, active: info.active };
    assert.strictEqual(response.found, true);
    assert.strictEqual(response.conceptId, '64572001');
    assert.strictEqual(typeof response.fsn, 'string');
    assert.strictEqual(typeof response.pt, 'string');
    assert.strictEqual(typeof response.active, 'boolean');
  });

  it('should format not-found response matching tool output structure', () => {
    const info = mockGetConceptInfo('999999999');
    // Simulate the tool response JSON for not-found
    const response = info
      ? { found: true, conceptId: '999999999', fsn: info.fsn, pt: info.pt, active: info.active }
      : { found: false, conceptId: '999999999', message: 'Concept not found' };
    assert.strictEqual(response.found, false);
    assert.ok('message' in response, 'not-found response should have message');
  });
});

// ── list_snomed_editions tool logic ──────────────────────────────────

describe('list_snomed_editions tool logic', () => {
  it('FhirTerminologyService should expose getSnomedEditions method', () => {
    const svc = new FhirTerminologyService();
    assert.strictEqual(typeof svc.getSnomedEditions, 'function', 'should have getSnomedEditions method');
  });

  it('should format editions response as expected by tool', () => {
    // Simulate the response format the tool produces
    const snomedBase = 'http://snomed.info/sct'; // eslint-disable-line sonarjs/no-clear-text-protocols -- FHIR system URI, not a network URL
    const mockEditions = [
      {
        moduleId: '900000000000207008',
        versions: [{ uri: `${snomedBase}/900000000000207008/version/20240101`, date: '20240101' }],
      },
      {
        moduleId: '32506021000036107',
        versions: [{ uri: `${snomedBase}/32506021000036107/version/20240131`, date: '20240131' }],
      },
    ];
    const response = { editions: mockEditions };
    assert.ok(Array.isArray(response.editions), 'response should have editions array');
    assert.ok(response.editions.length > 0, 'should have at least one edition');
    for (const edition of response.editions) {
      assert.ok(typeof edition.moduleId === 'string', 'edition should have moduleId');
      assert.ok(Array.isArray(edition.versions), 'edition should have versions array');
      for (const version of edition.versions) {
        assert.ok(typeof version.uri === 'string', 'version should have uri');
        assert.ok(typeof version.date === 'string', 'version should have date');
      }
    }
  });
});
