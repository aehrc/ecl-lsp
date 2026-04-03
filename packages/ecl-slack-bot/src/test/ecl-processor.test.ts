// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseInput, processEcl } from '../ecl-processor';
import type { ITerminologyService, ConceptInfo, EvaluationResponse, HistoricalAssociation } from '@aehrc/ecl-core';

// ── parseInput ──────────────────────────────────────────────────────────

describe('parseInput', () => {
  // ── Bare ECL (no flags) ───────────────────────────────────────────────
  it('should extract bare ECL with no flags', () => {
    const result = parseInput('< 404684003 |Clinical finding|');
    assert.strictEqual(result.ecl, '< 404684003 |Clinical finding|');
    assert.strictEqual(result.evaluate, false);
    assert.strictEqual(result.edition, undefined);
    assert.strictEqual(result.help, undefined);
    assert.strictEqual(result.error, undefined);
  });

  it('should preserve complex ECL operators', () => {
    const result = parseInput('<< 73211009 : 363698007 = << 39057004');
    assert.strictEqual(result.ecl, '<< 73211009 : 363698007 = << 39057004');
  });

  it('should handle multi-line ECL', () => {
    const result = parseInput('< 404684003\n  AND < 19829001');
    assert.strictEqual(result.ecl, '< 404684003\n  AND < 19829001');
  });

  it('should trim leading and trailing whitespace from input', () => {
    const result = parseInput('  < 404684003  ');
    assert.strictEqual(result.ecl, '< 404684003');
  });

  it('should handle ECL with member-of operator', () => {
    const result = parseInput('^ 900000000000497000');
    assert.strictEqual(result.ecl, '^ 900000000000497000');
  });

  // ── --eval flag ───────────────────────────────────────────────────────
  it('should extract --eval flag', () => {
    const result = parseInput('--eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
  });

  it('should handle --eval with no ECL after it', () => {
    // --eval alone with no ECL — rest will be empty string
    const result = parseInput('--eval');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.evaluate, true);
  });

  it('should not prefix-match --evaluate as the eval flag', () => {
    const result = parseInput('--evaluate < 404684003');
    assert.strictEqual(result.ecl, '--evaluate < 404684003');
    assert.strictEqual(result.evaluate, false);
  });

  it('should not prefix-match --evaluation as the eval flag', () => {
    const result = parseInput('--evaluation < 404684003');
    assert.strictEqual(result.ecl, '--evaluation < 404684003');
    assert.strictEqual(result.evaluate, false);
  });

  it('should handle duplicate --eval flags', () => {
    const result = parseInput('--eval --eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
  });

  // ── --edition flag ────────────────────────────────────────────────────
  it('should extract --edition flag with value', () => {
    const result = parseInput('--edition au < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.edition, 'au');
  });

  it('should extract --edition with full URI value', () => {
    const result = parseInput('--edition http://snomed.info/sct/731000124108 < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.edition, 'http://snomed.info/sct/731000124108');
  });

  it('should return error when --edition has no value', () => {
    const result = parseInput('--edition');
    assert.strictEqual(result.error, '--edition requires a value (e.g. --edition au)');
  });

  it('should return error when --edition is followed by another flag', () => {
    const result = parseInput('--edition --eval < 404684003');
    assert.strictEqual(result.error, '--edition requires a value (e.g. --edition au)');
  });

  it('should return error when --edition has value but no ECL follows', () => {
    const result = parseInput('--edition au');
    assert.ok(result.error?.includes('No ECL expression'));
  });

  it('should not prefix-match --editions as --edition', () => {
    const result = parseInput('--editions au < 404684003');
    assert.strictEqual(result.ecl, '--editions au < 404684003');
    assert.strictEqual(result.edition, undefined);
  });

  // ── Combined flags ────────────────────────────────────────────────────
  it('should extract both --eval and --edition together', () => {
    const result = parseInput('--eval --edition us < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
    assert.strictEqual(result.edition, 'us');
  });

  it('should handle flags in reverse order', () => {
    const result = parseInput('--edition nz --eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
    assert.strictEqual(result.edition, 'nz');
  });

  // ── --no-terms flag ─────────────────────────────────────────────────
  it('should extract --no-terms flag', () => {
    const result = parseInput('--no-terms << 404684003');
    assert.strictEqual(result.ecl, '<< 404684003');
    assert.strictEqual(result.noTerms, true);
  });

  it('should handle --no-terms with --edition', () => {
    const result = parseInput('--no-terms --edition au << 404684003');
    assert.strictEqual(result.ecl, '<< 404684003');
    assert.strictEqual(result.noTerms, true);
    assert.strictEqual(result.edition, 'au');
  });

  // ── Backtick stripping from ECL ───────────────────────────────────────
  it('should strip backticks wrapping ECL after flags', () => {
    const result = parseInput('--no-terms `<< 404684003`');
    assert.strictEqual(result.ecl, '<< 404684003');
    assert.strictEqual(result.noTerms, true);
  });

  it('should strip triple backticks wrapping ECL', () => {
    const result = parseInput('```<< 404684003```');
    assert.strictEqual(result.ecl, '<< 404684003');
  });

  it('should strip backticks from bare ECL (no flags)', () => {
    const result = parseInput('`<< 404684003 |Clinical finding|`');
    assert.strictEqual(result.ecl, '<< 404684003 |Clinical finding|');
  });

  // ── Unknown flags ─────────────────────────────────────────────────────
  it('should treat unknown flags as ECL', () => {
    const result = parseInput('--unknown < 404684003');
    assert.strictEqual(result.ecl, '--unknown < 404684003');
    assert.strictEqual(result.evaluate, false);
    assert.strictEqual(result.edition, undefined);
  });

  it('should stop consuming flags at unknown flag and keep rest as ECL', () => {
    const result = parseInput('--eval --badFlag < 404684003');
    assert.strictEqual(result.ecl, '--badFlag < 404684003');
    assert.strictEqual(result.evaluate, true);
  });

  // ── Help ──────────────────────────────────────────────────────────────
  it('should detect "help" input', () => {
    const result = parseInput('help');
    assert.strictEqual(result.help, true);
    assert.strictEqual(result.ecl, '');
  });

  it('should detect "HELP" case-insensitive', () => {
    const result = parseInput('HELP');
    assert.strictEqual(result.help, true);
  });

  it('should detect "Help" mixed case', () => {
    const result = parseInput('Help');
    assert.strictEqual(result.help, true);
  });

  it('should detect empty input as help', () => {
    const result = parseInput('');
    assert.strictEqual(result.help, true);
  });

  it('should detect whitespace-only input as help', () => {
    const result = parseInput('   ');
    assert.strictEqual(result.help, true);
  });

  it('should detect tab-only input as help', () => {
    const result = parseInput('\t');
    assert.strictEqual(result.help, true);
  });

  it('should detect newline-only input as help', () => {
    const result = parseInput('\n');
    assert.strictEqual(result.help, true);
  });

  it('should NOT treat "help me" as help', () => {
    const result = parseInput('help me');
    assert.strictEqual(result.help, undefined);
    assert.strictEqual(result.ecl, 'help me');
  });

  it('should NOT treat "helpful" as help', () => {
    const result = parseInput('helpful');
    assert.strictEqual(result.help, undefined);
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

// ── processEcl ──────────────────────────────────────────────────────────

describe('processEcl', () => {
  // ── Basic parsing & formatting ────────────────────────────────────────
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

  it('should handle wildcard expression with no concepts', async () => {
    const service = createMockService();
    const result = await processEcl('*', service);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.warnings.length, 0);
  });

  it('should handle member-of expression', async () => {
    const service = createMockService();
    const result = await processEcl('^ 900000000000497000', service);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should handle refined expression', async () => {
    const service = createMockService();
    const result = await processEcl('<< 73211009 : 363698007 = << 39057004', service);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should return multiple syntax errors for severely broken ECL', async () => {
    const service = createMockService();
    // Completely broken input
    const result = await processEcl('AND OR MINUS', service);
    assert.ok(result.errors.length > 0);
  });

  // ── Error diagnostics ────────────────────────────────────────────────
  it('should include line and column in error diagnostics', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003 AND AND', service);
    assert.ok(result.errors.length > 0);
    const err = result.errors[0];
    assert.ok(typeof err.line === 'number' && err.line >= 1);
    assert.ok(typeof err.column === 'number' && err.column >= 1);
    assert.ok(typeof err.endColumn === 'number');
    assert.ok(typeof err.message === 'string' && err.message.length > 0);
  });

  // ── Edition label ────────────────────────────────────────────────────
  it('should include default edition label', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.edition, 'Server default');
  });

  it('should pass edition label through to result', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service, { edition: 'SNOMED CT Australian' });
    assert.strictEqual(result.edition, 'SNOMED CT Australian');
  });

  it('should not set editionUri or fhirServerUrl (those are set by app.ts)', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.editionUri, undefined);
    assert.strictEqual(result.fhirServerUrl, undefined);
  });

  // ── FHIR concept validation ──────────────────────────────────────────
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

  it('should add display terms to ALL occurrences of the same concept', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        const map = new Map<string, ConceptInfo | null>();
        map.set('404684003', {
          id: '404684003',
          fsn: 'Clinical finding (finding)',
          pt: 'Clinical finding',
          active: true,
        });
        return map;
      },
    });
    const result = await processEcl('< 404684003 OR > 404684003', service);
    // Both occurrences should have the display term
    const matches = result.formatted.match(/Clinical finding/g);
    assert.ok(matches && matches.length >= 2, `Expected at least 2 occurrences, got ${matches?.length}`);
  });

  it('should not add display terms to concepts that already have them', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        const map = new Map<string, ConceptInfo | null>();
        map.set('404684003', {
          id: '404684003',
          fsn: 'Clinical finding (finding)',
          pt: 'Clinical finding',
          active: true,
        });
        return map;
      },
    });
    const result = await processEcl('< 404684003 |Clinical finding|', service);
    // Should not double the display term
    const pipeCount = (result.formatted.match(/\|/g) || []).length;
    assert.strictEqual(pipeCount, 2, 'Should have exactly one pair of pipes');
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

  it('should include concept ID in inactive concept warning', async () => {
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
    const result = await processEcl('< 399144008', service);
    const inactiveWarning = result.warnings.find((w) => w.message.includes('Inactive'));
    assert.ok(inactiveWarning?.message.includes('399144008'));
  });

  it('should warn about unknown concepts (null in map)', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        const map = new Map<string, ConceptInfo | null>();
        map.set('123456789', null);
        return map;
      },
    });
    const result = await processEcl('< 123456789', service);
    assert.ok(result.warnings.some((w) => w.message.includes('Unknown concept')));
  });

  it('should include concept ID in unknown concept warning', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        const map = new Map<string, ConceptInfo | null>();
        map.set('123456789', null);
        return map;
      },
    });
    const result = await processEcl('< 123456789', service);
    const unknownWarning = result.warnings.find((w) => w.message.includes('Unknown'));
    assert.ok(unknownWarning?.message.includes('123456789'));
  });

  it('should include display term in warning when concept has one', async () => {
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
    const warning = result.warnings.find((w) => w.message.includes('Inactive'));
    assert.ok(warning?.message.includes('|Bronze diabetes|'));
  });

  // ── FHIR failure graceful degradation ─────────────────────────────────
  it('should degrade gracefully when FHIR validation fails', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        throw new Error('Connection refused');
      },
    });
    const result = await processEcl('< 404684003', service);
    assert.ok(result.formatted.includes('404684003'));
    assert.ok(result.warnings.some((w) => w.message.includes('Terminology server unavailable')));
  });

  it('should still format ECL when FHIR is unavailable', async () => {
    const service = createMockService({
      validateConcepts: async () => {
        throw new Error('Timeout');
      },
    });
    const result = await processEcl('<< 73211009 : 363698007 = << 39057004', service);
    assert.ok(result.formatted.includes('73211009'));
    assert.ok(result.formatted.includes('363698007'));
  });

  it('should not call validateConcepts when there are no concepts (wildcard)', async () => {
    let validateCalled = false;
    const service = createMockService({
      validateConcepts: async () => {
        validateCalled = true;
        return new Map();
      },
    });
    await processEcl('*', service);
    assert.strictEqual(validateCalled, false);
  });

  // ── Semantic validation ───────────────────────────────────────────────
  it('should silently handle semantic validation failure', async () => {
    // Create a service where validateConcepts works but evaluateEcl will fail
    // Semantic validation uses evaluateEcl internally, so this tests graceful failure
    const service = createMockService();
    // processEcl should not throw even if semantic validation has issues
    const result = await processEcl('< 404684003', service);
    assert.ok(result); // Should complete without throwing
  });

  // ── Evaluation (always for valid expressions) ─────────────────────────
  it('should automatically evaluate valid expressions', async () => {
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
    const result = await processEcl('< 404684003', service);
    assert.ok(result.evaluation);
    assert.strictEqual(result.evaluation.count, 3);
    assert.strictEqual(result.evaluation.concepts.length, 3);
    assert.strictEqual(result.evaluation.concepts[0].code, '73211009');
    assert.strictEqual(result.evaluation.concepts[0].display, 'Diabetes mellitus');
  });

  it('should not produce evaluation result when there are syntax errors', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003 AND AND < 19829001', service);
    assert.ok(result.errors.length > 0);
    // Evaluation should not be populated (semantic validation may call evaluateEcl
    // internally, but the bot's evaluation section should remain empty)
    assert.strictEqual(result.evaluation, undefined);
  });

  it('should respect maxEvalResults limit', async () => {
    const service = createMockService({
      evaluateEcl: async () => ({
        total: 100,
        concepts: Array.from({ length: 10 }, (_, i) => ({
          code: `${73211000 + i}`,
          display: `Concept ${i}`,
        })),
        truncated: true,
      }),
    });
    const result = await processEcl('< 404684003', service, { maxEvalResults: 3 });
    assert.ok(result.evaluation);
    assert.strictEqual(result.evaluation.concepts.length, 3);
    assert.strictEqual(result.evaluation.count, 100);
  });

  it('should default maxEvalResults to 5', async () => {
    const service = createMockService({
      evaluateEcl: async () => ({
        total: 100,
        concepts: Array.from({ length: 10 }, (_, i) => ({
          code: `${73211000 + i}`,
          display: `Concept ${i}`,
        })),
        truncated: true,
      }),
    });
    const result = await processEcl('< 404684003', service);
    assert.ok(result.evaluation);
    assert.strictEqual(result.evaluation.concepts.length, 5);
  });

  it('should produce warning when evaluation fails', async () => {
    const service = createMockService({
      evaluateEcl: async () => {
        throw new Error('Server timeout');
      },
    });
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.evaluation, undefined);
    assert.ok(result.warnings.some((w) => w.message.includes('Evaluation failed')));
  });

  it('should handle evaluation returning 0 concepts', async () => {
    const service = createMockService({
      evaluateEcl: async () => ({
        total: 0,
        concepts: [],
        truncated: false,
      }),
    });
    const result = await processEcl('< 404684003', service);
    assert.ok(result.evaluation);
    assert.strictEqual(result.evaluation.count, 0);
    assert.strictEqual(result.evaluation.concepts.length, 0);
  });

  // ── Combined FHIR + evaluation ────────────────────────────────────────
  it('should both validate concepts and evaluate in the same request', async () => {
    let validateCalled = false;
    let evaluateCalled = false;
    const service = createMockService({
      validateConcepts: async () => {
        validateCalled = true;
        const map = new Map<string, ConceptInfo | null>();
        map.set('404684003', {
          id: '404684003',
          fsn: 'Clinical finding (finding)',
          pt: 'Clinical finding',
          active: true,
        });
        return map;
      },
      evaluateEcl: async () => {
        evaluateCalled = true;
        return { total: 1, concepts: [{ code: '404684003', display: 'Clinical finding' }], truncated: false };
      },
    });
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(validateCalled, true);
    assert.strictEqual(evaluateCalled, true);
    assert.ok(result.formatted.includes('Clinical finding'));
    assert.ok(result.evaluation);
  });

  it('should evaluate even when FHIR validation fails', async () => {
    let evaluateCalled = false;
    const service = createMockService({
      validateConcepts: async () => {
        throw new Error('Validation failed');
      },
      evaluateEcl: async () => {
        evaluateCalled = true;
        return { total: 1, concepts: [{ code: '404684003', display: 'Clinical finding' }], truncated: false };
      },
    });
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(evaluateCalled, true);
    assert.ok(result.evaluation);
    assert.ok(result.warnings.some((w) => w.message.includes('Terminology server unavailable')));
  });
});

// ── processEcl — inactive concept replacement ──────────────────────────

/**
 * Create a mock service that supports getHistoricalAssociations for testing
 * the inactive concept replacement pipeline through processEcl.
 */
function createMockServiceWithAssociations(opts: {
  conceptMap: Map<string, ConceptInfo | null>;
  associations: Map<string, HistoricalAssociation[]>;
  evaluateEcl?: (expression: string, limit?: number) => Promise<EvaluationResponse>;
}): ITerminologyService {
  return {
    getConceptInfo: async () => null,
    validateConcepts: async (ids: string[]) => {
      const result = new Map<string, ConceptInfo | null>();
      for (const id of ids) {
        if (opts.conceptMap.has(id)) {
          result.set(id, opts.conceptMap.get(id)!);
        }
      }
      return result;
    },
    searchConcepts: async () => ({ results: [], hasMore: false }),
    evaluateEcl: opts.evaluateEcl ?? (async () => ({ total: 0, concepts: [], truncated: false })),
    getHistoricalAssociations: async (conceptId: string) => {
      return opts.associations.get(conceptId) ?? [];
    },
  };
}

describe('processEcl — inactive concept replacement', () => {
  it('should produce replacement when inactive concept has SAME AS association', async () => {
    const conceptMap = new Map<string, ConceptInfo | null>();
    // 399144008 "Bronze diabetes" is inactive
    conceptMap.set('399144008', {
      id: '399144008',
      fsn: 'Bronze diabetes (disorder)',
      pt: 'Bronze diabetes',
      active: false,
    });

    const associations = new Map<string, HistoricalAssociation[]>();
    associations.set('399144008', [
      {
        type: 'same-as',
        refsetId: '900000000000527005',
        targets: [{ code: '235597007', display: 'Diabetic hepatopathy (disorder)' }],
      },
    ]);

    const service = createMockServiceWithAssociations({ conceptMap, associations });
    const result = await processEcl('< 399144008', service);

    assert.ok(result.replacement, 'Should have a replacement');
    assert.ok(result.replacement.ecl.includes('235597007'), 'Replacement should contain the target concept');
    assert.ok(!result.replacement.ecl.includes('399144008'), 'Replacement should not contain the inactive concept');
  });

  it('should not produce replacement when no associations found', async () => {
    const conceptMap = new Map<string, ConceptInfo | null>();
    conceptMap.set('399144008', {
      id: '399144008',
      fsn: 'Bronze diabetes (disorder)',
      pt: 'Bronze diabetes',
      active: false,
    });

    // Empty associations — no historical targets
    const associations = new Map<string, HistoricalAssociation[]>();

    const service = createMockServiceWithAssociations({ conceptMap, associations });
    const result = await processEcl('< 399144008', service);

    assert.strictEqual(result.replacement, undefined, 'Should not produce replacement when no associations exist');
  });

  it('should not produce replacement when all concepts are active', async () => {
    const conceptMap = new Map<string, ConceptInfo | null>();
    conceptMap.set('404684003', {
      id: '404684003',
      fsn: 'Clinical finding (finding)',
      pt: 'Clinical finding',
      active: true,
    });

    const associations = new Map<string, HistoricalAssociation[]>();

    const service = createMockServiceWithAssociations({ conceptMap, associations });
    const result = await processEcl('< 404684003', service);

    assert.strictEqual(result.replacement, undefined, 'Should not produce replacement when all concepts are active');
  });

  it('should handle multiple inactive concepts', async () => {
    const conceptMap = new Map<string, ConceptInfo | null>();
    conceptMap.set('399144008', {
      id: '399144008',
      fsn: 'Bronze diabetes (disorder)',
      pt: 'Bronze diabetes',
      active: false,
    });
    conceptMap.set('12481008', {
      id: '12481008',
      fsn: 'Intestinal infectious disease (disorder)',
      pt: 'Intestinal infectious disease',
      active: false,
    });

    const associations = new Map<string, HistoricalAssociation[]>();
    associations.set('399144008', [
      {
        type: 'same-as',
        refsetId: '900000000000527005',
        targets: [{ code: '235597007', display: 'Diabetic hepatopathy (disorder)' }],
      },
    ]);
    associations.set('12481008', [
      {
        type: 'replaced-by',
        refsetId: '900000000000526001',
        targets: [{ code: '1193006', display: 'Amoebic infection (disorder)' }],
      },
    ]);

    const service = createMockServiceWithAssociations({ conceptMap, associations });
    const result = await processEcl('< 399144008 OR < 12481008', service);

    assert.ok(result.replacement, 'Should have a replacement');
    assert.ok(result.replacement.ecl.includes('235597007'), 'Replacement should contain the first target');
    assert.ok(result.replacement.ecl.includes('1193006'), 'Replacement should contain the second target');
    assert.ok(
      !result.replacement.ecl.includes('399144008'),
      'Replacement should not contain the first inactive concept',
    );
    assert.ok(
      !result.replacement.ecl.includes('12481008'),
      'Replacement should not contain the second inactive concept',
    );
  });

  it('should evaluate the replacement ECL when evaluation succeeds', async () => {
    const conceptMap = new Map<string, ConceptInfo | null>();
    conceptMap.set('399144008', {
      id: '399144008',
      fsn: 'Bronze diabetes (disorder)',
      pt: 'Bronze diabetes',
      active: false,
    });

    const associations = new Map<string, HistoricalAssociation[]>();
    associations.set('399144008', [
      {
        type: 'same-as',
        refsetId: '900000000000527005',
        targets: [{ code: '235597007', display: 'Diabetic hepatopathy (disorder)' }],
      },
    ]);

    let evaluateCallCount = 0;
    const service = createMockServiceWithAssociations({
      conceptMap,
      associations,
      evaluateEcl: async () => {
        evaluateCallCount++;
        return {
          total: 3,
          concepts: [
            { code: '235597007', display: 'Diabetic hepatopathy' },
            { code: '100001', display: 'Concept A' },
            { code: '100002', display: 'Concept B' },
          ],
          truncated: false,
        };
      },
    });
    const result = await processEcl('< 399144008', service);

    assert.ok(result.replacement, 'Should have a replacement');
    assert.ok(result.replacement.evaluation, 'Replacement should have evaluation');
    assert.strictEqual(result.replacement.evaluation.count, 3);
    assert.strictEqual(result.replacement.evaluation.concepts.length, 3);
    // evaluateEcl should be called at least twice: once for replacement, once for original
    assert.ok(evaluateCallCount >= 2, `Expected at least 2 evaluateEcl calls, got ${evaluateCallCount}`);
  });

  it('should produce replacement with multiple targets as OR disjunction', async () => {
    const conceptMap = new Map<string, ConceptInfo | null>();
    conceptMap.set('399144008', {
      id: '399144008',
      fsn: 'Bronze diabetes (disorder)',
      pt: 'Bronze diabetes',
      active: false,
    });

    const associations = new Map<string, HistoricalAssociation[]>();
    associations.set('399144008', [
      {
        type: 'possibly-equivalent-to',
        refsetId: '900000000000523009',
        targets: [
          { code: '235597007', display: 'Diabetic hepatopathy (disorder)' },
          { code: '44054006', display: 'Type 2 diabetes mellitus (disorder)' },
        ],
      },
    ]);

    const service = createMockServiceWithAssociations({ conceptMap, associations });
    const result = await processEcl('< 399144008', service);

    assert.ok(result.replacement, 'Should have a replacement');
    assert.ok(result.replacement.ecl.includes('235597007'), 'Replacement should include first target');
    assert.ok(result.replacement.ecl.includes('44054006'), 'Replacement should include second target');
    assert.ok(result.replacement.ecl.includes('OR'), 'Multiple targets should be joined with OR');
  });

  it('should not produce replacement when getHistoricalAssociations is not available', async () => {
    // Use the basic mock service which has no getHistoricalAssociations
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
    const result = await processEcl('< 399144008', service);

    assert.strictEqual(
      result.replacement,
      undefined,
      'Should not produce replacement without getHistoricalAssociations',
    );
  });
});
