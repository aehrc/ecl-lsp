// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Server-side set queries and small helpers shared by deriveEcl and its
// refinement candidates (issues #147, #149).

import type { EvaluationConcept, ITerminologyService, ValueSetClause, ValueSetCompose } from '../terminology/types';

export interface SetDifference {
  count: number;
  /** Up to `sampleSize` of the concepts, as the server returned them. */
  sample: EvaluationConcept[];
}

export const SNOMED_ROOT = '138875005';
/** Ontoserver returns at most this many concepts per page, whatever `count` asks for. */
const PAGE_SIZE = 50_000;
/** Concurrent set queries; see {@link SetQueries}. */
export const MAX_IN_FLIGHT = 8;

/** Numeric order for SCTIDs, so output does not depend on input or server order. */
export function byId(a: string, b: string): number {
  return a.length - b.length || compareText(a, b);
}

export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** `x` alone, or `(x OR y …)` — safe as an operand anywhere. */
export function orGroup(terms: string[]): string {
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

export type ExpandCompose = NonNullable<ITerminologyService['expandCompose']>;

/** The set under study, as a compose clause and as an ECL operand. */
export interface MemberSet {
  clause: ValueSetClause;
  ecl: string;
  size: number;
}

/**
 * Set queries against the server. At most {@link MAX_IN_FLIGHT} run at once:
 * many carry the whole member list, and the service may not queue them itself.
 */
export class SetQueries {
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
