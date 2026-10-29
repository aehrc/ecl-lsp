// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Hierarchy covers priced in clauses, computed on a loaded TaxonomyGraph.
//
// costCover is a weighted set cover: a grouper costs its own clause plus the
// exclusions that make it exact, and listing a member costs one clause. It
// takes groupers while one covers more members per clause than listing them
// would, lists the rest, then makes the whole form exact.

import { exactExclusions, prune, type ClauseForm, type HierarchyClause } from './hierarchy-clauses';
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

/**
 * Exact cover, a greedy approximation of the fewest clauses (includes plus
 * exclusions). Lazy greedy: a grouper's count of members not yet covered only
 * falls, so the count it was queued with bounds its current one, and a
 * grouper whose count is still current when it comes first is the best.
 */
export function costCover(g: TaxonomyGraph, candidates: string[]): ClauseForm {
  const groupers = usable(g, candidates).map((c) => grouper(c, g));
  const remaining = new Set(g.members);
  const fresh = groupers.map((gr) => gr.covers.length);
  const heap = new Heap<Queued>(ahead);
  groupers.forEach((gr, i) => {
    if (fresh[i] > gr.price) heap.push({ gr, i, fresh: fresh[i] });
  });
  const index = coveredBy(groupers);
  const chosen: HierarchyClause[] = [];
  for (let top = heap.pop(); top; top = heap.pop()) {
    if (top.fresh !== fresh[top.i]) {
      // Stale: requeue with the current count, while it still beats listing.
      if (fresh[top.i] > top.gr.price) heap.push({ ...top, fresh: fresh[top.i] });
      continue;
    }
    chosen.push(top.gr.clause);
    for (const m of top.gr.covers) {
      if (!remaining.delete(m)) continue;
      for (const j of index.get(m) ?? []) fresh[j]--;
    }
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

/**
 * The best `k` single clauses by clauses + additions + misses (lossy allowed),
 * each counted from the graph: `<< a` or `< a` selects the members at or below
 * a (a is in it only when it is a member) and adds the rest of what it selects.
 */
export function bestSingles(g: TaxonomyGraph, candidates: string[], k: number): ClauseForm[] {
  const scored = usable(g, candidates).map((c) => {
    const clause = clauseFor(c, g);
    const selected = g.descendants(c).length - (clause.operator === '<' ? 1 : 0);
    const covered = g.truePos(c);
    const cost = 1 + (selected - covered) + (g.members.size - covered);
    return { form: { includes: [clause], exclusions: [] }, cost };
  });
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

/** Each member's groupers, by index. */
function coveredBy(groupers: Grouper[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  groupers.forEach((gr, i) => {
    for (const m of gr.covers) {
      const list = index.get(m) ?? [];
      list.push(i);
      index.set(m, list);
    }
  });
  return index;
}

/** A grouper queued with its count of members not yet covered when queued. */
interface Queued {
  gr: Grouper;
  i: number;
  fresh: number;
}

/**
 * True when `a` comes before `b`: more members per clause, then more members,
 * then the lower id.
 */
function ahead(a: Queued, b: Queued): boolean {
  // Compare fresh / price without division: a / p vs b / q as a·q vs b·p.
  const lhs = a.fresh * b.gr.price;
  const rhs = b.fresh * a.gr.price;
  if (lhs !== rhs) return lhs > rhs;
  if (a.fresh !== b.fresh) return a.fresh > b.fresh;
  return byId(a.gr.clause.conceptId, b.gr.clause.conceptId) < 0;
}

/** A binary heap: `pop` returns the item `before` puts ahead of all others. */
class Heap<T> {
  private readonly items: T[] = [];

  constructor(private readonly before: (a: T, b: T) => boolean) {}

  push(item: T): void {
    const xs = this.items;
    xs.push(item);
    for (let i = xs.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (!this.before(xs[i], xs[parent])) break;
      [xs[i], xs[parent]] = [xs[parent], xs[i]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const xs = this.items;
    const top = xs[0];
    const last = xs.pop();
    if (xs.length > 0 && last !== undefined) {
      xs[0] = last;
      this.siftDown();
    }
    return top;
  }

  private siftDown(): void {
    const xs = this.items;
    for (let i = 0; ;) {
      let first = i;
      for (const child of [2 * i + 1, 2 * i + 2]) {
        if (child < xs.length && this.before(xs[child], xs[first])) first = child;
      }
      if (first === i) return;
      [xs[i], xs[first]] = [xs[first], xs[i]];
      i = first;
    }
  }
}
