// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { countingFailures, SetQueries, uncounted, type ExpandCompose } from '../derive/set-queries';
import { HierarchyMockService } from './hierarchy-mock';
import { TerminologyTransportError } from '../terminology/errors';
import type { EvaluationConcept } from '../terminology/types';

const ALL = '<< 138875005';

/**
 * A server holding `size` concepts (`ALL` selects them all; an inline list
 * selects the listed ones it holds) that returns at most `cap` per page,
 * whatever `count` asks: some servers cap pages below the 50,000 Ontoserver does.
 */
function cappedServer(size: number, cap: number): ExpandCompose {
  const codes = Array.from({ length: size }, (_, i) => String(100000 + i));
  const held = new Set(codes);
  return (compose, options = {}) => {
    const include = compose.include[0];
    const selected = 'ecl' in include ? codes : include.concepts.filter((c) => held.has(c));
    const offset = options.offset ?? 0;
    const page = selected.slice(offset, offset + Math.min(options.count ?? 0, cap));
    const concepts: EvaluationConcept[] = page.map((code) => ({
      code,
      display: code,
      ...(options.parents ? { parents: ['138875005'] } : {}),
    }));
    return Promise.resolve({ total: selected.length, concepts, truncated: offset + page.length < selected.length });
  };
}

describe('SetQueries paging on a server with a smaller page cap', () => {
  for (const parallelPages of [false, true]) {
    describe(`parallelPages: ${parallelPages}`, () => {
      it('reads every concept of a large set', async () => {
        const q = new SetQueries(cappedServer(120_000, 10_000), parallelPages);
        const { concepts, total } = await q.concepts({ include: [{ ecl: ALL }] }, 200_000);
        assert.strictEqual(total, 120_000);
        assert.strictEqual(concepts.length, 120_000);
        assert.strictEqual(new Set(concepts.map((c) => c.code)).size, 120_000);
      });

      it('reads every concept of a set known to be at most max', async () => {
        const q = new SetQueries(cappedServer(120_000, 10_000), parallelPages);
        const { concepts } = await q.conceptsUpTo({ include: [{ ecl: ALL }] }, 120_000);
        assert.strictEqual(new Set(concepts.map((c) => c.code)).size, 120_000);
      });

      it('loads every concept into the graph', async () => {
        const q = new SetQueries(cappedServer(120_000, 10_000), parallelPages);
        const graph = await q.graph({ include: [{ ecl: ALL }] }, 200_000);
        assert.ok(graph instanceof Map);
        assert.strictEqual(graph.size, 120_000);
      });

      it('looks up every listed code, not just the first page of each chunk', async () => {
        const q = new SetQueries(cappedServer(30_000, 3_000), parallelPages);
        const listed = Array.from({ length: 25_000 }, (_, i) => String(100000 + i));
        const found = await q.lookup(listed);
        assert.strictEqual(new Set(found.map((c) => c.code)).size, 25_000);
      });
    });
  }
});

describe('uncounted', () => {
  it('reaches the service through every counting wrapper, so a nested derive counts nothing', async () => {
    const service = new HierarchyMockService();
    service.validateConcepts = () => Promise.reject(new TerminologyTransportError('timed out'));
    const outer = countingFailures(service);
    const inner = countingFailures(outer.service);
    await assert.rejects(uncounted(inner.service).validateConcepts(['1']));
    assert.strictEqual(inner.failures(), 0);
    assert.strictEqual(outer.failures(), 0);
    await assert.rejects(inner.service.validateConcepts(['1']));
    assert.strictEqual(inner.failures(), 1);
    assert.strictEqual(outer.failures(), 1);
  });
});
