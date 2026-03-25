// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseECL } from '../parser';
import { printAst, lastLineLength } from '../formatter/ast-printer';
import { defaultFormattingOptions } from '../formatter/options';

const opts = defaultFormattingOptions;

describe('AST Printer — Leaf Nodes and Sub-Expressions', () => {
  describe('Concept references', () => {
    test('should print bare concept ID', () => {
      const { ast } = parseECL('404684003');
      assert.strictEqual(printAst(ast, '404684003', opts), '404684003');
    });

    test('should print concept with term (normalized spacing)', () => {
      const { ast } = parseECL('404684003|Clinical finding|');
      assert.strictEqual(printAst(ast, '404684003|Clinical finding|', opts), '404684003 | Clinical finding |');
    });

    test('should normalize extra whitespace in terms', () => {
      const { ast } = parseECL('404684003 |  Clinical   finding  |');
      assert.strictEqual(printAst(ast, '404684003 |  Clinical   finding  |', opts), '404684003 | Clinical finding |');
    });
  });

  describe('Wildcard', () => {
    test('should print wildcard', () => {
      const { ast } = parseECL('*');
      assert.strictEqual(printAst(ast, '*', opts), '*');
    });
  });

  describe('Constraint operators', () => {
    test('should print descendant-or-self-of operator', () => {
      const { ast } = parseECL('<< 404684003');
      assert.strictEqual(printAst(ast, '<< 404684003', opts), '<< 404684003');
    });

    test('should print descendant-of operator', () => {
      const { ast } = parseECL('< 404684003');
      assert.strictEqual(printAst(ast, '< 404684003', opts), '< 404684003');
    });

    test('should print child-of operator', () => {
      const { ast } = parseECL('<! 404684003');
      assert.strictEqual(printAst(ast, '<! 404684003', opts), '<! 404684003');
    });

    test('should print child-or-self-of operator', () => {
      const { ast } = parseECL('<<! 404684003');
      assert.strictEqual(printAst(ast, '<<! 404684003', opts), '<<! 404684003');
    });

    test('should print ancestor-of operator', () => {
      const { ast } = parseECL('> 404684003');
      assert.strictEqual(printAst(ast, '> 404684003', opts), '> 404684003');
    });

    test('should print ancestor-or-self-of operator', () => {
      const { ast } = parseECL('>> 404684003');
      assert.strictEqual(printAst(ast, '>> 404684003', opts), '>> 404684003');
    });

    test('should print parent-of operator', () => {
      const { ast } = parseECL('>! 404684003');
      assert.strictEqual(printAst(ast, '>! 404684003', opts), '>! 404684003');
    });

    test('should print parent-or-self-of operator', () => {
      const { ast } = parseECL('>>! 404684003');
      assert.strictEqual(printAst(ast, '>>! 404684003', opts), '>>! 404684003');
    });
  });

  describe('Member-of', () => {
    test('should print member-of operator', () => {
      const { ast } = parseECL('^ 816080008');
      assert.strictEqual(printAst(ast, '^ 816080008', opts), '^ 816080008');
    });

    test('should print member-of with constraint operator', () => {
      const { ast } = parseECL('<< ^ 816080008');
      assert.strictEqual(printAst(ast, '<< ^ 816080008', opts), '<< ^ 816080008');
    });
  });

  describe('Full sub-expressions', () => {
    test('should print operator with concept and term', () => {
      const { ast } = parseECL('<< 404684003 |Clinical finding|');
      assert.strictEqual(printAst(ast, '<< 404684003 |Clinical finding|', opts), '<< 404684003 | Clinical finding |');
    });

    test('should normalize spacing around pipes', () => {
      const { ast } = parseECL('<<404684003|Clinical finding|');
      assert.strictEqual(printAst(ast, '<<404684003|Clinical finding|', opts), '<< 404684003 | Clinical finding |');
    });
  });

  describe('Parenthesized sub-expressions', () => {
    test('should print parenthesized concept reference', () => {
      const { ast } = parseECL('(404684003)');
      assert.strictEqual(printAst(ast, '(404684003)', opts), '(404684003)');
    });

    test('should print parenthesized expression with operator', () => {
      const { ast } = parseECL('(<< 404684003)');
      assert.strictEqual(printAst(ast, '(<< 404684003)', opts), '(<< 404684003)');
    });
  });

  describe('Null/undefined AST handling', () => {
    test('should return empty string for null AST', () => {
      assert.strictEqual(printAst(null, '', opts), '');
    });
  });

  describe('Filter block raw source text slicing', () => {
    test('should emit filter block from raw source text', () => {
      const src = '<< 404684003 {{ D term = "finding" }}';
      const { ast } = parseECL(src);
      assert.strictEqual(printAst(ast, src, opts), '<< 404684003 {{ D term = "finding" }}');
    });
  });

  describe('History supplement raw source text slicing', () => {
    test('should emit history supplement from raw source text', () => {
      const src = '<< 404684003 {{ + HISTORY-MIN }}';
      const { ast } = parseECL(src);
      assert.strictEqual(printAst(ast, src, opts), '<< 404684003 {{ + HISTORY-MIN }}');
    });
  });

  describe('Compound expressions (AND/OR/MINUS)', () => {
    test('should render short compound inline', () => {
      const input = '<< 404684003 AND << 19829001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.strictEqual(result, '<< 404684003 AND << 19829001');
    });

    test('should break long compound onto multiple lines', () => {
      const input = '<< 404684003 |Clinical finding| OR << 71388002 |Procedure| OR << 123037004 |Body structure|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      const lines = result.split('\n');
      assert.ok(lines.length > 1, 'should be multi-line');
      // Top-level (depth 0) non-paren-starting compound gets 1 continuation indent level
      assert.ok(lines[1].trimStart().startsWith('OR '), 'continuation should start with OR');
      assert.ok(lines[1].startsWith('  OR '), 'continuation should be indented 1 level (2 spaces)');
    });

    test('should force multi-line when breakOnOperators is true', () => {
      const input = '<< 404684003 AND << 19829001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, {
        ...opts,
        breakOnOperators: true,
      });
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2);
      assert.ok(lines[1].trimStart().startsWith('AND '));
    });

    test('should handle three operands', () => {
      const input = '<< 404684003 OR << 71388002 OR << 123037004';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, {
        ...opts,
        breakOnOperators: true,
      });
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 3);
    });

    test('should handle MINUS operator', () => {
      const input = '<< 404684003 MINUS << 64572001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes('MINUS'));
    });

    test('should always inline when maxLineLength is 0', () => {
      const input = '<< 404684003 |Clinical finding| OR << 71388002 |Procedure| OR << 123037004 |Body structure|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, maxLineLength: 0 });
      assert.ok(!result.includes('\n'), 'should be single line');
    });

    test('should preserve display terms in compound operands', () => {
      const input = '<< 404684003 |Clinical finding| AND << 19829001 |Disorder|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes('| Clinical finding |'));
      assert.ok(result.includes('| Disorder |'));
      assert.ok(result.includes('AND'));
    });

    test('should handle parenthesized compound sub-expressions', () => {
      const input = '(<< 404684003 OR << 19829001)';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes('OR'));
      assert.ok(result.startsWith('('));
      assert.ok(result.endsWith(')'));
    });
  });

  describe('Refined expressions and attributes', () => {
    test('should render short refinement inline', () => {
      const input = '<< 404684003: 363698007 = << 39057004';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.strictEqual(result, '<< 404684003: 363698007 = << 39057004');
    });

    test('should break long refinement onto multiple lines', () => {
      const input =
        '<< 404684003 |Clinical finding|: 363698007 |Finding site| = << 39057004 |Pulmonary valve structure|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      const lines = result.split('\n');
      assert.ok(lines.length > 1, 'should be multi-line');
      assert.ok(lines[0].endsWith(':'), 'first line should end with colon');
      assert.ok(lines[1].startsWith('  '), 'attribute should be indented');
    });

    test('should put each attribute on its own line when multi-line', () => {
      const input = '<< 404684003: 363698007 = << 39057004, 116676008 = << 72651009';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      // At 63 chars, this fits in 80 char limit, so inline
      assert.strictEqual(result, '<< 404684003: 363698007 = << 39057004, 116676008 = << 72651009');
    });

    test('should break multiple attributes onto separate lines when exceeding maxLineLength', () => {
      const input =
        '<< 404684003 |Clinical finding|: 363698007 |Finding site| = << 39057004, 116676008 |Associated morphology| = << 72651009';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      const lines = result.split('\n');
      assert.ok(lines.length >= 3, 'should have at least 3 lines (focus + 2 attributes)');
      assert.ok(lines[0].endsWith(':'), 'first line should end with colon');
      // Second and third lines should be comma-separated attributes
      assert.ok(lines[1].includes('363698007'), 'second line should have first attribute');
      assert.ok(lines[2].includes('116676008'), 'third line should have second attribute');
    });

    test('should force multi-line when breakAfterColon is true', () => {
      const input = '<< 404684003: 363698007 = << 39057004';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, breakAfterColon: true });
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2);
      assert.ok(lines[0].endsWith(':'), 'first line should end with colon');
      assert.ok(lines[1].startsWith('  363698007'), 'attribute should be indented');
    });

    test('should render attribute with parenthesized expression value', () => {
      const input = '<< 404684003: 363698007 = (<< 39057004)';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.strictEqual(result, '<< 404684003: 363698007 = (<< 39057004)');
    });

    test('should format spacing correctly (no space before colon, space after)', () => {
      // Regardless of input spacing, output should be: focus: attr
      const input = '<< 404684003:363698007=<< 39057004';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes(': '), 'should have space after colon');
      assert.ok(!result.includes(' :'), 'should have no space before colon');
      assert.ok(result.includes(' = '), 'should have spaces around equals');
    });

    test('should render attribute with wildcard value', () => {
      const input = '<< 404684003: 363698007 = *';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.strictEqual(result, '<< 404684003: 363698007 = *');
    });

    test('should force multi-line when breakOnRefinementComma is true', () => {
      const input = '<< 404684003: 363698007 = << 39057004';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, breakOnRefinementComma: true });
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2);
      assert.ok(lines[0].endsWith(':'), 'first line should end with colon');
    });

    test('should always inline when maxLineLength is 0', () => {
      const input =
        '<< 404684003 |Clinical finding|: 363698007 |Finding site| = << 39057004 |Pulmonary valve structure|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, maxLineLength: 0 });
      assert.ok(!result.includes('\n'), 'should be single line');
    });

    test('should render attribute name with display term', () => {
      const input = '<< 404684003: 363698007 |Finding site| = << 39057004';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes('363698007 | Finding site |'), 'attribute name should include normalized term');
    });
  });

  describe('Nested parenthesized expressions', () => {
    test('should correctly format the reported bug expression', () => {
      const input =
        '(<< 16114001 |Fracture of ankle| OR ^ 32570071000036102 |Clinical finding foundation reference set|): 363698007 |Finding site| = (* : (272741003 |Laterality| = 7771000 |Left| OR 272741003 |Laterality| = 24028007 |Right|))';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      // Verify key structural properties
      const lines = result.split('\n');
      assert.ok(lines.length >= 4, `should be multi-line (got ${lines.length} lines)`);
      assert.ok(lines[0].startsWith('('), 'should start with (');
      assert.ok(lines[1].trimStart().startsWith('OR '), 'second line starts with OR');
      // The ):  should appear (close compound + start refinement)
      assert.ok(result.includes('):'), 'should have ): for compound-to-refinement transition');
      // Inner refinement with wildcard and attributes
      assert.ok(result.includes('*:'), 'should have *: for inner refinement');
      assert.ok(result.includes('272741003'), 'should include attribute concepts');
    });

    test('should format parenthesized compound with breakOnOperators', () => {
      const input = '(<< 404684003 OR << 71388002)';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, breakOnOperators: true });
      const lines = result.split('\n');
      assert.ok(lines[0].startsWith('('), 'should start with (');
      assert.ok(lines.at(-1)!.trimEnd().endsWith(')'), 'should end with )');
      assert.ok(lines.length >= 2, 'should be multi-line');
    });

    test('should format deeply nested expressions', () => {
      const input = '(<< 404684003 AND (<< 71388002 OR << 123037004))';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, breakOnOperators: true });
      assert.ok(result.includes('\n'), 'should be multi-line');
      assert.ok(result.includes('AND'), 'should contain AND');
      assert.ok(result.includes('OR'), 'should contain OR');
      // Should have proper nesting: outer ( and inner ( both present
      assert.ok(result.startsWith('('), 'should start with outer paren');
      assert.ok(result.endsWith('))'), 'should end with double close parens');
    });

    test('should keep simple parenthesized expression inline when it fits', () => {
      const input = '(<< 404684003)';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.strictEqual(result, '(<< 404684003)');
    });

    test('should render nested refined expression in parentheses', () => {
      const input = '(<< 404684003: 363698007 = *)';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes('404684003'), 'should contain focus concept');
      assert.ok(result.includes('363698007'), 'should contain attribute name');
      assert.ok(result.includes('*'), 'should contain wildcard value');
    });
  });

  describe('Dotted expressions', () => {
    test('should format simple dotted expression inline', () => {
      const input = '<< 404684003 . 363698007';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.strictEqual(result, '<< 404684003 . 363698007');
    });

    test('should format multi-dotted expression', () => {
      const input = '<< 404684003 . 363698007 . 116676008';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      assert.ok(result.includes('. 363698007'), 'should include first dot attribute');
      assert.ok(result.includes('. 116676008'), 'should include second dot attribute');
    });

    test('should break long dotted expression onto multiple lines', () => {
      const input = '<< 404684003 |Clinical finding| . 363698007 |Finding site| . 116676008 |Associated morphology|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, opts);
      const lines = result.split('\n');
      assert.ok(lines.length >= 2, 'should be multi-line');
      // Continuation lines should have indented dot attributes
      const dotLines = lines.filter((l) => l.trimStart().startsWith('. '));
      assert.ok(dotLines.length >= 1, 'should have at least one dot continuation line');
    });

    test('should keep short dotted expression inline when maxLineLength is 0', () => {
      const input = '<< 404684003 |Clinical finding| . 363698007 |Finding site| . 116676008 |Associated morphology|';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, maxLineLength: 0 });
      assert.ok(!result.includes('\n'), 'should be single line with unlimited length');
    });
  });

  describe('Brace attribute groups', () => {
    test('should render single attribute in brace group', () => {
      const src = '<< 404684003: { 363698007 = << 39057004 }';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      assert.ok(result.includes('{ 363698007'), 'should contain braced attribute');
      assert.ok(result.includes('}'), 'should contain closing brace');
    });

    test('should render multiple attributes in brace group', () => {
      const src = '<< 404684003: { 363698007 = << 39057004, 116676008 = << 72651009 }';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      assert.ok(result.includes('363698007'), 'should contain first attribute');
      assert.ok(result.includes('116676008'), 'should contain second attribute');
    });

    test('should break brace group onto multiple lines when exceeding maxLineLength', () => {
      const src =
        '<< 404684003 | Clinical finding |: { 363698007 | Finding site | = << 39057004 | Pulmonary valve |, 116676008 | Associated morphology | = << 72651009 }';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      const lines = result.split('\n');
      assert.ok(lines.length >= 2, `should be multi-line (got ${lines.length})`);
      assert.ok(result.includes('363698007'), 'first attribute present');
      assert.ok(result.includes('116676008'), 'second attribute present');
    });

    test('should keep short brace group inline', () => {
      const src = '<< 404684003: { 363698007 = * }';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      assert.ok(!result.includes('\n'), 'should be single line');
      assert.ok(result.includes('{ 363698007 = * }'), 'brace group inline');
    });
  });

  describe('spaceAroundOperators option', () => {
    test('should render compound with no spaces around operator when false', () => {
      const input = '<< 404684003 AND << 19829001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, spaceAroundOperators: false });
      assert.ok(result.includes('AND'), 'should contain AND');
      assert.ok(!result.includes(' AND '), 'should not have spaces around AND');
    });

    test('should render compound with spaces around operator when true (default)', () => {
      const input = '<< 404684003 AND << 19829001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, spaceAroundOperators: true });
      assert.ok(result.includes(' AND '), 'should have spaces around AND');
    });

    test('should render OR without spaces when spaceAroundOperators is false', () => {
      const input = '<< 404684003 OR << 19829001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, spaceAroundOperators: false });
      assert.ok(result.includes('OR'), 'should contain OR');
      assert.ok(!result.includes(' OR '), 'should not have spaces around OR');
    });

    test('should render MINUS without spaces when spaceAroundOperators is false', () => {
      const input = '<< 404684003 MINUS << 19829001';
      const { ast } = parseECL(input);
      const result = printAst(ast, input, { ...opts, spaceAroundOperators: false });
      assert.ok(result.includes('MINUS'), 'should contain MINUS');
      assert.ok(!result.includes(' MINUS '), 'should not have spaces around MINUS');
    });
  });

  describe('Reversed attributes', () => {
    test('should render reversed attribute with R prefix', () => {
      const src = '<< 404684003: R 363698007 = << 39057004';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      assert.ok(result.includes('R 363698007'), 'should have R prefix on attribute name');
    });
  });

  describe('Cardinality constraints', () => {
    test('should render attribute with cardinality', () => {
      const src = '<< 404684003: [0..1] 363698007 = << 39057004';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      assert.ok(result.includes('[0..1]'), 'should include cardinality');
      assert.ok(result.includes('363698007'), 'should include attribute name');
    });

    test('should render attribute with [0..0] cardinality', () => {
      const src = '<< 404684003: [0..0] 363698007 = *';
      const { ast } = parseECL(src);
      const result = printAst(ast, src, opts);
      assert.ok(result.includes('[0..0]'), 'should include zero cardinality');
    });
  });

  describe('lastLineLength utility', () => {
    test('should return length of single-line string', () => {
      assert.strictEqual(lastLineLength('hello world'), 11);
    });

    test('should return length of last line in multi-line string', () => {
      assert.strictEqual(lastLineLength('first line\nsecond'), 6);
    });

    test('should return 0 for empty string', () => {
      assert.strictEqual(lastLineLength(''), 0);
    });
  });
});
