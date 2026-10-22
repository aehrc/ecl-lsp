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

import { canonicalise } from '../canonical/comparator';
import { parseECL } from '../parser';
import { NodeType, type SubExpressionNode } from '../parser/ast';
import { formatDocument } from '../formatter/formatter';
import { defaultFormattingOptions } from '../formatter/options';
import type {
  DefiningRelationship,
  EvaluationConcept,
  ITerminologyService,
  ValueSetClause,
  ValueSetCompose,
} from '../terminology/types';
import { isValidConceptId } from '../terminology/verhoeff';

// ── Public types ─────────────────────────────────────────────────────────

/** The set to derive ECL for: an enumerated list of concept ids, or a reference set's members. */
/**
 * The set to derive ECL for: an enumerated list of concept ids, a reference
 * set's members, or the concepts an ECL expression selects (to find a shorter
 * form of it, issue #149).
 */
export type DeriveInput = { conceptIds: string[] } | { refsetId: string } | { ecl: string };

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
  /**
   * Attribute refinement candidates (`focus : attribute = value`):
   * `'auto'` builds them when the set has more than 20 roots, i.e. it cuts
   * across the IS-A hierarchy. Default `'auto'`. Needs `getDefiningRelationships`.
   */
  refinements?: 'auto' | 'always' | 'never';
  /**
   * The focus for refinement candidates, e.g. `^ 929360081000036101` for AMT
   * MPUUs. Default: `<<` the most specific concept above every member.
   */
  refinementFocus?: string;
  /** Count members by top-level hierarchy (about 20 requests). Default true. */
  hierarchySummary?: boolean;
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
      /** Each attribute and the value expression it must match, all required. */
      attributes: { attribute: string; value: string }[];
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
};

const SNOMED_ROOT = '138875005';
/** Ontoserver returns at most this many concepts per page, whatever `count` asks for. */
const PAGE_SIZE = 50_000;
/** Above this many concept references, candidates are not formatted or given terms. */
const MAX_DECORATED_CLAUSES = 200;
/** Concurrent set queries; see {@link SetQueries}. */
const MAX_IN_FLIGHT = 8;
/** With `refinements: 'auto'`, refinement candidates are built above this many roots. */
const REFINEMENT_ROOTS = 20;
/** Members whose relationships are read to find the attributes the set shares. */
const REFINEMENT_SAMPLE = 20;
/** Up to this many distinct values, the values themselves are a value option. */
const MAX_LITERAL_VALUES = 5;
/** Value expressions tried per attribute. */
const VALUE_CANDIDATES = 3;
/** Most attributes tried, those most often present in the sample first. */
const MAX_REFINEMENT_ATTRIBUTES = 6;
/** Most subtree tops (for exclusions) or ancestors (for covers) whose size is counted. */
const MAX_SIZED = 500;

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

/**
 * `ecl` without display terms and comments, so candidates built from it can be
 * given terms afresh and their concept references counted. Quoted strings
 * (filter values) are kept as they are.
 */
export function stripTermsAndComments(ecl: string): string {
  return ecl
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\|[^|]*\|/g, (m) => (m.startsWith('"') ? m : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function countClauses(ecl: string): number {
  return ecl.match(/\b\d{6,18}\b/g)?.length ?? 0;
}

type ExpandCompose = NonNullable<ITerminologyService['expandCompose']>;

/** The set under study, as a compose clause and as an ECL operand. */
interface MemberSet {
  clause: ValueSetClause;
  ecl: string;
  size: number;
}

/**
 * Set queries against the server. At most {@link MAX_IN_FLIGHT} run at once:
 * many carry the whole member list, and the service may not queue them itself.
 */
class SetQueries {
  private inFlight = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly expandCompose: ExpandCompose) {}

  private async expand(...args: Parameters<ExpandCompose>): ReturnType<ExpandCompose> {
    if (this.inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.inFlight++;
    try {
      return await this.expandCompose(...args);
    } finally {
      this.inFlight--;
      this.waiting.shift()?.();
    }
  }

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

  const { report, members } = await resolveInput(input, q, terminology, notes);
  const result: DeriveResult = { input: report, hierarchies: [], roots: 0, candidates: [], notes };
  if (!members) {
    if (notes.length === 0) {
      notes.push('The input has no active concepts the server knows, so there is nothing to derive.');
    }
    return result;
  }

  if (opts.hierarchySummary) result.hierarchies = await hierarchyDistribution(members, q);

  const rootQuery = await q.codes(
    { include: [members.clause], exclude: [{ ecl: `< ${members.ecl}` }] },
    opts.maxRoots + 1,
  );
  result.roots = rootQuery.total;
  const roots = rootQuery.codes;

  const built: { ecl: string; construction: CandidateConstruction; known?: Omit<Scored, 'ecl' | 'construction'> }[] =
    [];
  built.push(...(await hierarchyCandidates(roots, result.roots, members, q, opts, notes)));
  if (opts.refinements === 'always' || (opts.refinements === 'auto' && result.roots > REFINEMENT_ROOTS)) {
    const foci = opts.refinementFocus ? [asFocus(opts.refinementFocus)] : refsetFoci(input);
    built.push(...(await refinementCandidates(members, foci, q, terminology, opts, notes)));
  }
  // The input itself goes last, so a derived candidate that rebuilds it keeps its construction.
  built.push(inputItself(input, members));

  // Score each distinct candidate against the set, on the server.
  const seen = new Set<string>();
  const scored: Scored[] = [];
  for (const b of built) {
    const key = formKey(b.ecl);
    if (seen.has(key)) continue;
    seen.add(key);
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

// ── Hierarchy candidates ─────────────────────────────────────────────────

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
  const cleanTops = await q.codes({ include: [{ ecl: `${clean} MINUS < ${clean}` }] }, MAX_SIZED);
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

  let shared = [...coversByAncestor.entries()].filter(([, covers]) => roots.length === 1 || covers.size >= 2);
  if (shared.length > MAX_SIZED) {
    notes.push(`${shared.length} ancestors are shared by the roots; only the ${MAX_SIZED} most specific were sized.`);
    // Fewest roots covered first: the specific parents are the ones a cheap cover needs.
    shared.sort(([a, ca], [b, cb]) => ca.size - cb.size || byId(a, b));
    shared = shared.slice(0, MAX_SIZED);
  }
  const sizes = await Promise.all(shared.map(([a]) => q.countEcl(`< ${a}`)));

  const bestPerRootSet = new Map<string, { a: string; covers: Set<number>; size: number }>();
  shared.forEach(([a, covers], i) => {
    const key = [...covers].sort((x, y) => x - y).join(',');
    const prev = bestPerRootSet.get(key);
    if (!prev || sizes[i] < prev.size || (sizes[i] === prev.size && byId(a, prev.a) < 0)) {
      bestPerRootSet.set(key, { a, covers, size: sizes[i] });
    }
  });
  const candidates = [...bestPerRootSet.values()];

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

// ── Candidate 3: attribute refinements (issue #149 Part 3) ───────────────
//
// A set that cuts across the hierarchy can still share an attribute value:
// every AMT product with a given dose form, say. Read the relationships of a
// sample of members to find the attributes most of them carry; for each, ask
// the server for the values members have (`S . attribute`) and compress those
// with the IS-A candidates above; then offer `focus : attribute = values`, and
// conjunctions of the two or three commonest attributes. The server counts
// what each adds and misses, as for every other candidate.

async function refinementCandidates(
  members: MemberSet,
  givenFoci: string[],
  q: SetQueries,
  terminology: ITerminologyService,
  opts: Required<DeriveOptions>,
  notes: string[],
): Promise<{ ecl: string; construction: CandidateConstruction }[]> {
  const getRelationships = terminology.getDefiningRelationships?.bind(terminology);
  if (!getRelationships) {
    notes.push('Refinement candidates need a terminology service with getDefiningRelationships.');
    return [];
  }

  const sample = (await q.codes({ include: [members.clause] }, REFINEMENT_SAMPLE)).codes;
  const sampled: (DefiningRelationship[] | null)[] = [];
  for (let i = 0; i < sample.length; i += MAX_IN_FLIGHT) {
    sampled.push(...(await Promise.all(sample.slice(i, i + MAX_IN_FLIGHT).map((m) => getRelationships(m)))));
  }
  const attributes = sharedAttributes(sampled);
  if (attributes.length === 0) {
    notes.push('No attribute is shared by most members, so no refinement candidates were built.');
    return [];
  }

  const foci = [...givenFoci];
  if (!opts.refinementFocus) {
    const ancestor = await commonAncestorFocus(members, sample[0], q);
    if (ancestor) foci.push(ancestor);
  }
  if (foci.length === 0) return [];

  const values = new Map<string, string[]>();
  for (const attribute of attributes) {
    const options = await valueOptions(members, attribute, q, terminology, opts);
    if (options.length > 0) values.set(attribute, options);
  }

  const refinements = refinementSets(
    attributes.filter((a) => values.has(a)),
    values,
  );
  return foci.flatMap((focus) =>
    refinements.map((refinement) => ({
      ecl: `${focus} : ${refinement.map(attributeText).join(', ')}`,
      construction: { kind: 'refinement' as const, focus, attributes: refinement },
    })),
  );
}

/**
 * Value expressions for one attribute: the best IS-A candidates for the values
 * members carry, with no refinements of their own. Lossy ones are kept too: a
 * value no member uses changes nothing inside the refinement, so `<< Tablet`
 * can be exact there where the value set itself needs exclusions. The input
 * echo (`S . attribute`) would only restate the set, so it is skipped.
 */
async function valueOptions(
  members: MemberSet,
  attribute: string,
  q: SetQueries,
  terminology: ITerminologyService,
  opts: Required<DeriveOptions>,
): Promise<string[]> {
  const derived = await deriveEcl({ ecl: `${members.ecl} . ${attribute}` }, terminology, {
    ...opts,
    refinements: 'never',
    hierarchySummary: false,
    omitTerms: true,
    maxCandidates: 20,
  });
  const usableValues = derived.candidates.filter((c) => c.construction.kind !== 'expression');
  // The plain roots cover (`<< r`, no exclusions) ranks low as a value set when
  // many values go unused, but is often what the refinement needs.
  const plainRoots = usableValues.find(
    (c) =>
      c.construction.kind === 'hierarchy' &&
      c.construction.exclusions.length === 0 &&
      c.construction.literalExclusions.length === 0 &&
      c.construction.roots.length <= 5,
  );
  const chosen = [...new Set([plainRoots, ...usableValues.slice(0, VALUE_CANDIDATES)])].filter(
    (c): c is DeriveCandidate => c !== undefined,
  );
  const options = chosen.map((c) => (isSingleClause(c.ecl) ? c.ecl : `(${c.ecl})`));
  // A handful of values is also worth offering as they are.
  const literal = await q.codes({ include: [{ ecl: `${members.ecl} . ${attribute}` }] }, MAX_LITERAL_VALUES + 1);
  if (literal.total > 0 && literal.total <= MAX_LITERAL_VALUES) options.push(orGroup(literal.codes));
  return options;
}

/**
 * Reference sets an ECL input is restricted to (`^ R : …`, `^ R AND …`): a
 * natural focus for refinements, such as an AMT product level.
 */
function refsetFoci(input: DeriveInput): string[] {
  if (!('ecl' in input)) return [];
  const ast = parseECL(input.ecl).ast;
  if (!ast) return [];
  const expr = ast.expression;
  let operands: SubExpressionNode[] = [];
  if (expr.type === NodeType.RefinedExpression) operands = [expr.expression];
  else if (expr.type === NodeType.SubExpressionConstraint) operands = [expr];
  else if (expr.type === NodeType.CompoundExpression && expr.operator.operator === 'AND') operands = expr.operands;
  return operands
    .filter((o) => o.memberOf && !o.operator && o.focus.type === NodeType.ConceptReference)
    .map((o) => `^ ${(o.focus as { conceptId: string }).conceptId}`);
}

/** Attributes at least half the sampled members carry, commonest first. */
function sharedAttributes(sampled: (DefiningRelationship[] | null)[]): string[] {
  const seen = new Map<string, number>();
  for (const relationships of sampled) {
    for (const type of new Set((relationships ?? []).map((r) => r.type))) seen.set(type, (seen.get(type) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, n]) => n * 2 >= sampled.length)
    .sort(([a, x], [b, y]) => y - x || byId(a, b))
    .slice(0, MAX_REFINEMENT_ATTRIBUTES)
    .map(([type]) => type);
}

/** Each attribute with each of its value options, then pairs of the three commonest with their best values. */
function refinementSets(usable: string[], values: Map<string, string[]>): { attribute: string; value: string }[][] {
  const sets: { attribute: string; value: string }[][] = [];
  for (const attribute of usable) {
    for (const value of values.get(attribute) ?? []) sets.push([{ attribute, value }]);
  }
  const best = (attribute: string) => ({ attribute, value: values.get(attribute)?.[0] ?? '*' });
  const commonest = usable.slice(0, 3);
  for (let i = 0; i < commonest.length; i++) {
    for (let j = i + 1; j < commonest.length; j++) sets.push([best(commonest[i]), best(commonest[j])]);
  }
  return sets;
}

/** A focus usable before `:`: a single clause or `^ id` as is, anything else bracketed. */
function asFocus(ecl: string): string {
  const trimmed = stripTermsAndComments(ecl);
  return isSingleClause(trimmed) || /^\^\s*\d{6,18}$/.test(trimmed) ? trimmed : `(${trimmed})`;
}

function attributeText(r: { attribute: string; value: string }): string {
  return `${r.attribute} = ${r.value}`;
}

function isSingleClause(ecl: string): boolean {
  return /^(<<|<)?\s*\d{6,18}$/.test(ecl.trim());
}

/**
 * `<< a` (or `< a` when `a` is not a member) for the most specific ancestor of
 * `member` that sits above every member: the smallest of its ancestors whose
 * subtree holds the whole set.
 */
async function commonAncestorFocus(members: MemberSet, member: string, q: SetQueries): Promise<string | null> {
  const ancestors = (await q.codes({ include: [{ ecl: `>> ${member}` }] }, 500)).codes.filter((a) => a !== SNOMED_ROOT);
  const sized = await Promise.all(ancestors.map(async (a) => ({ a, size: await q.countEcl(`<< ${a}`) })));
  sized.sort((x, y) => x.size - y.size || byId(x.a, y.a));
  for (const { a } of sized) {
    const outside = await q.count({ include: [members.clause], exclude: [{ ecl: `<< ${a}` }] });
    if (outside > 0) continue;
    const isMember = (await q.count({ include: [{ concepts: [a] }], exclude: [members.clause] })) === 0;
    return `${isMember ? '<<' : '<'} ${a}`;
  }
  return null;
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

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
