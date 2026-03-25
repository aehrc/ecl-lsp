// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseECL } from '../parser';
import { extractConceptIds } from '../parser/concept-extractor';
import { MockTerminologyService } from '../terminology/mock-service';
import type { ConceptInfo, ITerminologyService, SearchResponse, EvaluationResponse } from '../terminology/types';

describe('Inactive Concept Detection', () => {
  const terminologyService = new MockTerminologyService();

  it('should identify active concepts', async () => {
    const text = '< 404684003';
    const result = parseECL(text);
    assert.ok(result.ast, 'AST should exist');

    const concepts = extractConceptIds(result.ast);
    assert.strictEqual(concepts.length, 1);

    const info = await terminologyService.getConceptInfo(concepts[0].id);
    assert.ok(info, 'Concept info should exist');
    assert.strictEqual(info.active, true);
    assert.strictEqual(info.id, '404684003');
    assert.strictEqual(info.fsn, 'Clinical finding (finding)');
  });

  it('should identify inactive concepts', async () => {
    const text = '< 123456001';
    const result = parseECL(text);
    assert.ok(result.ast, 'AST should exist');

    const concepts = extractConceptIds(result.ast);
    assert.strictEqual(concepts.length, 1);

    const info = await terminologyService.getConceptInfo(concepts[0].id);
    assert.ok(info, 'Concept info should exist');
    assert.strictEqual(info.active, false);
    assert.strictEqual(info.id, '123456001');
  });

  it('should check multiple concepts in expression', async () => {
    const text = '< 404684003 AND < 123456001';
    const result = parseECL(text);
    assert.ok(result.ast, 'AST should exist');

    const concepts = extractConceptIds(result.ast);
    assert.strictEqual(concepts.length, 2, `Expected 2 concepts, found ${concepts.length}`);

    const conceptIds = concepts.map((c) => c.id);
    const info1 = await terminologyService.getConceptInfo(conceptIds.find((id) => id === '404684003') || '');
    const info2 = await terminologyService.getConceptInfo(conceptIds.find((id) => id === '123456001') || '');

    assert.strictEqual(info1?.active, true, 'First concept should be active');
    assert.strictEqual(info2?.active, false, 'Second concept should be inactive');
  });

  it('should handle unknown concepts gracefully', async () => {
    const text = '< 999999999';
    const result = parseECL(text);
    assert.ok(result.ast, 'AST should exist');

    const concepts = extractConceptIds(result.ast);
    assert.strictEqual(concepts.length, 1);

    const info = await terminologyService.getConceptInfo(concepts[0].id);
    assert.strictEqual(info, null, 'Unknown concept should return null');
  });

  it('should extract concepts from refinements', async () => {
    const text = '< 404684003 : 363698007 = < 39057004';
    const result = parseECL(text);
    assert.ok(result.ast, 'AST should exist');

    const concepts = extractConceptIds(result.ast);
    assert.strictEqual(concepts.length, 3, `Expected 3 concepts, found ${concepts.length}`);

    // Check that all concepts can be looked up
    for (const concept of concepts) {
      const info = await terminologyService.getConceptInfo(concept.id);
      // Some will be null (not in mock data), but should not throw
      if (info) {
        assert.ok(typeof info.active === 'boolean', 'Active status should be boolean');
      }
    }
  });

  it('should preserve concept positions for diagnostics', async () => {
    const text = '< 404684003 AND < 123456001';
    const result = parseECL(text);
    assert.ok(result.ast, 'AST should exist');

    const concepts = extractConceptIds(result.ast);
    assert.strictEqual(concepts.length, 2, `Expected 2 concepts, found ${concepts.length}`);

    // Concepts should have ranges
    assert.ok(concepts[0].range, 'First concept should have range');
    assert.ok(concepts[0].range.start.column >= 0, 'First concept should have valid start position');

    assert.ok(concepts[1].range, 'Second concept should have range');
    assert.ok(concepts[1].range.start.column >= 0, 'Second concept should have valid start position');
  });
});

describe('Bulk Concept Validation', () => {
  const terminologyService = new MockTerminologyService();

  it('should validate multiple concepts in one call', async () => {
    const results = await terminologyService.validateConcepts(['404684003', '363698007', '39057004']);
    assert.strictEqual(results.size, 3);
    assert.strictEqual(results.get('404684003')?.active, true);
    assert.strictEqual(results.get('363698007')?.active, true);
    assert.strictEqual(results.get('39057004')?.active, true);
  });

  it('should return null for unknown concepts', async () => {
    const results = await terminologyService.validateConcepts(['404684003', '999999999']);
    assert.strictEqual(results.size, 2);
    assert.ok(results.get('404684003'), 'Known concept should have info');
    assert.strictEqual(results.get('999999999'), null, 'Unknown concept should be null');
  });

  it('should detect inactive concepts in bulk', async () => {
    const results = await terminologyService.validateConcepts(['404684003', '123456001']);
    assert.strictEqual(results.size, 2);
    assert.strictEqual(results.get('404684003')?.active, true);
    assert.strictEqual(results.get('123456001')?.active, false);
  });

  it('should return empty map for empty input', async () => {
    const results = await terminologyService.validateConcepts([]);
    assert.strictEqual(results.size, 0);
  });

  it('should handle single concept', async () => {
    const results = await terminologyService.validateConcepts(['404684003']);
    assert.strictEqual(results.size, 1);
    assert.strictEqual(results.get('404684003')?.id, '404684003');
  });

  it('should return concept info fields for known concepts', async () => {
    const results = await terminologyService.validateConcepts(['404684003']);
    const info = results.get('404684003');
    assert.ok(info);
    assert.strictEqual(info.id, '404684003');
    assert.strictEqual(info.fsn, 'Clinical finding (finding)');
    assert.strictEqual(info.pt, 'Clinical finding');
    assert.strictEqual(info.active, true);
  });

  it('should validate all concepts from a refinement expression', async () => {
    const text = '< 404684003 : 363698007 = < 39057004';
    const result = parseECL(text);
    assert.ok(result.ast);

    const concepts = extractConceptIds(result.ast);
    const ids = concepts.map((c) => c.id);
    const results = await terminologyService.validateConcepts(ids);

    assert.strictEqual(results.size, 3);
    for (const id of ids) {
      assert.ok(results.has(id), `Should have result for ${id}`);
      assert.ok(results.get(id), `Concept ${id} should be found`);
    }
  });
});

// ─── Diagnostic message format ──────────────────────────────────────────────
//
// These tests verify that the diagnostic message generation logic (replicated
// from server.ts validateDocument) produces the correct, distinct messages for
// unknown concepts, inactive concepts, and active concepts.

/**
 * Replicates the diagnostic message logic from server.ts for a single concept.
 * Returns the warning message string, or null if no warning should be emitted.
 */
function buildConceptWarning(info: ConceptInfo | null, conceptId: string): string | null {
  if (info === null) {
    return `Unknown concept ${conceptId} — not found in terminology server. Check the concept ID is correct.`;
  }
  if (!info.active) {
    const name = info.pt || info.fsn;
    const nameLabel = name ? ` |${name}|` : '';
    return `Inactive concept ${conceptId}${nameLabel} — consider using an active replacement.`;
  }
  return null; // active — no warning
}

describe('Concept diagnostic message format', () => {
  const terminologyService = new MockTerminologyService();

  it('active concept produces no warning', async () => {
    const info = await terminologyService.getConceptInfo('404684003');
    const msg = buildConceptWarning(info, '404684003');
    assert.strictEqual(msg, null, 'Active concept should produce no warning');
  });

  it('unknown concept (null) produces "Unknown concept" message', async () => {
    const info = await terminologyService.getConceptInfo('999999999');
    assert.strictEqual(info, null);
    const msg = buildConceptWarning(info, '999999999');
    assert.ok(msg);
    assert.ok(msg.startsWith('Unknown concept 999999999'), `Should start with "Unknown concept", got: ${msg}`);
    assert.ok(msg.includes('not found in terminology server'), `Should mention "not found", got: ${msg}`);
    assert.ok(!msg.includes('inactive'), `Unknown message should NOT mention "inactive", got: ${msg}`);
    assert.ok(!msg.includes('Inactive'), `Unknown message should NOT mention "Inactive", got: ${msg}`);
  });

  it('inactive concept produces "Inactive concept" message with display name', async () => {
    const info = await terminologyService.getConceptInfo('123456001');
    assert.ok(info);
    assert.strictEqual(info.active, false);
    const msg = buildConceptWarning(info, '123456001');
    assert.ok(msg);
    assert.ok(msg.startsWith('Inactive concept 123456001'), `Should start with "Inactive concept", got: ${msg}`);
    assert.ok(msg.includes('|Inactive concept|'), `Should include display name in pipes, got: ${msg}`);
    assert.ok(msg.includes('active replacement'), `Should suggest replacement, got: ${msg}`);
    assert.ok(!msg.includes('Unknown'), `Inactive message should NOT say "Unknown", got: ${msg}`);
    assert.ok(!msg.includes('not found'), `Inactive message should NOT say "not found", got: ${msg}`);
  });

  it('inactive concept without display name omits name label', () => {
    const info: ConceptInfo = { id: '111111111', fsn: '', pt: '', active: false };
    const msg = buildConceptWarning(info, '111111111');
    assert.ok(msg);
    assert.ok(!msg.includes('||'), `Should not have empty pipes, got: ${msg}`);
    assert.strictEqual(msg, 'Inactive concept 111111111 — consider using an active replacement.');
  });

  it('unknown and inactive messages are clearly distinct', async () => {
    const unknownMsg = buildConceptWarning(null, '999999999');
    const inactiveInfo = await terminologyService.getConceptInfo('123456001');
    const inactiveMsg = buildConceptWarning(inactiveInfo, '123456001');
    assert.ok(unknownMsg);
    assert.ok(inactiveMsg);
    // Messages should have different prefixes
    assert.ok(unknownMsg.startsWith('Unknown'), 'Unknown starts with "Unknown"');
    assert.ok(inactiveMsg.startsWith('Inactive'), 'Inactive starts with "Inactive"');
    assert.notStrictEqual(unknownMsg, inactiveMsg, 'Messages should be different');
  });

  it('bulk validation correctly distinguishes active, inactive, and unknown', async () => {
    const results = await terminologyService.validateConcepts(['404684003', '123456001', '999999999']);

    const activeMsg = buildConceptWarning(results.get('404684003') ?? null, '404684003');
    const inactiveMsg = buildConceptWarning(results.get('123456001') ?? null, '123456001');
    const unknownMsg = buildConceptWarning(results.get('999999999') ?? null, '999999999');

    assert.strictEqual(activeMsg, null, 'Active concept: no warning');
    assert.ok(inactiveMsg?.startsWith('Inactive'), 'Inactive concept: starts with Inactive');
    assert.ok(unknownMsg?.startsWith('Unknown'), 'Unknown concept: starts with Unknown');
  });

  it('message includes preferred term when available', async () => {
    const info = await terminologyService.getConceptInfo('404684003');
    // Simulate inactive with known PT
    const inactiveInfo: ConceptInfo = { ...info!, active: false };
    const msg = buildConceptWarning(inactiveInfo, '404684003');
    assert.ok(msg);
    assert.ok(msg.includes('|Clinical finding|'), `Should include PT in pipes, got: ${msg}`);
  });

  it('message uses FSN when PT is empty', () => {
    const info: ConceptInfo = { id: '222222222', fsn: 'Some finding (finding)', pt: '', active: false };
    const msg = buildConceptWarning(info, '222222222');
    assert.ok(msg);
    assert.ok(msg.includes('|Some finding (finding)|'), `Should fall back to FSN, got: ${msg}`);
  });
});

// ─── validateConcepts fallback behaviour ────────────────────────────────────
//
// Simulates the FhirTerminologyService pattern: bulk expand returns only active
// concepts (inactive ones are missing), so validateConcepts must fall back to
// individual getConceptInfo lookups for the missing IDs.

/**
 * A mock service that simulates a FHIR server where $expand excludes inactive
 * concepts. validateConcepts uses bulk first, then individual lookups for any
 * IDs not returned by bulk (mirroring the real FhirTerminologyService logic).
 */
class BulkExpandOmitsInactiveMock implements ITerminologyService {
  private readonly data = new Map<string, ConceptInfo>([
    ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
    ['123456001', { id: '123456001', fsn: 'Inactive concept (finding)', pt: 'Inactive concept', active: false }],
  ]);

  // Individual lookup returns everything (like $lookup does)
  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    return this.data.get(conceptId) ?? null;
  }

  // Bulk expand only returns active concepts (simulating the old bug)
  private async bulkExpand(ids: string[]): Promise<Map<string, ConceptInfo>> {
    const results = new Map<string, ConceptInfo>();
    for (const id of ids) {
      const info = this.data.get(id);
      if (info?.active) {
        results.set(id, info);
      }
      // Inactive concepts are silently excluded
    }
    return results;
  }

  // Mirrors FhirTerminologyService.validateConcepts with fallback
  async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
    const results = new Map<string, ConceptInfo | null>();
    const expandResults = await this.bulkExpand(conceptIds);

    const missingIds: string[] = [];
    for (const id of conceptIds) {
      const info = expandResults.get(id);
      if (info) {
        results.set(id, info);
      } else {
        missingIds.push(id);
      }
    }

    // Fallback: individual lookup for concepts missing from expansion
    if (missingIds.length > 0) {
      const lookups = missingIds.map(async (id) => {
        const info = await this.getConceptInfo(id);
        results.set(id, info);
      });
      await Promise.all(lookups);
    }

    return results;
  }

  async searchConcepts(): Promise<SearchResponse> {
    return { results: [], hasMore: false };
  }

  async evaluateEcl(): Promise<EvaluationResponse> {
    return { total: 0, concepts: [], truncated: false };
  }
}

describe('validateConcepts fallback for inactive concepts', () => {
  const service = new BulkExpandOmitsInactiveMock();

  it('active concept returned directly by bulk expand', async () => {
    const results = await service.validateConcepts(['404684003']);
    const info = results.get('404684003');
    assert.ok(info, 'Active concept should be found');
    assert.strictEqual(info.active, true);
  });

  it('inactive concept recovered via individual lookup fallback', async () => {
    const results = await service.validateConcepts(['123456001']);
    const info = results.get('123456001');
    assert.ok(info, 'Inactive concept should be found via fallback');
    assert.strictEqual(info.active, false, 'Should be detected as inactive');
  });

  it('unknown concept returns null even after fallback', async () => {
    const results = await service.validateConcepts(['999999999']);
    assert.strictEqual(results.get('999999999'), null, 'Unknown concept stays null');
  });

  it('mixed batch: active from bulk, inactive from fallback, unknown stays null', async () => {
    const results = await service.validateConcepts(['404684003', '123456001', '999999999']);
    assert.strictEqual(results.size, 3);

    const active = results.get('404684003');
    assert.ok(active);
    assert.strictEqual(active.active, true, 'Active from bulk expand');

    const inactive = results.get('123456001');
    assert.ok(inactive, 'Inactive should be recovered');
    assert.strictEqual(inactive.active, false, 'Inactive from individual lookup');

    assert.strictEqual(results.get('999999999'), null, 'Unknown stays null');
  });

  it('diagnostic messages correct after fallback recovery', async () => {
    const results = await service.validateConcepts(['404684003', '123456001', '999999999']);

    const activeMsg = buildConceptWarning(results.get('404684003') ?? null, '404684003');
    const inactiveMsg = buildConceptWarning(results.get('123456001') ?? null, '123456001');
    const unknownMsg = buildConceptWarning(results.get('999999999') ?? null, '999999999');

    assert.strictEqual(activeMsg, null, 'Active: no warning');
    assert.ok(inactiveMsg?.startsWith('Inactive'), 'Inactive: correct message after fallback');
    assert.ok(unknownMsg?.startsWith('Unknown'), 'Unknown: correct message');
  });
});
