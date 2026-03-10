// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseInput, processEcl } from '../ecl-processor';
import type { ITerminologyService, ConceptInfo, EvaluationResponse } from 'ecl-core';

describe('parseInput', () => {
  it('should extract bare ECL with no flags', () => {
    const result = parseInput('< 404684003 |Clinical finding|');
    assert.strictEqual(result.ecl, '< 404684003 |Clinical finding|');
    assert.strictEqual(result.evaluate, false);
    assert.strictEqual(result.edition, undefined);
  });

  it('should extract --eval flag', () => {
    const result = parseInput('--eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
  });

  it('should extract --edition flag with value', () => {
    const result = parseInput('--edition au < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.edition, 'au');
  });

  it('should extract both flags together', () => {
    const result = parseInput('--eval --edition us < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
    assert.strictEqual(result.edition, 'us');
  });

  it('should handle flags in any order', () => {
    const result = parseInput('--edition nz --eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
    assert.strictEqual(result.edition, 'nz');
  });

  it('should detect help input', () => {
    const result = parseInput('help');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.help, true);
  });

  it('should detect empty input as help', () => {
    const result = parseInput('');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.help, true);
  });

  it('should detect whitespace-only input as help', () => {
    const result = parseInput('   ');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.help, true);
  });

  it('should return error when --edition has no value', () => {
    const result = parseInput('--edition');
    assert.strictEqual(result.error, '--edition requires a value (e.g. --edition au)');
  });
});

// ── Mock terminology service ────────────────────────────────────────────

function createMockService(overrides?: Partial<ITerminologyService>): ITerminologyService {
  return {
    getConceptInfo: async () => null,
    validateConcepts: async () => new Map(),
    searchConcepts: async () => ({ results: [], hasMore: false }),
    evaluateEcl: async (): Promise<EvaluationResponse> => ({ total: 0, concepts: [], truncated: false }),
    ...overrides,
  };
}

describe('processEcl', () => {
  it('should format valid ECL and return no errors', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.formatted.includes('404684003'));
  });

  it('should return syntax errors for invalid ECL', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003 AND AND < 19829001', service);
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].severity, 'error');
  });

  it('should format multi-line ECL', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003\n  AND < 19829001', service);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.formatted.includes('404684003'));
    assert.ok(result.formatted.includes('19829001'));
  });

  it('should include default edition label', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.edition, 'Server default');
  });

  it('should add display terms from FHIR lookup', async () => {
    const service = createMockService({
      validateConcepts: async (ids: string[]) => {
        const map = new Map<string, ConceptInfo | null>();
        if (ids.includes('404684003')) {
          map.set('404684003', {
            id: '404684003',
            fsn: 'Clinical finding (finding)',
            pt: 'Clinical finding',
            active: true,
          });
        }
        return map;
      },
    });
    const result = await processEcl('< 404684003', service);
    assert.ok(result.formatted.includes('Clinical finding'));
  });

  it('should warn about inactive concepts', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        const map = new Map<string, ConceptInfo | null>();
        map.set('399144008', {
          id: '399144008',
          fsn: 'Bronze diabetes (disorder)',
          pt: 'Bronze diabetes',
          active: false,
        });
        return map;
      },
    });
    const result = await processEcl('< 399144008 |Bronze diabetes|', service);
    assert.ok(result.warnings.some((w) => w.message.includes('Inactive concept')));
  });

  it('should degrade gracefully when FHIR is unavailable', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        throw new Error('Connection refused');
      },
    });
    const result = await processEcl('< 404684003', service);
    // Still formats successfully
    assert.ok(result.formatted.includes('404684003'));
    // Adds a warning about unavailability
    assert.ok(result.warnings.some((w) => w.message.includes('Terminology server unavailable')));
  });

  it('should include evaluation results when --eval is used', async () => {
    const service = createMockService({
      evaluateEcl: async () => ({
        total: 3,
        concepts: [
          { code: '73211009', display: 'Diabetes mellitus' },
          { code: '44054006', display: 'Type 2 diabetes mellitus' },
          { code: '46635009', display: 'Type 1 diabetes mellitus' },
        ],
        truncated: false,
      }),
    });
    const result = await processEcl('< 404684003', service, { evaluate: true });
    assert.ok(result.evaluation);
    assert.strictEqual(result.evaluation!.count, 3);
    assert.strictEqual(result.evaluation!.sample.length, 3);
  });

  it('should not evaluate when there are syntax errors', async () => {
    const service = createMockService({
      evaluateEcl: async () => {
        throw new Error('should not be called');
      },
    });
    const result = await processEcl('< 404684003 AND AND', service, { evaluate: true });
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.evaluation, undefined);
  });

  it('should pass edition label through to result', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service, { edition: 'SNOMED CT Australian' });
    assert.strictEqual(result.edition, 'SNOMED CT Australian');
  });
});
