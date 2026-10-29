// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { loadTaxonomyGraph, type GraphUnavailable, type TaxonomyGraph } from '../derive/taxonomy-graph';
import { byId, orGroup, SetQueries } from '../derive/set-queries';
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

const SET = [id.A1a, id.A1b, id.A2];

function load(
  mock: HierarchyMockService,
  set: string[] = SET,
  maxConcepts = 1000,
  descend: (id: string) => boolean = () => false,
) {
  const members = { clause: { concepts: set }, ecl: orGroup(set), size: set.length };
  const q = new SetQueries(mock.expandCompose.bind(mock));
  return loadTaxonomyGraph(members, q, { maxConcepts, descend });
}

async function loaded(mock: HierarchyMockService, descend?: (id: string) => boolean): Promise<TaxonomyGraph> {
  const result = await load(mock, SET, 1000, descend);
  assert.ok(!('unavailable' in result), 'graph unavailable');
  return result;
}

describe('loadTaxonomyGraph', () => {
  it('loads ancestors, children and true positives', async () => {
    const g = await loaded(fixture());
    assert.strictEqual(g.truePos(id.A), 3);
    assert.strictEqual(g.truePos(id.A1), 2);
    assert.deepStrictEqual(g.children(id.A).sort(byId), [id.A1, id.A2, id.A3, id.A4, id.A5]);
    assert.deepStrictEqual(g.roots(), [id.A1a, id.A1b, id.A2]);
    assert.strictEqual(g.aboveMember(id.FINDING), true);
    assert.strictEqual(g.aboveMember(id.B), false);
  });

  it('loads descendants only where asked', async () => {
    const g = await loaded(fixture(), (x) => x === id.A);
    assert.strictEqual(g.hasDescendants(id.A), true);
    assert.strictEqual(g.descendants(id.A).length, 9);
    assert.strictEqual(g.hasDescendants(id.FINDING), false);
  });

  it('reports what was too large', async () => {
    const result = (await load(fixture(), SET, 3)) as GraphUnavailable;
    assert.deepStrictEqual(result, { unavailable: 'the set with its ancestors' });
  });

  it('reports a server without parents', async () => {
    const mock = fixture();
    mock.returnsParents = false;
    const result = await load(mock);
    assert.ok('unavailable' in result);
    assert.strictEqual(result.unavailable, 'parents');
  });

  it('makes at most 4 requests', async () => {
    const mock = fixture();
    await load(mock, SET, 1000, () => true);
    assert.ok(mock.composeCalls.length <= 4, `${mock.composeCalls.length} requests`);
  });
});
