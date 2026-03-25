// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  unescapeSlackHtml,
  stripMention,
  stripSlackFormatting,
  extractEclFromProse,
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

// ── cleanSlackEventText (full @mention pipeline) ─────────────────────

describe('cleanSlackEventText', () => {
  it('should handle a typical @mention with HTML-encoded angle brackets', () => {
    const slackText = '<@U07V5M8EWBM> &lt;&lt; 404684003 |Clinical finding|';
    assert.strictEqual(cleanSlackEventText(slackText), '<< 404684003 |Clinical finding|');
  });

  it('should handle @mention with backtick-wrapped ECL', () => {
    const slackText = '<@U07V5M8EWBM> `&lt;&lt; 404684003`';
    assert.strictEqual(cleanSlackEventText(slackText), '<< 404684003');
  });

  it('should handle @mention with triple-backtick code block', () => {
    const slackText = '<@U07V5M8EWBM> ```&lt;&lt; 404684003 |Clinical finding|```';
    assert.strictEqual(cleanSlackEventText(slackText), '<< 404684003 |Clinical finding|');
  });

  it('should handle compound expression with member-of operator', () => {
    const slackText =
      '<@UBOT> (&lt;&lt; 16114001 OR ^ 32570071000036102 ) : &lt;&lt; 363698007 = ( * : (272741003 = 7771000 OR 272741003 = 24028007 ) )';
    const expected =
      '(<< 16114001 OR ^ 32570071000036102 ) : << 363698007 = ( * : (272741003 = 7771000 OR 272741003 = 24028007 ) )';
    assert.strictEqual(cleanSlackEventText(slackText), expected);
  });

  it('should handle @mention with bold-wrapped ECL', () => {
    const slackText = '<@UBOT> *&lt;&lt; 404684003*';
    assert.strictEqual(cleanSlackEventText(slackText), '<< 404684003');
  });

  it('should handle plain text DM (no mention, no HTML encoding)', () => {
    // DMs may not have HTML encoding depending on Slack client
    assert.strictEqual(cleanSlackEventText('<< 404684003'), '<< 404684003');
  });

  it('should preserve --no-terms flag before ECL', () => {
    const slackText = '<@UBOT> --no-terms &lt;&lt; 404684003';
    assert.strictEqual(cleanSlackEventText(slackText), '--no-terms << 404684003');
  });

  it('should preserve --edition flag with value before ECL', () => {
    const slackText = '<@UBOT> --edition au &lt;&lt; 404684003';
    assert.strictEqual(cleanSlackEventText(slackText), '--edition au << 404684003');
  });

  it('should preserve multiple flags before ECL', () => {
    const slackText = '<@UBOT> --no-terms --edition au &lt;&lt; 404684003';
    assert.strictEqual(cleanSlackEventText(slackText), '--no-terms --edition au << 404684003');
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

// ── extractEclFromProse ──────────────────────────────────────────────

describe('extractEclFromProse', () => {
  it('should return plain ECL unchanged', () => {
    assert.strictEqual(extractEclFromProse('<< 404684003'), '<< 404684003');
  });

  it('should extract ECL from leading prose', () => {
    assert.strictEqual(extractEclFromProse('can you evaluate << 404684003'), '<< 404684003');
  });

  it('should extract ECL from trailing prose', () => {
    assert.strictEqual(extractEclFromProse('<< 404684003 for me please'), '<< 404684003');
  });

  it('should extract ECL from surrounding prose', () => {
    assert.strictEqual(
      extractEclFromProse('hey can you check << 404684003 |Clinical finding| for me?'),
      '<< 404684003 |Clinical finding|',
    );
  });

  it('should extract ECL with display terms', () => {
    assert.strictEqual(
      extractEclFromProse('please evaluate << 404684003 |Clinical finding|'),
      '<< 404684003 |Clinical finding|',
    );
  });

  it('should extract compound ECL from prose', () => {
    assert.strictEqual(
      extractEclFromProse('what about << 404684003 OR << 71388002 thanks'),
      '<< 404684003 OR << 71388002',
    );
  });

  it('should extract refined ECL from prose', () => {
    assert.strictEqual(
      extractEclFromProse('try this: << 404684003 : 363698007 = << 39057004'),
      '<< 404684003 : 363698007 = << 39057004',
    );
  });

  it('should extract ECL starting with parenthesis', () => {
    assert.strictEqual(extractEclFromProse('evaluate (<< 404684003 OR << 71388002)'), '(<< 404684003 OR << 71388002)');
  });

  it('should extract ECL from inline code in prose', () => {
    assert.strictEqual(extractEclFromProse('can you evaluate `<< 404684003` for me?'), '<< 404684003');
  });

  it('should extract ECL with member-of operator from prose', () => {
    assert.strictEqual(extractEclFromProse('check ^ 816080008 please'), '^ 816080008');
  });

  it('should extract wildcard ECL', () => {
    assert.strictEqual(extractEclFromProse('try * : 363698007 = << 39057004'), '* : 363698007 = << 39057004');
  });

  it('should handle bare concept ID in prose', () => {
    assert.strictEqual(extractEclFromProse('what is 404684003'), '404684003');
  });

  it('should return empty string for empty input', () => {
    assert.strictEqual(extractEclFromProse(''), '');
  });

  it('should pass through text with no ECL-like content', () => {
    assert.strictEqual(extractEclFromProse('hello how are you'), 'hello how are you');
  });
});

// ── Full pipeline: @mention with prose ────────────────────────────────

describe('cleanSlackEventText with prose', () => {
  it('should extract ECL from @mention with surrounding prose', () => {
    const slackText = '<@UBOT> can you evaluate &lt;&lt; 404684003 |Clinical finding| for me?';
    assert.strictEqual(cleanSlackEventText(slackText), '<< 404684003 |Clinical finding|');
  });

  it('should extract inline code ECL from @mention with prose', () => {
    const slackText = '<@UBOT> please check `&lt;&lt; 404684003` thanks';
    assert.strictEqual(cleanSlackEventText(slackText), '<< 404684003');
  });

  it('should handle the reported problematic expression in prose', () => {
    const slackText =
      '<@UBOT> (&lt;&lt; 16114001 OR ^ 32570071000036102 ) : &lt;&lt; 363698007 = ( * : (272741003 = 7771000 OR 272741003 = 24028007 ) )';
    const expected =
      '(<< 16114001 OR ^ 32570071000036102 ) : << 363698007 = ( * : (272741003 = 7771000 OR 272741003 = 24028007 ) )';
    assert.strictEqual(cleanSlackEventText(slackText), expected);
  });
});
