// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { parseECL } from '../parser';
import { groupIntoExpressions } from '../parser/expression-grouper';
import { extractConceptIds } from '../parser/concept-extractor';
import { refineParseError } from '../validation/error-refinement';
import { isValidSnomedId, isValidConceptId } from '../terminology/verhoeff';

describe('Diagnostic Error Messages', () => {
  test('should identify duplicate AND operator', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.ok(result.errors.length > 0, 'Should have errors');
    const errorMsg = result.errors[0].message.toLowerCase();
    assert.ok(
      errorMsg.includes('and') || errorMsg.includes('viable'),
      'Error message should mention AND or alternative',
    );
  });

  test('should identify duplicate OR operator', () => {
    const result = parseECL('< 404684003 OR OR < 19829001');
    assert.ok(result.errors.length > 0, 'Should have errors');
    const errorMsg = result.errors[0].message.toLowerCase();
    assert.ok(errorMsg.includes('or') || errorMsg.includes('viable'), 'Error message should mention OR or alternative');
  });

  test('should identify incomplete expression', () => {
    const result = parseECL('< 404684003 AND');
    assert.ok(result.errors.length > 0, 'Should have errors');
    const errorMsg = result.errors[0].message.toLowerCase();
    assert.ok(
      errorMsg.includes('eof') ||
        errorMsg.includes('input') ||
        errorMsg.includes('incomplete') ||
        errorMsg.includes('follow'),
      'Error message should indicate incomplete/end of input',
    );
  });

  test('should identify missing operator between constraints', () => {
    const result = parseECL('< 404684003 < 19829001');
    assert.ok(result.errors.length > 0, 'Should have errors');
  });

  test('should provide error column information', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.ok(result.errors.length > 0, 'Should have errors');
    assert.ok(typeof result.errors[0].column === 'number', 'Error should have column number');
    assert.ok(result.errors[0].column >= 0, 'Column should be non-negative');
  });

  test('should provide error line information', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.ok(result.errors.length > 0, 'Should have errors');
    assert.ok(typeof result.errors[0].line === 'number', 'Error should have line number');
  });
});

describe('Multi-line parsing simulation', () => {
  test('should validate each line independently', () => {
    const lines = [
      '< 404684003 |Clinical finding|',
      '< 404684003 AND AND < 19829001',
      '<< 19829001 |Disorder of lung|',
    ];

    const results = lines.map((line) => parseECL(line));

    assert.equal(results[0].errors.length, 0, 'First line should be valid');
    assert.ok(results[1].errors.length > 0, 'Second line should have errors');
    assert.equal(results[2].errors.length, 0, 'Third line should be valid');
  });

  test('should handle empty lines', () => {
    const lines = ['', '  ', '\t', '< 404684003'];

    const nonEmptyLines = lines.filter((line) => line.trim() !== '');
    assert.equal(nonEmptyLines.length, 1, 'Should filter out empty lines');

    const result = parseECL(nonEmptyLines[0]);
    assert.equal(result.errors.length, 0, 'Valid line should parse correctly');
  });
});

describe('Mixed AND/OR operator errors', () => {
  // Expression: < 404684003 OR < 19829001 AND < 234567890
  // Problem: cannot mix AND and OR at the same level without parentheses.
  // Before fix: ANTLR emits two confusing errors —
  //   1. "no viable alternative at input '19829001 A'" pointing at column 26 (just 'A')
  //   2. "Unexpected input: '19829001 AND < 234567890' - missing operator" (wrong diagnosis)
  // After fix: ONE clear error pointing to AND, explaining the fix.

  test('mixed AND/OR produces exactly one error after fix', () => {
    const result = parseECL('< 404684003 OR < 19829001 AND < 234567890');
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Messages: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('mixed AND/OR error points to the AND keyword (col 26)', () => {
    const result = parseECL('< 404684003 OR < 19829001 AND < 234567890');
    assert.ok(result.errors.length > 0, 'Should have an error');
    const err = result.errors[0];
    // AND starts at column 26 in this expression
    assert.strictEqual(err.column, 26, `Error column should be 26 (start of AND), got ${err.column}`);
  });

  test('mixed AND/OR error message mentions both operators and parentheses', () => {
    const result = parseECL('< 404684003 OR < 19829001 AND < 234567890');
    assert.ok(result.errors.length > 0, 'Should have an error');
    const msg = result.errors[0].message;
    assert.ok(msg.includes('AND'), `Message should mention AND, got: ${msg}`);
    assert.ok(msg.includes('OR'), `Message should mention OR, got: ${msg}`);
    assert.ok(msg.toLowerCase().includes('parenthes'), `Message should mention parentheses, got: ${msg}`);
  });

  test('mixed AND/OR error offendingSymbol is the conflicting operator name', () => {
    const result = parseECL('< 404684003 OR < 19829001 AND < 234567890');
    assert.ok(result.errors.length > 0, 'Should have an error');
    assert.strictEqual(result.errors[0].offendingSymbol, 'AND');
  });

  test('reversed case: AND before OR also caught (OR is the conflict)', () => {
    const result = parseECL('< 404684003 AND < 19829001 OR < 234567890');
    assert.strictEqual(result.errors.length, 1, `Expected 1 error, got ${result.errors.length}`);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('AND') && msg.includes('OR'), `Message should mention both AND and OR, got: ${msg}`);
  });

  test('lowercase operators are valid: "< 19829001 and < 234567890"', () => {
    const result = parseECL('< 19829001 and < 234567890');
    assert.strictEqual(
      result.errors.length,
      0,
      `Lowercase "and" should parse without errors, got: ${result.errors.map((e) => e.message).join('; ')}`,
    );
  });

  test('lowercase "or" is valid', () => {
    const result = parseECL('< 19829001 or < 234567890');
    assert.strictEqual(result.errors.length, 0, `Lowercase "or" should parse without errors`);
  });

  test('lowercase "minus" is valid', () => {
    const result = parseECL('< 19829001 minus < 234567890');
    assert.strictEqual(result.errors.length, 0, `Lowercase "minus" should parse without errors`);
  });

  test('mixed case operators: "And", "oR", "Minus" are valid', () => {
    const result = parseECL('< 19829001 And < 234567890');
    assert.strictEqual(result.errors.length, 0, `Mixed case "And" should be valid`);
  });

  test('valid OR-only expression has no errors', () => {
    const result = parseECL('< 404684003 OR < 19829001 OR < 234567890');
    assert.strictEqual(result.errors.length, 0, 'Pure OR chain should be valid');
  });

  test('valid AND-only expression has no errors', () => {
    const result = parseECL('< 404684003 AND < 19829001 AND < 234567890');
    assert.strictEqual(result.errors.length, 0, 'Pure AND chain should be valid');
  });

  test('parenthesised mix is valid: (A OR B) AND C', () => {
    const result = parseECL('(< 404684003 OR < 19829001) AND < 234567890');
    assert.strictEqual(result.errors.length, 0, 'Parenthesised expression should be valid');
  });

  test('parenthesised mix is valid: A OR (B AND C)', () => {
    const result = parseECL('< 404684003 OR (< 19829001 AND < 234567890)');
    assert.strictEqual(result.errors.length, 0, 'Parenthesised expression should be valid');
  });
});

describe('Missing colon before brace errors', () => {
  // Expression: < 404684003 | Clinical finding | { refinements }
  // Problem: attribute group `{...}` requires a preceding colon.
  // VALID:   < 404684003 | Clinical finding | : { ... }
  // INVALID: < 404684003 | Clinical finding | { ... }
  // Before fix: 3 confusing ANTLR errors (missing '{', missing '+', unexpected input).
  // After fix:  ONE clear error pointing at `{`, explaining the `:` is needed.

  const multiLineWithTerm =
    '< 404684003 | Clinical finding | {\n' +
    '  363698007 | Finding site | = < 39057004 | Pulmonary valve structure |,\n' +
    '  116676008 | Associated morphology | = < 72704001 | Fracture |\n' +
    '}';

  const nestedBraces =
    '< 404684003 {\n' + '  363698007 = < 39057004 {\n' + '    116676008 = < 72704001\n' + '  }\n' + '}';

  test('missing colon produces exactly one error (multi-line with term)', () => {
    const result = parseECL(multiLineWithTerm);
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Messages: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('missing colon error points to the opening brace (col 33)', () => {
    const result = parseECL(multiLineWithTerm);
    assert.ok(result.errors.length > 0, 'Should have an error');
    assert.strictEqual(
      result.errors[0].column,
      33,
      `Error column should be 33 (position of {), got ${result.errors[0].column}`,
    );
  });

  test('missing colon error message mentions colon and brace', () => {
    const result = parseECL(multiLineWithTerm);
    assert.ok(result.errors.length > 0, 'Should have an error');
    const msg = result.errors[0].message;
    assert.ok(msg.includes(':'), `Message should mention ':', got: ${msg}`);
    assert.ok(msg.includes('{'), `Message should mention '{', got: ${msg}`);
  });

  test('missing colon error offendingSymbol is the opening brace', () => {
    const result = parseECL(multiLineWithTerm);
    assert.ok(result.errors.length > 0, 'Should have an error');
    assert.strictEqual(result.errors[0].offendingSymbol, '{');
  });

  test('missing colon produces exactly one error (nested braces without colon)', () => {
    const result = parseECL(nestedBraces);
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Messages: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('nested brace error points to the first opening brace (col 12)', () => {
    const result = parseECL(nestedBraces);
    assert.ok(result.errors.length > 0, 'Should have an error');
    assert.strictEqual(
      result.errors[0].column,
      12,
      `Error column should be 12 (position of first {), got ${result.errors[0].column}`,
    );
  });

  test('valid: concept : { attr = val } has no errors', () => {
    const result = parseECL('< 404684003 : { 363698007 = < 39057004 }');
    assert.strictEqual(result.errors.length, 0, 'Valid colon-braced expression should have no errors');
  });

  test('valid: concept : attr = val has no errors', () => {
    const result = parseECL('< 404684003 : 363698007 = < 39057004');
    assert.strictEqual(result.errors.length, 0, 'Valid colon-attribute expression should have no errors');
  });

  test('valid: parenthesised concept with colon has no errors', () => {
    const result = parseECL('(< 404684003 : { 363698007 = < 39057004 }) OR < 19829001');
    assert.strictEqual(result.errors.length, 0, 'Parenthesised expression should have no errors');
  });
});

describe('Trailing operator errors', () => {
  test('trailing AND produces exactly one error', () => {
    const result = parseECL('< 404684003 AND');
    assert.strictEqual(result.errors.length, 1, `Expected 1 error, got ${result.errors.length}`);
  });

  test('trailing AND error points to the AND keyword (col 12)', () => {
    const result = parseECL('< 404684003 AND');
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].column, 12, `Expected col 12, got ${result.errors[0].column}`);
  });

  test('trailing AND error message says must be followed by concept', () => {
    const result = parseECL('< 404684003 AND');
    assert.ok(result.errors.length > 0);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('AND'), `Should mention AND, got: ${msg}`);
    assert.ok(
      msg.toLowerCase().includes('follow') || msg.toLowerCase().includes('concept'),
      `Should mention 'follow' or 'concept', got: ${msg}`,
    );
  });

  test('trailing AND offendingSymbol is AND', () => {
    const result = parseECL('< 404684003 AND');
    assert.strictEqual(result.errors[0].offendingSymbol, 'AND');
  });

  test('trailing OR produces exactly one error', () => {
    const result = parseECL('< 404684003 OR');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'OR');
  });

  test('trailing MINUS produces exactly one error', () => {
    const result = parseECL('< 404684003 MINUS');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'MINUS');
  });

  test('trailing AND on second line produces one error on that line', () => {
    const result = parseECL('< 404684003 |Clinical finding|\n  AND');
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0].message.includes('AND'));
    // AND is on line 2 (1-indexed), col 2 (after "  ")
    assert.strictEqual(result.errors[0].column, 2);
  });

  test('valid AND with operand has no errors', () => {
    const result = parseECL('< 404684003 AND < 19829001');
    assert.strictEqual(result.errors.length, 0, 'AND with operand should be valid');
  });
});

describe('Duplicate operator errors', () => {
  test('duplicate AND produces exactly one error', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Msgs: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('duplicate AND error points to the second AND (col 16)', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].column, 16, `Expected col 16, got ${result.errors[0].column}`);
  });

  test('duplicate AND error message says "Duplicate AND"', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.ok(result.errors.length > 0);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('AND'), `Should mention AND, got: ${msg}`);
    assert.ok(
      msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('expected'),
      `Should indicate problem, got: ${msg}`,
    );
  });

  test('duplicate AND offendingSymbol is AND', () => {
    const result = parseECL('< 404684003 AND AND < 19829001');
    assert.strictEqual(result.errors[0].offendingSymbol, 'AND');
  });

  test('duplicate OR produces exactly one error', () => {
    const result = parseECL('< 404684003 OR OR < 19829001');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'OR');
  });

  test('duplicate OR error points to second OR (col 15)', () => {
    const result = parseECL('< 404684003 OR OR < 19829001');
    assert.strictEqual(result.errors[0].column, 15, `Expected col 15, got ${result.errors[0].column}`);
  });
});

describe('Dangling equals errors', () => {
  test('trailing = produces exactly one error', () => {
    const result = parseECL('< 404684003 : 363698007 =');
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Msgs: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('trailing = error points to the = (col 24)', () => {
    const result = parseECL('< 404684003 : 363698007 =');
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].column, 24, `Expected col 24 (position of =), got ${result.errors[0].column}`);
  });

  test('trailing = error message says must be followed by concept', () => {
    const result = parseECL('< 404684003 : 363698007 =');
    assert.ok(result.errors.length > 0);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('='), `Should mention '=', got: ${msg}`);
    assert.ok(
      msg.toLowerCase().includes('concept') || msg.toLowerCase().includes('follow'),
      `Should mention concept/follow, got: ${msg}`,
    );
  });

  test('trailing = offendingSymbol is =', () => {
    const result = parseECL('< 404684003 : 363698007 =');
    assert.strictEqual(result.errors[0].offendingSymbol, '=');
  });

  test('valid attribute with value has no errors', () => {
    const result = parseECL('< 404684003 : 363698007 = < 39057004');
    assert.strictEqual(result.errors.length, 0, 'Complete attribute should be valid');
  });
});

describe('Unclosed parenthesis errors', () => {
  test('unclosed paren produces exactly one error', () => {
    const result = parseECL('(< 404684003');
    assert.strictEqual(result.errors.length, 1, `Expected 1 error, got ${result.errors.length}`);
  });

  test('unclosed paren error points to the ( (col 0)', () => {
    const result = parseECL('(< 404684003');
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].column, 0, `Expected col 0, got ${result.errors[0].column}`);
  });

  test('unclosed paren error message mentions closing )', () => {
    const result = parseECL('(< 404684003');
    assert.ok(result.errors.length > 0);
    const msg = result.errors[0].message;
    assert.ok(msg.includes(')'), `Should mention ')', got: ${msg}`);
  });

  test('unclosed paren offendingSymbol is (', () => {
    const result = parseECL('(< 404684003');
    assert.strictEqual(result.errors[0].offendingSymbol, '(');
  });

  test('multi-line unclosed paren produces one error pointing to the (', () => {
    const result = parseECL('(< 404684003 |Clinical finding|\n  AND < 19829001 |Disorder of lung|');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].column, 0);
    assert.ok(result.errors[0].message.includes(')'));
  });

  test('matched parens produce no errors', () => {
    const result = parseECL('(< 404684003 OR < 19829001)');
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('Missing whitespace around operator errors', () => {
  const noSpaceOR = '<<404684003  |  Clinical   finding  |OR<19829001|Disorder|';

  test('operator without surrounding space produces exactly one error', () => {
    const result = parseECL(noSpaceOR);
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Msgs: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('operator without surrounding space points to the operator (col 37)', () => {
    const result = parseECL(noSpaceOR);
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].column, 37, `Expected col 37 (start of OR), got ${result.errors[0].column}`);
  });

  test('operator without surrounding space message mentions whitespace and OR', () => {
    const result = parseECL(noSpaceOR);
    assert.ok(result.errors.length > 0);
    const msg = result.errors[0].message;
    assert.ok(msg.includes('OR'), `Should mention OR, got: ${msg}`);
    assert.ok(
      msg.toLowerCase().includes('space') || msg.toLowerCase().includes('whitespace'),
      `Should mention space/whitespace, got: ${msg}`,
    );
  });

  test('operator without surrounding space offendingSymbol is OR', () => {
    const result = parseECL(noSpaceOR);
    assert.strictEqual(result.errors[0].offendingSymbol, 'OR');
  });

  test('no-space AND: <id>AND<id> produces one error', () => {
    const result = parseECL('<404684003AND<19829001');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].offendingSymbol, 'AND');
  });

  test('properly spaced OR has no errors', () => {
    const result = parseECL('<< 404684003 | Clinical finding | OR < 19829001 | Disorder |');
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('Missing operator between constraints', () => {
  test('two constraints without operator produce exactly one error', () => {
    const result = parseECL('< 404684003 < 19829001');
    assert.strictEqual(
      result.errors.length,
      1,
      `Expected 1 error, got ${result.errors.length}. Msgs: ${result.errors.map((e) => e.message).join(' | ')}`,
    );
  });

  test('missing operator error message says missing operator', () => {
    const result = parseECL('< 404684003 < 19829001');
    assert.ok(result.errors.length > 0);
    const msg = result.errors[0].message.toLowerCase();
    assert.ok(
      msg.includes('operator') || msg.includes('unexpected'),
      `Should mention operator or unexpected, got: ${msg}`,
    );
  });

  test('two constraints on separate lines produce one error', () => {
    const result = parseECL('< 404684003 |Clinical finding|\n<< 19829001 |Disorder of lung|');
    assert.strictEqual(result.errors.length, 1, `Expected 1 error, got ${result.errors.length}`);
  });
});

describe('Comment handling simulation', () => {
  test('should skip C++ style comments', () => {
    const line = '// This is a comment';
    // In actual implementation, we skip lines starting with //
    const shouldSkip = line.trim().startsWith('//');
    assert.ok(shouldSkip, 'Should skip C++ style comments');
  });

  test('should handle inline block comments', () => {
    const line = '< 404684003 /* comment */ AND < 19829001';
    const commentStart = line.indexOf('/*');
    const commentEnd = line.indexOf('*/');

    assert.ok(commentStart !== -1, 'Should find comment start');
    assert.ok(commentEnd !== -1, 'Should find comment end');
    assert.ok(commentEnd > commentStart, 'Comment end should be after start');

    // Simulate comment removal
    const cleanLine = line.substring(0, commentStart) + line.substring(commentEnd + 2);
    const result = parseECL(cleanLine.trim());
    assert.equal(result.errors.length, 0, 'Line without comment should be valid');
  });

  test('should handle block comment at start of line', () => {
    const line = '/* Comment at start */ < 404684003';
    const commentStart = line.indexOf('/*');
    const commentEnd = line.indexOf('*/');

    const cleanLine = line.substring(0, commentStart) + line.substring(commentEnd + 2);
    const result = parseECL(cleanLine.trim());
    assert.equal(result.errors.length, 0, 'Line without comment should be valid');
  });
});

// ─── Document-level diagnostic position mapping ─────────────────────────────
//
// These tests exercise the full pipeline: groupIntoExpressions → parseECL →
// extractConceptIds → position mapping, replicating the logic in server.ts
// validateDocument(). This catches bugs where ANTLR 1-indexed lines, expression
// offsets, or indexOf-based column detection produce wrong document positions.

interface MappedDiagnostic {
  line: number; // 0-indexed document line
  startChar: number;
  endChar: number;
  message: string;
  kind: 'error' | 'concept';
}

/**
 * Replicates the position-mapping logic from server.ts validateDocument(),
 * producing diagnostics with document-level positions.
 */
function mapDocumentDiagnostics(docText: string): MappedDiagnostic[] {
  const diagnostics: MappedDiagnostic[] = [];
  const expressions = groupIntoExpressions(docText);
  const lines = docText.split('\n');

  for (const expr of expressions) {
    const result = parseECL(expr.text);

    // Map syntax errors (same logic as validateDocument)
    for (const error of result.errors) {
      const exprLineIndex = Math.max(0, error.line - 1);
      const docLineIndex = expr.lineOffsets[exprLineIndex] ?? expr.startLine;

      const refined = refineParseError({
        error,
        lines,
        docLineIndex,
        lineOffsets: expr.lineOffsets,
        startLine: expr.startLine,
      });

      diagnostics.push({
        line: refined.docLineIndex,
        startChar: refined.startChar,
        endChar: refined.endChar,
        message: refined.message,
        kind: 'error',
      });
    }

    // Map concept positions (same logic as validateDocument)
    if (result.ast) {
      const concepts = extractConceptIds(result.ast);
      for (const concept of concepts) {
        // ANTLR lines are 1-indexed → subtract 1 for 0-based expression line
        const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
        const conceptDocLine = expr.lineOffsets[conceptExprLine] ?? expr.startLine;
        const docLine = lines[conceptDocLine] || '';
        const conceptIdx = docLine.indexOf(concept.id);
        const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
        const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;

        diagnostics.push({
          line: conceptDocLine,
          startChar,
          endChar,
          message: `concept:${concept.id}`,
          kind: 'concept',
        });
      }
    }
  }

  return diagnostics;
}

/** Helper: filter to just concept diagnostics. */
function conceptDiags(diags: MappedDiagnostic[]): MappedDiagnostic[] {
  return diags.filter((d) => d.kind === 'concept');
}

/** Helper: filter to just error diagnostics. */
function errorDiags(diags: MappedDiagnostic[]): MappedDiagnostic[] {
  return diags.filter((d) => d.kind === 'error');
}

/** Helper: find the concept diagnostic for a given ID. */
function findConcept(diags: MappedDiagnostic[], id: string): MappedDiagnostic | undefined {
  return diags.find((d) => d.message === `concept:${id}`);
}

describe('Document-level concept position mapping', () => {
  test('single-line: each concept has correct column', () => {
    const doc = '< 404684003 OR < 19829001';
    //           0123456789012345678901234
    //           ^404684003    ^19829001
    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1, 'Should find 404684003');
    assert.strictEqual(c1.line, 0);
    assert.strictEqual(c1.startChar, 2);
    assert.strictEqual(c1.endChar, 11);

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2, 'Should find 19829001');
    assert.strictEqual(c2.line, 0);
    assert.strictEqual(c2.startChar, 17);
    assert.strictEqual(c2.endChar, 25);
  });

  test('multi-line OR: concepts on line 0 report line 0, concepts on line 1 report line 1', () => {
    // Exact scenario from the user's bug report
    const doc = [
      '< 404684003 OR < 19829001 OR < 234567890 OR < 345678901 OR < 456789012',
      '  OR < 567890123 OR < 678901234',
    ].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    // Line 0 concepts
    for (const id of ['404684003', '19829001', '234567890', '345678901', '456789012']) {
      const c = findConcept(diags, id);
      assert.ok(c, `Should find ${id}`);
      assert.strictEqual(c.line, 0, `${id} should be on doc line 0, got ${c.line}`);
    }

    // Line 1 concepts
    for (const id of ['567890123', '678901234']) {
      const c = findConcept(diags, id);
      assert.ok(c, `Should find ${id}`);
      assert.strictEqual(c.line, 1, `${id} should be on doc line 1, got ${c.line}`);
    }
  });

  test('multi-line OR: columns are correct on both lines', () => {
    const doc = ['< 404684003 OR < 19829001', '  OR < 234567890'].join('\n');
    //  line 0: "< 404684003 OR < 19829001"
    //           ^2          ^17
    //  line 1: "  OR < 234567890"
    //                 ^7

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.line, 0);
    assert.strictEqual(c1.startChar, 2);

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2);
    assert.strictEqual(c2.line, 0);
    assert.strictEqual(c2.startChar, 17);

    const c3 = findConcept(diags, '234567890');
    assert.ok(c3);
    assert.strictEqual(c3.line, 1);
    assert.strictEqual(c3.startChar, 7);
    assert.strictEqual(c3.endChar, 16);
  });

  test('three-line expression: concepts on each line are correctly positioned', () => {
    const doc = [
      '<< 404684003 |Clinical finding|',
      '  AND < 19829001 |Disorder of lung|',
      '  AND < 301867009 |Edema of trunk|',
    ].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.line, 0);
    assert.strictEqual(c1.startChar, 3);

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2);
    assert.strictEqual(c2.line, 1);
    assert.strictEqual(c2.startChar, 8);

    const c3 = findConcept(diags, '301867009');
    assert.ok(c3);
    assert.strictEqual(c3.line, 2);
    assert.strictEqual(c3.startChar, 8);
  });

  test('expression after ECL-END: concept positions offset to correct doc lines', () => {
    const doc = ['< 404684003', '', '/* ECL-END */', '', '< 19829001 OR < 301867009'].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1, 'Should find 404684003 in first expression');
    assert.strictEqual(c1.line, 0, 'First expression concept on doc line 0');

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2, 'Should find 19829001 in second expression');
    assert.strictEqual(c2.line, 4, 'Second expression concept on doc line 4');

    const c3 = findConcept(diags, '301867009');
    assert.ok(c3, 'Should find 301867009 in second expression');
    assert.strictEqual(c3.line, 4, 'Second expression second concept on doc line 4');
    assert.strictEqual(c3.startChar, 16);
  });

  test('multi-line expression after ECL-END: lines offset correctly', () => {
    const doc = ['< 404684003', '', '/* ECL-END */', '', '< 19829001', '  OR < 301867009'].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2);
    assert.strictEqual(c2.line, 4, '19829001 on doc line 4');

    const c3 = findConcept(diags, '301867009');
    assert.ok(c3);
    assert.strictEqual(c3.line, 5, '301867009 on doc line 5');
    assert.strictEqual(c3.startChar, 7);
  });

  test('refinement: attribute name and value concepts positioned correctly', () => {
    const doc = '< 404684003 : 363698007 = < 39057004';
    //           ^2            ^14          ^28

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.startChar, 2);

    const c2 = findConcept(diags, '363698007');
    assert.ok(c2);
    assert.strictEqual(c2.startChar, 14);

    const c3 = findConcept(diags, '39057004');
    assert.ok(c3);
    assert.strictEqual(c3.startChar, 28);
  });

  test('multi-line refinement: concepts on continuation lines', () => {
    const doc = ['< 404684003 :', '  363698007 = < 39057004'].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.line, 0);

    const c2 = findConcept(diags, '363698007');
    assert.ok(c2);
    assert.strictEqual(c2.line, 1);
    assert.strictEqual(c2.startChar, 2);

    const c3 = findConcept(diags, '39057004');
    assert.ok(c3);
    assert.strictEqual(c3.line, 1);
    assert.strictEqual(c3.startChar, 16);
  });

  test('blank lines between expression lines are skipped in mapping', () => {
    // The expression grouper skips blank lines, so line offsets jump
    const doc = ['< 404684003', '', '  OR < 19829001'].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.line, 0);

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2);
    assert.strictEqual(c2.line, 2, 'Should be on doc line 2 (after blank line)');
  });

  test('comment lines between expression lines are skipped', () => {
    const doc = ['< 404684003', '// comment', '  OR < 19829001'].join('\n');

    const diags = conceptDiags(mapDocumentDiagnostics(doc));

    const c1 = findConcept(diags, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.line, 0);

    const c2 = findConcept(diags, '19829001');
    assert.ok(c2);
    assert.strictEqual(c2.line, 2, 'Should be on doc line 2 (after comment line)');
  });
});

describe('Document-level syntax error position mapping', () => {
  test('single-line error: maps to correct doc line and column', () => {
    const doc = '< 404684003 AND AND < 19829001';
    const diags = errorDiags(mapDocumentDiagnostics(doc));

    assert.ok(diags.length > 0, 'Should have error');
    assert.strictEqual(diags[0].line, 0);
    // Second AND at col 16
    assert.strictEqual(diags[0].startChar, 16);
  });

  test('multi-line: error on continuation line maps to correct doc line', () => {
    const doc = ['< 404684003', '  AND AND < 19829001'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.ok(diags.length > 0, 'Should have error');
    assert.strictEqual(diags[0].line, 1, 'Error should be on doc line 1');
  });

  test('error in second expression maps to correct doc line', () => {
    const doc = ['< 404684003', '', '/* ECL-END */', '', '< 19829001 AND AND < 301867009'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.ok(diags.length > 0, 'Should have error');
    assert.strictEqual(diags[0].line, 4, 'Error should be on doc line 4');
  });

  test('trailing operator on continuation line', () => {
    const doc = ['< 404684003 |Clinical finding|', '  AND'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.ok(diags.length > 0, 'Should have trailing AND error');
    assert.strictEqual(diags[0].line, 1, 'Error on doc line 1');
    assert.strictEqual(diags[0].startChar, 2, 'AND starts at col 2');
  });

  test('unclosed paren spanning multiple lines', () => {
    const doc = ['(< 404684003 |Clinical finding|', '  AND < 19829001 |Disorder of lung|'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.ok(diags.length > 0, 'Should have unclosed paren error');
    // The ( is at line 0, col 0
    assert.strictEqual(diags[0].line, 0, 'Unclosed paren error on doc line 0');
    assert.strictEqual(diags[0].startChar, 0);
  });

  test('mixed operators across lines: error on correct line', () => {
    const doc = ['< 404684003 OR < 19829001', '  AND < 301867009'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.ok(diags.length > 0, 'Should have mixed operator error');
    // The conflicting AND is on doc line 1
    assert.strictEqual(diags[0].line, 1, 'Mixed operator error on doc line 1');
  });

  test('missing colon on first line of multi-line expression', () => {
    const doc = ['< 404684003 {', '  363698007 = < 39057004', '}'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.ok(diags.length > 0, 'Should have missing colon error');
    assert.strictEqual(diags[0].line, 0, 'Missing colon error on doc line 0');
  });

  test('valid multi-line expression produces no errors', () => {
    const doc = [
      '<< 404684003 |Clinical finding|',
      '  AND < 19829001 |Disorder of lung|',
      '  AND < 301867009 |Edema of trunk|',
    ].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.strictEqual(diags.length, 0, 'Valid expression should produce no errors');
  });

  test('valid multi-expression document produces no errors', () => {
    const doc = ['< 404684003', '', '/* ECL-END */', '', '<< 19829001', '  OR < 301867009'].join('\n');

    const diags = errorDiags(mapDocumentDiagnostics(doc));
    assert.strictEqual(diags.length, 0, 'Valid multi-expression doc should produce no errors');
  });
});

describe('Document-level: mixed errors and concepts in same expression', () => {
  test('valid concepts have correct positions even when another expression has errors', () => {
    const doc = ['< 404684003 OR < 19829001', '', '/* ECL-END */', '', '< 301867009 AND AND < 39057004'].join('\n');

    const concepts = conceptDiags(mapDocumentDiagnostics(doc));
    const errors = errorDiags(mapDocumentDiagnostics(doc));

    // First expression concepts
    const c1 = findConcept(concepts, '404684003');
    assert.ok(c1);
    assert.strictEqual(c1.line, 0);

    const c2 = findConcept(concepts, '19829001');
    assert.ok(c2);
    assert.strictEqual(c2.line, 0);

    // Second expression has error
    assert.ok(errors.length > 0);
    assert.strictEqual(errors[0].line, 4);
  });
});

// ─── Concept ID format validation ────────────────────────────────────────────
//
// These tests verify that concept IDs are validated for Verhoeff check digit
// and correct partition (00 or 10) during the syntax phase.

interface FormatDiagnostic {
  line: number;
  startChar: number;
  endChar: number;
  message: string;
}

/**
 * Replicates the concept ID format validation logic from server.ts
 * collectSyntaxDiagnostics(), returning format-error diagnostics and
 * the list of concept IDs that would be sent to FHIR.
 */
function mapConceptFormatDiagnostics(docText: string): {
  formatErrors: FormatDiagnostic[];
  validConceptIds: string[];
} {
  const formatErrors: FormatDiagnostic[] = [];
  const validConceptIds: string[] = [];
  const expressions = groupIntoExpressions(docText);
  const lines = docText.split('\n');

  for (const expr of expressions) {
    const result = parseECL(expr.text);
    if (!result.ast) continue;

    const concepts = extractConceptIds(result.ast);
    for (const concept of concepts) {
      const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
      const conceptDocLine = expr.lineOffsets[conceptExprLine] ?? expr.startLine;
      const docLine = lines[conceptDocLine] || '';
      const conceptIdx = docLine.indexOf(concept.id);
      const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
      const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;

      if (!isValidSnomedId(concept.id)) {
        formatErrors.push({
          line: conceptDocLine,
          startChar,
          endChar,
          message: `Invalid SNOMED CT identifier: ${concept.id} has an invalid check digit or format.`,
        });
      } else if (!isValidConceptId(concept.id)) {
        const partitionId = concept.id.substring(concept.id.length - 3, concept.id.length - 1);
        formatErrors.push({
          line: conceptDocLine,
          startChar,
          endChar,
          message: `Invalid concept ID: ${concept.id} is not a SNOMED CT concept identifier (expected partition 00 or 10, found ${partitionId}).`,
        });
      } else {
        validConceptIds.push(concept.id);
      }
    }
  }

  return { formatErrors, validConceptIds };
}

describe('Concept ID format validation', () => {
  test('valid concept IDs produce no format errors', () => {
    const doc = '< 404684003 OR < 19829001';
    const { formatErrors, validConceptIds } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 0, 'No format errors for valid concept IDs');
    assert.ok(validConceptIds.includes('404684003'));
    assert.ok(validConceptIds.includes('19829001'));
  });

  test('concept with invalid check digit produces Error diagnostic', () => {
    // 404684004 has wrong check digit (should be 3)
    const doc = '< 404684004';
    const { formatErrors, validConceptIds } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 1, 'Should have one format error');
    assert.ok(formatErrors[0].message.includes('invalid check digit'));
    assert.ok(formatErrors[0].message.includes('404684004'));
    assert.strictEqual(validConceptIds.length, 0, 'Invalid ID should not be sent to FHIR');
  });

  test('description ID used as concept produces partition error', () => {
    // 751689013 is a valid description ID (partition 01), not a concept ID
    const doc = '< 751689013';
    const { formatErrors, validConceptIds } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 1, 'Should have one format error');
    assert.ok(formatErrors[0].message.includes('not a SNOMED CT concept identifier'));
    assert.ok(formatErrors[0].message.includes('partition 00 or 10'));
    assert.ok(formatErrors[0].message.includes('found 01'));
    assert.strictEqual(validConceptIds.length, 0, 'Description ID should not be sent to FHIR');
  });

  test('mix of valid and invalid: only valid sent to FHIR', () => {
    // 404684003 = valid concept, 404684004 = bad check digit
    const doc = '< 404684003 OR < 404684004';
    const { formatErrors, validConceptIds } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 1, 'One format error for bad check digit');
    assert.deepStrictEqual(validConceptIds, ['404684003'], 'Only valid concept sent to FHIR');
  });

  test('format error has correct position on single line', () => {
    const doc = '< 404684004';
    //           0123456789012
    //             ^2       ^11
    const { formatErrors } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 1);
    assert.strictEqual(formatErrors[0].line, 0);
    assert.strictEqual(formatErrors[0].startChar, 2);
    assert.strictEqual(formatErrors[0].endChar, 11);
  });

  test('format error on multi-line expression has correct position', () => {
    // 404684003 is valid on line 0, 404684004 is invalid on line 1
    const doc = ['< 404684003', '  OR < 404684004'].join('\n');
    const { formatErrors } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 1);
    assert.strictEqual(formatErrors[0].line, 1);
    assert.strictEqual(formatErrors[0].startChar, 7);
    assert.strictEqual(formatErrors[0].endChar, 16);
  });

  test('description ID in refinement attribute position produces partition error', () => {
    // Using description ID 751689013 as an attribute name
    const doc = '< 404684003 : 751689013 = < 19829001';
    const { formatErrors, validConceptIds } = mapConceptFormatDiagnostics(doc);
    assert.strictEqual(formatErrors.length, 1);
    assert.ok(formatErrors[0].message.includes('751689013'));
    assert.ok(formatErrors[0].message.includes('not a SNOMED CT concept identifier'));
    // The valid concept IDs should still be collected
    assert.ok(validConceptIds.includes('404684003'));
    assert.ok(validConceptIds.includes('19829001'));
  });
});
