// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { extractTerminologyConfig } from '../terminology-config';

describe('extractTerminologyConfig — maxConcurrency', () => {
  it('returns undefined when maxConcurrency is absent', () => {
    const cfg = extractTerminologyConfig({ serverUrl: 'http://example.com' });
    assert.strictEqual(cfg.maxConcurrency, undefined);
  });

  it('accepts a valid positive integer', () => {
    const cfg = extractTerminologyConfig({ maxConcurrency: 10 });
    assert.strictEqual(cfg.maxConcurrency, 10);
  });

  it('accepts maxConcurrency of 1', () => {
    const cfg = extractTerminologyConfig({ maxConcurrency: 1 });
    assert.strictEqual(cfg.maxConcurrency, 1);
  });

  it('rejects 0 — returns undefined', () => {
    const cfg = extractTerminologyConfig({ maxConcurrency: 0 });
    assert.strictEqual(cfg.maxConcurrency, undefined);
  });

  it('rejects negative value — returns undefined', () => {
    const cfg = extractTerminologyConfig({ maxConcurrency: -5 });
    assert.strictEqual(cfg.maxConcurrency, undefined);
  });

  it('rejects non-integer number — returns undefined', () => {
    const cfg = extractTerminologyConfig({ maxConcurrency: 2.5 });
    assert.strictEqual(cfg.maxConcurrency, undefined);
  });

  it('rejects string value — returns undefined', () => {
    const cfg = extractTerminologyConfig({ maxConcurrency: '10' });
    assert.strictEqual(cfg.maxConcurrency, undefined);
  });

  it('returns undefined when config is null', () => {
    const cfg = extractTerminologyConfig(null);
    assert.strictEqual(cfg.maxConcurrency, undefined);
  });

  it('preserves other fields alongside maxConcurrency', () => {
    const cfg = extractTerminologyConfig({ serverUrl: 'http://example.com', timeout: 3000, maxConcurrency: 8 });
    assert.strictEqual(cfg.serverUrl, 'http://example.com');
    assert.strictEqual(cfg.timeout, 3000);
    assert.strictEqual(cfg.maxConcurrency, 8);
  });
});
