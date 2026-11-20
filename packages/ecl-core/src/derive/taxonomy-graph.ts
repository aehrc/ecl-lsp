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

import type { EvaluationConcept } from '../terminology/types';
import { byId, orGroup, SNOMED_ROOT, type MemberSet, type SetQueries } from './set-queries';

export interface TaxonomyGraph {
  readonly members: ReadonlySet<string>;
  /** True when only the `fallbackDescend` descendants were loaded (the others were too many). */
  readonly partial: boolean;
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
  /** The members at or below `id`, sorted byId; complete, since every member's ancestors are loaded. */
  membersBelow(id: string): string[];
  /** Members with no member ancestor, sorted byId. */
  roots(): string[];
  /** Concepts in `>> list` except the SNOMED root, sorted byId. */
  ancestors(): string[];
  /**
   * Walked graphs only: load the descendants of `ids` by walking
   * down, looking up only concepts not yet seen. False when they are too many
   * or the server cannot say; the graph is then unchanged.
   */
  loadBelow?(ids: string[]): Promise<boolean>;
  /** Walked graphs only: a concept's term, when a lookup returned it. */
  term?(id: string): string | undefined;
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
  /**
   * When the descendants `descend` picks (with the roots) are more than
   * `maxConcepts`, load only those this picks, without the roots, and mark the
   * graph partial. Default: none, the graph is unavailable.
   */
  fallbackDescend?: TaxonomyGraphOptions['descend'];
  /** The set's active codes when already known, so they are not fetched again. */
  memberCodes?: string[];
  /**
   * Build the graph by walking: look the members up with their
   * parents and children, then each new level of ancestors, in chunks, and
   * below the picked groupers the same way, level by level. No query carries
   * the set as ECL. Needs a server that returns `property=child`; without it
   * the ECL queries are used.
   */
  walk?: boolean;
  /** The members as already looked up, with parents and children, so they are not looked up again. */
  memberConcepts?: EvaluationConcept[];
}

export async function loadTaxonomyGraph(
  members: MemberSet,
  q: SetQueries,
  options: TaxonomyGraphOptions,
): Promise<TaxonomyGraph | GraphUnavailable> {
  const max = options.maxConcepts;
  const memberList = options.memberCodes
    ? { codes: options.memberCodes, total: options.memberCodes.length }
    : await q.codes({ include: [members.clause] }, max + 1);
  if (memberList.total > max) return { unavailable: 'the set' };
  if (options.walk) {
    const walked = await walkedGraph(memberList.codes, q, options);
    if (walked) return walked;
  }
  const around = await eclSubgraph(members, q, options);
  if ('unavailable' in around) return around;
  const graph = new LoadedGraph(new Set(memberList.codes), around.up, around.childGraph);
  const loaded = await withDescendants(graph, options, async (load) =>
    load.length === 0 ? new Map() : q.graph({ include: [{ ecl: `<< ${orGroup(load)}` }] }, max),
  );
  return loaded ?? { unavailable: 'the descendants of the candidate groupers' };
}

/** `>> set` with each concept's parents, and the children of those concepts, by ECL queries that carry the set. */
async function eclSubgraph(
  members: MemberSet,
  q: SetQueries,
  options: TaxonomyGraphOptions,
): Promise<{ up: Map<string, string[]>; childGraph: Map<string, string[]> } | GraphUnavailable> {
  const max = options.maxConcepts;
  const up = await q.graph({ include: [{ ecl: `>> ${members.ecl}` }] }, max);
  if (typeof up === 'string') return refused(up, 'the set with its ancestors');
  const childGraph = await q.graph({ include: [{ ecl: `<! (>> ${members.ecl})` }] }, max);
  if (typeof childGraph === 'string') return refused(childGraph, 'the children of those ancestors');
  return { up, childGraph };
}

type Below = Map<string, string[]> | 'too-large' | 'no-parents' | null;

/**
 * The graph with the descendants loaded of the concepts `descend` picks (and
 * the roots), or of those `fallbackDescend` picks when those are too many
 * (the graph is then partial); a refusal when even those are too many, and
 * null when `fetch` cannot say.
 */
async function withDescendants(
  graph: LoadedGraph,
  options: TaxonomyGraphOptions,
  fetch: (load: string[]) => Promise<Below>,
): Promise<LoadedGraph | GraphUnavailable | null> {
  const roots = new Set(graph.roots());
  const loadFor = (pick: (id: string) => boolean) =>
    graph.ancestors().filter((id) => graph.children(id).length > 0 && pick(id));
  let down = await fetch(loadFor((id) => options.descend(id, graph) || roots.has(id)));
  if (down === 'too-large' && options.fallbackDescend) {
    const fallback = options.fallbackDescend;
    down = await fetch(loadFor((id) => fallback(id, graph)));
    graph.partial = true;
  }
  if (down === null) return null;
  if (typeof down === 'string') return refused(down, 'the descendants of the candidate groupers');
  graph.addBelow(down);
  return graph;
}

interface Node {
  parents: string[];
  children: string[];
  display: string;
}

/** Record looked-up concepts; false when one came back without the parents or children asked for. */
function record(nodes: Map<string, Node>, concepts: EvaluationConcept[]): boolean {
  for (const c of concepts) {
    if (!c.children || (!c.parents && c.code !== SNOMED_ROOT)) return false;
    nodes.set(c.code, { parents: c.parents ?? [], children: c.children, display: c.display });
  }
  return true;
}

/**
 * The graph built by walking (see {@link TaxonomyGraphOptions.walk}), or null
 * when the server does not return children, or a refusal when it is too large.
 */
async function walkedGraph(
  memberCodes: string[],
  q: SetQueries,
  options: TaxonomyGraphOptions,
): Promise<TaxonomyGraph | GraphUnavailable | null> {
  const max = options.maxConcepts;
  const nodes = new Map<string, Node>();
  const members = new Set(memberCodes);
  const given = options.memberConcepts?.filter((c) => c.children && !c.inactive);
  const memberConcepts =
    given?.length === members.size ? given : await q.lookup(memberCodes, { parents: true, children: true });
  if (!record(nodes, memberConcepts)) return null;
  const climbed = await walkUp(memberCodes, nodes, q, max);
  if (climbed !== 'done') return climbed;

  const up = new Map<string, string[]>();
  const childGraph = new Map<string, string[]>();
  for (const [code, n] of nodes) {
    up.set(code, n.parents);
    for (const c of n.children) if (!nodes.has(c)) childGraph.set(c, [...(childGraph.get(c) ?? []), code]);
  }
  const graph = new LoadedGraph(members, up, childGraph);
  const loaded = await withDescendants(graph, options, (load) => walkDown(load, nodes, q, max));
  if (!loaded || 'unavailable' in loaded) return loaded;
  graph.loadBelow = async (ids: string[]) => {
    const more = await walkDown(ids, nodes, q, max);
    if (more === 'too-large' || more === null) return false;
    graph.addBelow(more);
    return true;
  };
  graph.term = (id: string) => nodes.get(id)?.display;
  return graph;
}

/**
 * Add the ancestors of `start` to `nodes`, a level at a time: `'done'`, a
 * refusal when they are too many, or null when the server ignored
 * `property=child` (then no parent lists its child).
 */
async function walkUp(
  start: string[],
  nodes: Map<string, Node>,
  q: SetQueries,
  max: number,
): Promise<'done' | GraphUnavailable | null> {
  let frontier = newParents(start, nodes);
  while (frontier.length > 0) {
    if (nodes.size + frontier.length > max) return { unavailable: 'the set with its ancestors' };
    const found = await q.lookup(frontier, { parents: true, children: true });
    if (!record(nodes, found)) return null;
    frontier = newParents(
      found.map((c) => c.code),
      nodes,
    );
  }
  for (const [code, n] of nodes) {
    if (n.parents.some((p) => !nodes.get(p)?.children.includes(code))) return null;
  }
  return 'done';
}

function newParents(codes: string[], nodes: Map<string, Node>): string[] {
  const out = new Set<string>();
  for (const c of codes) for (const p of nodes.get(c)?.parents ?? []) if (!nodes.has(p)) out.add(p);
  return [...out];
}

/**
 * `<< load` with each concept's parents, walked down level by level. Concepts
 * already in `nodes` are not looked up, and those looked up are added to it,
 * so a later walk does not look them up again.
 */
async function walkDown(
  load: string[],
  nodes: Map<string, Node>,
  q: SetQueries,
  max: number,
): Promise<Map<string, string[]> | 'too-large' | null> {
  const result = new Map<string, string[]>();
  let level = [...new Set(load)];
  while (level.length > 0) {
    const missing = level.filter((c) => !nodes.has(c));
    if (missing.length > 0 && !record(nodes, await q.lookup(missing, { parents: true, children: true }))) return null;
    level = descendOneLevel(level, nodes, result);
    if (result.size + level.length > max) return 'too-large';
  }
  return result;
}

/** Record `level` in `result` and return its children not yet there. */
function descendOneLevel(level: string[], nodes: Map<string, Node>, result: Map<string, string[]>): string[] {
  const next = new Set<string>();
  for (const c of level) {
    const n = nodes.get(c);
    if (!n) continue;
    result.set(c, n.parents);
    for (const child of n.children) if (!result.has(child)) next.add(child);
  }
  return [...next];
}

function refused(reason: 'too-large' | 'no-parents', what: string): GraphUnavailable {
  return { unavailable: reason === 'no-parents' ? 'parents' : what };
}

class LoadedGraph implements TaxonomyGraph {
  partial = false;
  loadBelow?: (ids: string[]) => Promise<boolean>;
  term?: (id: string) => string | undefined;
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

  membersBelow(id: string): string[] {
    // Every concept between a member and its ancestor `id` is in `>> list`, whose children are complete.
    const found: string[] = [];
    const seen = new Set<string>([id]);
    const stack = [id];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (this.members.has(next)) found.push(next);
      for (const c of this.children(next)) {
        if (seen.has(c) || !this.up.has(c)) continue;
        seen.add(c);
        stack.push(c);
      }
    }
    return found.sort(byId);
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
