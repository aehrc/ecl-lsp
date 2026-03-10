// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { resolveEdition, EDITION_ALIASES } from '../config';

describe('resolveEdition', () => {
  it('should resolve shorthand alias "au" to full URI', () => {
    const result = resolveEdition('au');
    assert.strictEqual(result, 'http://snomed.info/sct/32506021000036107');
  });

  it('should resolve shorthand alias "int" to full URI', () => {
    const result = resolveEdition('int');
    assert.strictEqual(result, 'http://snomed.info/sct/900000000000207008');
  });

  it('should resolve case-insensitive alias "AU"', () => {
    const result = resolveEdition('AU');
    assert.strictEqual(result, 'http://snomed.info/sct/32506021000036107');
  });

  it('should pass through a full URI unchanged', () => {
    const uri = 'http://snomed.info/sct/731000124108';
    const result = resolveEdition(uri);
    assert.strictEqual(result, uri);
  });

  it('should return null for unknown alias', () => {
    const result = resolveEdition('xx');
    assert.strictEqual(result, null);
  });

  it('should return undefined edition label when no edition configured', () => {
    assert.strictEqual(EDITION_ALIASES['int'], 'http://snomed.info/sct/900000000000207008');
  });
});
