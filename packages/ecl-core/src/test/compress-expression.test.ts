// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { compressExpression, formatCompressReport, type CompressResult } from '../derive/compress-expression';
import { HierarchyMockService, sctid } from './hierarchy-mock';
import { parseECL } from '../parser';

// Fixture: X has children C1..C8; C1 has two children; Y is a sibling of X.
const ROOT = '138875005';
const id = {
  X: sctid(1010),
  C1: sctid(1011),
  C1a: sctid(1012),
  C1b: sctid(1013),
  C2: sctid(1014),
  C3: sctid(1015),
  C4: sctid(1016),
  C5: sctid(1017),
  C6: sctid(1018),
  C7: sctid(1019),
  C8: sctid(1021),
  Y: sctid(1020),
  R: sctid(1050),
};

function fixture(): HierarchyMockService {
  return new HierarchyMockService()
    .add(ROOT, 'root')
    .add(id.X, 'X', [ROOT])
    .add(id.C1, 'C1', [id.X])
    .add(id.C1a, 'C1a', [id.C1])
    .add(id.C1b, 'C1b', [id.C1])
    .add(id.C2, 'C2', [id.X])
    .add(id.C3, 'C3', [id.X])
    .add(id.C4, 'C4', [id.X])
    .add(id.C5, 'C5', [id.X])
    .add(id.C6, 'C6', [id.X])
    .add(id.C7, 'C7', [id.X])
    .add(id.C8, 'C8', [id.X])
    .add(id.Y, 'Y', [ROOT]);
}

/** Every candidate's differences must be what it really selects against the original. */
function assertHonest(mock: HierarchyMockService, original: string, result: CompressResult): void {
  const before = mock.evaluate(original);
  for (const c of result.candidates) {
    const after = mock.evaluate(c.ecl);
    assert.strictEqual(c.additions.count, [...after].filter((x) => !before.has(x)).length, `additions of ${c.ecl}`);
    assert.strictEqual(c.misses.count, [...before].filter((x) => !after.has(x)).length, `misses of ${c.ecl}`);
    assert.strictEqual(c.exact, c.additions.count === 0 && c.misses.count === 0);
  }
}

describe('compressExpression', () => {
  it('recovers << X from X and its children written out', async () => {
    const mock = fixture();
    const original = [id.X, `<< ${id.C1}`, id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8].join(' OR ');
    const result = await compressExpression(original, mock, { omitTerms: true });
    assert.strictEqual(result.candidates[0].ecl, `<< ${id.X}`);
    assert.strictEqual(result.candidates[0].exact, true);
    assert.strictEqual(result.candidates[0].source, 'derived');
    assertHonest(mock, original, result);
  });

  it('offers a lossy grouper with what it adds, and keeps the original as an exact choice', async () => {
    const mock = fixture();
    // 7 of X's 8 children: `< X` is 1 clause plus C1's subtree (3), against 7 clauses.
    const original = [id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8].join(' OR ');
    const result = await compressExpression(original, mock, { omitTerms: true });
    const top = result.candidates[0];
    assert.strictEqual(top.ecl, `< ${id.X}`);
    assert.deepStrictEqual(
      top.additions.sample.map((c) => c.code),
      [id.C1, id.C1a, id.C1b],
    );
    assert.ok(result.candidates.some((c) => c.source === 'original' && c.exact));
    assertHonest(mock, original, result);
  });

  it('compresses only the OR group and keeps what surrounds it', async () => {
    // The refset leaves out C1's subtree, so `< X` loses nothing once ANDed with it.
    const mock = fixture();
    mock.addRefset(id.R, [id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8, id.Y]);
    const group = [id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8].join(' OR ');
    const original = `(${group}) AND ^ ${id.R}`;
    const result = await compressExpression(original, mock, { omitTerms: true });
    assert.deepStrictEqual(result.group, {
      text: group,
      start: 1,
      end: original.indexOf(')'),
    });
    assert.strictEqual(result.candidates[0].ecl, `(< ${id.X}) AND ^ ${id.R}`);
    assert.strictEqual(result.candidates[0].exact, true, 'the refset filters out the grouper’s additions');
    assertHonest(mock, original, result);
  });

  it('includes the exact simplification when it applies', async () => {
    const mock = fixture();
    const original = `< ${id.C1} OR << ${id.C1} OR ${id.Y}`;
    const result = await compressExpression(original, mock, { omitTerms: true });
    const simplified = result.candidates.find((c) => c.source === 'simplified');
    assert.ok(simplified);
    assert.strictEqual(simplified.ecl, `<< ${id.C1} OR ${id.Y}`);
    assert.strictEqual(simplified.exact, true);
    assertHonest(mock, original, result);
  });

  it('does not list a reordering of the original as a new candidate', async () => {
    const mock = fixture();
    const original = `<< ${id.Y} OR << ${id.C2}`;
    const result = await compressExpression(original, mock, { omitTerms: true });
    const exact = result.candidates.filter((c) => c.exact);
    assert.deepStrictEqual(
      exact.map((c) => c.source),
      ['original'],
    );
  });

  it('notes when there is no OR group', async () => {
    const mock = fixture();
    const result = await compressExpression(`<< ${id.X} MINUS ${id.C1}`, mock, { omitTerms: true });
    assert.strictEqual(result.group, null);
    assert.match(result.notes.join('\n'), /No OR group/);
    assert.deepStrictEqual(
      result.candidates.map((c) => c.source),
      ['original'],
    );
  });

  it('handles display terms and comments in the input without doubling terms', async () => {
    const mock = fixture();
    mock.addRefset(id.R, [id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8]);
    const group = [id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8].map((c) => `${c} |child 1234567|`).join(' OR ');
    const original = `/* tablets */ (${group}) AND ^ ${id.R} |R refset|`;
    const result = await compressExpression(original, mock);
    for (const c of result.candidates) {
      assert.deepStrictEqual(parseECL(c.expression).errors, [], c.expression);
      assert.ok(!c.ecl.includes('|'), `ecl has no terms: ${c.ecl}`);
    }
    assert.strictEqual(result.candidates[0].ecl, `(< ${id.X}) AND ^ ${id.R}`);
    assert.strictEqual(result.candidates[0].clauses, 2);
  });

  it('leaves a group alone when an operator applies to it', async () => {
    const mock = fixture();
    const result = await compressExpression(`<< (${id.C2} OR ${id.C3}) AND << ${id.X}`, mock, { omitTerms: true });
    assert.strictEqual(result.group, null);
  });

  it('reports syntax errors and does nothing else', async () => {
    const result = await compressExpression('<< AND', fixture());
    assert.ok(result.errors.length > 0);
    assert.deepStrictEqual(result.candidates, []);
  });

  it('formats candidates with display terms', async () => {
    const mock = fixture();
    const result = await compressExpression(
      [id.X, `<< ${id.C1}`, id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8].join(' OR '),
      mock,
    );
    assert.strictEqual(result.candidates[0].expression, `<< ${id.X} | X |`);
  });
});

describe('formatCompressReport', () => {
  it('lists each candidate with its source and differences', async () => {
    const mock = fixture();
    const original = [id.C2, id.C3, id.C4, id.C5, id.C6, id.C7, id.C8].join(' OR ');
    const report = formatCompressReport(await compressExpression(original, mock, { maxCandidates: 2 }));
    assert.match(report, /^Original selects 7 concepts\.$/m);
    assert.match(report, /^1\. \+3 added, -0 missed; 1 clause; derived$/m);
    assert.match(report, /^ {3}Adds \(3\): /m);
  });

  it('reports syntax errors instead of candidates', async () => {
    assert.match(formatCompressReport(await compressExpression('<< AND', fixture())), /^Not compressed: /);
  });
});
