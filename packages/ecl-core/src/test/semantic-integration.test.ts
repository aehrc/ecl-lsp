// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseECL } from '../parser';
import { validateSemantics, SemanticDiagnostic } from '../semantic/validator';
import { FhirTerminologyService } from '../terminology/fhir-service';

const SKIP = !process.env.FHIR_INTEGRATION;
const TIMEOUT = 30_000;

/**
 * Integration tests against a live FHIR terminology server.
 *
 * These tests are SKIPPED by default. Run with:
 *   FHIR_INTEGRATION=1 npm test
 *   — or —
 *   npm run test:integration
 *
 * Requires network access to https://tx.ontoserver.csiro.au/fhir
 */

const svc = new FhirTerminologyService({ baseUrl: 'https://tx.ontoserver.csiro.au/fhir', timeout: 15_000 });

// ─── Concept Lookup ─────────────────────────────────────────────────────────

describe('Concept Lookup — FHIR Integration', { skip: SKIP }, () => {
  it('should return info for an active concept', { timeout: TIMEOUT }, async () => {
    const info = await svc.getConceptInfo('404684003');
    assert.ok(info, 'Should find 404684003');
    assert.strictEqual(info.id, '404684003');
    assert.strictEqual(info.active, true);
    assert.ok(
      info.fsn.toLowerCase().includes('clinical finding'),
      `FSN should contain "clinical finding", got: ${info.fsn}`,
    );
    assert.ok(info.pt.length > 0, 'PT should be non-empty');
  });

  it('should return info for an inactive concept', { timeout: TIMEOUT }, async () => {
    // 399144008 |Bronze diabetes| is inactive
    const info = await svc.getConceptInfo('399144008');
    assert.ok(info, 'Should find 399144008');
    assert.strictEqual(info.active, false);
  });

  it('should return null for an unknown concept', { timeout: TIMEOUT }, async () => {
    const info = await svc.getConceptInfo('999999999');
    assert.strictEqual(info, null);
  });

  it('should return all expected fields', { timeout: TIMEOUT }, async () => {
    const info = await svc.getConceptInfo('363698007');
    assert.ok(info, 'Should find 363698007');
    assert.strictEqual(typeof info.id, 'string');
    assert.strictEqual(typeof info.fsn, 'string');
    assert.strictEqual(typeof info.pt, 'string');
    assert.strictEqual(typeof info.active, 'boolean');
  });
});

// ─── Bulk Concept Validation ────────────────────────────────────────────────

describe('Bulk Concept Validation — FHIR Integration', { skip: SKIP }, () => {
  it('should validate multiple concepts in one call', { timeout: TIMEOUT }, async () => {
    const results = await svc.validateConcepts(['404684003', '363698007', '39057004']);
    assert.strictEqual(results.size, 3);
    for (const [id, info] of results) {
      assert.ok(info, `Should find concept ${id}`);
      assert.strictEqual(info.active, true);
    }
  });

  it('should return null for unknown concepts in bulk', { timeout: TIMEOUT }, async () => {
    const results = await svc.validateConcepts(['404684003', '999999999']);
    assert.ok(results.get('404684003'), 'Should find 404684003');
    assert.strictEqual(results.get('999999999'), null, 'Should return null for unknown');
  });

  it('should detect inactive concepts in bulk', { timeout: TIMEOUT }, async () => {
    // 399144008 |Bronze diabetes| is inactive
    const results = await svc.validateConcepts(['404684003', '399144008']);
    assert.strictEqual(results.get('404684003')?.active, true);
    assert.strictEqual(results.get('399144008')?.active, false);
  });

  it('should return empty map for empty input', { timeout: TIMEOUT }, async () => {
    const results = await svc.validateConcepts([]);
    assert.strictEqual(results.size, 0);
  });
});

// ─── Concept Search ─────────────────────────────────────────────────────────

describe('Concept Search — FHIR Integration', { skip: SKIP }, () => {
  it('should find concepts by description term', { timeout: TIMEOUT }, async () => {
    const response = await svc.searchConcepts('diabetes mellitus');
    assert.ok(response.results.length > 0, 'Should find diabetes concepts');
    assert.ok(
      response.results.some((r) => r.pt.toLowerCase().includes('diabetes')),
      'At least one result should mention diabetes',
    );
  });

  it('should find concept by exact ID', { timeout: TIMEOUT }, async () => {
    const response = await svc.searchConcepts('404684003');
    assert.ok(response.results.length > 0, 'Should find by ID');
    assert.ok(
      response.results.some((r) => r.id === '404684003'),
      'Should include the exact concept',
    );
  });

  it('should return empty results for nonsense query', { timeout: TIMEOUT }, async () => {
    const response = await svc.searchConcepts('xyzzznonexistent12345');
    assert.strictEqual(response.results.length, 0);
  });

  it('should be case insensitive', { timeout: TIMEOUT }, async () => {
    const lower = await svc.searchConcepts('disorder');
    const upper = await svc.searchConcepts('DISORDER');
    assert.ok(lower.results.length > 0, 'Lowercase should find results');
    assert.ok(upper.results.length > 0, 'Uppercase should find results');
  });

  it('should return results with all expected fields', { timeout: TIMEOUT }, async () => {
    const response = await svc.searchConcepts('heart');
    assert.ok(response.results.length > 0);
    const first = response.results[0];
    assert.strictEqual(typeof first.id, 'string');
    assert.strictEqual(typeof first.fsn, 'string');
    assert.strictEqual(typeof first.pt, 'string');
  });
});

// ─── ECL Evaluation ─────────────────────────────────────────────────────────

describe('ECL Evaluation — FHIR Integration', { skip: SKIP }, () => {
  it('should evaluate a descendant-of expression', { timeout: TIMEOUT }, async () => {
    // < 404684003 |Clinical finding| has thousands of descendants
    const result = await svc.evaluateEcl('< 404684003', 5);
    assert.ok(result.total > 0, 'Should have descendants');
    assert.ok(result.concepts.length <= 5, 'Should respect limit');
    assert.ok(result.concepts.length > 0, 'Should return some concepts');
    for (const c of result.concepts) {
      assert.strictEqual(typeof c.code, 'string');
      assert.strictEqual(typeof c.display, 'string');
    }
  });

  it('should evaluate descendant-or-self', { timeout: TIMEOUT }, async () => {
    const result = await svc.evaluateEcl('<< 404684003', 5);
    assert.ok(result.total > 0);
    // descendant-or-self should include the concept itself
    assert.ok(result.total >= 1);
  });

  it('should evaluate a compound AND expression', { timeout: TIMEOUT }, async () => {
    // Clinical findings that are also disorders
    const result = await svc.evaluateEcl('< 404684003 AND < 64572001', 5);
    assert.ok(result.total > 0, 'Should find clinical findings that are diseases');
  });

  it('should evaluate a compound OR expression', { timeout: TIMEOUT }, async () => {
    const result = await svc.evaluateEcl('< 404684003 OR < 71388002', 5);
    assert.ok(result.total > 0);
  });

  it('should evaluate a MINUS expression', { timeout: TIMEOUT }, async () => {
    const result = await svc.evaluateEcl('< 404684003 MINUS < 64572001', 5);
    assert.ok(result.total > 0, 'Should find clinical findings that are NOT diseases');
  });

  it('should evaluate a refinement expression', { timeout: TIMEOUT }, async () => {
    // Clinical findings with finding site = lung structure
    const result = await svc.evaluateEcl('< 404684003 : 363698007 = << 39607008', 5);
    assert.ok(result.total > 0, 'Should find clinical findings with lung as finding site');
  });

  it('should respect limit parameter', { timeout: TIMEOUT }, async () => {
    const small = await svc.evaluateEcl('< 404684003', 3);
    assert.ok(small.concepts.length <= 3, `Limit 3: got ${small.concepts.length}`);
    assert.ok(small.truncated, 'Should be truncated with limit=3');
  });

  it('should set truncated=false when all results fit', { timeout: TIMEOUT }, async () => {
    // 138875005 is SNOMED CT root, "self" should be exactly 1 concept
    const result = await svc.evaluateEcl('138875005', 10);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.truncated, false);
  });

  it('should return empty for impossible expression', { timeout: TIMEOUT }, async () => {
    // Concepts that are both clinical findings AND procedures (shouldn't overlap at top level)
    const result = await svc.evaluateEcl('< 404684003 MINUS << 404684003', 5);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.concepts.length, 0);
  });

  it('should evaluate member-of expression', { timeout: TIMEOUT }, async () => {
    // ^ 900000000000497000 = CTV3 simple map reference set (present in all SNOMED editions)
    const result = await svc.evaluateEcl('^ 900000000000497000', 5);
    assert.strictEqual(typeof result.total, 'number', 'total should be a number');
    assert.ok(Array.isArray(result.concepts), 'concepts should be an array');
    assert.ok(result.total > 0, 'CTV3 simple map refset should have members');
  });
});

// ─── Historical Associations ──────────────────────────────────────────────

describe('Historical Associations — FHIR Integration', { skip: SKIP }, () => {
  it('should find SAME AS association for 261282001 (Black hellebore)', { timeout: TIMEOUT }, async () => {
    const associations = await svc.getHistoricalAssociations('261282001');
    assert.ok(associations.length > 0, 'Should find at least one association');
    const sameAs = associations.find((a) => a.type === 'same-as');
    assert.ok(sameAs, 'Should have a SAME AS association');
    assert.strictEqual(sameAs.targets.length, 1, 'SAME AS should have exactly one target');
    assert.strictEqual(sameAs.targets[0].code, '52323007', 'Target should be 52323007 (Helleborus niger)');
    assert.ok(sameAs.targets[0].display.length > 0, 'Target should have a display term');
  });

  it('should return empty for an active concept', { timeout: TIMEOUT }, async () => {
    const associations = await svc.getHistoricalAssociations('404684003');
    assert.strictEqual(associations.length, 0, 'Active concept should have no historical associations');
  });

  it('should return empty for an unknown concept', { timeout: TIMEOUT }, async () => {
    const associations = await svc.getHistoricalAssociations('999999999');
    assert.strictEqual(associations.length, 0, 'Unknown concept should have no historical associations');
  });

  it('should return associations ordered by specificity', { timeout: TIMEOUT }, async () => {
    // 261282001 has SAME AS — verify it comes first if present
    const associations = await svc.getHistoricalAssociations('261282001');
    if (associations.length > 0) {
      const typeOrder = ['same-as', 'replaced-by', 'possibly-equivalent-to', 'alternative'];
      for (let i = 1; i < associations.length; i++) {
        const prevIdx = typeOrder.indexOf(associations[i - 1].type);
        const currIdx = typeOrder.indexOf(associations[i].type);
        assert.ok(
          prevIdx <= currIdx,
          `Associations should be ordered by specificity: ${associations.map((a) => a.type).join(', ')}`,
        );
      }
    }
  });

  it('should include refsetId in each association', { timeout: TIMEOUT }, async () => {
    const associations = await svc.getHistoricalAssociations('261282001');
    for (const assoc of associations) {
      assert.ok(assoc.refsetId.length > 0, `refsetId should be non-empty for ${assoc.type}`);
      assert.ok(/^\d+$/.test(assoc.refsetId), `refsetId should be numeric for ${assoc.type}`);
    }
  });
});

// ─── Semantic Validation ────────────────────────────────────────────────────

function parseAndValidate(text: string): Promise<SemanticDiagnostic[]> {
  const result = parseECL(text);
  assert.ok(result.ast, `AST should exist for: ${text}`);
  return validateSemantics(result.ast, text, svc);
}

describe('Semantic Validation — FHIR Integration', { skip: SKIP }, () => {
  it('valid refinement produces no warnings', { timeout: TIMEOUT }, async () => {
    const diags = await parseAndValidate(
      '< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|',
    );

    const semanticWarnings = diags.filter(
      (d) =>
        d.message.includes('Linkage concept') ||
        d.message.includes('no concepts in common') ||
        d.message.includes('refinement matches no concepts') ||
        d.message.includes('matches no concepts'),
    );
    assert.strictEqual(
      semanticWarnings.length,
      0,
      `Expected no semantic warnings, got: ${semanticWarnings.map((d) => d.message).join('; ')}`,
    );
  });

  it('non-linkage attribute produces attribute scope warning', { timeout: TIMEOUT }, async () => {
    // 22298006 |Myocardial infarction| is NOT a linkage concept
    const diags = await parseAndValidate(
      '< 404684003 |Clinical finding| : 22298006 |Myocardial infarction| = < 39057004 |Pulmonary valve structure|',
    );

    const attrWarnings = diags.filter(
      (d) => d.message.includes('Linkage concept') || d.message.includes('not a valid SNOMED CT attribute'),
    );
    assert.ok(
      attrWarnings.length >= 1,
      `Expected attribute scope warning, got: ${diags.map((d) => d.message).join('; ')}`,
    );
  });

  it('disjoint value produces value constraint warning', { timeout: TIMEOUT }, async () => {
    // 387713003 |Surgical procedure| is not in the range of Finding site on Clinical finding
    const diags = await parseAndValidate(
      '< 404684003 |Clinical finding| : 363698007 |Finding site| = < 387713003 |Surgical procedure|',
    );

    const valueWarnings = diags.filter((d) => d.message.includes('no concepts in common'));
    assert.ok(
      valueWarnings.length >= 1,
      `Expected value constraint warning, got: ${diags.map((d) => d.message).join('; ')}`,
    );
  });

  it('impossible individual refinement produces warning', { timeout: TIMEOUT }, async () => {
    // Second pair impossible: morphology = stapling on clinical finding
    const diags = await parseAndValidate(
      '< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|, 116676008 |Associated morphology| = < 69695003 |Stapling|',
    );

    const refinementWarnings = diags.filter((d) => d.message.includes('refinement matches no concepts'));
    assert.ok(
      refinementWarnings.length >= 1,
      `Expected refinement warning on impossible pair, got: ${diags.map((d) => d.message).join('; ')}`,
    );
  });

  it('simple expression with no refinement produces no warnings', { timeout: TIMEOUT }, async () => {
    const diags = await parseAndValidate('< 404684003 |Clinical finding|');
    assert.strictEqual(diags.length, 0);
  });

  it('compound expression with valid operands produces no warnings', { timeout: TIMEOUT }, async () => {
    const diags = await parseAndValidate('< 404684003 |Clinical finding| AND < 64572001 |Disease|');
    const emptyWarnings = diags.filter((d) => d.message.includes('matches no concepts'));
    assert.strictEqual(emptyWarnings.length, 0);
  });

  it('wildcard value skips value and refinement checks', { timeout: TIMEOUT }, async () => {
    const diags = await parseAndValidate('< 404684003 |Clinical finding| : 363698007 |Finding site| = *');
    const valueDiags = diags.filter(
      (d) => d.message.includes('no concepts in common') || d.message.includes('refinement matches no concepts'),
    );
    assert.strictEqual(valueDiags.length, 0);
  });
});
