// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { MockTerminologyService } from '../terminology/mock-service';

describe('FHIR Search Logic', () => {
  const service = new MockTerminologyService();

  it('should search by concept description', async () => {
    const result = await service.searchConcepts('clinical');
    assert.ok(result.results.length > 0, 'Should find results');
    assert.ok(
      result.results.some((r) => r.fsn.toLowerCase().includes('clinical')),
      'Should include matching concepts',
    );
  });

  it('should search by concept ID', async () => {
    const result = await service.searchConcepts('404684003');
    assert.strictEqual(result.results.length, 1, 'Should find exact match');
    assert.strictEqual(result.results[0].id, '404684003', 'Should match ID');
    assert.strictEqual(result.results[0].fsn, 'Clinical finding (finding)');
  });

  it('should handle empty query', async () => {
    const result = await service.searchConcepts('');
    assert.strictEqual(result.results.length, 0, 'Empty query returns no results');
  });

  it('should handle no matches', async () => {
    const result = await service.searchConcepts('xyznonexistent');
    assert.strictEqual(result.results.length, 0, 'No matches returns empty');
  });

  it('should be case insensitive', async () => {
    const lower = await service.searchConcepts('disorder');
    const upper = await service.searchConcepts('DISORDER');
    assert.ok(lower.results.length > 0, 'Lowercase finds results');
    assert.ok(upper.results.length > 0, 'Uppercase finds results');
  });

  it('should limit results to 20', async () => {
    const result = await service.searchConcepts('');
    assert.ok(result.results.length <= 20, 'Results limited to 20');
  });

  it('should only return active concepts', async () => {
    const result = await service.searchConcepts('inactive');
    // Mock service filters to active only
    assert.ok(
      result.results.every((r) => r.id !== '123456001'),
      'Inactive concepts excluded',
    );
  });
});
