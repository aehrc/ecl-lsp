// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseInput } from '../ecl-processor';

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
