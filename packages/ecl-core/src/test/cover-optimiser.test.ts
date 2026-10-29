// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { bestSingles, costCover, coverDescend, rootsCover } from '../derive/cover-optimiser';
import { greedyGrouping, refactorDescend } from '../derive/greedy-grouping';
import { localScore, render } from '../derive/hierarchy-clauses';
import { loadTaxonomyGraph, type TaxonomyGraph, type TaxonomyGraphOptions } from '../derive/taxonomy-graph';
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
  A3: sctid(1015),
  A4: sctid(1016),
  A5: sctid(1017),
  A5a: sctid(1018),
  B: sctid(1020),
  B1: sctid(1021),
  B2: sctid(1022),
  P1: sctid(1030),
  RETIRED: sctid(1040),
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
    .add(id.A3, 'A3', [id.A])
    .add(id.A4, 'A4', [id.A])
    .add(id.A5, 'A5', [id.A])
    .add(id.A5a, 'A5a', [id.A5])
    .add(id.B, 'B', [id.FINDING])
    .add(id.B1, 'B1', [id.B])
    .add(id.B2, 'B2', [id.B])
    .add(id.P1, 'P1', [id.PROC])
    .add(id.RETIRED, 'Retired', [id.A], false)
    .add(id.X, 'X', [ROOT])
    .add(id.Y, 'Y', [ROOT])
    .add(id.Z, 'Z', [id.Y])
    .add(id.D1, 'D1', [id.X, id.Y])
    .add(id.D2, 'D2', [id.X, id.Y]);
}

/** What Task 4 loads with, so both costCover and greedy grouping see their candidates' descendants. */
const bothDescend: TaxonomyGraphOptions['descend'] = (c, g) => coverDescend(c, g) || refactorDescend(c, g);

async function load(
  mock: HierarchyMockService,
  set: string[],
  descend: TaxonomyGraphOptions['descend'] = coverDescend,
): Promise<TaxonomyGraph> {
  const members = { clause: { concepts: set }, ecl: orGroup(set), size: set.length };
  const q = new SetQueries(mock.expandCompose.bind(mock));
  const graph = await loadTaxonomyGraph(members, q, { maxConcepts: 1000, descend });
  assert.ok(!('unavailable' in graph), 'graph unavailable');
  return graph;
}

/** The loaded ancestors with at least two members at or below them. */
function candidates(g: TaxonomyGraph): string[] {
  return g.ancestors().filter((c) => g.hasDescendants(c) && g.truePos(c) >= 2);
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

/** 200 seeded random member sets over the fixture. */
function randomSets(): string[][] {
  const pool = Object.values(id).filter((x) => x !== id.RETIRED && x !== ROOT);
  const random = lcg(7);
  const sets: string[][] = [];
  for (let i = 0; i < 200; i++) {
    const set = pool.filter(() => random() < 0.4);
    if (set.length > 0) sets.push(set);
  }
  return sets;
}

describe('cover optimiser', () => {
  it('costCover is exact on random sets', async () => {
    const mock = fixture();
    for (const set of randomSets()) {
      const g = await load(mock, set);
      const form = costCover(g, candidates(g));
      const score = localScore(form, g);
      assert.deepStrictEqual(score && { a: score.additions, m: score.misses }, { a: 0, m: 0 }, set.join(','));
      assert.deepStrictEqual([...mock.evaluate(render(form))].sort(), [...set].sort(), render(form));
    }
  });

  it('costCover beats listing', async () => {
    const g = await load(fixture(), [id.A1, id.A1a, id.A1b, id.A2, id.A3, id.A4]);
    assert.strictEqual(render(costCover(g, candidates(g))), `< ${id.A} MINUS << ${id.A5}`);
  });

  // Not "never more": costCover is a greedy set cover too, so it can lose by a
  // clause. Counterexample, {A, A1a, A1b, A2, A3, A5, A5a, B, B1, X}: `<< A`
  // covers 7 for 3 clauses (MINUS A1, << A4), beating `< FINDING`'s 9 for 4
  // (also MINUS << B2), so B and B1 are listed: 6 clauses against greedy
  // grouping's `(< FINDING OR X) MINUS (A1 OR << A4 OR << B2)`, 5.
  it('costCover uses at most one clause more than greedy grouping', async () => {
    const mock = fixture();
    const worse: string[] = [];
    for (const set of randomSets()) {
      const g = await load(mock, set, bothDescend);
      const form = costCover(g, candidates(g));
      const greedy = greedyGrouping(g, 300);
      const cost = form.includes.length + form.exclusions.length;
      const greedyCost = greedy.includes.length + greedy.exclusions.length;
      if (cost > greedyCost + 1) worse.push(`${set.join(',')}: ${render(form)} vs ${greedy.ecl}`);
    }
    assert.deepStrictEqual(worse, []);
  });

  it("rootsCover reproduces today's hierarchy cover", async () => {
    const g = await load(fixture(), [id.A, id.A1a, id.A1b, id.A2, id.A3, id.A4, id.A5, id.A5a]);
    assert.strictEqual(render(rootsCover(g)), `<< ${id.A} MINUS ${id.A1}`);
  });

  it('bestSingles ranks single clauses by clauses, additions and misses', async () => {
    const g = await load(fixture(), [id.A2, id.A3, id.A4, id.A1, id.A1a, id.A1b, id.A5]);
    const best = bestSingles(g, candidates(g), 1);
    assert.strictEqual(best.length, 1);
    assert.strictEqual(render(best[0]), `< ${id.A}`);
    assert.deepStrictEqual(localScore(best[0], g), { additions: 1, misses: 0, clauses: 1 });
    assert.deepStrictEqual(additionsOf(g, best[0]), [id.A5a]);
  });
});

/** What the form selects outside the members. */
function additionsOf(g: TaxonomyGraph, form: Parameters<typeof render>[0]): string[] {
  return [...fixture().evaluate(render(form))].filter((c) => !g.members.has(c));
}
