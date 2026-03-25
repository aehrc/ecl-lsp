// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { getFhirFilterCompletions, clearFilterCache, FILTER_ECL_CONSTRAINTS } from '../completion/filter-cache';
import { MockTerminologyService } from '../terminology/mock-service';

describe('FILTER_ECL_CONSTRAINTS', () => {
  it('should have entries for typeid, dialectid, moduleid', () => {
    assert.ok('typeid' in FILTER_ECL_CONSTRAINTS);
    assert.ok('dialectid' in FILTER_ECL_CONSTRAINTS);
    assert.ok('moduleid' in FILTER_ECL_CONSTRAINTS);
  });

  it('should use correct ECL expressions', () => {
    assert.strictEqual(FILTER_ECL_CONSTRAINTS.typeid, '< 900000000000446008');
    assert.strictEqual(FILTER_ECL_CONSTRAINTS.dialectid, '< 900000000000506000');
    assert.strictEqual(FILTER_ECL_CONSTRAINTS.moduleid, '< 900000000000443000');
  });
});

describe('getFhirFilterCompletions', () => {
  const service = new MockTerminologyService();

  beforeEach(() => {
    clearFilterCache();
  });

  it('should return completion items for typeId', async () => {
    const items = await getFhirFilterCompletions('typeid', service);
    assert.ok(items.length > 0, 'Should return items');
    assert.ok(
      items.some((i) => i.label.includes('900000000000003001')),
      'Should include FSN type',
    );
    assert.ok(
      items.some((i) => i.label.includes('900000000000013009')),
      'Should include Synonym type',
    );
    assert.ok(
      items.some((i) => i.label.includes('900000000000550004')),
      'Should include Definition type',
    );
  });

  it('should return completion items for dialectId', async () => {
    const items = await getFhirFilterCompletions('dialectid', service);
    assert.ok(items.length > 0, 'Should return items');
    assert.ok(
      items.some((i) => i.label.includes('900000000000509007')),
      'Should include US English',
    );
    assert.ok(
      items.some((i) => i.label.includes('900000000000508004')),
      'Should include GB English',
    );
  });

  it('should return completion items for moduleId', async () => {
    const items = await getFhirFilterCompletions('moduleid', service);
    assert.ok(items.length > 0, 'Should return items');
    assert.ok(
      items.some((i) => i.label.includes('900000000000207008')),
      'Should include SNOMED CT core',
    );
  });

  it('should return empty for unknown keyword', async () => {
    const items = await getFhirFilterCompletions('unknownkeyword', service);
    assert.strictEqual(items.length, 0);
  });

  it('should cache results on second call', async () => {
    const items1 = await getFhirFilterCompletions('typeid', service);
    const items2 = await getFhirFilterCompletions('typeid', service);
    assert.deepStrictEqual(items1, items2);
  });

  it('should use sortText starting with e-020', async () => {
    const items = await getFhirFilterCompletions('typeid', service);
    assert.ok(
      items.every((i) => i.sortText?.startsWith('e-')),
      'All items should have e- sortText prefix',
    );
    assert.strictEqual(items[0].sortText, 'e-020', 'First item should have sortText e-020');
  });

  it('should format labels as "code |display|"', async () => {
    const items = await getFhirFilterCompletions('typeid', service);
    for (const item of items) {
      assert.ok(/^\d+ \|.+\|$/.test(item.label), `Label "${item.label}" should match "code |display|" format`);
    }
  });

  it('clearFilterCache should clear all entries', async () => {
    await getFhirFilterCompletions('typeid', service);
    clearFilterCache();
    // After clearing, next call should re-fetch (still works)
    const items = await getFhirFilterCompletions('typeid', service);
    assert.ok(items.length > 0, 'Should return items after cache clear');
  });

  it('should handle keyword lookup via lowercase conversion', async () => {
    // getFhirFilterCompletions lowercases the keyword internally,
    // so 'TYPEID' matches 'typeid' in FILTER_ECL_CONSTRAINTS
    const items = await getFhirFilterCompletions('TYPEID', service);
    assert.ok(items.length > 0, 'Uppercase keyword should match via internal lowercasing');
  });

  it('should gracefully handle FHIR errors', async () => {
    const failingService = new MockTerminologyService();
    // Override evaluateEcl to throw
    failingService.evaluateEcl = async () => {
      throw new Error('FHIR timeout');
    };
    const items = await getFhirFilterCompletions('typeid', failingService);
    assert.strictEqual(items.length, 0, 'Should return empty on error');
  });
});
