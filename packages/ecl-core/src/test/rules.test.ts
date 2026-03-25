// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getIndentString,
  formatLogicalOperator,
  formatRefinementColon,
  formatRefinementEquals,
  normalizeTerm,
  shouldBreakLine,
} from '../formatter/rules';
import { FormattingOptions, defaultFormattingOptions } from '../formatter/options';

function makeOptions(overrides: Partial<FormattingOptions> = {}): FormattingOptions {
  return { ...defaultFormattingOptions, ...overrides };
}

describe('rules — getIndentString', () => {
  test('level 0 returns empty string with spaces', () => {
    const result = getIndentString(0, makeOptions({ indentStyle: 'space', indentSize: 2 }));
    assert.strictEqual(result, '');
  });

  test('level 0 returns empty string with tabs', () => {
    const result = getIndentString(0, makeOptions({ indentStyle: 'tab' }));
    assert.strictEqual(result, '');
  });

  test('level 1 with 2-space indent', () => {
    const result = getIndentString(1, makeOptions({ indentStyle: 'space', indentSize: 2 }));
    assert.strictEqual(result, '  ');
  });

  test('level 2 with 2-space indent', () => {
    const result = getIndentString(2, makeOptions({ indentStyle: 'space', indentSize: 2 }));
    assert.strictEqual(result, '    ');
  });

  test('level 3 with 2-space indent', () => {
    const result = getIndentString(3, makeOptions({ indentStyle: 'space', indentSize: 2 }));
    assert.strictEqual(result, '      ');
  });

  test('level 1 with 4-space indent', () => {
    const result = getIndentString(1, makeOptions({ indentStyle: 'space', indentSize: 4 }));
    assert.strictEqual(result, '    ');
  });

  test('level 2 with 4-space indent', () => {
    const result = getIndentString(2, makeOptions({ indentStyle: 'space', indentSize: 4 }));
    assert.strictEqual(result, '        ');
  });

  test('level 1 with 1-space indent', () => {
    const result = getIndentString(1, makeOptions({ indentStyle: 'space', indentSize: 1 }));
    assert.strictEqual(result, ' ');
  });

  test('level 1 with tab indent', () => {
    const result = getIndentString(1, makeOptions({ indentStyle: 'tab' }));
    assert.strictEqual(result, '\t');
  });

  test('level 2 with tab indent', () => {
    const result = getIndentString(2, makeOptions({ indentStyle: 'tab' }));
    assert.strictEqual(result, '\t\t');
  });

  test('level 3 with tab indent', () => {
    const result = getIndentString(3, makeOptions({ indentStyle: 'tab' }));
    assert.strictEqual(result, '\t\t\t');
  });

  test('tab indent ignores indentSize', () => {
    const result = getIndentString(1, makeOptions({ indentStyle: 'tab', indentSize: 8 }));
    assert.strictEqual(result, '\t');
  });
});

describe('rules — formatLogicalOperator', () => {
  test('AND with spaceAroundOperators true', () => {
    const result = formatLogicalOperator('AND', makeOptions({ spaceAroundOperators: true }));
    assert.strictEqual(result, ' AND ');
  });

  test('OR with spaceAroundOperators true', () => {
    const result = formatLogicalOperator('OR', makeOptions({ spaceAroundOperators: true }));
    assert.strictEqual(result, ' OR ');
  });

  test('MINUS with spaceAroundOperators true', () => {
    const result = formatLogicalOperator('MINUS', makeOptions({ spaceAroundOperators: true }));
    assert.strictEqual(result, ' MINUS ');
  });

  test('AND with spaceAroundOperators false', () => {
    const result = formatLogicalOperator('AND', makeOptions({ spaceAroundOperators: false }));
    assert.strictEqual(result, 'AND');
  });

  test('OR with spaceAroundOperators false', () => {
    const result = formatLogicalOperator('OR', makeOptions({ spaceAroundOperators: false }));
    assert.strictEqual(result, 'OR');
  });

  test('MINUS with spaceAroundOperators false', () => {
    const result = formatLogicalOperator('MINUS', makeOptions({ spaceAroundOperators: false }));
    assert.strictEqual(result, 'MINUS');
  });

  test('uses default options (spaceAroundOperators true)', () => {
    const result = formatLogicalOperator('AND', defaultFormattingOptions);
    assert.strictEqual(result, ' AND ');
  });
});

describe('rules — formatRefinementColon', () => {
  test('returns colon with no space before and one space after', () => {
    const result = formatRefinementColon(':');
    assert.strictEqual(result, ': ');
  });

  test('output starts with the operator passed in', () => {
    const result = formatRefinementColon(':');
    assert.ok(result.startsWith(':'));
  });

  test('output ends with a single space', () => {
    const result = formatRefinementColon(':');
    assert.ok(result.endsWith(' '));
    assert.strictEqual(result.length, 2);
  });
});

describe('rules — formatRefinementEquals', () => {
  test('returns equals with space on both sides', () => {
    const result = formatRefinementEquals('=');
    assert.strictEqual(result, ' = ');
  });

  test('output starts with a space', () => {
    const result = formatRefinementEquals('=');
    assert.ok(result.startsWith(' '));
  });

  test('output ends with a space', () => {
    const result = formatRefinementEquals('=');
    assert.ok(result.endsWith(' '));
  });

  test('total length is operator length + 2 spaces', () => {
    const result = formatRefinementEquals('=');
    assert.strictEqual(result.length, 3);
  });
});

describe('rules — normalizeTerm', () => {
  test('basic term with normal spacing', () => {
    const result = normalizeTerm('Clinical finding');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('extra internal spaces collapsed to single space', () => {
    const result = normalizeTerm('Clinical   finding');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('newlines replaced and collapsed', () => {
    const result = normalizeTerm('Clinical\nfinding');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('tabs replaced and collapsed', () => {
    const result = normalizeTerm('Clinical\tfinding');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('mixed whitespace (newlines, tabs, spaces) collapsed', () => {
    const result = normalizeTerm('Clinical \n\t  finding');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('empty term content returns pipes with space', () => {
    const result = normalizeTerm('');
    assert.strictEqual(result, ' |  |');
  });

  test('whitespace-only term content returns pipes with space', () => {
    const result = normalizeTerm('   ');
    assert.strictEqual(result, ' |  |');
  });

  test('single character term', () => {
    const result = normalizeTerm('X');
    assert.strictEqual(result, ' | X |');
  });

  test('leading whitespace is trimmed', () => {
    const result = normalizeTerm('  Clinical finding');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('trailing whitespace is trimmed', () => {
    const result = normalizeTerm('Clinical finding  ');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('leading and trailing whitespace is trimmed', () => {
    const result = normalizeTerm('  Clinical finding  ');
    assert.strictEqual(result, ' | Clinical finding |');
  });

  test('preserves words separated by single space', () => {
    const result = normalizeTerm('one two three four');
    assert.strictEqual(result, ' | one two three four |');
  });

  test('multi-word term with varied whitespace', () => {
    const result = normalizeTerm('  Disorder   of\n  lung\t structure ');
    assert.strictEqual(result, ' | Disorder of lung structure |');
  });
});

describe('rules — shouldBreakLine', () => {
  test('length below maxLineLength returns false', () => {
    const result = shouldBreakLine(50, makeOptions({ maxLineLength: 80 }));
    assert.strictEqual(result, false);
  });

  test('length equal to maxLineLength returns false', () => {
    const result = shouldBreakLine(80, makeOptions({ maxLineLength: 80 }));
    assert.strictEqual(result, false);
  });

  test('length above maxLineLength returns true', () => {
    const result = shouldBreakLine(81, makeOptions({ maxLineLength: 80 }));
    assert.strictEqual(result, true);
  });

  test('length of 1 above maxLineLength returns true', () => {
    const result = shouldBreakLine(101, makeOptions({ maxLineLength: 100 }));
    assert.strictEqual(result, true);
  });

  test('maxLineLength 0 always returns false regardless of length', () => {
    const result = shouldBreakLine(999, makeOptions({ maxLineLength: 0 }));
    assert.strictEqual(result, false);
  });

  test('maxLineLength 0 with length 0 returns false', () => {
    const result = shouldBreakLine(0, makeOptions({ maxLineLength: 0 }));
    assert.strictEqual(result, false);
  });

  test('length 0 with non-zero maxLineLength returns false', () => {
    const result = shouldBreakLine(0, makeOptions({ maxLineLength: 80 }));
    assert.strictEqual(result, false);
  });

  test('uses default options (maxLineLength 80)', () => {
    assert.strictEqual(shouldBreakLine(80, defaultFormattingOptions), false);
    assert.strictEqual(shouldBreakLine(81, defaultFormattingOptions), true);
  });
});
