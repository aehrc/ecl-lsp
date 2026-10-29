// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Greedy grouping in the style of REFACTOR, the algorithm in NHS England's
// DMWB (Jeremy Rogers, after Ed Cheetham), as described in its slides
// "Greedy Grouping the JERO way" (2021) and the DMWB flowchart (2022).
// Lossless strategy only, without frequency weighting or sticky clauses.
//
// REFACTOR scores every ancestor of the list from five counts: ALL (its
// descendants), TRUEPOS (those in the list), TRUENEG, ALLCHILDREN and
// TRUECHILDREN. Asking a FHIR server for them one ancestor at a time takes
// four requests each, tens of thousands for a list of a few thousand codes.
// Here the server returns three subgraphs, each with every concept's parents
// (`$expand` with `property=parent`), and the counts are taken locally:
//
//   >> list                          the candidates and the list's place under them
//   <! (>> list)                     every candidate's children
//   << (candidates that survive)     their descendants, for ALL
//
// Phase 1 picks inclusion clauses: the "automatic" groupers (no non-members
// below), then winners by score while the fit threshold is detuned. Members no
// winner covers are listed. Phase 2 excludes what the inclusions add: each
// largest subtree with no member as `<< y`, and non-members above members one
// by one, so the result is exact on the server's release.

import { byId, orGroup, SNOMED_ROOT, type MemberSet, type SetQueries } from './set-queries';

export interface GreedyClause {
  conceptId: string;
  /** `=` is the concept alone, written without an operator. */
  operator: '<<' | '<' | '=';
}

export interface GreedyGrouping {
  ecl: string;
  includes: GreedyClause[];
  exclusions: GreedyClause[];
}

export interface GreedyLimits {
  /** Most concepts in any subgraph fetched. */
  maxConcepts: number;
  /** Most inclusion clauses chosen by score before the rest are listed. */
  maxClauses: number;
}

// Starting values from the DMWB flowchart.
const MINIMUM_CLUSTER_SIZE = 2;
const FIT_THRESHOLD = 0.9;
const MINIMUM_FIT_THRESHOLD = 0.5;
const IDEAL_CLAUSE_COUNT = 1;
const MAX_CYCLES = 2000;

interface Candidate {
  id: string;
  member: boolean;
  /** Descendants the clause selects: `<< id` for a member, `< id` otherwise. */
  all: number;
  truePos: number;
  allChildren: number;
  trueChildren: number;
  /** The members the clause selects. */
  covers: string[];
}

/**
 * A greedy grouping of the members, or null (with a note) when a subgraph is
 * larger than `limits.maxConcepts` or the server does not return parents.
 */
export async function greedyGrouping(
  members: MemberSet,
  q: SetQueries,
  limits: GreedyLimits,
  notes: string[],
): Promise<GreedyGrouping | null> {
  const graphs = await loadGraphs(members, q, limits.maxConcepts);
  if (typeof graphs === 'string') {
    notes.push(
      `Greedy grouping was skipped: ${graphs} has more than ${limits.maxConcepts} concepts, or the server ` +
        'does not return parents in an expansion (property=parent).',
    );
    return null;
  }
  const { inList, up, children, down } = graphs;
  const descendants = memoisedDescendants(childrenOf(down));
  const candidates = graphs.kept.map((id) => candidate(id, inList, children, descendants)).filter(notSolitaryParent);

  const chosen = chooseInclusions(candidates, inList, limits.maxClauses);
  const includes = prune(withResidue(chosen, inList, children), descendants);
  const exclusions = exclusionsFor(includedConcepts(includes, descendants), up, inList, down);
  return { ecl: render(includes, exclusions), includes, exclusions };
}

interface Graphs {
  inList: Set<string>;
  /** `>> list`, each concept with its parents. */
  up: Map<string, string[]>;
  /** The children of every concept in `up`. */
  children: Map<string, string[]>;
  /** Candidates left after the discard rules that need no descendant counts. */
  kept: string[];
  /** `<< kept`, each concept with its parents. */
  down: Map<string, string[]>;
}

/** The subgraphs greedy grouping counts in, or what was too large to fetch. */
async function loadGraphs(members: MemberSet, q: SetQueries, max: number): Promise<Graphs | string> {
  const memberList = await q.codes({ include: [members.clause] }, max + 1);
  if (memberList.total > max) return 'the set';
  const inList = new Set(memberList.codes);
  const up = await q.graph({ include: [{ ecl: `>> ${members.ecl}` }] }, max);
  if (!up) return 'the set with its ancestors';
  const childGraph = await q.graph({ include: [{ ecl: `<! (>> ${members.ecl})` }] }, max);
  if (!childGraph) return 'the children of those ancestors';
  const children = childrenOf(childGraph);

  // Discard rules that need no descendant counts go first, so ALL is counted
  // only for the candidates that remain.
  const truePos = countMembersBelow(inList, up);
  const kept = [...up.keys()].filter((id) => keepByChildren(id, truePos, children, inList)).sort(byId);
  if (kept.length === 0) return { inList, up, children, kept, down: new Map() };
  const down = await q.graph({ include: [{ ecl: `<< ${orGroup(kept)}` }] }, max);
  if (!down) return 'the descendants of the candidate groupers';
  return { inList, up, children, kept, down };
}

function keepByChildren(
  id: string,
  truePos: Map<string, number>,
  children: Map<string, string[]>,
  inList: Set<string>,
): boolean {
  if (id === SNOMED_ROOT || (truePos.get(id) ?? 0) < MINIMUM_CLUSTER_SIZE) return false;
  const kids = children.get(id) ?? [];
  const trueChildren = kids.filter((k) => inList.has(k)).length;
  if (kids.length - trueChildren > trueChildren) return false;
  return !(kids.length > 9 && trueChildren / kids.length < 0.6);
}

function candidate(
  id: string,
  inList: Set<string>,
  children: Map<string, string[]>,
  descendants: (id: string) => string[],
): Candidate {
  const member = inList.has(id);
  const desc = descendants(id);
  const covers = desc.filter((d) => inList.has(d) && (member || d !== id));
  const kids = children.get(id) ?? [];
  return {
    id,
    member,
    all: desc.length - (member ? 0 : 1),
    truePos: covers.length,
    allChildren: kids.length,
    trueChildren: kids.filter((k) => inList.has(k)).length,
    covers,
  };
}

/** Direct parents of a solitary leaf are discarded. */
function notSolitaryParent(c: Candidate): boolean {
  return c.member || c.all - c.truePos !== 1 || c.allChildren !== 1;
}

/** The chosen groupers, then each member none of them covers. */
function withResidue(chosen: Candidate[], inList: Set<string>, children: Map<string, string[]>): GreedyClause[] {
  const remaining = new Set(inList);
  for (const c of chosen) for (const m of c.covers) remaining.delete(m);
  const includes: GreedyClause[] = chosen.map((c) => ({ conceptId: c.id, operator: c.member ? '<<' : '<' }));
  for (const m of [...remaining].sort(byId)) {
    // `=x` with no children is written `<<x`, as REFACTOR does.
    includes.push({ conceptId: m, operator: (children.get(m) ?? []).length === 0 ? '<<' : '=' });
  }
  return includes;
}

// ── Phase 1: choosing groupers ───────────────────────────────────────────

/** REFACTOR's weighted score of a candidate at the current zoom. */
function score(c: Candidate, zoom: number, listSize: number): number {
  let s = c.truePos / c.all;
  const childRatio = c.allChildren ? c.trueChildren / c.allChildren : 0;
  // Boost groupers with many non-member descendants but few non-member children.
  if (s < 0.4 && c.allChildren > 6 && childRatio > 0.8) s += childRatio;
  if (!c.member) s *= 0.95;
  if (s > 0 && s < 0.7) s *= 1 / (Math.abs(listSize / c.truePos - zoom) + 1);
  return s;
}

/** The most general candidates with no non-member below. */
function automatic(candidates: Candidate[]): Candidate[] {
  const perfect = candidates.filter((c) => c.all === c.truePos);
  const below = new Set<string>();
  for (const c of perfect) for (const m of c.covers) if (m !== c.id) below.add(m);
  return perfect.filter((c) => !below.has(c.id));
}

/** The best-scoring candidate at or above the threshold (lowest id on a tie), and the best score. */
function pickWinner(live: Candidate[], zoom: number, threshold: number, listSize: number) {
  let winner: Candidate | null = null;
  let winnerScore = -1;
  let best = 0;
  for (const c of live) {
    const s = score(c, zoom, listSize);
    best = Math.max(best, s);
    if (s < threshold) continue;
    const tieBreak = s === winnerScore && winner !== null && byId(c.id, winner.id) < 0;
    if (s > winnerScore || tieBreak) {
      winner = c;
      winnerScore = s;
    }
  }
  return { winner, best };
}

interface Tuning {
  threshold: number;
  zoom: number;
  wonAtThreshold: boolean;
}

/** Widen the zoom, else lower the threshold; false when neither can change. */
function detune(t: Tuning, best: number, remaining: number, maxClauses: number): boolean {
  const nextZoom = Math.round(t.zoom * 1.1 + 0.5);
  if (nextZoom <= maxClauses && nextZoom <= remaining && nextZoom !== t.zoom) {
    t.zoom = nextZoom;
    return true;
  }
  const next = t.wonAtThreshold ? Math.round(t.threshold * 0.9 * 1000) / 1000 : best;
  if (!(next > MINIMUM_FIT_THRESHOLD && next < t.threshold)) return false;
  t.threshold = next;
  t.zoom = IDEAL_CLAUSE_COUNT;
  t.wonAtThreshold = false;
  return true;
}

/** Automatic groupers, then winners by score while the threshold is detuned. */
function chooseInclusions(candidates: Candidate[], inList: Set<string>, maxClauses: number): Candidate[] {
  const remaining = new Set(inList);
  const chosen = automatic(candidates);
  for (const c of chosen) for (const m of c.covers) remaining.delete(m);

  let live = candidates.filter((c) => !chosen.includes(c));
  const tuning: Tuning = { threshold: FIT_THRESHOLD, zoom: IDEAL_CLAUSE_COUNT, wonAtThreshold: false };
  let grouped = true;
  for (let cycle = 0; cycle < MAX_CYCLES && remaining.size > 0 && chosen.length < maxClauses; cycle++) {
    // A candidate with nothing left to group never will have again.
    if (grouped) live = live.filter((c) => c.covers.some((m) => remaining.has(m)));
    if (live.length === 0) break;
    const { winner, best } = pickWinner(live, tuning.zoom, tuning.threshold, inList.size);
    grouped = winner !== null;
    if (winner) {
      chosen.push(winner);
      for (const m of winner.covers) remaining.delete(m);
      tuning.zoom = IDEAL_CLAUSE_COUNT;
      tuning.wonAtThreshold = true;
    } else if (!detune(tuning, best, remaining.size, maxClauses)) {
      break;
    }
  }
  return chosen;
}

// ── Final clear-up and phase 2 ───────────────────────────────────────────

/**
 * Drop clauses another clause already selects (`< x` with `= x` becomes
 * `<< x`), then clauses everything they select is selected by the others,
 * smallest first: `< y` is redundant when each of y's descendants falls under
 * another clause, though y does not.
 */
function prune(clauses: GreedyClause[], descendants: (id: string) => string[]): GreedyClause[] {
  const merged = mergeByConcept(clauses);
  const selectedBelow = new Set<string>();
  for (const c of merged) {
    if (c.operator === '=') continue;
    for (const d of descendants(c.conceptId)) if (d !== c.conceptId) selectedBelow.add(d);
  }
  const kept = merged.filter((c) => !selectedBelow.has(c.conceptId));
  return withoutCovered(kept, descendants).sort((a, b) => byId(a.conceptId, b.conceptId));
}

/** `clauses` without those whose whole selection the others select, smallest first. */
function withoutCovered(clauses: GreedyClause[], descendants: (id: string) => string[]): GreedyClause[] {
  const selected = clauses.map((c) => ({ c, sel: selection(c, descendants) }));
  const times = new Map<string, number>();
  for (const { sel } of selected) for (const x of sel) times.set(x, (times.get(x) ?? 0) + 1);
  selected.sort((a, b) => a.sel.length - b.sel.length || byId(a.c.conceptId, b.c.conceptId));
  const kept: GreedyClause[] = [];
  for (const { c, sel } of selected) {
    if (sel.every((x) => (times.get(x) ?? 0) > 1)) {
      for (const x of sel) times.set(x, (times.get(x) ?? 0) - 1);
    } else {
      kept.push(c);
    }
  }
  return kept;
}

/** The concepts a clause selects. */
function selection(c: GreedyClause, descendants: (id: string) => string[]): string[] {
  if (c.operator === '=') return [c.conceptId];
  const desc = descendants(c.conceptId);
  return c.operator === '<<' ? desc : desc.filter((d) => d !== c.conceptId);
}

function mergeByConcept(clauses: GreedyClause[]): GreedyClause[] {
  const byConcept = new Map<string, Set<GreedyClause['operator']>>();
  for (const c of clauses) {
    const ops = byConcept.get(c.conceptId) ?? new Set();
    ops.add(c.operator);
    byConcept.set(c.conceptId, ops);
  }
  return [...byConcept].map(([conceptId, ops]) => {
    let operator: GreedyClause['operator'] = ops.has('<') ? '<' : '=';
    if (ops.has('<<') || (ops.has('<') && ops.has('='))) operator = '<<';
    return { conceptId, operator };
  });
}

function includedConcepts(includes: GreedyClause[], descendants: (id: string) => string[]): Set<string> {
  const included = new Set<string>();
  for (const c of includes) for (const x of selection(c, descendants)) included.add(x);
  return included;
}

/**
 * What the inclusions select outside the set, excluded exactly. A concept with
 * no member at or below it is outside `>> list` (`up`); the highest of them go
 * as `<< y`. A non-member above a member goes alone.
 */
function exclusionsFor(
  included: Set<string>,
  up: Map<string, string[]>,
  inList: Set<string>,
  parents: Map<string, string[]>,
): GreedyClause[] {
  const clean = (id: string) => included.has(id) && !up.has(id);
  const exclusions: GreedyClause[] = [];
  for (const id of included) {
    if (inList.has(id)) continue;
    if (!clean(id)) exclusions.push({ conceptId: id, operator: '=' });
    // A top of the member-free region: no parent inside it.
    else if (!(parents.get(id) ?? []).some(clean)) exclusions.push({ conceptId: id, operator: '<<' });
  }
  return exclusions.sort((a, b) => byId(a.conceptId, b.conceptId));
}

function render(includes: GreedyClause[], exclusions: GreedyClause[]): string {
  const text = (c: GreedyClause) => (c.operator === '=' ? c.conceptId : `${c.operator} ${c.conceptId}`);
  const inc = includes.map(text);
  if (exclusions.length === 0) return inc.join(' OR ');
  return `${orGroup(inc)} MINUS ${orGroup(exclusions.map(text))}`;
}

// ── Graph helpers ────────────────────────────────────────────────────────

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

/** For each concept in `graph`, how many of `members` are it or below it. */
function countMembersBelow(members: Set<string>, graph: Map<string, string[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of members) for (const a of reachable(m, graph)) counts.set(a, (counts.get(a) ?? 0) + 1);
  return counts;
}

/** `id` and its descendants in `children`, computed once per concept asked for. */
function memoisedDescendants(children: Map<string, string[]>): (id: string) => string[] {
  const cache = new Map<string, string[]>();
  return (id) => {
    let list = cache.get(id);
    if (!list) {
      list = [...reachable(id, children)];
      cache.set(id, list);
    }
    return list;
  };
}
