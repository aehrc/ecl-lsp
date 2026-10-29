// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Hierarchy covers priced in clauses, computed on a loaded TaxonomyGraph.
//
// costCover is a weighted set cover: a grouper costs its own clause plus the
// exclusions that make it exact, and listing a member costs one clause. It
// takes groupers while one covers more members per clause than listing them
// would, lists the rest, then makes the whole form exact.

import { exactExclusions, localScore, prune, type ClauseForm, type HierarchyClause } from './hierarchy-clauses';
import { byId } from './set-queries';
import type { TaxonomyGraph } from './taxonomy-graph';

/** Non-member children allowed per member child for a concept to be worth loading as a grouper. */
const NON_MEMBER_CHILDREN_PER_MEMBER = 4;
const MINIMUM_CLUSTER_SIZE = 2;

/** Roots as `<< r`, with exact exclusions: today's hierarchy cover, computed locally. */
export function rootsCover(g: TaxonomyGraph): ClauseForm {
  const includes: HierarchyClause[] = g.roots().map((conceptId) => ({ conceptId, operator: '<<' }));
  return { includes, exclusions: exactExclusions(includes, g) };
}

interface Grouper {
  clause: HierarchyClause;
  /** The members the clause selects. */
  covers: string[];
  /** The clause plus its exact exclusions. */
  price: number;
}

/** Exact cover, a greedy approximation of the fewest clauses (includes plus exclusions). */
export function costCover(g: TaxonomyGraph, candidates: string[]): ClauseForm {
  const groupers = usable(g, candidates).map((c) => grouper(c, g));
  const remaining = new Set(g.members);
  const chosen: HierarchyClause[] = [];
  for (let best = pick(groupers, remaining); best; best = pick(groupers, remaining)) {
    chosen.push(best.clause);
    for (const m of best.covers) remaining.delete(m);
  }
  for (const m of [...remaining].sort(byId)) chosen.push(listed(m, g));
  const includes = prune(chosen, g);
  return { includes, exclusions: exactExclusions(includes, g) };
}

/** `coverDescend`: which ancestors costCover considers (passed to loadTaxonomyGraph). */
export function coverDescend(id: string, g: Pick<TaxonomyGraph, 'truePos' | 'children' | 'members'>): boolean {
  if (g.truePos(id) < MINIMUM_CLUSTER_SIZE) return false;
  const kids = g.children(id);
  const trueChildren = kids.filter((k) => g.members.has(k)).length;
  return kids.length - trueChildren <= NON_MEMBER_CHILDREN_PER_MEMBER * trueChildren;
}

/** The best `k` single clauses by clauses + additions + misses (lossy allowed). */
export function bestSingles(g: TaxonomyGraph, candidates: string[], k: number): ClauseForm[] {
  const scored: { form: ClauseForm; cost: number }[] = [];
  for (const c of usable(g, candidates)) {
    const form: ClauseForm = { includes: [clauseFor(c, g)], exclusions: [] };
    const s = localScore(form, g);
    if (s) scored.push({ form, cost: s.clauses + s.additions + s.misses });
  }
  scored.sort((a, b) => a.cost - b.cost || byId(a.form.includes[0].conceptId, b.form.includes[0].conceptId));
  return scored.slice(0, k).map((s) => s.form);
}

/** Candidates with their descendants loaded and at least two members at or below them, deduplicated. */
function usable(g: TaxonomyGraph, candidates: string[]): string[] {
  return [...new Set(candidates)].filter((c) => g.hasDescendants(c) && g.truePos(c) >= MINIMUM_CLUSTER_SIZE).sort(byId);
}

/** `<< a` for a member, `< a` otherwise. */
function clauseFor(id: string, g: TaxonomyGraph): HierarchyClause {
  return { conceptId: id, operator: g.members.has(id) ? '<<' : '<' };
}

function grouper(id: string, g: TaxonomyGraph): Grouper {
  const clause = clauseFor(id, g);
  const covers = g.descendants(id).filter((d) => g.members.has(d) && (clause.operator === '<<' || d !== id));
  return { clause, covers, price: 1 + exactExclusions([clause], g).length };
}

/** A listed member: `<< m` when childless, else `= m`. */
function listed(m: string, g: TaxonomyGraph): HierarchyClause {
  return { conceptId: m, operator: g.children(m).length === 0 ? '<<' : '=' };
}

/**
 * The grouper covering the most remaining members per clause, if that beats
 * listing them (one clause each). Ties go to more newly covered, then the lower id.
 */
function pick(groupers: Grouper[], remaining: ReadonlySet<string>): Grouper | null {
  let best: Grouper | null = null;
  let bestNew = 0;
  for (const gr of groupers) {
    const fresh = gr.covers.filter((m) => remaining.has(m)).length;
    if (fresh / gr.price <= 1) continue;
    if (!best || better(fresh, gr, bestNew, best)) {
      best = gr;
      bestNew = fresh;
    }
  }
  return best;
}

function better(fresh: number, gr: Grouper, bestNew: number, best: Grouper): boolean {
  // Compare fresh / price without division: a / p vs b / q as a·q vs b·p.
  const lhs = fresh * best.price;
  const rhs = bestNew * gr.price;
  if (lhs !== rhs) return lhs > rhs;
  if (fresh !== bestNew) return fresh > bestNew;
  return byId(gr.clause.conceptId, best.clause.conceptId) < 0;
}
