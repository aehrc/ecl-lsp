// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Derive candidate ECL from a set of concepts: "the opposite of $expand" (issue #147).
//
// Given an enumerated concept list or a reference set, propose ECL expressions
// that select it, each with an exact account of how it differs from the set:
// how many members it selects (covered), how many non-members it adds
// (additions) and how many members it leaves out (misses), with samples.
//
// Every set operation runs on the terminology server through
// `ITerminologyService.expandCompose` (a POSTed inline ValueSet), so nothing is
// downloaded to compare and the input can be large. The work is bounded by the
// options below, never by the size of the set.
//
// Hierarchy candidates come from the IS-A subgraph around the set, fetched once
// (taxonomy-graph.ts, about four requests), built and ranked locally, and the
// ones returned are counted again on the server. When the server returns no
// parents in an expansion, or the subgraph is larger than `maxGraphConcepts`,
// they are built with a query per count instead (the per-query path).
//
//   1. Exact hierarchy cover. Take the set's roots R (members with no ancestor
//      in the set) as `<< r`, remove the over-inclusion with `MINUS << x` over
//      the largest subtrees that contain no member, then remove what is left
//      as literal ids. Exact when the literal residue is small enough.
//      (The same shape as `sct ecl compress`, written from its published
//      description.)
//
//   2. Ancestor covers. Ancestors of the roots are not members, so `< a` can
//      replace several `<< r` at the cost of the non-members under `a`. The
//      best single ancestors are offered, with whatever they miss. On the
//      per-query path a greedy weighted set cover over the roots, cost =
//      1 + additions per clause, gives a short cover too.
//
//   3. On the graph path, a cost-based exact cover (cover-optimiser.ts) and
//      greedy grouping (greedy-grouping.ts, REFACTOR's scored choice of
//      groupers): both pick groupers among every ancestor of the set, with
//      exact exclusions, so neither is limited by the number of roots.
//
// Then, for sets that cut across the hierarchy, attribute refinements
// (refinements.ts), and last:
//
//   4. The input itself: the enumeration (`a OR b OR …`) or `^ refset`, which is
//      always exact, so a caller is never forced to accept a lossy candidate.
//
// Ranking is by cost = clauses + additions + misses. The same input and
// terminology version give the same output, whatever the input order.

import { canonicalise } from '../canonical/comparator';
import { formatDocument } from '../formatter/formatter';
import { defaultFormattingOptions } from '../formatter/options';
import type { ConceptInfo, ITerminologyService, ValueSetCompose } from '../terminology/types';
import { isValidConceptId } from '../terminology/verhoeff';
import {
  byId,
  compareText,
  countClauses,
  orGroup,
  SetQueries,
  SNOMED_ROOT,
  stripTermsAndComments,
  type MemberSet,
  type SetDifference,
} from './set-queries';
import { bestSingles, costCover, coverDescend, rootsCover } from './cover-optimiser';
import { greedyGrouping, refactorDescend } from './greedy-grouping';
import { localScore, render, type ClauseForm, type HierarchyClause } from './hierarchy-clauses';
import { loadTaxonomyGraph, type TaxonomyGraph } from './taxonomy-graph';
import { asFocus, refinementCandidates, refinementText, refsetFoci, type RefinementClause } from './refinements';

// ── Public types ─────────────────────────────────────────────────────────

/** The set to derive ECL for: an enumerated list of concept ids, or a reference set's members. */
/**
 * The set to derive ECL for: an enumerated list of concept ids, a reference
 * set's members, or the concepts an ECL expression selects (to find a shorter
 * form of it, issue #149).
 */
export type DeriveInput = { conceptIds: string[] } | { refsetId: string } | { ecl: string };

export interface DeriveOptions {
  /**
   * Per-query path: above this many roots, hierarchy candidates are skipped as
   * not compact (on the graph path they cost no query per root). Default 200.
   */
  maxRoots?: number;
  /** Most `MINUS << x` subtree exclusions in an exact hierarchy cover. Default 32. */
  maxExclusions?: number;
  /** Most literal ids the exact cover may exclude before it is reported as lossy instead. Default 50. */
  maxResidualLiterals?: number;
  /** Per-query path: above this many roots, ancestor covers are skipped (they cost a query per root). Default 50. */
  maxAncestorRoots?: number;
  /** Per-query path: most ancestors whose counts are fetched for ancestor covers. Default 30. */
  maxAncestorCandidates?: number;
  /** Concepts returned in each additions/misses sample. Default 10. */
  sampleSize?: number;
  /** Most candidates returned. Default 8. */
  maxCandidates?: number;
  /** Leave display terms out of `expression`. Default false. */
  omitTerms?: boolean;
  /**
   * Attribute refinement candidates (`focus : attribute = value`):
   * `'auto'` builds them when the set cuts across the IS-A hierarchy: more than
   * 20 roots, or more than 3 with no exact IS-A candidate of 3 clauses or fewer.
   * Default `'auto'`. Needs `getDefiningRelationships`.
   */
  refinements?: 'auto' | 'always' | 'never';
  /**
   * The focus for refinement candidates, e.g. `^ 929360081000036101` for AMT
   * MPUUs. Default: `<<` the most specific concept above every member.
   */
  refinementFocus?: string;
  /** Count members by top-level hierarchy. Default true. */
  hierarchySummary?: boolean;
  /** Timeout for each set query, in milliseconds. Default 60,000. */
  queryTimeoutMs?: number;
  /**
   * When no refinement is exact, try `C MINUS D` for the best lossy refinements
   * C, with D describing what C adds. Default true.
   */
  subtractions?: boolean;
  /**
   * Count a candidate's additions only inside this expression (used for the D
   * in `C MINUS D`). Default: everywhere.
   */
  within?: string;
  /**
   * Add a REFACTOR-style greedy grouping candidate. Offered only on the graph
   * path (see `useGraph`), including a partial graph. Default true.
   */
  greedyGrouping?: boolean;
  /**
   * Build hierarchy candidates from one fetched subgraph. Default true. Needs a
   * server that returns parents in an expansion (`property=parent`); without
   * them, or when `false`, each count is a query.
   */
  useGraph?: boolean;
  /** Most concepts in any fetched subgraph. Default 200,000. */
  maxGraphConcepts?: number;
}

export type { SetDifference } from './set-queries';

/** How a candidate was built, so a caller can explain it. */
export type CandidateConstruction =
  | { kind: 'enumeration'; members: number }
  | { kind: 'refset'; refsetId: string }
  | { kind: 'expression' }
  | {
      kind: 'hierarchy';
      /** Members with no ancestor in the set, each included as `<< root`. */
      roots: string[];
      /** Subtrees with no member, each excluded as `MINUS << x`. */
      exclusions: string[];
      /** Remaining non-members excluded one by one. */
      literalExclusions: string[];
    }
  | {
      kind: 'refinement';
      focus: string;
      /** The clauses after `:`, all required. */
      attributes: RefinementClause[];
    }
  | {
      kind: 'subtraction';
      /** A lossy candidate and, subtracted from it, a description of what it adds. */
      from: string;
      minus: string;
    }
  | {
      kind: 'greedy-grouping';
      /** Clauses ORed together; `=` is the concept alone. */
      includes: HierarchyClause[];
      /** Clauses subtracted with MINUS. */
      exclusions: HierarchyClause[];
    }
  | {
      /** The cost-based exact cover: groupers chosen by members covered per clause, the rest listed. */
      kind: 'cover';
      /** Clauses ORed together; `=` is the concept alone. */
      includes: HierarchyClause[];
      /** Clauses subtracted with MINUS. */
      exclusions: HierarchyClause[];
    }
  | {
      kind: 'ancestor-cover';
      /** The clauses, in the order chosen: `<< member` or `< ancestor` (a non-member). */
      foci: { conceptId: string; operator: '<' | '<<'; member: boolean }[];
    };

export interface DeriveCandidate {
  /** The candidate, formatted, with display terms unless `omitTerms`. */
  expression: string;
  /** The same expression on one line without terms, for evaluation and comparison. */
  ecl: string;
  /** Set members it selects. */
  covered: number;
  /** Non-members it selects. */
  additions: SetDifference;
  /** Set members it does not select. */
  misses: SetDifference;
  /** True when it selects exactly the set. */
  exact: boolean;
  /** Concept references in `ecl`: the length part of the ranking cost. */
  clauses: number;
  construction: CandidateConstruction;
}

export interface DeriveInputReport {
  /** Distinct ids given (after trimming), or the refset id. */
  given: number;
  /** Active concepts the server knows: the set candidates are compared with. */
  members: number;
  /** Ids the server knows but that are inactive; left out of the set. */
  inactive: string[];
  /** Well-formed ids the server does not know; left out of the set. */
  unknown: string[];
  /** Strings that are not valid SNOMED CT concept ids; left out of the set. */
  malformed: string[];
  /** Ids given more than once. */
  duplicates: number;
}

export interface DeriveResult {
  input: DeriveInputReport;
  /** Members by top-level hierarchy, largest first. */
  hierarchies: { conceptId: string; display: string; count: number }[];
  /** Members with no ancestor in the set: how many `<< root` clauses an IS-A cover needs at least. */
  roots: number;
  /** Candidates, best first. */
  candidates: DeriveCandidate[];
  /** What was skipped or limited, and why. */
  notes: string[];
}

// ── Defaults and small helpers ───────────────────────────────────────────

const DEFAULTS: Required<DeriveOptions> = {
  maxRoots: 200,
  maxExclusions: 32,
  maxResidualLiterals: 50,
  maxAncestorRoots: 50,
  maxAncestorCandidates: 30,
  sampleSize: 10,
  maxCandidates: 8,
  omitTerms: false,
  refinements: 'auto',
  refinementFocus: '',
  hierarchySummary: true,
  queryTimeoutMs: 60_000,
  subtractions: true,
  within: '',
  greedyGrouping: true,
  useGraph: true,
  maxGraphConcepts: 200_000,
};

/** Above this many concept references, candidates are not formatted or given terms. */
const MAX_DECORATED_CLAUSES = 200;
/** Candidates scored at once (2 queries each). */
const SCORE_BATCH = 4;
/** With `refinements: 'auto'`, refinement candidates are always built above this many roots. */
const REFINEMENT_ROOTS = 20;
/** Subtree tops sized when no exact cover is possible anyway. */
const LOSSY_SIZED = 64;
/** Most subtree tops (for exclusions) or ancestors (for covers) whose size is counted. */
const MAX_SIZED = 500;
/** Most clauses greedy grouping chooses by score; members left over are listed. */
const MAX_GREEDY_CLAUSES = 300;
/** Lossy refinements for which a subtraction is sought. */
const MAX_SUBTRACTED = 2;

// ── Entry point ──────────────────────────────────────────────────────────

/**
 * Propose ECL expressions for a set of concepts, ranked, each with exact counts
 * of what it adds to and misses from the set.
 *
 * @throws Error when `terminology` does not implement `expandCompose`.
 * @throws `TerminologyTransportError` / `TerminologyHttpError` when the server fails.
 */
export async function deriveEcl(
  input: DeriveInput,
  terminology: ITerminologyService,
  options: DeriveOptions = {},
): Promise<DeriveResult> {
  if (!terminology.expandCompose) {
    throw new Error('deriveEcl needs a terminology service that supports expandCompose (POST ValueSet/$expand)');
  }
  const opts = { ...DEFAULTS, ...options };
  const expandCompose = terminology.expandCompose.bind(terminology);
  const q = new SetQueries((compose, o) => expandCompose(compose, { timeoutMs: opts.queryTimeoutMs, ...o }));
  const notes: string[] = [];

  const { report, members } = await resolveInput(input, q, terminology, notes);
  const result: DeriveResult = { input: report, hierarchies: [], roots: 0, candidates: [], notes };
  if (!members) {
    if (notes.length === 0) {
      notes.push('The input has no active concepts the server knows, so there is nothing to derive.');
    }
    return result;
  }

  const graph = opts.useGraph ? await loadGraph(members, q, opts, notes) : null;
  if (opts.hierarchySummary) {
    result.hierarchies = graph ? await graphHierarchies(graph, terminology) : await hierarchyDistribution(members, q);
  }

  const rootQuery = graph
    ? { codes: graph.roots().slice(0, opts.maxRoots + 1), total: graph.roots().length }
    : await q.codes({ include: [members.clause], exclude: [{ ecl: `< ${members.ecl}` }] }, opts.maxRoots + 1);
  result.roots = rootQuery.total;

  const scorer = new Scorer(members, q, opts, notes);
  // On the graph path only the best by local counts are counted on the server.
  if (graph)
    await scorer.score(worthCounting(graphCandidates(graph, opts, notes), inputCost(input, members), opts, notes));
  else await scorer.score(await hierarchyCandidates(rootQuery.codes, result.roots, members, q, opts, notes));
  if (wantRefinements(opts.refinements, result.roots, scorer.scored)) {
    await scoreRefinements(input, members, rootQuery, scorer, q, terminology, opts, notes);
  }
  // The input itself goes last, so a derived candidate that rebuilds it keeps its construction.
  await scorer.score([inputItself(input, members)]);

  scorer.scored.sort((a, b) => byRank(rankOf(a), rankOf(b)));
  const top = scorer.scored.slice(0, opts.maxCandidates);

  const terms = opts.omitTerms ? new Map<string, string>() : await displayTerms(top, terminology);
  result.candidates = top.map((s) => ({ expression: decorate(s.ecl, terms), ...s }));
  return result;
}

/** Refinement candidates and, when none is exact, subtractions. */
async function scoreRefinements(
  input: DeriveInput,
  members: MemberSet,
  rootQuery: { codes: string[]; total: number },
  scorer: Scorer,
  q: SetQueries,
  terminology: ITerminologyService,
  opts: Required<DeriveOptions>,
  notes: string[],
): Promise<void> {
  let given = 'ecl' in input ? refsetFoci(input.ecl) : [];
  if (opts.refinementFocus) given = [asFocus(opts.refinementFocus)];
  const found = await refinementCandidates(
    members,
    rootQuery,
    given,
    Boolean(opts.refinementFocus),
    q,
    terminology,
    notes,
  );
  const refinements = found.map(({ focus, clauses }) => ({
    ecl: refinementText(focus, clauses),
    construction: { kind: 'refinement' as const, focus, attributes: clauses },
  }));
  // An exact refinement of three clauses or fewer is as short as they get.
  await scorer.score(refinements, (c) => c.exact && c.clauses <= 3);
  if (opts.subtractions && !scorer.scored.some((c) => c.exact && c.construction.kind === 'refinement')) {
    await scorer.score(await subtractions(scorer.scored, members, terminology, opts));
  }
}

/**
 * `C MINUS D` for the best lossy refinements C that miss nothing: D describes
 * what C adds, found by deriving refinements for `C MINUS S` and judging them
 * within C only (what D selects outside C is subtracted from nothing).
 */
async function subtractions(
  scored: Scored[],
  members: MemberSet,
  terminology: ITerminologyService,
  opts: Required<DeriveOptions>,
): Promise<Built[]> {
  const lossy = scored
    .filter((c) => c.construction.kind === 'refinement' && c.misses.count === 0 && c.additions.count > 0)
    .sort((a, b) => a.clauses + a.additions.count - (b.clauses + b.additions.count))
    .slice(0, MAX_SUBTRACTED);
  const built: Built[] = [];
  for (const c of lossy) {
    if (c.construction.kind !== 'refinement') continue;
    const extra = await deriveEcl({ ecl: `(${c.ecl}) MINUS ${members.ecl}` }, terminology, {
      ...opts,
      refinements: 'always',
      refinementFocus: c.construction.focus,
      within: c.ecl,
      subtractions: false,
      hierarchySummary: false,
      omitTerms: true,
      maxCandidates: 3,
    });
    const d = extra.candidates.find((x) => x.construction.kind !== 'expression' && x.misses.count === 0);
    if (d) {
      built.push({
        ecl: `(${c.ecl}) MINUS (${d.ecl})`,
        construction: { kind: 'subtraction', from: c.ecl, minus: d.ecl },
      });
    }
  }
  return built;
}

/**
 * `'auto'`: refinements are worth their requests when the set has more than
 * {@link REFINEMENT_ROOTS} roots, or more than 3 and no IS-A candidate is an
 * exact cover in 3 clauses or fewer.
 */
function wantRefinements(mode: DeriveOptions['refinements'], roots: number, scored: Scored[]): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  if (roots > REFINEMENT_ROOTS) return true;
  return roots > 3 && !scored.some((c) => c.exact && c.clauses <= 3);
}

function inputItself(
  input: DeriveInput,
  members: MemberSet,
): { ecl: string; construction: CandidateConstruction; known: Omit<Scored, 'ecl' | 'construction'> } {
  const known = exactScore(members.size);
  if ('ecl' in input) return { ecl: stripTermsAndComments(input.ecl), construction: { kind: 'expression' }, known };
  if ('refsetId' in input) {
    return { ecl: `^ ${input.refsetId}`, construction: { kind: 'refset', refsetId: input.refsetId }, known };
  }
  return { ecl: members.ecl, construction: { kind: 'enumeration', members: members.size }, known };
}

/** Candidates with the same canonical form are one candidate (canonicalising long enumerations is not worth it). */
function formKey(ecl: string): string {
  if (countClauses(ecl) > MAX_DECORATED_CLAUSES) return ecl;
  try {
    return canonicalise(ecl);
  } catch {
    return ecl;
  }
}

// ── Input ────────────────────────────────────────────────────────────────

async function resolveInput(
  input: DeriveInput,
  q: SetQueries,
  terminology: ITerminologyService,
  notes: string[],
): Promise<{ report: DeriveInputReport; members: MemberSet | null }> {
  if ('refsetId' in input) return resolveRefset(input.refsetId.trim(), q, terminology, notes);
  if ('ecl' in input) {
    const ecl = `(${stripTermsAndComments(input.ecl)})`;
    const size = await q.countEcl(ecl);
    const report: DeriveInputReport = {
      given: size,
      members: size,
      inactive: [],
      unknown: [],
      malformed: [],
      duplicates: 0,
    };
    return { report, members: size ? { clause: { ecl }, ecl, size } : null };
  }
  const trimmed = input.conceptIds.map((id) => id.trim()).filter((id) => id.length > 0);
  const distinct = [...new Set(trimmed)].sort(byId);
  const malformed = distinct.filter((id) => !isValidConceptId(id));
  const wellFormed = distinct.filter((id) => isValidConceptId(id));
  const report: DeriveInputReport = {
    given: distinct.length,
    members: 0,
    inactive: [],
    unknown: [],
    malformed,
    duplicates: trimmed.length - distinct.length,
  };
  if (wellFormed.length === 0) return { report, members: null };

  // Unknown codes are dropped silently by $expand, and inactive ones kept unless
  // activeOnly, so ask twice and difference the answers.
  const listed: ValueSetCompose = { include: [{ concepts: wellFormed }] };
  const active = (await q.codes(listed, wellFormed.length, true)).codes;
  const known = new Set((await q.codes(listed, wellFormed.length, false)).codes);
  const activeSet = new Set(active);
  report.inactive = wellFormed.filter((id) => known.has(id) && !activeSet.has(id));
  report.unknown = wellFormed.filter((id) => !known.has(id));
  report.members = active.length;
  if (active.length === 0) return { report, members: null };
  return { report, members: { clause: { concepts: active }, ecl: orGroup(active), size: active.length } };
}

async function resolveRefset(
  refsetId: string,
  q: SetQueries,
  terminology: ITerminologyService,
  notes: string[],
): Promise<{ report: DeriveInputReport; members: MemberSet | null }> {
  const report: DeriveInputReport = {
    given: 1,
    members: 0,
    inactive: [],
    unknown: [],
    malformed: isValidConceptId(refsetId) ? [] : [refsetId],
    duplicates: 0,
  };
  if (report.malformed.length > 0) return { report, members: null };
  const ecl = `(^ ${refsetId})`;
  report.members = await q.countEcl(ecl);
  if (report.members === 0) {
    const info = await terminology.getConceptInfo(refsetId);
    if (info === null) report.unknown.push(refsetId);
    else if (info.active) notes.push(`${refsetId} |${info.pt}| has no active members, or is not a reference set.`);
    else report.inactive.push(refsetId);
  }
  return { report, members: report.members ? { clause: { ecl }, ecl, size: report.members } : null };
}

async function hierarchyDistribution(
  members: MemberSet,
  q: SetQueries,
): Promise<{ conceptId: string; display: string; count: number }[]> {
  // Only the top-level hierarchies that hold a member are counted.
  const tops = await q.sample({ include: [{ ecl: `(>> ${members.ecl}) AND <! ${SNOMED_ROOT}` }] }, 100);
  const counts = await Promise.all(
    tops.sample.map(async (top) => ({
      conceptId: top.code,
      display: top.display,
      count: members.size - (await q.count({ include: [members.clause], exclude: [{ ecl: `<< ${top.code}` }] })),
    })),
  );
  return counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count || byId(a.conceptId, b.conceptId));
}

/** The same summary from the graph: the root's children above a member, counted locally. */
async function graphHierarchies(
  g: TaxonomyGraph,
  terminology: ITerminologyService,
): Promise<{ conceptId: string; display: string; count: number }[]> {
  const tops = g
    .children(SNOMED_ROOT)
    .filter((c) => g.aboveMember(c))
    .sort(byId);
  if (tops.length === 0) return [];
  let infos = new Map<string, ConceptInfo | null>();
  try {
    infos = await terminology.validateConcepts(tops);
  } catch {
    // The counts are local; without display terms they are still worth giving.
  }
  return tops
    .map((conceptId) => ({ conceptId, display: infos.get(conceptId)?.pt ?? '', count: g.truePos(conceptId) }))
    .sort((a, b) => b.count - a.count || byId(a.conceptId, b.conceptId));
}

// ── Hierarchy candidates ─────────────────────────────────────────────────

/** The IS-A subgraph around the set, or null (with a note) when the per-query path must be used. */
async function loadGraph(
  members: MemberSet,
  q: SetQueries,
  opts: Required<DeriveOptions>,
  notes: string[],
): Promise<TaxonomyGraph | null> {
  let why: string;
  try {
    const graph = await loadTaxonomyGraph(members, q, {
      maxConcepts: opts.maxGraphConcepts,
      descend: (id, g) => coverDescend(id, g) || refactorDescend(id, g),
      fallbackDescend: refactorDescend,
    });
    if (!('unavailable' in graph)) {
      if (graph.partial) {
        notes.push(
          `The IS-A subgraph is partial: below the set's roots and every candidate grouper it has more than ` +
            `${opts.maxGraphConcepts} concepts (maxGraphConcepts), so descendants were loaded only for greedy ` +
            "grouping's candidates, and hierarchy forms that need others were left out.",
        );
      }
      return graph;
    }
    why =
      graph.unavailable === 'parents'
        ? 'parents (the server does not return them in an expansion, property=parent)'
        : `${graph.unavailable} has more than ${opts.maxGraphConcepts} concepts`;
  } catch (error) {
    why = errorMessage(error);
  }
  notes.push(`Hierarchy candidates used per-query counts: ${why}.`);
  return null;
}

/**
 * Hierarchy candidates built and counted on the graph, best first by local
 * counts. Forms the graph cannot count (descendants not loaded) are left out.
 */
function graphCandidates(
  g: TaxonomyGraph,
  opts: Required<DeriveOptions>,
  notes: string[],
): (Built & { local: LocalCounts })[] {
  const ancestors = g.ancestors();
  // Earlier constructions win when two give the same form, so `cover` is
  // reported only when it differs from all the others.
  const built: { form: ClauseForm; construction: CandidateConstruction }[] = [
    ...rootsCandidates(g, opts, notes),
    ...bestSingles(g, ancestors, 3).map((form) => ({ form, construction: singleConstruction(form, g) })),
  ];
  if (opts.greedyGrouping) {
    const greedy = greedyGrouping(g, MAX_GREEDY_CLAUSES);
    built.push({
      form: greedy,
      construction: { kind: 'greedy-grouping', includes: greedy.includes, exclusions: greedy.exclusions },
    });
  }
  const cover = costCover(g, ancestors);
  built.push({ form: cover, construction: { kind: 'cover', ...cover } });

  const seen = new Set<string>();
  const candidates: (Built & { local: LocalCounts })[] = [];
  for (const { form, construction } of built) {
    const ecl = render(form);
    const key = formKey(ecl);
    if (seen.has(key)) continue;
    seen.add(key);
    const local = localScore(form, g);
    if (local) candidates.push({ ecl, construction, local });
  }
  return candidates.sort((a, b) =>
    byRank({ ecl: a.ecl, inputItself: false, ...a.local }, { ecl: b.ecl, inputItself: false, ...b.local }),
  );
}

/**
 * The graph candidates worth counting on the server: the best `maxCandidates`
 * by local counts (all of them under `within`, where local additions, counted
 * everywhere, do not rank them), less those that by local counts cost at least
 * as much as listing every member: they would lose to the input itself, and
 * can be long.
 */
/**
 * What the input itself costs, the candidate every result offers: the clauses
 * of an expression, or one clause per member of a list or reference set.
 */
function inputCost(input: DeriveInput, members: MemberSet): { clauses: number; what: string } {
  if ('ecl' in input) {
    const clauses = countClauses(stripTermsAndComments(input.ecl));
    return { clauses, what: `the ${clauses}-clause input expression` };
  }
  return { clauses: members.size, what: `listing the ${members.size} members` };
}

function worthCounting(
  candidates: (Built & { local: LocalCounts })[],
  input: { clauses: number; what: string },
  opts: Required<DeriveOptions>,
  notes: string[],
): Built[] {
  const taken = opts.within ? candidates : candidates.slice(0, opts.maxCandidates);
  const cost = (b: Built & { local: LocalCounts }) =>
    b.local.clauses + b.local.misses + (opts.within ? 0 : b.local.additions);
  const kept = taken.filter((b) => cost(b) < input.clauses);
  const skipped = taken.length - kept.length;
  if (skipped > 0) {
    notes.push(
      `${skipped} graph candidate${skipped === 1 ? ' was' : 's were'} not counted on the server: by local counts ` +
        `${skipped === 1 ? 'it costs' : 'each costs'} at least as much as ${input.what}.`,
    );
  }
  return kept;
}

/** A single clause from bestSingles, as an ancestor cover. */
function singleConstruction(form: ClauseForm, g: TaxonomyGraph): CandidateConstruction {
  const { conceptId, operator } = form.includes[0];
  return {
    kind: 'ancestor-cover',
    foci: [{ conceptId, operator: operator === '<' ? '<' : '<<', member: g.members.has(conceptId) }],
  };
}

/**
 * Candidate 1 on the graph: `<< roots` alone, and with its exact exclusions.
 * As on the per-query path, only the `maxExclusions` largest subtrees are
 * excluded as `<< x`; the concepts of the others are listed with the
 * non-members above members, and past `maxResidualLiterals` of those the cover
 * is offered with the subtrees alone, lossy.
 */
function rootsCandidates(
  g: TaxonomyGraph,
  opts: Required<DeriveOptions>,
  notes: string[],
): { form: ClauseForm; construction: CandidateConstruction }[] {
  const exact = rootsCover(g);
  const roots = exact.includes.map((c) => c.conceptId);
  const candidate = (exclusions: string[], literals: string[]) => ({
    form: {
      includes: exact.includes,
      exclusions: [
        ...exclusions.map((conceptId) => ({ conceptId, operator: '<<' as const })),
        ...literals.map((conceptId) => ({ conceptId, operator: '=' as const })),
      ],
    },
    construction: hierarchy(roots, exclusions, literals),
  });
  const plain = candidate([], []);
  if (exact.exclusions.length === 0) return [plain];

  const sized = exact.exclusions
    .filter((c) => c.operator === '<<')
    .map((c) => ({ x: c.conceptId, below: g.descendants(c.conceptId) }))
    .sort((a, b) => b.below.length - a.below.length || byId(a.x, b.x));
  const kept = sized.slice(0, opts.maxExclusions);
  const excluded = new Set(kept.flatMap((s) => s.below));
  const residual = new Set(exact.exclusions.filter((c) => c.operator === '=').map((c) => c.conceptId));
  for (const s of sized.slice(opts.maxExclusions)) for (const x of s.below) if (!excluded.has(x)) residual.add(x);
  const exclusions = kept.map((s) => s.x).sort(byId);
  const literals = [...residual].sort(byId);

  if (literals.length <= opts.maxResidualLiterals) return [plain, candidate(exclusions, literals)];
  notes.push(
    `No exact hierarchy cover within limits: after ${exclusions.length} subtree exclusions, ` +
      `${literals.length} non-members remain (maxResidualLiterals is ${opts.maxResidualLiterals}).`,
  );
  return exclusions.length ? [plain, candidate(exclusions, [])] : [plain];
}

async function hierarchyCandidates(
  roots: string[],
  rootTotal: number,
  members: MemberSet,
  q: SetQueries,
  opts: Required<DeriveOptions>,
  notes: string[],
): Promise<{ ecl: string; construction: CandidateConstruction }[]> {
  if (rootTotal > opts.maxRoots) {
    notes.push(
      `The set has ${rootTotal} roots (members with no ancestor in the set), more than maxRoots ` +
        `(${opts.maxRoots}), so it does not follow the IS-A hierarchy closely and no hierarchy ` +
        'candidates were built. Attribute refinements (issue #149 Part 3) may fit it better.',
    );
    return [];
  }
  const candidates = await hierarchyCover(roots, members, q, opts, notes);
  if (roots.length > opts.maxAncestorRoots) {
    notes.push(
      `Ancestor covers were skipped: ${roots.length} roots is more than maxAncestorRoots (${opts.maxAncestorRoots}).`,
    );
  } else {
    candidates.push(...(await ancestorCovers(roots, members, q, opts, notes)));
  }
  return candidates;
}

// ── Candidate 1: exact hierarchy cover ───────────────────────────────────

async function hierarchyCover(
  roots: string[],
  members: MemberSet,
  q: SetQueries,
  opts: Required<DeriveOptions>,
  notes: string[],
): Promise<{ ecl: string; construction: CandidateConstruction }[]> {
  const rootsEcl = roots.map((r) => `<< ${r}`).join(' OR ');
  const rootsOperand = orGroup(roots.map((r) => `<< ${r}`));
  const plain = { ecl: rootsEcl, construction: hierarchy(roots, [], []) };

  const over = await q.count({ include: [{ ecl: rootsEcl }], exclude: [members.clause] });
  if (over === 0) return [plain];

  // Maximal subtrees under the roots that hold no member: X = (<< R) MINUS (>> S),
  // and its top elements X MINUS < X. Each can go as one `MINUS << x`.
  const clean = `(${rootsOperand} MINUS (>> ${members.ecl}))`;
  const cleanTopsEcl = `${clean} MINUS < ${clean}`;
  // Every subtree left out of the exclusions leaves at least one non-member, so
  // with more than maxExclusions + maxResidualLiterals of them no exact cover
  // exists: only the lossy candidate is at stake, and fewer are sized for it.
  const cleanCount = await q.countEcl(cleanTopsEcl);
  const exactPossible = cleanCount <= opts.maxExclusions + opts.maxResidualLiterals;
  const cleanTops = await q.codes({ include: [{ ecl: cleanTopsEcl }] }, exactPossible ? MAX_SIZED : LOSSY_SIZED);
  if (cleanTops.total > cleanTops.codes.length) {
    notes.push(
      `${cleanTops.total} subtrees could be excluded; the largest were chosen from the first ` +
        `${cleanTops.codes.length} the server returned.`,
    );
  }
  const sized = await Promise.all(cleanTops.codes.map(async (x) => ({ x, size: await q.countEcl(`<< ${x}`) })));
  sized.sort((a, b) => b.size - a.size || byId(a.x, b.x));
  const exclusions = sized
    .slice(0, opts.maxExclusions)
    .map((s) => s.x)
    .sort(byId);

  const subtrees = orGroup(exclusions.map((x) => `<< ${x}`));
  const withSubtrees = exclusions.length ? `${rootsOperand} MINUS ${subtrees}` : rootsEcl;
  const residual = await q.codes(
    { include: [{ ecl: withSubtrees }], exclude: [members.clause] },
    opts.maxResidualLiterals + 1,
  );

  const candidates = [plain];
  if (residual.total === 0) {
    candidates.push({ ecl: withSubtrees, construction: hierarchy(roots, exclusions, []) });
  } else if (residual.total <= opts.maxResidualLiterals) {
    const all = [...exclusions.map((x) => `<< ${x}`), ...residual.codes];
    candidates.push({
      ecl: `${rootsOperand} MINUS ${orGroup(all)}`,
      construction: hierarchy(roots, exclusions, residual.codes),
    });
  } else {
    notes.push(
      `No exact hierarchy cover within limits: after ${exclusions.length} subtree exclusions, ` +
        `${residual.total} non-members remain (maxResidualLiterals is ${opts.maxResidualLiterals}).`,
    );
    if (exclusions.length) candidates.push({ ecl: withSubtrees, construction: hierarchy(roots, exclusions, []) });
  }
  return candidates;
}

function hierarchy(roots: string[], exclusions: string[], literalExclusions: string[]): CandidateConstruction {
  return { kind: 'hierarchy', roots, exclusions, literalExclusions };
}

// ── Candidate 2: ancestor covers ─────────────────────────────────────────

interface Focus {
  conceptId: string;
  operator: '<' | '<<';
  member: boolean;
  /** Indices into the roots array of the roots this clause covers. */
  covers: Set<number>;
  covered: number;
  additions: number;
}

async function ancestorCovers(
  roots: string[],
  members: MemberSet,
  q: SetQueries,
  opts: Required<DeriveOptions>,
  notes: string[],
): Promise<{ ecl: string; construction: CandidateConstruction }[]> {
  // With one root, its proper ancestors still give single-clause candidates (`< parent`).
  if (roots.length === 0) return [];

  const rootFoci: Focus[] = await Promise.all(
    roots.map(async (r, i) => {
      const size = await q.countEcl(`<< ${r}`);
      // A leaf root covers just itself; only a subtree needs counting against the set.
      const covered =
        size === 1 ? 1 : members.size - (await q.count({ include: [members.clause], exclude: [{ ecl: `<< ${r}` }] }));
      return {
        conceptId: r,
        operator: '<<' as const,
        member: true,
        covers: new Set([i]),
        covered,
        additions: size - covered,
      };
    }),
  );
  const ancestors = await rankAncestors(roots, rootFoci, q, opts.maxAncestorCandidates, notes);
  const ancestorFoci: Focus[] = await Promise.all(
    ancestors.map(async ({ a, covers, size }) => {
      const covered = members.size - (await q.count({ include: [members.clause], exclude: [{ ecl: `< ${a}` }] }));
      return { conceptId: a, operator: '<' as const, member: false, covers, covered, additions: size - covered };
    }),
  );

  const covers: Focus[][] = [];
  if (ancestorFoci.length > 0) {
    const chosen = greedyCover(roots.length, [...ancestorFoci, ...rootFoci]);
    if (chosen.some((f) => !f.member)) covers.push(chosen);
  }
  // Single clauses that cover the most members, misses and all.
  const singles = [...ancestorFoci, ...rootFoci]
    .sort((x, y) => y.covered - x.covered || x.additions - y.additions || byId(x.conceptId, y.conceptId))
    .slice(0, 3);
  for (const f of singles) covers.push([f]);

  return covers.map((foci) => {
    const sorted = [...foci].sort((x, y) => byId(x.conceptId, y.conceptId));
    return {
      ecl: sorted.map((f) => `${f.operator} ${f.conceptId}`).join(' OR '),
      construction: {
        kind: 'ancestor-cover',
        foci: sorted.map(({ conceptId, operator, member }) => ({ conceptId, operator, member })),
      },
    };
  });
}

/**
 * Proper ancestors of the roots worth an exact count, best first. Each one's
 * size is counted (a cheap query), and the members it covers are estimated from
 * the roots below it, so they can be ranked by cost per root covered: a parent
 * shared by two roots with few other children beats a broad grouper above them
 * all. The cheapest ancestor above every root is always kept, for the best
 * single-clause candidate. For each set of roots covered only the smallest
 * ancestor is kept, since it covers those roots with the fewest additions.
 */
async function rankAncestors(
  roots: string[],
  rootFoci: Focus[],
  q: SetQueries,
  max: number,
  notes: string[],
): Promise<{ a: string; covers: Set<number>; size: number }[]> {
  const coversByAncestor = new Map<string, Set<number>>();
  const ancestorLists = await Promise.all(roots.map((r) => q.codes({ include: [{ ecl: `> ${r}` }] }, 2000)));
  ancestorLists.forEach((list, i) => {
    for (const a of list.codes) {
      if (a === SNOMED_ROOT) continue;
      const covers = coversByAncestor.get(a) ?? new Set<number>();
      covers.add(i);
      coversByAncestor.set(a, covers);
    }
  });

  // Ancestors above the same roots differ only in how much else they add, and
  // the smallest is among the most specific of them: find those with one query
  // per group (`G MINUS > G`) rather than sizing every ancestor.
  const groups = new Map<string, { covers: Set<number>; ancestors: string[] }>();
  for (const [a, covers] of coversByAncestor) {
    if (roots.length > 1 && covers.size < 2) continue;
    const key = [...covers].sort((x, y) => x - y).join(',');
    const group = groups.get(key) ?? { covers, ancestors: [] };
    group.ancestors.push(a);
    groups.set(key, group);
  }
  let grouped = [...groups.values()];
  if (grouped.length > MAX_SIZED) {
    notes.push(`${grouped.length} sets of roots share ancestors; only the ${MAX_SIZED} narrowest were sized.`);
    // Fewest roots covered first: the specific parents are the ones a cheap cover needs.
    grouped.sort((x, y) => x.covers.size - y.covers.size || byId(x.ancestors[0], y.ancestors[0]));
    grouped = grouped.slice(0, MAX_SIZED);
  }
  const candidates = (
    await Promise.all(
      grouped.map(async ({ covers, ancestors }) => {
        const specific = ancestors.length === 1 ? ancestors : await mostSpecific(ancestors, q);
        const sized = await Promise.all(specific.map(async (a) => ({ a, covers, size: await q.countEcl(`< ${a}`) })));
        sized.sort((x, y) => x.size - y.size || byId(x.a, y.a));
        return sized.at(0);
      }),
    )
  ).filter((c): c is { a: string; covers: Set<number>; size: number } => c !== undefined);

  const estimatedCost = (c: { covers: Set<number>; size: number }) => {
    let covered = 0;
    for (const i of c.covers) covered += rootFoci[i].covered;
    return (1 + Math.max(0, c.size - covered)) / c.covers.size;
  };
  const ranked = candidates
    .map((c) => ({ c, cost: estimatedCost(c) }))
    .sort((x, y) => x.cost - y.cost || y.c.covers.size - x.c.covers.size || byId(x.c.a, y.c.a))
    .map(({ c }) => c);
  const chosen = ranked.slice(0, max);

  const widest = Math.max(0, ...candidates.map((c) => c.covers.size));
  const cheapestWidest = candidates
    .filter((c) => c.covers.size === widest)
    .sort((x, y) => x.size - y.size || byId(x.a, y.a))
    .at(0);
  if (cheapestWidest && !chosen.includes(cheapestWidest)) chosen.push(cheapestWidest);
  return chosen;
}

/** The concepts in `ids` with no descendant among them. */
async function mostSpecific(ids: string[], q: SetQueries): Promise<string[]> {
  const group = orGroup(ids);
  return (await q.codes({ include: [{ ecl: `${group} MINUS > ${group}` }] }, 10)).codes;
}

/** Greedy weighted set cover over the roots: repeatedly take the cheapest clause per newly covered root. */
function greedyCover(rootCount: number, foci: Focus[]): Focus[] {
  const uncovered = new Set(Array.from({ length: rootCount }, (_, i) => i));
  const chosen: Focus[] = [];
  while (uncovered.size > 0) {
    let best: { f: Focus; ratio: number; gain: number } | null = null;
    for (const f of foci) {
      const gain = [...f.covers].filter((i) => uncovered.has(i)).length;
      if (gain === 0) continue;
      const ratio = (1 + f.additions) / gain;
      if (!best || isBetter(ratio, gain, f.conceptId, best)) best = { f, ratio, gain };
    }
    if (!best) break;
    chosen.push(best.f);
    for (const i of best.f.covers) uncovered.delete(i);
  }
  return chosen;
}

function isBetter(ratio: number, gain: number, conceptId: string, best: { f: Focus; ratio: number; gain: number }) {
  if (ratio !== best.ratio) return ratio < best.ratio;
  if (gain !== best.gain) return gain > best.gain;
  return byId(conceptId, best.f.conceptId) < 0;
}

// ── Scoring ──────────────────────────────────────────────────────────────

/**
 * A candidate before scoring; `known` when its score needs no server (the input
 * itself), `local` when it was counted on the graph.
 */
interface Built {
  ecl: string;
  construction: CandidateConstruction;
  known?: Omit<Scored, 'ecl' | 'construction'>;
  local?: LocalCounts;
}

interface LocalCounts {
  additions: number;
  misses: number;
  clauses: number;
}

/** What ranking looks at. */
interface Ranked {
  ecl: string;
  clauses: number;
  additions: number;
  misses: number;
  inputItself: boolean;
}

/**
 * Cost = clauses + additions + misses, then exact first; on a tie a derived
 * definition goes before the input itself, then the shorter text.
 */
function byRank(a: Ranked, b: Ranked): number {
  const exact = (r: Ranked) => r.additions === 0 && r.misses === 0;
  return (
    a.clauses + a.additions + a.misses - (b.clauses + b.additions + b.misses) ||
    Number(exact(b)) - Number(exact(a)) ||
    Number(a.inputItself) - Number(b.inputItself) ||
    a.ecl.length - b.ecl.length ||
    compareText(a.ecl, b.ecl)
  );
}

/** Scores each distinct candidate against the set, on the server. */
class Scorer {
  readonly scored: Scored[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly members: MemberSet,
    private readonly q: SetQueries,
    private readonly opts: Required<DeriveOptions>,
    private readonly notes: string[],
  ) {}

  /**
   * Score a few at a time (the queries are throttled anyway); `enough` stops
   * after the batch in which a good enough candidate turned up.
   */
  async score(candidates: Built[], enough?: (s: Scored) => boolean): Promise<void> {
    const fresh = candidates.filter((b) => {
      const key = formKey(b.ecl);
      if (this.seen.has(key)) return false;
      this.seen.add(key);
      return true;
    });
    for (let i = 0; i < fresh.length; i += SCORE_BATCH) {
      const settled = await Promise.allSettled(fresh.slice(i, i + SCORE_BATCH).map((b) => this.one(b)));
      // A candidate the server cannot count in time is dropped, not the whole result.
      const batch: Scored[] = [];
      settled.forEach((r, j) => {
        if (r.status === 'rejected') {
          this.notes.push(`Could not score ${fresh[i + j].ecl.slice(0, 120)}: ${errorMessage(r.reason)}`);
          return;
        }
        this.checkLocal(fresh[i + j], r.value);
        batch.push(r.value);
      });
      this.scored.push(...batch);
      if (enough && batch.some(enough)) return;
    }
  }

  private async one(b: Built): Promise<Scored> {
    const s = b.known
      ? { ...b.known, clauses: countClauses(b.ecl) }
      : await compare(b.ecl, this.members, this.q, this.opts.sampleSize, this.opts.within);
    return { ecl: b.ecl, construction: b.construction, ...s };
  }

  /** Say so when the server's counts differ from the graph's, which chose what to count. */
  private checkLocal(b: Built, s: Scored): void {
    // With `within`, the server counts only part of the additions.
    if (!b.local || this.opts.within) return;
    if (b.local.additions === s.additions.count && b.local.misses === s.misses.count) return;
    this.notes.push(
      `Local counts for ${s.ecl.slice(0, 120)} differed from the server's ` +
        `(+${b.local.additions} -${b.local.misses} locally, +${s.additions.count} -${s.misses.count} on the server); ` +
        "candidates were chosen for checking by local counts and ranked by the server's.",
    );
  }
}

interface Scored {
  ecl: string;
  construction: CandidateConstruction;
  covered: number;
  additions: SetDifference;
  misses: SetDifference;
  exact: boolean;
  clauses: number;
}

function rankOf(s: Scored): Ranked {
  return {
    ecl: s.ecl,
    clauses: s.clauses,
    additions: s.additions.count,
    misses: s.misses.count,
    inputItself: isInputItself(s),
  };
}

/** The enumeration, refset or expression given: on a tie, a derived definition says more. */
function isInputItself(s: Scored): boolean {
  return (
    s.construction.kind === 'enumeration' || s.construction.kind === 'refset' || s.construction.kind === 'expression'
  );
}

/** The score of a candidate that is the input itself; `clauses` is set from its ECL by the caller. */
function exactScore(size: number): Omit<Scored, 'ecl' | 'construction'> {
  return {
    covered: size,
    additions: { count: 0, sample: [] },
    misses: { count: 0, sample: [] },
    exact: true,
    clauses: 0,
  };
}

/** Additions and misses of `ecl` against the set, counted and sampled by the server. */
async function compare(
  ecl: string,
  members: MemberSet,
  q: SetQueries,
  sampleSize: number,
  within: string,
): Promise<Omit<Scored, 'ecl' | 'construction'>> {
  // With `within`, only what the candidate adds inside that expression counts.
  const counted = within ? `(${ecl}) AND (${within})` : ecl;
  const [additions, misses] = await Promise.all([
    q.sample({ include: [{ ecl: counted }], exclude: [members.clause] }, sampleSize),
    q.sample({ include: [members.clause], exclude: [{ ecl }] }, sampleSize),
  ]);
  return {
    covered: members.size - misses.count,
    additions,
    misses,
    exact: additions.count === 0 && misses.count === 0,
    clauses: countClauses(ecl),
  };
}

// ── Presentation ─────────────────────────────────────────────────────────

export async function displayTerms(
  candidates: { ecl: string; clauses: number }[],
  terminology: ITerminologyService,
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const c of candidates) {
    if (c.clauses > MAX_DECORATED_CLAUSES) continue;
    for (const id of c.ecl.match(/\b\d{6,18}\b/g) ?? []) ids.add(id);
  }
  const terms = new Map<string, string>();
  if (ids.size === 0) return terms;
  const infos = await terminology.validateConcepts([...ids].sort(byId));
  for (const [id, info] of infos) if (info?.pt) terms.set(id, info.pt);
  return terms;
}

/** Add display terms and format, unless the candidate is too long to be worth it. */
export function decorate(ecl: string, terms: Map<string, string>): string {
  if (countClauses(ecl) > MAX_DECORATED_CLAUSES) return ecl;
  const withTerms = ecl.replace(/\b\d{6,18}\b/g, (id) => {
    const term = terms.get(id);
    return term ? `${id} |${term.replace(/\|/g, '')}|` : id;
  });
  return formatDocument(withTerms, defaultFormattingOptions).trim();
}

// ── Text helpers for clients ─────────────────────────────────────────────

/**
 * The concept ids in a pasted code list, in order: one per line, comma or tab
 * separated, or `id |term|` / `id,term` rows. Any run of 6-18 digits counts, so
 * a header row or terms are skipped; numbers inside terms are rare but possible,
 * and `deriveEcl` reports any that are not concepts.
 */
export function parseConceptIdList(text: string): string[] {
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    // Only the first id-like token on a line, so `code,term with 123456 in it` stays one concept.
    const first = /(?<![\d.])\d{6,18}(?![\d.])/.exec(line.replace(/\|[^|]*\|/g, ''));
    if (first) ids.push(first[0]);
  }
  return ids;
}

/** A plain-text report of a {@link DeriveResult}, for an output channel or a chat message. */
export function formatDeriveReport(result: DeriveResult): string {
  const lines: string[] = [];
  const { input } = result;
  const duplicates = input.duplicates ? ` (${plural(input.duplicates, 'duplicate')} ignored)` : '';
  lines.push(`Members: ${input.members} of ${input.given} distinct ids${duplicates}`);
  const leftOut: [string, string[]][] = [
    ['Inactive (left out)', input.inactive],
    ['Unknown to the server (left out)', input.unknown],
    ['Not concept ids (left out)', input.malformed],
  ];
  for (const [label, ids] of leftOut) {
    const more = ids.length > 20 ? ', …' : '';
    if (ids.length) lines.push(`${label}: ${ids.slice(0, 20).join(', ')}${more}`);
  }
  if (result.hierarchies.length) {
    const counts = result.hierarchies.map((h) => `${h.display} ${h.count}`);
    lines.push(`Hierarchies: ${counts.join(', ')}`);
  }
  lines.push(`Roots (members with no ancestor in the set): ${result.roots}`);
  for (const note of result.notes) lines.push(`Note: ${note}`);

  result.candidates.forEach((c, i) => {
    const status = c.exact ? 'exact' : `+${c.additions.count} added, -${c.misses.count} missed`;
    lines.push('', `${i + 1}. ${status}; ${plural(c.clauses, 'clause')}; ${c.construction.kind}`);
    lines.push(...c.expression.split('\n').map((l) => `   ${l}`));
    const sample = (label: string, d: SetDifference) => {
      if (d.count === 0) return;
      const shown = d.sample.map((s) => `${s.code} |${s.display}|`).join(', ');
      lines.push(`   ${label} (${d.count}): ${shown}${d.count > d.sample.length ? ', …' : ''}`);
    };
    sample('Adds', c.additions);
    sample('Misses', c.misses);
  });
  return lines.join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
