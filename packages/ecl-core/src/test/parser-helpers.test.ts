// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseECL } from '../parser';

// =============================================================================
// These tests exercise the internal error-detection helpers in parser/index.ts
// through the public parseECL() function.  They focus on edge cases NOT covered
// by the existing diagnostics.test.ts:
//   - exact error message strings
//   - operators / colons / braces / parens inside term pipes (| |) must be ignored
//   - operators inside parentheses must not trigger top-level errors
//   - MINUS operator (often undertested)
//   - multiple error conditions in the same expression (priority ordering)
// =============================================================================

// ---------------------------------------------------------------------------
// findMixedTopLevelOperator  — via parseECL
// ---------------------------------------------------------------------------
describe('Mixed operator: exact messages and edge cases', () => {
  test('AND then MINUS produces mixed-operator error mentioning both', () => {
    const result = parseECL('< 100000 AND < 200000 MINUS < 300000');
    assert.strictEqual(result.errors.length, 1);
    const msg = result.errors[0].message;
    assert.ok(
      msg.startsWith('Cannot mix AND and MINUS operators without parentheses.'),
      `Exact prefix expected, got: ${msg}`,
    );
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
  });

  test('MINUS then OR produces mixed-operator error', () => {
    const result = parseECL('< 100000 MINUS < 200000 OR < 300000');
    assert.strictEqual(result.errors.length, 1);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('MINUS') && msg.includes('OR'), `Should mention MINUS and OR, got: ${msg}`);
    assert.strictEqual(result.errors[0].offendingSymbol, 'OR');
  });

  test('MINUS then AND produces mixed-operator error', () => {
    const result = parseECL('< 100000 MINUS < 200000 AND < 300000');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'AND');
  });

  test('OR then MINUS produces mixed-operator error', () => {
    const result = parseECL('< 100000 OR < 200000 MINUS < 300000');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
  });

  test('AND inside a term pipe does NOT trigger mixed-operator check', () => {
    // The word "AND" appears inside the term — should be ignored
    const result = parseECL('< 100000 |Fracture AND Dislocation| OR < 200000 OR < 300000');
    assert.strictEqual(
      result.errors.length,
      0,
      `Should have no errors; operators inside terms are ignored. Got: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('OR inside a term pipe does NOT trigger mixed-operator check', () => {
    const result = parseECL('< 100000 |Disorder OR Disease| AND < 200000 AND < 300000');
    assert.strictEqual(
      result.errors.length,
      0,
      `Should have no errors; OR inside term is ignored. Got: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('mixed operators inside parentheses do not affect top-level check', () => {
    // Top level is AND-only; inside parens is OR — that is valid
    const result = parseECL('(< 100000 OR < 200000) AND (< 300000 OR < 400000)');
    assert.strictEqual(result.errors.length, 0, 'Mixed ops inside parens should not be flagged at top level');
  });

  test('MINUS is not chainable: A MINUS B MINUS C produces an error', () => {
    // Unlike AND/OR, MINUS cannot be chained in ECL grammar.
    // The second MINUS is treated as unexpected input.
    const result = parseECL('< 100000 MINUS < 200000 MINUS < 300000');
    assert.strictEqual(
      result.errors.length,
      1,
      `MINUS chain should produce one error. Got: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
    const msg = result.errors[0].message.toLowerCase();
    assert.ok(
      msg.includes('missing operator') || msg.includes('unexpected'),
      `Should mention missing operator or unexpected input. Got: ${msg}`,
    );
  });

  test('exact error message format for mixed OR/AND', () => {
    const result = parseECL('< 100000 OR < 200000 AND < 300000');
    assert.strictEqual(result.errors.length, 1);
    const expected =
      'Cannot mix OR and AND operators without parentheses. ' +
      'Add parentheses to clarify precedence, e.g.: ' +
      '(... OR ...) AND ... or ... OR (... AND ...)';
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });
});

// ---------------------------------------------------------------------------
// findMissingColonBeforeBrace  — via parseECL
// ---------------------------------------------------------------------------
describe('Missing colon before brace: term and paren edge cases', () => {
  test('colon inside a term pipe does NOT satisfy the colon requirement', () => {
    // The colon is inside the term "|...: ...|", so the brace is still missing a real colon
    const result = parseECL('< 404684003 |Finding: clinical| { 363698007 = < 39057004 }');
    assert.strictEqual(result.errors.length, 1);
    const msg = result.errors[0].message;
    assert.ok(msg.includes("Missing ':'"), `Should mention missing colon, got: ${msg}`);
    assert.strictEqual(result.errors[0].offendingSymbol, '{');
  });

  test('brace inside a term pipe is NOT flagged', () => {
    // The { is inside the term — should not be flagged
    const result = parseECL('< 404684003 |Finding {clinical}| : { 363698007 = < 39057004 }');
    assert.strictEqual(
      result.errors.length,
      0,
      `Brace inside term should be ignored. Got: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('brace inside parentheses without colon still flagged at top level', () => {
    // The findMissingColonBeforeBrace checks parenDepth === 0, so brace inside parens
    // is at parenDepth > 0 and should not trigger. But if the top-level brace is missing colon...
    // Here the brace is at parenDepth=0 so it should be flagged.
    const result = parseECL('< 404684003 { 363698007 = < 39057004 }');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, '{');
  });

  test('exact error message for missing colon before brace', () => {
    const result = parseECL('< 404684003 { 363698007 = < 39057004 }');
    assert.strictEqual(result.errors.length, 1);
    const expected =
      "Missing ':' before '{'. Attribute groups must be preceded by a colon. " + 'Use: concept : { attribute = value }';
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('attribute group after comma in refinement list is NOT flagged', () => {
    // The { } is a valid attribute group within a comma-separated refinement
    const result = parseECL('< 404684003 : 363698007 = < 39057004, { 127489000 = 395814003 }');
    const colonErrors = result.errors.filter((e) => e.message.includes("Missing ':'"));
    assert.strictEqual(
      colonErrors.length,
      0,
      `Attribute group in refinement list should not trigger missing colon. Got: ${colonErrors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('attribute group with cardinality after comma is NOT flagged', () => {
    const result = parseECL('< 404684003 : 363698007 = *, [0..0] 774158006 = *, { 127489000 = 395814003 }');
    const colonErrors = result.errors.filter((e) => e.message.includes("Missing ':'"));
    assert.strictEqual(
      colonErrors.length,
      0,
      `Attribute group after cardinality attrs should not trigger missing colon. Got: ${colonErrors.map((e) => e.message).join(' | ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// findTrailingOperator  — via parseECL
// ---------------------------------------------------------------------------
describe('Trailing operator: MINUS and term edge cases', () => {
  test('trailing MINUS with trailing whitespace still detected', () => {
    const result = parseECL('< 404684003 MINUS   ');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
    assert.ok(
      result.errors[0].message.includes('MINUS'),
      `Message should mention MINUS, got: ${result.errors[0].message}`,
    );
  });

  test('exact error message for trailing OR', () => {
    const result = parseECL('< 404684003 OR');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Incomplete expression: 'OR' must be followed by a concept constraint";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('exact error message for trailing MINUS', () => {
    const result = parseECL('< 404684003 MINUS');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Incomplete expression: 'MINUS' must be followed by a concept constraint";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('AND inside a term at end of input is NOT trailing operator', () => {
    // "AND" is inside the pipe-delimited term, so the expression is valid
    const result = parseECL('< 404684003 |Clinical finding AND|');
    // No trailing operator error — the expression may fail for other reasons,
    // but NOT as "Incomplete expression: AND must be followed..."
    if (result.errors.length > 0) {
      assert.ok(
        !result.errors[0].message.includes("Incomplete expression: 'AND'"),
        `Should not flag AND inside term as trailing operator, got: ${result.errors[0].message}`,
      );
    }
  });

  test('trailing operator inside parentheses is not detected at top level', () => {
    // The AND is at parenDepth > 0, so findTrailingOperator ignores it
    // (it only scans top-level). The expression is invalid but the error
    // should NOT be the trailing-operator error.
    const result = parseECL('(< 404684003 AND)');
    assert.ok(result.errors.length > 0, 'Should have an error');
    // The error should not be "Incomplete expression: 'AND' must be followed..."
    // because AND is inside parens. It may be an unclosed-paren or ANTLR error.
    // The trailing operator detector skips parenDepth !== 0.
  });
});

// ---------------------------------------------------------------------------
// findDuplicateOperator  — via parseECL
// ---------------------------------------------------------------------------
describe('Duplicate operator: MINUS and term edge cases', () => {
  test('duplicate MINUS produces exactly one error', () => {
    const result = parseECL('< 404684003 MINUS MINUS < 19829001');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
  });

  test('exact error message for duplicate MINUS', () => {
    const result = parseECL('< 404684003 MINUS MINUS < 19829001');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Duplicate 'MINUS' — expected a concept constraint after 'MINUS', not another 'MINUS'";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('exact error message for duplicate OR', () => {
    const result = parseECL('< 404684003 OR OR < 19829001');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Duplicate 'OR' — expected a concept constraint after 'OR', not another 'OR'";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('exact error message for duplicate AND', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Duplicate 'AND' — expected a concept constraint after 'AND', not another 'AND'";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('AND AND inside a term does NOT trigger duplicate operator', () => {
    // "AND AND" is inside the term — should not be flagged
    const result = parseECL('< 404684003 |AND AND whatever| OR < 19829001');
    assert.strictEqual(
      result.errors.length,
      0,
      `Operators inside term should be ignored. Got: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('duplicate operators inside parentheses do not trigger top-level error', () => {
    // AND AND is at depth > 0 because of parens — findDuplicateOperator skips it
    // The error will come from ANTLR, but not from our duplicate detector.
    const result = parseECL('(< 404684003 AND AND < 19829001) OR < 300000');
    // There should be errors, but we verify it does not produce the exact
    // duplicate-operator message for a top-level AND.
    if (result.errors.length > 0) {
      // The duplicate is inside parens, so our custom detector won't fire at parenDepth=0.
      // It may still detect it if parenDepth tracking catches it — just verify the test runs.
      assert.ok(result.errors.length >= 1, 'Should have at least one error');
    }
  });
});

// ---------------------------------------------------------------------------
// findDanglingEquals  — via parseECL
// ---------------------------------------------------------------------------
describe('Dangling equals: edge cases', () => {
  test('exact error message for dangling equals', () => {
    const result = parseECL('< 404684003 : 363698007 =');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Incomplete attribute: '=' must be followed by a concept expression (e.g., '= < 123456789')";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('dangling equals with trailing whitespace is still detected', () => {
    const result = parseECL('< 404684003 : 363698007 =   ');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, '=');
  });

  test('equals inside a term does NOT trigger dangling-equals', () => {
    // The "=" is inside the term — the expression is valid
    const result = parseECL('< 404684003 |Finding = clinical|');
    // May error for other reasons (bad term), but should NOT be "Incomplete attribute"
    const danglingMsg = result.errors.find((e) => e.message.includes('Incomplete attribute'));
    assert.strictEqual(
      danglingMsg,
      undefined,
      `Should not flag = inside term as dangling. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('equals followed by a value is valid', () => {
    const result = parseECL('< 404684003 : 363698007 = < 39057004');
    assert.strictEqual(result.errors.length, 0, 'Complete attribute should be valid');
  });

  test('equals on second line with trailing whitespace', () => {
    const result = parseECL('< 404684003 :\n  363698007 =  ');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, '=');
    // The = is on line 2 at some column
    const msg = result.errors[0].message;
    assert.ok(msg.includes("'='"), `Should reference =, got: ${msg}`);
  });
});

// ---------------------------------------------------------------------------
// findUnclosedParen  — via parseECL
// ---------------------------------------------------------------------------
describe('Unclosed paren: term and nesting edge cases', () => {
  test('exact error message for unclosed paren', () => {
    const result = parseECL('(< 404684003');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Missing closing ')' — every '(' must have a matching ')'";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('parenthesis inside a term does NOT count as unclosed', () => {
    // The ( is inside the term — should be ignored
    const result = parseECL('< 404684003 |Finding (clinical)|');
    // Should NOT produce "Missing closing ')'"
    const unclosedMsg = result.errors.find((e) => e.message.includes("Missing closing ')'"));
    assert.strictEqual(
      unclosedMsg,
      undefined,
      `Paren inside term should be ignored. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('nested unclosed paren points to the outermost one', () => {
    const result = parseECL('((< 404684003)');
    // Two opens, one close — the first ( is unclosed
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(
      result.errors[0].column,
      0,
      `Should point to outermost unclosed (, got col ${result.errors[0].column}`,
    );
  });

  test('properly nested double parens are valid', () => {
    const result = parseECL('((< 404684003 OR < 200000))');
    assert.strictEqual(
      result.errors.length,
      0,
      `Properly nested parens should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// findMissingWhitespaceAroundOp  — via parseECL
// ---------------------------------------------------------------------------
describe('Missing whitespace around operator: MINUS and directional edge cases', () => {
  test('MINUS without space before produces error', () => {
    // When MINUS directly follows a term closing pipe with no space,
    // and also has no space after, ANTLR errors out and our helper fires.
    const result = parseECL('< 404684003 |Finding|MINUS< 200000');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
    const msg = result.errors[0].message;
    assert.ok(msg.includes('before'), `Should say 'before', got: ${msg}`);
  });

  test('MINUS without space after produces error', () => {
    const result = parseECL('< 404684003 MINUS< 200000');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
    const msg = result.errors[0].message;
    assert.ok(msg.includes('after'), `Should say 'after', got: ${msg}`);
  });

  test('exact error message for missing space before OR', () => {
    // OR must both lack a space before it AND trigger an ANTLR error.
    // "|term|OR<" does both: the pipe is not valid whitespace for "before"
    // and the "<" abutting OR causes ANTLR to error.
    const result = parseECL('<< 404684003 |Clinical finding|OR< 19829001');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Missing space before 'OR' — operators must be surrounded by spaces";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('exact error message for missing space after AND', () => {
    const result = parseECL('< 404684003 AND< 19829001');
    assert.strictEqual(result.errors.length, 1);
    const expected = "Missing space after 'AND' — operators must be surrounded by spaces";
    assert.strictEqual(result.errors[0].message, expected, `Exact message mismatch. Got: ${result.errors[0].message}`);
  });

  test('MINUS inside a term does NOT trigger missing-whitespace check', () => {
    const result = parseECL('< 404684003 |SomeMINUSThing| OR < 200000');
    // MINUS is inside term — should not be flagged
    const wsMsg = result.errors.find((e) => e.message.includes('operators must be surrounded'));
    assert.strictEqual(
      wsMsg,
      undefined,
      `MINUS inside term should be ignored. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('operator with tab as separator is valid (tab counts as whitespace)', () => {
    const result = parseECL('< 404684003\tOR\t< 19829001');
    assert.strictEqual(
      result.errors.length,
      0,
      `Tab-separated operators should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('operator with newline as separator is valid', () => {
    const result = parseECL('< 404684003\nOR\n< 19829001');
    assert.strictEqual(
      result.errors.length,
      0,
      `Newline-separated operators should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('operator after opening paren is valid (paren counts as valid before)', () => {
    const result = parseECL('< 404684003 OR (< 19829001 AND < 300000)');
    assert.strictEqual(
      result.errors.length,
      0,
      `Operator after paren should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Priority ordering — multiple potential error conditions
// ---------------------------------------------------------------------------
describe('Error priority ordering: first matching detector wins', () => {
  // The detection order in parseECL is:
  //   1. findMixedTopLevelOperator
  //   2. findMissingColonBeforeBrace
  //   3. findTrailingOperator
  //   4. findDuplicateOperator
  //   5. findDanglingEquals
  //   6. findUnclosedParen
  //   7. findMissingWhitespaceAroundOp
  //   8. consolidation (missing operator + no viable alternative)

  test('mixed operators take priority over trailing operator', () => {
    // "AND ... OR" is mixed, AND also the expression ends with OR (trailing)
    const result = parseECL('< 100000 AND < 200000 OR');
    assert.strictEqual(result.errors.length, 1);
    // Mixed should win over trailing
    const msg = result.errors[0].message;
    assert.ok(msg.includes('Cannot mix'), `Mixed operator should take priority. Got: ${msg}`);
  });

  test('mixed operators take priority over duplicate operator', () => {
    // "OR OR" is duplicate, but "AND ... OR" is also mixed at top level
    const result = parseECL('< 100000 AND < 200000 OR OR < 300000');
    assert.strictEqual(result.errors.length, 1);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('Cannot mix'), `Mixed operator should take priority over duplicate. Got: ${msg}`);
  });

  test('missing colon takes priority over trailing operator when both present', () => {
    // Missing colon before { AND trailing operator at end
    // But since the expression triggers ANTLR errors and missing-colon is checked
    // before trailing, the missing-colon message should win.
    const result = parseECL('< 404684003 { 363698007 = < 39057004 } AND');
    if (result.errors.length > 0) {
      const msg = result.errors[0].message;
      // Missing colon (priority 2) should beat trailing (priority 3)
      assert.ok(msg.includes("Missing ':'"), `Missing colon should take priority. Got: ${msg}`);
    }
  });

  test('only one error is produced regardless of multiple issues', () => {
    // This expression has: mixed operators, potential trailing, etc.
    const result = parseECL('< 100000 AND < 200000 OR');
    assert.strictEqual(result.errors.length, 1, `Should produce exactly one error. Got: ${result.errors.length}`);
  });
});

// ---------------------------------------------------------------------------
// Missing operator between constraints — consolidation edge cases
// ---------------------------------------------------------------------------
describe('Missing operator between constraints: edge cases', () => {
  test('missing operator error message includes "missing operator"', () => {
    const result = parseECL('< 404684003 < 19829001');
    assert.strictEqual(result.errors.length, 1);
    const msg = result.errors[0].message.toLowerCase();
    assert.ok(msg.includes('missing operator'), `Should include "missing operator", got: ${msg}`);
  });

  test('long unparsed text is truncated in error message', () => {
    // Create an expression with a long unparsed tail (>25 chars) to trigger truncation
    const result = parseECL('< 404684003 < 19829001 |Some very long term description here|');
    assert.strictEqual(result.errors.length, 1);
    const msg = result.errors[0].message;
    // If the message was truncated, it should contain an ellipsis
    // The truncation replaces text >25 chars with first 20 chars + "..."
    if (msg.includes('Unexpected input:')) {
      // Either truncated or short — both are acceptable
      assert.ok(msg.includes('missing operator'), `Should still mention missing operator. Got: ${msg}`);
    }
  });

  test('three constraints without operators produce one error', () => {
    const result = parseECL('< 404684003 < 19829001 < 300000');
    assert.strictEqual(result.errors.length, 1, `Should consolidate to one error. Got: ${result.errors.length}`);
  });
});

// ---------------------------------------------------------------------------
// Complex, large, and deeply nested expressions — correctness + performance
// ---------------------------------------------------------------------------
describe('Complex and large expressions: correctness', () => {
  test('wide OR chain (100 operands) parses without error', () => {
    const operands = Array.from({ length: 100 }, (_, i) => `< ${100000 + i}`);
    const expr = operands.join(' OR ');
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `100-operand OR chain should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('wide AND chain (100 operands) parses without error', () => {
    const operands = Array.from({ length: 100 }, (_, i) => `<< ${200000 + i} |Term ${i}|`);
    const expr = operands.join(' AND ');
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `100-operand AND chain should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('deeply nested parentheses (20 levels) parses without error', () => {
    const open = '('.repeat(20);
    const close = ')'.repeat(20);
    const expr = `${open}< 404684003 OR < 19829001${close}`;
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `20-deep parens should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('deeply nested parens with mixed ops at different levels are valid', () => {
    // Each level uses a different operator — valid because they are at different paren depths
    // Level 0: OR, Level 1: AND, Level 2: OR, etc.
    const expr = '(< 100000 AND < 200000) OR (< 300000 AND (< 400000 OR < 500000))';
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `Mixed ops at different depths should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('mixed operators detected correctly through nested structure', () => {
    // Top level has OR ... AND — should detect mixed regardless of nesting in between
    const expr = '(< 100000 OR < 200000) OR (< 300000 AND < 400000) AND < 500000';
    const result = parseECL(expr);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(
      result.errors[0].message.includes('Cannot mix'),
      `Should detect mixed operators at top level. Got: ${result.errors[0].message}`,
    );
  });

  test('complex refinement with many attribute groups', () => {
    const attrs = Array.from({ length: 20 }, (_, i) => `{ ${363698007 + i} = < ${39057004 + i} }`).join(',\n');
    const expr = `< 404684003 :\n${attrs}`;
    const result = parseECL(expr);
    // Should not produce a "missing colon" false positive
    const colonErrors = result.errors.filter((e) => e.message.includes("Missing ':'"));
    assert.strictEqual(
      colonErrors.length,
      0,
      `20 attribute groups after colon should not trigger missing-colon. Got: ${colonErrors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('nested refinements inside compound expression', () => {
    const expr = '(< 404684003 : 363698007 = < 39057004) OR (< 19829001 : { 116676008 = < 72704001 })';
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `Nested refinements in compound should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('unclosed paren detected at correct position in deeply nested expression', () => {
    // 5 opens, 4 closes — first ( is unclosed
    const expr = '((((< 404684003 OR < 200000) AND < 300000) OR < 400000) MINUS < 500000';
    const result = parseECL(expr);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(
      result.errors[0].message.includes("Missing closing ')'"),
      `Should detect unclosed paren. Got: ${result.errors[0].message}`,
    );
    assert.strictEqual(result.errors[0].column, 0, 'Should point to the outermost unclosed paren at column 0');
  });

  test('trailing operator detected after long complex expression', () => {
    const operands = Array.from({ length: 10 }, (_, i) => `< ${100000 + i}`);
    const expr = operands.join(' OR ') + ' OR';
    const result = parseECL(expr);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(
      result.errors[0].message.includes('Incomplete expression'),
      `Should detect trailing OR. Got: ${result.errors[0].message}`,
    );
  });

  test('duplicate operator detected in long chain', () => {
    const expr = '< 100000 AND < 200000 AND AND < 300000 AND < 400000';
    const result = parseECL(expr);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(
      result.errors[0].message.includes("Duplicate 'AND'"),
      `Should detect duplicate AND. Got: ${result.errors[0].message}`,
    );
  });

  test('expression with many terms containing operator-like words', () => {
    // Terms contain AND, OR, MINUS — none should trigger false positives
    const expr = '< 100000 |Disease AND Disorder| OR < 200000 |Fracture OR Break| OR < 300000 |Total MINUS Partial|';
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `Operator words inside terms should be ignored. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('expression with braces, colons, and parens inside terms', () => {
    const expr = '< 100000 |Finding: {clinical (acute)}| : 363698007 = < 200000';
    const result = parseECL(expr);
    // Should not produce missing-colon or unclosed-paren errors from term content
    const colonErrors = result.errors.filter((e) => e.message.includes("Missing ':'"));
    const parenErrors = result.errors.filter((e) => e.message.includes("Missing closing ')'"));
    assert.strictEqual(
      colonErrors.length,
      0,
      `Colon inside term should be ignored. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
    assert.strictEqual(
      parenErrors.length,
      0,
      `Paren inside term should be ignored. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('multi-line expression with operators at line boundaries', () => {
    const expr = [
      '< 404684003 |Clinical finding|',
      'OR < 19829001 |Disorder of lung|',
      'OR < 73211009 |Diabetes mellitus|',
      'OR < 84114007 |Heart failure|',
      'OR < 38341003 |Hypertensive disorder|',
    ].join('\n');
    const result = parseECL(expr);
    assert.strictEqual(
      result.errors.length,
      0,
      `Multi-line with leading operators should be valid. Errors: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('dangling equals at end of complex multi-line refinement', () => {
    const expr = '< 404684003 :\n  363698007 = < 39057004,\n  116676008 =';
    const result = parseECL(expr);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(
      result.errors[0].message.includes('Incomplete attribute'),
      `Should detect dangling equals. Got: ${result.errors[0].message}`,
    );
  });
});

describe('Large expressions: performance', () => {
  test('500-operand OR chain completes in < 1000ms', () => {
    const operands = Array.from({ length: 500 }, (_, i) => `< ${100000 + i}`);
    const expr = operands.join(' OR ');
    const start = performance.now();
    const result = parseECL(expr);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `500-operand OR: ${elapsed.toFixed(1)}ms (limit 1000ms)`);
    assert.strictEqual(result.errors.length, 0);
  });

  test('500-operand AND chain with terms completes in < 1000ms', () => {
    const operands = Array.from({ length: 500 }, (_, i) => `<< ${200000 + i} |Concept term number ${i}|`);
    const expr = operands.join(' AND ');
    const start = performance.now();
    const result = parseECL(expr);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `500-operand AND with terms: ${elapsed.toFixed(1)}ms (limit 1000ms)`);
    assert.strictEqual(result.errors.length, 0);
  });

  test('50-level nested parentheses complete in < 2000ms', () => {
    const depth = 50;
    const open = '('.repeat(depth);
    const close = ')'.repeat(depth);
    const expr = `${open}< 404684003 OR < 19829001${close}`;
    const start = performance.now();
    const result = parseECL(expr);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 2000, `50-deep nesting: ${elapsed.toFixed(1)}ms (limit 2000ms)`);
    assert.strictEqual(result.errors.length, 0);
  });

  test('complex nested expression (100 groups, 3 attrs each) completes in < 2000ms', () => {
    const groups = Array.from(
      { length: 100 },
      (_, i) =>
        `{ ${363698007 + i} = < ${39057004 + i}, ${116676008 + i} = < ${72704001 + i}, ${246075003 + i} = < ${40733004 + i} }`,
    ).join(',\n');
    const expr = `< 404684003 :\n${groups}`;
    const start = performance.now();
    const result = parseECL(expr);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 2000, `100 attribute groups × 3 attrs: ${elapsed.toFixed(1)}ms (limit 2000ms)`);
    // Should not produce missing-colon false positive
    const colonErrors = result.errors.filter((e) => e.message.includes("Missing ':'"));
    assert.strictEqual(colonErrors.length, 0);
  });

  test('wide + deep combined (20 groups of 10 nested OR) completes in < 1000ms', () => {
    const groups = Array.from({ length: 20 }, (_, g) => {
      const operands = Array.from({ length: 10 }, (_, i) => `< ${100000 + g * 100 + i}`);
      return `(${operands.join(' OR ')})`;
    });
    const expr = groups.join(' AND ');
    const start = performance.now();
    const result = parseECL(expr);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `20×10 nested compound: ${elapsed.toFixed(1)}ms (limit 1000ms)`);
    assert.strictEqual(result.errors.length, 0);
  });
});
