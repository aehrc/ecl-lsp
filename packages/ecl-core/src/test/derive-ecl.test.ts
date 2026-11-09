// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  deriveEcl,
  deriveInputFromText,
  formatDeriveReport,
  parseConceptIdList,
  type DeriveResult,
} from '../derive/derive-ecl';
import { HierarchyMockService, sctid } from './hierarchy-mock';
import { MockTerminologyService } from '../terminology/mock-service';

// Fixture hierarchy (ids are generated, Verhoeff-valid SCTIDs):
//
//   138875005 SNOMED CT root
//   ├── FINDING
//   │   ├── A ── A1 ── A1a, A1b
//   │   │   ├── A2, A3, A4
//   │   │   └── A5 ── A5a
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
  REFSET: sctid(1050),
};

function fixture(): HierarchyMockService {
  return new HierarchyMockService()
    .add(ROOT, 'SNOMED CT Concept')
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

function membersOf(mock: HierarchyMockService, ecl: string): string[] {
  return [...mock.evaluate(ecl)];
}

/** The derived candidate must select exactly what it reports (its own counts are honest). */
function assertCountsHonest(mock: HierarchyMockService, set: string[], result: DeriveResult): void {
  const s = new Set(set);
  for (const c of result.candidates) {
    const selected = mock.evaluate(c.ecl);
    const additions = [...selected].filter((x) => !s.has(x)).length;
    const misses = set.filter((x) => !selected.has(x)).length;
    assert.strictEqual(c.additions.count, additions, `additions of ${c.ecl}`);
    assert.strictEqual(c.misses.count, misses, `misses of ${c.ecl}`);
    assert.strictEqual(c.exact, additions === 0 && misses === 0, `exact flag of ${c.ecl}`);
  }
}

describe('deriveEcl', () => {
  describe('recovering a known definition', () => {
    for (const [name, ecl] of [
      ['<< A', `<< ${id.A}`],
      ['<< A1', `<< ${id.A1}`],
      ['<< B', `<< ${id.B}`],
    ]) {
      it(`ranks ${name} first for the members of ${name}`, async () => {
        const mock = fixture();
        const set = membersOf(mock, ecl);
        const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
        assert.strictEqual(result.candidates[0].ecl, ecl);
        assert.strictEqual(result.candidates[0].exact, true);
        assertCountsHonest(mock, set, result);
      });
    }

    it('ranks < A first for the members of < A (an ancestor outside the set)', async () => {
      const mock = fixture();
      const set = membersOf(mock, `< ${id.A}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      assert.strictEqual(result.candidates[0].ecl, `< ${id.A}`);
      assert.strictEqual(result.candidates[0].exact, true);
      assert.strictEqual(result.candidates[0].construction.kind, 'ancestor-cover');
      assertCountsHonest(mock, set, result);
    });

    it('excludes a clean subtree: << A MINUS << A1', async () => {
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A} MINUS << ${id.A1}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      assert.strictEqual(result.candidates[0].ecl, `<< ${id.A} MINUS << ${id.A1}`);
      assert.deepStrictEqual(result.candidates[0].construction, {
        kind: 'hierarchy',
        roots: [id.A],
        exclusions: [id.A1],
        literalExclusions: [],
      });
      assertCountsHonest(mock, set, result);
    });

    it('excludes a straddling concept literally and stays exact', async () => {
      // A1 is left out but its children are in, so `MINUS << A1` would lose members.
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A} MINUS ${id.A1}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      const hierarchy = result.candidates.find((c) => c.construction.kind === 'hierarchy' && c.exact);
      assert.ok(hierarchy, 'an exact hierarchy candidate exists');
      assert.strictEqual(hierarchy.ecl, `<< ${id.A} MINUS ${id.A1}`);
      assertCountsHonest(mock, set, result);
    });
  });

  describe('lossy candidates', () => {
    it('offers a parent outside the set when it is cheaper, with the additions sampled', async () => {
      // A1..A4 and their subtrees: `< A` adds only A5 and A5a, 1 clause against 4.
      // The per-query path: on the graph `< A MINUS << A5` is exact and ranks first.
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A1} OR ${id.A2} OR ${id.A3} OR ${id.A4}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, useGraph: false });
      const top = result.candidates[0];
      assert.strictEqual(top.ecl, `< ${id.A}`);
      assert.strictEqual(top.exact, false);
      assert.strictEqual(top.additions.count, 2);
      assert.deepStrictEqual(
        top.additions.sample.map((c) => c.code),
        [id.A5, id.A5a],
      );
      assert.ok(
        result.candidates.some((c) => c.exact),
        'an exact candidate is always offered',
      );
      assertCountsHonest(mock, set, result);
    });

    it('offers single clauses that miss part of the set', async () => {
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A} OR ${id.B1}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      const single = result.candidates.find((c) => c.ecl === `<< ${id.A}`);
      assert.ok(single, `<< A offered; got ${result.candidates.map((c) => c.ecl).join(' | ')}`);
      assert.strictEqual(single.misses.count, 1);
      assert.deepStrictEqual(
        single.misses.sample.map((c) => c.code),
        [id.B1],
      );
      assertCountsHonest(mock, set, result);
    });
  });

  describe('structureless sets', () => {
    it('keeps an exact candidate first when no pattern is cheaper', async () => {
      // Every root cover is as long as the list, so ties go to a derived form, then the list.
      const mock = fixture();
      const set = [id.A1a, id.B2, id.P1];
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      assert.strictEqual(result.candidates[0].exact, true);
      assert.strictEqual(result.candidates[0].clauses, 3);
      assertCountsHonest(mock, set, result);
    });

    it('always includes the enumeration itself', async () => {
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: [id.B2, id.A1a] }, mock, { omitTerms: true });
      const enumeration = result.candidates.find((c) => c.construction.kind === 'enumeration');
      assert.ok(enumeration);
      assert.strictEqual(enumeration.ecl, `(${id.A1a} OR ${id.B2})`);
      assert.strictEqual(enumeration.exact, true);
    });
  });

  describe('input report', () => {
    it('reports malformed, unknown, inactive and duplicate ids and leaves them out', async () => {
      const mock = fixture();
      const unknown = sctid(9999);
      const result = await deriveEcl(
        { conceptIds: [id.A2, ` ${id.A2} `, '1234', '22298007', unknown, id.RETIRED, id.A3, ''] },
        mock,
        { omitTerms: true },
      );
      assert.deepStrictEqual(result.input, {
        given: 6,
        members: 2,
        inactive: [id.RETIRED],
        unknown: [unknown],
        malformed: ['1234', '22298007'],
        duplicates: 1,
      });
      assert.ok(result.candidates.every((c) => !c.ecl.includes(id.RETIRED)));
    });

    it('returns no candidates, with a note, when nothing is usable', async () => {
      const result = await deriveEcl({ conceptIds: ['1234'] }, fixture());
      assert.deepStrictEqual(result.candidates, []);
      assert.strictEqual(result.notes.length, 1);
    });

    it('summarises members by top-level hierarchy', async () => {
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: [id.A1, id.A2, id.P1] }, mock, { omitTerms: true });
      assert.deepStrictEqual(result.hierarchies, [
        { conceptId: id.FINDING, display: 'Finding', count: 2 },
        { conceptId: id.PROC, display: 'Procedure', count: 1 },
      ]);
    });

    it('summarises without display terms when they cannot be read', async () => {
      const mock = fixture();
      mock.validateConcepts = async () => {
        throw new Error('lookup failed');
      };
      const result = await deriveEcl({ conceptIds: [id.A1, id.A2, id.P1] }, mock, { omitTerms: true });
      assert.deepStrictEqual(result.hierarchies, [
        { conceptId: id.FINDING, display: '', count: 2 },
        { conceptId: id.PROC, display: '', count: 1 },
      ]);
    });
  });

  describe('expression input', () => {
    it('derives from the set an expression selects, and offers the expression itself', async () => {
      const mock = fixture();
      const ecl = `${id.A} OR << ${id.A1} OR ${id.A2} OR ${id.A3} OR ${id.A4} OR << ${id.A5}`;
      const result = await deriveEcl({ ecl }, mock, { omitTerms: true });
      assert.strictEqual(result.input.members, 9);
      assert.strictEqual(result.candidates[0].ecl, `<< ${id.A}`);
      const itself = result.candidates.find((c) => c.construction.kind === 'expression');
      assert.ok(itself);
      assert.strictEqual(itself.ecl, ecl);
      assert.strictEqual(itself.exact, true);
    });

    it('offers a form shorter than the expression even when it is no shorter than the member list', async () => {
      // Selects A2 and P1 only; `<< A2 OR << P1` (2 clauses) costs the same as listing
      // the 2 members, but less than the 5-clause expression.
      const ecl = `(${id.A2} OR ${id.P1}) MINUS (${id.A5} OR ${id.A5a} OR ${id.A3})`;
      const result = await deriveEcl({ ecl }, fixture(), { omitTerms: true, refinements: 'never' });
      const shorter = result.candidates.find((c) => c.exact && c.clauses === 2);
      assert.ok(shorter, result.candidates.map((c) => `${c.construction.kind} ${c.ecl}`).join(' | '));
      assert.strictEqual(result.candidates[0], shorter);
      assert.doesNotMatch(result.notes.join('\n'), /not counted on the server/);
    });
  });

  describe('reference set input', () => {
    it('offers the refset itself and recovers its definition', async () => {
      const mock = fixture();
      mock.addRefset(id.REFSET, membersOf(mock, `<< ${id.B}`));
      const result = await deriveEcl({ refsetId: id.REFSET }, mock, { omitTerms: true });
      assert.strictEqual(result.input.members, 3);
      const ecls = result.candidates.map((c) => c.ecl);
      assert.ok(ecls.includes(`^ ${id.REFSET}`));
      assert.strictEqual(result.candidates[0].ecl, `<< ${id.B}`);
    });
  });

  describe('reference set input: why it is empty', () => {
    it('reports an unknown refset id as unknown', async () => {
      const result = await deriveEcl({ refsetId: sctid(7777) }, fixture());
      assert.deepStrictEqual(result.input.unknown, [sctid(7777)]);
    });

    it('notes a known concept with no active members instead of calling it unknown', async () => {
      const mock = fixture();
      mock.addRefset(id.B, [id.RETIRED]);
      const result = await deriveEcl({ refsetId: id.B }, mock);
      assert.deepStrictEqual(result.input.unknown, []);
      assert.match(result.notes.join('\n'), /has no active members, or is not a reference set/);
    });
  });

  describe('determinism and bounds', () => {
    it('gives the same result whatever the input order', async () => {
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A1} OR ${id.A2} OR ${id.A3} OR ${id.B1}`);
      const forward = await deriveEcl({ conceptIds: set }, mock);
      const backward = await deriveEcl({ conceptIds: [...set].reverse() }, mock);
      assert.deepStrictEqual(backward, forward);
    });

    it('skips hierarchy candidates above maxRoots and says why', async () => {
      const mock = fixture();
      // The per-query path: on the graph, hierarchy candidates cost no query per root.
      const result = await deriveEcl({ conceptIds: [id.A1a, id.B2, id.P1] }, mock, {
        maxRoots: 2,
        omitTerms: true,
        useGraph: false,
      });
      assert.strictEqual(result.roots, 3);
      assert.deepStrictEqual(
        result.candidates.map((c) => c.construction.kind),
        ['enumeration'],
      );
      assert.match(result.notes.join('\n'), /maxRoots/);
    });

    it('drops a candidate the server cannot score, with a note, and keeps the rest', async () => {
      const mock = fixture();
      const failing = `< ${id.A}`;
      const expand = mock.expandCompose.bind(mock);
      mock.expandCompose = (compose, options) =>
        // Only the comparison with the set (an include with an exclude) fails.
        compose.exclude && compose.include.some((c) => 'ecl' in c && c.ecl === failing)
          ? Promise.reject(new Error('timed out'))
          : expand(compose, options);
      const set = membersOf(mock, `<< ${id.A1} OR ${id.A2} OR ${id.A3} OR ${id.A4}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      assert.ok(result.candidates.every((c) => c.ecl !== failing));
      assert.ok(result.candidates.some((c) => c.exact));
      assert.match(result.notes.join('\n'), new RegExp(`Could not score < ${id.A}: timed out`));
    });

    it('needs a service with expandCompose', async () => {
      await assert.rejects(deriveEcl({ conceptIds: [id.A] }, new MockTerminologyService()), /expandCompose/);
    });
  });

  describe('property: every result is honest and has an exact candidate', () => {
    it('holds for 200 random subsets of the fixture', async () => {
      const mock = fixture();
      const pool = [...mock.evaluate('*')].sort();
      let seed = 147;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let run = 0; run < 200; run++) {
        const set = pool.filter(() => random() < 0.35);
        if (set.length === 0) continue;
        const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, maxCandidates: 50 });
        assert.ok(
          result.candidates.some((c) => c.exact),
          `exact candidate for ${set.join(',')}`,
        );
        assertCountsHonest(mock, set, result);
      }
    });
  });

  describe('choosing among many ancestors and subtrees', () => {
    it('finds specific shared parents under a long chain of broad ancestors', async () => {
      // 10 parents with two member children each, under a chain of 130 generic
      // ancestors; the lowest generic also holds 15 non-members. `< P0 OR … OR < P9`
      // is exact at half the length of the roots. The generics each cover every
      // root, so ranking ancestors by roots covered alone fills the shortlist with
      // them and never sizes the parents.
      const mock = new HierarchyMockService().add(ROOT, 'root');
      let above = ROOT;
      for (let i = 0; i < 130; i++) {
        const g = sctid(3000 + i);
        mock.add(g, `G${i}`, [above]);
        above = g;
      }
      for (let k = 0; k < 15; k++) mock.add(sctid(3500 + k), 'noise', [above]);
      const set: string[] = [];
      const parents: string[] = [];
      for (let k = 0; k < 10; k++) {
        const p = sctid(4000 + k);
        parents.push(p);
        mock.add(p, `P${k}`, [above]);
        for (let j = 0; j < 2; j++) {
          const r = sctid(4100 + k * 2 + j);
          mock.add(r, 'r', [p]);
          set.push(r);
        }
      }
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
      assert.strictEqual(result.candidates[0].ecl, parents.map((p) => `< ${p}`).join(' OR '));
      assert.strictEqual(result.candidates[0].exact, true);
    });

    it('excludes the largest clean subtrees, not the first ones returned', async () => {
      // 120 single-leaf subtrees come back first (lower ids); 3 subtrees of 11 come last.
      const mock = new HierarchyMockService().add(ROOT, 'root');
      const a = sctid(5000);
      mock.add(a, 'A', [ROOT]);
      for (let i = 0; i < 120; i++) mock.add(sctid(5100 + i), `leaf${i}`, [a]);
      const big: string[] = [];
      let n = 6000;
      for (let b = 0; b < 3; b++) {
        const id = sctid(5900 + b);
        big.push(id);
        mock.add(id, `big${b}`, [a]);
        for (let k = 0; k < 10; k++) mock.add(sctid(n++), 'x', [id]);
      }
      // M has 150 member children, so the exact cover (1 + 2 subtrees + 131
      // literals) is cheaper than listing the 152 members, and is counted.
      const m = sctid(5050);
      mock.add(m, 'M', [a]);
      const set = [a, m];
      for (let i = 0; i < 150; i++) {
        mock.add(sctid(7000 + i), `Mc${i}`, [m]);
        set.push(sctid(7000 + i));
      }
      const result = await deriveEcl({ conceptIds: set }, mock, {
        omitTerms: true,
        maxExclusions: 2,
        maxResidualLiterals: 200,
      });
      const cover = result.candidates.find((c) => c.construction.kind === 'hierarchy' && c.exact);
      assert.ok(cover);
      assert.deepStrictEqual(cover.construction.kind === 'hierarchy' && cover.construction.exclusions, big.slice(0, 2));
    });
  });

  describe('property: honest counts on polyhierarchies with inactive concepts', () => {
    it('holds for 10 random DAGs x 10 subsets', async () => {
      let seed = 7;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let g = 0; g < 10; g++) {
        const mock = new HierarchyMockService().add(ROOT, 'root');
        const ids = [ROOT];
        for (let i = 0; i < 40; i++) {
          const c = sctid(20000 + g * 100 + i);
          const k = 1 + (random() < 0.4 ? 1 : 0) + (random() < 0.15 ? 1 : 0);
          const parentsOf = [...new Set(Array.from({ length: k }, () => ids[Math.floor(random() * ids.length)]))];
          mock.add(c, `c${i}`, parentsOf, random() > 0.05);
          ids.push(c);
        }
        for (let r = 0; r < 10; r++) {
          const set = ids.filter(() => random() < 0.3);
          if (set.length === 0) continue;
          const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, maxCandidates: 50 });
          const active = set.filter((x) => mock.concepts.get(x)?.active);
          assertCountsHonest(mock, active, result);
          if (active.length > 0) assert.ok(result.candidates.some((c) => c.exact));
        }
      }
    });
  });

  describe('the graph path', () => {
    const listed = () => [id.A1, id.A1a, id.A1b, id.A2, id.A3, id.A4];

    it('uses at most 6 + 2 per candidate requests on the graph path', async () => {
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: listed() }, mock, { omitTerms: true });
      assert.ok(result.candidates.length > 0);
      assert.ok(
        mock.composeCalls.length <= 6 + 2 * result.candidates.length,
        `${mock.composeCalls.length} requests for ${result.candidates.length} candidates`,
      );
      assertCountsHonest(mock, listed(), result);
    });

    it('falls back to per-query covers without parents', async () => {
      const mock = fixture();
      mock.returnsParents = false;
      const result = await deriveEcl({ conceptIds: listed() }, mock, { omitTerms: true });
      const queryPath = await deriveEcl({ conceptIds: listed() }, fixture(), { omitTerms: true, useGraph: false });
      assert.strictEqual(result.candidates[0].ecl, queryPath.candidates[0].ecl);
      assert.match(result.notes.join('\n'), /per-query counts: parents/);
      assertCountsHonest(mock, listed(), result);
    });

    it('falls back when the graph is too large', async () => {
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: listed() }, mock, { omitTerms: true, maxGraphConcepts: 3 });
      assert.match(result.notes.join('\n'), /per-query counts: .*more than|too large/);
      assert.ok(result.candidates.length > 0);
      assertCountsHonest(mock, listed(), result);
    });

    it('reports server counts when the graph was incomplete', async () => {
      // The subgraph loses A5a, so locally `< A` adds only A5; the server says A5 and A5a.
      const mock = fixture();
      const expand = mock.expandCompose.bind(mock);
      mock.expandCompose = async (compose, options) => {
        const r = await expand(compose, options);
        if (!options?.parents) return r;
        const concepts = r.concepts.filter((c) => c.code !== id.A5a);
        return { ...r, concepts, total: r.total - (r.concepts.length - concepts.length) };
      };
      const result = await deriveEcl({ conceptIds: listed() }, mock, { omitTerms: true });
      const parent = result.candidates.find((c) => c.ecl === `< ${id.A}`);
      assert.ok(parent, result.candidates.map((c) => c.ecl).join(' | '));
      const added = [...mock.evaluate(`< ${id.A}`)].filter((x) => !listed().includes(x));
      assert.strictEqual(parent.additions.count, added.length);
      assertCountsHonest(mock, listed(), result);
      assert.match(result.notes.join('\n'), /differed from the server/);
    });

    it('keeps inactive and unknown inputs out of candidates', async () => {
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: [id.A1a, id.A1b, id.RETIRED, '1234567890123'] }, mock, {
        omitTerms: true,
      });
      assert.deepStrictEqual(result.input.inactive, [id.RETIRED]);
      assert.ok(result.candidates.every((c) => !c.ecl.includes(id.RETIRED)));
      assert.strictEqual(result.candidates[0].exact, true);
      assertCountsHonest(mock, [id.A1a, id.A1b], result);
      assert.doesNotMatch(result.notes.join('\n'), /per-query counts/);
    });

    it('scores every graph candidate on the server under `within`', async () => {
      // Within `< A MINUS << A5`, `< A` adds nothing; everywhere it adds A5 and
      // A5a, so by local counts it ranks below `< A MINUS << A5`.
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: listed() }, mock, {
        omitTerms: true,
        refinements: 'never',
        within: `< ${id.A} MINUS << ${id.A5}`,
        maxCandidates: 1,
      });
      assert.strictEqual(result.candidates[0].ecl, `< ${id.A}`);
      assert.strictEqual(result.candidates[0].exact, true);
    });

    it('under `within`, offers the single ancestor that misses nothing even when it adds much elsewhere', async () => {
      // FINDING has 10 more children outside the set, so everywhere `< FINDING`
      // adds more than `< A1`, `< B` and `< A` cost with their misses; within
      // the members and PROC it adds nothing (issue #147, ecl-047).
      const mock = fixture();
      for (let i = 0; i < 10; i++) mock.add(sctid(4000 + i), `F${i}`, [id.FINDING]);
      const set = [id.A1a, id.A1b, id.A5a, id.B1, id.B2];
      const result = await deriveEcl({ conceptIds: set }, mock, {
        omitTerms: true,
        refinements: 'never',
        within: `${set.join(' OR ')} OR << ${id.PROC}`,
      });
      const single = result.candidates.find((c) => c.ecl === `< ${id.FINDING}`);
      assert.ok(single, result.candidates.map((c) => c.ecl).join(' | '));
      assert.strictEqual(single.exact, true);
      assert.strictEqual(result.candidates[0].ecl, `< ${id.FINDING}`);
    });

    it('offers greedy grouping on a partial graph when the descendants are too many', async () => {
      // M is a root with a deep subtree (C and 20 children), so loading below
      // every root is too large; below REFACTOR's candidates (A, A1) is not.
      const mock = fixture();
      const [m, c] = [sctid(3000), sctid(3001)];
      mock.add(m, 'M', [id.PROC]).add(c, 'C', [m]);
      for (let i = 0; i < 20; i++) mock.add(sctid(3010 + i), `C${i}`, [c]);
      const set = [...listed(), m];
      const result = await deriveEcl({ conceptIds: set }, mock, {
        omitTerms: true,
        refinements: 'never',
        maxGraphConcepts: 20,
      });
      const notes = result.notes.join('\n');
      assert.doesNotMatch(notes, /per-query counts/);
      assert.match(notes, /partial/);
      const greedy = result.candidates.find((x) => x.construction.kind === 'greedy-grouping');
      assert.ok(greedy, result.candidates.map((x) => x.ecl).join(' | '));
      assert.strictEqual(greedy.exact, true);
      assertCountsHonest(mock, set, result);
    });

    it('does not size a roots cover from a partial graph that lacks the roots descendants', async () => {
      // M's subtree (C and its 25 children) is too large to load, so a count of what
      // `<< M` adds would come from the few concepts that were loaded.
      const [m, c, a] = [sctid(3000), sctid(3001), sctid(3002)];
      const mock = new HierarchyMockService()
        .add(ROOT, 'root')
        .add(m, 'M', [ROOT])
        .add(c, 'C', [m])
        .add(a, 'A', [ROOT]);
      for (let i = 0; i < 25; i++) mock.add(sctid(3010 + i), `C${i}`, [c]);
      const leaves = Array.from({ length: 6 }, (_, i) => sctid(4010 + i));
      for (const l of leaves) mock.add(l, 'leaf', [a]);
      const result = await deriveEcl({ conceptIds: [m, ...leaves] }, mock, {
        omitTerms: true,
        refinements: 'never',
        maxGraphConcepts: 20,
        maxExclusions: 0,
        maxResidualLiterals: 0,
      });
      const notes = result.notes.join('\n');
      assert.match(notes, /partial/);
      assert.doesNotMatch(notes, /non-members remain/);
    });

    it('does not count on the server a graph candidate no cheaper than listing the members', async () => {
      // Two unrelated members: every hierarchy form is `<< A2 OR << P1`, 2 clauses.
      const mock = fixture();
      const result = await deriveEcl({ conceptIds: [id.A2, id.P1] }, mock, { omitTerms: true, refinements: 'never' });
      assert.deepStrictEqual(
        result.candidates.map((x) => x.construction.kind),
        ['enumeration'],
      );
      assert.match(result.notes.join('\n'), /1 graph candidate was not counted on the server/);
    });
  });

  describe('critique', () => {
    const NEARLY_A = [id.A, id.A1, id.A1a, id.A1b, id.A2, id.A3, id.A4, id.A5];

    it('is absent by default and costs no request', async () => {
      const set = [id.A1a, id.B2, id.P1];
      const off = fixture();
      const result = await deriveEcl({ conceptIds: set }, off, { omitTerms: true });
      assert.strictEqual(result.critique, undefined);
      const explicit = fixture();
      await deriveEcl({ conceptIds: set }, explicit, { omitTerms: true, critique: false });
      assert.strictEqual(explicit.composeCalls.length, off.composeCalls.length);
    });

    it('flags a list that needs more clauses than the limit', async () => {
      const set = [id.A1a, id.B2, id.P1];
      const tight = await deriveEcl({ conceptIds: set }, fixture(), { omitTerms: true, critique: { maxClauses: 2 } });
      assert.deepStrictEqual(tight.critique?.clauses, { best: 3, limit: 2, exceeded: true });
      const loose = await deriveEcl({ conceptIds: set }, fixture(), { omitTerms: true, critique: true });
      assert.deepStrictEqual(loose.critique?.clauses, { best: 3, limit: 35, exceeded: false });
    });

    it('reports a near miss with server-counted missing members', async () => {
      const result = await deriveEcl({ conceptIds: NEARLY_A }, fixture(), {
        omitTerms: true,
        critique: { nearMissShare: 0.85 },
      });
      const misses = result.critique?.nearMisses ?? [];
      assert.strictEqual(misses.length, 1, JSON.stringify(misses));
      const [n] = misses;
      assert.strictEqual(n.conceptId, id.A);
      assert.strictEqual(n.descendants, 9);
      assert.strictEqual(n.listed, 8);
      assert.strictEqual(n.missing.count, 1);
      assert.strictEqual(n.missing.sample[0].code, id.A5a);
    });

    it('gives near misses terms unless omitTerms', async () => {
      const result = await deriveEcl({ conceptIds: NEARLY_A }, fixture(), { critique: { nearMissShare: 0.85 } });
      assert.strictEqual(result.critique?.nearMisses[0]?.display, 'A');
    });

    it('has no near misses off the graph, with a note', async () => {
      const result = await deriveEcl({ conceptIds: NEARLY_A }, fixture(), {
        omitTerms: true,
        useGraph: false,
        critique: { nearMissShare: 0.85 },
      });
      assert.deepStrictEqual(result.critique?.nearMisses, []);
      assert.match(result.notes.join('\n'), /near misses need the IS-A subgraph/i);
      assert.ok(result.critique?.clauses.best);
    });

    it('notes whether the members span more than one top-level hierarchy', async () => {
      const result = await deriveEcl({ conceptIds: [id.A1a, id.P1] }, fixture(), {
        omitTerms: true,
        hierarchySummary: false,
        critique: true,
      });
      assert.strictEqual(result.critique?.spansHierarchies, true);
      assert.strictEqual(result.critique?.hierarchies.length, 2);
    });

    it('lists the inactive ids given', async () => {
      const result = await deriveEcl({ conceptIds: [id.A2, id.A3, id.RETIRED] }, fixture(), {
        omitTerms: true,
        critique: true,
      });
      assert.deepStrictEqual(result.critique?.inactive, [id.RETIRED]);
    });

    it('lists the inactive members of a reference set', async () => {
      const mock = fixture().addRefset(id.REFSET, [id.A1a, id.B2, id.RETIRED]);
      const result = await deriveEcl({ refsetId: id.REFSET }, mock, { omitTerms: true, critique: true });
      assert.deepStrictEqual(result.critique?.inactive, [id.RETIRED]);
      assert.match(formatDeriveReport(result), new RegExp(`^ {3}Inactive members: 1: ${id.RETIRED}\\.$`, 'm'));
    });

    it('says why near misses were skipped', async () => {
      const off = await deriveEcl({ conceptIds: NEARLY_A }, fixture(), {
        omitTerms: true,
        useGraph: false,
        critique: true,
      });
      assert.match(off.notes.join('\n'), /near misses need the IS-A subgraph, which useGraph: false turns off/i);
      const mock = fixture();
      mock.returnsParents = false;
      const failed = await deriveEcl({ conceptIds: NEARLY_A }, mock, { omitTerms: true, critique: true });
      assert.match(failed.notes.join('\n'), /near misses need the IS-A subgraph, which was not loaded/i);
    });

    it('drops a near miss the server count puts below the share', async () => {
      const mock = fixture();
      const expand = mock.expandCompose.bind(mock);
      mock.expandCompose = async (compose, options) => {
        const ecl = compose.include.map((x) => ('ecl' in x ? x.ecl : '')).join();
        const r = await expand(compose, options);
        // The server finds 4 more concepts under A than the graph did: 8 of 13 is below 0.85.
        return ecl === `<< ${id.A}` && compose.exclude?.length ? { ...r, total: r.total + 4 } : r;
      };
      const result = await deriveEcl({ conceptIds: NEARLY_A }, mock, {
        omitTerms: true,
        critique: { nearMissShare: 0.85 },
      });
      assert.deepStrictEqual(result.critique?.nearMisses, []);
    });

    it('reconsiders a nested near miss when the server drops the outer one', async () => {
      const mock = fixture();
      const expand = mock.expandCompose.bind(mock);
      mock.expandCompose = async (compose, options) => {
        const ecl = compose.include.map((x) => ('ecl' in x ? x.ecl : '')).join();
        const r = await expand(compose, options);
        // The server finds 4 more under Finding: 8 of 17 is below 0.5, so A (8 of 9) is the near miss.
        return ecl === `<< ${id.FINDING}` && compose.exclude?.length ? { ...r, total: r.total + 4 } : r;
      };
      const result = await deriveEcl({ conceptIds: NEARLY_A }, mock, {
        omitTerms: true,
        critique: { nearMissShare: 0.5 },
      });
      assert.deepStrictEqual(
        result.critique?.nearMisses.map((n) => n.conceptId),
        [id.A],
      );
    });

    it('leaves the hierarchy summary out of the result when it was turned off', async () => {
      const result = await deriveEcl({ conceptIds: [id.A1a, id.P1] }, fixture(), {
        omitTerms: true,
        hierarchySummary: false,
        critique: true,
      });
      assert.deepStrictEqual(result.hierarchies, []);
      assert.strictEqual(result.critique?.hierarchies.length, 2);
      assert.doesNotMatch(formatDeriveReport(result), /^Hierarchies:/m);
    });

    it('judges a reference set by the best form derived from it, not by `^ refset`', async () => {
      const mock = fixture().addRefset(id.REFSET, [id.A1a, id.B2, id.P1]);
      const result = await deriveEcl({ refsetId: id.REFSET }, mock, { omitTerms: true, critique: { maxClauses: 2 } });
      assert.deepStrictEqual(result.critique?.clauses, { best: 3, limit: 2, exceeded: true });
    });

    it('keeps the result when a near-miss count fails', async () => {
      const mock = fixture();
      const expand = mock.expandCompose.bind(mock);
      mock.expandCompose = async (compose, options) => {
        const ecl = compose.include.map((x) => ('ecl' in x ? x.ecl : '')).join();
        if (ecl === `<< ${id.A}` && compose.exclude?.length) throw new Error('429 Too Many Requests');
        return expand(compose, options);
      };
      const result = await deriveEcl({ conceptIds: NEARLY_A }, mock, {
        omitTerms: true,
        critique: { nearMissShare: 0.85 },
      });
      assert.ok(result.candidates.length > 0);
      assert.deepStrictEqual(result.critique?.nearMisses, []);
      assert.match(result.notes.join('\n'), new RegExp(`near miss << ${id.A} was not counted: 429`, 'i'));
    });

    describe('implied inactive codes', () => {
      const OLD = sctid(1060);
      const withHistory = () => fixture().add(OLD, 'Old', [id.A], false).associate(OLD, id.A2);
      const ecls = (mock: HierarchyMockService) =>
        mock.composeCalls.flatMap((c) => c.include.flatMap((x) => ('ecl' in x ? [x.ecl] : [])));

      it('reports inactive codes the history implies', async () => {
        const mock = withHistory();
        const result = await deriveEcl({ conceptIds: [id.A2, id.A3] }, mock, {
          omitTerms: true,
          critique: { impliedInactive: true },
        });
        assert.strictEqual(result.critique?.impliedInactive?.count, 1);
        assert.strictEqual(result.critique?.impliedInactive?.sample[0].code, OLD);
        assert.ok(ecls(mock).some((e) => e.includes('{{ +HISTORY-MOD }}')));
      });

      it('uses the profile asked for', async () => {
        const mock = withHistory();
        await deriveEcl({ conceptIds: [id.A2, id.A3] }, mock, {
          omitTerms: true,
          critique: { impliedInactive: 'HISTORY-MIN' },
        });
        assert.ok(ecls(mock).some((e) => e.includes('{{ +HISTORY-MIN }}')));
      });

      it('does not report an inactive code the list already gives', async () => {
        const result = await deriveEcl({ conceptIds: [id.A2, id.A3, OLD] }, withHistory(), {
          omitTerms: true,
          critique: { impliedInactive: true },
        });
        assert.strictEqual(result.critique?.impliedInactive?.count, 0);
      });

      it('is off unless asked', async () => {
        const mock = withHistory();
        const result = await deriveEcl({ conceptIds: [id.A2, id.A3] }, mock, { omitTerms: true, critique: true });
        assert.strictEqual(result.critique?.impliedInactive, undefined);
        assert.ok(!ecls(mock).some((e) => e.includes('HISTORY')));
      });

      it('notes a server that rejects the history supplement', async () => {
        const mock = withHistory();
        const expand = mock.expandCompose.bind(mock);
        mock.expandCompose = async (compose, options) => {
          if (compose.include.some((x) => 'ecl' in x && x.ecl.includes('HISTORY'))) throw new Error('unsupported');
          return expand(compose, options);
        };
        const result = await deriveEcl({ conceptIds: [id.A2, id.A3] }, mock, {
          omitTerms: true,
          critique: { impliedInactive: true },
        });
        assert.strictEqual(result.critique?.impliedInactive, undefined);
        assert.match(result.notes.join('\n'), /implied inactive.*unsupported/i);
        assert.ok(result.critique?.clauses.best);
      });
    });
  });

  describe('presentation', () => {
    it('formats candidates with display terms', async () => {
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A} MINUS << ${id.A1}`);
      const result = await deriveEcl({ conceptIds: set }, mock);
      assert.strictEqual(result.candidates[0].expression, `<< ${id.A} | A | MINUS << ${id.A1} | A1 |`);
      assert.strictEqual(result.candidates[0].ecl, `<< ${id.A} MINUS << ${id.A1}`);
    });
  });
});

describe('deriveEcl — attribute refinements (#149 Part 3)', () => {
  // Products under three unrelated groupers; each has a dose form. The set is
  // every product whose form is a tablet: it cuts across the groupers, so only
  // a refinement says it briefly.
  const P = {
    PRODUCT: sctid(2001),
    G1: sctid(2011),
    G2: sctid(2012),
    G3: sctid(2013),
    FORM: sctid(2020),
    DOSE: sctid(2021),
    TAB: sctid(2030),
    TAB_FILM: sctid(2031),
    TAB_CHEW: sctid(2032),
    CAP: sctid(2033),
    REFSET: sctid(2040),
  };
  const products: { id: string; grouper: string; form: string }[] = [];

  function products3(): HierarchyMockService {
    const mock = new HierarchyMockService()
      .add(ROOT, 'root')
      .add(P.PRODUCT, 'Product', [ROOT])
      .add(P.G1, 'G1', [P.PRODUCT])
      .add(P.G2, 'G2', [P.PRODUCT])
      .add(P.G3, 'G3', [P.PRODUCT])
      .add(P.DOSE, 'Dose form', [ROOT])
      .add(P.FORM, 'Has dose form', [ROOT])
      .add(P.TAB, 'Tablet', [P.DOSE])
      .add(P.TAB_FILM, 'Film tablet', [P.TAB])
      .add(P.TAB_CHEW, 'Chewable tablet', [P.TAB])
      .add(P.CAP, 'Capsule', [P.DOSE]);
    products.length = 0;
    const forms = [P.TAB_FILM, P.TAB_CHEW, P.CAP, P.TAB_FILM];
    for (let i = 0; i < 24; i++) {
      const product = { id: sctid(2100 + i), grouper: [P.G1, P.G2, P.G3][i % 3], form: forms[i % 4] };
      products.push(product);
      mock.add(product.id, `product${i}`, [product.grouper]).relate(product.id, P.FORM, product.form);
    }
    return mock.addRefset(
      P.REFSET,
      products.map((p) => p.id),
    );
  }

  it('recovers `focus : attribute = << value` for a set that cuts across the hierarchy', async () => {
    const mock = products3();
    const set = [...mock.evaluate(`< ${P.PRODUCT} : ${P.FORM} = << ${P.TAB}`)];
    assert.strictEqual(set.length, 18);
    const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, refinements: 'always' });
    const top = result.candidates[0];
    assert.strictEqual(top.construction.kind, 'refinement');
    assert.strictEqual(top.exact, true);
    assert.deepStrictEqual(mock.evaluate(top.ecl), new Set(set));
    assertCountsHonest(mock, set, result);
  });

  it('keeps deriving when some relationship lookups fail', async () => {
    const mock = products3();
    const set = [...mock.evaluate(`< ${P.PRODUCT} : ${P.FORM} = << ${P.TAB}`)];
    const read = mock.getDefiningRelationships.bind(mock);
    let calls = 0;
    mock.getDefiningRelationships = async (conceptId: string) => {
      if (++calls % 5 === 0) throw new Error('timed out');
      return read(conceptId);
    };
    const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, refinements: 'always' });
    assert.ok(result.candidates.length > 0);
    assert.match(result.notes.join('\n'), /relationships of \d+ sampled members? could not be read: timed out/);
  });

  it('uses the refset an ECL input is restricted to as the focus', async () => {
    const mock = products3();
    const ecl = `^ ${P.REFSET} : ${P.FORM} = << ${P.TAB}`;
    const result = await deriveEcl({ ecl }, mock, { omitTerms: true, refinements: 'always' });
    // `< PRODUCT : …` is exact too and ties on cost; the refset focus must be offered.
    const refsetFocused = result.candidates.find(
      (c) => c.construction.kind === 'refinement' && c.ecl.startsWith(`^ ${P.REFSET} : ${P.FORM} = `),
    );
    assert.ok(refsetFocused, result.candidates.map((c) => c.ecl).join(' | '));
    assert.strictEqual(refsetFocused.exact, true);
  });

  it('honours an explicit refinementFocus', async () => {
    const mock = products3();
    const set = [...mock.evaluate(`< ${P.PRODUCT} : ${P.FORM} = << ${P.TAB}`)];
    const result = await deriveEcl({ conceptIds: set }, mock, {
      omitTerms: true,
      refinements: 'always',
      refinementFocus: `^ ${P.REFSET}`,
    });
    const refinements = result.candidates.filter((c) => c.construction.kind === 'refinement');
    assert.ok(refinements.length > 0);
    assert.ok(refinements.every((c) => c.ecl.startsWith(`^ ${P.REFSET} :`)));
  });

  it('brackets a compound refinementFocus', async () => {
    const mock = products3();
    const set = [...mock.evaluate(`< ${P.PRODUCT} : ${P.FORM} = << ${P.TAB}`)];
    const result = await deriveEcl({ conceptIds: set }, mock, {
      omitTerms: true,
      refinements: 'always',
      refinementFocus: `<< ${P.G1} OR << ${P.G2} OR << ${P.G3}`,
    });
    const refinement = result.candidates.find((c) => c.construction.kind === 'refinement');
    assert.ok(refinement);
    assert.ok(refinement.ecl.startsWith(`(<< ${P.G1} OR << ${P.G2} OR << ${P.G3}) :`), refinement.ecl);
  });

  it('offers the value most members share when members carry several values', async () => {
    // Combination products: every member has paracetamol, some also caffeine or codeine.
    // `= any ingredient members have` would add the caffeine-only products.
    const mock = products3();
    const ING = sctid(2050);
    const PARA = sctid(2051);
    const CAFF = sctid(2052);
    const COD = sctid(2053);
    mock
      .add(ING, 'Has ingredient', [ROOT])
      .add(PARA, 'Paracetamol', [ROOT])
      .add(CAFF, 'Caffeine', [ROOT])
      .add(COD, 'Codeine', [ROOT]);
    products.forEach((p, i) => {
      if (i < 12) mock.relate(p.id, ING, PARA);
      if (i % 3 === 0) mock.relate(p.id, ING, CAFF);
      if (i % 4 === 1) mock.relate(p.id, ING, COD);
    });
    const ecl = `^ ${P.REFSET} : ${ING} = << ${PARA}`;
    const set = [...mock.evaluate(ecl)];
    const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, refinementFocus: `^ ${P.REFSET}` });
    assert.strictEqual(result.candidates[0].ecl, ecl);
    assert.strictEqual(result.candidates[0].exact, true);
  });

  describe('concrete values, cardinality and subtraction', () => {
    const STRENGTH = sctid(2060);
    const ING = sctid(2061);
    const PARA = sctid(2062);
    const CAFF = sctid(2063);

    // Strengths cycle over 5 products (groupers over 3, so they do not line up);
    // products 0-11 contain paracetamol, every third one caffeine too.
    function richer(): HierarchyMockService {
      const mock = products3()
        .add(STRENGTH, 'Has strength', [ROOT])
        .add(ING, 'Has ingredient', [ROOT])
        .add(PARA, 'Paracetamol', [ROOT])
        .add(CAFF, 'Caffeine', [ROOT]);
      products.forEach((p, i) => {
        mock.relate(p.id, STRENGTH, `#${[250, 500, 1000, 500, 250][i % 5]}`);
        if (i < 12) mock.relate(p.id, ING, PARA);
        if (i % 3 === 0) mock.relate(p.id, ING, CAFF);
      });
      return mock;
    }

    const recover = async (mock: HierarchyMockService, ecl: string) => {
      const set = [...mock.evaluate(ecl)];
      assert.ok(set.length > 0, `fixture selects something: ${ecl}`);
      const result = await deriveEcl({ conceptIds: set }, mock, {
        omitTerms: true,
        refinements: 'always',
        refinementFocus: `^ ${P.REFSET}`,
      });
      assertCountsHonest(mock, set, result);
      return { set, result };
    };

    it('recovers an exact concrete value', async () => {
      const mock = richer();
      const { result } = await recover(mock, `^ ${P.REFSET} : ${STRENGTH} = #500`);
      assert.strictEqual(result.candidates[0].ecl, `^ ${P.REFSET} : ${STRENGTH} = #500`);
      assert.strictEqual(result.candidates[0].exact, true);
    });

    it('recovers a concrete range', async () => {
      const mock = richer();
      const { result } = await recover(mock, `^ ${P.REFSET} : ${STRENGTH} >= #250, ${STRENGTH} <= #500`);
      const top = result.candidates[0];
      assert.strictEqual(top.exact, true, top.ecl);
      assert.strictEqual(top.ecl, `^ ${P.REFSET} : ${STRENGTH} >= #250, ${STRENGTH} <= #500`);
    });

    it('recovers a cardinality', async () => {
      const mock = richer();
      const { result } = await recover(mock, `^ ${P.REFSET} : [2..*] ${ING} = *`);
      const top = result.candidates[0];
      assert.strictEqual(top.exact, true, top.ecl);
      assert.match(top.ecl, new RegExp(`\\[2\\.\\.\\*\\] ${ING} = `));
    });

    it('recovers one refinement minus another as a subtraction', async () => {
      const mock = richer();
      const ecl = `(^ ${P.REFSET} : ${ING} = << ${PARA}) MINUS (^ ${P.REFSET} : ${P.FORM} = << ${P.CAP})`;
      const { result } = await recover(mock, ecl);
      const exact = result.candidates.find((c) => c.exact && c.construction.kind !== 'enumeration');
      assert.ok(exact, result.candidates.map((c) => `${c.construction.kind} ${c.ecl}`).join(' | '));
      assert.strictEqual(exact.construction.kind, 'subtraction');
    });
  });

  it('says so when the service cannot read relationships', async () => {
    const mock = products3().withoutRelationships();
    const set = [...mock.evaluate(`< ${P.PRODUCT} : ${P.FORM} = << ${P.TAB}`)];
    const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true, refinements: 'always' });
    assert.match(result.notes.join('\n'), /getDefiningRelationships/);
    assert.ok(result.candidates.every((c) => c.construction.kind !== 'refinement'));
  });

  it('does not try refinements for a set that follows the hierarchy (auto)', async () => {
    const mock = products3();
    const set = [...mock.evaluate(`<< ${P.G1}`)];
    const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
    assert.ok(result.candidates.every((c) => c.construction.kind !== 'refinement'));
  });
});

describe('deriveInputFromText', () => {
  it('reads every id of a one-line OR list of bare concepts', () => {
    assert.deepStrictEqual(deriveInputFromText(`${id.A1a} |A1a| OR ${id.B2} |B2| OR ${id.P1}`), {
      conceptIds: [id.A1a, id.B2, id.P1],
    });
  });

  it('reads a formatted, nested OR list of bare concepts as concepts', () => {
    const text = `(${id.A1a} |A1a|\n  OR ${id.B2})\n  OR /* procedures */ ${id.P1}`;
    assert.deepStrictEqual(deriveInputFromText(text), { conceptIds: [id.A1a, id.B2, id.P1] });
  });

  it('reads a single bare concept as a list of one', () => {
    assert.deepStrictEqual(deriveInputFromText(` ${id.A1} |A1| `), { conceptIds: [id.A1] });
  });

  it('keeps constraint operators as an expression', () => {
    const text = `<< ${id.A1}\n  OR ${id.A2}`;
    assert.deepStrictEqual(deriveInputFromText(text), { ecl: text });
  });

  it('keeps MINUS as an expression, so the excluded concept is not a member', () => {
    const text = `(${id.A2} OR ${id.P1}) MINUS ${id.A3}`;
    assert.deepStrictEqual(deriveInputFromText(text), { ecl: text });
  });

  it('keeps a refinement as an expression', () => {
    const text = `${id.A1} : ${id.B} = ${id.B1}`;
    assert.deepStrictEqual(deriveInputFromText(text), { ecl: text });
  });

  it('reads a comma-separated list of bare concepts as concepts, not as AND', () => {
    assert.deepStrictEqual(deriveInputFromText(`${id.A1}, ${id.A2}, ${id.A3}`), {
      conceptIds: [id.A1, id.A2, id.A3],
    });
  });

  it('refuses text holding several expressions', () => {
    assert.throws(() => deriveInputFromText(`<< ${id.A1}\n/* ECL-END */\n<< ${id.A2}`), /2 ECL expressions/);
  });

  it('does not count a delimiter inside a search string or a line comment as a split', () => {
    const quoted = `<< ${id.A1} {{ D term = "/* ECL-END */ 1234567" }}`;
    assert.deepStrictEqual(deriveInputFromText(quoted), { ecl: quoted });
    const commented = `<< ${id.A1} // see /* ECL-END */ 1234567\nOR << ${id.A2}`;
    assert.doesNotThrow(() => deriveInputFromText(commented));
  });

  it('reads pasted code lists line by line', () => {
    assert.deepStrictEqual(deriveInputFromText(`${id.A1}\n${id.A2}\n`), { conceptIds: [id.A1, id.A2] });
    assert.deepStrictEqual(deriveInputFromText(`code,term\n${id.A1},A1\n${id.A2},A2`), {
      conceptIds: [id.A1, id.A2],
    });
  });

  it('derives from what the expression selects', async () => {
    const result = await deriveEcl(deriveInputFromText(`<< ${id.A1} OR ${id.A2}`), fixture(), { omitTerms: true });
    assert.strictEqual(result.input.members, 4);
  });
});

describe('parseConceptIdList', () => {
  it('reads every id on a line that holds only ids', () => {
    assert.deepStrictEqual(parseConceptIdList(`${id.A1} ${id.A2}\t${id.A3}`), [id.A1, id.A2, id.A3]);
    assert.deepStrictEqual(parseConceptIdList(`["${id.A1}", "${id.A2}"]`), [id.A1, id.A2]);
    assert.deepStrictEqual(parseConceptIdList(`${id.A1},term with ${id.A2} in it`), [id.A1]);
  });

  it('reads one id per line, CSV rows, terms and headers', () => {
    const text = [
      'code,display',
      '73211009,Diabetes mellitus',
      '46635009 |Type 1 diabetes mellitus|',
      '  44054006\tType 2 diabetes mellitus',
      '',
      '190372001, Maturity onset type 1 (age 20000000)',
      '1.2.840.10008',
    ].join('\n');
    assert.deepStrictEqual(parseConceptIdList(text), ['73211009', '46635009', '44054006', '190372001']);
  });

  it('ignores digits inside a term before the id', () => {
    assert.deepStrictEqual(parseConceptIdList('|Phase 1000000 trial| 73211009'), ['73211009']);
  });
});

describe('formatDeriveReport', () => {
  it('reports the input, the notes and each candidate with its differences', async () => {
    const mock = fixture();
    const set = membersOf(mock, `<< ${id.A1} OR ${id.A2} OR ${id.A3} OR ${id.A4}`);
    const result = await deriveEcl({ conceptIds: [...set, '1234', set[0]] }, mock, { maxCandidates: 2 });
    const report = formatDeriveReport(result);
    assert.match(report, /^Members: 6 of 7 distinct ids \(1 duplicate ignored\)$/m);
    assert.match(report, /^Not concept ids \(left out\): 1234$/m);
    assert.match(report, /^1\. exact; 2 clauses; greedy-grouping$/m);
    assert.match(report, /^2\. \+2 added, -0 missed; 1 clause; ancestor-cover$/m);
    assert.match(report, new RegExp(`^   Adds \\(2\\): ${id.A5} \\|A5\\|, ${id.A5a} \\|A5a\\|$`, 'm'));
  });

  it('prints a review section when there is a critique', async () => {
    const set = [id.A, id.A1, id.A1a, id.A1b, id.A2, id.A3, id.A4, id.A5];
    const result = await deriveEcl({ conceptIds: set }, fixture(), {
      critique: { nearMissShare: 0.85, maxClauses: 0 },
    });
    const report = formatDeriveReport(result);
    assert.match(report, /^Review:$/m);
    assert.match(report, new RegExp(`^   Nearly all of << ${id.A} \\|A\\|: 8 of 9 listed\\.$`, 'm'));
    assert.match(report, new RegExp(`^      Missing \\(1\\): ${id.A5a} \\|A5a\\|$`, 'm'));
    assert.match(report, /^ {3}Best exact form needs \d+ clauses? \(more than 0\); consider fixing the list first\.$/m);
  });

  it('prints the hierarchy spread and the inactive input', async () => {
    const result = await deriveEcl({ conceptIds: [id.A1a, id.P1, id.RETIRED] }, fixture(), { critique: true });
    const report = formatDeriveReport(result);
    assert.match(report, /^ {3}Spans 2 top-level hierarchies: Finding 1, Procedure 1\.$/m);
    assert.match(report, /^ {3}Inactive ids given: 1 \(left out, above\)\.$/m);
  });

  it('has no review section without a critique', async () => {
    const result = await deriveEcl({ conceptIds: [id.A1a, id.P1] }, fixture());
    assert.doesNotMatch(formatDeriveReport(result), /Review:/);
  });

  it('says so when nothing is flagged', async () => {
    const result = await deriveEcl({ conceptIds: [id.A1, id.A1a, id.A1b] }, fixture(), { critique: true });
    assert.match(formatDeriveReport(result), /^Review:\n {3}Nothing flagged\.$/m);
  });
});
