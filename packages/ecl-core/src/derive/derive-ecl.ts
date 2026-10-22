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
// Candidates, all built from the IS-A hierarchy:
//
//   1. Exact hierarchy cover. Take the set's roots R (members with no ancestor
//      in the set) as `<< r`, remove the over-inclusion with `MINUS << x` over
//      the largest subtrees that contain no member, then remove what is left
//      as literal ids. Exact when the literal residue is small enough.
//      (The same shape as `sct ecl compress`, written from its published
//      description.)
//
//   2. Ancestor covers. Ancestors of the roots are not members, so `< a` can
//      replace several `<< r` at the cost of the non-members under `a`. A greedy
//      weighted set cover over the roots, cost = 1 + additions per clause,
//      gives a short cover; the best single ancestors are offered too, with
//      whatever they miss.
//
//   3. The input itself: the enumeration (`a OR b OR …`) or `^ refset`, which is
//      always exact, so a caller is never forced to accept a lossy candidate.
//
// Ranking is by cost = clauses + additions + misses. The same input and
// terminology version give the same output, whatever the input order.

import { formatDocument } from '../formatter/formatter';
import { defaultFormattingOptions } from '../formatter/options';
import type { EvaluationConcept, ITerminologyService, ValueSetClause, ValueSetCompose } from '../terminology/types';
import { isValidConceptId } from '../terminology/verhoeff';

// ── Public types ─────────────────────────────────────────────────────────

/** The set to derive ECL for: an enumerated list of concept ids, or a reference set's members. */
export type DeriveInput = { conceptIds: string[] } | { refsetId: string };

export interface DeriveOptions {
  /** Above this many roots, hierarchy candidates are skipped as not compact. Default 200. */
  maxRoots?: number;
  /** Most `MINUS << x` subtree exclusions in an exact hierarchy cover. Default 32. */
  maxExclusions?: number;
  /** Most literal ids the exact cover may exclude before it is reported as lossy instead. Default 50. */
  maxResidualLiterals?: number;
  /** Above this many roots, ancestor covers are skipped (they cost a query per root). Default 50. */
  maxAncestorRoots?: number;
  /** Most ancestors whose counts are fetched for ancestor covers. Default 30. */
  maxAncestorCandidates?: number;
  /** Concepts returned in each additions/misses sample. Default 10. */
  sampleSize?: number;
  /** Most candidates returned. Default 8. */
  maxCandidates?: number;
  /** Leave display terms out of `expression`. Default false. */
  omitTerms?: boolean;
}

export interface SetDifference {
  count: number;
  /** Up to `sampleSize` of the concepts, as the server returned them. */
  sample: EvaluationConcept[];
}

/** How a candidate was built, so a caller can explain it. */
export type CandidateConstruction =
  | { kind: 'enumeration'; members: number }
  | { kind: 'refset'; refsetId: string }
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
};

const SNOMED_ROOT = '138875005';
/** Ontoserver returns at most this many concepts per page, whatever `count` asks for. */
const PAGE_SIZE = 50_000;
/** Above this many concept references, candidates are not formatted or given terms. */
const MAX_DECORATED_CLAUSES = 200;

/** Numeric order for SCTIDs, so output does not depend on input or server order. */
function byId(a: string, b: string): number {
  return a.length - b.length || compareText(a, b);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** `x` alone, or `(x OR y …)` — safe as an operand anywhere. */
function orGroup(terms: string[]): string {
  return terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`;
}

function countClauses(ecl: string): number {
  return ecl.match(/\b\d{6,18}\b/g)?.length ?? 0;
}

type ExpandCompose = NonNullable<ITerminologyService['expandCompose']>;

/** The set under study, as a compose clause and as an ECL operand. */
interface MemberSet {
  clause: ValueSetClause;
  ecl: string;
  size: number;
}

class SetQueries {
  constructor(private readonly expand: ExpandCompose) {}

  async count(compose: ValueSetCompose): Promise<number> {
    return (await this.expand(compose, { count: 0 })).total;
  }

  async sample(compose: ValueSetCompose, count: number): Promise<SetDifference> {
    const r = await this.expand(compose, { count });
    return { count: r.total, sample: r.concepts };
  }

  /** Up to `max` codes of the set, sorted, plus the set's exact total. */
  async codes(compose: ValueSetCompose, max: number, activeOnly = true): Promise<{ codes: string[]; total: number }> {
    const codes: string[] = [];
    let total = 0;
    for (let offset = 0; codes.length < max;) {
      const r = await this.expand(compose, { count: Math.min(PAGE_SIZE, max - codes.length), offset, activeOnly });
      total = r.total;
      if (r.concepts.length === 0) break;
      for (const c of r.concepts) codes.push(c.code);
      offset += r.concepts.length;
      if (offset >= total) break;
    }
    codes.sort(byId);
    return { codes, total };
  }

  countEcl(ecl: string): Promise<number> {
    return this.count({ include: [{ ecl }] });
  }
}

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
  const q = new SetQueries(terminology.expandCompose.bind(terminology));
  const notes: string[] = [];

  const { report, members } = await resolveInput(input, q);
  const result: DeriveResult = { input: report, hierarchies: [], roots: 0, candidates: [], notes };
  if (!members) {
    notes.push('The input has no active concepts the server knows, so there is nothing to derive.');
    return result;
  }

  result.hierarchies = await hierarchyDistribution(members, q);

  const rootQuery = await q.codes(
    { include: [members.clause], exclude: [{ ecl: `< ${members.ecl}` }] },
    opts.maxRoots + 1,
  );
  result.roots = rootQuery.total;
  const roots = rootQuery.codes;

  const built: { ecl: string; construction: CandidateConstruction; known?: Omit<Scored, 'ecl' | 'construction'> }[] =
    [];

  if ('refsetId' in input) {
    built.push({
      ecl: `^ ${input.refsetId}`,
      construction: { kind: 'refset', refsetId: input.refsetId },
      known: exactScore(members.size),
    });
  } else {
    built.push({
      ecl: members.ecl,
      construction: { kind: 'enumeration', members: members.size },
      known: exactScore(members.size),
    });
  }

  if (result.roots > opts.maxRoots) {
    notes.push(
      `The set has ${result.roots} roots (members with no ancestor in the set), more than maxRoots ` +
        `(${opts.maxRoots}), so it does not follow the IS-A hierarchy closely and no hierarchy ` +
        'candidates were built. Attribute refinements (issue #149 Part 3) may fit it better.',
    );
  } else {
    built.push(...(await hierarchyCover(roots, members, q, opts, notes)));
    if (roots.length > opts.maxAncestorRoots) {
      notes.push(
        `Ancestor covers were skipped: ${roots.length} roots is more than maxAncestorRoots (${opts.maxAncestorRoots}).`,
      );
    } else {
      built.push(...(await ancestorCovers(roots, members, q, opts)));
    }
  }

  // Score each distinct candidate against the set, on the server.
  const seen = new Set<string>();
  const scored: Scored[] = [];
  for (const b of built) {
    if (seen.has(b.ecl)) continue;
    seen.add(b.ecl);
    const score = b.known
      ? { ...b.known, clauses: countClauses(b.ecl) }
      : await compare(b.ecl, members, q, opts.sampleSize);
    scored.push({ ecl: b.ecl, construction: b.construction, ...score });
  }

  scored.sort(
    (a, b) =>
      a.clauses + a.additions.count + a.misses.count - (b.clauses + b.additions.count + b.misses.count) ||
      Number(b.exact) - Number(a.exact) ||
      Number(isInputItself(a)) - Number(isInputItself(b)) ||
      a.ecl.length - b.ecl.length ||
      compareText(a.ecl, b.ecl),
  );
  const top = scored.slice(0, opts.maxCandidates);

  const terms = opts.omitTerms ? new Map<string, string>() : await displayTerms(top, terminology);
  result.candidates = top.map((s) => ({ expression: decorate(s.ecl, terms), ...s }));
  return result;
}

// ── Input ────────────────────────────────────────────────────────────────

async function resolveInput(
  input: DeriveInput,
  q: SetQueries,
): Promise<{ report: DeriveInputReport; members: MemberSet | null }> {
  if ('refsetId' in input) {
    const refsetId = input.refsetId.trim();
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
    if (report.members === 0) report.unknown.push(refsetId);
    return { report, members: report.members ? { clause: { ecl }, ecl, size: report.members } : null };
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

async function hierarchyDistribution(
  members: MemberSet,
  q: SetQueries,
): Promise<{ conceptId: string; display: string; count: number }[]> {
  const tops = await q.sample({ include: [{ ecl: `<! ${SNOMED_ROOT}` }] }, 100);
  const counts = await Promise.all(
    tops.sample.map(async (top) => ({
      conceptId: top.code,
      display: top.display,
      count: members.size - (await q.count({ include: [members.clause], exclude: [{ ecl: `<< ${top.code}` }] })),
    })),
  );
  return counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count || byId(a.conceptId, b.conceptId));
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
  const cleanTops = await q.codes(
    { include: [{ ecl: `${clean} MINUS < ${clean}` }] },
    Math.max(opts.maxExclusions * 4, 100),
  );
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
): Promise<{ ecl: string; construction: CandidateConstruction }[]> {
  // With one root, its proper ancestors still give single-clause candidates (`< parent`).
  if (roots.length === 0) return [];

  const ancestors = await mostSpecificAncestors(roots, q, opts.maxAncestorCandidates);
  const ancestorFoci: Focus[] = await Promise.all(
    ancestors.map(async ({ a, covers, size }) => {
      const covered = members.size - (await q.count({ include: [members.clause], exclude: [{ ecl: `< ${a}` }] }));
      return { conceptId: a, operator: '<' as const, member: false, covers, covered, additions: size - covered };
    }),
  );
  const rootFoci: Focus[] = await Promise.all(
    roots.map(async (r, i) => {
      const size = await q.countEcl(`<< ${r}`);
      const covered = members.size - (await q.count({ include: [members.clause], exclude: [{ ecl: `<< ${r}` }] }));
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
 * Proper ancestors of the roots that sit above two or more of them, ranked by
 * roots covered. For each set of roots covered only the most specific ancestor
 * (fewest descendants) is kept: it covers the same members with fewer additions.
 */
async function mostSpecificAncestors(
  roots: string[],
  q: SetQueries,
  max: number,
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

  const ranked = [...coversByAncestor.entries()]
    .filter(([, covers]) => roots.length === 1 || covers.size >= 2)
    .sort(([a, ca], [b, cb]) => cb.size - ca.size || byId(a, b))
    .slice(0, max * 4);
  const sizes = await Promise.all(ranked.map(([a]) => q.countEcl(`< ${a}`)));
  const bestPerRootSet = new Map<string, { a: string; covers: Set<number>; size: number }>();
  ranked.forEach(([a, covers], i) => {
    const key = [...covers].sort((x, y) => x - y).join(',');
    const prev = bestPerRootSet.get(key);
    if (!prev || sizes[i] < prev.size || (sizes[i] === prev.size && byId(a, prev.a) < 0)) {
      bestPerRootSet.set(key, { a, covers, size: sizes[i] });
    }
  });
  return [...bestPerRootSet.values()]
    .sort((x, y) => y.covers.size - x.covers.size || x.size - y.size || byId(x.a, y.a))
    .slice(0, max);
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

interface Scored {
  ecl: string;
  construction: CandidateConstruction;
  covered: number;
  additions: SetDifference;
  misses: SetDifference;
  exact: boolean;
  clauses: number;
}

/** The enumeration or the refset: on a tie, a derived definition says more. */
function isInputItself(s: Scored): boolean {
  return s.construction.kind === 'enumeration' || s.construction.kind === 'refset';
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
): Promise<Omit<Scored, 'ecl' | 'construction'>> {
  const [additions, misses] = await Promise.all([
    q.sample({ include: [{ ecl }], exclude: [members.clause] }, sampleSize),
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

async function displayTerms(candidates: Scored[], terminology: ITerminologyService): Promise<Map<string, string>> {
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
function decorate(ecl: string, terms: Map<string, string>): string {
  if (countClauses(ecl) > MAX_DECORATED_CLAUSES) return ecl;
  const withTerms = ecl.replace(/\b\d{6,18}\b/g, (id) => {
    const term = terms.get(id);
    return term ? `${id} |${term.replace(/\|/g, '')}|` : id;
  });
  return formatDocument(withTerms, defaultFormattingOptions).trim();
}
