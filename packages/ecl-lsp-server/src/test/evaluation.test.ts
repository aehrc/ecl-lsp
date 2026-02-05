// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildCodeLenses } from '../code-lens';

// Minimal Expression shape for testing
interface Expression {
  text: string;
  startLine: number;
  endLine: number;
  lineOffsets: number[];
}

describe('ECL Expression Evaluation - Code Lenses', () => {
  describe('buildCodeLenses', () => {
    const makeExpr = (text: string, startLine: number, endLine: number): Expression => ({
      text,
      startLine,
      endLine,
      lineOffsets: Array.from({ length: endLine - startLine + 1 }, (_, i) => startLine + i),
    });

    it('should return one code lens per expression', () => {
      const expressions = [makeExpr('<< 404684003', 0, 0), makeExpr('< 19829001', 2, 2)];
      const lenses = buildCodeLenses(expressions);
      assert.strictEqual(lenses.length, 2);
    });

    it('should show "Evaluate" title when no cached result', () => {
      const expressions = [makeExpr('<< 404684003', 0, 0)];
      const lenses = buildCodeLenses(expressions);
      assert.strictEqual(lenses[0].command!.title, 'Evaluate');
    });

    it('should show "N concept(s)" when cached result exists', () => {
      const expressions = [makeExpr('<< 404684003', 0, 0)];
      const cache = new Map<string, number>([['<< 404684003', 42]]);
      const lenses = buildCodeLenses(expressions, cache);
      assert.strictEqual(lenses[0].command!.title, '42 concepts');
    });

    it('should use singular "concept" for count of 1', () => {
      const expressions = [makeExpr('<< 404684003', 0, 0)];
      const cache = new Map<string, number>([['<< 404684003', 1]]);
      const lenses = buildCodeLenses(expressions, cache);
      assert.strictEqual(lenses[0].command!.title, '1 concept');
    });

    it('should set range to expression start line', () => {
      const expressions = [makeExpr('<< 404684003', 5, 7)];
      const lenses = buildCodeLenses(expressions);
      assert.strictEqual(lenses[0].range.start.line, 5);
    });
  });
});
