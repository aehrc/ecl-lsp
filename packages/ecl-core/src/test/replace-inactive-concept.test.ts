// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildReplacementText } from '../refactoring/replace-inactive-concept';
import { MockTerminologyService } from '../terminology/mock-service';
import type { HistoricalAssociation } from '../terminology/types';

// ── buildReplacementText ────────────────────────────────────────────────

describe('buildReplacementText — SAME AS', () => {
  it('should produce direct replacement with display term', () => {
    const assoc: HistoricalAssociation = {
      type: 'same-as',
      refsetId: '900000000000527005',
      targets: [{ code: '404684003', display: 'Clinical finding' }],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '404684003 |Clinical finding|');
    assert.ok(result.label.includes('same as'));
    assert.ok(result.label.includes('404684003'));
  });

  it('should produce direct replacement without display term', () => {
    const assoc: HistoricalAssociation = {
      type: 'same-as',
      refsetId: '900000000000527005',
      targets: [{ code: '404684003', display: '' }],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '404684003');
  });
});

describe('buildReplacementText — REPLACED BY', () => {
  it('should produce direct replacement', () => {
    const assoc: HistoricalAssociation = {
      type: 'replaced-by',
      refsetId: '900000000000526001',
      targets: [{ code: '71388002', display: 'Procedure' }],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '71388002 |Procedure|');
    assert.ok(result.label.includes('replaced by'));
  });
});

describe('buildReplacementText — POSSIBLY EQUIVALENT TO', () => {
  it('should produce bare concept for single target', () => {
    const assoc: HistoricalAssociation = {
      type: 'possibly-equivalent-to',
      refsetId: '900000000000523009',
      targets: [{ code: '404684003', display: 'Clinical finding' }],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '404684003 |Clinical finding|');
    assert.ok(result.label.includes('possibly equivalent to'));
  });

  it('should produce OR disjunction for multiple targets', () => {
    const assoc: HistoricalAssociation = {
      type: 'possibly-equivalent-to',
      refsetId: '900000000000523009',
      targets: [
        { code: '404684003', display: 'Clinical finding' },
        { code: '71388002', display: 'Procedure' },
        { code: '19829001', display: 'Disorder of lung' },
      ],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(
      result.replacement,
      '(404684003 |Clinical finding| OR 71388002 |Procedure| OR 19829001 |Disorder of lung|)',
    );
  });

  it('should handle targets without display terms in disjunction', () => {
    const assoc: HistoricalAssociation = {
      type: 'possibly-equivalent-to',
      refsetId: '900000000000523009',
      targets: [
        { code: '404684003', display: '' },
        { code: '71388002', display: '' },
      ],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '(404684003 OR 71388002)');
  });
});

describe('buildReplacementText — ALTERNATIVE', () => {
  it('should produce OR disjunction for multiple targets', () => {
    const assoc: HistoricalAssociation = {
      type: 'alternative',
      refsetId: '900000000000530003',
      targets: [
        { code: '404684003', display: 'Clinical finding' },
        { code: '71388002', display: 'Procedure' },
      ],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '(404684003 |Clinical finding| OR 71388002 |Procedure|)');
    assert.ok(result.label.includes('alternative'));
  });
});

describe('buildReplacementText — edge cases', () => {
  it('should return empty replacement for zero targets', () => {
    const assoc: HistoricalAssociation = {
      type: 'same-as',
      refsetId: '900000000000527005',
      targets: [],
    };
    const result = buildReplacementText(assoc);
    assert.strictEqual(result.replacement, '');
  });
});

// ── MockTerminologyService.getHistoricalAssociations ────────────────────

describe('MockTerminologyService — historical associations', () => {
  const service = new MockTerminologyService();

  it('should return associations for inactive concept 123456001', async () => {
    const associations = await service.getHistoricalAssociations('123456001');
    assert.strictEqual(associations.length, 1);
    assert.strictEqual(associations[0].type, 'same-as');
    assert.strictEqual(associations[0].targets.length, 1);
    assert.strictEqual(associations[0].targets[0].code, '404684003');
  });

  it('should return empty array for active concept', async () => {
    const associations = await service.getHistoricalAssociations('404684003');
    assert.strictEqual(associations.length, 0);
  });

  it('should return empty array for unknown concept', async () => {
    const associations = await service.getHistoricalAssociations('999999999');
    assert.strictEqual(associations.length, 0);
  });
});
