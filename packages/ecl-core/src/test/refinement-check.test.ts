// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseECL } from '../parser/index';
import { checkMixedRefinementOperators } from '../parser/refinement-check';

// Helper: parse and check for mixed refinement operators
function getWarnings(ecl: string) {
  const result = parseECL(ecl);
  assert.ok(result.ast, `Expected successful parse for: ${ecl}`);
  return checkMixedRefinementOperators(result.ast, ecl);
}

// ── Mixed AND/OR detection (IHTSDO #12) ──────────────────────────────────────

describe('checkMixedRefinementOperators', () => {
  describe('detects mixed operators', () => {
    test('AND then OR in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = * AND 116676008 = * OR 370135005 = *');
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].message.includes('Mixed'));
      assert.ok(warnings[0].message.includes('AND'));
      assert.ok(warnings[0].message.includes('OR'));
      assert.strictEqual(warnings[0].conflictOp, 'OR');
    });

    test('OR then AND in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = * OR 116676008 = * AND 370135005 = *');
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].message.includes('Mixed'));
      assert.ok(warnings[0].message.includes('AND'));
      assert.ok(warnings[0].message.includes('OR'));
      assert.strictEqual(warnings[0].conflictOp, 'AND');
    });

    test('comma then OR in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = *, 116676008 = * OR 370135005 = *');
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].message.includes('comma'));
      assert.strictEqual(warnings[0].conflictOp, 'OR');
    });

    test('OR then comma in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = * OR 116676008 = *, 370135005 = *');
      assert.strictEqual(warnings.length, 1);
      assert.strictEqual(warnings[0].conflictOp, ',');
    });

    test('AND then OR with real SNOMED concepts', () => {
      const ecl =
        '<< 404684003 |Clinical finding| : ' +
        '363698007 |Finding site| = << 39057004 |Pulmonary valve| AND ' +
        '116676008 |Associated morphology| = << 415582006 |Stenosis| OR ' +
        '370135005 |Pathological process| = << 441862004 |Infectious process|';
      const warnings = getWarnings(ecl);
      assert.strictEqual(warnings.length, 1);
      assert.strictEqual(warnings[0].conflictOp, 'OR');
    });
  });

  describe('does not flag valid expressions', () => {
    test('AND only in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = * AND 116676008 = * AND 370135005 = *');
      assert.strictEqual(warnings.length, 0);
    });

    test('OR only in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = * OR 116676008 = * OR 370135005 = *');
      assert.strictEqual(warnings.length, 0);
    });

    test('comma only (conjunction) in refinement', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = *, 116676008 = *, 370135005 = *');
      assert.strictEqual(warnings.length, 0);
    });

    test('mixed AND/OR inside parentheses is valid', () => {
      const warnings = getWarnings('< 404684003 : (363698007 = * AND 116676008 = *) OR 370135005 = *');
      assert.strictEqual(warnings.length, 0);
    });

    test('mixed AND/OR inside attribute group braces is valid', () => {
      const warnings = getWarnings('< 404684003 : { 363698007 = * AND 116676008 = * } OR 370135005 = *');
      assert.strictEqual(warnings.length, 0);
    });

    test('single attribute, no operators', () => {
      const warnings = getWarnings('< 404684003 : 363698007 = << 39057004');
      assert.strictEqual(warnings.length, 0);
    });

    test('simple expression without refinement', () => {
      const warnings = getWarnings('< 404684003 AND < 19829001');
      assert.strictEqual(warnings.length, 0);
    });

    test('no refinement at all', () => {
      const warnings = getWarnings('< 404684003');
      assert.strictEqual(warnings.length, 0);
    });

    test('AND/OR in term is ignored', () => {
      const warnings = getWarnings('< 404684003 : 363698007 |AND finding| = * OR 116676008 |OR thing| = *');
      // Only OR appears at depth 0 (no AND — the AND is inside a term)
      assert.strictEqual(warnings.length, 0);
    });
  });

  describe('handles nested refinements', () => {
    test('mixed in nested parenthesized expression', () => {
      const warnings = getWarnings('< 404684003 AND (< 19829001 : 363698007 = * AND 116676008 = * OR 370135005 = *)');
      assert.strictEqual(warnings.length, 1);
      assert.strictEqual(warnings[0].conflictOp, 'OR');
    });

    test('no mix in nested expression', () => {
      const warnings = getWarnings('< 404684003 AND (< 19829001 : 363698007 = * AND 116676008 = *)');
      assert.strictEqual(warnings.length, 0);
    });
  });

  describe('warnings are returned from parseECL', () => {
    test('parseECL includes warnings for mixed refinement operators', () => {
      const result = parseECL('< 404684003 : 363698007 = * AND 116676008 = * OR 370135005 = *');
      assert.ok(result.ast);
      assert.strictEqual(result.errors.length, 0, 'Parser should accept this expression');
      assert.strictEqual(result.warnings.length, 1);
      assert.ok(result.warnings[0].message.includes('Mixed'));
    });

    test('parseECL has empty warnings for valid refinements', () => {
      const result = parseECL('< 404684003 : 363698007 = * AND 116676008 = *');
      assert.ok(result.ast);
      assert.strictEqual(result.warnings.length, 0);
    });

    test('parseECL has empty warnings for expressions without refinements', () => {
      const result = parseECL('< 404684003');
      assert.ok(result.ast);
      assert.strictEqual(result.warnings.length, 0);
    });
  });

  describe('position tracking', () => {
    test('conflicting operator position is reported', () => {
      const ecl = '< 404684003 : 363698007 = * AND 116676008 = * OR 370135005 = *';
      const warnings = getWarnings(ecl);
      assert.strictEqual(warnings.length, 1);
      // The OR is the conflicting operator; verify it has line/column
      assert.ok(warnings[0].line >= 1);
      assert.ok(warnings[0].column >= 0);
    });

    test('range covers the refinement text', () => {
      const ecl = '< 404684003 : 363698007 = * AND 116676008 = * OR 370135005 = *';
      const warnings = getWarnings(ecl);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].range.start.offset > 0, 'Refinement range should not start at 0');
      assert.ok(warnings[0].range.end.offset <= ecl.length);
    });
  });
});
