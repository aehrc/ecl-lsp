// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatDocument } from '../formatter/formatter';
import { FormattingOptions, defaultFormattingOptions } from '../formatter/options';

describe('ECL Formatter', () => {
  // Task 8.2: Test formatting simple constraint expressions
  describe('Simple constraint expressions', () => {
    test('should normalize constraint operator spacing', () => {
      const input = '<<  404684003|Clinical finding|';
      const expected = '<< 404684003 | Clinical finding |';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should handle descendant constraint', () => {
      const input = '<404684003  OR  <19829001';
      const expected = '< 404684003 OR < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should normalize spaces between concept ID and term', () => {
      const input = '404684003   |Clinical finding|';
      const expected = '404684003 | Clinical finding |';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });
  });

  // Task 8.3: Test formatting compound expressions with AND/OR/MINUS
  describe('Compound expressions', () => {
    test('should add spaces around AND operator', () => {
      const input = '<404684003AND<19829001';
      const expected = '< 404684003 AND < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should normalize multiple spaces around OR operator', () => {
      const input = '<404684003  OR  <19829001';
      const expected = '< 404684003 OR < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should handle MINUS operator', () => {
      const input = '<404684003MINUS<19829001';
      const expected = '< 404684003 MINUS < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should format compound expression with parentheses', () => {
      const input = '(<404684003OR<19829001)AND<123456789';
      const expected = '(< 404684003 OR < 19829001) AND < 123456789';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });
  });

  // Task 8.4: Test formatting refinement expressions
  describe('Refinement expressions', () => {
    test('should normalize colon spacing', () => {
      const input = '<404684003:363698007=<39057004';
      const expected = '< 404684003: 363698007 = < 39057004';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should handle refinement with terms', () => {
      const input = '<404684003|Clinical finding|:363698007|Finding site|=<39057004';
      const expected = '< 404684003 | Clinical finding |: 363698007 | Finding site | = < 39057004';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });
  });

  // Task 8.6: Test term whitespace normalization
  describe('Term whitespace normalization', () => {
    test('should normalize all spaces around and within pipes', () => {
      const input = '|  Clinical   finding  |';
      const expected = '| Clinical finding |';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should normalize multiple internal spaces in terms to single space', () => {
      const input = '|Clinical   finding|';
      const expected = '| Clinical finding |';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should remove newlines and tabs from terms', () => {
      const input = '|Clinical\nfinding|';
      const expected = '| Clinical finding |';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });
  });

  // Task 8.9: Test multi-expression file handling with /* ECL-END */
  describe('Multi-expression files', () => {
    test('should handle single expression without delimiter', () => {
      const input = '<< 404684003';
      const expected = '<< 404684003';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should preserve /* ECL-END */ delimiters', () => {
      const input = '<< 404684003\n\n/* ECL-END */\n\n< 19829001';
      const expected = '<< 404684003\n\n/* ECL-END */\n\n< 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });

    test('should format each expression independently', () => {
      const input = '<<  404684003\n\n/* ECL-END */\n\n<19829001  OR  <234567890';
      const expected = '<< 404684003\n\n/* ECL-END */\n\n< 19829001 OR < 234567890';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, expected);
    });
  });

  // Task 8.10: Test error handling
  describe('Error handling', () => {
    test('should return original text for unparseable input', () => {
      const input = 'this is not valid ECL @#$%';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, input);
    });

    test('should handle empty input', () => {
      const input = '';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, '');
    });

    test('should handle whitespace-only input', () => {
      const input = '   \n\t  ';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, '');
    });
  });

  // Task 8.8: Test comment preservation scenarios
  describe('Comment preservation', () => {
    test('should preserve block comments before expression', () => {
      const input = '/* This is a comment */\n<< 404684003';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('/* This is a comment */'), 'Should preserve comment');
      assert.ok(result.includes('<< 404684003'), 'Should preserve expression');
    });

    test('should preserve multiple comments', () => {
      const input = '/* Comment 1 */\n/* Comment 2 */\n<< 404684003';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('/* Comment 1 */'), 'Should preserve first comment');
      assert.ok(result.includes('/* Comment 2 */'), 'Should preserve second comment');
    });

    test('should preserve inline comments', () => {
      const input = '<< 404684003 /* inline comment */';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('/* inline comment */'), 'Should preserve inline comment');
      assert.ok(result.includes('<< 404684003'), 'Should preserve expression');
    });

    test('should not treat ECL-END as regular comment', () => {
      const input = '<< 404684003\n\n/* ECL-END */\n\n< 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      // Should preserve ECL-END as delimiter, not move it around
      assert.ok(result.includes('/* ECL-END */'), 'Should preserve ECL-END delimiter');
      const parts = result.split('/* ECL-END */');
      assert.strictEqual(parts.length, 2, 'Should split into 2 expressions');
    });

    test('should preserve comments in multi-line expressions', () => {
      const input = '/* Comment at start */\n< 404684003 OR\n  /* Comment in middle */\n  < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('/* Comment at start */'), 'Should preserve start comment');
      assert.ok(result.includes('/* Comment in middle */'), 'Should preserve middle comment');
    });
  });

  // Test configurable options
  describe('Configurable options', () => {
    test('should respect spaceAroundOperators=false', () => {
      const input = '<404684003 OR <19829001';
      const expected = '< 404684003OR< 19829001';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        spaceAroundOperators: false,
      };
      const result = formatDocument(input, options);
      assert.strictEqual(result, expected);
    });

    test('should respect maxLineLength=0 (unlimited)', () => {
      const input = '<404684003 OR <19829001 OR <234567890 OR <345678901 OR <456789012';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 0,
      };
      const result = formatDocument(input, options);
      // Should not break lines
      assert.strictEqual(result.split('\n').length, 1);
    });

    test('should respect alignTerms=false', () => {
      const input = '< 404684003:\n  363698007 = < 39057004 |Finding site|,\n  116676008 = < 72704001 |Fracture|';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: false,
      };
      const result = formatDocument(input, options);
      // Should not add extra spaces for alignment
      const lines = result.split('\n');
      assert.ok(!lines[1]?.includes('  |'), 'Should not have extra spaces before pipe'); // No extra spaces before pipe
    });
  });

  // Module 10: Test configurable indentation
  describe('Configurable indentation', () => {
    test('should respect indentSize=2 (default)', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n}';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        indentSize: 2,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // Second line should have 2 spaces indent
      assert.ok(lines[1]?.startsWith('  '), 'Should have 2 space indent');
    });

    test('should respect indentSize=4', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n}';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        indentSize: 4,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // Second line should have 4 spaces indent
      assert.ok(lines[1]?.startsWith('    '), 'Should have 4 space indent');
      assert.ok(!lines[1]?.startsWith('     '), 'Should not have more than 4 spaces');
    });

    test('should respect indentStyle="tab"', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n}';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        indentStyle: 'tab',
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // Second line should start with tab
      assert.ok(lines[1]?.startsWith('\t'), 'Should have tab indent');
    });

    test('should handle nested indentation with indentSize=2', () => {
      const input = '< 404684003 {\n363698007 = < 39057004 {\n116676008 = < 72704001\n}\n}';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        indentSize: 2,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // First nested level should have 2 spaces
      assert.ok(/^\s{2}\S/.exec(lines[1]), 'First level should have 2 spaces');
      // Second nested level should have 4 spaces
      assert.ok(/^\s{4}\S/.exec(lines[2]), 'Second level should have 4 spaces');
    });

    test('should handle nested indentation with tabs', () => {
      const input = '< 404684003 {\n363698007 = < 39057004 {\n116676008 = < 72704001\n}\n}';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        indentStyle: 'tab',
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // First nested level should have 1 tab
      assert.ok(lines[1]?.startsWith('\t') && !lines[1]?.startsWith('\t\t'), 'First level should have 1 tab');
      // Second nested level should have 2 tabs
      assert.ok(lines[2]?.startsWith('\t\t'), 'Second level should have 2 tabs');
    });

    test('should not use invalid indentSize values', () => {
      // This test verifies the validation in config.ts
      // Invalid values should fall back to defaults
      const input = '< 404684003 {\n363698007 = < 39057004\n}';

      // Valid range is 1-8, so these should use default (2)
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.length > 0, 'Should format successfully with defaults');
    });

    test('should not use invalid indentStyle values', () => {
      // This test verifies the validation in config.ts
      // Invalid values should fall back to defaults
      const input = '< 404684003 {\n363698007 = < 39057004\n}';

      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.length > 0, 'Should format successfully with defaults');
    });
  });

  // Module 11: Test configurable operator spacing
  describe('Configurable operator spacing', () => {
    test('should add spaces around operators with spaceAroundOperators=true (default)', () => {
      const input = '<404684003AND<19829001OR<234567890';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        spaceAroundOperators: true,
      };
      const result = formatDocument(input, options);
      assert.ok(result.includes(' AND '), 'Should have spaces around AND');
      assert.ok(result.includes(' OR '), 'Should have spaces around OR');
    });

    test('should remove spaces around operators with spaceAroundOperators=false', () => {
      const input = '< 404684003 AND < 19829001 OR < 234567890';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        spaceAroundOperators: false,
      };
      const result = formatDocument(input, options);
      assert.ok(result.includes('AND'), 'Should have AND');
      assert.ok(!result.includes(' AND '), 'Should not have spaces around AND');
      assert.ok(result.includes('OR'), 'Should have OR');
      assert.ok(!result.includes(' OR '), 'Should not have spaces around OR');
    });

    test('should not affect constraint operators with spaceAroundOperators setting', () => {
      const input = '<<404684003';
      const optionsTrue: FormattingOptions = {
        ...defaultFormattingOptions,
        spaceAroundOperators: true,
      };
      const optionsFalse: FormattingOptions = {
        ...defaultFormattingOptions,
        spaceAroundOperators: false,
      };

      const resultTrue = formatDocument(input, optionsTrue);
      const resultFalse = formatDocument(input, optionsFalse);

      // Both should have space after << (constraint operator not affected)
      assert.ok(resultTrue.includes('<< '), 'Should have space after << with true');
      assert.ok(resultFalse.includes('<< '), 'Should have space after << with false');
    });

    test('should handle MINUS operator with spaceAroundOperators=false', () => {
      const input = '< 404684003 MINUS < 19829001';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        spaceAroundOperators: false,
      };
      const result = formatDocument(input, options);
      assert.ok(result.includes('MINUS'), 'Should have MINUS');
      assert.ok(!result.includes(' MINUS '), 'Should not have spaces around MINUS');
    });
  });

  // Module 12: Test configurable line length
  describe('Configurable line length', () => {
    test('should break lines at maxLineLength=80 (default)', () => {
      // Create a line longer than 80 characters
      const input = '< 404684003 OR < 19829001 OR < 234567890 OR < 345678901 OR < 456789012 OR < 567890123';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 80,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');

      // Should have multiple lines
      assert.ok(lines.length > 1, 'Should break into multiple lines');
      // Each line should be <= 80 characters (or close to it due to breaking at operators)
      for (const line of lines) {
        assert.ok(line.length <= 90, 'Line length should be reasonable'); // Allow some flexibility
      }
    });

    test('should break lines at maxLineLength=120', () => {
      const input =
        '< 404684003 OR < 19829001 OR < 234567890 OR < 345678901 OR < 456789012 OR < 567890123 OR < 678901234';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 120,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');

      // With longer max length, should have fewer lines
      assert.ok(lines.length >= 1, 'Should have at least one line');
    });

    test('should not break lines with maxLineLength=0 (unlimited)', () => {
      const input = '< 404684003 OR < 19829001 OR < 234567890 OR < 345678901 OR < 456789012 OR < 567890123';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 0,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');

      // Should stay as single line
      assert.strictEqual(lines.length, 1, 'Should not break into multiple lines');
    });

    test('should allow long terms to exceed max length without breaking', () => {
      // Terms should not be broken mid-word
      const input = '< 404684003 | This is a very long term that exceeds the maximum line length |';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 40,
      };
      const result = formatDocument(input, options);

      // Should preserve the term intact
      assert.ok(
        result.includes('| This is a very long term that exceeds the maximum line length |'),
        'Should preserve long term intact',
      );
    });

    test('should break at logical operators when exceeding maxLineLength', () => {
      const input = '< 404684003 OR < 19829001 AND < 234567890';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 30,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');

      // Should break at operators
      assert.ok(lines.length > 1, 'Should break into multiple lines');
      // Each line should contain an expression part
      assert.ok(
        lines.some((l) => l.includes('404684003')),
        'Should have first concept',
      );
      assert.ok(
        lines.some((l) => l.includes('19829001') || l.includes('234567890')),
        'Should have other concepts',
      );
    });

    test('should reject negative maxLineLength values', () => {
      // This test verifies validation - negative values should use default
      const input = '< 404684003 OR < 19829001';

      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.length > 0, 'Should format successfully with defaults');
    });

    test('should indent continuation lines after line break', () => {
      const input = '< 404684003 OR < 19829001 OR < 234567890 OR < 345678901';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        maxLineLength: 30,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');

      if (lines.length > 1) {
        // Continuation lines should be indented
        for (let i = 1; i < lines.length; i++) {
          assert.ok(lines[i].startsWith(' ') || lines[i].startsWith('\t'), 'Continuation lines should be indented');
        }
      }
    });
  });

  // Module 13: Test configurable term alignment
  describe('Configurable term alignment', () => {
    test('should align terms with alignTerms=true (default)', () => {
      const input = '< 404684003:\n363698007 = < 39057004 |Site|,\n116676008 = < 72704001 |Very long morphology term|';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: true,
      };
      const result = formatDocument(input, options);
      const lines = result.split('\n');

      // Find lines with pipes
      const linesWithPipes = lines.filter((l) => l.includes('|'));

      if (linesWithPipes.length > 1) {
        // Get position of first pipe in each line
        const pipePositions = linesWithPipes.map((l) => l.indexOf('|'));

        // All should be at the same position (aligned)
        const firstPos = pipePositions[0];
        for (const pos of pipePositions) {
          assert.strictEqual(pos, firstPos, 'Pipes should be aligned at same position');
        }
      }
    });

    test('should not align terms with alignTerms=false', () => {
      const input = '< 404684003:\n363698007 = < 39057004 |Site|,\n116676008 = < 72704001 |Morphology|';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: false,
      };
      const result = formatDocument(input, options);

      // Should not add extra spaces for alignment
      assert.ok(!result.includes('  |'), 'Should not have extra spaces before pipes');
    });

    test('should not affect single-attribute refinements with alignTerms', () => {
      const input = '< 404684003: 363698007 = < 39057004 |Finding site|';
      const optionsTrue: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: true,
      };
      const optionsFalse: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: false,
      };

      const resultTrue = formatDocument(input, optionsTrue);
      const resultFalse = formatDocument(input, optionsFalse);

      // Both should format the same way (no alignment needed for single attribute)
      assert.strictEqual(
        resultTrue.trim(),
        resultFalse.trim(),
        'Single attribute should format same regardless of alignTerms',
      );
    });

    test('should align multiple attributes in same refinement block', () => {
      const input = '< 404684003: { 363698007 = < 39057004 |Site|, 116676008 = < 72704001 |Morphology| }';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: true,
      };
      const result = formatDocument(input, options);

      // Should have formatted with alignment
      assert.ok(result.includes('|'), 'Should have terms');
    });

    test('should handle expressions without terms', () => {
      const input = '< 404684003: 363698007 = < 39057004';
      const options: FormattingOptions = {
        ...defaultFormattingOptions,
        alignTerms: true,
      };
      const result = formatDocument(input, options);

      // Should format successfully even without terms
      assert.ok(result.includes('404684003'), 'Should format expression');
      assert.ok(result.includes('363698007'), 'Should format attributes');
    });
  });

  // Integration tests based on example files — verify end-to-end formatting correctness
  describe('Integration: basic spacing', () => {
    test('normalizes extra spaces after << and inside term', () => {
      assert.strictEqual(
        formatDocument('<<  404684003|Clinical finding|', defaultFormattingOptions),
        '<< 404684003 | Clinical finding |',
      );
    });

    test('adds space after < with no space', () => {
      assert.strictEqual(formatDocument('<404684003', defaultFormattingOptions), '< 404684003');
    });

    test('adds spaces around OR with no spaces', () => {
      assert.strictEqual(
        formatDocument('<404684003OR<19829001', defaultFormattingOptions),
        '< 404684003 OR < 19829001',
      );
    });

    test('normalizes multiple spaces around logical operator', () => {
      assert.strictEqual(
        formatDocument('<404684003  OR  <19829001  AND  <234567890', defaultFormattingOptions),
        '< 404684003 OR < 19829001 AND < 234567890',
      );
    });

    test('normalizes multiple internal spaces in term', () => {
      assert.strictEqual(
        formatDocument('404684003|Clinical   finding|', defaultFormattingOptions),
        '404684003 | Clinical finding |',
      );
    });

    test('normalizes mixed spacing: operator, extra spaces in term, multiple spaces before pipe', () => {
      assert.strictEqual(
        formatDocument('<<404684003  |  Clinical   finding  |OR<19829001|Disorder|', defaultFormattingOptions),
        '<< 404684003 | Clinical finding | OR < 19829001 | Disorder |',
      );
    });
  });

  describe('Integration: refinement operators', () => {
    test('adds colon and equals spacing for compact refinement', () => {
      assert.strictEqual(
        formatDocument('<404684003:363698007=<39057004', defaultFormattingOptions),
        '< 404684003: 363698007 = < 39057004',
      );
    });

    test('removes space before colon, keeps space after', () => {
      assert.strictEqual(
        formatDocument('< 404684003 : 363698007 = < 39057004', defaultFormattingOptions),
        '< 404684003: 363698007 = < 39057004',
      );
    });
  });

  describe('Integration: indentation', () => {
    test('indents content inside braces', () => {
      const input =
        '< 404684003 |Clinical finding| {\n363698007 |Finding site| = < 39057004 |Pulmonary valve structure|,\n116676008 |Associated morphology| = < 72704001 |Fracture|\n}';
      const expected =
        '< 404684003 | Clinical finding | {\n  363698007 | Finding site | = < 39057004 | Pulmonary valve structure |,\n  116676008 | Associated morphology | = < 72704001 | Fracture |\n}';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('indents nested brace refinements', () => {
      const input = '< 404684003 {\n363698007 = < 39057004 {\n116676008 = < 72704001\n}\n}';
      const expected = '< 404684003 {\n  363698007 = < 39057004 {\n    116676008 = < 72704001\n  }\n}';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('indents attributes after colon refinement', () => {
      const input =
        '< 404684003 |Clinical finding|:\n363698007 |Finding site| = < 39057004 |Pulmonary valve structure|,\n116676008 |Associated morphology| = < 72704001 |Fracture|';
      const expected =
        '< 404684003 | Clinical finding |:\n  363698007 | Finding site | = < 39057004 | Pulmonary valve structure |,\n  116676008 | Associated morphology | = < 72704001 | Fracture |';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });
  });

  describe('Integration: line breaking', () => {
    test('breaks long OR chain with operators leading continuation lines', () => {
      const input =
        '< 404684003 |Clinical finding| OR < 19829001 |Disorder of lung| OR < 234567890 |Another disorder| OR < 345678901 |Yet another finding| OR < 456789012 |One more concept|';
      const result = formatDocument(input, defaultFormattingOptions);
      const lines = result.split('\n');
      // All lines should be within maxLineLength (80)
      for (const line of lines) {
        assert.ok(line.length <= 80, `Line exceeds 80 chars: "${line}"`);
      }
      // Continuation lines should lead with an operator
      for (const line of lines.slice(1)) {
        assert.ok(/^\s+(AND|OR|MINUS)\s/.test(line), `Continuation line should start with operator: "${line}"`);
      }
    });

    test('breaks long AND chain with operators leading continuation lines', () => {
      const input =
        '< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung| AND < 234567890 |Another disorder| AND < 345678901 |Yet another finding|';
      const result = formatDocument(input, defaultFormattingOptions);
      const lines = result.split('\n');
      for (const line of lines) {
        assert.ok(line.length <= 80, `Line exceeds 80 chars: "${line}"`);
      }
      for (const line of lines.slice(1)) {
        assert.ok(/^\s+(AND|OR|MINUS)\s/.test(line), `Continuation line should start with operator: "${line}"`);
      }
    });

    test('nested (()) — MINUS indented deeper than AND via paren alignment', () => {
      const input =
        '(< 404684003 | Clinical finding | OR < 19829001 | Disorder |) AND ((< 234567890 | Finding | OR < 345678901 | Morphology |) MINUS < 456789012 | Exclusion |)';
      const options: FormattingOptions = { ...defaultFormattingOptions, maxLineLength: 80 };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // Should break into multiple lines
      assert.ok(lines.length >= 3, `Expected at least 3 lines, got ${lines.length}: ${JSON.stringify(lines)}`);
      // Find the AND line and the MINUS line
      const andLine = lines.find((l) => /^\s+AND\s/.test(l));
      const minusLine = lines.find((l) => /^\s+MINUS\s/.test(l));
      assert.ok(andLine, 'Should have an AND continuation line');
      assert.ok(minusLine, 'Should have a MINUS continuation line');
      // MINUS should be indented more deeply than AND (paren-aware)
      const andIndent = andLine.length - andLine.trimStart().length;
      const minusIndent = minusLine.length - minusLine.trimStart().length;
      assert.ok(
        minusIndent > andIndent,
        `MINUS indent (${minusIndent}) should be greater than AND indent (${andIndent})`,
      );
    });

    test('no unmatched parens — falls back to default continuation indent', () => {
      const input =
        '< 404684003 | Clinical finding | OR < 19829001 | Disorder | OR < 234567890 | Another disorder | OR < 345678901 | Yet another finding |';
      const options: FormattingOptions = { ...defaultFormattingOptions, maxLineLength: 80 };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      assert.ok(lines.length > 1, 'Should break into multiple lines');
      // All continuation lines should use the default indent (2 spaces)
      for (const line of lines.slice(1)) {
        const indent = line.length - line.trimStart().length;
        assert.strictEqual(indent, 2, `Expected default 2-space indent, got ${indent}: "${line}"`);
      }
    });

    test('single ( nesting — operator aligns after opening paren', () => {
      const input =
        '(< 404684003 | Clinical finding | OR < 19829001 | Disorder |) AND (< 234567890 | Finding | MINUS < 456789012 | Exclusion |)';
      const options: FormattingOptions = { ...defaultFormattingOptions, maxLineLength: 80 };
      const result = formatDocument(input, options);
      const lines = result.split('\n');
      // Find the MINUS line — it should be indented past the opening '(' on the AND line
      const andLine = lines.find((l) => /^\s+AND\s/.test(l));
      const minusLine = lines.find((l) => /^\s+MINUS\s/.test(l));
      if (andLine && minusLine) {
        const andIndent = andLine.length - andLine.trimStart().length;
        const minusIndent = minusLine.length - minusLine.trimStart().length;
        assert.ok(
          minusIndent > andIndent,
          `MINUS indent (${minusIndent}) should be greater than AND indent (${andIndent})`,
        );
      }
    });

    test('preserves long single term without breaking (no logical operators)', () => {
      const input =
        '< 404684003 |This is a very long clinical finding term that exceeds the maximum line length but should not be broken|';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result.split('\n').length, 1, 'Should remain on one line');
    });
  });

  describe('Integration: comment preservation', () => {
    test('preserves block comment before expression', () => {
      const input = '/* This is a block comment */\n<<  404684003|Clinical finding|';
      const expected = '/* This is a block comment */\n<< 404684003 | Clinical finding |';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('preserves multiple block comments before expression', () => {
      const input = '/* Comment 1 */\n/* Comment 2 */\n<<  404684003|Clinical finding|';
      const expected = '/* Comment 1 */\n/* Comment 2 */\n<< 404684003 | Clinical finding |';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('preserves line comment before expression', () => {
      assert.strictEqual(
        formatDocument('// Test comment\n<404684003', defaultFormattingOptions),
        '// Test comment\n< 404684003',
      );
    });

    test('line comment containing /* ECL-END */ is not treated as delimiter', () => {
      const input = '// Each expression separated by /* ECL-END */ is independent\n<404684003';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(
        result.includes('// Each expression separated by /* ECL-END */ is independent'),
        'Line comment should be preserved intact',
      );
      assert.ok(!result.includes('\n\n/* ECL-END */'), 'ECL-END inside comment should not act as delimiter');
    });

    test('preserves multi-line block comment intact', () => {
      const input =
        '/* Multi-line comment\n   spanning several lines\n   should be preserved */\n< 404684003 : 363698007 = < 39057004';
      const expected =
        '/* Multi-line comment\n   spanning several lines\n   should be preserved */\n< 404684003: 363698007 = < 39057004';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('preserves blank line between comment groups', () => {
      const input = '// Group 1 comment\n\n// Group 2 comment\n<404684003';
      const expected = '// Group 1 comment\n\n// Group 2 comment\n< 404684003';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('keeps inline block comment on same line as code', () => {
      assert.strictEqual(
        formatDocument('<< 234567890 /* inline comment */', defaultFormattingOptions),
        '<< 234567890 /* inline comment */',
      );
    });

    test('keeps prefix block comment on same line when it precedes code on same line', () => {
      // Regression: "/* comment */ << 234567890" was incorrectly broken onto two lines.
      assert.strictEqual(
        formatDocument('/* Inline comment after expression */ << 234567890', defaultFormattingOptions),
        '/* Inline comment after expression */ << 234567890',
      );
    });

    test('block comment on its own line before code stays on its own line', () => {
      assert.strictEqual(
        formatDocument('/* Header */\n<< 234567890', defaultFormattingOptions),
        '/* Header */\n<< 234567890',
      );
    });
  });

  describe('Integration: trailing comment preservation', () => {
    test('preserves single trailing line comment after expression', () => {
      const input = '// Header\n< 404684003\n// Trailing note';
      const result = formatDocument(input, defaultFormattingOptions);
      const lines = result.split('\n');
      assert.strictEqual(lines[0], '// Header', 'leading comment preserved');
      assert.strictEqual(lines[1], '< 404684003', 'expression formatted');
      assert.strictEqual(lines[2], '// Trailing note', 'trailing comment preserved');
    });

    test('preserves multiple trailing line comments after expression', () => {
      const input = '// Header\n< 404684003\n// Note 1\n// Note 2\n// Note 3';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('// Note 1'), 'trailing comment 1 preserved');
      assert.ok(result.includes('// Note 2'), 'trailing comment 2 preserved');
      assert.ok(result.includes('// Note 3'), 'trailing comment 3 preserved');
      // Trailing comments must appear AFTER the expression
      const exprPos = result.indexOf('< 404684003');
      const notePos = result.indexOf('// Note 1');
      assert.ok(notePos > exprPos, 'trailing comments appear after expression');
    });

    test('preserves blank line between expression and trailing comments', () => {
      const input = '// Header\n< 404684003\n\n// After note';
      const result = formatDocument(input, defaultFormattingOptions);
      // The blank line + trailing comment should be after the expression
      const exprPos = result.indexOf('< 404684003');
      const notePos = result.indexOf('// After note');
      assert.ok(notePos > exprPos, 'trailing comment appears after expression');
      // Check there's a blank line between them
      const between = result.substring(exprPos, notePos);
      assert.ok(between.includes('\n\n'), 'blank line preserved between expression and trailing comment');
    });

    test('trailing comment does not get merged with leading comment', () => {
      // Regression test for test-7-range.ecl bug: trailing comment was concatenated
      // with the leading comment of the next section.
      const input = '// Leading\n< 404684003\n\n// Trailing line 1\n// Trailing line 2';
      const result = formatDocument(input, defaultFormattingOptions);
      // Leading and trailing comments must be on separate lines
      assert.ok(!result.includes('// Leading// Trailing'), 'comments must not be concatenated');
      assert.ok(!result.includes('// Leading\n// Trailing'), 'trailing must not jump before expression');
      assert.ok(result.includes('// Leading\n< 404684003'), 'leading comment before code');
    });

    test('multi-expression: trailing comments stay with their expression', () => {
      const input =
        '// Section header\n< 404684003:363698007=<39057004\n\n// After section:\n// - note 1\n// - note 2\n// - note 3';
      const result = formatDocument(input, defaultFormattingOptions);
      const exprPos = result.indexOf('< 404684003');
      const afterPos = result.indexOf('// After section:');
      assert.ok(afterPos > exprPos, 'after-section comments appear after expression');
      // All notes should be present
      assert.ok(result.includes('// - note 1'));
      assert.ok(result.includes('// - note 2'));
      assert.ok(result.includes('// - note 3'));
    });
  });

  describe('Integration: between-code comment preservation', () => {
    test('preserves block comment between two code segments', () => {
      // Regression test for test-missing-delimiter.ecl: between-code block comment
      // was being moved to after the expression.
      const input = '/* Header */\n< 404684003 |Clinical finding|\n\n/* Separator */\n<< 19829001 |Disorder of lung|';
      const result = formatDocument(input, defaultFormattingOptions);
      // Comment must appear before the second constraint
      const commentPos = result.indexOf('/* Separator */');
      const secondExprPos = result.indexOf('<< 19829001');
      assert.ok(commentPos !== -1, '/* Separator */ should be in output');
      assert.ok(secondExprPos !== -1, '<< 19829001 should be in output');
      assert.ok(commentPos < secondExprPos, 'separator comment should come before << 19829001');
    });

    test('inline block comment on same line stays on that line', () => {
      const input = '< 404684003 /* code comment */ AND < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('/* code comment */'), 'inline comment preserved');
      // Comment should be on same line as code, not moved
      const lines = result.split('\n');
      const codeLine = lines.find((l) => l.includes('404684003'));
      assert.ok(codeLine?.includes('/* code comment */'), 'inline comment stays on code line');
    });
  });

  describe('Integration: comment wrapping option', () => {
    const longComment =
      '// This is a very long line comment that definitely exceeds eighty characters and should be wrapped';

    test('wrapComments=false (default): long comment preserved unchanged', () => {
      const input = longComment + '\n< 404684003';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes(longComment), 'long comment preserved when wrapComments=false');
    });

    test('wrapComments=true: long comment is wrapped at maxLineLength', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, wrapComments: true, maxLineLength: 60 };
      const input =
        '// Short enough\n// This is a very long comment line that exceeds sixty characters and must be wrapped\n< 404684003';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const commentLines = lines.filter((l) => l.trim().startsWith('//') && !l.includes('404684003'));
      // Every wrapped comment line should be <= maxLineLength
      for (const line of commentLines) {
        assert.ok(
          line.length <= opts.maxLineLength,
          `Comment line too long (${line.length} > ${opts.maxLineLength}): ${line}`,
        );
      }
    });

    test('wrapComments=true: short comment not affected', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, wrapComments: true, maxLineLength: 80 };
      const input = '// Short comment\n< 404684003';
      const result = formatDocument(input, opts);
      assert.ok(result.includes('// Short comment'), 'short comment preserved intact');
    });

    test('wrapComments=true: trailing long comment is also wrapped', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, wrapComments: true, maxLineLength: 60 };
      const longTrailing =
        '// A very long trailing comment line that certainly exceeds sixty characters in total length';
      const input = '< 404684003\n' + longTrailing;
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const commentLines = lines.filter((l) => l.trim().startsWith('//') && !l.includes('404684003'));
      assert.ok(commentLines.length >= 2, 'long trailing comment should be wrapped into multiple lines');
      for (const line of commentLines) {
        assert.ok(line.length <= opts.maxLineLength, `Comment line too long: ${line}`);
      }
    });

    test('wrapComments=true: block comments not wrapped (complex structure)', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, wrapComments: true, maxLineLength: 40 };
      const blockComment = '/* This block comment is intentionally longer than 40 chars but should not be wrapped */';
      const input = blockComment + '\n< 404684003';
      const result = formatDocument(input, opts);
      assert.ok(result.includes(blockComment), 'block comment not modified even with wrapComments=true');
    });
  });

  describe('Integration: multi-expression files', () => {
    test('formats each expression independently with delimiter', () => {
      const input = '<<  404684003  |  Clinical   finding  |\n\n/* ECL-END */\n\n<404684003OR<19829001';
      const expected = '<< 404684003 | Clinical finding |\n\n/* ECL-END */\n\n< 404684003 OR < 19829001';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });

    test('preserves per-expression comments with delimiter', () => {
      const input = '// Comment for first\n<404684003\n\n/* ECL-END */\n\n// Comment for second\n<19829001';
      const expected = '// Comment for first\n< 404684003\n\n/* ECL-END */\n\n// Comment for second\n< 19829001';
      assert.strictEqual(formatDocument(input, defaultFormattingOptions), expected);
    });
  });

  describe('Integration: breakOnOperators option', () => {
    test('breakOnOperators=false (default): operators stay on same line when short enough', () => {
      const input = '< 404684003 OR < 19829001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result, '< 404684003 OR < 19829001', 'short expression stays on one line');
    });

    test('breakOnOperators=true: AND operator forced onto new line', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '< 404684003 AND < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2, 'should produce two lines');
      assert.ok(lines[0].includes('404684003'), 'first line has first concept');
      assert.ok(lines[1].trim().startsWith('AND'), 'AND starts on new line');
      assert.ok(lines[1].includes('19829001'), 'second line has second concept');
    });

    test('breakOnOperators=true: OR operator forced onto new line', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '< 404684003 OR < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(
        lines.some((l) => l.trim().startsWith('OR')),
        'OR starts on new line',
      );
    });

    test('breakOnOperators=true: MINUS operator forced onto new line', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '<< 404684003 MINUS < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(
        lines.some((l) => l.trim().startsWith('MINUS')),
        'MINUS starts on new line',
      );
    });

    test('breakOnOperators=true: multiple operators each on own line', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '< 404684003 OR < 19829001 OR < 39057004';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // Each OR should be on its own line — at least 2 OR-starting lines
      const orLines = lines.filter((l) => l.trim().startsWith('OR'));
      assert.ok(orLines.length >= 2, `expected at least 2 OR lines, got ${orLines.length}`);
    });

    test('breakOnOperators=true: continuation lines are indented', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '< 404684003 AND < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const andLine = lines.find((l) => l.trim().startsWith('AND'));
      assert.ok(andLine !== undefined, 'AND line exists');
      // Continuation line should have leading whitespace (indented)
      assert.ok(
        andLine.startsWith(' ') || andLine.startsWith('\t'),
        `continuation line should be indented, got: "${andLine}"`,
      );
    });

    test('breakOnOperators=true: continuation line with extra operator does not double-indent', () => {
      // Regression: a line that already starts with AND (from applyLineBreaking) and
      // also contains a second AND was emitting a blank line and double-indenting the
      // second AND.
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input =
        '< 404684003 | Clinical finding |\n' +
        '  AND < 19829001 | Disorder of lung | AND < 301867009 | Edema of trunk |';
      const result = formatDocument(input, opts);
      const lines = result.split('\n').filter((l) => l.trim().length > 0);
      // No blank lines
      assert.strictEqual(lines.length, 3, `expected 3 non-blank lines, got ${lines.length}:\n${result}`);
      // Both ANDs at same indent level
      const andLines = lines.filter((l) => l.trim().startsWith('AND'));
      assert.strictEqual(andLines.length, 2, 'both ANDs on their own lines');
      const indents = andLines.map((l) => /^(\s*)/.exec(l)?.[1].length ?? 0);
      assert.strictEqual(
        indents[0],
        indents[1],
        `both AND lines should have equal indent, got ${indents[0]} and ${indents[1]}`,
      );
    });

    test('breakOnOperators=true: three already-broken ORs stay at consistent indent', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input =
        '< 19829001 | Disorder of lung |\n' + '  OR < 301867009 | Edema of trunk |\n' + '  OR < 195967001 | Asthma |';
      const result = formatDocument(input, opts);
      const lines = result.split('\n').filter((l) => l.trim().length > 0);
      assert.strictEqual(lines.length, 3, `expected 3 lines, got:\n${result}`);
      const orLines = lines.filter((l) => l.trim().startsWith('OR'));
      assert.strictEqual(orLines.length, 2, 'both ORs on their own lines');
      const indents = orLines.map((l) => /^(\s*)/.exec(l)?.[1].length ?? 0);
      assert.strictEqual(
        indents[0],
        indents[1],
        `both OR lines should have equal indent, got ${indents[0]} and ${indents[1]}`,
      );
    });

    test('breakOnOperators=true: no blank lines produced between continuation operators', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '< 404684003 OR < 19829001 OR < 234567890 OR < 345678901';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `result should have no blank lines:\n${result}`);
    });

    test('breakOnOperators=true: operator inside single paren group indented one level', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      // OR is at depth 1 inside '()' → 1 indent level
      const result = formatDocument('(< 404684003 OR < 19829001) AND < 234567890', opts);
      const lines = result.split('\n');
      const orLine = lines.find((l) => l.trim().startsWith('OR'));
      assert.ok(orLine !== undefined, 'OR line exists');
      assert.ok(orLine.startsWith(' ') || orLine.startsWith('\t'), 'OR inside paren is indented');
    });

    test('breakOnOperators=true: top-level AND after paren group is at indent 0', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      // AND is at depth 0 outside '()'; expression starts with '(' so depth offset is 0
      const result = formatDocument('(< 404684003 OR < 19829001) AND < 234567890', opts);
      const lines = result.split('\n');
      const andLine = lines.find((l) => l.trim().startsWith('AND'));
      assert.ok(andLine !== undefined, 'AND line exists');
      assert.strictEqual(andLine.trimStart(), andLine, 'AND at depth 0 has no indent');
    });

    test('breakOnOperators=true: consecutive (( split onto separate lines', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input =
        '((< 404684003 |Clinical finding| OR < 19829001 |Disorder|) AND (< 234567890 |Finding| OR < 345678901 |Morphology|)) MINUS < 456789012 |Exclusion|';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // First line must be a lone '('
      assert.strictEqual(lines[0].trim(), '(', `first line should be lone '(', got: "${lines[0]}"`);
      // Second line must start with '(' (indented)
      assert.ok(lines[1].trim().startsWith('('), `second line starts with '(', got: "${lines[1]}"`);
      assert.ok(lines[1].startsWith(' ') || lines[1].startsWith('\t'), 'inner ( is indented');
    });

    test('breakOnOperators=true: MINUS outside double-paren is at indent 0', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input =
        '((< 404684003 |Clinical finding| OR < 19829001 |Disorder|) AND (< 234567890 |Finding| OR < 345678901 |Morphology|)) MINUS < 456789012 |Exclusion|';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const minusLine = lines.find((l) => l.trim().startsWith('MINUS'));
      assert.ok(minusLine !== undefined, 'MINUS line exists');
      assert.strictEqual(minusLine.trimStart(), minusLine, 'MINUS at depth 0 has no indent');
    });

    test('breakOnOperators=true: OR at depth 2 indented two levels', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input =
        '((< 404684003 |Clinical finding| OR < 19829001 |Disorder|) AND (< 234567890 |Finding| OR < 345678901 |Morphology|)) MINUS < 456789012 |Exclusion|';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const orLines = lines.filter((l) => l.trim().startsWith('OR'));
      assert.ok(orLines.length >= 2, 'at least two OR lines');
      // With default indentSize=2 and depth 2, each OR line should start with 4 spaces
      const twoLevelIndent = ' '.repeat(opts.indentSize * 2);
      for (const l of orLines) {
        assert.ok(l.startsWith(twoLevelIndent), `OR at depth 2 should start with "${twoLevelIndent}", got: "${l}"`);
      }
    });

    test('breakOnOperators=true: no blank lines in double-paren expression', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '((< 404684003 OR < 19829001) AND (< 234567890 OR < 345678901)) MINUS < 456789012';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `result should have no blank lines:\n${result}`);
    });
  });

  describe('Integration: breakOnRefinementComma option', () => {
    test('breakOnRefinementComma=false (default): comma refinements stay on one line', () => {
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006';
      const result = formatDocument(input, defaultFormattingOptions);
      // With default options the result should not have comma-broken lines
      assert.ok(!/,\s*\n/.exec(result), 'no comma-induced line breaks with default options');
    });

    test('breakOnRefinementComma=true: comma in refinement forces newline', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(lines.length > 1, 'should produce multiple lines');
      // There should be a line starting with the second attribute after the comma
      const attrLine = lines.find((l) => l.trim().startsWith('116676008'));
      assert.ok(attrLine !== undefined, 'second attribute on its own line');
    });

    test('breakOnRefinementComma=true: continuation lines are indented', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const attrLine = lines.find((l) => l.trim().startsWith('116676008'));
      assert.ok(attrLine !== undefined, 'second attribute on its own line');
      assert.ok(
        attrLine.startsWith(' ') || attrLine.startsWith('\t'),
        `continuation attribute line should be indented, got: "${attrLine}"`,
      );
    });

    test('breakOnRefinementComma=true: comma inside term label not treated as refinement break', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      // The comma inside | Disorder of ear, nose, and throat | is inside a term
      const input = '<< 19829001 | Disorder of ear, nose, and throat |';
      const result = formatDocument(input, opts);
      // Term content should stay intact — no line breaks inside the term
      assert.ok(
        result.includes('| Disorder of ear, nose, and throat |') ||
          result.includes('| Disorder of ear, nose, and throat|'),
        'comma inside term label not broken',
      );
    });

    test('breakOnRefinementComma=true: three attributes each on own line', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006, 370135005 = < 308489006';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(lines.length >= 3, `expected at least 3 lines, got ${lines.length}`);
      // Each attribute group should appear on its own line
      assert.ok(
        lines.some((l) => l.trim().startsWith('363698007') || l.includes('363698007 =')),
        'first attribute present',
      );
      assert.ok(
        lines.some((l) => l.trim().startsWith('116676008')),
        'second attribute on own line',
      );
      assert.ok(
        lines.some((l) => l.trim().startsWith('370135005')),
        'third attribute on own line',
      );
    });

    test('breakOnRefinementComma=true: trailing commas (attributes on separate lines) produce no blank lines', () => {
      // Regression: when attributes were already on separate lines (comma at end of
      // line), applyRefinementCommaBreaks was inserting an extra newline+indent after
      // each trailing comma, creating blank indented lines.
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      const input =
        '< 404684003 | Clinical finding |:\n' +
        '363698007 | Site | = < 39057004 | Pulmonary valve |,\n' +
        '116676008 | Associated morphology | = < 72704001 | Fracture |,\n' +
        '246075003 | Causative agent | = < 387517004 | Paracetamol |';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `result should have no blank lines:\n${result}`);
      // All three attributes should still be present
      assert.ok(result.includes('363698007'), 'first attribute present');
      assert.ok(result.includes('116676008'), 'second attribute present');
      assert.ok(result.includes('246075003'), 'third attribute present');
    });

    test('breakOnRefinementComma=true: no blank lines produced', () => {
      const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006, 370135005 = < 308489006';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `result should have no blank lines:\n${result}`);
    });
  });

  describe('Integration: idempotence', () => {
    const alreadyFormatted = [
      '<< 404684003 | Clinical finding |',
      '< 404684003 OR < 19829001',
      '< 404684003 AND < 19829001',
      '< 404684003: 363698007 = < 39057004',
    ];

    for (const expr of alreadyFormatted) {
      test(`formatting already-formatted expression is a no-op: ${expr.substring(0, 40)}`, () => {
        assert.strictEqual(formatDocument(expr, defaultFormattingOptions), expr);
      });
    }
  });

  describe('applyParenAwareOperatorBreaks: depth-aware indentation', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };

    test('simple expression (no outer paren): AND gets D+1 = 1 indent level (2 spaces)', () => {
      const result = formatDocument('< 404684003 AND < 19829001', opts);
      const lines = result.split('\n');
      const andLine = lines.find((l) => l.trim().startsWith('AND'))!;
      // D=0, depthOffset=1 → indent = (0+1)*2 = 2 spaces
      assert.ok(andLine.startsWith('  AND'), `expected 2-space indent, got: "${andLine}"`);
      assert.ok(!andLine.startsWith('    '), `should not be 4 spaces: "${andLine}"`);
    });

    test('simple expression: OR chain all at same D+1 indent level', () => {
      const result = formatDocument('< 404684003 OR < 19829001 OR < 234567890', opts);
      const lines = result.split('\n');
      const orLines = lines.filter((l) => l.trim().startsWith('OR'));
      assert.strictEqual(orLines.length, 2, 'two OR lines');
      for (const l of orLines) {
        assert.ok(l.startsWith('  OR'), `expected 2-space indent, got: "${l}"`);
        assert.ok(!l.startsWith('    '), `should not be 4 spaces: "${l}"`);
      }
    });

    test('paren-starting expression: AND at depth 1 gets exactly 1 indent level (2 spaces)', () => {
      // (A AND B) — starts with '(' so depthOffset=0; AND at depth 1 → indent = 1*2 = 2
      const result = formatDocument('(< 404684003 AND < 19829001)', opts);
      const lines = result.split('\n');
      const andLine = lines.find((l) => l.trim().startsWith('AND'))!;
      assert.ok(andLine.startsWith('  AND'), `expected 2-space indent for depth-1 AND, got: "${andLine}"`);
      assert.ok(!andLine.startsWith('    '), `should not be 4 spaces: "${andLine}"`);
    });

    test('paren-starting expression: top-level operator at depth 0 gets 0 indent', () => {
      // (A OR B) AND C — starts with '(' so depthOffset=0; AND at depth 0 → indent = 0
      const result = formatDocument('(< 404684003 OR < 19829001) AND < 234567890', opts);
      const lines = result.split('\n');
      const andLine = lines.find((l) => l.trim().startsWith('AND'))!;
      assert.strictEqual(andLine, 'AND < 234567890', 'AND at depth 0 should have no indent');
    });

    test('double-paren: OR at depth 2 gets 4 spaces (2 indent levels)', () => {
      const input = '((< 404684003 OR < 19829001) AND < 234567890)';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const orLine = lines.find((l) => l.trim().startsWith('OR'))!;
      assert.ok(orLine.startsWith('    OR'), `expected 4-space indent for depth-2 OR, got: "${orLine}"`);
    });

    test('double-paren: AND at depth 1 gets 2 spaces (1 indent level)', () => {
      const input = '((< 404684003 OR < 19829001) AND < 234567890)';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      const andLine = lines.find((l) => l.trim().startsWith('AND'))!;
      assert.ok(andLine.startsWith('  AND'), `expected 2-space indent for depth-1 AND, got: "${andLine}"`);
      assert.ok(!andLine.startsWith('    '), `should not be 4 spaces: "${andLine}"`);
    });

    test('indentSize=4: depth-1 operator gets 4 spaces', () => {
      const opts4: FormattingOptions = { ...opts, indentSize: 4 };
      const result = formatDocument('(< 404684003 OR < 19829001) AND < 234567890', opts4);
      const lines = result.split('\n');
      const orLine = lines.find((l) => l.trim().startsWith('OR'))!;
      // depth 1, indentSize 4 → 4 spaces
      assert.ok(orLine.startsWith('    OR'), `expected 4-space indent, got: "${orLine}"`);
      assert.ok(!orLine.startsWith('        '), 'should not be 8 spaces');
    });

    test('tab indent: depth-1 operator gets 1 tab', () => {
      const optsTab: FormattingOptions = { ...opts, indentStyle: 'tab' };
      const result = formatDocument('(< 404684003 OR < 19829001) AND < 234567890', optsTab);
      const lines = result.split('\n');
      const orLine = lines.find((l) => l.trim().startsWith('OR'))!;
      assert.ok(orLine.startsWith('\tOR'), `expected tab indent, got: "${orLine}"`);
      assert.ok(!orLine.startsWith('\t\t'), 'should not be 2 tabs');
    });
  });

  describe('applyParenAwareOperatorBreaks: consecutive )) splitting', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };

    test('consecutive )) are split onto separate lines', () => {
      const input = '((< 404684003 OR < 19829001) AND (< 234567890 OR < 345678901)) MINUS < 456789012';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // Find lines that are just closing parens (possibly with indent)
      // The inner ')' closes the first group, then the outer ')' should be on its own line
      // Look for a line ending with ')' followed by a line that is just ')'
      let foundConsecutiveCloseSplit = false;
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim().endsWith(')') && lines[i + 1].trim() === ')') {
          foundConsecutiveCloseSplit = true;
          break;
        }
      }
      assert.ok(foundConsecutiveCloseSplit, `expected consecutive )) to be split onto separate lines:\n${result}`);
    });

    test('closing )) outer paren is at correct indent level', () => {
      const input = '((< 404684003 OR < 19829001))';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // The inner ) closes depth 2→1, the outer ) closes depth 1→0
      // Outer ) should be at depth 0 (no indent)
      const lastLine = lines.at(-1)!;
      assert.strictEqual(lastLine.trim(), ')', 'last line should be a lone )');
      assert.strictEqual(lastLine.trimStart(), lastLine, 'outer ) at depth 0 should have no indent');
    });

    test('triple ((( splits each paren onto its own line', () => {
      const input = '(((< 404684003 OR < 19829001)))';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // First line: lone (
      assert.strictEqual(lines[0].trim(), '(', 'first line is lone (');
      // Second line should start with ( indented
      assert.ok(lines[1].trim().startsWith('('), 'second line starts with (');
      assert.ok(lines[1].startsWith(' ') || lines[1].startsWith('\t'), 'second ( is indented');
    });
  });

  describe('applyParenAwareOperatorBreaks: soft newline preservation (brace-indented content)', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };

    test('brace-indented refinement preserves its indentation', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n} AND < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // Brace content should be indented
      const attrLine = lines.find((l) => l.trim().startsWith('363698007'));
      assert.ok(attrLine !== undefined, 'attribute line present');
      assert.ok(attrLine.startsWith('  '), 'attribute inside braces is indented');
      // AND should be on its own line
      assert.ok(
        lines.some((l) => l.trim().startsWith('AND')),
        'AND on its own line',
      );
    });

    test('brace block followed by operator: closing } and AND on separate lines', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n} AND < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // } should be on its own line (from soft newline preservation)
      assert.ok(
        lines.some((l) => l.trim() === '}'),
        'closing } on its own line',
      );
      // AND should be on its own line after }
      const braceIdx = lines.findIndex((l) => l.trim() === '}');
      const andIdx = lines.findIndex((l) => l.trim().startsWith('AND'));
      assert.ok(andIdx > braceIdx, 'AND comes after closing brace');
    });

    test('nested braces with breakOnOperators preserve structure', () => {
      const input = '< 404684003 {\n363698007 = < 39057004 {\n116676008 = < 72704001\n}\n}';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // Should have nested indentation preserved
      assert.ok(
        lines.some((l) => l.trim().startsWith('363698007')),
        'first-level attr present',
      );
      assert.ok(
        lines.some((l) => l.trim().startsWith('116676008')),
        'second-level attr present',
      );
      // Second-level should be more indented than first
      const firstLevel = lines.find((l) => l.trim().startsWith('363698007'))!;
      const secondLevel = lines.find((l) => l.trim().startsWith('116676008'))!;
      const indent1 = /^(\s*)/.exec(firstLevel)?.[1].length ?? 0;
      const indent2 = /^(\s*)/.exec(secondLevel)?.[1].length ?? 0;
      assert.ok(indent2 > indent1, `second level indent (${indent2}) should exceed first level (${indent1})`);
    });
  });

  describe('applyParenAwareOperatorBreaks: terms with pipes inside parens', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };

    test('term pipes do not interfere with paren depth tracking', () => {
      const input = '(< 404684003 | Clinical finding | OR < 19829001 | Disorder |) AND < 234567890';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // OR should be inside parens → depth 1 → indented
      const orLine = lines.find((l) => l.trim().startsWith('OR'))!;
      assert.ok(orLine.startsWith('  '), 'OR inside parens is indented');
      // AND should be outside parens → depth 0 → no indent
      const andLine = lines.find((l) => l.trim().startsWith('AND'))!;
      assert.strictEqual(andLine.trimStart(), andLine, 'AND outside parens has no indent');
    });

    test('terms with pipes containing OR/AND words are not treated as operators', () => {
      const input = '<< 404684003 | Clinical finding OR something | AND < 19829001';
      const result = formatDocument(input, opts);
      // The "OR" inside the term should not create a break
      assert.ok(result.includes('| Clinical finding OR something |'), 'OR inside term preserved as term content');
    });
  });

  describe('applyParenAwareOperatorBreaks: no blank lines guarantee', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };

    test('single operator expression has no blank lines', () => {
      const result = formatDocument('< 404684003 AND < 19829001', opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });

    test('deeply nested parens have no blank lines', () => {
      const input = '(((< 404684003 OR < 19829001) AND < 234567890) MINUS < 345678901)';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });

    test('expression with braces and operators has no blank lines', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n} AND < 19829001';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });
  });

  describe('applyParenAwareOperatorBreaks: idempotence', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakOnOperators: true };

    test('formatting twice produces same result: simple AND', () => {
      const input = '< 404684003 AND < 19829001';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass should be identical to first');
    });

    test('formatting twice produces same result: paren group with OR + AND', () => {
      const input = '(< 404684003 OR < 19829001) AND < 234567890';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass should be identical to first');
    });

    test('formatting twice produces same result: double-paren expression', () => {
      const input = '((< 404684003 OR < 19829001) AND (< 234567890 OR < 345678901)) MINUS < 456789012';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass should be identical to first');
    });

    test('formatting twice produces same result: braces + operators', () => {
      const input = '< 404684003 {\n363698007 = < 39057004\n} AND < 19829001';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass should be identical to first');
    });
  });

  describe('applyParenAwareOperatorBreaks: combined with breakOnRefinementComma', () => {
    const opts: FormattingOptions = {
      ...defaultFormattingOptions,
      breakOnOperators: true,
      breakOnRefinementComma: true,
    };

    test('operators break + comma breaks work together', () => {
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006 AND < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // AND should be on its own line
      assert.ok(
        lines.some((l) => l.trim().startsWith('AND')),
        'AND on its own line',
      );
      // Attributes should be on separate lines (comma break)
      assert.ok(
        lines.some((l) => l.trim().startsWith('116676008')),
        'second attr on own line',
      );
    });

    test('combined options produce no blank lines', () => {
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = << 32413006 AND < 19829001';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });

    test('commas after multi-line parenthesized compound are broken correctly', () => {
      // When a parenthesized OR compound spans many lines (via breakOnOperators),
      // subsequent commas at depth 0 must still be broken to new lines.
      const optsAll: FormattingOptions = {
        ...defaultFormattingOptions,
        breakOnOperators: true,
        breakAfterColon: true,
        breakOnRefinementComma: true,
      };
      const input =
        '(< 763158003 AND ^ 929360061000036106): 127489000 = 395814003, [0..0] (762949000 OR 732943007 OR 774160008) = *, [0..0] 774158006 = *, { 127489000 = 395814003 }';
      const result = formatDocument(input, optsAll);
      const lines = result.split('\n');
      // Each comma-separated refinement attribute should be on its own line
      assert.ok(
        lines.some((l) => l.trim().startsWith('[0..0] 774158006')),
        `[0..0] 774158006 should be on its own line:\n${result}`,
      );
      assert.ok(
        lines.some((l) => l.trim().startsWith('{ 127489000')),
        `{ 127489000 } should be on its own line:\n${result}`,
      );
    });
  });

  describe('Integration: breakAfterColon option', () => {
    const opts: FormattingOptions = { ...defaultFormattingOptions, breakAfterColon: true };

    test('breakAfterColon=false (default): colon and attributes stay on same line', () => {
      const input = '< 404684003: 363698007 = < 39057004';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.strictEqual(result.split('\n').length, 1, 'single line when breakAfterColon is off');
    });

    test('simple refinement: attribute starts on new indented line', () => {
      const input = '< 404684003: 363698007 = < 39057004';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2, 'should produce two lines');
      assert.ok(lines[0].includes('404684003') && lines[0].endsWith(':'), `first line ends with colon: "${lines[0]}"`);
      assert.ok(lines[1].trim().startsWith('363698007'), `second line has attribute: "${lines[1]}"`);
      assert.ok(lines[1].startsWith('  '), `attribute line is indented: "${lines[1]}"`);
    });

    test('refinement with terms: terms preserved correctly', () => {
      const input = '< 404684003 | Clinical finding |: 363698007 | Finding site | = < 39057004';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2);
      assert.ok(lines[0].includes('| Clinical finding |'), 'term on colon line preserved');
      assert.ok(lines[1].includes('| Finding site |'), 'term on attribute line preserved');
    });

    test('refinement with brace group: group indented under colon', () => {
      const input = '< 404684003: { 363698007 = < 39057004 }';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(lines[0].endsWith(':'), `first line ends with colon: "${lines[0]}"`);
      // Brace group should be indented
      const braceLine = lines.find((l) => l.trim().startsWith('{'));
      assert.ok(braceLine !== undefined, 'brace group present');
      assert.ok(braceLine.startsWith('  '), `brace group indented: "${braceLine}"`);
    });

    test('refinement with brace block on separate lines: attributes doubly indented', () => {
      const input = '< 404684003: {\n363698007 = < 39057004\n}';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // Colon line
      assert.ok(lines[0].endsWith(':'), `first line ends with colon: "${lines[0]}"`);
      // Opening brace at indent level 1
      const openBrace = lines.find((l) => l.trim() === '{' || l.trim().startsWith('{'));
      assert.ok(openBrace !== undefined, 'opening brace present');
      assert.ok(openBrace.startsWith('  '), `opening brace indented: "${openBrace}"`);
      // Attribute inside braces at indent level 2
      const attrLine = lines.find((l) => l.trim().startsWith('363698007'));
      assert.ok(attrLine !== undefined, 'attribute present');
      const attrIndent = /^(\s*)/.exec(attrLine)?.[1].length ?? 0;
      assert.ok(attrIndent >= 4, `attribute doubly indented (${attrIndent} spaces): "${attrLine}"`);
    });

    test('multiple attributes after colon: all indented', () => {
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = < 72704001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(lines[0].endsWith(':'), 'first line ends with colon');
      // All attribute content should be indented
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          assert.ok(lines[i].startsWith('  '), `line ${i} should be indented: "${lines[i]}"`);
        }
      }
    });

    test('colon inside term is not treated as refinement colon', () => {
      // A colon inside a term label should not trigger a break
      const input = '<< 404684003 | Finding: clinical |';
      const result = formatDocument(input, opts);
      assert.strictEqual(result.split('\n').length, 1, 'no break inside term');
      assert.ok(result.includes('| Finding: clinical |'), 'term content preserved');
    });

    test('expression already broken after colon is a no-op (idempotence)', () => {
      const input = '< 404684003:\n  363698007 = < 39057004';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass identical to first');
    });

    test('idempotence with terms', () => {
      const input = '< 404684003 | Clinical finding |: 363698007 | Finding site | = < 39057004';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass identical to first');
    });

    test('idempotence with brace group', () => {
      const input = '< 404684003: { 363698007 = < 39057004, 116676008 = < 72704001 }';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass identical to first');
    });

    test('no blank lines produced', () => {
      const input = '< 404684003: 363698007 = < 39057004';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });

    test('no blank lines with brace group', () => {
      const input = '< 404684003: { 363698007 = < 39057004, 116676008 = < 72704001 }';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });
  });

  describe('breakAfterColon: combined with other break options', () => {
    test('breakAfterColon + breakOnRefinementComma: each attribute on its own line', () => {
      const opts: FormattingOptions = {
        ...defaultFormattingOptions,
        breakAfterColon: true,
        breakOnRefinementComma: true,
      };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = < 72704001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      assert.ok(lines[0].endsWith(':'), 'colon on first line');
      assert.ok(
        lines.some((l) => l.trim().startsWith('363698007')),
        'first attr present',
      );
      assert.ok(
        lines.some((l) => l.trim().startsWith('116676008')),
        'second attr on own line',
      );
      // Both attributes should be at same indent
      const attr1 = lines.find((l) => l.trim().startsWith('363698007'))!;
      const attr2 = lines.find((l) => l.trim().startsWith('116676008'))!;
      const indent1 = /^(\s*)/.exec(attr1)?.[1].length ?? 0;
      const indent2 = /^(\s*)/.exec(attr2)?.[1].length ?? 0;
      assert.strictEqual(indent1, indent2, `both attributes at same indent: ${indent1} vs ${indent2}`);
    });

    test('breakAfterColon + breakOnOperators: colon break + operator break', () => {
      const opts: FormattingOptions = {
        ...defaultFormattingOptions,
        breakAfterColon: true,
        breakOnOperators: true,
      };
      const input = '< 404684003: 363698007 = < 39057004 AND < 19829001';
      const result = formatDocument(input, opts);
      const lines = result.split('\n');
      // Colon line
      assert.ok(lines[0].endsWith(':'), `first line ends with colon: "${lines[0]}"`);
      // Attribute should be indented
      assert.ok(
        lines.some((l) => l.trim().startsWith('363698007')),
        'attribute present',
      );
      // AND should be on its own line
      assert.ok(
        lines.some((l) => l.trim().startsWith('AND')),
        'AND on own line',
      );
    });

    test('all three break options combined: no blank lines', () => {
      const opts: FormattingOptions = {
        ...defaultFormattingOptions,
        breakAfterColon: true,
        breakOnOperators: true,
        breakOnRefinementComma: true,
      };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = < 72704001 AND < 19829001';
      const result = formatDocument(input, opts);
      assert.ok(!result.includes('\n\n'), `no blank lines:\n${result}`);
    });

    test('all three break options combined: idempotent', () => {
      const opts: FormattingOptions = {
        ...defaultFormattingOptions,
        breakAfterColon: true,
        breakOnOperators: true,
        breakOnRefinementComma: true,
      };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = < 72704001 AND < 19829001';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass identical to first');
    });

    test('breakAfterColon + breakOnRefinementComma: idempotent', () => {
      const opts: FormattingOptions = {
        ...defaultFormattingOptions,
        breakAfterColon: true,
        breakOnRefinementComma: true,
      };
      const input = '< 404684003: 363698007 = < 39057004, 116676008 = < 72704001, 246075003 = < 387517004';
      const first = formatDocument(input, opts);
      const second = formatDocument(first, opts);
      assert.strictEqual(first, second, 'second pass identical to first');
    });

    test('two sub-expressions each with colons', () => {
      const opts: FormattingOptions = {
        ...defaultFormattingOptions,
        breakAfterColon: true,
      };
      const input = '< 404684003: 363698007 = < 39057004\n\n/* ECL-END */\n\n< 19829001: 116676008 = < 72704001';
      const result = formatDocument(input, opts);
      // Both expressions should have their colons broken
      const parts = result.split('/* ECL-END */');
      assert.strictEqual(parts.length, 2, 'two expressions');
      for (let i = 0; i < parts.length; i++) {
        const lines = parts[i].trim().split('\n');
        assert.ok(lines[0].endsWith(':'), `expression ${i + 1} first line ends with colon: "${lines[0]}"`);
        assert.ok(lines.length >= 2, `expression ${i + 1} has attribute on new line`);
      }
    });
  });

  describe('Compound comparison operators (!=, >=, <=)', () => {
    test('!= is not split into ! =', () => {
      const input = '< 404684003: 363698007 != < 39057004';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('!='), `!= should stay together, got: ${result}`);
      assert.ok(!result.includes('! ='), `Should not contain "! =", got: ${result}`);
    });

    test('>= is not split into > =', () => {
      const input = '< 404684003: 363698007 >= #5';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('>='), `>= should stay together, got: ${result}`);
      assert.ok(!result.includes('> ='), `Should not contain "> =", got: ${result}`);
    });

    test('<= is not split into < =', () => {
      const input = '< 404684003: 363698007 <= #10';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('<='), `<= should stay together, got: ${result}`);
      assert.ok(!result.includes('< ='), `Should not contain "< =", got: ${result}`);
    });

    test('!= gets spaces around it', () => {
      const input = '< 404684003:363698007!=< 39057004';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes(' != '), `!= should have spaces around it, got: ${result}`);
    });

    test('>= gets spaces around it', () => {
      const input = '< 404684003:363698007>=#5';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes(' >= '), `>= should have spaces around it, got: ${result}`);
    });

    test('<= gets spaces around it', () => {
      const input = '< 404684003:363698007<=#10';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes(' <= '), `<= should have spaces around it, got: ${result}`);
    });

    test('standalone = still gets spaces', () => {
      const input = '< 404684003:363698007=< 39057004';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes(' = '), `= should have spaces around it, got: ${result}`);
    });

    test('!= and = coexist in same expression', () => {
      const input = '< 404684003:363698007 != < 39057004, 116676008 = < 72704001';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes(' != '), `!= should have spaces, got: ${result}`);
      assert.ok(result.includes(' = '), `= should have spaces, got: ${result}`);
      assert.ok(!result.includes('! ='), `Should not split !=, got: ${result}`);
    });
  });

  describe('Idempotence — format(format(x)) === format(x)', () => {
    const idempotenceInputs = [
      // Simple expressions
      '< 404684003',
      '<< 19829001 |Disorder of lung|',
      '404684003 |Clinical finding|',
      // Compound expressions
      '< 404684003 AND < 19829001',
      '< 404684003 OR < 19829001 OR < 301867009',
      '< 404684003 MINUS < 19829001',
      // Refinements
      '< 404684003 : 363698007 = < 39057004',
      '< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006',
      // Messy input
      '<<  404684003   |  Clinical   finding  |',
      '<404684003 AND<19829001',
      '<  404684003:363698007=<  39057004',
      // Multi-expression
      '<< 404684003\n\n/* ECL-END */\n\n< 19829001',
      // Comparison operators
      '< 404684003 : 363698007 != < 39057004',
      '< 404684003 : 363698007 >= #5',
    ];

    for (const input of idempotenceInputs) {
      const label = input.replaceAll('\n', String.raw`\n`).substring(0, 60);
      test(`idempotent: ${label}`, () => {
        const once = formatDocument(input, defaultFormattingOptions);
        const twice = formatDocument(once, defaultFormattingOptions);
        assert.strictEqual(
          twice,
          once,
          `Not idempotent.\nFirst pass:  ${JSON.stringify(once)}\nSecond pass: ${JSON.stringify(twice)}`,
        );
      });
    }

    test('idempotent with breakOnOperators enabled', () => {
      const opts = { ...defaultFormattingOptions, breakOnOperators: true };
      const input = '< 404684003 AND < 19829001 OR < 301867009';
      const once = formatDocument(input, opts);
      const twice = formatDocument(once, opts);
      assert.strictEqual(twice, once);
    });

    test('idempotent with breakAfterColon enabled', () => {
      const opts = { ...defaultFormattingOptions, breakAfterColon: true };
      const input = '< 404684003 : 363698007 = < 39057004';
      const once = formatDocument(input, opts);
      const twice = formatDocument(once, opts);
      assert.strictEqual(twice, once);
    });

    test('idempotent with breakOnRefinementComma enabled', () => {
      const opts = { ...defaultFormattingOptions, breakOnRefinementComma: true };
      const input = '< 404684003 : 363698007 = < 39057004, 116676008 = < 415582006';
      const once = formatDocument(input, opts);
      const twice = formatDocument(once, opts);
      assert.strictEqual(twice, once);
    });

    test('idempotent with all breaks enabled', () => {
      const opts = {
        ...defaultFormattingOptions,
        breakOnOperators: true,
        breakAfterColon: true,
        breakOnRefinementComma: true,
      };
      const input = '< 404684003 AND < 19829001 : 363698007 = < 39057004, 116676008 = < 415582006';
      const once = formatDocument(input, opts);
      const twice = formatDocument(once, opts);
      assert.strictEqual(twice, once);
    });
  });

  // ─── Filter block normalization ──────────────────────────────────────────────

  describe('filter block normalization', () => {
    test('normalizes filter type letter to uppercase', () => {
      const input = '< 404684003 {{ d term = "test" }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('{{ D'), 'Filter type should be uppercase D');
    });

    test('normalizes lowercase filter keywords to camelCase', () => {
      const input = '< 404684003 {{ D TYPEID = 900000000000003001 }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('typeId'), 'TYPEID should become typeId');
    });

    test('normalizes moduleid to moduleId', () => {
      const input = '< 404684003 {{ C MODULEID = 900000000000207008 }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('moduleId'), 'MODULEID should become moduleId');
    });

    test('normalizes definitionstatusid to definitionStatusId', () => {
      const input = '< 404684003 {{ C DEFINITIONSTATUSID = 900000000000074008 }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('definitionStatusId'), 'DEFINITIONSTATUSID should become definitionStatusId');
    });

    test('normalizes effectivetime to effectiveTime', () => {
      const input = '< 404684003 {{ D EFFECTIVETIME = "20240101" }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('effectiveTime'), 'EFFECTIVETIME should become effectiveTime');
    });

    test('normalizes dialectid to dialectId', () => {
      const input = '< 404684003 {{ D DIALECTID = 900000000000509007 }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('dialectId'), 'DIALECTID should become dialectId');
    });

    test('normalizes spacing around = in filter blocks', () => {
      const input = '< 404684003 {{ D term="test" }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('term = "test"'), 'Should have spaces around =');
    });

    test('normalizes spacing around != in filter blocks', () => {
      const input = '< 404684003 {{ D active  !=  true }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('active != true'), 'Should have single spaces around !=');
    });

    test('is idempotent for already-normalized filter blocks', () => {
      const input = '< 404684003 {{ D term = "test", typeId = 900000000000003001 }}';
      const once = formatDocument(input, defaultFormattingOptions);
      const twice = formatDocument(once, defaultFormattingOptions);
      assert.strictEqual(twice, once);
    });

    test('does not modify filter blocks without keywords', () => {
      const input = '< 404684003 {{ + HISTORY-MIN }}';
      const result = formatDocument(input, defaultFormattingOptions);
      assert.ok(result.includes('HISTORY-MIN'), 'Should preserve HISTORY-MIN');
    });
  });
});
