// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Attribute refinement candidates for deriveEcl (issue #149 Part 3).
//
// A set that cuts across the hierarchy can still share attribute values: every
// AMT product with a given dose form, or a given ingredient at 500 mg. Read the
// relationships of a sample of members to profile the attributes most of them
// carry, then offer `focus : clauses` for the likeliest value options:
//
//   - concept values: values most members share (`= << paracetamol`), `<<` the
//     roots of the values members carry, `<<` their lowest common ancestor, the
//     values themselves when there are few, and `= *`;
//   - concrete values (`#500`): a value most members share, the sample's range
//     (`>= #min, <= #max`), and `= *`;
//   - each attribute's parent attribute too (members carry `762949000 |Has
//     precise active ingredient|` where definitions say `127489000 |Has active
//     ingredient|`), and a cardinality (`[2..*]`) when every sampled member
//     carries the attribute at least twice.
//
// The server counts what each candidate adds and misses, as for any other.

import { parseECL } from '../parser';
import { NodeType, type SubExpressionNode } from '../parser/ast';
import type { DefiningRelationship, ITerminologyService } from '../terminology/types';
import {
  byId,
  MAX_IN_FLIGHT,
  orGroup,
  SNOMED_ROOT,
  stripTermsAndComments,
  type MemberSet,
  type SetQueries,
} from './set-queries';

/** One part of a refinement: `[cardinality] attribute comparison value`. */
export interface RefinementClause {
  attribute: string;
  comparison: '=' | '>=' | '<=';
  /** An ECL value: `<< 123`, `(…)`, `*`, or a concrete `#500` / `"text"`. */
  value: string;
  /** e.g. `[2..*]`. */
  cardinality?: string;
}

/** Members whose relationships are read to profile the attributes the set shares. */
const REFINEMENT_SAMPLE = 20;
/** Most refinement candidates scored, likeliest first. */
const MAX_REFINEMENT_CANDIDATES = 16;
/** Share of members a value must be carried by to be offered on its own. */
const SHARED_VALUE_SHARE = 0.5;
/** Up to this many value roots, `<<` each of them is a value option. */
const MAX_ROOTS_AS_VALUE = 30;
/** Up to this many value roots, their lowest common ancestor comes from all of them; above, from the sample. */
const MAX_VALUE_ROOTS = 50;
/** Up to this many distinct values, the values themselves are a value option. */
const MAX_LITERAL_VALUES = 5;
/** Most attributes profiled, those most often present in the sample first. */
const MAX_REFINEMENT_ATTRIBUTES = 6;
/** Of those, the commonest concept attributes whose parent attribute is also tried. */
const MAX_GENERALISED_ATTRIBUTES = 3;
/** `410662002 |Concept model attribute|`. */
const CONCEPT_MODEL_ATTRIBUTE = '410662002';

/** What the sample says about one attribute. */
interface AttributeProfile {
  type: string;
  /** Sampled members carrying it. */
  carriedBy: number;
  /** Fewest times a sampled member carries it (0 when some member does not). */
  minCount: number;
  /** Concrete (`#500`) rather than concept values. */
  concrete: boolean;
  /** Each value and how many sampled members carry it. */
  values: Map<string, number>;
}

/**
 * The defining relationships of each sampled member. A failed lookup leaves
 * that member out, with a note, rather than end the derive.
 */
async function readRelationships(
  sample: string[],
  getRelationships: (conceptId: string) => Promise<DefiningRelationship[] | null>,
  notes: string[],
): Promise<(DefiningRelationship[] | null)[]> {
  const sampled: (DefiningRelationship[] | null)[] = [];
  const failures: unknown[] = [];
  for (let i = 0; i < sample.length; i += MAX_IN_FLIGHT) {
    const batch = await Promise.allSettled(sample.slice(i, i + MAX_IN_FLIGHT).map((m) => getRelationships(m)));
    for (const r of batch) {
      if (r.status === 'fulfilled') sampled.push(r.value);
      else failures.push(r.reason);
    }
  }
  if (failures.length > 0) {
    const reason = failures[0] instanceof Error ? failures[0].message : String(failures[0]);
    const members = failures.length === 1 ? 'member' : 'members';
    notes.push(`The relationships of ${failures.length} sampled ${members} could not be read: ${reason}.`);
  }
  return sampled;
}

/**
 * Refinement candidates for the set, likeliest first. `roots` are the set's
 * roots (all of them when `roots.total` fits); `givenFoci` come from the input
 * or the caller, and the most specific concept above every member is added
 * unless `fixedFocus` says the caller chose the focus.
 */
export async function refinementCandidates(
  members: MemberSet,
  roots: { codes: string[]; total: number },
  givenFoci: string[],
  fixedFocus: boolean,
  q: SetQueries,
  terminology: ITerminologyService,
  notes: string[],
): Promise<{ focus: string; clauses: RefinementClause[] }[]> {
  const getRelationships = terminology.getDefiningRelationships?.bind(terminology);
  if (!getRelationships) {
    notes.push('Refinement candidates need a terminology service with getDefiningRelationships.');
    return [];
  }

  const sample = (await q.codes({ include: [members.clause] }, REFINEMENT_SAMPLE)).codes;
  const sampled = await readRelationships(sample, getRelationships, notes);
  const profiles = profileAttributes(sampled);
  if (profiles.length === 0) {
    notes.push('No attribute is shared by most members, so no refinement candidates were built.');
    return [];
  }
  profiles.push(...(await generalised(profiles, q)));

  const foci = [...givenFoci];
  if (!fixedFocus) {
    // The roots stand for the whole set when all of them were fetched; otherwise the sample does.
    const basis = roots.total <= roots.codes.length ? roots.codes : sample;
    const ancestor = await commonAncestorFocus(members, basis, basis === sample, q);
    if (ancestor) foci.push(ancestor);
  }
  if (foci.length === 0) return [];

  const options = new Map<string, RefinementClause[][]>();
  for (const profile of profiles) {
    const found = profile.concrete
      ? concreteOptions(profile, sampled.length)
      : await conceptOptions(members, profile, sampled.length, q);
    if (found.length > 0) options.set(profile.type, withCardinality(profile, found));
  }

  const sets = refinementSets(
    profiles.map((p) => p.type).filter((t) => options.has(t)),
    options,
  );
  // Most promising first (each attribute's first option is its likeliest), capped.
  return foci
    .flatMap((focus, f) => sets.map((clauses, i) => ({ order: i * foci.length + f, focus, clauses })))
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_REFINEMENT_CANDIDATES)
    .map(({ focus, clauses }) => ({ focus, clauses }));
}

/** `focus : clause, clause …` */
export function refinementText(focus: string, clauses: RefinementClause[]): string {
  return `${focus} : ${clauses.map(clauseText).join(', ')}`;
}

function clauseText(c: RefinementClause): string {
  const cardinality = c.cardinality ? `${c.cardinality} ` : '';
  return `${cardinality}${c.attribute} ${c.comparison} ${c.value}`;
}

// ── Profiling ────────────────────────────────────────────────────────────

/** The attributes at least half the sampled members carry, commonest first. */
function profileAttributes(sampled: (DefiningRelationship[] | null)[]): AttributeProfile[] {
  const profiles = new Map<string, AttributeProfile>();
  const counts = new Map<string, number[]>();
  sampled.forEach((relationships) => {
    const perType = new Map<string, DefiningRelationship[]>();
    for (const r of relationships ?? []) perType.set(r.type, [...(perType.get(r.type) ?? []), r]);
    for (const [type, rs] of perType) {
      const p: AttributeProfile = profiles.get(type) ?? {
        type,
        carriedBy: 0,
        minCount: 0,
        concrete: false,
        values: new Map<string, number>(),
      };
      p.carriedBy++;
      p.concrete ||= rs.some((r) => !/^\d+$/.test(r.value));
      for (const v of new Set(rs.map((r) => r.value))) p.values.set(v, (p.values.get(v) ?? 0) + 1);
      profiles.set(type, p);
      counts.set(type, [...(counts.get(type) ?? []), rs.length]);
    }
  });
  for (const p of profiles.values()) {
    p.minCount = p.carriedBy === sampled.length ? Math.min(...(counts.get(p.type) ?? [0])) : 0;
  }
  return [...profiles.values()]
    .filter((p) => p.carriedBy * 2 >= sampled.length)
    .sort((a, b) => b.carriedBy - a.carriedBy || byId(a.type, b.type))
    .slice(0, MAX_REFINEMENT_ATTRIBUTES);
}

/**
 * The parent attributes of the commonest concept attributes, as profiles of
 * their own (same sample values): definitions often name the general attribute.
 */
async function generalised(profiles: AttributeProfile[], q: SetQueries): Promise<AttributeProfile[]> {
  const known = new Set(profiles.map((p) => p.type));
  const out: AttributeProfile[] = [];
  for (const p of profiles.filter((x) => !x.concrete).slice(0, MAX_GENERALISED_ATTRIBUTES)) {
    const parents = await q.codes({ include: [{ ecl: `(>! ${p.type}) AND < ${CONCEPT_MODEL_ATTRIBUTE}` }] }, 3);
    for (const parent of parents.codes) {
      if (known.has(parent)) continue;
      known.add(parent);
      out.push({ ...p, type: parent });
    }
  }
  return out;
}

// ── Value options ────────────────────────────────────────────────────────

/** Options for a concrete attribute: a value most share, the sample's range, any value. */
function concreteOptions(profile: AttributeProfile, sampleSize: number): RefinementClause[][] {
  const one = (comparison: RefinementClause['comparison'], value: string): RefinementClause => ({
    attribute: profile.type,
    comparison,
    value,
  });
  const options: RefinementClause[][] = [...profile.values.entries()]
    .filter(([, n]) => n >= sampleSize * SHARED_VALUE_SHARE * 0.8)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 2)
    .map(([v]) => [one('=', v)]);
  const numbers = [...profile.values.keys()].filter((v) => v.startsWith('#')).map((v) => Number(v.slice(1)));
  if (numbers.length > 1) {
    options.push([one('>=', `#${Math.min(...numbers)}`), one('<=', `#${Math.max(...numbers)}`)]);
  }
  options.push([one('=', '*')]);
  return options;
}

/**
 * Options for a concept attribute, likeliest first. A value no member uses
 * changes nothing inside a refinement, so broad options can be exact there
 * (`<< Tablet`) where the value set alone would need exclusions.
 */
async function conceptOptions(
  members: MemberSet,
  profile: AttributeProfile,
  sampleSize: number,
  q: SetQueries,
): Promise<RefinementClause[][]> {
  const attribute = profile.type;
  const values = `(${members.ecl} . ${attribute})`;
  const literal = await q.codes({ include: [{ ecl: values }] }, MAX_LITERAL_VALUES + 1);
  if (literal.total === 0) return [];
  const valueRoots = await q.codes({ include: [{ ecl: `${values} MINUS < ${values}` }] }, MAX_VALUE_ROOTS + 1);

  const found = await sharedValues(members, profile, sampleSize, q);
  if (valueRoots.total <= MAX_ROOTS_AS_VALUE) found.push(orGroup(valueRoots.codes.map((r) => `<< ${r}`)));
  if (valueRoots.total > 1) {
    const lca = await valuesAncestor(values, valueRoots, profile, q);
    if (lca) found.push(`<< ${lca}`);
  }
  if (literal.total <= MAX_LITERAL_VALUES) found.push(orGroup(literal.codes));
  found.push('*');
  return [...new Set(found)].map((value) => [{ attribute, comparison: '=', value }]);
}

/**
 * The lowest common ancestor of the values: from all value roots when there
 * are few, otherwise from the sample's values, checked to hold every value.
 */
async function valuesAncestor(
  values: string,
  valueRoots: { codes: string[]; total: number },
  profile: AttributeProfile,
  q: SetQueries,
): Promise<string | undefined> {
  if (valueRoots.total <= MAX_VALUE_ROOTS) return (await lowestCommonAncestors(valueRoots.codes, q)).at(0);
  for (const a of await lowestCommonAncestors([...profile.values.keys()].sort(byId), q)) {
    if ((await q.count({ include: [{ ecl: values }], exclude: [{ ecl: `<< ${a}` }] })) === 0) return a;
  }
  return undefined;
}

/**
 * `<< v` for values that at least {@link SHARED_VALUE_SHARE} of the members
 * carry: candidates from the sample, each counted on the server.
 */
async function sharedValues(
  members: MemberSet,
  profile: AttributeProfile,
  sampleSize: number,
  q: SetQueries,
): Promise<string[]> {
  const likely = [...profile.values.entries()]
    .filter(([, n]) => n >= sampleSize * SHARED_VALUE_SHARE * 0.8)
    .sort(([a, x], [b, y]) => y - x || byId(a, b))
    .slice(0, 3)
    .map(([v]) => v);
  const carried = await Promise.all(
    likely.map(async (v) => ({
      v,
      n:
        members.size -
        (await q.count({ include: [members.clause], exclude: [{ ecl: `* : ${profile.type} = << ${v}` }] })),
    })),
  );
  return carried
    .filter(({ n }) => n >= members.size * SHARED_VALUE_SHARE)
    .sort((x, y) => y.n - x.n || byId(x.v, y.v))
    .map(({ v }) => `<< ${v}`);
}

/**
 * Every sampled member carries the attribute at least n ≥ 2 times: offer
 * `[n..*] attribute = *` second. A cardinality counts the relationships that
 * match the value, so it goes on the option that matches them all.
 */
function withCardinality(profile: AttributeProfile, options: RefinementClause[][]): RefinementClause[][] {
  if (profile.minCount < 2) return options;
  const counted: RefinementClause[] = [
    { attribute: profile.type, comparison: '=', value: '*', cardinality: `[${profile.minCount}..*]` },
  ];
  return [options[0], counted, ...options.slice(1)];
}

/** Each attribute with each of its options, then pairs of the three commonest with their first options. */
function refinementSets(types: string[], options: Map<string, RefinementClause[][]>): RefinementClause[][] {
  const sets: RefinementClause[][] = [];
  for (const type of types) for (const option of options.get(type) ?? []) sets.push(option);
  const first = (type: string) => options.get(type)?.[0] ?? [];
  const commonest = types.slice(0, 3);
  for (let i = 0; i < commonest.length; i++) {
    for (let j = i + 1; j < commonest.length; j++) sets.push([...first(commonest[i]), ...first(commonest[j])]);
  }
  return sets;
}

// ── Foci ─────────────────────────────────────────────────────────────────

/**
 * Reference sets an ECL input is restricted to (`^ R : …`, `^ R AND …`): a
 * natural focus for refinements, such as an AMT product level.
 */
export function refsetFoci(ecl: string): string[] {
  const ast = parseECL(ecl).ast;
  if (!ast) return [];
  const expr = ast.expression;
  let operands: SubExpressionNode[] = [];
  if (expr.type === NodeType.RefinedExpression) operands = [expr.expression];
  else if (expr.type === NodeType.SubExpressionConstraint) operands = [expr];
  else if (expr.type === NodeType.CompoundExpression && expr.operator.operator !== 'OR') {
    // `A MINUS B` is within A; `A AND B` within both.
    operands = expr.operator.operator === 'AND' ? expr.operands : expr.operands.slice(0, 1);
  }
  const foci: string[] = [];
  for (const o of operands) {
    if (o.memberOf && !o.operator && o.focus.type === NodeType.ConceptReference) foci.push(`^ ${o.focus.conceptId}`);
    else if (o.focus.type === NodeType.ExpressionConstraint && !o.operator && !o.memberOf) {
      foci.push(...refsetFoci(ecl.slice(o.focus.range.start.offset, o.focus.range.end.offset)));
    }
  }
  return [...new Set(foci)];
}

/** A focus usable before `:`: a single clause or `^ id` as is, anything else bracketed. */
export function asFocus(ecl: string): string {
  const trimmed = stripTermsAndComments(ecl);
  return isSingleClause(trimmed) || /^\^\s*\d{6,18}$/.test(trimmed) ? trimmed : `(${trimmed})`;
}

function isSingleClause(ecl: string): boolean {
  return /^(<<|<)?\s*\d{6,18}$/.test(ecl.trim());
}

/**
 * `<< a` (or `< a` when `a` is not a member) for the most specific concept above
 * every member: a lowest common ancestor of `basis`, which is the set's roots or,
 * when there are too many, a sample (`checked` then makes sure it covers the set).
 */
async function commonAncestorFocus(
  members: MemberSet,
  basis: string[],
  checked: boolean,
  q: SetQueries,
): Promise<string | null> {
  for (const a of await lowestCommonAncestors(basis, q)) {
    if (checked) {
      const outside = await q.count({ include: [members.clause], exclude: [{ ecl: `<< ${a}` }] });
      if (outside > 0) continue;
    }
    const isMember = (await q.count({ include: [{ concepts: [a] }], exclude: [members.clause] })) === 0;
    return `${isMember ? '<<' : '<'} ${a}`;
  }
  return null;
}

/**
 * The most specific concepts that are, or are ancestors of, every one of
 * `concepts`, in one query: X = `(>> c1) AND (>> c2) …`, then `X MINUS > X`.
 */
export async function lowestCommonAncestors(concepts: string[], q: SetQueries): Promise<string[]> {
  if (concepts.length === 0) return [];
  const each = concepts.map((c) => `(>> ${c})`);
  const common = `(${each.join(' AND ')})`;
  const lowest = await q.codes({ include: [{ ecl: `${common} MINUS > ${common}` }] }, 10);
  return lowest.codes.filter((a) => a !== SNOMED_ROOT);
}
