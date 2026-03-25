// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { validateIndentSize, validateIndentStyle, validateMaxLineLength, validateBoolean } from '../formatter/config';

describe('Formatter config validation', () => {
  // ── validateIndentSize ──────────────────────────────────────────────

  describe('validateIndentSize', () => {
    // Valid values
    test('should accept 1 (lower boundary)', () => {
      assert.strictEqual(validateIndentSize(1), 1);
    });

    test('should accept 4 (mid-range)', () => {
      assert.strictEqual(validateIndentSize(4), 4);
    });

    test('should accept 8 (upper boundary)', () => {
      assert.strictEqual(validateIndentSize(8), 8);
    });

    // Fractional values
    test('should floor fractional value 2.5 to 2', () => {
      assert.strictEqual(validateIndentSize(2.5), 2);
    });

    test('should floor fractional value 7.9 to 7', () => {
      assert.strictEqual(validateIndentSize(7.9), 7);
    });

    // Out-of-range values
    test('should reject 0 and return default (2)', () => {
      assert.strictEqual(validateIndentSize(0), 2);
    });

    test('should reject 9 and return default (2)', () => {
      assert.strictEqual(validateIndentSize(9), 2);
    });

    test('should reject negative number and return default (2)', () => {
      assert.strictEqual(validateIndentSize(-1), 2);
    });

    // Non-number types
    test('should reject string and return default (2)', () => {
      assert.strictEqual(validateIndentSize('4'), 2);
    });

    test('should reject boolean and return default (2)', () => {
      assert.strictEqual(validateIndentSize(true), 2);
    });

    test('should reject null and return default (2)', () => {
      assert.strictEqual(validateIndentSize(null), 2);
    });

    test('should accept undefined silently and return default (2)', () => {
      assert.strictEqual(validateIndentSize(undefined), 2);
    });

    test('should reject NaN and return default (2)', () => {
      assert.strictEqual(validateIndentSize(NaN), 2);
    });

    test('should reject Infinity and return default (2)', () => {
      assert.strictEqual(validateIndentSize(Infinity), 2);
    });
  });

  // ── validateIndentStyle ─────────────────────────────────────────────

  describe('validateIndentStyle', () => {
    // Valid values
    test('should accept "space"', () => {
      assert.strictEqual(validateIndentStyle('space'), 'space');
    });

    test('should accept "tab"', () => {
      assert.strictEqual(validateIndentStyle('tab'), 'tab');
    });

    // Invalid strings
    test('should reject "spaces" and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle('spaces'), 'space');
    });

    test('should reject "tabs" and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle('tabs'), 'space');
    });

    test('should reject empty string and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle(''), 'space');
    });

    test('should reject "SPACE" (case-sensitive) and return default', () => {
      assert.strictEqual(validateIndentStyle('SPACE'), 'space');
    });

    // Non-string types
    test('should reject number and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle(2), 'space');
    });

    test('should reject boolean and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle(true), 'space');
    });

    test('should reject null and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle(null), 'space');
    });

    test('should accept undefined silently and return default ("space")', () => {
      assert.strictEqual(validateIndentStyle(undefined), 'space');
    });
  });

  // ── validateMaxLineLength ───────────────────────────────────────────

  describe('validateMaxLineLength', () => {
    // Valid values
    test('should accept 0 (no wrapping)', () => {
      assert.strictEqual(validateMaxLineLength(0), 0);
    });

    test('should accept 80 (typical default)', () => {
      assert.strictEqual(validateMaxLineLength(80), 80);
    });

    test('should accept 120 (wide terminal)', () => {
      assert.strictEqual(validateMaxLineLength(120), 120);
    });

    // Fractional values
    test('should floor fractional value 80.7 to 80', () => {
      assert.strictEqual(validateMaxLineLength(80.7), 80);
    });

    test('should floor fractional value 0.9 to 0', () => {
      assert.strictEqual(validateMaxLineLength(0.9), 0);
    });

    // Invalid values
    test('should reject -1 and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength(-1), 80);
    });

    test('should reject NaN and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength(NaN), 80);
    });

    test('should reject -Infinity and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength(-Infinity), 80);
    });

    // Non-number types
    test('should reject string and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength('80'), 80);
    });

    test('should reject boolean and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength(false), 80);
    });

    test('should reject null and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength(null), 80);
    });

    test('should accept undefined silently and return default (80)', () => {
      assert.strictEqual(validateMaxLineLength(undefined), 80);
    });
  });

  // ── validateBoolean ─────────────────────────────────────────────────

  describe('validateBoolean', () => {
    // Valid booleans
    test('should return true when value is true', () => {
      assert.strictEqual(validateBoolean(true, false), true);
    });

    test('should return false when value is false', () => {
      assert.strictEqual(validateBoolean(false, true), false);
    });

    // Non-boolean types with default true
    test('should return default true for string input', () => {
      assert.strictEqual(validateBoolean('true', true), true);
    });

    test('should return default true for number input', () => {
      assert.strictEqual(validateBoolean(1, true), true);
    });

    test('should return default true for null input', () => {
      assert.strictEqual(validateBoolean(null, true), true);
    });

    test('should return default true for undefined input', () => {
      assert.strictEqual(validateBoolean(undefined, true), true);
    });

    // Non-boolean types with default false
    test('should return default false for string input', () => {
      assert.strictEqual(validateBoolean('false', false), false);
    });

    test('should return default false for number input', () => {
      assert.strictEqual(validateBoolean(0, false), false);
    });

    test('should return default false for null input', () => {
      assert.strictEqual(validateBoolean(null, false), false);
    });

    test('should return default false for undefined input', () => {
      assert.strictEqual(validateBoolean(undefined, false), false);
    });
  });
});
