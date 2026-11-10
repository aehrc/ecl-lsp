// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { findDuplicateTerms, findNearMisses } from '../derive/critique';
import { loadTaxonomyGraph, type TaxonomyGraph } from '../derive/taxonomy-graph';
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

/** Every listed concept but A5a. */
const NEARLY_A = [id.A, id.A1, id.A1a, id.A1b, id.A2, id.A3, id.A4, id.A5];

async function graphOf(set: string[], descend: () => boolean = () => true): Promise<TaxonomyGraph> {
  const mock = fixture();
  const members = { clause: { concepts: set }, ecl: orGroup(set), size: set.length };
  const graph = await loadTaxonomyGraph(members, new SetQueries(mock.expandCompose.bind(mock)), {
    maxConcepts: 1000,
    descend,
  });
  if ('unavailable' in graph) throw new Error(`graph unavailable: ${graph.unavailable}`);
  return graph;
}

describe('findNearMisses', () => {
  it('reports a grouper the list nearly fills', async () => {
    const g = await graphOf(NEARLY_A);
    assert.deepStrictEqual(findNearMisses(g, 0.85, 5, 5), [{ conceptId: id.A, descendants: 9, listed: 8 }]);
  });

  it('ignores it below the share', async () => {
    const g = await graphOf(NEARLY_A);
    assert.deepStrictEqual(findNearMisses(g, 0.9, 5, 5), []);
  });

  it('ignores subtrees smaller than the minimum', async () => {
    const g = await graphOf(NEARLY_A);
    const found = findNearMisses(g, 0.4, 10, 5);
    assert.ok(found.length > 0);
    assert.ok(
      found.every((n) => n.descendants >= 10),
      JSON.stringify(found),
    );
  });

  it('reports only the outermost of nested near misses', async () => {
    const g = await graphOf(NEARLY_A);
    assert.deepStrictEqual(findNearMisses(g, 0.5, 5, 5), [{ conceptId: id.FINDING, descendants: 13, listed: 8 }]);
  });

  it('never reports a concept whose descendants are not loaded', async () => {
    const g = await graphOf(NEARLY_A, () => false);
    for (const n of findNearMisses(g, 0.1, 1, 50)) assert.ok(g.hasDescendants(n.conceptId), n.conceptId);
  });

  it('caps the number reported', async () => {
    const g = await graphOf(NEARLY_A);
    assert.deepStrictEqual(findNearMisses(g, 0.85, 5, 0), []);
  });
});

describe('findDuplicateTerms', () => {
  const c = (code: string, display: string) => ({ code, display });

  it('groups different concepts that share a term', () => {
    assert.deepStrictEqual(findDuplicateTerms([c('3', 'Dressing'), c('1', 'Wound'), c('2', 'Dressing')]), [
      { term: 'Dressing', conceptIds: ['2', '3'] },
    ]);
  });

  it('matches terms regardless of case and spacing', () => {
    assert.deepStrictEqual(findDuplicateTerms([c('1', 'Wound  dressing'), c('2', ' wound dressing')]), [
      { term: 'Wound  dressing', conceptIds: ['1', '2'] },
    ]);
  });

  it('ignores a concept listed twice and concepts without a term', () => {
    assert.deepStrictEqual(findDuplicateTerms([c('1', 'Dressing'), c('1', 'Dressing'), c('2', ''), c('3', '')]), []);
  });

  it('orders groups by term', () => {
    const found = findDuplicateTerms([c('1', 'b'), c('2', 'a'), c('3', 'B'), c('4', 'A')]);
    assert.deepStrictEqual(
      found.map((d) => d.term),
      ['a', 'b'],
    );
  });
});
