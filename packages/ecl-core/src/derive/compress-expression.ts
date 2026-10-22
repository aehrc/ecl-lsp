// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Compress an ECL expression: shorter forms, with exact differences (issue #149 Part 2).
//
// The Simplify engine (`simplifyExpression`) only drops or merges operands, so
// it never changes the result set, and it cannot turn 24 listed ingredients into
// one class grouper. Compression can: it runs `deriveEcl` over the concepts an
// enumerated group selects, puts each candidate back where the group was, and
// counts on the server what the whole expression then adds and misses compared
// with the original.
//
// The group is the part of the expression worth compressing: the expression
// itself when it is an OR, or else the largest parenthesised OR operand of a
// top-level AND / MINUS or refinement focus. What surrounds it (`AND ^ refset`,
// a refinement) is kept as written, as the issue asks.
//
// The original and its exact simplification are always candidates, with no
// differences, so a caller is never forced to accept a lossy form.

import { canonicalise } from '../canonical/comparator';
import { parseECL } from '../parser';
import { NodeType, type SubExpressionNode, type ExpressionNode } from '../parser/ast';
import { simplifyExpression } from '../refactoring/simplify-expression';
import type { ITerminologyService } from '../terminology/types';
import {
  countClauses,
  decorate,
  deriveEcl,
  displayTerms,
  type CandidateConstruction,
  type DeriveOptions,
  type SetDifference,
} from './derive-ecl';

export interface CompressCandidate {
  /** The candidate, formatted, with display terms unless `omitTerms`. */
  expression: string;
  /** The same expression without terms, as built. */
  ecl: string;
  /** Concepts it selects that the original does not. */
  additions: SetDifference;
  /** Concepts the original selects that it does not. */
  misses: SetDifference;
  exact: boolean;
  /** Concept references in `ecl`. */
  clauses: number;
  /**
   * - `original`: the expression as given
   * - `simplified`: the exact simplification (`simplifyExpression`)
   * - `derived`: a `deriveEcl` candidate for the group, put back in place
   */
  source: 'original' | 'simplified' | 'derived';
  /** For `derived`: how the replacement for the group was built. */
  construction?: CandidateConstruction;
}

export interface CompressResult {
  /** Concepts the original selects. */
  members: number;
  /** The part of the expression that was compressed, or null when nothing could be. */
  group: { text: string; start: number; end: number } | null;
  /** Best first: by clauses + additions + misses, exact first on a tie. */
  candidates: CompressCandidate[];
  notes: string[];
  /** Syntax errors; the expression is not compressed when there are any. */
  errors: string[];
}

/**
 * Propose shorter forms of an ECL expression, each with exact counts and
 * samples of what it adds to and misses from the original's result set.
 *
 * Needs a terminology service with `expandCompose`.
 */
export async function compressExpression(
  ecl: string,
  terminology: ITerminologyService,
  options: DeriveOptions = {},
): Promise<CompressResult> {
  const original = ecl.trim();
  const parsed = parseECL(original);
  const result: CompressResult = { members: 0, group: null, candidates: [], notes: [], errors: [] };
  if (!parsed.ast || parsed.errors.length > 0) {
    result.errors = parsed.errors.map((e) => e.message);
    return result;
  }
  if (!terminology.expandCompose) {
    throw new Error('compressExpression needs a terminology service that supports expandCompose');
  }
  const expand = terminology.expandCompose.bind(terminology);
  result.members = (await expand({ include: [{ ecl: original }] })).total;

  const built: Omit<CompressCandidate, 'expression'>[] = [
    { ecl: original, ...noDifference(original), source: 'original' },
  ];
  const simplified = await simplifyExpression(original, terminology);
  if (simplified.changed) {
    built.push({ ecl: simplified.expression, ...noDifference(simplified.expression), source: 'simplified' });
  }

  const group = findGroup(parsed.ast, original);
  result.group = group;
  if (group) {
    const derived = await deriveEcl({ ecl: group.text }, terminology, { ...options, omitTerms: true });
    result.notes.push(...derived.notes);
    const sampleSize = options.sampleSize ?? 10;
    for (const c of derived.candidates) {
      if (c.construction.kind === 'expression') continue;
      const full = original.slice(0, group.start) + c.ecl + original.slice(group.end);
      // A reordering of a form already listed is not a new candidate.
      if (built.some((b) => sameForm(b.ecl, full))) continue;
      const [additions, misses] = await Promise.all([
        sample(expand, { include: [{ ecl: full }], exclude: [{ ecl: original }] }, sampleSize),
        sample(expand, { include: [{ ecl: original }], exclude: [{ ecl: full }] }, sampleSize),
      ]);
      built.push({
        ecl: full,
        additions,
        misses,
        exact: additions.count === 0 && misses.count === 0,
        clauses: countClauses(full),
        source: 'derived',
        construction: c.construction,
      });
    }
  } else {
    result.notes.push('No OR group to compress: the expression is not a disjunction and has none in parentheses.');
  }

  built.sort(
    (a, b) =>
      cost(a) - cost(b) ||
      Number(b.exact) - Number(a.exact) ||
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
      a.ecl.length - b.ecl.length,
  );
  const top = built.slice(0, options.maxCandidates ?? 8);
  const terms = options.omitTerms ? new Map<string, string>() : await displayTerms(top, terminology);
  result.candidates = top.map((c) => ({ expression: decorate(c.ecl, terms), ...c }));
  return result;
}

/** On a tie, prefer a shorter form the reader has not seen over the original. */
const SOURCE_ORDER: Record<CompressCandidate['source'], number> = { derived: 0, simplified: 1, original: 2 };

function cost(c: Pick<CompressCandidate, 'clauses' | 'additions' | 'misses'>): number {
  return c.clauses + c.additions.count + c.misses.count;
}

function sameForm(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return canonicalise(a) === canonicalise(b);
  } catch {
    return false;
  }
}

function noDifference(ecl: string) {
  return {
    additions: { count: 0, sample: [] },
    misses: { count: 0, sample: [] },
    exact: true,
    clauses: countClauses(ecl),
  };
}

async function sample(
  expand: NonNullable<ITerminologyService['expandCompose']>,
  compose: Parameters<NonNullable<ITerminologyService['expandCompose']>>[0],
  count: number,
): Promise<SetDifference> {
  const r = await expand(compose, { count });
  return { count: r.total, sample: r.concepts };
}

/**
 * The OR group to compress: the whole expression when it is an OR, otherwise
 * the parenthesised OR operand with the most operands in a top-level AND or
 * MINUS, or the parenthesised OR focus of a refinement. Offsets are into `text`
 * and cover the group's inside, without its parentheses.
 */
function findGroup(ast: ExpressionNode, text: string): CompressResult['group'] {
  const expr = ast.expression;
  const whole = { text, start: 0, end: text.length };
  if (expr.type === NodeType.CompoundExpression) {
    if (expr.operator.operator === 'OR') return whole;
    const groups = expr.operands
      .map((o) => orInside(o, text))
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => b.operands - a.operands || a.start - b.start);
    return groups.length > 0 ? { text: groups[0].text, start: groups[0].start, end: groups[0].end } : null;
  }
  if (expr.type === NodeType.RefinedExpression) {
    const g = orInside(expr.expression, text);
    return g ? { text: g.text, start: g.start, end: g.end } : null;
  }
  return null;
}

function orInside(
  sub: SubExpressionNode,
  text: string,
): { text: string; start: number; end: number; operands: number } | null {
  if (sub.focus.type !== NodeType.ExpressionConstraint) return null;
  const inner = sub.focus.expression;
  if (inner.type !== NodeType.CompoundExpression || inner.operator.operator !== 'OR') return null;
  const { start, end } = sub.focus.range;
  return {
    text: text.slice(start.offset, end.offset),
    start: start.offset,
    end: end.offset,
    operands: inner.operands.length,
  };
}

/** A plain-text report of a {@link CompressResult}, for an output channel or a chat message. */
export function formatCompressReport(result: CompressResult): string {
  if (result.errors.length > 0) return `Not compressed: ${result.errors.join('; ')}`;
  const lines = [`Original selects ${result.members} concepts.`];
  if (result.group && result.group.start > 0) lines.push(`Compressed group: ${result.group.text}`);
  for (const note of result.notes) lines.push(`Note: ${note}`);
  result.candidates.forEach((c, i) => {
    const status = c.exact ? 'same result' : `+${c.additions.count} added, -${c.misses.count} missed`;
    const clauses = c.clauses === 1 ? '1 clause' : `${c.clauses} clauses`;
    lines.push('', `${i + 1}. ${status}; ${clauses}; ${c.source}`);
    lines.push(...c.expression.split('\n').map((l) => `   ${l}`));
    for (const [label, d] of [
      ['Adds', c.additions],
      ['Misses', c.misses],
    ] as const) {
      if (d.count === 0) continue;
      const shown = d.sample.map((x) => `${x.code} |${x.display}|`).join(', ');
      lines.push(`   ${label} (${d.count}): ${shown}${d.count > d.sample.length ? ', …' : ''}`);
    }
  });
  return lines.join('\n');
}
