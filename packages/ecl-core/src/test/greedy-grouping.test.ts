// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { greedyGrouping } from '../derive/greedy-grouping';
import { deriveEcl } from '../derive/derive-ecl';
import { orGroup, SetQueries } from '../derive/set-queries';
import { HierarchyMockService, sctid } from './hierarchy-mock';

// Fixture hierarchy:
//
//   138875005 root
//   ├── FINDING
//   │   ├── A ── A1 ── A1a, A1b
//   │   │   ├── A2, A3, A4
//   │   │   ├── A5 ── A5a
//   │   │   └── (inactive) RETIRED
//   │   └── B ── B1, B2
//   └── PROC ── P1
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
    .add(id.RETIRED, 'Retired', [id.A], false);
}

async function group(mock: HierarchyMockService, set: string[], maxConcepts = 1000) {
  const notes: string[] = [];
  const members = { clause: { concepts: set }, ecl: orGroup(set), size: set.length };
  const q = new SetQueries(mock.expandCompose.bind(mock));
  const result = await greedyGrouping(members, q, { maxConcepts, maxClauses: 300 }, notes);
  return { result, notes };
}

describe('greedyGrouping', () => {
  it('groups under a non-member and excludes the subtree with no member', async () => {
    const { result } = await group(fixture(), [id.A1, id.A1a, id.A1b, id.A2, id.A3, id.A4]);
    assert.strictEqual(result?.ecl, `< ${id.A} MINUS << ${id.A5}`);
    assert.deepStrictEqual(result.exclusions, [{ conceptId: id.A5, operator: '<<' }]);
  });

  it('excludes a non-member above members on its own', async () => {
    const { result } = await group(fixture(), [id.A, id.A1a, id.A1b, id.A2, id.A3, id.A4, id.A5, id.A5a]);
    assert.strictEqual(result?.ecl, `<< ${id.A} MINUS ${id.A1}`);
  });

  it('lists members no grouper covers, leaves as << x', async () => {
    const { result } = await group(fixture(), [id.A1a, id.B2, id.P1]);
    assert.strictEqual(result?.ecl, `<< ${id.A1a} OR << ${id.B2} OR << ${id.P1}`);
  });

  it('drops a grouper whose descendants another grouper already selects', async () => {
    // Y's children both have X as a parent too, so `< X` alone selects them.
    const [X, Y, a, b, d1, d2] = [2001, 2002, 2003, 2004, 2005, 2006].map((n) => sctid(n));
    const mock = new HierarchyMockService()
      .add(ROOT, 'root')
      .add(X, 'X', [ROOT])
      .add(Y, 'Y', [ROOT])
      .add(a, 'a', [X])
      .add(b, 'b', [X])
      .add(d1, 'd1', [X, Y])
      .add(d2, 'd2', [X, Y]);
    const { result } = await group(mock, [a, b, d1, d2]);
    assert.strictEqual(result?.ecl, `< ${X}`);
  });

  it('selects exactly the set, whatever the set', async () => {
    const mock = fixture();
    const pool = Object.values(id).filter((x) => x !== id.RETIRED && x !== ROOT);
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let i = 0; i < 200; i++) {
      const set = pool.filter(() => random() < 0.4);
      if (set.length === 0) continue;
      const { result } = await group(mock, set);
      assert.ok(result, `no grouping for ${set.join(',')}`);
      const selected = [...mock.evaluate(result.ecl)].sort();
      assert.deepStrictEqual(selected, [...set].sort(), `${result.ecl} for ${set.join(',')}`);
    }
  });

  it('gives up with a note when the server returns no parents', async () => {
    const mock = fixture();
    mock.returnsParents = false;
    const { result, notes } = await group(mock, [id.A1a, id.A1b]);
    assert.strictEqual(result, null);
    assert.match(notes.join('\n'), /property=parent/);
  });

  it('gives up with a note when a subgraph is larger than the limit', async () => {
    const { result, notes } = await group(fixture(), [id.A1a, id.A1b, id.A2], 3);
    assert.strictEqual(result, null);
    assert.match(notes.join('\n'), /more than 3 concepts/);
  });
});

describe('deriveEcl with greedy grouping', () => {
  it('offers a greedy candidate when the set has too many roots for hierarchy covers', async () => {
    const mock = fixture();
    const set = [id.A1a, id.B2, id.P1];
    const result = await deriveEcl({ conceptIds: set }, mock, { maxRoots: 2, omitTerms: true });
    const greedy = result.candidates.find((c) => c.construction.kind === 'greedy-grouping');
    assert.ok(greedy);
    assert.strictEqual(greedy.exact, true);
  });

  it('can be turned off', async () => {
    const result = await deriveEcl({ conceptIds: [id.A1a, id.B2, id.P1] }, fixture(), {
      maxRoots: 2,
      greedyGrouping: false,
    });
    assert.ok(!result.candidates.some((c) => c.construction.kind === 'greedy-grouping'));
  });
});
