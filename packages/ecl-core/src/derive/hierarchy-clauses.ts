// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Hierarchy clauses (`<< x`, `< x`, `x`) and the forms built from them
// (`includes MINUS exclusions`), evaluated against a loaded TaxonomyGraph
// rather than by asking the server.

import { byId, orGroup } from './set-queries';
import type { TaxonomyGraph } from './taxonomy-graph';

export interface HierarchyClause {
  conceptId: string;
  /** `=` is the concept alone, written without an operator. */
  operator: '<<' | '<' | '=';
}

export interface ClauseForm {
  includes: HierarchyClause[];
  exclusions: HierarchyClause[];
}

/** The concepts a clause selects. Complete only when the graph has the clause's descendants. */
export function selection(c: HierarchyClause, g: TaxonomyGraph): string[] {
  if (c.operator === '=') return [c.conceptId];
  const desc = g.descendants(c.conceptId);
  return c.operator === '<<' ? desc : desc.filter((d) => d !== c.conceptId);
}

/** True when the clause needs descendants the graph did not load. */
function unloaded(c: HierarchyClause, g: TaxonomyGraph): boolean {
  return c.operator !== '=' && !g.hasDescendants(c.conceptId) && g.children(c.conceptId).length > 0;
}

/** What the form selects, or null when a clause needs descendants the graph did not load. */
export function evaluate(form: ClauseForm, g: TaxonomyGraph): Set<string> | null {
  if ([...form.includes, ...form.exclusions].some((c) => unloaded(c, g))) return null;
  const selected = includedConcepts(form.includes, g);
  for (const c of form.exclusions) for (const x of selection(c, g)) selected.delete(x);
  return selected;
}

/** What the form adds to and misses of the members, and its clause count; null when it cannot be evaluated. */
export function localScore(
  form: ClauseForm,
  g: TaxonomyGraph,
): { additions: number; misses: number; clauses: number } | null {
  const selected = evaluate(form, g);
  if (!selected) return null;
  let additions = 0;
  for (const x of selected) if (!g.members.has(x)) additions++;
  let misses = 0;
  for (const m of g.members) if (!selected.has(m)) misses++;
  return { additions, misses, clauses: form.includes.length + form.exclusions.length };
}

/**
 * Drop clauses another clause already selects (`< x` with `= x` becomes
 * `<< x`), then clauses everything they select is selected by the others,
 * smallest first: `< y` is redundant when each of y's descendants falls under
 * another clause, though y does not.
 */
export function prune(includes: HierarchyClause[], g: TaxonomyGraph): HierarchyClause[] {
  const merged = mergeByConcept(includes);
  const selectedBelow = new Set<string>();
  for (const c of merged) {
    if (c.operator === '=') continue;
    for (const d of g.descendants(c.conceptId)) if (d !== c.conceptId) selectedBelow.add(d);
  }
  const kept = merged.filter((c) => !selectedBelow.has(c.conceptId));
  return withoutCovered(kept, g).sort((a, b) => byId(a.conceptId, b.conceptId));
}

/** `clauses` without those whose whole selection the others select, smallest first. */
function withoutCovered(clauses: HierarchyClause[], g: TaxonomyGraph): HierarchyClause[] {
  const selected = clauses.map((c) => ({ c, sel: selection(c, g) }));
  const times = new Map<string, number>();
  for (const { sel } of selected) for (const x of sel) times.set(x, (times.get(x) ?? 0) + 1);
  selected.sort((a, b) => a.sel.length - b.sel.length || byId(a.c.conceptId, b.c.conceptId));
  const kept: HierarchyClause[] = [];
  for (const { c, sel } of selected) {
    if (sel.every((x) => (times.get(x) ?? 0) > 1)) {
      for (const x of sel) times.set(x, (times.get(x) ?? 0) - 1);
    } else {
      kept.push(c);
    }
  }
  return kept;
}

function mergeByConcept(clauses: HierarchyClause[]): HierarchyClause[] {
  const byConcept = new Map<string, Set<HierarchyClause['operator']>>();
  for (const c of clauses) {
    const ops = byConcept.get(c.conceptId) ?? new Set();
    ops.add(c.operator);
    byConcept.set(c.conceptId, ops);
  }
  return [...byConcept].map(([conceptId, ops]) => {
    let operator: HierarchyClause['operator'] = ops.has('<') ? '<' : '=';
    if (ops.has('<<') || (ops.has('<') && ops.has('='))) operator = '<<';
    return { conceptId, operator };
  });
}

function includedConcepts(includes: HierarchyClause[], g: TaxonomyGraph): Set<string> {
  const included = new Set<string>();
  for (const c of includes) for (const x of selection(c, g)) included.add(x);
  return included;
}

/**
 * Exact exclusions for `includes`: what they select outside the set. A concept
 * with no member at or below it is outside `>> list`; the highest of them go
 * as `<< y`. A non-member above a member goes alone, as `= x`.
 */
export function exactExclusions(includes: HierarchyClause[], g: TaxonomyGraph): HierarchyClause[] {
  const included = includedConcepts(includes, g);
  const clean = (id: string) => included.has(id) && !g.aboveMember(id);
  const exclusions: HierarchyClause[] = [];
  for (const id of included) {
    if (g.members.has(id)) continue;
    if (!clean(id)) exclusions.push({ conceptId: id, operator: '=' });
    // A top of the member-free region: no parent inside it.
    else if (!g.parents(id).some(clean)) exclusions.push({ conceptId: id, operator: '<<' });
  }
  return exclusions.sort((a, b) => byId(a.conceptId, b.conceptId));
}

export function render(form: ClauseForm): string {
  const text = (c: HierarchyClause) => (c.operator === '=' ? c.conceptId : `${c.operator} ${c.conceptId}`);
  const inc = form.includes.map(text);
  if (form.exclusions.length === 0) return inc.join(' OR ');
  return `${orGroup(inc)} MINUS ${orGroup(form.exclusions.map(text))}`;
}
