// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { groupIntoExpressions } from '../parser/expression-grouper';

describe('groupIntoExpressions', () => {
  describe('single expression', () => {
    it('should return one expression for a simple one-liner', () => {
      const result = groupIntoExpressions('< 404684003');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003');
      assert.strictEqual(result[0].startLine, 0);
      assert.strictEqual(result[0].endLine, 0);
      assert.deepStrictEqual(result[0].lineOffsets, [0]);
    });

    it('should return one expression for multi-line content', () => {
      const result = groupIntoExpressions('< 404684003\nAND < 19829001');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003\nAND < 19829001');
      assert.strictEqual(result[0].startLine, 0);
      assert.strictEqual(result[0].endLine, 1);
      assert.deepStrictEqual(result[0].lineOffsets, [0, 1]);
    });
  });

  describe('multiple expressions separated by ECL-END', () => {
    it('should split on /* ECL-END */ delimiter', () => {
      const text = '< 404684003\n/* ECL-END */\n< 19829001';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].text, '< 404684003');
      assert.strictEqual(result[0].startLine, 0);
      assert.strictEqual(result[0].endLine, 0);
      assert.strictEqual(result[1].text, '< 19829001');
      assert.strictEqual(result[1].startLine, 2);
      assert.strictEqual(result[1].endLine, 2);
    });

    it('should handle three expressions', () => {
      const text = '< 1\n/* ECL-END */\n< 2\n/* ECL-END */\n< 3';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].text, '< 1');
      assert.strictEqual(result[1].text, '< 2');
      assert.strictEqual(result[2].text, '< 3');
    });

    it('should handle ECL-END with leading/trailing whitespace', () => {
      const text = '< 1\n  /* ECL-END */  \n< 2';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 2);
    });

    it('should skip empty expressions between consecutive ECL-END', () => {
      const text = '< 1\n/* ECL-END */\n/* ECL-END */\n< 2';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].text, '< 1');
      assert.strictEqual(result[1].text, '< 2');
    });
  });

  describe('empty and whitespace lines', () => {
    it('should skip empty lines within an expression', () => {
      const text = '< 404684003\n\nAND < 19829001';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      // Empty line is skipped, so lineOffsets should be [0, 2]
      assert.deepStrictEqual(result[0].lineOffsets, [0, 2]);
    });

    it('should return empty array for empty input', () => {
      const result = groupIntoExpressions('');
      assert.strictEqual(result.length, 0);
    });

    it('should return empty array for whitespace-only input', () => {
      const result = groupIntoExpressions('   \n   \n   ');
      assert.strictEqual(result.length, 0);
    });

    it('should skip leading empty lines and set correct startLine', () => {
      const text = '\n\n< 404684003';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].startLine, 2);
    });
  });

  describe('comment handling', () => {
    it('should skip lines that are only // comments', () => {
      const text = '// this is a comment\n< 404684003';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003');
      assert.strictEqual(result[0].startLine, 1);
      assert.deepStrictEqual(result[0].lineOffsets, [1]);
    });

    it('should strip inline block comments from expression lines', () => {
      const text = '< 404684003 /* Clinical finding */';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      // Block comment removed, trailing whitespace remains
      assert.strictEqual(result[0].text, '< 404684003 ');
    });

    it('should strip unclosed block comment (everything after /*)', () => {
      const text = '< 404684003 /* start of comment';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003 ');
    });

    it('should skip lines that are only closing */', () => {
      const text = '*/\n< 404684003';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003');
    });

    it('should not treat // comments as content', () => {
      const text = '< 1\n// separator\n< 2';
      const result = groupIntoExpressions(text);
      // // comment is skipped, but both lines are in same expression
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 1\n< 2');
      assert.deepStrictEqual(result[0].lineOffsets, [0, 2]);
    });

    it('should skip multi-line block comments entirely', () => {
      const text = '/* Multi-line\n   spanning several lines\n   should be preserved */\n< 404684003';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003');
    });

    it('should skip multi-line block comment before expression', () => {
      const text = '/* This is a\n   block comment */\n< 404684003 : 363698007 = < 39057004';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, '< 404684003 : 363698007 = < 39057004');
    });

    it('should handle multi-line block comment between expressions', () => {
      const text = '< 1\n/* ECL-END */\n/* This comment\n   spans lines */\n< 2';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].text, '< 1');
      assert.strictEqual(result[1].text, '< 2');
    });

    it('should handle code after closing */ of multi-line block comment', () => {
      const text = '/* comment\n   continues */ < 404684003';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].text.includes('404684003'), 'Should include code after closing */');
    });

    it('should handle multi-line block comment with no code after', () => {
      const text = '/* Only\n   a comment\n*/';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 0);
    });

    it('should handle block comment starting mid-line and spanning multiple lines', () => {
      const text = '< 404684003 /* starts here\n   continues\n   ends here */ : 363698007 = < 39057004';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      // First line should have code before the comment
      assert.ok(result[0].text.includes('404684003'), 'Should include code before comment');
    });

    it('should not confuse middle lines of block comment with ECL', () => {
      const text =
        '/* Multi-line\n   spanning several lines\n   should be preserved */\n< 404684003 : 363698007 = < 39057004';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      // Should NOT contain "spanning" or "preserved"
      assert.ok(!result[0].text.includes('spanning'), 'Should not include comment content');
      assert.ok(!result[0].text.includes('preserved'), 'Should not include comment content');
      assert.strictEqual(result[0].text, '< 404684003 : 363698007 = < 39057004');
    });
  });

  describe('line offset tracking', () => {
    it('should track correct document line numbers for multi-line expression', () => {
      const text = '// header\n< 404684003\nAND\n< 19829001';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      // Line 0 is comment (skipped), lines 1-3 are expression
      assert.deepStrictEqual(result[0].lineOffsets, [1, 2, 3]);
      assert.strictEqual(result[0].startLine, 1);
      assert.strictEqual(result[0].endLine, 3);
    });

    it('should track offsets correctly across ECL-END boundaries', () => {
      const text = '< 1\n/* ECL-END */\n// comment\n< 2';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0].lineOffsets, [0]);
      assert.deepStrictEqual(result[1].lineOffsets, [3]);
      assert.strictEqual(result[1].startLine, 3);
    });
  });

  describe('endLine calculation', () => {
    it('last expression endLine should be last line of document', () => {
      const text = '< 1\n< 2\n< 3';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result[0].endLine, 2); // lines.length - 1
    });

    it('non-last expression endLine should be line before ECL-END', () => {
      const text = '< 1\n< 2\n/* ECL-END */\n< 3';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result[0].endLine, 1); // lineIndex - 1 where ECL-END is line 2
    });

    it('trailing empty lines after last expression still set endLine to last document line', () => {
      const text = '< 1\n\n\n';
      const result = groupIntoExpressions(text);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].endLine, 3); // 4 lines (including trailing empty)
    });
  });
});
