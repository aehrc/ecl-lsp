// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { canonicalise, compareExpressions, CanonicaliseError } from '../canonical/comparator';

// ── canonicalise: term stripping (§9.1) ─────────────────────────────────

describe('canonicalise — term stripping', () => {
  it('should strip display term from bare concept', () => {
    assert.strictEqual(canonicalise('404684003 |Clinical finding|'), '404684003');
  });

  it('should strip display term from constrained concept', () => {
    assert.strictEqual(canonicalise('< 404684003 |Clinical finding|'), '<404684003');
  });

  it('should strip terms from refined expression', () => {
    assert.strictEqual(
      canonicalise('404684003: 363698007 |Finding site| = < 39057004 |Pulmonary structure|'),
      '404684003:363698007 = <39057004',
    );
  });

  it('should strip terms from attribute names and values', () => {
    assert.strictEqual(
      canonicalise('< 404684003 |Clinical finding|: 116676008 |Associated morphology| = < 55641003 |Infarct|'),
      '<404684003:116676008 = <55641003',
    );
  });
});

// ── canonicalise: AND/OR sorting (§9.2) ──────────────────────────────────

describe('canonicalise — AND/OR sorting', () => {
  it('should keep already-sorted OR operands', () => {
    assert.strictEqual(canonicalise('< 19829001 OR < 404684003'), '<19829001 OR <404684003');
  });

  it('should sort OR operands by canonical string', () => {
    assert.strictEqual(canonicalise('< 404684003 OR < 19829001'), '<19829001 OR <404684003');
  });

  it('should sort three AND operands', () => {
    assert.strictEqual(
      canonicalise('< 19829001 AND < 404684003 AND < 123456789'),
      '<123456789 AND <19829001 AND <404684003',
    );
  });

  it('should preserve MINUS operand order (left before right)', () => {
    assert.strictEqual(canonicalise('< 404684003 MINUS < 19829001'), '<404684003 MINUS <19829001');
  });

  it('should preserve MINUS operand order (reversed)', () => {
    assert.strictEqual(canonicalise('< 19829001 MINUS < 404684003'), '<19829001 MINUS <404684003');
  });
});

// ── canonicalise: attribute sorting (§9.3) ───────────────────────────────

describe('canonicalise — attribute sorting', () => {
  it('should sort attributes numerically by SCTID', () => {
    assert.strictEqual(
      canonicalise('404684003: 363698007 = <39057004, 246075003 = <387517004'),
      '404684003:246075003 = <387517004,363698007 = <39057004',
    );
  });

  it('should keep already-sorted attributes', () => {
    assert.strictEqual(
      canonicalise('404684003: 246075003 = <387517004, 363698007 = <39057004'),
      '404684003:246075003 = <387517004,363698007 = <39057004',
    );
  });

  it('should sort attributes with large SCTIDs numerically (not lexicographically)', () => {
    // 9999999 < 12345678901234567 numerically, but "9999999" > "12345678901234567" lexicographically
    assert.strictEqual(
      canonicalise('404684003: 12345678901234567 = *, 9999999 = *'),
      '404684003:9999999 = *,12345678901234567 = *',
    );
  });
});

// ── canonicalise: redundant parenthesis removal (§9.4) ──────────────────

describe('canonicalise — redundant parenthesis removal', () => {
  it('should remove parens around bare concept', () => {
    assert.strictEqual(canonicalise('(404684003)'), '404684003');
  });

  it('should remove parens around constrained concept', () => {
    assert.strictEqual(canonicalise('(< 404684003)'), '<404684003');
  });

  it('should keep parens when inner compound has different operator (OR inside AND)', () => {
    assert.strictEqual(
      canonicalise('(< 404684003 OR < 19829001) AND < 123456789'),
      '(<19829001 OR <404684003) AND <123456789',
    );
  });

  it('should remove parens and flatten when same operator (AND inside AND)', () => {
    assert.strictEqual(
      canonicalise('(< 404684003 AND < 19829001) AND < 123456789'),
      '<123456789 AND <19829001 AND <404684003',
    );
  });

  it('should remove parens and flatten when same operator (OR inside OR)', () => {
    assert.strictEqual(
      canonicalise('(< 404684003 OR < 19829001) OR < 123456789'),
      '<123456789 OR <19829001 OR <404684003',
    );
  });

  it('should remove parens around refined expression', () => {
    assert.strictEqual(canonicalise('(404684003: 363698007 = *)'), '404684003:363698007 = *');
  });
});

// ── compareExpressions (§9.5) ────────────────────────────────────────────

describe('compareExpressions', () => {
  it('should return identical for equal strings', () => {
    assert.strictEqual(compareExpressions('< 404684003', '< 404684003'), 'identical');
  });

  it('should return structurally_equivalent when terms differ', () => {
    assert.strictEqual(compareExpressions('< 404684003 |Clinical finding|', '< 404684003'), 'structurally_equivalent');
  });

  it('should return structurally_equivalent when OR order differs', () => {
    assert.strictEqual(
      compareExpressions('< 404684003 OR < 19829001', '< 19829001 OR < 404684003'),
      'structurally_equivalent',
    );
  });

  it('should return different when operators differ (AND vs OR)', () => {
    assert.strictEqual(compareExpressions('< 404684003 AND < 19829001', '< 404684003 OR < 19829001'), 'different');
  });

  it('should return different when MINUS operand order differs', () => {
    assert.strictEqual(compareExpressions('< 404684003 MINUS < 19829001', '< 19829001 MINUS < 404684003'), 'different');
  });

  it('should return structurally_equivalent when redundant parens present', () => {
    assert.strictEqual(compareExpressions('(< 19829001)', '< 19829001'), 'structurally_equivalent');
  });

  it('should return structurally_equivalent when whitespace differs', () => {
    assert.strictEqual(
      compareExpressions('<  404684003   OR   <  19829001', '< 19829001 OR < 404684003'),
      'structurally_equivalent',
    );
  });

  it('should return structurally_equivalent when attribute order differs', () => {
    assert.strictEqual(
      compareExpressions(
        '404684003: 363698007 = <39057004, 246075003 = <387517004',
        '404684003: 246075003 = <387517004, 363698007 = <39057004',
      ),
      'structurally_equivalent',
    );
  });
});

// ── Error handling (§9.6) ────────────────────────────────────────────────

describe('canonicalise — error handling', () => {
  it('should throw CanonicaliseError for invalid ECL', () => {
    assert.throws(() => canonicalise('<<< invalid >>>'), { name: 'CanonicaliseError' });
  });

  it('should include parse errors in the exception', () => {
    try {
      canonicalise('<<< invalid >>>');
      assert.fail('Expected CanonicaliseError');
    } catch (e) {
      assert.ok(e instanceof CanonicaliseError);
      assert.ok(e.parseErrors.length > 0);
    }
  });

  it('should throw CanonicaliseError from compareExpressions when input is invalid', () => {
    assert.throws(() => compareExpressions('< 404684003', '<<< invalid >>>'), {
      name: 'CanonicaliseError',
    });
  });
});

// ── Wildcard (§9.7) ─────────────────────────────────────────────────────

describe('canonicalise — wildcards', () => {
  it('should handle bare wildcard', () => {
    assert.strictEqual(canonicalise('*'), '*');
  });

  it('should handle wildcard in refined expression', () => {
    assert.strictEqual(canonicalise('* : 363698007 = *'), '*:363698007 = *');
  });
});

// ── Member-of (^) ───────────────────────────────────────────────────────

describe('canonicalise — member-of', () => {
  it('should preserve member-of operator', () => {
    assert.strictEqual(canonicalise('^ 816080008'), '^816080008');
  });

  it('should handle member-of with constraint operator', () => {
    assert.strictEqual(canonicalise('< ^ 816080008'), '<^816080008');
  });
});

// ── Dotted expressions ──────────────────────────────────────────────────

describe('canonicalise — dotted expressions', () => {
  it('should preserve dotted expression order', () => {
    assert.strictEqual(canonicalise('404684003 . 363698007'), '404684003.363698007');
  });
});
