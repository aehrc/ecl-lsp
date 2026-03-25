// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseECL } from '../parser';
import { getStripDisplayTermsAction } from '../refactoring/strip-display-terms';
import { getAddDisplayTermsAction, resolveAddDisplayTerms } from '../refactoring/add-display-terms';
import { getUnifiedSimplifyAction, resolveUnifiedSimplify } from '../refactoring/simplify-expression';
import { getAddParenthesesAction } from '../refactoring/add-parentheses';
import { getAddHistorySupplementAction, getAddHistorySupplementActions } from '../refactoring/add-history-supplement';
import { getAddDescriptionFilterAction } from '../refactoring/add-description-filter';
import { getRemoveParenthesesAction } from '../refactoring/remove-parentheses';
import { getRefactoringActions } from '../refactoring/index';
import type { RefactoringContext } from '../refactoring/index';
import type { CoreCodeAction } from '../types';
import type { ConceptInfo, ITerminologyService, SearchResponse, EvaluationResponse } from '../terminology/types';

const TEST_URI = 'file:///test.ecl';

/** Build a RefactoringContext from expression text and optional cursor character offset. */
function makeCtx(text: string, cursorChar = 0): RefactoringContext {
  const result = parseECL(text);
  return {
    documentText: text,
    documentUri: TEST_URI,
    range: {
      start: { line: 0, character: cursorChar },
      end: { line: 0, character: cursorChar },
    },
    expressionText: text,
    expressionRange: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    },
    ast: result.ast || undefined,
  };
}

/** Extract the replacement text from a code action's edits. */
function getEditText(action: CoreCodeAction): string | null {
  if (!action.edits || action.edits.length === 0) return null;
  return action.edits[0].newText;
}

// ─── Strip display terms ────────────────────────────────────────────────────

describe('Strip display terms', () => {
  it('should strip all terms from expression', () => {
    const ctx = makeCtx('< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung|');
    const action = getStripDisplayTermsAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Strip display terms');
    const text = getEditText(action);
    assert.strictEqual(text, '< 404684003 AND < 19829001');
  });

  it('should not be offered when no terms present', () => {
    const ctx = makeCtx('< 404684003 AND < 19829001');
    const action = getStripDisplayTermsAction(ctx);
    assert.strictEqual(action, null, 'Should not be offered');
  });

  it('should strip single term', () => {
    const ctx = makeCtx('< 404684003 |Clinical finding|');
    const action = getStripDisplayTermsAction(ctx);
    assert.ok(action);
    const text = getEditText(action);
    assert.strictEqual(text, '< 404684003');
  });

  it('should handle term in refinement', () => {
    const ctx = makeCtx('< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004');
    const action = getStripDisplayTermsAction(ctx);
    assert.ok(action);
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(!text.includes('|'), 'All terms should be stripped');
    assert.ok(text.includes('404684003'));
    assert.ok(text.includes('363698007'));
    assert.ok(text.includes('39057004'));
  });
});

// ─── Add display terms ──────────────────────────────────────────────────────

class MockTermService implements ITerminologyService {
  private data = new Map<string, ConceptInfo>([
    ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
    ['19829001', { id: '19829001', fsn: 'Disorder of lung (disorder)', pt: 'Disorder of lung', active: true }],
    ['363698007', { id: '363698007', fsn: 'Finding site (attribute)', pt: 'Finding site', active: true }],
    [
      '39057004',
      {
        id: '39057004',
        fsn: 'Pulmonary valve structure (body structure)',
        pt: 'Pulmonary valve structure',
        active: true,
      },
    ],
  ]);

  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    return this.data.get(conceptId) ?? null;
  }
  async validateConcepts(ids: string[]): Promise<Map<string, ConceptInfo | null>> {
    const map = new Map<string, ConceptInfo | null>();
    for (const id of ids) map.set(id, this.data.get(id) ?? null);
    return map;
  }
  async searchConcepts(): Promise<SearchResponse> {
    return { results: [], hasMore: false };
  }
  async evaluateEcl(): Promise<EvaluationResponse> {
    return { total: 0, concepts: [], truncated: false };
  }
}

/**
 * Mock terminology service that simulates subsumption via MINUS evaluation.
 * Configured with "parent subsumes child" relationships.
 */
class SubsumptionMockService implements ITerminologyService {
  private subsumptions = new Set<string>();
  /** Concept IDs that are unknown/inactive (evaluate to 0 results). */
  private emptyConcepts = new Set<string>();

  addSubsumption(parent: string, child: string): void {
    this.subsumptions.add(`${parent}|${child}`);
  }

  /** Mark a concept ID as unknown/inactive — evaluating it returns 0 results. */
  addEmptyConcept(conceptId: string): void {
    this.emptyConcepts.add(conceptId);
  }

  async getConceptInfo(): Promise<ConceptInfo | null> {
    return null;
  }
  async validateConcepts(): Promise<Map<string, ConceptInfo | null>> {
    return new Map();
  }
  async searchConcepts(): Promise<SearchResponse> {
    return { results: [], hasMore: false };
  }

  async evaluateEcl(expression: string): Promise<EvaluationResponse> {
    const minusMatch = /^\((.+)\)\s+MINUS\s+\((.+)\)$/.exec(expression);

    if (!minusMatch) {
      // Individual operand evaluation (pre-check for non-empty)
      const id = /\d{6,18}/.exec(expression)?.[0];
      if (id && this.emptyConcepts.has(id)) {
        return { total: 0, concepts: [], truncated: false };
      }
      return { total: 1, concepts: [], truncated: false };
    }

    const operandA = minusMatch[1].trim();
    const operandB = minusMatch[2].trim();

    const idA = /^<?<?\s*(\d+)/.exec(operandA)?.[1];
    const idB = /^<?<?\s*(\d+)/.exec(operandB)?.[1];
    if (!idA || !idB) return { total: 1, concepts: [], truncated: false };

    // Empty concept MINUS anything = 0 (vacuously)
    if (this.emptyConcepts.has(idA)) {
      return { total: 0, concepts: [], truncated: false };
    }

    if (idA === idB) {
      const opA = operandA.replace(/\d+.*/, '').trim();
      const opB = operandB.replace(/\d+.*/, '').trim();
      const breadth: Record<string, number> = { '<': 1, '<<': 2 };
      return { total: (breadth[opA] ?? 0) <= (breadth[opB] ?? 0) ? 0 : 1, concepts: [], truncated: false };
    }

    // B subsumes A → A ⊆ B → A MINUS B = 0
    if (this.subsumptions.has(`${idB}|${idA}`)) {
      return { total: 0, concepts: [], truncated: false };
    }

    return { total: 1, concepts: [], truncated: false };
  }
}

describe('Add display terms', () => {
  const termService = new MockTermService();

  it('should offer action for bare concept IDs', () => {
    const ctx = makeCtx('< 404684003');
    const action = getAddDisplayTermsAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Add display terms');
    assert.ok(action.data, 'Should have data for resolve');
    assert.ok(!action.edits, 'Should NOT have edit yet (resolve pattern)');
  });

  it('should not offer when all concepts have terms', () => {
    const ctx = makeCtx('< 404684003 |Clinical finding|');
    const action = getAddDisplayTermsAction(ctx);
    assert.strictEqual(action, null, 'Should not be offered when all have terms');
  });

  it('should resolve with display terms inserted', async () => {
    const ctx = makeCtx('< 404684003');
    const action = getAddDisplayTermsAction(ctx);
    assert.ok(action);

    const resolved = await resolveAddDisplayTerms(action, termService);
    const text = getEditText(resolved);
    assert.ok(text);
    assert.ok(text.includes('|Clinical finding|'), `Should include term, got: ${text}`);
  });

  it('should skip already-termed concepts during resolve', async () => {
    const ctx = makeCtx('< 404684003 |Clinical finding| AND < 19829001');
    const action = getAddDisplayTermsAction(ctx);
    assert.ok(action, 'Should offer action for bare 19829001');

    const resolved = await resolveAddDisplayTerms(action, termService);
    const text = getEditText(resolved);
    assert.ok(text);
    assert.ok(text.includes('|Disorder of lung|'), 'Should add term for 19829001');
    // Count pipes — should have exactly 4 (2 for existing, 2 for new)
    const pipeCount = (text.match(/\|/g) || []).length;
    assert.strictEqual(pipeCount, 4, `Should have 4 pipes, got ${pipeCount} in: ${text}`);
  });

  it('should handle offline gracefully', async () => {
    const failService: ITerminologyService = {
      async getConceptInfo() {
        throw new Error('offline');
      },
      async validateConcepts() {
        return new Map();
      },
      async searchConcepts() {
        return { results: [], hasMore: false };
      },
      async evaluateEcl() {
        return { total: 0, concepts: [], truncated: false };
      },
    };
    const ctx = makeCtx('< 404684003');
    const action = getAddDisplayTermsAction(ctx);
    assert.ok(action);

    const resolved = await resolveAddDisplayTerms(action, failService);
    assert.ok(!resolved.edits, 'Should not have edit when FHIR fails');
  });
});

// ─── Unified simplify ───────────────────────────────────────────────────────

describe('Unified simplify', () => {
  // -- Offering the action --

  it('should offer for top-level AND compound', () => {
    const ctx = makeCtx('<< 404684003 AND < 404684003');
    const action = getUnifiedSimplifyAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Simplify');
  });

  it('should offer for top-level OR compound', () => {
    const ctx = makeCtx('<< 404684003 OR < 404684003');
    const action = getUnifiedSimplifyAction(ctx);
    assert.ok(action, 'Action should be offered');
  });

  it('should offer for nested compound inside parens', () => {
    const ctx = makeCtx('(<< 404684003 OR < 404684003) AND < 19829001');
    const action = getUnifiedSimplifyAction(ctx);
    assert.ok(action, 'Should be offered — inner OR is simplifiable');
  });

  it('should not offer for MINUS-only compound', () => {
    const ctx = makeCtx('< 404684003 MINUS < 19829001');
    const action = getUnifiedSimplifyAction(ctx);
    assert.strictEqual(action, null, 'MINUS — no simplification');
  });

  it('should not offer for single concept', () => {
    const ctx = makeCtx('< 404684003');
    const action = getUnifiedSimplifyAction(ctx);
    assert.strictEqual(action, null, 'Single operand — nothing to simplify');
  });

  it('should not offer when AST expression is null', () => {
    const ctx = makeCtx('< ');
    if (ctx.ast) (ctx.ast as { expression: unknown }).expression = null;
    const action = getUnifiedSimplifyAction(ctx);
    assert.strictEqual(action, null);
  });

  // -- Technique 1: Remove exact duplicates --

  describe('Technique: Remove duplicates', () => {
    it('should remove duplicate in AND', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 AND < 19829001 AND < 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '< 404684003 AND < 19829001');
    });

    it('should remove duplicate in OR', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 OR < 19829001 OR < 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '< 404684003 OR < 19829001');
    });
  });

  // -- Technique 2: Same-concept operator ranking --

  describe('Technique: Operator ranking', () => {
    it('should simplify << X AND < X to < X', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('<< 404684003 AND < 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '< 404684003');
    });

    it('should simplify << X AND X to X', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('<< 404684003 AND 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '404684003');
    });

    it('should simplify < X AND X to X', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 AND 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '404684003');
    });

    it('should simplify << X OR < X to << X', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('<< 404684003 OR < 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '<< 404684003');
    });

    it('should simplify << X OR X to << X', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('<< 404684003 OR 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '<< 404684003');
    });

    it('should simplify < X OR X to < X', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 OR 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '< 404684003');
    });
  });

  // -- Technique 3: Factor common focus (OR) --

  describe('Technique: Factor common focus', () => {
    it('should factor two refined OR expressions with same focus', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('(< 404684003 : 363698007 = < 39057004) OR (< 404684003 : 116676008 = < 72651009)');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action, 'Action should be offered');
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.ok(text);
      assert.ok(text.includes('< 404684003'), 'Should have common focus');
      assert.ok(text.includes(':'), 'Should have colon');
      assert.ok(text.includes('OR'), 'Should have OR joining refinements');
      assert.ok(!text.startsWith('('), 'Should not have leading paren');
    });

    it('should not factor different focus concepts', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('(< 404684003 : 363698007 = < 39057004) OR (< 19829001 : 116676008 = < 72651009)');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action); // offered because compound OR with 2+ operands
      const resolved = await resolveUnifiedSimplify(action, mock);
      // No factoring should occur (different focus), no edit unless FHIR finds something
      // Since mock has no subsumptions, no edit
      assert.ok(!resolved.edits, 'Should not factor different focus');
    });
  });

  // -- Technique 3b: Merge same-focus refinements (AND) --

  describe('Technique: Merge same-focus AND', () => {
    it('should merge two refined AND expressions with same focus', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('(< 404684003 : 363698007 = < 39057004) AND (< 404684003 : 116676008 = < 72651009)');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action, 'Action should be offered');
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.ok(text);
      assert.ok(text.includes('< 404684003'), 'Should have common focus');
      assert.ok(text.includes(':'), 'Should have colon');
      assert.ok(text.includes(','), 'Should have comma joining refinements');
      assert.ok(!text.startsWith('('), 'Should not have leading paren');
    });

    it('should not merge different focus concepts in AND', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('(< 404684003 : 363698007 = < 39057004) AND (< 19829001 : 116676008 = < 72651009)');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      assert.ok(!resolved.edits, 'Should not merge different focus');
    });

    it('should not merge non-refined operands', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 AND < 19829001');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      assert.ok(!resolved.edits, 'Should not merge non-refined operands');
    });
  });

  // -- Technique 4: FHIR subsumption --

  describe('Technique: FHIR subsumption', () => {
    it('should resolve AND: keep subset, remove superset', async () => {
      const mock = new SubsumptionMockService();
      mock.addSubsumption('404684003', '19829001');
      const ctx = makeCtx('< 404684003 AND < 19829001');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '< 19829001');
    });

    it('should resolve OR: keep superset, remove subset', async () => {
      const mock = new SubsumptionMockService();
      mock.addSubsumption('404684003', '19829001');
      const ctx = makeCtx('< 404684003 OR < 19829001');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '< 404684003');
    });

    it('should not simplify unrelated operands', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 AND < 19829001');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      assert.ok(!resolved.edits, 'Should not simplify unrelated operands');
    });

    it('should preserve empty/unknown concepts', async () => {
      const mock = new SubsumptionMockService();
      mock.addSubsumption('404684003', '19829001');
      mock.addEmptyConcept('999999999');
      const ctx = makeCtx('< 404684003 OR < 19829001 OR < 999999999');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.ok(text);
      assert.ok(!text.includes('19829001'), 'Subsumed operand removed');
      assert.ok(text.includes('404684003'), 'Broader operand kept');
      assert.ok(text.includes('999999999'), 'Unknown/empty operand preserved');
    });

    it('should handle FHIR failure gracefully', async () => {
      const failService: ITerminologyService = {
        async getConceptInfo() {
          return null;
        },
        async validateConcepts() {
          return new Map();
        },
        async searchConcepts() {
          return { results: [], hasMore: false };
        },
        async evaluateEcl() {
          throw new Error('offline');
        },
      };
      const ctx = makeCtx('< 404684003 AND < 19829001');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, failService);
      assert.ok(!resolved.edits, 'Should not have edit when FHIR fails');
    });

    it('should handle three operands with transitive subsumption', async () => {
      const mock = new SubsumptionMockService();
      mock.addSubsumption('404684003', '19829001');
      mock.addSubsumption('19829001', '39057004');
      const ctx = makeCtx('< 404684003 AND < 19829001 AND < 39057004');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.ok(text);
      assert.ok(text.includes('39057004'), `Should keep most specific, got: ${text}`);
      assert.ok(!text.includes('404684003'), `Should remove broadest, got: ${text}`);
    });
  });

  // -- Bottom-up nesting --

  describe('Bottom-up nesting', () => {
    it('should simplify inner OR groups before outer AND', async () => {
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('(<< 404684003 OR < 404684003) AND (<< 19829001 OR < 19829001)');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.ok(text);
      // Inner ORs simplify: << 404684003 OR < 404684003 → << 404684003
      // Result: << 404684003 AND << 19829001
      assert.ok(text.includes('<< 404684003'), `Should have simplified first group, got: ${text}`);
      assert.ok(text.includes('<< 19829001'), `Should have simplified second group, got: ${text}`);
      assert.ok(text.includes('AND'), `Should keep outer AND, got: ${text}`);
    });

    it('should handle inner simplification that removes parens', async () => {
      // Inner group << X OR < X simplifies to << X (single operand, no parens needed)
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('(<< 404684003 OR < 404684003) AND < 19829001');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.ok(text);
      assert.ok(text.includes('<< 404684003'), `Should simplify inner group, got: ${text}`);
      assert.ok(text.includes('AND'), `Should keep outer AND, got: ${text}`);
    });
  });

  // -- Re-check cascade --

  describe('Re-check cascade', () => {
    it('should cascade: duplicate removal then operator ranking', async () => {
      // < X OR << X OR < X → dedup → < X OR << X → ranking → << X
      const mock = new SubsumptionMockService();
      const ctx = makeCtx('< 404684003 OR << 404684003 OR < 404684003');
      const action = getUnifiedSimplifyAction(ctx);
      assert.ok(action);
      const resolved = await resolveUnifiedSimplify(action, mock);
      const text = getEditText(resolved);
      assert.strictEqual(text, '<< 404684003');
    });
  });
});

// ─── Add explicit parentheses ───────────────────────────────────────────────

describe('Add explicit parentheses', () => {
  it('should parenthesise mixed AND/OR', () => {
    const ctx = makeCtx('< 404684003 AND < 19829001 OR < 301867009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Add explicit parentheses');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('('), 'Should have parentheses');
    assert.ok(text.includes(')'), 'Should have closing paren');
    assert.ok(
      text.includes('(< 404684003 AND < 19829001)') || text.includes('( < 404684003 AND < 19829001 )'),
      `AND group should be wrapped, got: ${text}`,
    );
  });

  it('should not offer for single operator type', () => {
    const ctx = makeCtx('< 404684003 AND < 19829001');
    const action = getAddParenthesesAction(ctx);
    assert.strictEqual(action, null, 'Single operator — not offered');
  });

  it('should handle OR-only expression', () => {
    const ctx = makeCtx('< 404684003 OR < 19829001');
    const action = getAddParenthesesAction(ctx);
    assert.strictEqual(action, null, 'OR only — not offered');
  });

  it('should parenthesise mixed AND/MINUS', () => {
    const ctx = makeCtx('< 404684003 AND < 19829001 MINUS < 301867009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered for AND/MINUS mix');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('(< 404684003 AND < 19829001)'), `AND group should be wrapped, got: ${text}`);
    assert.ok(text.includes('MINUS'), `Should have MINUS, got: ${text}`);
  });

  it('should parenthesise mixed OR/MINUS', () => {
    const ctx = makeCtx('< 404684003 OR < 19829001 MINUS < 301867009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered for OR/MINUS mix');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('(< 404684003 OR < 19829001)'), `OR group should be wrapped, got: ${text}`);
    assert.ok(text.includes('MINUS'), `Should have MINUS, got: ${text}`);
  });

  it('should parenthesise mixed AND/OR/MINUS', () => {
    const ctx = makeCtx('< 404684003 AND < 19829001 OR < 301867009 MINUS < 73211009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered for three-way mix');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('MINUS'), `Should have MINUS as outer operator, got: ${text}`);
    assert.ok(text.includes('('), 'Should have parentheses');
  });

  it('should not offer for MINUS-only expression', () => {
    const ctx = makeCtx('<< 404684003 MINUS < 19829001');
    const action = getAddParenthesesAction(ctx);
    assert.strictEqual(action, null, 'MINUS only — not offered');
  });

  it('should handle lowercase operators', () => {
    const ctx = makeCtx('< 404684003 and < 19829001 or < 301867009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Should handle lowercase operators');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('('), 'Should have parentheses');
  });

  it('should offer when inner parens exist but top-level operators are still mixed', () => {
    const ctx = makeCtx('(< 404684003 OR < 19829001) AND (< 234567890 OR < 345678901) MINUS < 456789012');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Should be offered — inner parens do not resolve AND/MINUS ambiguity');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('MINUS'), `Outer operator should be MINUS, got: ${text}`);
    assert.ok(text.startsWith('('), `AND segment should be wrapped, got: ${text}`);
  });

  it('should not offer when parens fully resolve the ambiguity', () => {
    const ctx = makeCtx('(< 404684003 AND < 19829001) OR < 301867009');
    const action = getAddParenthesesAction(ctx);
    assert.strictEqual(action, null, 'Parens resolve ambiguity — not offered');
  });

  // -- Refinement ambiguity --

  it('should parenthesise two refined sub-expressions joined by AND', () => {
    const ctx = makeCtx('< 404684003 : 363698007 = < 39057004 AND < 19829001 : 116676008 = < 72651009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered for refinement ambiguity');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('(< 404684003 : 363698007 = < 39057004)'), `First segment should be wrapped, got: ${text}`);
    assert.ok(text.includes('(< 19829001 : 116676008 = < 72651009)'), `Second segment should be wrapped, got: ${text}`);
    assert.ok(text.includes('AND'), `Should have AND between segments, got: ${text}`);
  });

  it('should parenthesise two refined sub-expressions joined by OR', () => {
    const ctx = makeCtx('< 404684003 : 363698007 = < 39057004 OR < 19829001 : 116676008 = < 72651009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered for refinement ambiguity');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('('), 'Should have parentheses');
    assert.ok(text.includes('OR'), `Should have OR, got: ${text}`);
  });

  it('should handle three refined sub-expressions', () => {
    const ctx = makeCtx('< A : x = v1 AND < B : y = v2 AND < C : z = v3');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered');
    const text = getEditText(action);
    assert.ok(text);
    // Should wrap each segment containing a colon
    const parenCount = (text.match(/\(/g) || []).length;
    assert.ok(parenCount >= 2, `Should have at least 2 opening parens, got ${parenCount} in: ${text}`);
  });

  it('should handle refined + non-refined segment', () => {
    const ctx = makeCtx('< 404684003 : 363698007 = < 39057004 AND x = v2 AND < 19829001 : 116676008 = < 72651009');
    const action = getAddParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered');
    const text = getEditText(action);
    assert.ok(text);
    assert.ok(text.includes('('), 'Should have parentheses wrapping refined segments');
  });

  it('should not offer refinement ambiguity when only one colon at depth 0', () => {
    const ctx = makeCtx('< 404684003 : 363698007 = < 39057004 AND 116676008 = < 72651009');
    const action = getAddParenthesesAction(ctx);
    // Single colon — no refinement ambiguity (AND here is refinement-internal)
    assert.strictEqual(action, null, 'Single colon — no refinement ambiguity');
  });

  it('should not offer when refined sub-expressions already have parens', () => {
    const ctx = makeCtx('(< 404684003 : 363698007 = < 39057004) AND (< 19829001 : 116676008 = < 72651009)');
    const action = getAddParenthesesAction(ctx);
    // Colons are inside parens (depth 1), not depth 0, so no ambiguity detected
    assert.strictEqual(action, null, 'Already parenthesised — not offered');
  });
});

// ─── Add history supplement ─────────────────────────────────────────────────

describe('Add history supplement', () => {
  it('should offer 4 profile-specific actions for simple expression', () => {
    const ctx = makeCtx('< 404684003');
    const actions = getAddHistorySupplementActions(ctx);
    assert.strictEqual(actions.length, 4, 'Should offer 4 history profile actions');
    assert.strictEqual(actions[0].title, 'Add history supplement (HISTORY-MIN)');
    assert.strictEqual(actions[1].title, 'Add history supplement (HISTORY-MOD)');
    assert.strictEqual(actions[2].title, 'Add history supplement (HISTORY-MAX)');
    assert.strictEqual(actions[3].title, 'Add history supplement (HISTORY)');

    // Verify the first action inserts HISTORY-MIN
    const edits = actions[0].edits;
    assert.ok(edits);
    assert.strictEqual(edits[0].newText, ' {{ + HISTORY-MIN }}');
  });

  it('should insert correct profile text for each action', () => {
    const ctx = makeCtx('< 404684003');
    const actions = getAddHistorySupplementActions(ctx);
    const profiles = ['HISTORY-MIN', 'HISTORY-MOD', 'HISTORY-MAX', 'HISTORY'];
    for (let i = 0; i < 4; i++) {
      const edits = actions[i].edits;
      assert.ok(edits);
      assert.strictEqual(edits[0].newText, ` {{ + ${profiles[i]} }}`);
    }
  });

  it('backward compat: single action returns HISTORY-MIN', () => {
    const ctx = makeCtx('< 404684003');
    const action = getAddHistorySupplementAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Add history supplement (HISTORY-MIN)');
  });

  it('should not offer when history supplement already exists', () => {
    const ctx = makeCtx('< 404684003 {{ + HISTORY-MIN }}');
    const actions = getAddHistorySupplementActions(ctx);
    assert.strictEqual(actions.length, 0, 'Already has supplement — not offered');
  });

  it('should not offer when HISTORY-MAX exists', () => {
    const ctx = makeCtx('< 404684003 {{ + HISTORY-MAX }}');
    const actions = getAddHistorySupplementActions(ctx);
    assert.strictEqual(actions.length, 0, 'Already has HISTORY-MAX — not offered');
  });

  it('should not offer when HISTORY with subset exists', () => {
    const ctx = makeCtx('< 404684003 {{ + HISTORY (< 900000000000527005) }}');
    const actions = getAddHistorySupplementActions(ctx);
    assert.strictEqual(actions.length, 0, 'Already has HISTORY with subset — not offered');
  });
});

// ─── Add description filter ─────────────────────────────────────────────────

describe('Add description filter', () => {
  it('should add description filter to simple expression', () => {
    const ctx = makeCtx('< 404684003');
    const action = getAddDescriptionFilterAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Add description filter');
    const edits = action.edits;
    assert.ok(edits);
    assert.strictEqual(edits[0].newText, ' {{ D term = "" }}');
  });

  it('should not offer when description filter already exists', () => {
    const ctx = makeCtx('< 404684003 {{ D term = "heart" }}');
    const action = getAddDescriptionFilterAction(ctx);
    assert.strictEqual(action, null, 'Already has description filter — not offered');
  });

  it('should still offer when concept filter exists (not description)', () => {
    const ctx = makeCtx('< 404684003 {{ C definitionStatusId = 900000000000074008 }}');
    const action = getAddDescriptionFilterAction(ctx);
    assert.ok(action, 'Concept filter is not description filter — should offer');
  });

  it('should not offer when D filter text pattern exists', () => {
    const ctx = makeCtx('< 404684003 {{ D typeId = 900000000000003001 }}');
    const action = getAddDescriptionFilterAction(ctx);
    assert.strictEqual(action, null, 'D filter exists — not offered');
  });
});

// ─── Remove redundant parentheses ────────────────────────────────────────────

describe('Remove redundant parentheses', () => {
  it('should remove parens around single sub-expression', () => {
    const ctx = makeCtx('(< 404684003) AND < 19829001');
    const action = getRemoveParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered');
    assert.strictEqual(action.title, 'Remove redundant parentheses');
    const edits = action.edits;
    assert.ok(edits);
    assert.strictEqual(edits[0].newText, '< 404684003 AND < 19829001');
  });

  it('should remove parens around entire expression', () => {
    const ctx = makeCtx('(< 404684003)');
    const action = getRemoveParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered');
    const edits = action.edits;
    assert.ok(edits);
    assert.strictEqual(edits[0].newText, '< 404684003');
  });

  it('should not offer for needed grouping parens', () => {
    const ctx = makeCtx('(< 404684003 AND < 19829001) OR < 301867009');
    const action = getRemoveParenthesesAction(ctx);
    assert.strictEqual(action, null, 'Parens needed for grouping — not offered');
  });

  it('should not offer for refinement parens', () => {
    const ctx = makeCtx('(< 404684003 : 363698007 = < 39057004) AND < 19829001');
    const action = getRemoveParenthesesAction(ctx);
    assert.strictEqual(action, null, 'Refinement parens needed — not offered');
  });

  it('should not offer when no parens exist', () => {
    const ctx = makeCtx('< 404684003 AND < 19829001');
    const action = getRemoveParenthesesAction(ctx);
    assert.strictEqual(action, null, 'No parens — not offered');
  });

  it('should not offer for filter block parens', () => {
    const ctx = makeCtx('(< 404684003 {{ D term = "test" }})');
    const action = getRemoveParenthesesAction(ctx);
    assert.strictEqual(action, null, 'Filter block parens — not offered');
  });

  it('should remove multiple independent redundant parens', () => {
    const ctx = makeCtx('(< 404684003) AND (< 19829001)');
    const action = getRemoveParenthesesAction(ctx);
    assert.ok(action, 'Action should be offered');
    const edits = action.edits;
    assert.ok(edits);
    assert.strictEqual(edits[0].newText, '< 404684003 AND < 19829001');
  });
});

// ─── Null expression guard (incomplete parse) ────────────────────────────────

describe('Refactoring null-expression guard', () => {
  it('unified-simplify should return null when AST expression is null', () => {
    const ctx = makeCtx('< ');
    if (ctx.ast) (ctx.ast as { expression: unknown }).expression = null;
    const action = getUnifiedSimplifyAction(ctx);
    assert.strictEqual(action, null);
  });

  it('add-parentheses should return null when AST expression is null', () => {
    const ctx = makeCtx('< ');
    if (ctx.ast) (ctx.ast as { expression: unknown }).expression = null;
    // Just verify the function doesn't crash with a null expression
    assert.doesNotThrow(() => getAddParenthesesAction(ctx));
  });

  it('add-history-supplement should not crash when AST expression is null', () => {
    const ctx = makeCtx('< ');
    if (ctx.ast) (ctx.ast as { expression: unknown }).expression = null;
    // Just verify the function doesn't crash with a null expression
    assert.doesNotThrow(() => getAddHistorySupplementAction(ctx));
  });

  it('add-description-filter should not crash when AST expression is null', () => {
    const ctx = makeCtx('< ');
    if (ctx.ast) (ctx.ast as { expression: unknown }).expression = null;
    // Just verify the function doesn't crash with a null expression
    assert.doesNotThrow(() => getAddDescriptionFilterAction(ctx));
  });
});

// ─── Sub-expression refactoring ──────────────────────────────────────────────

describe('Sub-expression refactoring', () => {
  function actionsAt(text: string, cursorChar: number) {
    const range = {
      start: { line: 0, character: cursorChar },
      end: { line: 0, character: cursorChar },
    };
    return getRefactoringActions(TEST_URI, text, range);
  }

  it('should offer sub-expression parentheses for mixed operators inside parens', () => {
    const text = '(< 404684003 AND < 19829001 OR < 301867009) MINUS < 73211009';
    const actions = actionsAt(text, 10);
    const subParen = actions.find((a) => a.title === 'Add explicit parentheses (sub-expression)');
    assert.ok(subParen, 'Should offer sub-expression parentheses');
  });

  it('should not offer sub-expression actions when cursor is outside parens', () => {
    const text = '(< 404684003 OR < 19829001) MINUS < 301867009';
    const actions = actionsAt(text, 40);
    const subActions = actions.filter((a) => a.title.includes('(sub-expression)'));
    assert.strictEqual(subActions.length, 0, 'No sub-expression actions outside parens');
  });

  it('should skip display terms when finding paren groups', () => {
    // Uses mixed AND/OR inside parens so "Add explicit parentheses (sub-expression)" is offered
    const text = '(< 404684003 |Clinical finding (disorder)| AND < 19829001 OR < 301867009) MINUS < 73211009';
    const actions = actionsAt(text, 5);
    const subParen = actions.find((a) => a.title === 'Add explicit parentheses (sub-expression)');
    assert.ok(subParen, 'Should find paren group despite parens in display terms');
  });

  it('should not offer sub-expression simplify (engine handles nesting internally)', () => {
    const text = '(<< 404684003 OR < 404684003) AND < 19829001';
    const actions = actionsAt(text, 5);
    // Unified simplify is only offered at whole-line level, not as sub-expression
    const subSimplify = actions.find((a) => a.title === 'Simplify (sub-expression)');
    assert.strictEqual(subSimplify, undefined, 'No sub-expression simplify — engine handles nesting');
    // But whole-line simplify should still be offered
    const wholeSimplify = actions.find((a) => a.title === 'Simplify');
    assert.ok(wholeSimplify, 'Whole-line simplify should be offered');
  });
});

// ─── Multi-line expression refactoring ──────────────────────────────────────

describe('Multi-line expression refactoring', () => {
  function actionsAtLine(text: string, line: number, character = 0) {
    const range = {
      start: { line, character },
      end: { line, character },
    };
    return getRefactoringActions(TEST_URI, text, range);
  }

  it('should find the full multi-line expression when cursor is on a continuation line', () => {
    const text =
      '< 19829001 |Disorder of lung|\n  OR < 301867009 |Finding of respiratory system|\n  OR < 195967001 |Asthma|';
    // Cursor on line 1 (the middle OR line)
    const actions = actionsAtLine(text, 1, 5);
    const strip = actions.find((a) => a.title === 'Strip display terms');
    assert.ok(strip, 'Should offer strip display terms for the full expression');
    // The edit should strip ALL terms from the whole expression, not just the middle line
    const edit = strip.edits?.[0];
    assert.ok(edit, 'Should have an edit');
    assert.ok(!edit.newText.includes('|'), 'All terms should be stripped from the whole expression');
    assert.ok(edit.newText.includes('19829001'), 'Should include first concept');
    assert.ok(edit.newText.includes('301867009'), 'Should include second concept');
    assert.ok(edit.newText.includes('195967001'), 'Should include third concept');
  });

  it('should offer actions when cursor is on the first line of multi-line expression', () => {
    const text = '< 19829001 |Disorder of lung|\n  OR < 301867009\n  OR < 195967001 |Asthma|';
    const actions = actionsAtLine(text, 0, 5);
    const strip = actions.find((a) => a.title === 'Strip display terms');
    assert.ok(strip, 'Should offer strip on first line');
  });

  it('should offer actions when cursor is on the last line of multi-line expression', () => {
    const text = '< 19829001 |Disorder of lung|\n  OR < 301867009\n  OR < 195967001 |Asthma|';
    const actions = actionsAtLine(text, 2, 5);
    const strip = actions.find((a) => a.title === 'Strip display terms');
    assert.ok(strip, 'Should offer strip on last line');
  });

  it('should handle ECL-END delimiters between expressions', () => {
    const text = '< 19829001\n  OR < 301867009\n/* ECL-END */\n< 195967001 |Asthma|';
    // Cursor on expression 2 (line 3)
    const actions = actionsAtLine(text, 3, 5);
    const strip = actions.find((a) => a.title === 'Strip display terms');
    assert.ok(strip, 'Should offer strip for second expression');
    const edit = strip.edits?.[0];
    assert.ok(edit, 'Should have an edit');
    // Should only affect expression 2, not expression 1
    assert.ok(edit.newText.includes('195967001'), 'Should include concept from expression 2');
    assert.ok(!edit.newText.includes('19829001'), 'Should NOT include concept from expression 1');
  });
});
