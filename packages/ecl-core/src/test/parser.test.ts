// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { parseECL } from '../parser';
import { NodeType } from '../parser/ast';

describe('ECL Parser', () => {
  describe('Valid ECL expressions', () => {
    test('should parse simple descendant constraint', () => {
      const result = parseECL('< 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.notEqual(result.ast, null, 'Should have AST');
    });

    test('should parse descendant with term', () => {
      const result = parseECL('< 404684003 |Clinical finding|');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse descendant or self', () => {
      const result = parseECL('<< 19829001 |Disorder of lung|');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse ancestor constraint', () => {
      const result = parseECL('> 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse ancestor or self', () => {
      const result = parseECL('>> 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse compound expression with AND', () => {
      const result = parseECL('< 404684003 AND < 19829001');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse compound expression with OR', () => {
      const result = parseECL('< 404684003 OR < 19829001');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse compound expression with MINUS', () => {
      const result = parseECL('< 404684003 MINUS < 19829001');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse expression with grouping', () => {
      const result = parseECL('< 404684003 AND (< 19829001 OR < 301867009)');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse refinement', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });

    test('should parse complex refinement with term', () => {
      const result = parseECL(
        '< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|',
      );
      assert.equal(result.errors.length, 0, 'Should have no errors');
    });
  });

  describe('Invalid ECL expressions', () => {
    test('should detect duplicate AND operator', () => {
      const result = parseECL('< 404684003 AND AND < 19829001');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    test('should detect duplicate OR operator', () => {
      const result = parseECL('< 404684003 OR OR < 19829001');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    test('should detect incomplete expression', () => {
      const result = parseECL('< 404684003 AND');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    test('should detect missing operator', () => {
      const result = parseECL('< 404684003 < 19829001');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    test('should detect missing closing parenthesis', () => {
      const result = parseECL('(< 404684003');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    test('should detect missing opening parenthesis', () => {
      const result = parseECL('< 404684003)');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });

    test('should detect invalid concept ID', () => {
      const result = parseECL('< abc123');
      assert.ok(result.errors.length > 0, 'Should have errors');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty string', () => {
      const result = parseECL('');
      assert.ok(result.errors.length > 0, 'Should have errors for empty input');
    });

    test('should handle whitespace only', () => {
      const result = parseECL('   ');
      assert.ok(result.errors.length > 0, 'Should have errors for whitespace only');
    });

    test('should handle concept ID only', () => {
      const result = parseECL('404684003');
      assert.equal(result.errors.length, 0, 'Should accept plain concept ID');
    });

    test('should handle multiple spaces between tokens', () => {
      const result = parseECL('<    404684003    AND    <    19829001');
      assert.equal(result.errors.length, 0, 'Should handle multiple spaces');
    });
  });

  describe('AST structure', () => {
    test('compound expression produces CompoundExpressionNode with operands array', () => {
      const result = parseECL('< 404684003 AND < 19829001');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      assert.equal(expr.type, NodeType.CompoundExpression, 'Should be CompoundExpression');
      assert.ok('operands' in expr, 'Should have operands');
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operands.length, 2, 'Should have 2 operands');
      }
    });

    test('AND compound has operator.operator === AND', () => {
      const result = parseECL('< 404684003 AND < 19829001');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operator.operator, 'AND');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('OR compound has operator.operator === OR', () => {
      const result = parseECL('< 404684003 OR < 19829001');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operator.operator, 'OR');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('MINUS compound has operator.operator === MINUS', () => {
      const result = parseECL('< 404684003 MINUS < 19829001');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operator.operator, 'MINUS');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('N-ary conjunction has 3 operands', () => {
      const result = parseECL('< 404684003 AND < 19829001 AND < 301867009');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operands.length, 3, 'Should have 3 operands');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('refined expression produces RefinedExpressionNode with refinement.attributes', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      assert.equal(expr.type, NodeType.RefinedExpression, 'Should be RefinedExpression');
      if (expr.type === NodeType.RefinedExpression) {
        assert.ok(expr.refinement, 'Should have refinement');
        assert.ok(expr.refinement.attributes.length > 0, 'Refinement should have attributes');
        assert.equal(expr.refinement.attributes[0].name.conceptId, '363698007');
      }
    });

    test('SubExpressionNode includes constraint operator', () => {
      const result = parseECL('<< 404684003');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator, 'Should have operator');
        assert.equal(expr.operator.operator, '<<');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('nested parenthesized expression preserved', () => {
      const result = parseECL('< 19829001 AND (< 301867009 OR < 195967001)');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operands.length, 2);
        // Second operand should have a nested expression as focus
        const secondOperand = expr.operands[1];
        assert.equal(
          secondOperand.focus.type,
          NodeType.ExpressionConstraint,
          'Second operand focus should be nested ExpressionConstraint',
        );
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('constraint operators are correctly identified', () => {
      const tests: [string, string][] = [
        ['< 404684003', '<'],
        ['<< 404684003', '<<'],
        ['> 404684003', '>'],
        ['>> 404684003', '>>'],
      ];

      for (const [input, expected] of tests) {
        const result = parseECL(input);
        assert.ok(result.ast, `AST should exist for: ${input}`);
        const expr = result.ast.expression;
        if (expr.type === NodeType.SubExpressionConstraint) {
          assert.ok(expr.operator, `Should have operator for: ${input}`);
          assert.equal(expr.operator.operator, expected, `Operator for "${input}" should be "${expected}"`);
        } else {
          assert.fail(`Expected SubExpressionConstraint for: ${input}`);
        }
      }
    });

    test('refinement attribute value contains expression', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        const attr = expr.refinement.attributes[0];
        assert.ok(attr.value.expression, 'Attribute value should have expression');
        if (attr.value.expression) {
          assert.equal(attr.value.expression.type, NodeType.SubExpressionConstraint);
        }
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('plain concept ID (no operator) produces SubExpressionNode without operator', () => {
      const result = parseECL('404684003');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.equal(expr.operator, undefined, 'Should have no operator');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('compound operands each have correct concept IDs', () => {
      const result = parseECL('< 404684003 AND < 19829001');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        const first = expr.operands[0];
        const second = expr.operands[1];
        assert.equal(first.type, NodeType.SubExpressionConstraint);
        assert.equal(second.type, NodeType.SubExpressionConstraint);
        if (first.focus.type === NodeType.ConceptReference) {
          assert.equal(first.focus.conceptId, '404684003');
        }
        if (second.focus.type === NodeType.ConceptReference) {
          assert.equal(second.focus.conceptId, '19829001');
        }
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('compound operands have constraint operators', () => {
      const result = parseECL('<< 404684003 AND < 19829001');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.ok(expr.operands[0].operator);
        assert.equal(expr.operands[0].operator.operator, '<<');
        assert.ok(expr.operands[1].operator);
        assert.equal(expr.operands[1].operator.operator, '<');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('4-ary conjunction has 4 operands', () => {
      const result = parseECL('< 100000 AND < 200000 AND < 300000 AND < 400000');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operands.length, 4);
        assert.equal(expr.operator.operator, 'AND');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('4-ary disjunction has 4 operands', () => {
      const result = parseECL('< 100000 OR < 200000 OR < 300000 OR < 400000');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        assert.equal(expr.operands.length, 4);
        assert.equal(expr.operator.operator, 'OR');
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('refined expression focus has correct concept', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.expression.type, NodeType.SubExpressionConstraint);
        if (expr.expression.focus.type === NodeType.ConceptReference) {
          assert.equal(expr.expression.focus.conceptId, '404684003');
        }
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('refined expression attribute value concept is correct', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        const attr = expr.refinement.attributes[0];
        assert.ok(attr.value.expression);
        const valExpr = attr.value.expression;
        if (valExpr.focus.type === NodeType.ConceptReference) {
          assert.equal(valExpr.focus.conceptId, '39057004');
        }
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('refined expression with terms preserves terms in attribute name', () => {
      const result = parseECL('< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        const attr = expr.refinement.attributes[0];
        assert.equal(attr.name.conceptId, '363698007');
        assert.equal(attr.name.term, 'Finding site');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('refinement with multiple attributes', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 72651009');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.ok(
          expr.refinement.attributes.length >= 2,
          `Expected >= 2 attributes, got ${expr.refinement.attributes.length}`,
        );
        assert.equal(expr.refinement.attributes[0].name.conceptId, '363698007');
        assert.equal(expr.refinement.attributes[1].name.conceptId, '116676008');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('refinement with attribute group', () => {
      const result = parseECL('< 404684003 : { 363698007 = < 39057004 }');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.ok(expr.refinement.attributes.length >= 1, 'Should have at least 1 attribute from group');
        assert.equal(expr.refinement.attributes[0].name.conceptId, '363698007');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('wildcard focus concept produces Wildcard node', () => {
      const result = parseECL('*');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.equal(expr.focus.type, NodeType.Wildcard);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('wildcard with constraint operator', () => {
      const result = parseECL('< *');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator, 'Should have operator');
        assert.equal(expr.operator.operator, '<');
        assert.equal(expr.focus.type, NodeType.Wildcard);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('nested parenthesized expression inner compound is correct', () => {
      const result = parseECL('< 19829001 AND (< 301867009 OR < 195967001)');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.CompoundExpression) {
        const nested = expr.operands[1];
        assert.equal(nested.focus.type, NodeType.ExpressionConstraint);
        if (nested.focus.type === NodeType.ExpressionConstraint) {
          const innerExpr = nested.focus.expression;
          assert.equal(innerExpr.type, NodeType.CompoundExpression);
          if (innerExpr.type === NodeType.CompoundExpression) {
            assert.equal(innerExpr.operator.operator, 'OR');
            assert.equal(innerExpr.operands.length, 2);
          }
        }
      } else {
        assert.fail('Expected CompoundExpression');
      }
    });

    test('AttributeNode has type Attribute and range', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        const attr = expr.refinement.attributes[0];
        assert.equal(attr.type, NodeType.Attribute);
        assert.ok(attr.range, 'AttributeNode should have range');
        assert.ok(attr.range.start, 'Range should have start');
        assert.ok(attr.range.end, 'Range should have end');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('AttributeNode reversed is undefined by default', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        const attr = expr.refinement.attributes[0];
        assert.equal(attr.reversed, undefined);
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('refinement node has type Refinement', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.refinement.type, NodeType.Refinement);
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('expression node range covers full input', () => {
      const text = '< 404684003 AND < 19829001';
      const result = parseECL(text);
      assert.ok(result.ast);
      assert.equal(result.ast.range.start.offset, 0, 'Range should start at 0');
    });

    test('concept reference node has correct range', () => {
      const result = parseECL('< 404684003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        if (expr.focus.type === NodeType.ConceptReference) {
          assert.ok(expr.focus.range.start.offset >= 0);
          assert.ok(expr.focus.range.end.offset > expr.focus.range.start.offset);
        }
      }
    });
  });

  describe('Dotted expressions', () => {
    test('dotted expression parses with no errors', () => {
      const result = parseECL('< 404684003 . 363698007');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('dotted expression produces DottedExpressionNode', () => {
      const result = parseECL('< 404684003 . 363698007');
      assert.ok(result.ast, 'AST should exist');
      const expr = result.ast.expression;
      assert.equal(expr.type, NodeType.DottedExpression, 'Should be DottedExpression');
    });

    test('dotted expression source has correct concept', () => {
      const result = parseECL('< 404684003 . 363698007');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.DottedExpression) {
        assert.equal(expr.source.type, NodeType.SubExpressionConstraint);
        if (expr.source.focus.type === NodeType.ConceptReference) {
          assert.equal(expr.source.focus.conceptId, '404684003');
        } else {
          assert.fail('Expected ConceptReference as source focus');
        }
      } else {
        assert.fail('Expected DottedExpression');
      }
    });

    test('dotted expression has correct attribute chain', () => {
      const result = parseECL('< 404684003 . 363698007');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.DottedExpression) {
        assert.equal(expr.attributes.length, 1, 'Should have 1 dotted attribute');
        assert.equal(expr.attributes[0].type, NodeType.DottedAttribute);
        const attrName = expr.attributes[0].attributeName;
        if (attrName.focus.type === NodeType.ConceptReference) {
          assert.equal(attrName.focus.conceptId, '363698007');
        } else {
          assert.fail('Expected ConceptReference as dotted attribute name');
        }
      } else {
        assert.fail('Expected DottedExpression');
      }
    });

    test('dotted expression with multiple chained attributes', () => {
      const result = parseECL('< 404684003 . 363698007 . 116676008');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.DottedExpression) {
        assert.equal(expr.attributes.length, 2, 'Should have 2 dotted attributes');
      } else {
        assert.fail('Expected DottedExpression');
      }
    });

    test('dotted expression source has constraint operator', () => {
      const result = parseECL('< 404684003 . 363698007');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.DottedExpression) {
        assert.ok(expr.source.operator, 'Source should have constraint operator');
        assert.equal(expr.source.operator.operator, '<');
      } else {
        assert.fail('Expected DottedExpression');
      }
    });
  });

  describe('Member-of operator', () => {
    test('member-of expression parses with no errors', () => {
      const result = parseECL('^ 700043003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('member-of expression has memberOf flag set to true', () => {
      const result = parseECL('^ 700043003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.equal(expr.memberOf, true, 'memberOf should be true');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('member-of expression has correct concept ID', () => {
      const result = parseECL('^ 700043003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        if (expr.focus.type === NodeType.ConceptReference) {
          assert.equal(expr.focus.conceptId, '700043003');
        } else {
          assert.fail('Expected ConceptReference as focus');
        }
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('member-of without constraint operator has no operator', () => {
      const result = parseECL('^ 700043003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.equal(expr.operator, undefined, 'Should have no constraint operator');
        assert.equal(expr.memberOf, true);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('member-of with constraint operator', () => {
      const result = parseECL('< ^ 700043003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator, 'Should have constraint operator');
        assert.equal(expr.operator.operator, '<');
        assert.equal(expr.memberOf, true);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });
  });

  describe('Wildcard expressions', () => {
    test('bare wildcard parses as Wildcard node', () => {
      const result = parseECL('*');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.equal(expr.focus.type, NodeType.Wildcard);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('wildcard with refinement parses correctly', () => {
      const result = parseECL('* : 363698007 = < 39057004');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      assert.equal(expr.type, NodeType.RefinedExpression, 'Should be RefinedExpression');
    });

    test('wildcard with refinement has wildcard as focus', () => {
      const result = parseECL('* : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.expression.focus.type, NodeType.Wildcard, 'Focus should be Wildcard');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('wildcard with refinement has correct attribute', () => {
      const result = parseECL('* : 363698007 = < 39057004');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.refinement.attributes.length, 1, 'Should have 1 attribute');
        assert.equal(expr.refinement.attributes[0].name.conceptId, '363698007');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });
  });

  describe('Deeply nested parentheses', () => {
    test('double-nested parentheses parses with no errors', () => {
      const result = parseECL('((< 404684003 AND < 19829001))');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('double-nested parentheses produces CompoundExpression inside', () => {
      const result = parseECL('((< 404684003 AND < 19829001))');
      assert.ok(result.ast);
      // The outer expression wraps a SubExpressionConstraint whose focus is an ExpressionConstraint
      // Navigate inward to find the CompoundExpression
      let found = false;
      const findCompound = (expr: any): void => {
        if (!expr) return;
        if (expr.type === NodeType.CompoundExpression) {
          found = true;
          assert.equal(expr.operands.length, 2);
          assert.equal(expr.operator.operator, 'AND');
          return;
        }
        if (expr.expression) findCompound(expr.expression);
        if (expr.focus) findCompound(expr.focus);
      };
      findCompound(result.ast.expression);
      assert.ok(found, 'Should find CompoundExpression inside nested parens');
    });

    test('three levels deep parses with no errors', () => {
      const result = parseECL('(< 404684003 AND (< 19829001 OR (< 301867009 MINUS < 195967001)))');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('three levels deep has correct outer operator', () => {
      const result = parseECL('(< 404684003 AND (< 19829001 OR (< 301867009 MINUS < 195967001)))');
      assert.ok(result.ast);
      // The outer expression is parenthesized, so ast.expression is a SubExpressionConstraint
      // whose focus is an ExpressionConstraint wrapping a CompoundExpression(AND)
      const outerExpr = result.ast.expression;
      if (
        outerExpr.type === NodeType.SubExpressionConstraint &&
        outerExpr.focus.type === NodeType.ExpressionConstraint
      ) {
        const inner = outerExpr.focus.expression;
        assert.equal(inner.type, NodeType.CompoundExpression, 'Inner should be CompoundExpression');
        if (inner.type === NodeType.CompoundExpression) {
          assert.equal(inner.operator.operator, 'AND');
          assert.equal(inner.operands.length, 2);
        }
      } else {
        assert.fail('Expected parenthesized SubExpressionConstraint wrapping ExpressionConstraint');
      }
    });

    test('three levels deep has correct innermost MINUS', () => {
      const result = parseECL('(< 404684003 AND (< 19829001 OR (< 301867009 MINUS < 195967001)))');
      assert.ok(result.ast);
      // Navigate: ast.expression -> SubExpr -> ExpressionConstraint(AND) -> operands[1] -> SubExpr -> ExpressionConstraint(OR) -> operands[1] -> SubExpr -> ExpressionConstraint(MINUS)
      let foundMinus = false;
      const findMinus = (expr: any): void => {
        if (!expr) return;
        if (expr.type === NodeType.CompoundExpression && expr.operator.operator === 'MINUS') {
          foundMinus = true;
          assert.equal(expr.operands.length, 2);
          return;
        }
        if (expr.expression) findMinus(expr.expression);
        if (expr.focus) findMinus(expr.focus);
        if (expr.operands) {
          for (const op of expr.operands) {
            findMinus(op);
          }
        }
      };
      findMinus(result.ast.expression);
      assert.ok(foundMinus, 'Should find MINUS CompoundExpression in the innermost level');
    });
  });

  describe('Multiple refinement attributes', () => {
    test('comma-separated attributes parse with no errors', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('comma-separated attributes produce RefinedExpression with 2 attributes', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      assert.equal(expr.type, NodeType.RefinedExpression, 'Should be RefinedExpression');
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.refinement.attributes.length, 2, 'Should have 2 attributes');
      }
    });

    test('first attribute has correct concept ID', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.refinement.attributes[0].name.conceptId, '363698007');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('second attribute has correct concept ID', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        assert.equal(expr.refinement.attributes[1].name.conceptId, '116676008');
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('each attribute value has an expression', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        for (const attr of expr.refinement.attributes) {
          assert.ok(attr.value.expression, `Attribute ${attr.name.conceptId} should have value expression`);
        }
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });

    test('attribute value concepts are correct', () => {
      const result = parseECL('< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.RefinedExpression) {
        const val0 = expr.refinement.attributes[0].value.expression;
        assert.ok(val0);
        if (val0?.focus.type === NodeType.ConceptReference) {
          assert.equal(val0.focus.conceptId, '39057004');
        }
        const val1 = expr.refinement.attributes[1].value.expression;
        assert.ok(val1);
        if (val1?.focus.type === NodeType.ConceptReference) {
          assert.equal(val1.focus.conceptId, '415582006');
        }
      } else {
        assert.fail('Expected RefinedExpression');
      }
    });
  });

  describe('Child-of exclusion operators', () => {
    test('child-of operator <! parses with no errors', () => {
      const result = parseECL('<! 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('child-of operator <! produces correct operator node', () => {
      const result = parseECL('<! 404684003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator, 'Should have operator');
        assert.equal(expr.operator.operator, '<!', 'Operator should be <!');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('child-or-self-of operator <<! parses with no errors', () => {
      const result = parseECL('<<! 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast, 'AST should exist');
    });

    test('child-or-self-of operator <<! produces correct operator node', () => {
      const result = parseECL('<<! 404684003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator, 'Should have operator');
        assert.equal(expr.operator.operator, '<<!', 'Operator should be <<!');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('child-of has correct concept ID', () => {
      const result = parseECL('<! 404684003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        if (expr.focus.type === NodeType.ConceptReference) {
          assert.equal(expr.focus.conceptId, '404684003');
        } else {
          assert.fail('Expected ConceptReference as focus');
        }
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('child-or-self-of has correct concept ID', () => {
      const result = parseECL('<<! 404684003');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        if (expr.focus.type === NodeType.ConceptReference) {
          assert.equal(expr.focus.conceptId, '404684003');
        } else {
          assert.fail('Expected ConceptReference as focus');
        }
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('parent-of operator >! parses with correct operator', () => {
      const result = parseECL('>! 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator);
        assert.equal(expr.operator.operator, '>!');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('parent-or-self-of operator >>! parses with correct operator', () => {
      const result = parseECL('>>! 404684003');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.operator);
        assert.equal(expr.operator.operator, '>>!');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });
  });

  describe('Filter constraints and history supplement AST', () => {
    test('description filter produces FilterConstraintNode', () => {
      const result = parseECL('< 404684003 {{ D typeId = 900000000000003001 }}');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.filters, 'Should have filters');
        assert.equal(expr.filters.length, 1);
        assert.equal(expr.filters[0].type, NodeType.FilterConstraint);
        assert.equal(expr.filters[0].filterType, 'description');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('concept filter produces FilterConstraintNode with concept references', () => {
      const result = parseECL('< 404684003 {{ C definitionStatusId = (900000000000074008 900000000000073002) }}');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.filters, 'Should have filters');
        assert.equal(expr.filters[0].filterType, 'concept');
        assert.equal(expr.filters[0].conceptReferences.length, 2, 'Should have 2 concept references');
        assert.equal(expr.filters[0].conceptReferences[0].conceptId, '900000000000074008');
        assert.equal(expr.filters[0].conceptReferences[1].conceptId, '900000000000073002');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('history supplement with profile suffix', () => {
      const result = parseECL('< 404684003 {{ + HISTORY-MIN }}');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.historySupplement, 'Should have history supplement');
        assert.equal(expr.historySupplement.type, NodeType.HistorySupplement);
        assert.equal(expr.historySupplement.profile, 'MIN');
        assert.equal(expr.historySupplement.subsetExpression, undefined);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('history supplement with subset expression', () => {
      const result = parseECL('< 404684003 {{ + HISTORY (< 900000000000527005) }}');
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.historySupplement, 'Should have history supplement');
        assert.ok(expr.historySupplement.subsetExpression, 'Should have subset expression');
        assert.equal(expr.historySupplement.subsetExpression.type, NodeType.ExpressionConstraint);
        assert.equal(expr.historySupplement.profile, undefined);
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });

    test('multiple filters on one SubExpressionNode', () => {
      const result = parseECL(
        '< 404684003 {{ D typeId = 900000000000003001 }} {{ C definitionStatusId = 900000000000074008 }}',
      );
      assert.equal(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.ast);
      const expr = result.ast.expression;
      if (expr.type === NodeType.SubExpressionConstraint) {
        assert.ok(expr.filters, 'Should have filters');
        assert.equal(expr.filters.length, 2, 'Should have 2 filters');
        assert.equal(expr.filters[0].filterType, 'description');
        assert.equal(expr.filters[1].filterType, 'concept');
      } else {
        assert.fail('Expected SubExpressionConstraint');
      }
    });
  });
});
