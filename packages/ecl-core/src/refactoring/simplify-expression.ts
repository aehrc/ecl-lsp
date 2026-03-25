// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Unified simplification engine for ECL expressions
//
// A single "Simplify" code action walks the expression tree bottom-up
// (innermost parenthesized sub-expressions first), applying a chain of
// techniques at each AND/OR compound node.
//
// Techniques (applied in order at each node):
//
//   1. Remove exact duplicate operands
//      < A AND < B AND < A  →  < A AND < B
//
//   2. Same-concept operator ranking
//      AND keeps the most restrictive:  << X AND < X  →  < X
//      OR  keeps the broadest:          << X OR  < X  →  << X
//
//   3a. Factor common focus (OR)
//      (< X : a = v1) OR (< X : b = v2)  →  < X : a = v1 OR b = v2
//
//   3b. Merge same-focus refinements (AND)
//      (< X : a = v1) AND (< X : b = v2)  →  < X : a = v1, b = v2
//      Uses comma (equivalent to AND in refinement context, reads as
//      a natural continuation of the refinement list).
//
//   4. FHIR subsumption via MINUS evaluation (async)
//      AND: if A ⊆ B then keep A (the subset)
//      OR:  if A ⊆ B then keep B (the superset)
//      Requires a live FHIR terminology server connection.
//
// After any technique transforms the expression, the sync chain restarts
// from the top on the new text, catching cascading simplifications
// (e.g. dedup → ranking in a single resolve).

import type { CoreCodeAction } from '../types';
import { coreReplace } from '../types';
import type { RefactoringContext } from './index';
import { parseECL } from '../parser';
import { NodeType, type ExpressionNode, type SubExpressionNode } from '../parser/ast';
import type { ITerminologyService } from '../terminology/types';

// ── AST helpers ──────────────────────────────────────────────────────────

function getConceptId(sub: SubExpressionNode): string | null {
  if (sub.focus.type === NodeType.ConceptReference) {
    return sub.focus.conceptId;
  }
  return null;
}

function getOperator(sub: SubExpressionNode): string | undefined {
  return sub.operator?.operator;
}

function opKey(op: string | undefined): string {
  return op ?? 'self';
}

function sliceText(text: string, node: { range: { start: { offset: number }; end: { offset: number } } }): string {
  return text.substring(node.range.start.offset, node.range.end.offset);
}

/** Check whether any AND/OR compound with 2+ operands exists in the AST. */
function hasAnyCompound(ast: ExpressionNode): boolean {
  const expr = ast.expression;

  if (expr.type === NodeType.CompoundExpression) {
    const compound = expr;
    if (compound.operator.operator !== 'MINUS' && compound.operands.length >= 2) {
      return true;
    }
    // Check inside parenthesized operands
    for (const op of compound.operands) {
      if (op.focus.type === NodeType.ExpressionConstraint) {
        if (hasAnyCompound(op.focus)) return true;
      }
    }
  }

  return false;
}

// ── Technique 1: Remove exact duplicate operands ─────────────────────────

function removeDuplicates(operandTexts: string[]): string[] | null {
  const seen = new Set<string>();
  const kept: string[] = [];
  let changed = false;

  for (const t of operandTexts) {
    if (seen.has(t)) {
      changed = true;
    } else {
      seen.add(t);
      kept.push(t);
    }
  }

  return changed ? kept : null;
}

// ── Technique 2: Same-concept operator ranking ───────────────────────────

const AND_RANK: Record<string, number> = { self: 0, '<': 1, '<<': 2 };
const OR_RANK: Record<string, number> = { self: 0, '<': 1, '<<': 2 };

// eslint-disable-next-line sonarjs/cognitive-complexity -- inherently complex: parses each operand, groups by concept, then selects best rank per group for AND/OR
function rankOperands(operandTexts: string[], compoundOp: 'AND' | 'OR'): string[] | null {
  // Parse each operand to get concept info
  interface OperandInfo {
    conceptId: string;
    opKey: string;
    rank: number;
    index: number;
  }

  const rankTable = compoundOp === 'AND' ? AND_RANK : OR_RANK;
  const infos: (OperandInfo | null)[] = operandTexts.map((text, index) => {
    const result = parseECL(text);
    if (!result.ast?.expression) return null;
    const expr = result.ast.expression;
    if (expr.type !== NodeType.SubExpressionConstraint) return null;
    const sub = expr as unknown as SubExpressionNode;
    if (sub.memberOf || sub.filters?.length || sub.historySupplement) return null;
    const cid = getConceptId(sub);
    if (cid === null) return null;
    const ok = opKey(getOperator(sub));
    if (!(ok in rankTable)) return null;
    return { conceptId: cid, opKey: ok, rank: rankTable[ok], index };
  });

  // Group by concept ID
  const byConcept = new Map<string, OperandInfo[]>();
  for (const info of infos) {
    if (!info) continue;
    let group = byConcept.get(info.conceptId);
    if (!group) {
      group = [];
      byConcept.set(info.conceptId, group);
    }
    group.push(info);
  }

  const removeSet = new Set<number>();

  for (const group of byConcept.values()) {
    if (group.length < 2) continue;

    if (compoundOp === 'AND') {
      // Keep most restrictive (lowest rank)
      let bestIdx = 0;
      let bestRank = group[0].rank;
      for (let i = 1; i < group.length; i++) {
        if (group[i].rank < bestRank) {
          bestRank = group[i].rank;
          bestIdx = i;
        }
      }
      for (let i = 0; i < group.length; i++) {
        if (i !== bestIdx) removeSet.add(group[i].index);
      }
    } else {
      // Keep broadest (highest rank)
      let bestIdx = 0;
      let bestRank = group[0].rank;
      for (let i = 1; i < group.length; i++) {
        if (group[i].rank > bestRank) {
          bestRank = group[i].rank;
          bestIdx = i;
        }
      }
      for (let i = 0; i < group.length; i++) {
        if (i !== bestIdx) removeSet.add(group[i].index);
      }
    }
  }

  if (removeSet.size === 0) return null;
  return operandTexts.filter((_, i) => !removeSet.has(i));
}

// ── Technique 3: Factor common focus (OR) / Merge same-focus (AND) ───────

function getFocusKey(text: string): { focusKey: string; focusText: string; refinementText: string } | null {
  const result = parseECL(text);
  if (!result.ast?.expression) return null;
  const expr = result.ast.expression;

  // Must be a parenthesized expression containing a refined expression
  // In the AST: SubExpressionNode with focus = ExpressionConstraint
  // whose inner expression is a RefinedExpression
  if (expr.type !== NodeType.SubExpressionConstraint) return null;
  const sub = expr as unknown as SubExpressionNode;
  if (sub.focus.type !== NodeType.ExpressionConstraint) return null;

  const nested = sub.focus;
  if (nested.expression.type !== NodeType.RefinedExpression) return null;

  const refined = nested.expression;
  const focusSub = refined.expression;

  if (focusSub.focus.type !== NodeType.ConceptReference) return null;
  const concept = focusSub.focus;
  const op = focusSub.operator ? focusSub.operator.operator : '';
  const focusKey = `${op}|${concept.conceptId}`;

  // Extract text spans from the inner text (strip outer parens)
  // eslint-disable-next-line sonarjs/slow-regex -- bounded to single ECL operand text (short)
  const innerText = text.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '');
  const innerResult = parseECL(innerText);
  if (!innerResult.ast?.expression) return null;
  const innerExpr = innerResult.ast.expression;
  if (innerExpr.type !== NodeType.RefinedExpression) return null;
  const innerRefined = innerExpr;

  const focusText = sliceText(innerText, innerRefined.expression);
  const refinementText = sliceText(innerText, innerRefined.refinement);

  return { focusKey, focusText, refinementText };
}

function factorOrMergeFocus(operandTexts: string[], compoundOp: 'AND' | 'OR'): string | null {
  if (operandTexts.length < 2) return null;

  const parts = operandTexts.map((t) => getFocusKey(t));

  // All operands must be parenthesized refined expressions
  if (parts.includes(null)) return null;

  const validParts = parts as NonNullable<(typeof parts)[0]>[];

  // All must share the same focus
  const commonKey = validParts[0].focusKey;
  if (!validParts.every((p) => p.focusKey === commonKey)) return null;

  const commonFocusText = validParts[0].focusText;
  // OR: factor keeps OR between refinements
  // AND: merge uses comma (equivalent to AND in refinement context, reads as continuation)
  const joinSep = compoundOp === 'OR' ? ' OR ' : ', ';
  const joinedRefinements = validParts.map((p) => p.refinementText).join(joinSep);

  return `${commonFocusText} : ${joinedRefinements}`;
}

// ── Technique 4: FHIR subsumption via MINUS ──────────────────────────────

// eslint-disable-next-line sonarjs/cognitive-complexity -- pairwise subsumption check with pre-evaluation and AND/OR branching
async function fhirSubsumption(
  operandTexts: string[],
  compoundOp: 'AND' | 'OR',
  terminologyService: ITerminologyService,
): Promise<string[] | null> {
  const n = operandTexts.length;
  if (n < 2) return null;

  const removeSet = new Set<number>();

  // Pre-check: evaluate each operand individually
  const nonEmpty = new Set<number>();
  for (let i = 0; i < n; i++) {
    try {
      const result = await terminologyService.evaluateEcl(operandTexts[i], 1);
      if (result.total > 0) nonEmpty.add(i);
    } catch {
      // Can't evaluate → treat as non-removable
    }
  }

  // Check pairs of non-empty operands
  for (let i = 0; i < n && removeSet.size < n - 1; i++) {
    if (removeSet.has(i) || !nonEmpty.has(i)) continue;
    for (let j = i + 1; j < n && removeSet.size < n - 1; j++) {
      if (removeSet.has(j) || !nonEmpty.has(j)) continue;

      try {
        const aMinusB = await terminologyService.evaluateEcl(`(${operandTexts[i]}) MINUS (${operandTexts[j]})`, 1);

        if (aMinusB.total === 0) {
          if (compoundOp === 'AND') {
            removeSet.add(j);
          } else {
            removeSet.add(i);
            break;
          }
          continue;
        }

        const bMinusA = await terminologyService.evaluateEcl(`(${operandTexts[j]}) MINUS (${operandTexts[i]})`, 1);

        if (bMinusA.total === 0) {
          if (compoundOp === 'AND') {
            removeSet.add(i);
            break;
          } else {
            removeSet.add(j);
          }
        }
      } catch {
        // Skip this pair
      }
    }
  }

  if (removeSet.size === 0) return null;
  return operandTexts.filter((_, i) => !removeSet.has(i));
}

// ── Bottom-up engine ─────────────────────────────────────────────────────

/**
 * Extract compound operator and operand texts from a parsed expression.
 * Returns null if the expression is not an AND/OR compound.
 */
function decomposeCompound(text: string): {
  compoundOp: 'AND' | 'OR';
  operandTexts: string[];
} | null {
  const result = parseECL(text);
  if (!result.ast?.expression) return null;
  if (result.errors.length > 0) return null;
  const expr = result.ast.expression;
  if (expr.type !== NodeType.CompoundExpression) return null;

  const compound = expr;
  const op = compound.operator.operator;
  if (op === 'MINUS') return null;
  if (compound.operands.length < 2) return null;

  const operandTexts = compound.operands.map((o) => sliceText(text, o));
  return { compoundOp: op, operandTexts };
}

/**
 * Recursively simplify a parenthesized operand text.
 * If the text is `(inner)`, recursively simplify `inner` and wrap back.
 */
async function simplifyOperand(text: string, terminologyService: ITerminologyService | null): Promise<string> {
  // Check if this operand is a parenthesized expression
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return text;

  // Extract inner text (strip outer parens)
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return text;

  // Recursively simplify the inner expression
  const simplified = await simplifyText(inner, terminologyService);
  if (simplified === inner) return text;

  // Re-wrap if the simplified result is still a compound
  const innerParse = parseECL(simplified);
  if (innerParse.ast?.expression.type === NodeType.CompoundExpression) {
    return `(${simplified})`;
  }
  // If simplified to a single operand, no parens needed
  return simplified;
}

/**
 * Apply synchronous techniques to a compound, returning new text or null.
 */
function applySyncTechniques(operandTexts: string[], compoundOp: 'AND' | 'OR'): string | null {
  // Technique 1: Remove duplicates
  const deduped = removeDuplicates(operandTexts);
  if (deduped) {
    if (deduped.length === 1) return deduped[0];
    return deduped.join(` ${compoundOp} `);
  }

  // Technique 2: Same-concept operator ranking
  const ranked = rankOperands(operandTexts, compoundOp);
  if (ranked) {
    if (ranked.length === 1) return ranked[0];
    return ranked.join(` ${compoundOp} `);
  }

  // Technique 3: Factor/merge focus
  const factored = factorOrMergeFocus(operandTexts, compoundOp);
  if (factored) return factored;

  return null;
}

/**
 * The main recursive simplification function.
 * Given expression text, simplifies it bottom-up.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- bottom-up simplification with re-decompose loops and FHIR fallback
async function simplifyText(text: string, terminologyService: ITerminologyService | null): Promise<string> {
  const decomposed = decomposeCompound(text);
  if (!decomposed) return text;

  let { compoundOp, operandTexts } = decomposed;

  // Bottom-up: recursively simplify each operand first
  let innerChanged = false;
  const simplifiedOperands: string[] = [];
  for (const opText of operandTexts) {
    const simplified = await simplifyOperand(opText, terminologyService);
    if (simplified !== opText) innerChanged = true;
    simplifiedOperands.push(simplified);
  }

  if (innerChanged) {
    operandTexts = simplifiedOperands;
    // Rebuild and re-decompose in case inner simplification changed structure
    const current = operandTexts.join(` ${compoundOp} `);
    const redecomposed = decomposeCompound(current);
    if (redecomposed) {
      compoundOp = redecomposed.compoundOp;
      operandTexts = redecomposed.operandTexts;
    } else {
      return current;
    }
  }

  // Apply sync techniques with re-check loop
  let changed = true;
  while (changed) {
    changed = false;
    const result = applySyncTechniques(operandTexts, compoundOp);
    if (result !== null) {
      changed = true;
      // Re-decompose the result
      const redecomposed = decomposeCompound(result);
      if (redecomposed) {
        compoundOp = redecomposed.compoundOp;
        operandTexts = redecomposed.operandTexts;
      } else {
        return result;
      }
    }
  }

  // Technique 4: FHIR subsumption (async)
  if (terminologyService) {
    const subsumed = await fhirSubsumption(operandTexts, compoundOp, terminologyService);
    if (subsumed) {
      if (subsumed.length === 1) return subsumed[0];
      // After FHIR, re-run sync techniques
      const afterFhir = subsumed.join(` ${compoundOp} `);
      const redecomposed = decomposeCompound(afterFhir);
      if (redecomposed) {
        const syncResult = applySyncTechniques(redecomposed.operandTexts, redecomposed.compoundOp);
        if (syncResult !== null) return syncResult;
      }
      return afterFhir;
    }
  }

  return operandTexts.join(` ${compoundOp} `);
}

// ── Public API ───────────────────────────────────────────────────────────

/** Data attached to the unresolved code action for async resolution. */
interface UnifiedSimplifyData {
  kind: 'ecl.refactoring.resolve';
  action: 'unifiedSimplify';
  uri: string;
  expressionText: string;
  expressionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Returns a "Simplify" code action when the expression contains any
 * AND/OR compound with 2+ operands at any nesting level.
 * Uses the resolve pattern since FHIR subsumption is async.
 */
export function getUnifiedSimplifyAction(ctx: RefactoringContext): CoreCodeAction | null {
  if (!ctx.ast?.expression) return null;

  // Don't offer on expressions with parse errors — the AST is partial
  // and operand extraction would produce garbage.
  const check = parseECL(ctx.expressionText);
  if (check.errors.length > 0) return null;

  if (!hasAnyCompound(ctx.ast)) return null;

  const data: UnifiedSimplifyData = {
    kind: 'ecl.refactoring.resolve',
    action: 'unifiedSimplify',
    uri: ctx.documentUri,
    expressionText: ctx.expressionText,
    expressionRange: ctx.expressionRange,
  };

  return {
    title: 'Simplify',
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    data,
  };
}

/**
 * Resolves the unified "Simplify" code action by running the full
 * bottom-up engine with all techniques including FHIR subsumption.
 */
export async function resolveUnifiedSimplify(
  codeAction: CoreCodeAction,
  terminologyService: ITerminologyService,
): Promise<CoreCodeAction> {
  const data = codeAction.data as UnifiedSimplifyData | undefined;
  if (data?.action !== 'unifiedSimplify') return codeAction;

  const simplified = await simplifyText(data.expressionText, terminologyService);

  if (simplified === data.expressionText) return codeAction;

  codeAction.edits = [coreReplace(data.expressionRange, simplified)];
  codeAction.documentUri = data.uri;

  return codeAction;
}
