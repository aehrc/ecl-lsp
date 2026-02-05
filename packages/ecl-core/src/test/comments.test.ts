// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractComments, reinsertComments, Comment } from '../formatter/comments';

describe('extractComments', () => {
  test('no comments — returns empty array and text unchanged', () => {
    const input = '< 404684003 OR < 19829001';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 0, 'should have no comments');
    assert.strictEqual(result.textWithoutComments, input, 'text should be unchanged');
  });

  test('single line comment before code', () => {
    const input = '// comment\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1, 'should have one comment');
    assert.strictEqual(result.comments[0].content, '// comment');
    assert.strictEqual(result.comments[0].type, 'line');
    assert.strictEqual(result.comments[0].position, 'before');
    assert.strictEqual(result.comments[0].startOffset, 0);
    assert.strictEqual(result.comments[0].endOffset, 10);
  });

  test('single block comment before code', () => {
    const input = '/* comment */\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1, 'should have one comment');
    assert.strictEqual(result.comments[0].content, '/* comment */');
    assert.strictEqual(result.comments[0].type, 'block');
    assert.strictEqual(result.comments[0].position, 'before');
  });

  test('inline block comment after code', () => {
    const input = '< 404684003 /* comment */';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1, 'should have one comment');
    assert.strictEqual(result.comments[0].content, '/* comment */');
    assert.strictEqual(result.comments[0].type, 'block');
    assert.strictEqual(result.comments[0].position, 'inline');
  });

  test('multiple line comments in a row', () => {
    const input = '// comment 1\n// comment 2\n// comment 3\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 3, 'should have three comments');
    assert.strictEqual(result.comments[0].content, '// comment 1');
    assert.strictEqual(result.comments[1].content, '// comment 2');
    assert.strictEqual(result.comments[2].content, '// comment 3');
    // All should be 'before' since code comes after
    for (const c of result.comments) {
      assert.strictEqual(c.position, 'before', `comment "${c.content}" should be position=before`);
      assert.strictEqual(c.type, 'line');
    }
  });

  test('block comment inside line comment is treated as part of line comment only', () => {
    const input = '// has /* fake */ inside\n< 404684003';
    const result = extractComments(input);
    // Should only extract the line comment, not the fake block comment
    assert.strictEqual(result.comments.length, 1, 'should have one comment (the line comment)');
    assert.strictEqual(result.comments[0].content, '// has /* fake */ inside');
    assert.strictEqual(result.comments[0].type, 'line');
  });

  test('empty block comment', () => {
    const input = '/**/\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1, 'should have one comment');
    assert.strictEqual(result.comments[0].content, '/**/');
    assert.strictEqual(result.comments[0].type, 'block');
  });

  test('multi-line block comment', () => {
    const input = '/* line1\n line2 */\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1, 'should have one comment');
    assert.strictEqual(result.comments[0].content, '/* line1\n line2 */');
    assert.strictEqual(result.comments[0].type, 'block');
    assert.strictEqual(result.comments[0].position, 'before');
  });

  test('text without comments returns original text in textWithoutComments', () => {
    const input = '< 404684003 OR < 19829001 AND < 234567890';
    const result = extractComments(input);
    assert.strictEqual(result.textWithoutComments, input);
    assert.strictEqual(result.comments.length, 0);
  });

  test('ECL-END comment gets position=between', () => {
    const input = '< 404684003\n\n/* ECL-END */\n\n< 19829001';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1, 'should have one comment');
    assert.strictEqual(result.comments[0].content, '/* ECL-END */');
    assert.strictEqual(result.comments[0].position, 'between');
  });

  test('textWithoutComments replaces line comment with empty string', () => {
    const input = '// a comment\n< 404684003';
    const result = extractComments(input);
    // Line comments are replaced with '' (empty string), so the newline before code remains
    assert.ok(!result.textWithoutComments.includes('// a comment'), 'comment text should be removed');
    assert.ok(result.textWithoutComments.includes('< 404684003'), 'code should be preserved');
  });

  test('textWithoutComments replaces block comment with spaces of same length', () => {
    const input = '< 404684003 /* inline */ OR < 19829001';
    const result = extractComments(input);
    // Block comment "/* inline */" is 12 chars, replaced with 12 spaces
    const commentLen = '/* inline */'.length;
    assert.strictEqual(
      result.textWithoutComments.length,
      input.length,
      'textWithoutComments should have same length as original (block comments replaced with spaces)',
    );
    assert.ok(!result.textWithoutComments.includes('/*'), 'block comment markers should be removed');
    assert.ok(
      result.textWithoutComments.includes(' '.repeat(commentLen)),
      'block comment should be replaced with spaces',
    );
  });

  test('inline line comment on same line as code', () => {
    // A line comment that appears after code on the same line
    const input = '< 404684003 // inline note';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].content, '// inline note');
    assert.strictEqual(result.comments[0].type, 'line');
    assert.strictEqual(result.comments[0].position, 'inline');
  });

  test('trailingWhitespace captured between consecutive comments', () => {
    const input = '// comment 1\n\n// comment 2\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 2);
    // The first comment should have trailing whitespace "\n\n" (text between end of comment 1 and start of comment 2)
    assert.strictEqual(
      result.comments[0].trailingWhitespace,
      '\n\n',
      'trailing whitespace between consecutive comments should be captured',
    );
  });

  test('trailingWhitespace is empty string when no whitespace between comments', () => {
    // Two block comments directly adjacent
    const input = '/* a *//* b */\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 2);
    assert.strictEqual(result.comments[0].trailingWhitespace, '', 'no whitespace between adjacent comments');
  });

  test('between-code block comment positioned correctly', () => {
    const input = '< 404684003\n/* separator */\n< 19829001';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].content, '/* separator */');
    assert.strictEqual(result.comments[0].position, 'between');
  });

  test('mixed line and block comments extracted in order', () => {
    const input = '// line comment\n/* block comment */\n< 404684003';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 2);
    assert.strictEqual(result.comments[0].content, '// line comment');
    assert.strictEqual(result.comments[0].type, 'line');
    assert.strictEqual(result.comments[1].content, '/* block comment */');
    assert.strictEqual(result.comments[1].type, 'block');
  });

  test('comment-only input has no code', () => {
    const input = '// just a comment';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].content, '// just a comment');
    // position should be 'before' (default when no code)
    assert.strictEqual(result.comments[0].position, 'before');
  });

  test('startOffset and endOffset match original positions', () => {
    const input = 'abc /* mid */ def';
    const result = extractComments(input);
    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].startOffset, 4);
    assert.strictEqual(result.comments[0].endOffset, 13);
    assert.strictEqual(input.substring(4, 13), '/* mid */');
  });
});

describe('reinsertComments', () => {
  test('empty comments array — returns formatted text unchanged', () => {
    const formatted = '<< 404684003';
    const original = '<<  404684003';
    const result = reinsertComments(formatted, original, []);
    assert.strictEqual(result, formatted);
  });

  test('single before comment — prepended before formatted text', () => {
    const formatted = '<< 404684003';
    const original = '/* header */\n<< 404684003';
    const comments: Comment[] = [
      {
        content: '/* header */',
        startOffset: 0,
        endOffset: 12,
        type: 'block',
        position: 'before',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    assert.ok(result.startsWith('/* header */'), 'comment should be at the start');
    assert.ok(result.includes('<< 404684003'), 'formatted text should be present');
    // Comment and code should be on separate lines
    const lines = result.split('\n');
    assert.strictEqual(lines[0], '/* header */');
  });

  test('single inline comment — appended to end of last line', () => {
    const formatted = '<< 404684003';
    const original = '<< 404684003 /* inline */';
    const comments: Comment[] = [
      {
        content: '/* inline */',
        startOffset: 13,
        endOffset: 25,
        type: 'block',
        position: 'inline',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    assert.ok(result.includes('/* inline */'), 'inline comment should be present');
    // Should be on the same line as the code
    const lines = result.split('\n');
    assert.ok(lines.at(-1)!.includes('/* inline */'), 'inline comment should be on the last line');
    assert.ok(lines.at(-1)!.includes('<< 404684003'), 'code should also be on the last line');
  });

  test('multiple before comments — all prepended in order', () => {
    const formatted = '< 404684003';
    const original = '// first\n// second\n< 404684003';
    const comments: Comment[] = [
      {
        content: '// first',
        startOffset: 0,
        endOffset: 8,
        type: 'line',
        position: 'before',
        trailingWhitespace: '\n',
      },
      {
        content: '// second',
        startOffset: 9,
        endOffset: 18,
        type: 'line',
        position: 'before',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    const firstPos = result.indexOf('// first');
    const secondPos = result.indexOf('// second');
    const codePos = result.indexOf('< 404684003');
    assert.ok(firstPos < secondPos, 'first comment should come before second');
    assert.ok(secondPos < codePos, 'second comment should come before code');
  });

  test('comment with trailingWhitespace preserved', () => {
    const formatted = '< 404684003';
    const original = '// group 1\n\n// group 2\n< 404684003';
    const comments: Comment[] = [
      {
        content: '// group 1',
        startOffset: 0,
        endOffset: 10,
        type: 'line',
        position: 'before',
        trailingWhitespace: '\n\n',
      },
      {
        content: '// group 2',
        startOffset: 12,
        endOffset: 22,
        type: 'line',
        position: 'before',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    // The trailing whitespace "\n\n" should separate the two groups
    assert.ok(
      result.includes('// group 1\n\n// group 2'),
      'blank line between comment groups should be preserved via trailingWhitespace',
    );
  });

  test('between comment placed before the following code token', () => {
    const formatted = '< 404684003\n<< 19829001';
    const original = '< 404684003\n/* separator */\n<< 19829001';
    const comments: Comment[] = [
      {
        content: '/* separator */',
        startOffset: 12,
        endOffset: 27,
        type: 'block',
        position: 'between',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    const commentPos = result.indexOf('/* separator */');
    const secondExprPos = result.indexOf('<< 19829001');
    assert.ok(commentPos !== -1, 'separator comment should be present');
    assert.ok(commentPos < secondExprPos, 'separator should appear before second expression');
  });

  test('ECL-END comments are not processed as regular comments', () => {
    const formatted = '< 404684003';
    const original = '< 404684003\n\n/* ECL-END */\n\n< 19829001';
    const comments: Comment[] = [
      {
        content: '/* ECL-END */',
        startOffset: 13,
        endOffset: 26,
        type: 'block',
        position: 'between',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    // ECL-END is filtered into eclEndComments and not processed by before/inline/between logic
    // It should not be duplicated or cause issues
    assert.ok(typeof result === 'string', 'result should be a string');
  });

  test('inline comment appended to last line of multi-line formatted text', () => {
    const formatted = '< 404684003 {\n  363698007 = < 39057004\n}';
    const original = '< 404684003 { 363698007 = < 39057004 } /* trailing */';
    const comments: Comment[] = [
      {
        content: '/* trailing */',
        startOffset: 39,
        endOffset: 53,
        type: 'block',
        position: 'inline',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    const lines = result.split('\n');
    const lastLine = lines.at(-1)!;
    assert.ok(lastLine.includes('/* trailing */'), 'inline comment should be on the last line of formatted output');
  });

  test('before comment on same line as code stays on same line', () => {
    const formatted = '<< 234567890';
    const original = '/* prefix */ << 234567890';
    const comments: Comment[] = [
      {
        content: '/* prefix */',
        startOffset: 0,
        endOffset: 12,
        type: 'block',
        position: 'before',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    // Since original has comment and code on same line, they should stay together
    assert.ok(
      result.includes('/* prefix */') && result.includes('<< 234567890'),
      'both comment and code should be present',
    );
    const lines = result.split('\n');
    assert.strictEqual(lines.length, 1, 'comment and code should be on the same line when originally on same line');
  });

  test('multiple inline comments joined with space', () => {
    const formatted = '< 404684003';
    const original = '< 404684003 /* note1 */ /* note2 */';
    const comments: Comment[] = [
      {
        content: '/* note1 */',
        startOffset: 12,
        endOffset: 23,
        type: 'block',
        position: 'inline',
      },
      {
        content: '/* note2 */',
        startOffset: 24,
        endOffset: 35,
        type: 'block',
        position: 'inline',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    assert.ok(result.includes('/* note1 */'), 'first inline comment present');
    assert.ok(result.includes('/* note2 */'), 'second inline comment present');
    // Both should be on same line
    assert.strictEqual(result.split('\n').length, 1, 'all on one line');
  });

  test('between comment falls back to end when token not found', () => {
    const formatted = '< 404684003';
    const original = '< 404684003\n/* orphan */';
    const comments: Comment[] = [
      {
        content: '/* orphan */',
        startOffset: 12,
        endOffset: 24,
        type: 'block',
        position: 'between',
      },
    ];
    const result = reinsertComments(formatted, original, comments);
    // Since there is no code after the between comment in original, it should fall back
    // to appending at the end
    assert.ok(result.includes('/* orphan */'), 'orphan between comment should still be present');
  });
});
