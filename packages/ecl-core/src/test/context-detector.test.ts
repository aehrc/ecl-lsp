// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { detectCursorContext, detectFilterContext, CursorContext } from '../completion/context-detector';

// Helper to assert context kind
function expectKind(text: string, expectedKind: CursorContext['kind']) {
  const ctx = detectCursorContext(text);
  assert.strictEqual(ctx.kind, expectedKind, `Expected '${expectedKind}' for "${text}", got '${ctx.kind}'`);
  return ctx;
}

// Helper to assert filter context
function expectFilter(
  text: string,
  filterType: 'D' | 'C' | 'M' | '+',
  subContext: string | { kind: 'after-equals'; keyword: string | null },
) {
  const ctx = detectCursorContext(text);
  assert.strictEqual(ctx.kind, 'filter-block', `Expected 'filter-block' for "${text}", got '${ctx.kind}'`);
  if (ctx.kind === 'filter-block') {
    assert.strictEqual(
      ctx.filterType,
      filterType,
      `Expected filterType '${filterType}' for "${text}", got '${ctx.filterType}'`,
    );
    if (typeof subContext === 'string') {
      assert.strictEqual(
        ctx.subContext,
        subContext,
        `Expected subContext '${subContext}' for "${text}", got '${JSON.stringify(ctx.subContext)}'`,
      );
    } else {
      assert.deepStrictEqual(
        ctx.subContext,
        subContext,
        `Expected subContext ${JSON.stringify(subContext)} for "${text}", got '${JSON.stringify(ctx.subContext)}'`,
      );
    }
  }
}

describe('Context Detector', () => {
  // ── Task 3.2: Filter block detection ────────────────────────────────────

  describe('filter block detection', () => {
    it('should detect description filter with D prefix', () => {
      expectFilter('< 404684003 {{ D ', 'D', 'after-opening');
    });

    it('should detect concept filter with C prefix', () => {
      expectFilter('< 404684003 {{ C ', 'C', 'after-opening');
    });

    it('should detect member filter with M prefix', () => {
      expectFilter('< 404684003 {{ M ', 'M', 'after-opening');
    });

    it('should detect history supplement with + prefix', () => {
      expectFilter('< 404684003 {{ + ', '+', 'after-opening');
    });

    it('should default to D when no prefix given', () => {
      expectFilter('< 404684003 {{ ', 'D', 'after-opening');
    });

    it('should detect filter after comma (ready for next keyword)', () => {
      expectFilter('< 404684003 {{ D term = "hello", ', 'D', 'after-opening');
    });

    it('should handle lowercase filter prefix', () => {
      expectFilter('< 404684003 {{ d ', 'D', 'after-opening');
      expectFilter('< 404684003 {{ c ', 'C', 'after-opening');
      expectFilter('< 404684003 {{ m ', 'M', 'after-opening');
    });

    it('should not detect filter when {{ is closed', () => {
      const ctx = detectCursorContext('< 404684003 {{ D term = "hello" }} ');
      assert.notStrictEqual(ctx.kind, 'filter-block');
    });

    it('should detect filter in the last open block when multiple filters', () => {
      // First filter is closed, second is open
      expectFilter('< 404684003 {{ D term = "hello" }} {{ C ', 'C', 'after-opening');
    });

    it('should return null from detectFilterContext when no {{', () => {
      const result = detectFilterContext('< 404684003 ');
      assert.strictEqual(result, null);
    });

    it('should return null from detectFilterContext when {{ is closed', () => {
      const result = detectFilterContext('< 404684003 {{ D term = "hello" }}');
      assert.strictEqual(result, null);
    });
  });

  // ── Task 3.3: Filter sub-context ────────────────────────────────────────

  describe('filter sub-context', () => {
    it('should detect after-opening when filter just opened', () => {
      expectFilter('< 404684003 {{ D ', 'D', 'after-opening');
    });

    it('should detect after-keyword for description filter keywords', () => {
      expectFilter('< 404684003 {{ D term ', 'D', 'after-keyword');
      expectFilter('< 404684003 {{ D type ', 'D', 'after-keyword');
      expectFilter('< 404684003 {{ D active ', 'D', 'after-keyword');
      expectFilter('< 404684003 {{ D language ', 'D', 'after-keyword');
      expectFilter('< 404684003 {{ D dialect ', 'D', 'after-keyword');
    });

    it('should detect after-keyword for concept filter keywords', () => {
      expectFilter('< 404684003 {{ C definitionStatus ', 'C', 'after-keyword');
      expectFilter('< 404684003 {{ C active ', 'C', 'after-keyword');
      expectFilter('< 404684003 {{ C moduleId ', 'C', 'after-keyword');
    });

    it('should detect after-keyword for member filter keywords', () => {
      expectFilter('< 404684003 {{ M active ', 'M', 'after-keyword');
      expectFilter('< 404684003 {{ M moduleId ', 'M', 'after-keyword');
    });

    it('should detect after-equals when = follows keyword', () => {
      expectFilter('< 404684003 {{ D term = ', 'D', { kind: 'after-equals', keyword: 'term' });
      expectFilter('< 404684003 {{ D type =', 'D', { kind: 'after-equals', keyword: 'type' });
    });

    it('should detect after-equals for != operator', () => {
      expectFilter('< 404684003 {{ D active != ', 'D', { kind: 'after-equals', keyword: 'active' });
    });

    it('should detect after-value when value follows =', () => {
      expectFilter('< 404684003 {{ D type = syn ', 'D', 'after-value');
      expectFilter('< 404684003 {{ D active = true ', 'D', 'after-value');
    });

    it('should detect after-opening after comma', () => {
      expectFilter('< 404684003 {{ D term = "hello", ', 'D', 'after-opening');
    });

    it('should always return after-opening for history supplement', () => {
      expectFilter('< 404684003 {{ + ', '+', 'after-opening');
      expectFilter('< 404684003 {{ + HISTORY ', '+', 'after-opening');
    });
  });

  // ── Task 3.4: AST-based contexts ───────────────────────────────────────

  describe('expression-start', () => {
    it('should detect empty string', () => {
      expectKind('', 'expression-start');
    });

    it('should detect whitespace only', () => {
      expectKind('   ', 'expression-start');
      expectKind('\t', 'expression-start');
      expectKind('\n', 'expression-start');
    });
  });

  describe('after-operator', () => {
    it('should detect after descendant-of (<)', () => {
      const ctx = expectKind('< ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '<');
    });

    it('should detect after descendant-or-self-of (<<)', () => {
      const ctx = expectKind('<< ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '<<');
    });

    it('should detect after ancestor-of (>)', () => {
      const ctx = expectKind('> ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '>');
    });

    it('should detect after ancestor-or-self-of (>>)', () => {
      const ctx = expectKind('>> ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '>>');
    });

    it('should detect after child-of (<!)', () => {
      const ctx = expectKind('<! ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '<!');
    });

    it('should detect after child-or-self-of (<<!)', () => {
      const ctx = expectKind('<<! ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '<<!');
    });

    it('should detect after parent-of (>!)', () => {
      const ctx = expectKind('>! ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '>!');
    });

    it('should detect after parent-or-self-of (>>!)', () => {
      const ctx = expectKind('>>! ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '>>!');
    });

    it('should detect after member-of (^)', () => {
      const ctx = expectKind('^ ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '^');
    });

    it('should detect after top (!!>)', () => {
      const ctx = expectKind('!!> ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '!!>');
    });

    it('should detect after bottom (!!<)', () => {
      const ctx = expectKind('!!< ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '!!<');
    });

    it('should detect after operator without trailing space', () => {
      const ctx = expectKind('<', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '<');
    });

    it('should detect after operator in parenthesized context', () => {
      const ctx = expectKind('(< ', 'after-operator');
      if (ctx.kind === 'after-operator') assert.strictEqual(ctx.operator, '<');
    });
  });

  describe('refinement-start', () => {
    it('should detect after colon with space', () => {
      expectKind('< 404684003 : ', 'refinement-start');
    });

    it('should detect after colon with concept term', () => {
      expectKind('< 404684003 |Clinical finding| : ', 'refinement-start');
    });
  });

  describe('after-attribute-name', () => {
    it('should detect after attribute concept ID', () => {
      expectKind('< 404684003 : 363698007 ', 'after-attribute-name');
    });

    it('should detect after attribute concept ID with term', () => {
      expectKind('< 404684003 : 363698007 |Finding site| ', 'after-attribute-name');
    });
  });

  describe('after-comparison-operator', () => {
    it('should detect after = in refinement', () => {
      expectKind('< 404684003 : 363698007 = ', 'after-comparison-operator');
    });

    it('should detect after != in refinement', () => {
      expectKind('< 404684003 : 363698007 != ', 'after-comparison-operator');
    });
  });

  describe('after-cardinality', () => {
    it('should detect [0..0]', () => {
      expectKind('< 404684003 : [0..0] ', 'after-cardinality');
    });

    it('should detect [0..1]', () => {
      expectKind('< 404684003 : [0..1] ', 'after-cardinality');
    });

    it('should detect [0..*]', () => {
      expectKind('< 404684003 : [0..*] ', 'after-cardinality');
    });

    it('should detect [1..1]', () => {
      expectKind('< 404684003 : [1..1] ', 'after-cardinality');
    });

    it('should detect [1..*]', () => {
      expectKind('< 404684003 : [1..*] ', 'after-cardinality');
    });
  });

  describe('dotted-awaiting-attribute', () => {
    it('should detect after dot notation', () => {
      expectKind('< 404684003 . ', 'dotted-awaiting-attribute');
    });

    it('should detect after dot with concept term', () => {
      expectKind('< 404684003 |Clinical finding| . ', 'dotted-awaiting-attribute');
    });
  });

  describe('after-logical-operator', () => {
    it('should detect after AND', () => {
      const ctx = expectKind('< 404684003 AND ', 'after-logical-operator');
      if (ctx.kind === 'after-logical-operator') assert.strictEqual(ctx.operator, 'AND');
    });

    it('should detect after OR', () => {
      const ctx = expectKind('< 404684003 OR ', 'after-logical-operator');
      if (ctx.kind === 'after-logical-operator') assert.strictEqual(ctx.operator, 'OR');
    });

    it('should detect after MINUS', () => {
      const ctx = expectKind('< 404684003 MINUS ', 'after-logical-operator');
      if (ctx.kind === 'after-logical-operator') assert.strictEqual(ctx.operator, 'MINUS');
    });
  });

  describe('after-concept', () => {
    it('should detect after complete concept ID', () => {
      expectKind('< 404684003', 'after-concept');
    });

    it('should detect after concept with term', () => {
      expectKind('< 404684003 |Clinical finding|', 'after-concept');
    });

    it('should detect after concept with trailing space', () => {
      expectKind('<< 404684003 ', 'after-concept');
    });

    it('should detect after self (no operator)', () => {
      expectKind('404684003', 'after-concept');
    });

    it('should detect after concept with term and trailing space', () => {
      expectKind('< 404684003 |Clinical finding| ', 'after-concept');
    });

    it('should detect after wildcard *', () => {
      expectKind('*', 'after-concept');
    });

    it('should detect after compound expression with complete operands', () => {
      expectKind('< 404684003 AND < 19829001', 'after-concept');
    });
  });

  // ── Task 3.5: Edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('should ignore {{ inside block comments', () => {
      const result = detectFilterContext('< 404684003 /* {{ D term = "hello" */ ');
      assert.strictEqual(result, null);
    });

    it('should ignore {{ inside pipe-delimited terms', () => {
      const result = detectFilterContext('< 404684003 |some {{ term| ');
      assert.strictEqual(result, null);
    });

    it('should handle colon inside pipe-delimited terms (not refinement)', () => {
      // Colon inside term should not be treated as refinement separator
      const ctx = detectCursorContext('< 404684003 |Ratio: 1:2|');
      // Should parse as after-concept since the colon is inside the term
      assert.strictEqual(ctx.kind, 'after-concept');
    });

    it('should handle multi-line expressions', () => {
      expectKind('< 404684003\n  AND ', 'after-logical-operator');
    });

    it('should handle multi-line with filter', () => {
      expectFilter('< 404684003\n  {{ D\n  term = ', 'D', { kind: 'after-equals', keyword: 'term' });
    });

    it('should handle nested parentheses', () => {
      // After opening paren with operator
      const ctx = detectCursorContext('(< ');
      assert.strictEqual(ctx.kind, 'after-operator');
    });

    it('should handle empty filter block (just opened)', () => {
      expectFilter('< 404684003 {{', 'D', 'after-opening');
    });

    it('should handle filter with whitespace only after opening', () => {
      expectFilter('< 404684003 {{  ', 'D', 'after-opening');
    });
  });

  // ── Task 3.6: Unknown/ambiguous contexts ──────────────────────────────

  describe('unknown context (fail-open)', () => {
    it('should return expression-start for unparseable garbage (fail-open)', () => {
      // Garbage that ANTLR can't recover from and doesn't match operator patterns
      // falls through to expression-start (same as empty) — this is the fail-open behavior
      expectKind('@@@ ', 'expression-start');
    });

    it('should return expression-start for only opening paren', () => {
      // Opening paren with nothing after — empty expression inside
      expectKind('(', 'expression-start');
    });
  });
});
