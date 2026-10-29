// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// The IS-A subgraph around a set of codes, fetched in at most four requests
// (`$expand` with `property=parent`) so hierarchy questions are answered
// locally rather than by a request per concept:
//
//   the set                          the members
//   >> set                           the members' place in the hierarchy
//   <! (>> set)                      every one of those concepts' children
//   << (chosen concepts)             their descendants

import { byId, orGroup, SNOMED_ROOT, type MemberSet, type SetQueries } from './set-queries';

export interface TaxonomyGraph {
  readonly members: ReadonlySet<string>;
  /** True when the concept is a member or has a member below it (it is in `>> list`). */
  aboveMember(id: string): boolean;
  /** Direct children; complete for every concept in `>> list` and every concept below a loaded candidate. */
  children(id: string): string[];
  parents(id: string): string[];
  /** `id` and everything below it; complete only when `hasDescendants(id)`. */
  descendants(id: string): string[];
  hasDescendants(id: string): boolean;
  /** Members at or below `id`. */
  truePos(id: string): number;
  /** Members with no member ancestor, sorted byId. */
  roots(): string[];
  /** Concepts in `>> list` except the SNOMED root, sorted byId. */
  ancestors(): string[];
}

/** What was too large to fetch, or `'parents'` when the server does not return them. */
export interface GraphUnavailable {
  unavailable: string;
}

export interface TaxonomyGraphOptions {
  /** Most concepts in any subgraph fetched. */
  maxConcepts: number;
  /** Picks which concepts of `>> list` get their descendants loaded. Roots with children always do. */
  descend: (id: string, graph: Pick<TaxonomyGraph, 'truePos' | 'children' | 'members'>) => boolean;
}

export async function loadTaxonomyGraph(
  members: MemberSet,
  q: SetQueries,
  options: TaxonomyGraphOptions,
): Promise<TaxonomyGraph | GraphUnavailable> {
  const max = options.maxConcepts;
  const memberList = await q.codes({ include: [members.clause] }, max + 1);
  if (memberList.total > max) return { unavailable: 'the set' };
  const up = await q.graph({ include: [{ ecl: `>> ${members.ecl}` }] }, max);
  if (typeof up === 'string') return refused(up, 'the set with its ancestors');
  const childGraph = await q.graph({ include: [{ ecl: `<! (>> ${members.ecl})` }] }, max);
  if (typeof childGraph === 'string') return refused(childGraph, 'the children of those ancestors');

  const graph = new LoadedGraph(new Set(memberList.codes), up, childGraph);
  const roots = new Set(graph.roots());
  const load = graph
    .ancestors()
    .filter((id) => graph.children(id).length > 0 && (options.descend(id, graph) || roots.has(id)));
  if (load.length === 0) return graph;
  const down = await q.graph({ include: [{ ecl: `<< ${orGroup(load)}` }] }, max);
  if (typeof down === 'string') return refused(down, 'the descendants of the candidate groupers');
  graph.addBelow(down);
  return graph;
}

function refused(reason: 'too-large' | 'no-parents', what: string): GraphUnavailable {
  return { unavailable: reason === 'no-parents' ? 'parents' : what };
}

class LoadedGraph implements TaxonomyGraph {
  private readonly parentMap = new Map<string, string[]>();
  private childMap = new Map<string, string[]>();
  private readonly below = new Set<string>();
  private readonly cache = new Map<string, string[]>();
  private readonly counts = new Map<string, number>();
  private readonly rootIds: string[] = [];

  constructor(
    readonly members: ReadonlySet<string>,
    private readonly up: Map<string, string[]>,
    childGraph: Map<string, string[]>,
  ) {
    this.merge(up);
    this.merge(childGraph);
    this.childMap = childrenOf(this.parentMap);
    this.countMembers();
  }

  /** Add `<< candidates`, so their descendants are complete. */
  addBelow(down: Map<string, string[]>): void {
    this.merge(down);
    for (const id of down.keys()) this.below.add(id);
    this.childMap = childrenOf(this.parentMap);
    this.cache.clear();
  }

  private merge(graph: Map<string, string[]>): void {
    for (const [id, parents] of graph) {
      const known = this.parentMap.get(id) ?? [];
      for (const p of parents) if (!known.includes(p)) known.push(p);
      this.parentMap.set(id, known);
    }
  }

  private countMembers(): void {
    const nonRoots = new Set<string>();
    for (const m of this.members) {
      for (const a of reachable(m, this.up)) {
        this.counts.set(a, (this.counts.get(a) ?? 0) + 1);
        if (a !== m && this.members.has(a)) nonRoots.add(m);
      }
    }
    this.rootIds.push(...[...this.members].filter((m) => !nonRoots.has(m)).sort(byId));
  }

  aboveMember(id: string): boolean {
    return this.up.has(id);
  }

  children(id: string): string[] {
    return this.childMap.get(id) ?? [];
  }

  parents(id: string): string[] {
    return this.parentMap.get(id) ?? [];
  }

  descendants(id: string): string[] {
    let list = this.cache.get(id);
    if (!list) {
      list = [...reachable(id, this.childMap)];
      this.cache.set(id, list);
    }
    return list;
  }

  hasDescendants(id: string): boolean {
    return this.below.has(id) || (this.up.has(id) && this.children(id).length === 0);
  }

  truePos(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  roots(): string[] {
    return this.rootIds;
  }

  ancestors(): string[] {
    return [...this.up.keys()].filter((id) => id !== SNOMED_ROOT).sort(byId);
  }
}

function childrenOf(graph: Map<string, string[]>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const [child, parents] of graph) {
    for (const p of parents) {
      const list = children.get(p) ?? [];
      list.push(child);
      children.set(p, list);
    }
  }
  return children;
}

/** `start` and everything reachable from it along `edges`. */
function reachable(start: string, edges: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    for (const x of edges.get(next) ?? []) {
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(x);
    }
  }
  return seen;
}
