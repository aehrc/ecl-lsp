// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { refineParseError, ErrorContext } from '../validation/error-refinement';

/** Helper to build an ErrorContext with sensible defaults. */
function ctx(overrides: Partial<ErrorContext> & { error: ErrorContext['error'] }): ErrorContext {
  return {
    lines: overrides.lines ?? [overrides.error.message],
    docLineIndex: overrides.docLineIndex ?? 0,
    lineOffsets: overrides.lineOffsets ?? [0],
    startLine: overrides.startLine ?? 0,
    ...overrides,
  };
}

// ── Mixed operators ──────────────────────────────────────────────────────────

describe('refineParseError — mixed operators', () => {
  test('preserves message and highlights operator column', () => {
    const line = '< 404684003 AND < 19829001 OR < 234567890';
    const result = refineParseError(
      ctx({
        error: {
          line: 1,
          column: 27,
          message: "Cannot mix 'AND' and 'OR' operators without parentheses",
          offendingSymbol: 'OR',
        },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes('Cannot mix'));
    assert.strictEqual(result.startChar, 27);
    assert.strictEqual(result.endChar, 29); // 'OR'.length = 2
  });

  test('uses offendingSymbol.text when offendingSymbol is an object', () => {
    const line = '< 404684003 AND < 19829001 OR < 234567890';
    const result = refineParseError(
      ctx({
        error: {
          line: 1,
          column: 27,
          message: "Cannot mix 'AND' and 'OR' operators without parentheses",
          offendingSymbol: { text: 'OR' },
        },
        lines: [line],
      }),
    );
    assert.strictEqual(result.endChar - result.startChar, 2); // 'OR'
  });

  test('defaults to width 3 when offendingSymbol is empty', () => {
    const line = '< 404684003 AND < 19829001 OR < 234567890';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 27, message: "Cannot mix 'AND' and 'OR' operators without parentheses" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.endChar - result.startChar, 3);
  });
});

// ── Missing colon before brace ───────────────────────────────────────────────

describe('refineParseError — missing colon before brace', () => {
  test('highlights single character at column', () => {
    const line = '< 404684003 { 363698007 = * }';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 12, message: "Missing ':' before '{'" },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes("Missing ':'"));
    assert.strictEqual(result.endChar - result.startChar, 1);
  });
});

// ── Trailing operator ────────────────────────────────────────────────────────

describe('refineParseError — trailing operator', () => {
  test('highlights trailing AND keyword', () => {
    const line = '< 404684003 AND';
    const result = refineParseError(
      ctx({
        error: {
          line: 1,
          column: 12,
          message: "Incomplete expression: 'AND' must be followed by a concept",
          offendingSymbol: 'AND',
        },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes('Incomplete expression'));
    assert.strictEqual(result.startChar, 12);
    assert.strictEqual(result.endChar, 15); // 'AND'.length = 3
  });
});

// ── Duplicate operator ───────────────────────────────────────────────────────

describe('refineParseError — duplicate operator', () => {
  test('highlights duplicate keyword at column', () => {
    const line = '< 404684003 AND AND < 19829001';
    const result = refineParseError(
      ctx({
        error: {
          line: 1,
          column: 16,
          message: "Duplicate 'AND' — expected a concept constraint",
          offendingSymbol: 'AND',
        },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes("Duplicate 'AND'"));
    assert.strictEqual(result.startChar, 16);
    assert.strictEqual(result.endChar, 19);
  });
});

// ── Dangling equals ──────────────────────────────────────────────────────────

describe('refineParseError — dangling equals', () => {
  test('highlights single = character', () => {
    const line = '363698007 =';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 10, message: "Incomplete attribute: '=' must be followed by a value" },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes("'=' must be followed by"));
    assert.strictEqual(result.endChar - result.startChar, 1);
  });
});

// ── Missing closing paren ────────────────────────────────────────────────────

describe('refineParseError — missing closing paren', () => {
  test('highlights single character at column', () => {
    const line = '(< 404684003';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 0, message: "Missing closing ')'" },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes("Missing closing ')'"));
    assert.strictEqual(result.startChar, 0);
    assert.strictEqual(result.endChar, 1);
  });
});

// ── Missing whitespace ───────────────────────────────────────────────────────

describe('refineParseError — missing whitespace', () => {
  test('highlights operator keyword', () => {
    const line = '< 404684003AND < 19829001';
    const result = refineParseError(
      ctx({
        error: {
          line: 1,
          column: 11,
          message: "Missing space around 'AND' — operators must be surrounded by spaces",
          offendingSymbol: 'AND',
        },
        lines: [line],
      }),
    );
    assert.ok(result.message.includes('Missing space'));
    assert.strictEqual(result.startChar, 11);
    assert.strictEqual(result.endChar, 14);
  });
});

// ── no viable alternative at input ───────────────────────────────────────────

describe('refineParseError — no viable alternative', () => {
  test('unclosed paren → "Missing closing parenthesis )"', () => {
    const line = '(< 404684003 AND < 19829001';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 0, message: "no viable alternative at input '(< 404684003 AND < 19829001'" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Missing closing parenthesis )');
    // Highlights at end of line
    assert.strictEqual(result.endChar, line.length);
  });

  test('duplicate AND → "Duplicate AND operator or missing concept"', () => {
    const line = '< 404684003 AND AND < 19829001';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 16, message: "no viable alternative at input 'AND'" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Duplicate AND operator or missing concept');
  });

  test('duplicate OR → highlights second occurrence', () => {
    const line = '< 404684003 OR OR < 19829001';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 15, message: "no viable alternative at input 'OR'" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Duplicate OR operator or missing concept');
  });

  test('found contains < → "Missing operator or invalid syntax"', () => {
    const line = '< 404684003 < 19829001';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 12, message: "no viable alternative at input '< 19829001'" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Missing operator or invalid syntax');
  });

  test('generic found → "Invalid syntax near \'....\'"', () => {
    const line = '< 404684003 xyz';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 12, message: "no viable alternative at input 'xyz'" },
        lines: [line],
      }),
    );
    assert.ok(result.message.startsWith("Invalid syntax near 'xyz'"));
  });
});

// ── mismatched input <EOF> ───────────────────────────────────────────────────

describe('refineParseError — mismatched input EOF', () => {
  test('produces "Incomplete expression" message', () => {
    const line = '< 404684003 AND';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 15, message: "mismatched input '<EOF>' expecting..." },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Incomplete expression - missing concept ID or closing parenthesis');
  });

  test('highlights last token on the line', () => {
    const line = '< 404684003 AND';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 15, message: "mismatched input '<EOF>' expecting..." },
        lines: [line],
      }),
    );
    // Last token is "AND" at column 12
    assert.strictEqual(result.startChar, 12);
    assert.strictEqual(result.endChar, 15);
  });
});

// ── mismatched input (non-EOF) ───────────────────────────────────────────────

describe('refineParseError — mismatched input (non-EOF)', () => {
  test('produces "Unexpected \'...\' - check syntax" message', () => {
    const line = '< 404684003 ) < 19829001';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 12, message: "mismatched input ')' expecting..." },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, "Unexpected ')' - check syntax");
  });
});

// ── extraneous input ─────────────────────────────────────────────────────────

describe('refineParseError — extraneous input', () => {
  test('produces "Extra \'...\' - remove or fix syntax" message', () => {
    const line = '< 404684003 ) < 19829001';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 12, message: "extraneous input ')' expecting..." },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, "Extra ')' - remove or fix syntax");
  });
});

// ── missing (generic) ────────────────────────────────────────────────────────

describe('refineParseError — missing (generic)', () => {
  test('missing ) becomes "Missing closing parenthesis )"', () => {
    const line = '< 404684003';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 11, message: "missing ')'" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Missing closing parenthesis )');
    assert.strictEqual(result.endChar, line.length);
  });

  test('missing RIGHT_PAREN becomes "Missing closing parenthesis )"', () => {
    const line = '< 404684003';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 11, message: 'missing RIGHT_PAREN' },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, 'Missing closing parenthesis )');
  });

  test('generic missing → capitalizes "Missing:"', () => {
    const line = '< 404684003';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 11, message: "missing 'AND'" },
        lines: [line],
      }),
    );
    assert.strictEqual(result.message, "Missing: 'AND'");
    assert.strictEqual(result.endChar - result.startChar, 1);
  });
});

// ── Default fallback ─────────────────────────────────────────────────────────

describe('refineParseError — default fallback', () => {
  test('uses ANTLR column directly (already includes whitespace)', () => {
    const line = '  < 404684003';
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 5, message: 'some unknown error' },
        lines: [line],
      }),
    );
    // ANTLR column is already 0-indexed from start of full line, no whitespace adjustment needed
    assert.strictEqual(result.startChar, 5);
    assert.strictEqual(result.endChar, 6);
  });

  test('passes through unknown message unchanged', () => {
    const result = refineParseError(
      ctx({
        error: { line: 1, column: 0, message: 'completely unknown error' },
        lines: ['< 404684003'],
      }),
    );
    assert.strictEqual(result.message, 'completely unknown error');
  });
});

// ── EOF relocation ───────────────────────────────────────────────────────────

describe('refineParseError — EOF relocation', () => {
  test('EOF error relocates to last expression line', () => {
    const lines = ['< 404684003', 'AND', '< 19829001 AND'];
    const result = refineParseError({
      error: { line: 3, column: 14, message: "mismatched input '<EOF>' expecting..." },
      lines,
      docLineIndex: 2,
      lineOffsets: [0, 1, 2],
      startLine: 0,
    });
    // Should relocate to line 2 (last lineOffset)
    assert.strictEqual(result.docLineIndex, 2);
  });

  test('missing ) error relocates to last line', () => {
    const lines = ['(< 404684003', 'AND', '< 19829001'];
    const result = refineParseError({
      error: { line: 3, column: 0, message: "missing ')'" },
      lines,
      docLineIndex: 0,
      lineOffsets: [0, 1, 2],
      startLine: 0,
    });
    assert.strictEqual(result.docLineIndex, 2);
    assert.strictEqual(result.message, 'Missing closing parenthesis )');
  });

  test('non-EOF error stays on reported line', () => {
    const lines = ['< 404684003', 'AND AND', '< 19829001'];
    const result = refineParseError({
      error: { line: 2, column: 4, message: "no viable alternative at input 'AND'" },
      lines,
      docLineIndex: 1,
      lineOffsets: [0, 1, 2],
      startLine: 0,
    });
    assert.strictEqual(result.docLineIndex, 1);
  });
});

// ── Leading whitespace handling ──────────────────────────────────────────────

describe('refineParseError — leading whitespace', () => {
  test('ANTLR column already includes indent — no double-counting', () => {
    const line = '    < 404684003 AND AND < 19829001';
    // ANTLR reports the second AND at column 20 (4 indent + 16 content offset)
    const result = refineParseError(
      ctx({
        error: {
          line: 1,
          column: 20,
          message: "Duplicate 'AND' — expected a concept constraint",
          offendingSymbol: 'AND',
        },
        lines: [line],
      }),
    );
    // Column 20 used directly — no leadingWhitespace addition
    assert.strictEqual(result.startChar, 20);
    assert.strictEqual(result.endChar, 23);
  });
});
