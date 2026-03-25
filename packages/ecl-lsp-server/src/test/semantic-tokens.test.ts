// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { computeSemanticTokens, SemanticToken, tokenLegend } from '../semantic-tokens';

// Token type indices (must match semantic-tokens.ts)
const TOKEN_KEYWORD = 0;
const TOKEN_OPERATOR = 1;
const TOKEN_NUMBER = 2;
const TOKEN_STRING = 3;
const TOKEN_COMMENT = 4;
const TOKEN_PROPERTY = 5;
const TOKEN_TYPE = 6;
const TOKEN_VARIABLE = 7;
const TOKEN_MACRO = 8;

/** Find all tokens of a given type. */
function tokensOfType(tokens: SemanticToken[], type: number): SemanticToken[] {
  return tokens.filter((t) => t.tokenType === type);
}

/** Find the first token at the given line and character. */
function tokenAt(tokens: SemanticToken[], line: number, character: number): SemanticToken | undefined {
  return tokens.find((t) => t.line === line && t.character === character);
}

describe('Semantic Tokens', () => {
  // ===================== Concept IDs =====================
  describe('Concept IDs', () => {
    test('should tokenize a bare concept ID as number', () => {
      const tokens = computeSemanticTokens('404684003');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 1);
      assert.equal(nums[0].line, 0);
      assert.equal(nums[0].character, 0);
      assert.equal(nums[0].length, 9);
    });

    test('should tokenize concept ID in descendant constraint', () => {
      const tokens = computeSemanticTokens('< 404684003');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 1);
      assert.equal(nums[0].character, 2);
      assert.equal(nums[0].length, 9);
    });

    test('should not tokenize numbers shorter than 6 digits', () => {
      const tokens = computeSemanticTokens('12345');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 0, 'Numbers under 6 digits are not SNOMED IDs');
    });

    test('should tokenize 6-digit minimum concept ID', () => {
      const tokens = computeSemanticTokens('123456');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 1, '6-digit number should be tokenized');
      assert.equal(nums[0].length, 6);
    });

    test('should tokenize 18-digit maximum concept ID', () => {
      const tokens = computeSemanticTokens('123456789012345678');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 1, '18-digit number should be tokenized');
      assert.equal(nums[0].length, 18);
    });

    test('should not tokenize numbers longer than 18 digits', () => {
      const tokens = computeSemanticTokens('1234567890123456789');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 0, 'Numbers over 18 digits are not SNOMED IDs');
    });

    test('should tokenize multiple concept IDs', () => {
      const tokens = computeSemanticTokens('< 404684003 AND < 19829001');
      const nums = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(nums.length, 2);
    });
  });

  // ===================== Attribute names =====================
  describe('Attribute names', () => {
    test('should tokenize attribute name concept ID as property', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 = < 39057004');
      const properties = tokensOfType(tokens, TOKEN_PROPERTY);
      assert.equal(properties.length, 1, 'Should have one property token (attribute name)');
      assert.equal(properties[0].length, 9);
      assert.equal(properties[0].character, 14);
    });

    test('should distinguish attribute name from value concept', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 = < 39057004');
      const properties = tokensOfType(tokens, TOKEN_PROPERTY);
      const numbers = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(properties.length, 1);
      assert.equal(numbers.length, 2);
    });

    test('should handle multiple attributes with multiple property tokens', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 = < 39057004, 116676008 = < 394604002');
      const properties = tokensOfType(tokens, TOKEN_PROPERTY);
      assert.equal(properties.length, 2, 'Should have two attribute name property tokens');
    });

    test('should tokenize attribute name with display term', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 |Finding site| = < 39057004');
      const properties = tokensOfType(tokens, TOKEN_PROPERTY);
      assert.equal(properties.length, 1);
      const strings = tokensOfType(tokens, TOKEN_STRING);
      assert.equal(strings.length, 1, 'Display term should also be tokenized');
    });

    test('should mark dotted expression attribute as property', () => {
      const tokens = computeSemanticTokens('< 404684003 . 363698007');
      const properties = tokensOfType(tokens, TOKEN_PROPERTY);
      assert.equal(properties.length, 1, 'Dotted attribute name should be property');
    });

    test('should handle attribute in grouped refinement', () => {
      const tokens = computeSemanticTokens('< 404684003 : { 363698007 = < 39057004 }');
      const properties = tokensOfType(tokens, TOKEN_PROPERTY);
      assert.equal(properties.length, 1, 'Grouped attribute name should be property');
    });
  });

  // ===================== Constraint operators =====================
  describe('Constraint operators', () => {
    test('should tokenize < operator', () => {
      const tokens = computeSemanticTokens('< 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 1);
    });

    test('should tokenize << operator', () => {
      const tokens = computeSemanticTokens('<< 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 2);
    });

    test('should tokenize <<! operator', () => {
      const tokens = computeSemanticTokens('<<! 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 3);
    });

    test('should tokenize <! child-of operator', () => {
      const tokens = computeSemanticTokens('<! 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 2);
    });

    test('should tokenize > ancestor operator', () => {
      const tokens = computeSemanticTokens('> 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 1);
    });

    test('should tokenize >> ancestor-or-self operator', () => {
      const tokens = computeSemanticTokens('>> 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 2);
    });

    test('should tokenize >! parent-of operator', () => {
      const tokens = computeSemanticTokens('>! 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 2);
    });

    test('should tokenize >>! parent-or-self operator', () => {
      const tokens = computeSemanticTokens('>>! 404684003');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 3);
    });

    test('should tokenize ^ member-of operator', () => {
      const tokens = computeSemanticTokens('^ 900000000000497000');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 1);
    });

    test('should tokenize !!> top operator', () => {
      const tokens = computeSemanticTokens('!!>');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 3);
    });

    test('should tokenize !!< bottom operator', () => {
      const tokens = computeSemanticTokens('!!<');
      const op = tokenAt(tokens, 0, 0);
      assert.ok(op);
      assert.equal(op.tokenType, TOKEN_OPERATOR);
      assert.equal(op.length, 3);
    });

    test('should tokenize refinement colon as operator', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 = < 39057004');
      const colon = tokenAt(tokens, 0, 12);
      assert.ok(colon);
      assert.equal(colon.tokenType, TOKEN_OPERATOR);
      assert.equal(colon.length, 1);
    });

    test('should tokenize = operator', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 = < 39057004');
      const eq = tokenAt(tokens, 0, 24);
      assert.ok(eq);
      assert.equal(eq.tokenType, TOKEN_OPERATOR);
      assert.equal(eq.length, 1);
    });

    test('should tokenize != operator', () => {
      const tokens = computeSemanticTokens('< 404684003 : 363698007 != < 39057004');
      const neq = tokenAt(tokens, 0, 24);
      assert.ok(neq, 'Should find != operator');
      assert.equal(neq.tokenType, TOKEN_OPERATOR);
      assert.equal(neq.length, 2);
    });

    test('should tokenize dot operator', () => {
      const tokens = computeSemanticTokens('< 404684003 . 363698007');
      const ops = tokensOfType(tokens, TOKEN_OPERATOR);
      const dot = ops.find((t) => t.length === 1 && t.character === 12);
      assert.ok(dot, 'Should find . operator');
    });
  });

  // ===================== Logical operators =====================
  describe('Logical operators', () => {
    test('should tokenize AND as keyword', () => {
      const tokens = computeSemanticTokens('< 404684003 AND < 19829001');
      const keywords = tokensOfType(tokens, TOKEN_KEYWORD);
      assert.equal(keywords.length, 1);
      assert.equal(keywords[0].length, 3);
    });

    test('should tokenize OR as keyword', () => {
      const tokens = computeSemanticTokens('< 404684003 OR < 19829001');
      const keywords = tokensOfType(tokens, TOKEN_KEYWORD);
      assert.equal(keywords.length, 1);
      assert.equal(keywords[0].length, 2);
    });

    test('should tokenize MINUS as keyword', () => {
      const tokens = computeSemanticTokens('< 404684003 MINUS < 19829001');
      const keywords = tokensOfType(tokens, TOKEN_KEYWORD);
      assert.equal(keywords.length, 1);
      assert.equal(keywords[0].length, 5);
    });

    test('should be case-insensitive for AND', () => {
      const tokens = computeSemanticTokens('< 404684003 and < 19829001');
      const keywords = tokensOfType(tokens, TOKEN_KEYWORD);
      assert.equal(keywords.length, 1, 'lowercase "and" should be a keyword');
    });
  });

  // ===================== Display terms =====================
  describe('Display terms', () => {
    test('should tokenize display term as string', () => {
      const tokens = computeSemanticTokens('< 404684003 |Clinical finding|');
      const strings = tokensOfType(tokens, TOKEN_STRING);
      assert.equal(strings.length, 1);
      assert.equal(strings[0].length, '|Clinical finding|'.length);
    });

    test('should not tokenize concept ID inside display term', () => {
      const tokens = computeSemanticTokens('< 404684003 |Finding 123456789|');
      const numbers = tokensOfType(tokens, TOKEN_NUMBER);
      assert.equal(numbers.length, 1, 'Only the real concept ID should be a number');
      assert.equal(numbers[0].character, 2);
    });
  });

  // ===================== Comments =====================
  describe('Comments', () => {
    test('should tokenize single-line block comment', () => {
      const tokens = computeSemanticTokens('/* this is a comment */');
      const comments = tokensOfType(tokens, TOKEN_COMMENT);
      assert.equal(comments.length, 1);
    });

    test('should tokenize multi-line block comment', () => {
      const tokens = computeSemanticTokens('/* line 1\nline 2 */');
      const comments = tokensOfType(tokens, TOKEN_COMMENT);
      assert.equal(comments.length, 2, 'Multi-line comment should produce one token per line');
    });

    test('should tokenize line comment', () => {
      const tokens = computeSemanticTokens('// this is a line comment');
      const comments = tokensOfType(tokens, TOKEN_COMMENT);
      assert.equal(comments.length, 1);
    });
  });

  // ===================== Filter keywords =====================
  describe('Filter keywords', () => {
    test('should tokenize typeId as type inside filter block', () => {
      const tokens = computeSemanticTokens('< 404684003 {{ D typeId = 900000000000003001 }}');
      const types = tokensOfType(tokens, TOKEN_TYPE);
      assert.ok(
        types.some((t) => t.length === 'typeId'.length),
        'Should find typeId',
      );
    });

    test('should not tokenize filter keywords outside {{ }} blocks', () => {
      const tokens = computeSemanticTokens('< 404684003 |Long term survivor|');
      const types = tokensOfType(tokens, TOKEN_TYPE);
      assert.equal(types.length, 0, 'No filter keywords outside {{ }} blocks');
    });
  });

  // ===================== History supplement keywords =====================
  describe('History supplement keywords', () => {
    test('should tokenize HISTORY-MIN as macro', () => {
      const tokens = computeSemanticTokens('< 404684003 {{ + HISTORY-MIN }}');
      const macros = tokensOfType(tokens, TOKEN_MACRO);
      assert.ok(macros.length >= 1, 'Should have HISTORY-MIN macro token');
    });
  });

  // ===================== Wildcards =====================
  describe('Wildcards', () => {
    test('should tokenize * as variable', () => {
      const tokens = computeSemanticTokens('< 404684003 : * = *');
      const vars = tokensOfType(tokens, TOKEN_VARIABLE);
      assert.equal(vars.length, 2, 'Should have two wildcard tokens');
    });
  });

  // ===================== Shadowing =====================
  describe('Shadowing', () => {
    test('should not tokenize operators inside display terms', () => {
      const tokens = computeSemanticTokens('< 404684003 |< AND test|');
      const strings = tokensOfType(tokens, TOKEN_STRING);
      assert.equal(strings.length, 1);
      const keywords = tokensOfType(tokens, TOKEN_KEYWORD);
      assert.equal(keywords.length, 0, 'AND inside display term should not be a keyword');
    });

    test('stray | in comment should not mispair display terms', () => {
      const text = [
        '// align | characters vertically',
        '< 404684003 |Clinical finding|:',
        '363698007 |Site| = < 39057004 |Pulmonary valve|,',
        '116676008 |Morphology| = < 72704001 |Fracture|',
      ].join('\n');
      const tokens = computeSemanticTokens(text);
      const strings = tokensOfType(tokens, TOKEN_STRING);
      assert.equal(strings.length, 5, `Expected 5 display terms, got ${strings.length}`);
    });
  });

  // ===================== Token legend =====================
  describe('Token legend', () => {
    test('should export a valid token legend', () => {
      assert.ok(Array.isArray(tokenLegend.tokenTypes));
      assert.ok(tokenLegend.tokenTypes.length >= 9);
      assert.ok(tokenLegend.tokenTypes.includes('keyword'));
      assert.ok(tokenLegend.tokenTypes.includes('operator'));
      assert.ok(tokenLegend.tokenTypes.includes('number'));
    });
  });

  // ===================== Token sorting =====================
  describe('Token sorting', () => {
    test('tokens should be sorted by line then character', () => {
      const tokens = computeSemanticTokens('< 404684003 |term| AND\n< 19829001');
      for (let i = 1; i < tokens.length; i++) {
        const prev = tokens[i - 1];
        const curr = tokens[i];
        const sorted = prev.line < curr.line || (prev.line === curr.line && prev.character <= curr.character);
        assert.ok(sorted, `Token at ${prev.line}:${prev.character} should come before ${curr.line}:${curr.character}`);
      }
    });
  });

  // ===================== Empty and edge cases =====================
  describe('Empty and edge cases', () => {
    test('should return empty for empty input', () => {
      const tokens = computeSemanticTokens('');
      assert.equal(tokens.length, 0);
    });

    test('should handle whitespace-only input', () => {
      const tokens = computeSemanticTokens('   \n  \n  ');
      assert.equal(tokens.length, 0);
    });
  });

  // ===================== Additional coverage =====================
  describe('History supplement keywords (extended)', () => {
    test('should tokenize HISTORY-MOD as macro', () => {
      const tokens = computeSemanticTokens('< 404684003 {{ + HISTORY-MOD }}');
      const macros = tokensOfType(tokens, TOKEN_MACRO);
      assert.ok(macros.length >= 1, 'Should have HISTORY-MOD macro token');
    });

    test('should tokenize HISTORY-MAX as macro', () => {
      const tokens = computeSemanticTokens('< 404684003 {{ + HISTORY-MAX }}');
      const macros = tokensOfType(tokens, TOKEN_MACRO);
      assert.ok(macros.length >= 1, 'Should have HISTORY-MAX macro token');
    });

    test('should tokenize bare HISTORY as macro', () => {
      const tokens = computeSemanticTokens('< 404684003 {{ + HISTORY }}');
      const macros = tokensOfType(tokens, TOKEN_MACRO);
      assert.ok(macros.length >= 1, 'Should have HISTORY macro token');
    });
  });

  describe('Multi-line token offsets', () => {
    test('should compute correct line numbers for multi-line expression', () => {
      const text = '< 404684003\nAND\n< 19829001';
      const tokens = computeSemanticTokens(text);
      // First concept on line 0
      const firstConcept = tokens.find((t) => t.tokenType === TOKEN_NUMBER && t.line === 0);
      assert.ok(firstConcept, 'First concept should be on line 0');
      // AND keyword on line 1
      const andKeyword = tokens.find((t) => t.tokenType === TOKEN_KEYWORD && t.line === 1);
      assert.ok(andKeyword, 'AND should be on line 1');
      // Second concept on line 2
      const secondConcept = tokens.find((t) => t.tokenType === TOKEN_NUMBER && t.line === 2);
      assert.ok(secondConcept, 'Second concept should be on line 2');
    });
  });

  describe('Wildcard expression', () => {
    test('should tokenize standalone wildcard', () => {
      const tokens = computeSemanticTokens('*');
      const vars = tokensOfType(tokens, TOKEN_VARIABLE);
      assert.equal(vars.length, 1, 'Should have one wildcard token');
      assert.equal(vars[0].line, 0);
      assert.equal(vars[0].character, 0);
      assert.equal(vars[0].length, 1);
    });
  });
});
