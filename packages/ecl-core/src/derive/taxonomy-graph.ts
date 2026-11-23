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
  /** The active members as already looked up, with parents and children, so they are not looked up again. */
  seed?: Walk;
  /**
   * Queries for `loadBelow` once the graph is built. Its caller falls back to
   * server counts when it fails, so derive passes queries whose failures are
   * not counted (see `uncounted`). Default: the graph's own.
   */
  belowQueries?: SetQueries;
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
  const ids = new Ids();
  const graph = new LoadedGraph(
    new Set(memberList.codes),
    numbered(ids, around.up),
    numbered(ids, around.childGraph),
    ids,
  );
  const loaded = await withDescendants(graph, options, async (load) => {
    if (load.length === 0) return new Map();
    const below = await q.graph({ include: [{ ecl: `<< ${orGroup(load)}` }] }, max);
    return typeof below === 'string' ? below : numbered(ids, below);
  });
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

/** Concepts' parents, by number. */
type Edges = Map<number, number[]>;

type Below = Edges | 'too-large' | 'no-parents' | null;

function numbered(ids: Ids, graph: Map<string, string[]>): Edges {
  const out: Edges = new Map();
  for (const [id, parents] of graph)
    out.set(
      ids.at(id),
      parents.map((p) => ids.at(p)),
    );
  return out;
}

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

/** Concept ids, each numbered once, shared by a walk and the graph built from it. */
class Ids {
  readonly list: string[] = [];
  private readonly index = new Map<string, number>();

  get(id: string): number | undefined {
    return this.index.get(id);
  }

  /** The number of `id`, given one if it has none. */
  at(id: string): number {
    let i = this.index.get(id);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(id);
      this.index.set(id, i);
    }
    return i;
  }
}

/** A looked-up concept, with its parents and children by number. */
export interface Node {
  parents: number[];
  children: number[];
  display: string;
}

/**
 * Concepts looked up with their parents and children, by number. Resolving a
 * list can start one, converting each chunk as it arrives, so the server's
 * answers are not all held at once (see {@link TaxonomyGraphOptions.seed}).
 */
export class Walk {
  readonly ids = new Ids();
  readonly nodes = new Map<number, Node>();

  /** The nodes for `concepts`, not yet added; null when one came back without the parents or children asked for. */
  nodesFor(concepts: EvaluationConcept[]): [number, Node][] | null {
    const at = (id: string) => this.ids.at(id);
    const out: [number, Node][] = [];
    for (const c of concepts) {
      if (!c.children || (!c.parents && c.code !== SNOMED_ROOT)) return null;
      out.push([at(c.code), { parents: (c.parents ?? []).map(at), children: c.children.map(at), display: c.display }]);
    }
    return out;
  }

  add(nodes: [number, Node][]): void {
    for (const [i, n] of nodes) this.nodes.set(i, n);
  }

  /** True when every one of `codes` has been looked up. */
  has(codes: Iterable<string>): boolean {
    for (const c of codes) {
      const i = this.ids.get(c);
      if (i === undefined || !this.nodes.has(i)) return false;
    }
    return true;
  }
}

/** Record looked-up concepts; false when one came back without the parents or children asked for. */
function record(walk: Walk, concepts: EvaluationConcept[]): boolean {
  const nodes = walk.nodesFor(concepts);
  if (nodes) walk.add(nodes);
  return nodes !== null;
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
  const members = new Set(memberCodes);
  const seeded = options.seed?.has(members) ? options.seed : undefined;
  const walk = seeded ?? new Walk();
  if (!seeded && !record(walk, await q.lookup(memberCodes, { parents: true, children: true }))) return null;
  const climbed = await walkUp(memberCodes, walk, q, max);
  if (climbed !== 'done') return climbed;

  const { ids, nodes } = walk;
  const up: Edges = new Map();
  const childGraph: Edges = new Map();
  for (const [i, n] of nodes) {
    up.set(i, n.parents);
    for (const c of n.children) {
      if (nodes.has(c)) continue;
      const parents = childGraph.get(c);
      if (parents) parents.push(i);
      else childGraph.set(c, [i]);
    }
  }
  const graph = new LoadedGraph(members, up, childGraph, ids);
  const loaded = await withDescendants(graph, options, (load) => walkDown(load, walk, q, max));
  if (!loaded || 'unavailable' in loaded) return loaded;
  graph.loadBelow = async (load: string[]) => {
    const more = await walkDown(load, walk, options.belowQueries ?? q, max);
    if (more === 'too-large' || more === null) return false;
    graph.addBelow(more);
    return true;
  };
  graph.term = (id: string) => {
    const i = ids.get(id);
    return i === undefined ? undefined : nodes.get(i)?.display;
  };
  return graph;
}

/**
 * Add the ancestors of `start` to the walk, a level at a time: `'done'`, a
 * refusal when they are too many, or null when the server ignored
 * `property=child` (then no parent lists its child).
 */
async function walkUp(
  start: string[],
  walk: Walk,
  q: SetQueries,
  max: number,
): Promise<'done' | GraphUnavailable | null> {
  const { ids, nodes } = walk;
  let frontier = newParents(
    start.map((c) => ids.at(c)),
    nodes,
  );
  while (frontier.length > 0) {
    if (nodes.size + frontier.length > max) return { unavailable: 'the set with its ancestors' };
    const found = await q.lookup(
      frontier.map((i) => ids.list[i]),
      { parents: true, children: true },
    );
    if (!record(walk, found)) return null;
    frontier = newParents(
      found.map((c) => ids.at(c.code)),
      nodes,
    );
  }
  for (const [i, n] of nodes) {
    if (n.parents.some((p) => !nodes.get(p)?.children.includes(i))) return null;
  }
  return 'done';
}

function newParents(codes: number[], nodes: Map<number, Node>): number[] {
  const out = new Set<number>();
  for (const c of codes) for (const p of nodes.get(c)?.parents ?? []) if (!nodes.has(p)) out.add(p);
  return [...out];
}

/**
 * `<< load` with each concept's parents, walked down level by level. Concepts
 * already in the walk are not looked up, and those looked up are added to it,
 * so a later walk does not look them up again.
 */
async function walkDown(load: string[], walk: Walk, q: SetQueries, max: number): Promise<Edges | 'too-large' | null> {
  const { ids, nodes } = walk;
  const result: Edges = new Map();
  let level = [...new Set(load.map((c) => ids.at(c)))];
  while (level.length > 0) {
    const missing = level.filter((c) => !nodes.has(c));
    if (
      missing.length > 0 &&
      !record(
        walk,
        await q.lookup(
          missing.map((i) => ids.list[i]),
          { parents: true, children: true },
        ),
      )
    )
      return null;
    level = descendOneLevel(level, nodes, result);
    if (result.size + level.length > max) return 'too-large';
  }
  return result;
}

/** Record `level` in `result` and return its children not yet there. */
function descendOneLevel(level: number[], nodes: Map<number, Node>, result: Edges): number[] {
  const next = new Set<number>();
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

/**
 * The graph, with each concept numbered once and its parents and children held
 * as lists of numbers, so a graph of a few hundred thousand concepts keeps one
 * copy of each edge in each direction (it held four, with strings, before).
 */
class LoadedGraph implements TaxonomyGraph {
  partial = false;
  loadBelow?: (ids: string[]) => Promise<boolean>;
  term?: (id: string) => string | undefined;
  /** Parents by number; a list may be the caller's (see SHARED) until the graph adds to it. */
  private readonly parentIdx: (number[] | undefined)[] = [];
  /** Children, in the order each child was first given parents (as `childrenOf` built them). */
  private readonly childIdx: (number[] | undefined)[] = [];
  /** When each concept was first given parents; -1 for a concept only seen as a parent. */
  private rank = new Int32Array(1024).fill(-1);
  private nextRank = 0;
  /** How many of a concept's parents came from `up`, which come first. */
  private upLength = new Int32Array(1024);
  /** Bits: IN_UP, BELOW and SHARED (below the class). */
  private flags = new Uint8Array(1024);
  private counts = new Int32Array(1024);
  private readonly cache = new Map<number, Int32Array>();
  private readonly rootIds: string[] = [];

  constructor(
    readonly members: ReadonlySet<string>,
    up: Edges,
    childGraph: Edges,
    private readonly ids: Ids,
  ) {
    this.merge(up);
    for (const i of up.keys()) {
      this.flags[i] |= IN_UP;
      this.upLength[i] = this.parentIdx[i]?.length ?? 0;
    }
    this.merge(childGraph);
    this.countMembers();
  }

  /** Add `<< candidates`, so their descendants are complete. */
  addBelow(down: Edges): void {
    this.merge(down);
    for (const i of down.keys()) this.flags[i] |= BELOW;
    this.cache.clear();
  }

  /** The number of `id`, given one if it has none, with room for it here. */
  private at(id: string): number {
    const i = this.ids.at(id);
    this.room(i);
    return i;
  }

  /** Room for concept `i`, and for every concept numbered before it. */
  private room(i: number): void {
    while (this.parentIdx.length <= i) {
      this.parentIdx.push(undefined);
      this.childIdx.push(undefined);
    }
    while (i >= this.rank.length) this.grow();
  }

  /** The number of `id` when the graph has it. */
  private known(id: string): number | undefined {
    const i = this.ids.get(id);
    return i !== undefined && i < this.parentIdx.length ? i : undefined;
  }

  private grow(): void {
    const size = this.rank.length * 2;
    const rank = new Int32Array(size).fill(-1);
    rank.set(this.rank);
    this.rank = rank;
    this.upLength = withSize(this.upLength, size);
    this.counts = withSize(this.counts, size);
    const flags = new Uint8Array(size);
    flags.set(this.flags);
    this.flags = flags;
  }

  private merge(graph: Edges): void {
    for (const [i, parents] of graph) {
      this.room(i);
      for (const p of parents) this.room(p);
      if (this.rank[i] < 0) this.rank[i] = this.nextRank++;
      if (!this.parentIdx[i] && new Set(parents).size === parents.length) {
        // Take the caller's list as it is (no copy), and copy it before adding to it.
        this.parentIdx[i] = parents;
        this.flags[i] |= SHARED;
        for (const p of parents) this.addChild(p, i);
      } else {
        for (const p of parents) this.addParent(i, p);
      }
    }
  }

  private addParent(i: number, p: number): void {
    let known = this.parentIdx[i];
    if (known?.includes(p)) return;
    if (!known || (this.flags[i] & SHARED) !== 0) {
      known = known ? [...known] : [];
      this.parentIdx[i] = known;
      this.flags[i] &= ~SHARED;
    }
    known.push(p);
    this.addChild(p, i);
  }

  /** Put `child` among `parent`'s children, keeping them in rank order. */
  private addChild(parent: number, child: number): void {
    const list = this.childIdx[parent];
    if (!list) {
      this.childIdx[parent] = [child];
      return;
    }
    const r = this.rank[child];
    let at = list.length;
    while (at > 0 && this.rank[list[at - 1]] > r) at--;
    if (at === list.length) list.push(child);
    else list.splice(at, 0, child);
  }

  private countMembers(): void {
    const nonRoots = new Set<string>();
    for (const m of this.members) this.at(m);
    const seen = new Uint8Array(this.parentIdx.length);
    const touched: number[] = [];
    for (const m of this.members) {
      const start = this.at(m);
      this.upFrom(start, seen, touched);
      for (const a of touched) {
        this.counts[a]++;
        seen[a] = 0;
        if (a !== start && this.members.has(this.ids.list[a])) nonRoots.add(m);
      }
      touched.length = 0;
    }
    this.rootIds.push(...[...this.members].filter((m) => !nonRoots.has(m)).sort(byId));
  }

  /** `start` and everything reachable from it along `up`'s parents, into `touched`, marked in `seen`. */
  private upFrom(start: number, seen: Uint8Array, touched: number[]): void {
    seen[start] = 1;
    touched.push(start);
    // `touched` grows as it is read: a breadth-first walk.
    for (const next of touched) {
      const parents = this.parentIdx[next] ?? [];
      const fromUp = this.upLength[next];
      for (const p of fromUp === parents.length ? parents : parents.slice(0, fromUp)) {
        if (seen[p]) continue;
        seen[p] = 1;
        touched.push(p);
      }
    }
  }

  private names(list: readonly number[] | Int32Array | undefined): string[] {
    const out: string[] = [];
    if (list) for (const i of list) out.push(this.ids.list[i]);
    return out;
  }

  aboveMember(id: string): boolean {
    const i = this.known(id);
    return i !== undefined && (this.flags[i] & IN_UP) !== 0;
  }

  children(id: string): string[] {
    const i = this.known(id);
    return i === undefined ? [] : this.names(this.childIdx[i]);
  }

  parents(id: string): string[] {
    const i = this.known(id);
    return i === undefined ? [] : this.names(this.parentIdx[i]);
  }

  descendants(id: string): string[] {
    const i = this.known(id);
    if (i === undefined) return [id];
    let list = this.cache.get(i);
    if (!list) {
      list = this.reachableDown(i);
      // Short lists are cheap to walk again; caching every one held tens of MB on a large set.
      if (list.length >= CACHED_DESCENDANTS) this.cache.set(i, list);
    }
    return this.names(list);
  }

  /** `start` and everything below it, in the order a depth-first walk first meets them. */
  private reachableDown(start: number): Int32Array {
    const seen = new Set<number>([start]);
    const stack = [start];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      for (const x of this.childIdx[next] ?? []) {
        if (seen.has(x)) continue;
        seen.add(x);
        stack.push(x);
      }
    }
    return Int32Array.from(seen);
  }

  hasDescendants(id: string): boolean {
    const i = this.known(id);
    if (i === undefined) return false;
    return (this.flags[i] & BELOW) !== 0 || ((this.flags[i] & IN_UP) !== 0 && !this.childIdx[i]?.length);
  }

  truePos(id: string): number {
    const i = this.known(id);
    return i === undefined ? 0 : this.counts[i];
  }

  membersBelow(id: string): string[] {
    // Every concept between a member and its ancestor `id` is in `>> list`, whose children are complete.
    const start = this.known(id);
    if (start === undefined) return this.members.has(id) ? [id] : [];
    const found: string[] = [];
    const seen = new Set<number>([start]);
    const stack = [start];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (this.members.has(this.ids.list[next])) found.push(this.ids.list[next]);
      for (const c of this.childIdx[next] ?? []) {
        if (seen.has(c) || (this.flags[c] & IN_UP) === 0) continue;
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
    return this.ids.list
      .filter((id, i) => i < this.parentIdx.length && (this.flags[i] & IN_UP) !== 0 && id !== SNOMED_ROOT)
      .sort(byId);
  }
}

/** The fewest descendants worth caching. */
const CACHED_DESCENDANTS = 64;
const IN_UP = 1;
const BELOW = 2;
/** The concept's parent list is the caller's, so it is copied before the graph adds to it. */
const SHARED = 4;

function withSize(a: Int32Array<ArrayBuffer>, size: number): Int32Array<ArrayBuffer> {
  const out = new Int32Array(size);
  out.set(a);
  return out;
}
