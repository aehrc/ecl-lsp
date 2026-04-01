// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  unescapeSlackHtml,
  stripMention,
  stripSlackFormatting,
  extractBacktickExpressions,
  cleanSlackEventText,
  cleanSlackCommandText,
} from '../slack-text';

// ── unescapeSlackHtml ──────────────────────────────────────────────────

describe('unescapeSlackHtml', () => {
  it('should decode &lt; and &gt; to angle brackets', () => {
    assert.strictEqual(unescapeSlackHtml('&lt;&lt; 404684003'), '<< 404684003');
  });

  it('should decode &amp; to ampersand', () => {
    assert.strictEqual(unescapeSlackHtml('A &amp; B'), 'A & B');
  });

  it('should handle all entities in one string', () => {
    assert.strictEqual(unescapeSlackHtml('&lt;&lt; 404684003 &amp; &gt; 19829001'), '<< 404684003 & > 19829001');
  });

  it('should pass through text without entities', () => {
    assert.strictEqual(unescapeSlackHtml('no entities here'), 'no entities here');
  });
});

// ── stripMention ──────────────────────────────────────────────────────

describe('stripMention', () => {
  it('should strip a bot mention from the start', () => {
    assert.strictEqual(stripMention('<@U12345> << 404684003'), '<< 404684003');
  });

  it('should strip a mention from anywhere', () => {
    assert.strictEqual(stripMention('hello <@UBOT123> << 404684003'), 'hello  << 404684003');
  });

  it('should handle text with no mention', () => {
    assert.strictEqual(stripMention('<< 404684003'), '<< 404684003');
  });
});

// ── stripSlackFormatting ──────────────────────────────────────────────

describe('stripSlackFormatting', () => {
  it('should strip single backticks (inline code)', () => {
    assert.strictEqual(stripSlackFormatting('`<< 404684003`'), '<< 404684003');
  });

  it('should strip triple backticks (code block)', () => {
    assert.strictEqual(stripSlackFormatting('```<< 404684003```'), '<< 404684003');
  });

  it('should strip triple backticks with newlines', () => {
    assert.strictEqual(stripSlackFormatting('```\n<< 404684003\n```'), '<< 404684003');
  });

  it('should strip bold markers', () => {
    assert.strictEqual(stripSlackFormatting('*<< 404684003*'), '<< 404684003');
  });

  it('should strip italic markers', () => {
    assert.strictEqual(stripSlackFormatting('_<< 404684003_'), '<< 404684003');
  });

  it('should strip strikethrough markers', () => {
    assert.strictEqual(stripSlackFormatting('~<< 404684003~'), '<< 404684003');
  });

  it('should replace smart double quotes with straight quotes', () => {
    assert.strictEqual(stripSlackFormatting('\u201Chello\u201D'), '"hello"');
  });

  it('should replace smart single quotes with straight quotes', () => {
    assert.strictEqual(stripSlackFormatting('\u2018hello\u2019'), "'hello'");
  });

  it('should not strip unmatched backticks', () => {
    assert.strictEqual(stripSlackFormatting('`<< 404684003'), '`<< 404684003');
  });

  it('should handle plain ECL without formatting', () => {
    assert.strictEqual(stripSlackFormatting('<< 404684003'), '<< 404684003');
  });

  it('should handle whitespace around formatted text', () => {
    assert.strictEqual(stripSlackFormatting('  `<< 404684003`  '), '<< 404684003');
  });
});

// ── extractBacktickExpressions ──────────────────────────────────────────

describe('extractBacktickExpressions', () => {
  it('should return empty array when no backticks', () => {
    assert.deepStrictEqual(extractBacktickExpressions('<< 404684003'), []);
  });

  it('should extract single backtick expression', () => {
    assert.deepStrictEqual(extractBacktickExpressions('check `<< 404684003` please'), ['<< 404684003']);
  });

  it('should extract multiple single-backtick expressions', () => {
    assert.deepStrictEqual(extractBacktickExpressions('`<< 404684003` and `<< 19829001`'), [
      '<< 404684003',
      '<< 19829001',
    ]);
  });

  it('should extract triple-backtick expression', () => {
    assert.deepStrictEqual(extractBacktickExpressions('try ```<< 404684003```'), ['<< 404684003']);
  });

  it('should extract triple-backtick with newlines', () => {
    assert.deepStrictEqual(extractBacktickExpressions('```\n<< 404684003\n```'), ['<< 404684003']);
  });

  it('should extract multiple triple-backtick expressions', () => {
    assert.deepStrictEqual(extractBacktickExpressions('```<< 404684003``` and ```<< 19829001```'), [
      '<< 404684003',
      '<< 19829001',
    ]);
  });

  it('should mix single and triple backtick expressions in document order', () => {
    assert.deepStrictEqual(extractBacktickExpressions('`<< 404684003` and ```<< 19829001``` and ```<< 71388002```'), [
      '<< 404684003',
      '<< 19829001',
      '<< 71388002',
    ]);
  });

  it('should handle single expression among prose', () => {
    assert.deepStrictEqual(extractBacktickExpressions('check this `<< 404684003` for me'), ['<< 404684003']);
  });

  it('should handle complex ECL in backticks', () => {
    const ecl = '(< 763158003 AND ^ 929360061000036106): 127489000 = 395814003, { 127489000 = 395814003 }';
    assert.deepStrictEqual(extractBacktickExpressions(`evaluate \`${ecl}\` now`), [ecl]);
  });
});

// ── cleanSlackEventText (full @mention pipeline) ─────────────────────

describe('cleanSlackEventText', () => {
  it('should handle a typical @mention with HTML-encoded angle brackets', () => {
    const slackText = '<@U07V5M8EWBM> &lt;&lt; 404684003 |Clinical finding|';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003 |Clinical finding|']);
  });

  it('should handle @mention with backtick-wrapped ECL', () => {
    const slackText = '<@U07V5M8EWBM> `&lt;&lt; 404684003`';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003']);
  });

  it('should handle @mention with triple-backtick code block', () => {
    const slackText = '<@U07V5M8EWBM> ```&lt;&lt; 404684003 |Clinical finding|```';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003 |Clinical finding|']);
  });

  it('should handle compound expression with member-of operator', () => {
    const slackText =
      '<@UBOT> (&lt;&lt; 16114001 OR ^ 32570071000036102 ) : &lt;&lt; 363698007 = ( * : (272741003 = 7771000 OR 272741003 = 24028007 ) )';
    const expected =
      '(<< 16114001 OR ^ 32570071000036102 ) : << 363698007 = ( * : (272741003 = 7771000 OR 272741003 = 24028007 ) )';
    assert.deepStrictEqual(cleanSlackEventText(slackText), [expected]);
  });

  it('should handle @mention with bold-wrapped ECL', () => {
    const slackText = '<@UBOT> *&lt;&lt; 404684003*';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003']);
  });

  it('should handle plain text DM (no mention, no HTML encoding)', () => {
    assert.deepStrictEqual(cleanSlackEventText('<< 404684003'), ['<< 404684003']);
  });

  it('should preserve --no-terms flag before ECL', () => {
    const slackText = '<@UBOT> --no-terms &lt;&lt; 404684003';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['--no-terms << 404684003']);
  });

  it('should preserve --edition flag with value before ECL', () => {
    const slackText = '<@UBOT> --edition au &lt;&lt; 404684003';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['--edition au << 404684003']);
  });

  it('should preserve multiple flags before ECL', () => {
    const slackText = '<@UBOT> --no-terms --edition au &lt;&lt; 404684003';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['--no-terms --edition au << 404684003']);
  });

  it('should return empty array for empty @mention', () => {
    assert.deepStrictEqual(cleanSlackEventText('<@UBOT>'), []);
  });

  it('should treat all text after mention as ECL (no prose stripping)', () => {
    const slackText =
      '<@UBOT> (< 763158003 AND ^ 929360061000036106): 127489000 = 395814003, { 127489000 = 395814003 }';
    assert.deepStrictEqual(cleanSlackEventText(slackText), [
      '(< 763158003 AND ^ 929360061000036106): 127489000 = 395814003, { 127489000 = 395814003 }',
    ]);
  });
});

// ── Multiple expressions ────────────────────────────────────────────────

describe('cleanSlackEventText with multiple expressions', () => {
  it('should extract multiple backtick-quoted expressions', () => {
    const slackText = '<@UBOT> `&lt;&lt; 404684003` and also `&lt;&lt; 19829001`';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003', '<< 19829001']);
  });

  it('should apply flags to each backtick-quoted expression', () => {
    const slackText = '<@UBOT> --edition au `&lt;&lt; 404684003` and `&lt;&lt; 19829001`';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['--edition au << 404684003', '--edition au << 19829001']);
  });

  it('should extract multiple triple-backtick expressions', () => {
    const slackText = '<@UBOT> ```&lt;&lt; 404684003``` ```&lt;&lt; 19829001```';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003', '<< 19829001']);
  });

  it('should ignore prose between backtick expressions', () => {
    const slackText = '<@UBOT> please check `&lt;&lt; 404684003` and compare with `&lt;&lt; 19829001` thanks';
    assert.deepStrictEqual(cleanSlackEventText(slackText), ['<< 404684003', '<< 19829001']);
  });
});

// ── cleanSlackCommandText (slash command pipeline) ───────────────────

describe('cleanSlackCommandText', () => {
  it('should pass through plain ECL from slash command', () => {
    assert.strictEqual(cleanSlackCommandText('<< 404684003'), '<< 404684003');
  });

  it('should strip backticks from slash command text', () => {
    assert.strictEqual(cleanSlackCommandText('`<< 404684003`'), '<< 404684003');
  });

  it('should strip triple backticks from slash command', () => {
    assert.strictEqual(cleanSlackCommandText('```<< 404684003```'), '<< 404684003');
  });

  it('should handle slash command with flags and backtick-wrapped ECL', () => {
    assert.strictEqual(cleanSlackCommandText('--edition au `<< 404684003`'), '--edition au `<< 404684003`');
    // Note: flags before backticks means the backticks are NOT surrounding —
    // stripSlackFormatting only strips matching outer delimiters
  });
});
