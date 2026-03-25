// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CoreRange } from '../types';
import { offsetAt } from '../text-utils';
import { expandToExpressionBoundaries, getExpressionsInRange, formatRangeExpressions } from '../formatter/range';

describe('Range Formatter', () => {
  // Task 16.1: Test range formatting within single expression
  describe('Single expression range formatting', () => {
    test('should expand range to complete expression', () => {
      const content = '<< 404684003  |  Clinical   finding  |';

      // Select middle portion
      const range: CoreRange = {
        start: { line: 0, character: 10 },
        end: { line: 0, character: 20 },
      };

      const expanded = expandToExpressionBoundaries(content, range);

      // Should expand to include entire expression
      assert.strictEqual(offsetAt(content, expanded.start), 0);
      assert.strictEqual(offsetAt(content, expanded.end), content.length);
    });

    test('should format only selected expression', () => {
      const content = '<< 404684003  |  Clinical   finding  |';

      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: content.length },
      };

      const expressions = getExpressionsInRange(content, range);

      assert.strictEqual(expressions.length, 1);
      assert.strictEqual(expressions[0].text, content.trim());
    });
  });

  // Task 16.2: Test range formatting spanning multiple expressions
  describe('Multi-expression range formatting', () => {
    test('should identify multiple expressions in range', () => {
      const content = '<< 404684003\n\n/* ECL-END */\n\n< 19829001\n\n/* ECL-END */\n\n< 234567890';

      // Select entire range
      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 8, character: 20 },
      };

      const expressions = getExpressionsInRange(content, range);

      // Should find all 3 expressions
      assert.strictEqual(expressions.length, 3);
    });

    test('should format only expressions within range', () => {
      const content = '<< 404684003\n\n/* ECL-END */\n\n< 19829001\n\n/* ECL-END */\n\n< 234567890';

      // Select only middle expression
      const range: CoreRange = {
        start: { line: 4, character: 0 },
        end: { line: 4, character: 10 },
      };

      const expressions = getExpressionsInRange(content, range);

      // Should find only the middle expression
      assert.strictEqual(expressions.length, 1);
      assert.ok(expressions[0].text.includes('19829001'));
    });
  });

  // Task 16.3: Test range formatting with partial expression selection
  describe('Partial expression selection', () => {
    test('should expand partial selection to complete expression', () => {
      const content = '< 404684003 OR < 19829001 OR < 234567890';

      // Select just "OR < 19829001"
      const range: CoreRange = {
        start: { line: 0, character: 12 },
        end: { line: 0, character: 25 },
      };

      const expanded = expandToExpressionBoundaries(content, range);

      // Should expand to entire expression
      assert.strictEqual(offsetAt(content, expanded.start), 0);
      assert.strictEqual(offsetAt(content, expanded.end), content.length);
    });
  });

  // Task 16.4: Test range formatting at document start
  describe('Range at document start', () => {
    test('should format from start of document', () => {
      const content = '<<  404684003\n\n/* ECL-END */\n\n< 19829001';

      // Select first expression
      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 13 },
      };

      const expressions = getExpressionsInRange(content, range);

      assert.strictEqual(expressions.length, 1);
      assert.ok(expressions[0].text.includes('404684003'));
    });
  });

  // Task 16.5: Test range formatting at document end
  describe('Range at document end', () => {
    test('should format to end of document', () => {
      const content = '<< 404684003\n\n/* ECL-END */\n\n<  19829001';

      // Select last expression
      const range: CoreRange = {
        start: { line: 4, character: 0 },
        end: { line: 4, character: 20 },
      };

      const expressions = getExpressionsInRange(content, range);

      assert.strictEqual(expressions.length, 1);
      assert.ok(expressions[0].text.includes('19829001'));
    });
  });

  // Test formatRangeExpressions function
  describe('formatRangeExpressions', () => {
    test('should generate TextEdit for each expression', () => {
      const content = '<<  404684003\n\n/* ECL-END */\n\n<  19829001';

      const expressions = [
        { start: 0, end: 13, text: '<<  404684003' },
        { start: 32, end: 43, text: '<  19829001' },
      ];

      const formatFn = (text: string) => text.trim().replaceAll(/\s+/g, ' ');
      const edits = formatRangeExpressions(expressions, content, formatFn);

      assert.strictEqual(edits.length, 2);
      assert.strictEqual(edits[0].newText, '<< 404684003');
      assert.strictEqual(edits[1].newText, '< 19829001');
    });

    test('should skip empty expressions', () => {
      const content = '<< 404684003';

      const expressions = [
        { start: 0, end: 12, text: '<< 404684003' },
        { start: 12, end: 12, text: '' }, // Empty
      ];

      const formatFn = (text: string) => text.trim();
      const edits = formatRangeExpressions(expressions, content, formatFn);

      // Should only have one edit (empty expression skipped)
      assert.strictEqual(edits.length, 1);
    });
  });

  describe('Comment-aware expression splitting', () => {
    test('should not split on ECL-END inside line comments', () => {
      const content = '< 404684003\n// ignore /* ECL-END */ here\n< 19829001';

      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 2, character: 20 },
      };

      const expressions = getExpressionsInRange(content, range);

      // Should be 1 expression (the ECL-END in the comment should be ignored)
      assert.strictEqual(expressions.length, 1);
    });

    test('should split on real ECL-END outside comments', () => {
      const content = '< 404684003\n// a comment\n/* ECL-END */\n< 19829001';

      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 3, character: 20 },
      };

      const expressions = getExpressionsInRange(content, range);

      assert.strictEqual(expressions.length, 2);
    });

    test('should handle document with only commented-out delimiters', () => {
      const content = '< 404684003 // /* ECL-END */\n< 19829001';

      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 1, character: 20 },
      };

      const expressions = getExpressionsInRange(content, range);

      // No real delimiters found — single expression
      assert.strictEqual(expressions.length, 1);
    });
  });

  describe('CRLF line ending handling', () => {
    test('expandToExpressionBoundaries handles CRLF', () => {
      const content = '<< 404684003\r\n\r\n< 19829001';

      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 12 },
      };

      const expanded = expandToExpressionBoundaries(content, range);
      // Should include first expression
      assert.strictEqual(offsetAt(content, expanded.start), 0);
    });

    test('getExpressionsInRange with CRLF delimiters', () => {
      const content = '<< 404684003\r\n/* ECL-END */\r\n< 19829001';

      const range: CoreRange = {
        start: { line: 0, character: 0 },
        end: { line: 2, character: 20 },
      };

      const expressions = getExpressionsInRange(content, range);
      assert.strictEqual(expressions.length, 2);
    });
  });
});
