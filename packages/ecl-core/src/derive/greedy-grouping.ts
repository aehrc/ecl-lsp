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

import { exactExclusions, prune, render, type HierarchyClause } from './hierarchy-clauses';
import { byId } from './set-queries';
import type { TaxonomyGraph } from './taxonomy-graph';

export interface GreedyGrouping {
  ecl: string;
  includes: HierarchyClause[];
  exclusions: HierarchyClause[];
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

/** A greedy grouping of the members, counted in `graph` (loaded with {@link refactorDescend}). */
export function greedyGrouping(graph: TaxonomyGraph, maxClauses: number): GreedyGrouping {
  const inList = graph.members;
  const candidates = graph
    .ancestors()
    .filter((id) => refactorDescend(id, graph))
    .map((id) => candidate(id, graph))
    .filter(notSolitaryParent);

  const chosen = chooseInclusions(candidates, inList, maxClauses);
  const includes = prune(withResidue(chosen, graph), graph);
  const exclusions = exactExclusions(includes, graph);
  return { ecl: render({ includes, exclusions }), includes, exclusions };
}

/**
 * The discard rules that need no descendant counts: which concepts of `>> list`
 * are worth loading descendants for, so ALL is counted only for those.
 */
export function refactorDescend(id: string, graph: Pick<TaxonomyGraph, 'truePos' | 'children' | 'members'>): boolean {
  if (graph.truePos(id) < MINIMUM_CLUSTER_SIZE) return false;
  const kids = graph.children(id);
  const trueChildren = kids.filter((k) => graph.members.has(k)).length;
  if (kids.length - trueChildren > trueChildren) return false;
  return !(kids.length > 9 && trueChildren / kids.length < 0.6);
}

function candidate(id: string, graph: TaxonomyGraph): Candidate {
  const member = graph.members.has(id);
  const desc = graph.descendants(id);
  const covers = desc.filter((d) => graph.members.has(d) && (member || d !== id));
  const kids = graph.children(id);
  return {
    id,
    member,
    all: desc.length - (member ? 0 : 1),
    truePos: covers.length,
    allChildren: kids.length,
    trueChildren: kids.filter((k) => graph.members.has(k)).length,
    covers,
  };
}

/** Direct parents of a solitary leaf are discarded. */
function notSolitaryParent(c: Candidate): boolean {
  return c.member || c.all - c.truePos !== 1 || c.allChildren !== 1;
}

/** The chosen groupers, then each member none of them covers. */
function withResidue(chosen: Candidate[], graph: TaxonomyGraph): HierarchyClause[] {
  const remaining = new Set(graph.members);
  for (const c of chosen) for (const m of c.covers) remaining.delete(m);
  const includes: HierarchyClause[] = chosen.map((c) => ({ conceptId: c.id, operator: c.member ? '<<' : '<' }));
  for (const m of [...remaining].sort(byId)) {
    // `=x` with no children is written `<<x`, as REFACTOR does.
    includes.push({ conceptId: m, operator: graph.children(m).length === 0 ? '<<' : '=' });
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
function chooseInclusions(candidates: Candidate[], inList: ReadonlySet<string>, maxClauses: number): Candidate[] {
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
