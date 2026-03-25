// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  isConceptPositionValid,
  getConceptSearchPriority,
  getValidOperatorsAtPosition,
} from '../parser/position-detector';

const sorted = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b));

describe('Position Detector', () => {
  describe('isConceptPositionValid', () => {
    it('should return true at start of line', () => {
      assert.strictEqual(isConceptPositionValid('', 0), true);
      assert.strictEqual(isConceptPositionValid('  ', 2), true);
    });

    it('should return true after constraint operators', () => {
      assert.strictEqual(isConceptPositionValid('< ', 2), true);
      assert.strictEqual(isConceptPositionValid('<< ', 3), true);
      assert.strictEqual(isConceptPositionValid('> ', 2), true);
      assert.strictEqual(isConceptPositionValid('>> ', 3), true);
      assert.strictEqual(isConceptPositionValid('<', 1), true);
      assert.strictEqual(isConceptPositionValid('<<', 2), true);
    });

    it('should return true after logical operators', () => {
      assert.strictEqual(isConceptPositionValid('< 404684003 AND ', 16), true);
      assert.strictEqual(isConceptPositionValid('< 404684003 OR ', 15), true);
      assert.strictEqual(isConceptPositionValid('< 404684003 MINUS ', 18), true);
    });

    it('should return true after refinement separator', () => {
      assert.strictEqual(isConceptPositionValid('404684003 : ', 12), true);
      assert.strictEqual(isConceptPositionValid('404684003 :', 11), true);
    });

    it('should return true after attribute value separator', () => {
      assert.strictEqual(isConceptPositionValid('363698007 = ', 12), true);
      assert.strictEqual(isConceptPositionValid('363698007 =', 11), true);
    });

    it('should return true after opening parenthesis', () => {
      assert.strictEqual(isConceptPositionValid('(', 1), true);
      assert.strictEqual(isConceptPositionValid('( ', 2), true);
      assert.strictEqual(isConceptPositionValid('AND (', 5), true);
    });

    it('should return false in middle of concept ID', () => {
      assert.strictEqual(isConceptPositionValid('< 4046', 6), false);
      assert.strictEqual(isConceptPositionValid('40468', 3), false);
    });

    it('should return false after complete expression', () => {
      assert.strictEqual(isConceptPositionValid('< 404684003', 11), false);
      assert.strictEqual(isConceptPositionValid('< 404684003 ', 12), false);
    });

    it('should handle complex expressions', () => {
      assert.strictEqual(isConceptPositionValid('< 404684003 : 363698007 = ', 26), true, 'After = in refinement');
      assert.strictEqual(isConceptPositionValid('< 404684003 : ', 14), true, 'After : in refinement');
    });
  });

  describe('getConceptSearchPriority', () => {
    it('should return high priority after constraint operators', () => {
      assert.strictEqual(getConceptSearchPriority('< ', 2), 'high');
      assert.strictEqual(getConceptSearchPriority('<< ', 3), 'high');
      assert.strictEqual(getConceptSearchPriority('> ', 2), 'high');
      assert.strictEqual(getConceptSearchPriority('>> ', 3), 'high');
    });

    it('should return low priority at start of line', () => {
      assert.strictEqual(getConceptSearchPriority('', 0), 'low');
      assert.strictEqual(getConceptSearchPriority('  ', 2), 'low');
    });

    it('should return low priority after opening parenthesis', () => {
      assert.strictEqual(getConceptSearchPriority('(', 1), 'low');
      assert.strictEqual(getConceptSearchPriority('( ', 2), 'low');
    });

    it('should return low priority after logical operators', () => {
      assert.strictEqual(getConceptSearchPriority('< 404684003 AND ', 16), 'low');
      assert.strictEqual(getConceptSearchPriority('< 404684003 OR ', 15), 'low');
    });

    it('should return low priority after refinement separators', () => {
      assert.strictEqual(getConceptSearchPriority('404684003 : ', 12), 'low');
      assert.strictEqual(getConceptSearchPriority('363698007 = ', 12), 'low');
    });
  });

  describe('getValidOperatorsAtPosition', () => {
    it('detects after complete constraint context', () => {
      // After concept ID - should return logical operators and refinement
      const result1 = getValidOperatorsAtPosition('< 404684003 ', 12);
      assert.deepStrictEqual(sorted(result1), sorted(['AND', 'MINUS', 'OR', ':']));

      // After concept ID with term
      const result2 = getValidOperatorsAtPosition('< 404684003 |Clinical finding| ', 32);
      assert.deepStrictEqual(sorted(result2), sorted(['AND', 'MINUS', 'OR', ':']));
    });

    it('detects after constraint operator context', () => {
      // After < with space - no operators, only concepts
      assert.deepStrictEqual(getValidOperatorsAtPosition('< ', 2), []);

      // After < without space - allow completing to <<
      assert.deepStrictEqual(getValidOperatorsAtPosition('<', 1), ['<<']);
      assert.deepStrictEqual(getValidOperatorsAtPosition('AND <', 5), ['<<']);

      // After << with or without space - no operators
      assert.deepStrictEqual(getValidOperatorsAtPosition('<<', 2), []);
      assert.deepStrictEqual(getValidOperatorsAtPosition('<< ', 3), []);

      // After > without space - allow completing to >>
      assert.deepStrictEqual(getValidOperatorsAtPosition('>', 1), ['>>']);

      // After >> with or without space - no operators
      assert.deepStrictEqual(getValidOperatorsAtPosition('>>', 2), []);
      assert.deepStrictEqual(getValidOperatorsAtPosition('>> ', 3), []);
    });

    it('detects after logical operator context', () => {
      // After AND - should return constraint operators
      const result1 = getValidOperatorsAtPosition('< 404684003 AND ', 16);
      assert.deepStrictEqual(sorted(result1), sorted(['<', '<<', '>', '>>']));

      // After OR
      const result2 = getValidOperatorsAtPosition('< 404684003 OR ', 15);
      assert.deepStrictEqual(sorted(result2), sorted(['<', '<<', '>', '>>']));

      // After MINUS
      const result3 = getValidOperatorsAtPosition('< 404684003 MINUS ', 18);
      assert.deepStrictEqual(sorted(result3), sorted(['<', '<<', '>', '>>']));
    });

    it('detects start of expression context', () => {
      // Empty line - should return constraint operators
      const result1 = getValidOperatorsAtPosition('', 0);
      assert.deepStrictEqual(sorted(result1), sorted(['<', '<<', '>', '>>']));

      // Only whitespace
      const result2 = getValidOperatorsAtPosition('  ', 2);
      assert.deepStrictEqual(sorted(result2), sorted(['<', '<<', '>', '>>']));

      // After opening paren
      const result3 = getValidOperatorsAtPosition('(', 1);
      assert.deepStrictEqual(sorted(result3), sorted(['<', '<<', '>', '>>']));

      const result4 = getValidOperatorsAtPosition('( ', 2);
      assert.deepStrictEqual(sorted(result4), sorted(['<', '<<', '>', '>>']));
    });

    it('detects after refinement separator context', () => {
      // After : - should return constraint operators for attribute values
      const result = getValidOperatorsAtPosition('< 404684003 : ', 14);
      assert.deepStrictEqual(sorted(result), sorted(['<', '<<', '>', '>>']));
    });

    it('detects after attribute operator context', () => {
      // After = - should return constraint operators for attribute values
      const result = getValidOperatorsAtPosition('363698007 = ', 12);
      assert.deepStrictEqual(sorted(result), sorted(['<', '<<', '>', '>>']));
    });

    it('handles ambiguous context gracefully', () => {
      // Complex expression that doesn't match clear patterns - should return all operators
      const result = getValidOperatorsAtPosition('some complex text ', 18);
      assert.deepStrictEqual(sorted(result), sorted(['<', '<<', '>', '>>', 'AND', 'OR', 'MINUS', ':']));
    });

    it('handles malformed input', () => {
      // Empty string
      const result1 = getValidOperatorsAtPosition('', 0);
      assert.ok(Array.isArray(result1));

      // Only whitespace
      const result2 = getValidOperatorsAtPosition('   ', 3);
      assert.ok(Array.isArray(result2));

      // Position out of bounds (negative) - still returns something safe
      const result3 = getValidOperatorsAtPosition('< 404684003', -1);
      assert.ok(Array.isArray(result3));
    });

    it('handles various cursor positions in same line', () => {
      const line = '< 404684003 AND << 19829001';

      // Position right after < (no space yet)
      const result0 = getValidOperatorsAtPosition(line, 1);
      assert.deepStrictEqual(result0, ['<<']);

      // Position after first constraint operator with space
      const result1 = getValidOperatorsAtPosition(line, 2);
      assert.deepStrictEqual(result1, []);

      // Position after first concept
      const result2 = getValidOperatorsAtPosition(line, 12);
      assert.deepStrictEqual(sorted(result2), sorted(['AND', 'MINUS', 'OR', ':']));

      // Position after AND with space
      const result3 = getValidOperatorsAtPosition(line, 16);
      assert.deepStrictEqual(sorted(result3), sorted(['<', '<<', '>', '>>']));

      // Position after << (complete operator, no space)
      const result4 = getValidOperatorsAtPosition(line, 18);
      assert.deepStrictEqual(result4, []);

      // Position after << with space
      const result5 = getValidOperatorsAtPosition(line, 19);
      assert.deepStrictEqual(result5, []);
    });
  });
});
