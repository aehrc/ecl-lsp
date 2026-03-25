// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';

const sorted = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b));
import {
  getValidOperatorsAtPosition,
  isConceptPositionValid,
  getConceptSearchPriority,
} from '../parser/position-detector';

/**
 * Integration tests for context-aware completion filtering.
 * These tests simulate the completion workflow to verify that operator filtering
 * works correctly in combination with concept search integration.
 */
describe('Completion Context Integration', () => {
  describe('completion after complete constraint shows only logical operators', () => {
    it('should show logical operators and refinement after concept ID', () => {
      const line = '< 404684003 ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      const isConceptValid = isConceptPositionValid(line, position);

      // Should show logical operators and refinement
      assert.deepStrictEqual(sorted(validOperators), sorted(['AND', 'MINUS', 'OR', ':']));
      // Concept position is NOT valid here (need an operator first)
      assert.strictEqual(isConceptValid, false);
    });

    it('should show logical operators and refinement after concept with term', () => {
      const line = '< 404684003 |Clinical finding| ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['AND', 'MINUS', 'OR', ':']));
    });
  });

  describe('completion after constraint operator shows only concept search', () => {
    it('should show no operators after < with space', () => {
      const line = '< ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      const isConceptValid = isConceptPositionValid(line, position);
      const priority = getConceptSearchPriority(line, position);

      // No operators valid (space indicates concept expected)
      assert.deepStrictEqual(validOperators, []);
      // Concept position is valid
      assert.strictEqual(isConceptValid, true);
      // Search should be high priority
      assert.strictEqual(priority, 'high');
    });

    it('should allow completing < to << without space', () => {
      const line = '<';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      // Should show << as completion option
      assert.deepStrictEqual(validOperators, ['<<']);
    });

    it('should allow completing > to >> without space', () => {
      const line = '>';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      // Should show >> as completion option
      assert.deepStrictEqual(validOperators, ['>>']);
    });

    it('should show no operators after << or >>', () => {
      // After complete double operators - concept expected
      assert.deepStrictEqual(getValidOperatorsAtPosition('<<', 2), []);
      assert.deepStrictEqual(getValidOperatorsAtPosition('<< ', 3), []);
      assert.deepStrictEqual(getValidOperatorsAtPosition('>>', 2), []);
      assert.deepStrictEqual(getValidOperatorsAtPosition('>> ', 3), []);
    });
  });

  describe('completion after logical operator shows only constraint operators', () => {
    it('should show constraint operators after AND', () => {
      const line = '< 404684003 AND ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      const priority = getConceptSearchPriority(line, position);

      // Only constraint operators
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
      // Search should be low priority (operators come first)
      assert.strictEqual(priority, 'low');
    });

    it('should show constraint operators after OR', () => {
      const line = '< 404684003 OR ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
    });

    it('should show constraint operators after MINUS', () => {
      const line = '< 404684003 MINUS ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
    });
  });

  describe('completion at start of expression shows constraint operators', () => {
    it('should show constraint operators on empty line', () => {
      const line = '';
      const position = 0;

      const validOperators = getValidOperatorsAtPosition(line, position);
      const priority = getConceptSearchPriority(line, position);

      // Only constraint operators
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
      // Search should be low priority
      assert.strictEqual(priority, 'low');
    });

    it('should show constraint operators after opening paren', () => {
      const line = '(';
      const position = 1;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
    });

    it('should show constraint operators after paren with space', () => {
      const line = '( ';
      const position = 2;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
    });
  });

  describe('completion preserves concept search option when concepts valid', () => {
    it('should allow concept search after constraint operator', () => {
      const line = '< ';
      const position = line.length;

      const isConceptValid = isConceptPositionValid(line, position);
      const priority = getConceptSearchPriority(line, position);

      assert.strictEqual(isConceptValid, true, 'Concept position should be valid');
      assert.strictEqual(priority, 'high', 'Search should be high priority');
    });

    it('should allow concept search after logical operator', () => {
      const line = '< 404684003 AND ';
      const position = line.length;

      const isConceptValid = isConceptPositionValid(line, position);
      assert.strictEqual(isConceptValid, true);
    });

    it('should allow concept search at start of line', () => {
      const line = '';
      const position = 0;

      const isConceptValid = isConceptPositionValid(line, position);
      assert.strictEqual(isConceptValid, true);
    });
  });

  describe('completion maintains operator prioritization order', () => {
    it('should prioritize search after constraint operators', () => {
      const line = '< ';
      const position = line.length;

      const priority = getConceptSearchPriority(line, position);
      assert.strictEqual(priority, 'high', 'Search should come first');
    });

    it('should prioritize operators at start of line', () => {
      const line = '';
      const position = 0;

      const priority = getConceptSearchPriority(line, position);
      assert.strictEqual(priority, 'low', 'Operators should come first');
    });

    it('should prioritize operators after logical operators', () => {
      const line = '< 404684003 AND ';
      const position = line.length;

      const priority = getConceptSearchPriority(line, position);
      assert.strictEqual(priority, 'low', 'Operators should come first');
    });
  });

  describe('completion falls back to all operators for ambiguous context', () => {
    it('should show all operators for unrecognized pattern', () => {
      const line = 'some random text ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);

      // Should return all operators when context is ambiguous
      assert.ok(validOperators.length >= 7, 'Should have multiple operators');
      assert.ok(validOperators.includes('AND'), 'Should include logical operators');
      assert.ok(validOperators.includes('<'), 'Should include constraint operators');
    });

    it('should handle partially typed expressions', () => {
      const line = '< 404';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);

      // Partial concept ID - ambiguous context, should return all operators
      assert.ok(validOperators.length > 0, 'Should have some operators available');
    });
  });

  describe('refinement and attribute contexts', () => {
    it('should show constraint operators after refinement separator', () => {
      const line = '< 404684003 : ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
    });

    it('should show constraint operators after attribute value separator', () => {
      const line = '363698007 = ';
      const position = line.length;

      const validOperators = getValidOperatorsAtPosition(line, position);
      assert.deepStrictEqual(sorted(validOperators), sorted(['<', '<<', '>', '>>']));
    });
  });
});
