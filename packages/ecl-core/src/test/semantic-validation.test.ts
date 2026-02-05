// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseECL } from '../parser';
import { validateSemantics, SemanticDiagnostic } from '../semantic/validator';
import { extractText, extractRefinementInfo } from '../semantic/ecl-text';
import { ITerminologyService, ConceptInfo, SearchResponse, EvaluationResponse } from '../terminology/types';
import { NodeType } from '../parser/ast';

/**
 * Mock terminology service that responds to specific ECL patterns.
 * Uses pattern matching on ECL strings to simulate FHIR responses.
 */
class SemanticMockService implements ITerminologyService {
  private readonly eclResponses = new Map<string, EvaluationResponse>();

  /** Register a response for an ECL pattern (substring match). */
  whenEcl(pattern: string, response: EvaluationResponse): void {
    this.eclResponses.set(pattern, response);
  }

  async getConceptInfo(): Promise<ConceptInfo | null> {
    return null;
  }

  async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
    return new Map(conceptIds.map((id) => [id, null]));
  }

  async searchConcepts(): Promise<SearchResponse> {
    return { results: [], hasMore: false };
  }

  async evaluateEcl(expression: string): Promise<EvaluationResponse> {
    // Check registered patterns (substring match)
    for (const [pattern, response] of this.eclResponses) {
      if (expression.includes(pattern)) {
        return response;
      }
    }
    // Default: non-empty result (no warning)
    return { total: 10, concepts: [{ code: '12345678', display: 'Test' }], truncated: false };
  }
}

function _nonEmpty(total = 10): EvaluationResponse {
  return { total, concepts: [{ code: '12345678', display: 'Test' }], truncated: false };
}

function empty(): EvaluationResponse {
  return { total: 0, concepts: [], truncated: false };
}

function withConcepts(concepts: { code: string; display: string }[]): EvaluationResponse {
  return { total: concepts.length, concepts, truncated: false };
}

function parseAndValidate(text: string, svc: ITerminologyService): Promise<SemanticDiagnostic[]> {
  const result = parseECL(text);
  assert.ok(result.ast, `AST should exist for: ${text}`);
  return validateSemantics(result.ast, text, svc);
}

describe('ECL Text Extraction', () => {
  it('should extract text from a simple expression range', () => {
    const text = '< 404684003';
    const result = parseECL(text);
    assert.ok(result.ast);
    const extracted = extractText(text, result.ast.expression.range);
    assert.strictEqual(extracted, '< 404684003');
  });

  it('should extract focus ECL from refined expression', () => {
    const text = '< 404684003 : 363698007 = < 39057004';
    const result = parseECL(text);
    assert.ok(result.ast);
    assert.strictEqual(result.ast.expression.type, NodeType.RefinedExpression);
    const info = extractRefinementInfo(result.ast.expression as any, text);
    assert.strictEqual(info.focusEcl, '< 404684003');
  });

  it('should extract attribute name ECL', () => {
    const text = '< 404684003 : 363698007 = < 39057004';
    const result = parseECL(text);
    assert.ok(result.ast);
    const info = extractRefinementInfo(result.ast.expression as any, text);
    assert.strictEqual(info.attributes.length, 1);
    assert.strictEqual(info.attributes[0].nameEcl, '363698007');
  });

  it('should extract value ECL', () => {
    const text = '< 404684003 : 363698007 = < 39057004';
    const result = parseECL(text);
    assert.ok(result.ast);
    const info = extractRefinementInfo(result.ast.expression as any, text);
    assert.strictEqual(info.attributes[0].valueEcl, '< 39057004');
  });

  it('should detect wildcard value', () => {
    const text = '< 404684003 : 363698007 = *';
    const result = parseECL(text);
    assert.ok(result.ast);
    const info = extractRefinementInfo(result.ast.expression as any, text);
    assert.strictEqual(info.attributes[0].isWildcardValue, true);
    assert.strictEqual(info.attributes[0].valueEcl, null);
  });

  it('should extract multiple attributes', () => {
    const text = '< 404684003 : 363698007 = < 39057004, 116676008 = < 72651009';
    const result = parseECL(text);
    assert.ok(result.ast);
    const info = extractRefinementInfo(result.ast.expression as any, text);
    assert.strictEqual(info.attributes.length, 2);
    assert.strictEqual(info.attributes[0].nameEcl, '363698007');
    assert.strictEqual(info.attributes[1].nameEcl, '116676008');
  });
});

describe('Attribute Scope Validation', () => {
  it('should not warn when attribute is a valid linkage concept', async () => {
    const svc = new SemanticMockService();
    // MINUS query returns empty = attribute is within scope
    svc.whenEcl('MINUS', empty());

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 39057004', svc);
    const attrDiags = diags.filter((d) => d.message.includes('Linkage concept'));
    assert.strictEqual(attrDiags.length, 0);
  });

  it('should warn when attribute is not a linkage concept', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', withConcepts([{ code: '999999011', display: 'Not an attribute' }]));

    const diags = await parseAndValidate('< 404684003 : 999999011 = < 39057004', svc);
    const attrDiags = diags.filter((d) => d.message.includes('Linkage concept'));
    assert.strictEqual(attrDiags.length, 1);
    assert.ok(attrDiags[0].message.includes('999999011'));
  });

  it('should show out-of-scope concepts in warning message', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl(
      'MINUS',
      withConcepts([
        { code: '111111', display: 'Bad concept 1' },
        { code: '222222', display: 'Bad concept 2' },
      ]),
    );

    const diags = await parseAndValidate('< 404684003 : 999999011 = < 39057004', svc);
    const attrDiags = diags.filter((d) => d.message.includes('Linkage concept'));
    assert.strictEqual(attrDiags.length, 1, `Expected 1 attr diag, got ${attrDiags.length}`);
    assert.ok(attrDiags[0].message.includes('111111'), 'Should mention first concept');
    assert.ok(attrDiags[0].message.includes('222222'), 'Should mention second concept');
  });

  it('should still check attribute scope when value is wildcard', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', withConcepts([{ code: '999999011', display: 'Not an attribute' }]));

    const diags = await parseAndValidate('< 404684003 : 999999011 = *', svc);
    const attrDiags = diags.filter((d) => d.message.includes('Linkage concept'));
    assert.strictEqual(attrDiags.length, 1);
  });
});

describe('Value Constraint Validation', () => {
  it('should not warn when value is compatible with range', async () => {
    const svc = new SemanticMockService();
    // AND query (value AND A.B) returns results = compatible
    svc.whenEcl('MINUS', empty()); // attribute scope ok

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 39057004', svc);
    const valueDiags = diags.filter((d) => d.message.includes('no concepts in common'));
    assert.strictEqual(valueDiags.length, 0);
  });

  it('should warn when value is completely disjoint from range', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty()); // attribute scope ok
    svc.whenEcl('AND', empty()); // value AND A.B = 0 = disjoint

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 71388002', svc);
    const valueDiags = diags.filter((d) => d.message.includes('no concepts in common'));
    assert.strictEqual(valueDiags.length, 1);
  });

  it('should skip value check when value is wildcard', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty());
    svc.whenEcl('AND', empty()); // would trigger if not skipped

    const diags = await parseAndValidate('< 404684003 : 363698007 = *', svc);
    const valueDiags = diags.filter((d) => d.message.includes('no concepts in common'));
    assert.strictEqual(valueDiags.length, 0);
  });

  it('should skip value check when focus is wildcard', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty());
    svc.whenEcl('AND', empty());

    const diags = await parseAndValidate('* : 363698007 = < 39057004', svc);
    const valueDiags = diags.filter((d) => d.message.includes('no concepts in common'));
    assert.strictEqual(valueDiags.length, 0);
  });
});

describe('Empty Sub-Expression Detection', () => {
  it('should warn when a compound operand matches nothing', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('999999999', empty());

    const diags = await parseAndValidate('< 404684003 AND < 999999999', svc);
    const emptyDiags = diags.filter((d) => d.message.includes('matches no concepts'));
    assert.strictEqual(emptyDiags.length, 1);
    assert.ok(emptyDiags[0].message.includes('999999999'));
  });

  it('should not warn when all operands match', async () => {
    const svc = new SemanticMockService();

    const diags = await parseAndValidate('< 404684003 AND < 19829001', svc);
    const emptyDiags = diags.filter((d) => d.message.includes('matches no concepts'));
    assert.strictEqual(emptyDiags.length, 0);
  });

  it('should warn on empty operand in OR expression', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('999999999', empty());

    const diags = await parseAndValidate('< 404684003 OR < 999999999', svc);
    const emptyDiags = diags.filter((d) => d.message.includes('matches no concepts'));
    assert.strictEqual(emptyDiags.length, 1);
  });

  it('should warn on empty focus in refinement', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('999999999', empty());
    svc.whenEcl('MINUS', empty());

    const diags = await parseAndValidate('< 999999999 : 363698007 = < 39057004', svc);
    const emptyDiags = diags.filter((d) => d.message.includes('matches no concepts'));
    assert.ok(emptyDiags.length >= 1, 'Should have at least one empty expression warning');
  });
});

describe('Individual Refinement Validation', () => {
  it('should warn when individual refinement matches nothing', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty()); // attribute scope ok
    // The individual refinement ECL includes the colon
    svc.whenEcl(': 116676008 =', empty());

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 39057004, 116676008 = < 999999999', svc);
    const refinementDiags = diags.filter((d) => d.message.includes('refinement matches no concepts'));
    assert.ok(refinementDiags.length >= 1, 'Should warn on impossible refinement');
  });

  it('should not warn when all refinements match', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty());

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 39057004, 116676008 = < 72651009', svc);
    const refinementDiags = diags.filter((d) => d.message.includes('refinement matches no concepts'));
    assert.strictEqual(refinementDiags.length, 0);
  });

  it('should skip refinement check when value is wildcard', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty());

    const diags = await parseAndValidate('< 404684003 : 363698007 = *', svc);
    const refinementDiags = diags.filter((d) => d.message.includes('refinement matches no concepts'));
    assert.strictEqual(refinementDiags.length, 0);
  });
});

describe('Graceful Degradation', () => {
  it('should not throw when FHIR service fails', async () => {
    const svc = new SemanticMockService();
    // Override evaluateEcl to always throw
    svc.evaluateEcl = async () => {
      throw new Error('Network error');
    };

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 39057004', svc);
    // Should return empty diagnostics, not throw
    assert.ok(Array.isArray(diags));
  });

  it('should still report other checks when one fails', async () => {
    const svc = new SemanticMockService();
    let callCount = 0;
    const originalEvaluate = svc.evaluateEcl.bind(svc);
    svc.evaluateEcl = async (ecl: string, _limit?: number) => {
      callCount++;
      // Fail only the first call (attribute scope check)
      if (callCount === 1) throw new Error('Network error');
      return originalEvaluate(ecl);
    };

    const diags = await parseAndValidate('< 404684003 : 363698007 = < 39057004', svc);
    // Should not throw, may or may not have diagnostics depending on which call failed
    assert.ok(Array.isArray(diags));
  });
});

describe('Wildcard Handling', () => {
  it('should skip value and refinement checks for wildcard value', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', empty()); // attribute scope ok
    // These would trigger warnings if not skipped
    svc.whenEcl('AND', empty());

    const diags = await parseAndValidate('< 404684003 : 363698007 = *', svc);
    const valueDiags = diags.filter(
      (d) => d.message.includes('no concepts in common') || d.message.includes('refinement matches no concepts'),
    );
    assert.strictEqual(valueDiags.length, 0);
  });

  it('should skip value check but not attribute check for wildcard focus', async () => {
    const svc = new SemanticMockService();
    svc.whenEcl('MINUS', withConcepts([{ code: '999', display: 'Bad' }]));

    const diags = await parseAndValidate('* : 999999011 = < 39057004', svc);
    // Should still have attribute scope warning
    const attrDiags = diags.filter((d) => d.message.includes('Linkage concept'));
    assert.strictEqual(attrDiags.length, 1);
    // Should NOT have value constraint warning (wildcard focus)
    const valueDiags = diags.filter((d) => d.message.includes('no concepts in common'));
    assert.strictEqual(valueDiags.length, 0);
  });
});

describe('Simple Expressions (no refinement)', () => {
  it('should produce no warnings for a simple valid expression', async () => {
    const svc = new SemanticMockService();

    const diags = await parseAndValidate('< 404684003', svc);
    assert.strictEqual(diags.length, 0);
  });

  it('should produce no warnings for a valid compound expression', async () => {
    const svc = new SemanticMockService();

    const diags = await parseAndValidate('< 404684003 AND < 19829001', svc);
    assert.strictEqual(diags.length, 0);
  });
});
