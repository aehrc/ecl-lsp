// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  evaluate,
  exactExclusions,
  localScore,
  prune,
  render,
  type ClauseForm,
  type HierarchyClause,
} from '../derive/hierarchy-clauses';
import { loadTaxonomyGraph, type TaxonomyGraph } from '../derive/taxonomy-graph';
import { orGroup, SetQueries } from '../derive/set-queries';
import { HierarchyMockService, sctid } from './hierarchy-mock';

// The greedy fixture (FINDING > A > A1.., B, PROC > P1) plus a polyhierarchy:
// D1 and D2 have parents X and Y, and Y has a child Z outside any include.
const ROOT = '138875005';
const id = {
  FINDING: sctid(1001),
  PROC: sctid(1002),
  A: sctid(1010),
  A1: sctid(1011),
  A1a: sctid(1012),
  A1b: sctid(1013),
  A2: sctid(1014),
  A5: sctid(1017),
  A5a: sctid(1018),
  B: sctid(1020),
  B1: sctid(1021),
  P1: sctid(1030),
  X: sctid(2001),
  Y: sctid(2002),
  Z: sctid(2003),
  D1: sctid(2005),
  D2: sctid(2006),
};

function fixture(): HierarchyMockService {
  return new HierarchyMockService()
    .add(ROOT, 'root')
    .add(id.FINDING, 'Finding', [ROOT])
    .add(id.PROC, 'Procedure', [ROOT])
    .add(id.A, 'A', [id.FINDING])
    .add(id.A1, 'A1', [id.A])
    .add(id.A1a, 'A1a', [id.A1])
    .add(id.A1b, 'A1b', [id.A1])
    .add(id.A2, 'A2', [id.A])
    .add(id.A5, 'A5', [id.A])
    .add(id.A5a, 'A5a', [id.A5])
    .add(id.B, 'B', [id.FINDING])
    .add(id.B1, 'B1', [id.B])
    .add(id.P1, 'P1', [id.PROC])
    .add(id.X, 'X', [ROOT])
    .add(id.Y, 'Y', [ROOT])
    .add(id.Z, 'Z', [id.Y])
    .add(id.D1, 'D1', [id.X, id.Y])
    .add(id.D2, 'D2', [id.X, id.Y]);
}

async function load(mock: HierarchyMockService, set: string[]): Promise<TaxonomyGraph> {
  const members = { clause: { concepts: set }, ecl: orGroup(set), size: set.length };
  const q = new SetQueries(mock.expandCompose.bind(mock));
  const graph = await loadTaxonomyGraph(members, q, { maxConcepts: 1000, descend: () => true });
  assert.ok(!('unavailable' in graph), 'graph unavailable');
  return graph;
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

describe('hierarchy clauses', () => {
  it('evaluate matches the server on random forms', async () => {
    const mock = fixture();
    const g = await load(mock, [id.A1a, id.A1b, id.A2, id.A5a, id.B1, id.P1, id.D1, id.D2]);
    const random = lcg(11);
    const pick = <T>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
    const pool = Object.values(id).filter(
      (c) => (g.aboveMember(c) || g.parents(c).length > 0) && (g.hasDescendants(c) || g.children(c).length === 0),
    );
    assert.ok(pool.includes(id.Z) && pool.includes(id.Y));
    const clause = (): HierarchyClause => ({ conceptId: pick(pool), operator: pick(['<<', '<', '=']) });
    const many = (min: number, max: number) =>
      Array.from({ length: min + Math.floor(random() * (max - min + 1)) }, clause);
    for (let i = 0; i < 300; i++) {
      const form: ClauseForm = { includes: many(1, 4), exclusions: many(0, 2) };
      const local = evaluate(form, g);
      assert.ok(local, `no local result for ${render(form)}`);
      assert.deepStrictEqual([...local].sort(), [...mock.evaluate(render(form))].sort(), render(form));
    }
  });

  it('exact exclusions make any cover exact', async () => {
    const mock = fixture();
    const pool = Object.values(id).filter((c) => c !== ROOT);
    const random = lcg(7);
    for (let i = 0; i < 200; i++) {
      const set = pool.filter(() => random() < 0.4);
      if (set.length === 0) continue;
      const g = await load(mock, set);
      const includes: HierarchyClause[] = g.roots().map((conceptId) => ({ conceptId, operator: '<<' }));
      const above = g.ancestors();
      includes.push({ conceptId: above[Math.floor(random() * above.length)], operator: '<' });
      const score = localScore({ includes, exclusions: exactExclusions(includes, g) }, g);
      assert.deepStrictEqual(score && { a: score.additions, m: score.misses }, { a: 0, m: 0 }, set.join(','));
    }
  });

  it('prune drops covered clauses', async () => {
    // Y's children both have X as a parent too, so `< X` alone selects them.
    const [a, b] = [sctid(2003), sctid(2004)];
    const mock = new HierarchyMockService()
      .add(ROOT, 'root')
      .add(id.X, 'X', [ROOT])
      .add(id.Y, 'Y', [ROOT])
      .add(a, 'a', [id.X])
      .add(b, 'b', [id.X])
      .add(id.D1, 'd1', [id.X, id.Y])
      .add(id.D2, 'd2', [id.X, id.Y]);
    const g = await load(mock, [a, b, id.D1, id.D2]);
    const pruned = prune(
      [
        { conceptId: id.X, operator: '<' },
        { conceptId: id.Y, operator: '<' },
      ],
      g,
    );
    assert.deepStrictEqual(pruned, [{ conceptId: id.X, operator: '<' }]);
  });

  it('evaluate returns null for a clause without loaded descendants', async () => {
    const mock = fixture();
    const members = { clause: { concepts: [id.A1a, id.B1] }, ecl: orGroup([id.A1a, id.B1]), size: 2 };
    const q = new SetQueries(mock.expandCompose.bind(mock));
    const g = await loadTaxonomyGraph(members, q, { maxConcepts: 1000, descend: () => false });
    assert.ok(!('unavailable' in g));
    assert.ok(!g.hasDescendants(id.A) && g.children(id.A).length > 0);
    assert.strictEqual(evaluate({ includes: [{ conceptId: id.A, operator: '<' }], exclusions: [] }, g), null);
    assert.ok(evaluate({ includes: [{ conceptId: id.A, operator: '=' }], exclusions: [] }, g));
  });

  it('evaluate returns null for a clause on a concept whose children were never loaded', async () => {
    // A5 is a child of A (so in the graph) but not above a member: its own children are unknown.
    const mock = fixture();
    const set = [id.A1a, id.A1b, id.A2];
    const members = { clause: { concepts: set }, ecl: orGroup(set), size: set.length };
    const q = new SetQueries(mock.expandCompose.bind(mock));
    const g = await loadTaxonomyGraph(members, q, { maxConcepts: 1000, descend: () => false });
    assert.ok(!('unavailable' in g));
    assert.ok(!g.hasDescendants(id.A5) && !g.aboveMember(id.A5) && g.children(id.A5).length === 0);
    assert.strictEqual(evaluate({ includes: [{ conceptId: id.A5, operator: '<<' }], exclusions: [] }, g), null);
    assert.strictEqual(evaluate({ includes: [{ conceptId: id.A2, operator: '<<' }], exclusions: [] }, g)?.size, 1);
  });
});
