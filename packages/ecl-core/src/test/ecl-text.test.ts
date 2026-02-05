// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseECL } from '../parser/index';
import { extractText, extractRefinementInfo, extractCompoundOperands } from '../semantic/ecl-text';
import { NodeType, RefinedExpressionNode, CompoundExpressionNode, SubExpressionNode } from '../parser/ast';

// ── extractText ──────────────────────────────────────────────────────────────

describe('extractText', () => {
  test('extracts full text when range covers entire input', () => {
    const src = '< 404684003';
    const result = parseECL(src);
    assert.ok(result.ast);
    const text = extractText(src, result.ast.range);
    assert.strictEqual(text, src);
  });

  test('extracts concept reference text from expression', () => {
    const src = '<< 404684003 |Clinical finding|';
    const result = parseECL(src);
    assert.ok(result.ast);
    // The expression's inner sub-expression contains the concept
    const expr = result.ast.expression as SubExpressionNode;
    assert.strictEqual(expr.type, NodeType.SubExpressionConstraint);
    const focusText = extractText(src, expr.focus.range);
    assert.ok(focusText.includes('404684003'));
  });

  test('extracts substring with offset-based range', () => {
    const src = '< 404684003 : 363698007 = << 39057004';
    // Parse to get the refined expression
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;
    assert.strictEqual(refined.type, NodeType.RefinedExpression);
    // Extract the focus concept text
    const focusText = extractText(src, refined.expression.range);
    assert.ok(focusText.includes('404684003'));
    assert.ok(!focusText.includes('363698007'));
  });

  test('handles empty range (start === end)', () => {
    const src = 'test text';
    const range = {
      start: { line: 0, column: 3, offset: 3 },
      end: { line: 0, column: 3, offset: 3 },
    };
    assert.strictEqual(extractText(src, range), '');
  });

  test('extracts single character', () => {
    const src = '< 404684003';
    const range = {
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 1, offset: 1 },
    };
    assert.strictEqual(extractText(src, range), '<');
  });
});

// ── extractRefinementInfo ────────────────────────────────────────────────────

describe('extractRefinementInfo', () => {
  test('extracts focus and single attribute from simple refinement', () => {
    const src = '< 404684003 : 363698007 = << 39057004';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;
    assert.strictEqual(refined.type, NodeType.RefinedExpression);

    const info = extractRefinementInfo(refined, src);
    assert.ok(info.focusEcl.includes('404684003'));
    assert.strictEqual(info.attributes.length, 1);
    assert.ok(info.attributes[0].nameEcl.includes('363698007'));
    assert.ok(info.attributes[0].valueEcl?.includes('39057004'));
    assert.strictEqual(info.attributes[0].isWildcardValue, false);
  });

  test('detects wildcard value (*) in attribute', () => {
    const src = '< 404684003 : 363698007 = *';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;
    assert.strictEqual(refined.type, NodeType.RefinedExpression);

    const info = extractRefinementInfo(refined, src);
    assert.strictEqual(info.attributes.length, 1);
    assert.strictEqual(info.attributes[0].isWildcardValue, true);
    assert.strictEqual(info.attributes[0].valueEcl, null);
    assert.strictEqual(info.attributes[0].valueRange, null);
  });

  test('detects wildcard focus concept (*)', () => {
    const src = '* : 363698007 = << 39057004';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;
    assert.strictEqual(refined.type, NodeType.RefinedExpression);

    const info = extractRefinementInfo(refined, src);
    assert.strictEqual(info.attributes[0].isWildcardFocus, true);
  });

  test('non-wildcard focus has isWildcardFocus = false', () => {
    const src = '< 404684003 : 363698007 = << 39057004';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;

    const info = extractRefinementInfo(refined, src);
    assert.strictEqual(info.attributes[0].isWildcardFocus, false);
  });

  test('extracts multiple attributes from comma-separated refinement', () => {
    const src = '< 404684003 : 363698007 = << 39057004, 116676008 = << 40733004';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;
    assert.strictEqual(refined.type, NodeType.RefinedExpression);

    const info = extractRefinementInfo(refined, src);
    assert.strictEqual(info.attributes.length, 2);
    assert.ok(info.attributes[0].nameEcl.includes('363698007'));
    assert.ok(info.attributes[1].nameEcl.includes('116676008'));
    assert.ok(info.attributes[0].valueEcl?.includes('39057004'));
    assert.ok(info.attributes[1].valueEcl?.includes('40733004'));
  });

  test('focusRange points to the focus sub-expression', () => {
    const src = '<< 404684003 |Clinical finding| : 363698007 = *';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;

    const info = extractRefinementInfo(refined, src);
    const focusFromRange = extractText(src, info.focusRange);
    assert.strictEqual(focusFromRange, info.focusEcl);
    assert.ok(focusFromRange.includes('404684003'));
  });

  test('attributeRange covers the whole name = value', () => {
    const src = '< 404684003 : 363698007 = << 39057004';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;

    const info = extractRefinementInfo(refined, src);
    const attrText = extractText(src, info.attributes[0].attributeRange);
    assert.ok(attrText.includes('363698007'));
    assert.ok(attrText.includes('39057004'));
    assert.ok(attrText.includes('='));
  });

  test('nameRange points to the attribute name concept', () => {
    const src = '< 404684003 : 363698007 |Finding site| = << 39057004';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;

    const info = extractRefinementInfo(refined, src);
    const nameText = extractText(src, info.attributes[0].nameRange);
    assert.ok(nameText.includes('363698007'));
  });

  test('valueRange points to the attribute value expression', () => {
    const src = '< 404684003 : 363698007 = << 39057004 |Structure of lung|';
    const result = parseECL(src);
    assert.ok(result.ast);
    const refined = result.ast.expression as RefinedExpressionNode;

    const info = extractRefinementInfo(refined, src);
    assert.ok(info.attributes[0].valueRange);
    const valueText = extractText(src, info.attributes[0].valueRange);
    assert.ok(valueText.includes('39057004'));
  });
});

// ── extractCompoundOperands ──────────────────────────────────────────────────

describe('extractCompoundOperands', () => {
  test('extracts two operands from AND expression', () => {
    const src = '< 404684003 AND < 19829001';
    const result = parseECL(src);
    assert.ok(result.ast);
    const compound = result.ast.expression as CompoundExpressionNode;
    assert.strictEqual(compound.type, NodeType.CompoundExpression);

    const operands = extractCompoundOperands(src, compound.operands);
    assert.strictEqual(operands.length, 2);
    assert.ok(operands[0].ecl.includes('404684003'));
    assert.ok(operands[1].ecl.includes('19829001'));
  });

  test('extracts three operands from chained OR expression', () => {
    const src = '< 404684003 OR < 19829001 OR < 73211009';
    const result = parseECL(src);
    assert.ok(result.ast);
    const compound = result.ast.expression as CompoundExpressionNode;
    assert.strictEqual(compound.type, NodeType.CompoundExpression);

    const operands = extractCompoundOperands(src, compound.operands);
    assert.strictEqual(operands.length, 3);
    assert.ok(operands[0].ecl.includes('404684003'));
    assert.ok(operands[1].ecl.includes('19829001'));
    assert.ok(operands[2].ecl.includes('73211009'));
  });

  test('operand ranges can recreate original text via extractText', () => {
    const src = '<< 404684003 AND << 19829001';
    const result = parseECL(src);
    assert.ok(result.ast);
    const compound = result.ast.expression as CompoundExpressionNode;

    const operands = extractCompoundOperands(src, compound.operands);
    for (const op of operands) {
      const fromRange = extractText(src, op.range);
      assert.strictEqual(fromRange, op.ecl);
    }
  });

  test('operands with terms are correctly extracted', () => {
    const src = '< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung|';
    const result = parseECL(src);
    assert.ok(result.ast);
    const compound = result.ast.expression as CompoundExpressionNode;

    const operands = extractCompoundOperands(src, compound.operands);
    assert.strictEqual(operands.length, 2);
    assert.ok(operands[0].ecl.includes('Clinical finding'));
    assert.ok(operands[1].ecl.includes('Disorder of lung'));
  });

  test('returns empty array for empty operands list', () => {
    const operands = extractCompoundOperands('any text', []);
    assert.strictEqual(operands.length, 0);
  });
});
