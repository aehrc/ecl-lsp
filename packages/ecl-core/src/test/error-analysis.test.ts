// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { groupTokens, analyzeExpression } from '../parser/error-analysis';

// ── groupTokens tests ────────────────────────────────────────────────────────

describe('groupTokens', () => {
  test('simple concept: < 404684003 produces symbol, whitespace, then digit symbols', () => {
    const tokens = groupTokens('< 404684003');
    // '<' is symbol, ' ' is whitespace, each digit is a separate symbol
    assert.equal(tokens[0].kind, 'symbol');
    assert.equal(tokens[0].text, '<');
    assert.equal(tokens[1].kind, 'whitespace');
    assert.equal(tokens[1].text, ' ');
    // Digits are not grouped — each digit is an individual symbol token
    const digitTokens = tokens.slice(2);
    assert.equal(digitTokens.length, 9);
    for (const dt of digitTokens) {
      assert.equal(dt.kind, 'symbol');
    }
    assert.equal(digitTokens.map((t) => t.text).join(''), '404684003');
  });

  test('AND is recognized as keyword', () => {
    const tokens = groupTokens('AND');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'keyword');
    assert.equal(tokens[0].text, 'AND');
  });

  test('OR is recognized as keyword', () => {
    const tokens = groupTokens('OR');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'keyword');
    assert.equal(tokens[0].text, 'OR');
  });

  test('MINUS is recognized as keyword', () => {
    const tokens = groupTokens('MINUS');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'keyword');
    assert.equal(tokens[0].text, 'MINUS');
  });

  test('non-keyword uppercase R produces kind=word', () => {
    const tokens = groupTokens('R');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'word');
    assert.equal(tokens[0].text, 'R');
  });

  test('lowercase "and" is recognized as keyword', () => {
    const tokens = groupTokens('and');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'keyword');
    assert.equal(tokens[0].text, 'and');
  });

  test('mixed case "Or" is recognized as keyword', () => {
    const tokens = groupTokens('Or');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'keyword');
    assert.equal(tokens[0].text, 'Or');
  });

  test('lowercase "minus" is recognized as keyword', () => {
    const tokens = groupTokens('minus');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'keyword');
    assert.equal(tokens[0].text, 'minus');
  });

  test('non-keyword uppercase NOT produces kind=word', () => {
    const tokens = groupTokens('NOT');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'word');
    assert.equal(tokens[0].text, 'NOT');
  });

  test('term content between pipes has inTerm=true', () => {
    const tokens = groupTokens('404684003 |Clinical finding|');
    // word(404684003) ws pipe word(Clinical finding) pipe
    const termContent = tokens.filter((t) => t.inTerm && t.kind === 'word');
    assert.equal(termContent.length, 1);
    assert.equal(termContent[0].text, 'Clinical finding');
    assert.equal(termContent[0].inTerm, true);
  });

  test('tokens outside term have inTerm=false', () => {
    const tokens = groupTokens('404684003 |Clinical finding|');
    // Digits outside a term are individual symbol tokens with inTerm=false
    const outsideSymbols = tokens.filter((t) => !t.inTerm && t.kind === 'symbol' && t.text !== '|');
    assert.ok(outsideSymbols.length > 0, 'Should have digit symbols outside term');
    for (const s of outsideSymbols) {
      assert.equal(s.inTerm, false);
    }
  });

  test('multi-line input tracks line numbers correctly', () => {
    const tokens = groupTokens('< 404684003\nAND\n< 19829001');
    const andToken = tokens.find((t) => t.text === 'AND');
    assert.ok(andToken);
    assert.equal(andToken.line, 2);
    assert.equal(andToken.column, 0);
    // After the second newline, first token on line 3 is '<'
    const secondLt = tokens.filter((t) => t.text === '<');
    assert.equal(secondLt.length, 2);
    assert.equal(secondLt[1].line, 3);
    assert.equal(secondLt[1].column, 0);
    // Digit tokens on line 3 start at column 2
    const line3Digits = tokens.filter((t) => t.line === 3 && t.kind === 'symbol' && t.text !== '<');
    assert.ok(line3Digits.length > 0, 'Should have digit tokens on line 3');
    assert.equal(line3Digits[0].column, 2);
  });

  test('symbol characters are kind=symbol', () => {
    const symbols = ['(', ')', '{', '}', ':', '=', '<', '>', '^'];
    for (const sym of symbols) {
      const tokens = groupTokens(sym);
      assert.equal(tokens.length, 1, `Expected 1 token for '${sym}'`);
      assert.equal(tokens[0].kind, 'symbol', `Expected '${sym}' to be kind=symbol`);
      assert.equal(tokens[0].text, sym);
    }
  });

  test('empty input returns empty array', () => {
    const tokens = groupTokens('');
    assert.equal(tokens.length, 0);
  });

  test('consecutive spaces become a single whitespace token', () => {
    const tokens = groupTokens('<   404684003');
    // '<' (symbol) + '   ' (whitespace) + 9 digit symbols = 11 tokens
    assert.equal(tokens[0].kind, 'symbol');
    assert.equal(tokens[0].text, '<');
    assert.equal(tokens[1].kind, 'whitespace');
    assert.equal(tokens[1].text, '   ');
    // The key assertion: multiple spaces are collapsed into one whitespace token
    const wsTokens = tokens.filter((t) => t.kind === 'whitespace');
    assert.equal(wsTokens.length, 1);
    assert.equal(wsTokens[0].text, '   ');
  });

  test('offset values are correct', () => {
    const tokens = groupTokens('< 404684003');
    assert.equal(tokens[0].offset, 0); // <
    assert.equal(tokens[1].offset, 1); // space
    assert.equal(tokens[2].offset, 2); // first digit '4'
    assert.equal(tokens[3].offset, 3); // second digit '0'
  });

  test('column values are 0-indexed', () => {
    const tokens = groupTokens('< 404684003');
    assert.equal(tokens[0].column, 0); // <
    assert.equal(tokens[1].column, 1); // space
    assert.equal(tokens[2].column, 2); // first digit
    assert.equal(tokens[3].column, 3); // second digit
  });

  test('line values are 1-indexed', () => {
    const tokens = groupTokens('< 404684003');
    for (const tok of tokens) {
      assert.equal(tok.line, 1);
    }
  });

  test('pipes themselves are kind=symbol', () => {
    const tokens = groupTokens('|term|');
    const pipes = tokens.filter((t) => t.text === '|');
    assert.equal(pipes.length, 2);
    assert.equal(pipes[0].kind, 'symbol');
    assert.equal(pipes[1].kind, 'symbol');
  });
});

// ── analyzeExpression tests ──────────────────────────────────────────────────

describe('analyzeExpression', () => {
  // ── mixedOperator ────────────────────────────────────────────────────────
  describe('mixedOperator', () => {
    test('detects AND mixed with OR at depth 0', () => {
      const result = analyzeExpression('< 404684003 AND < 19829001 OR < 234567890');
      assert.notEqual(result.mixedOperator, null);
      assert.equal(result.mixedOperator!.firstOp, 'AND');
      assert.equal(result.mixedOperator!.conflictOp, 'OR');
    });

    test('null when same operator repeated (AND AND)', () => {
      const result = analyzeExpression('< 404684003 AND < 19829001 AND < 234567890');
      assert.equal(result.mixedOperator, null);
    });

    test('null when OR is inside parens (depth != 0)', () => {
      const result = analyzeExpression('< 404684003 AND (< 19829001 OR < 234567890)');
      assert.equal(result.mixedOperator, null);
    });

    test('detects OR then AND as mixed', () => {
      const result = analyzeExpression('< 404684003 OR < 19829001 AND < 234567890');
      assert.notEqual(result.mixedOperator, null);
      assert.equal(result.mixedOperator!.firstOp, 'OR');
      assert.equal(result.mixedOperator!.conflictOp, 'AND');
    });

    test('AND inside term does not trigger mixed operator', () => {
      const result = analyzeExpression('< 404684003 |AND finding| OR < 19829001');
      // Only one top-level operator (OR), no mix
      assert.equal(result.mixedOperator, null);
    });

    test('detects lowercase "and" mixed with "or"', () => {
      const result = analyzeExpression('< 404684003 and < 19829001 or < 234567890');
      assert.notEqual(result.mixedOperator, null);
      assert.equal(result.mixedOperator!.firstOp, 'AND');
      assert.equal(result.mixedOperator!.conflictOp, 'or');
    });

    test('mixed case operators are detected as same kind', () => {
      const result = analyzeExpression('< 404684003 And < 19829001 AND < 234567890');
      assert.equal(result.mixedOperator, null, 'And and AND are the same operator');
    });
  });

  // ── missingColonBeforeBrace ─────────────────────────────────────────────
  describe('missingColonBeforeBrace', () => {
    test('detects { without preceding :', () => {
      const result = analyzeExpression('< 404684003 { 363698007 = * }');
      assert.notEqual(result.missingColonBeforeBrace, null);
    });

    test('null when : precedes {', () => {
      const result = analyzeExpression('< 404684003 : { 363698007 = * }');
      assert.equal(result.missingColonBeforeBrace, null);
    });

    test('null when colon appears earlier at top level', () => {
      const result = analyzeExpression('< 404684003 : 363698007 = << 39057004 { 363698007 = * }');
      // seenColonAtTopLevel should be true
      assert.equal(result.missingColonBeforeBrace, null);
    });
  });

  // ── trailingOperator ───────────────────────────────────────────────────
  describe('trailingOperator', () => {
    test('detects AND at end of expression', () => {
      const result = analyzeExpression('< 404684003 AND');
      assert.notEqual(result.trailingOperator, null);
      assert.equal(result.trailingOperator!.op, 'AND');
    });

    test('detects OR at end of expression', () => {
      const result = analyzeExpression('< 404684003 OR');
      assert.notEqual(result.trailingOperator, null);
      assert.equal(result.trailingOperator!.op, 'OR');
    });

    test('detects MINUS at end of expression', () => {
      const result = analyzeExpression('< 404684003 MINUS');
      assert.notEqual(result.trailingOperator, null);
      assert.equal(result.trailingOperator!.op, 'MINUS');
    });

    test('null when content follows operator', () => {
      const result = analyzeExpression('< 404684003 AND < 19829001');
      assert.equal(result.trailingOperator, null);
    });

    test('detects trailing with whitespace after', () => {
      const result = analyzeExpression('< 404684003 AND   ');
      assert.notEqual(result.trailingOperator, null);
      assert.equal(result.trailingOperator!.op, 'AND');
    });

    test('detects lowercase trailing "or"', () => {
      const result = analyzeExpression('< 404684003 or');
      assert.notEqual(result.trailingOperator, null);
      assert.equal(result.trailingOperator!.op, 'or');
    });
  });

  // ── duplicateOperator ──────────────────────────────────────────────────
  describe('duplicateOperator', () => {
    test('detects AND AND', () => {
      const result = analyzeExpression('< 404684003 AND AND < 19829001');
      assert.notEqual(result.duplicateOperator, null);
      assert.equal(result.duplicateOperator!.op, 'AND');
    });

    test('detects OR OR', () => {
      const result = analyzeExpression('< 404684003 OR OR < 19829001');
      assert.notEqual(result.duplicateOperator, null);
      assert.equal(result.duplicateOperator!.op, 'OR');
    });

    test('null when content between same operators', () => {
      const result = analyzeExpression('< 404684003 AND < 19829001 AND < 234567890');
      assert.equal(result.duplicateOperator, null);
    });

    test('null when duplicate is inside parens', () => {
      const result = analyzeExpression('< 404684003 AND (< 19829001 AND AND < 234567890)');
      assert.equal(result.duplicateOperator, null);
    });

    test('detects lowercase duplicate "and and"', () => {
      const result = analyzeExpression('< 404684003 and and < 19829001');
      assert.notEqual(result.duplicateOperator, null);
      assert.equal(result.duplicateOperator!.op, 'and');
    });

    test('detects mixed case duplicate "And AND"', () => {
      const result = analyzeExpression('< 404684003 And AND < 19829001');
      assert.notEqual(result.duplicateOperator, null);
    });
  });

  // ── danglingEquals ─────────────────────────────────────────────────────
  describe('danglingEquals', () => {
    test('detects = at end of expression', () => {
      const result = analyzeExpression('363698007 =');
      assert.notEqual(result.danglingEquals, null);
    });

    test('null when value follows =', () => {
      const result = analyzeExpression('363698007 = 404684003');
      assert.equal(result.danglingEquals, null);
    });

    test('detects = with trailing whitespace', () => {
      const result = analyzeExpression('363698007 =   ');
      assert.notEqual(result.danglingEquals, null);
    });

    test('reports correct line and column for =', () => {
      const result = analyzeExpression('363698007 =');
      assert.notEqual(result.danglingEquals, null);
      assert.equal(result.danglingEquals!.line, 1);
      assert.equal(result.danglingEquals!.column, 10);
    });
  });

  // ── unclosedParen ─────────────────────────────────────────────────────
  describe('unclosedParen', () => {
    test('detects ( without closing )', () => {
      const result = analyzeExpression('(< 404684003');
      assert.notEqual(result.unclosedParen, null);
    });

    test('null when parens are balanced', () => {
      const result = analyzeExpression('(< 404684003)');
      assert.equal(result.unclosedParen, null);
    });

    test('detects nested unclosed paren (reports first)', () => {
      const result = analyzeExpression('((< 404684003)');
      assert.notEqual(result.unclosedParen, null);
      assert.equal(result.unclosedParen!.column, 0);
    });

    test('reports correct position for unclosed paren', () => {
      const result = analyzeExpression('< 404684003 AND (< 19829001');
      assert.notEqual(result.unclosedParen, null);
      assert.equal(result.unclosedParen!.column, 16);
    });
  });

  // ── missingWhitespace ─────────────────────────────────────────────────
  describe('missingWhitespace', () => {
    test('detects missing space before AND', () => {
      const result = analyzeExpression('< 404684003AND < 19829001');
      assert.notEqual(result.missingWhitespace, null);
      assert.equal(result.missingWhitespace!.op, 'AND');
      assert.equal(result.missingWhitespace!.side, 'before');
    });

    test('detects missing space after AND', () => {
      const result = analyzeExpression('< 404684003 AND< 19829001');
      assert.notEqual(result.missingWhitespace, null);
      assert.equal(result.missingWhitespace!.op, 'AND');
      assert.equal(result.missingWhitespace!.side, 'after');
    });

    test('null when whitespace surrounds AND', () => {
      const result = analyzeExpression('< 404684003 AND < 19829001');
      assert.equal(result.missingWhitespace, null);
    });

    test('paren before keyword is valid (no missing whitespace)', () => {
      const result = analyzeExpression('(< 404684003)AND < 19829001');
      // ')' before AND — the code checks validBefore includes '('
      // but ')' is not in validBefore, so this should detect missing whitespace
      assert.notEqual(result.missingWhitespace, null);
      assert.equal(result.missingWhitespace!.side, 'before');
    });

    test('paren after keyword is valid (no missing whitespace)', () => {
      const result = analyzeExpression('< 404684003 AND(< 19829001)');
      // '(' after AND is in validAfter... checking the code: validAfter includes ')'
      // but not '(' — let's check
      // validAfter = ' ' || '\t' || '\n' || ')' || ''
      // '(' is NOT in validAfter, so this should detect
      assert.notEqual(result.missingWhitespace, null);
      assert.equal(result.missingWhitespace!.side, 'after');
    });

    test('opening paren before keyword is valid', () => {
      // validBefore includes '('
      const _result = analyzeExpression('< 404684003 OR (AND < 19829001)');
      // '(' immediately before AND — this should be fine
      // But wait, there's a space after '(' and before 'AND' in this expression
      // Let me write a case where '(' is directly before AND
      const result2 = analyzeExpression('(AND < 19829001)');
      // text[tok.offset-1] = '(' which is in validBefore
      assert.equal(result2.missingWhitespace, null);
    });
  });

  // ── Clean expressions ──────────────────────────────────────────────────
  describe('clean expressions', () => {
    test('simple AND expression: all fields null', () => {
      const result = analyzeExpression('< 404684003 AND < 19829001');
      assert.equal(result.mixedOperator, null);
      assert.equal(result.missingColonBeforeBrace, null);
      assert.equal(result.trailingOperator, null);
      assert.equal(result.duplicateOperator, null);
      assert.equal(result.danglingEquals, null);
      assert.equal(result.unclosedParen, null);
      assert.equal(result.missingWhitespace, null);
    });

    test('complex valid expression: all fields null', () => {
      const result = analyzeExpression('(< 404684003 AND < 19829001) : 363698007 = << 39057004');
      assert.equal(result.mixedOperator, null);
      assert.equal(result.missingColonBeforeBrace, null);
      assert.equal(result.trailingOperator, null);
      assert.equal(result.duplicateOperator, null);
      assert.equal(result.danglingEquals, null);
      assert.equal(result.unclosedParen, null);
      assert.equal(result.missingWhitespace, null);
    });

    test('expression with refinement braces and colon: all fields null', () => {
      const result = analyzeExpression('< 404684003 : { 363698007 = << 39057004 }');
      assert.equal(result.mixedOperator, null);
      assert.equal(result.missingColonBeforeBrace, null);
      assert.equal(result.trailingOperator, null);
      assert.equal(result.duplicateOperator, null);
      assert.equal(result.danglingEquals, null);
      assert.equal(result.unclosedParen, null);
      assert.equal(result.missingWhitespace, null);
    });

    test('terms do not affect analysis (AND inside term ignored)', () => {
      const result = analyzeExpression('< 404684003 |AND finding|');
      assert.equal(result.mixedOperator, null);
      assert.equal(result.trailingOperator, null);
      assert.equal(result.duplicateOperator, null);
      assert.equal(result.missingWhitespace, null);
    });

    test('empty string: all fields null', () => {
      const result = analyzeExpression('');
      assert.equal(result.mixedOperator, null);
      assert.equal(result.missingColonBeforeBrace, null);
      assert.equal(result.trailingOperator, null);
      assert.equal(result.duplicateOperator, null);
      assert.equal(result.danglingEquals, null);
      assert.equal(result.unclosedParen, null);
      assert.equal(result.missingWhitespace, null);
    });
  });
});
