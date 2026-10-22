// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { deriveEcl, type DeriveResult } from '../derive/derive-ecl';
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
      const mock = fixture();
      const set = membersOf(mock, `<< ${id.A1} OR ${id.A2} OR ${id.A3} OR ${id.A4}`);
      const result = await deriveEcl({ conceptIds: set }, mock, { omitTerms: true });
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
      const result = await deriveEcl({ conceptIds: [id.A1a, id.B2, id.P1] }, mock, { maxRoots: 2, omitTerms: true });
      assert.strictEqual(result.roots, 3);
      assert.deepStrictEqual(
        result.candidates.map((c) => c.construction.kind),
        ['enumeration'],
      );
      assert.match(result.notes.join('\n'), /maxRoots/);
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
