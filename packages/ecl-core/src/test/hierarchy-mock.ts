// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// In-memory terminology with a real IS-A hierarchy, for tests that need set
// semantics (derive ECL, issue #147). It evaluates the ECL subset those
// features generate — concept references, `*`, the hierarchy operators,
// `^ refset`, AND / OR / MINUS, parentheses, conjunctive refinements
// (`focus : a = v, b = w`, no groups) and dot notation — by walking the
// parser's AST. Relationships are matched as given (no inheritance).

import { parseECL } from '../parser';
import {
  NodeType,
  type ExpressionNode,
  type RefinementMemberNode,
  type RefinementNode,
  type SubExpressionNode,
} from '../parser/ast';
import type {
  ConceptInfo,
  DefiningRelationship,
  EvaluationResponse,
  ExpandComposeOptions,
  ITerminologyService,
  SearchResponse,
  ValueSetClause,
  ValueSetCompose,
} from '../terminology/types';

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** A valid short-format concept SCTID for item number `item` (partition 00, Verhoeff check digit). */
export function sctid(item: number): string {
  const body = `${item}00`;
  let c = 0;
  for (let i = 0; i < body.length; i++) {
    c = D[c][P[(i + 1) % 8][Number(body[body.length - 1 - i])]];
  }
  return `${body}${INV[c]}`;
}

interface MockConcept {
  pt: string;
  parents: string[];
  active: boolean;
  relationships: DefiningRelationship[];
}

export class HierarchyMockService implements ITerminologyService {
  readonly concepts = new Map<string, MockConcept>();
  readonly refsets = new Map<string, Set<string>>();
  /** Every expandCompose call, for asserting how much work an operation did. */
  readonly composeCalls: ValueSetCompose[] = [];

  add(id: string, pt: string, parents: string[] = [], active = true): this {
    this.concepts.set(id, { pt, parents, active, relationships: [] });
    return this;
  }

  /** Give `id` the relationship `type = value` (ungrouped). */
  relate(id: string, type: string, value: string): this {
    this.concepts.get(id)?.relationships.push({ type, value, group: 0 });
    return this;
  }

  /** Leave out `getDefiningRelationships`, as a service without it would. */
  withoutRelationships(): this {
    (this as { getDefiningRelationships?: unknown }).getDefiningRelationships = undefined;
    return this;
  }

  addRefset(id: string, members: string[]): this {
    this.refsets.set(id, new Set(members));
    return this;
  }

  // ── ITerminologyService ──

  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    const c = this.concepts.get(conceptId);
    return c ? { id: conceptId, fsn: c.pt, pt: c.pt, active: c.active } : null;
  }

  async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
    const result = new Map<string, ConceptInfo | null>();
    for (const id of conceptIds) result.set(id, await this.getConceptInfo(id));
    return result;
  }

  async getDefiningRelationships(conceptId: string): Promise<DefiningRelationship[] | null> {
    return this.concepts.get(conceptId)?.relationships ?? null;
  }

  async searchConcepts(): Promise<SearchResponse> {
    return { results: [], hasMore: false };
  }

  async evaluateEcl(expression: string, limit = 200): Promise<EvaluationResponse> {
    return this.page([...this.evaluate(expression)], limit, 0);
  }

  async expandCompose(compose: ValueSetCompose, options: ExpandComposeOptions = {}): Promise<EvaluationResponse> {
    this.composeCalls.push(compose);
    const { count = 0, offset = 0, activeOnly = true } = options;
    const clauseSet = (clause: ValueSetClause): Set<string> =>
      'ecl' in clause ? this.evaluate(clause.ecl) : new Set(clause.concepts.filter((id) => this.concepts.has(id)));
    const result = new Set<string>();
    for (const clause of compose.include) for (const id of clauseSet(clause)) result.add(id);
    for (const clause of compose.exclude ?? []) for (const id of clauseSet(clause)) result.delete(id);
    const codes = [...result].filter((id) => !activeOnly || this.concepts.get(id)?.active);
    return this.page(codes, count, offset);
  }

  // ── Evaluation ──

  /** Active concepts selected by `ecl`. */
  evaluate(ecl: string): Set<string> {
    const parsed = parseECL(ecl);
    if (!parsed.ast || parsed.errors.length > 0) {
      throw new Error(`HierarchyMockService cannot parse: ${ecl} (${parsed.errors.map((e) => e.message).join('; ')})`);
    }
    return this.expression(parsed.ast);
  }

  private page(codes: string[], count: number, offset: number): EvaluationResponse {
    const sorted = codes.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    const concepts = sorted.slice(offset, offset + count).map((code) => ({
      code,
      display: this.concepts.get(code)?.pt ?? '',
    }));
    return { total: sorted.length, concepts, truncated: sorted.length > offset + concepts.length };
  }

  private expression(node: ExpressionNode): Set<string> {
    const expr = node.expression;
    if (expr.type === NodeType.SubExpressionConstraint) return this.sub(expr);
    if (expr.type === NodeType.CompoundExpression) {
      const [first, ...rest] = expr.operands.map((o) => this.sub(o));
      const op = expr.operator.operator;
      return rest.reduce((acc, next) => {
        if (op === 'OR') return new Set([...acc, ...next]);
        if (op === 'AND') return new Set([...acc].filter((id) => next.has(id)));
        return new Set([...acc].filter((id) => !next.has(id)));
      }, first);
    }
    if (expr.type === NodeType.RefinedExpression) {
      const focus = this.sub(expr.expression);
      const constraints = this.conjuncts(expr.refinement);
      return new Set(
        [...focus].filter((id) =>
          constraints.every(
            ({ types, matches, min }) =>
              (this.concepts.get(id)?.relationships ?? []).filter((r) => types.has(r.type) && matches(r.value))
                .length >= min,
          ),
        ),
      );
    }
    // Dot notation: the values of each attribute in turn.
    let current = this.sub(expr.source);
    for (const dotted of expr.attributes) {
      const types = this.sub(dotted.attributeName);
      const next = new Set<string>();
      for (const id of current) {
        for (const r of this.concepts.get(id)?.relationships ?? []) if (types.has(r.type)) next.add(r.value);
      }
      current = new Set([...next].filter((id) => this.concepts.get(id)?.active));
    }
    return current;
  }

  /**
   * The attributes of a refinement that are all required (a conjunction without
   * groups): `a = expression`, `a = *`, concrete `a = #5` / `a >= #5` / `a <= #5`,
   * and a `[n..*]` cardinality.
   */
  private conjuncts(
    refinement: RefinementNode,
  ): { types: Set<string>; matches: (value: string) => boolean; min: number }[] {
    const walk = (member: RefinementMemberNode | null): void => {
      if (!member) return;
      if (member.type === NodeType.AttributeSet) {
        if (member.operator === 'OR') throw new Error('HierarchyMockService: OR in refinements unsupported');
        member.members.forEach(walk);
      } else if (member.type === NodeType.AttributeGroup) {
        throw new Error('HierarchyMockService: attribute groups unsupported');
      }
    };
    walk(refinement.content);
    return refinement.attributes.map((a) => {
      if (a.reversed) throw new Error('HierarchyMockService: reversed attributes unsupported');
      const types = a.name.conceptId ? new Set([a.name.conceptId]) : this.sub(a.name.expression!);
      const min = a.cardinality ? Number(/\[(\d+)\./.exec(a.cardinality)?.[1] ?? 1) : 1;
      const comparison = a.comparison ?? '=';
      if (a.value.rawValue !== undefined) {
        const target = Number(a.value.rawValue);
        const compare = {
          '=': (n: number) => n === target,
          '>=': (n: number) => n >= target,
          '<=': (n: number) => n <= target,
        };
        if (!(comparison in compare)) throw new Error(`HierarchyMockService: ${comparison} unsupported`);
        const test = compare[comparison as keyof typeof compare];
        return { types, min, matches: (v: string) => v.startsWith('#') && test(Number(v.slice(1))) };
      }
      if (comparison !== '=' || !a.value.expression) throw new Error('HierarchyMockService: unsupported comparison');
      if (a.value.expression.focus.type === NodeType.Wildcard && !a.value.expression.operator) {
        return { types, min, matches: () => true };
      }
      const values = this.sub(a.value.expression);
      return { types, min, matches: (v: string) => values.has(v) };
    });
  }

  private sub(node: SubExpressionNode): Set<string> {
    if (node.filters?.length || node.historySupplement) throw new Error('HierarchyMockService: filters unsupported');
    let focus: Set<string>;
    if (node.focus.type === NodeType.ConceptReference) {
      focus = new Set([node.focus.conceptId]);
    } else if (node.focus.type === NodeType.Wildcard) {
      focus = new Set(this.concepts.keys());
    } else if (node.focus.type === NodeType.ExpressionConstraint) {
      focus = this.expression(node.focus);
    } else {
      throw new Error('HierarchyMockService: alternate identifiers unsupported');
    }

    if (node.memberOf) {
      const members = new Set<string>();
      for (const r of focus) for (const m of this.refsets.get(r) ?? []) members.add(m);
      focus = members;
    }

    const result = new Set<string>();
    const op = node.operator?.operator;
    for (const id of focus) {
      if (!this.concepts.has(id)) continue;
      switch (op) {
        case undefined:
          result.add(id);
          break;
        case '<':
        case '<<':
          if (op === '<<') result.add(id);
          for (const d of this.descendants(id)) result.add(d);
          break;
        case '>':
        case '>>':
          if (op === '>>') result.add(id);
          for (const a of this.ancestors(id)) result.add(a);
          break;
        case '<!':
          for (const [c, info] of this.concepts) if (info.parents.includes(id)) result.add(c);
          break;
        case '>!':
          for (const p of this.concepts.get(id)?.parents ?? []) result.add(p);
          break;
        default:
          throw new Error(`HierarchyMockService: ${op} unsupported`);
      }
    }
    return new Set([...result].filter((id) => this.concepts.get(id)?.active));
  }

  private ancestors(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [...(this.concepts.get(id)?.parents ?? [])];
    while (stack.length > 0) {
      const p = stack.pop()!;
      if (out.has(p)) continue;
      out.add(p);
      stack.push(...(this.concepts.get(p)?.parents ?? []));
    }
    return out;
  }

  private descendants(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const [c, info] of this.concepts) {
        if (info.parents.includes(cur) && !out.has(c)) {
          out.add(c);
          stack.push(c);
        }
      }
    }
    return out;
  }
}
