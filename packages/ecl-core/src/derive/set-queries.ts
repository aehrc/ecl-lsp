// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Server-side set queries and small helpers shared by deriveEcl and its
// refinement candidates (issues #147, #149).

import { isTerminologyHttpError } from '../terminology/errors';
import type { EvaluationConcept, ITerminologyService, ValueSetClause, ValueSetCompose } from '../terminology/types';
import type { Walk } from './taxonomy-graph';

export interface SetDifference {
  count: number;
  /** Up to `sampleSize` of the concepts, as the server returned them. */
  sample: EvaluationConcept[];
}

export const SNOMED_ROOT = '138875005';
/** Ontoserver returns at most this many concepts per page, whatever `count` asks for. */
const PAGE_SIZE = 50_000;
/**
 * Codes per request when looking concepts up by code. The server's cost grows
 * with the codes in a request, and is paid again for every page of it, so a
 * long list costs least as many small requests rather than one paged one.
 */
export const LOOKUP_CHUNK = 10_000;
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

/**
 * `terminology`, counting the requests that fail because of the server: it
 * could not be reached, timed out, was rate-limited or answered 5xx. A 4xx
 * other than 429 is about the request, not the server, and is not counted.
 * Derive drops what a failed request was for and goes on, so this count is
 * what tells a degraded result from a complete one.
 */
const UNCOUNTED = Symbol('uncounted');

/**
 * The service behind a {@link countingFailures} wrapper (or `terminology`
 * itself), for a request whose failure the caller recovers from by other
 * requests, which are counted: a failure there loses nothing, so it must not
 * mark the result incomplete.
 */
export function uncounted(terminology: ITerminologyService): ITerminologyService {
  return (terminology as ITerminologyService & { [UNCOUNTED]?: ITerminologyService })[UNCOUNTED] ?? terminology;
}

export function countingFailures(terminology: ITerminologyService): {
  service: ITerminologyService;
  failures: () => number;
} {
  let count = 0;
  const counted = (error: unknown): never => {
    const requestFault =
      isTerminologyHttpError(error) && error.status >= 400 && error.status < 500 && error.status !== 429;
    if (!requestFault) count++;
    throw error;
  };
  const service = new Proxy(terminology, {
    get(target, prop, receiver) {
      // Through every wrapper: a derive nested in another (compress, a subtraction) has two.
      if (prop === UNCOUNTED) return uncounted(target);
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const out: unknown = value.apply(target, args);
        return out instanceof Promise ? out.catch(counted) : out;
      };
    },
  });
  return { service, failures: () => count };
}

/** The set under study, as a compose clause and as an ECL operand. */
export interface MemberSet {
  clause: ValueSetClause;
  ecl: string;
  size: number;
  /** The members with their terms, when resolving the input already listed them. */
  concepts?: EvaluationConcept[];
  /** The members looked up with their parents and children, when resolving the input did that, for the graph. */
  walk?: Walk;
  /** Resolving the input found that the server gives no parents or children, so the graph cannot be walked. */
  walkUnsupported?: boolean;
}

/**
 * Set queries against the server. At most {@link MAX_IN_FLIGHT} run at once:
 * many carry the whole member list, and the service may not queue them itself.
 */
export class SetQueries {
  private inFlight = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly expandCompose: ExpandCompose,
    private readonly parallelPages = false,
  ) {}

  /**
   * The rest of an expansion whose first `first.length` concepts have been
   * read, up to `until`, in order. Pages step by the first page's length, which
   * is the server's page cap when it returned fewer than asked (Ontoserver
   * caps at 50,000; other servers lower). With `parallelPages` those pages are
   * asked for at once. Whatever is still missing after that (a server whose
   * pages shrink) is read one page after another, advancing by what each page
   * actually held, so a smaller cap never silently drops concepts.
   */
  private async rest(
    compose: ValueSetCompose,
    first: EvaluationConcept[],
    until: number,
    options: Omit<Parameters<ExpandCompose>[1] & object, 'offset' | 'count'>,
  ): Promise<EvaluationConcept[]> {
    const concepts = [...first];
    const step = first.length;
    if (step === 0) return concepts;
    const page = async (offset: number, count: number) =>
      (await this.expand(compose, { ...options, count, offset })).concepts;
    if (this.parallelPages) await this.pagesAtOnce(concepts, step, until, page);
    while (concepts.length < until) {
      const p = await page(concepts.length, Math.min(PAGE_SIZE, until - concepts.length));
      if (p.length === 0) break;
      for (const c of p) concepts.push(c);
    }
    return concepts;
  }

  /**
   * Append the pages from `step` to `until`, `step` apart, asked for at once.
   * Only the run of full pages is kept: after a short one the offsets no longer line up.
   */
  private async pagesAtOnce(
    concepts: EvaluationConcept[],
    step: number,
    until: number,
    page: (offset: number, count: number) => Promise<EvaluationConcept[]>,
  ): Promise<void> {
    const offsets: number[] = [];
    for (let o = step; o < until; o += step) offsets.push(o);
    const pages = await Promise.all(offsets.map((o) => page(o, Math.min(step, until - o))));
    for (const p of pages) {
      for (const c of p) concepts.push(c);
      if (p.length < step) return;
    }
  }

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

  async sample(compose: ValueSetCompose, count: number, activeOnly = true): Promise<SetDifference> {
    const r = await this.expand(compose, { count, activeOnly });
    return { count: r.total, sample: r.concepts };
  }

  /** Up to `max` codes of the set, sorted, plus the set's exact total. */
  async codes(compose: ValueSetCompose, max: number, activeOnly = true): Promise<{ codes: string[]; total: number }> {
    const { concepts, total } = await this.concepts(compose, max, activeOnly);
    return { codes: concepts.map((c) => c.code).sort(byId), total };
  }

  /** Up to `max` concepts of the set with their terms, in the server's order, plus the set's exact total. */
  async concepts(
    compose: ValueSetCompose,
    max: number,
    activeOnly = true,
  ): Promise<{ concepts: EvaluationConcept[]; total: number }> {
    const first = await this.expand(compose, { count: Math.min(PAGE_SIZE, max), offset: 0, activeOnly });
    const total = first.total;
    const concepts = await this.rest(compose, first.concepts, Math.min(max, total), { activeOnly });
    return { concepts, total };
  }

  /**
   * The concepts of `codes` the server knows, in chunks of {@link LOOKUP_CHUNK}
   * run concurrently, with their terms and, as asked, parents and children.
   * With `activeOnly: false` inactive ones come back flagged `inactive`.
   */
  async lookup(
    codes: readonly string[],
    options: { activeOnly?: boolean; parents?: boolean; children?: boolean; activity?: boolean } = {},
  ): Promise<EvaluationConcept[]> {
    return (await this.lookupEach(codes, options, (concepts) => concepts)).flat();
  }

  /**
   * {@link lookup}, with each chunk's answer passed through `each` as it
   * arrives, so a caller that keeps less than the server sends need not hold
   * every answer at once. The results are in chunk order.
   */
  async lookupEach<T>(
    codes: readonly string[],
    options: { activeOnly?: boolean; parents?: boolean; children?: boolean; activity?: boolean },
    each: (concepts: EvaluationConcept[]) => T,
  ): Promise<T[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < codes.length; i += LOOKUP_CHUNK) chunks.push(codes.slice(i, i + LOOKUP_CHUNK));
    return Promise.all(
      chunks.map(async (chunk) => {
        const compose = { include: [{ concepts: chunk }] };
        const expandOptions = { activeOnly: options.activeOnly ?? true, ...options };
        const page = await this.expand(compose, { ...expandOptions, count: chunk.length, offset: 0 });
        // A server with a page cap below the chunk size answers in more than one page.
        if (page.concepts.length >= page.total) return each(page.concepts);
        return each(await this.rest(compose, page.concepts, page.total, expandOptions));
      }),
    );
  }

  /**
   * Up to `max` concepts of a set known to have at most `max`, such as a list
   * of codes: with `parallelPages` every page is asked for at once, since the
   * offsets do not depend on the first page's total.
   */
  async conceptsUpTo(
    compose: ValueSetCompose,
    max: number,
    activeOnly = true,
  ): Promise<{ concepts: EvaluationConcept[]; total: number }> {
    if (!this.parallelPages || max <= PAGE_SIZE) return this.concepts(compose, max, activeOnly);
    const offsets: number[] = [];
    for (let o = 0; o < max; o += PAGE_SIZE) offsets.push(o);
    const pages = await Promise.all(
      offsets.map((offset) => this.expand(compose, { count: Math.min(PAGE_SIZE, max - offset), offset, activeOnly })),
    );
    const total = pages[0].total;
    const concepts = pages.flatMap((p) => p.concepts);
    // A server that caps pages below PAGE_SIZE leaves gaps between these offsets: read it in order instead.
    if (concepts.length < Math.min(max, total)) return this.concepts(compose, max, activeOnly);
    return { concepts, total };
  }

  /**
   * Every concept of the set with its direct parents, or why not: the set has
   * more than `max` concepts, or the server does not return parents.
   */
  async graph(compose: ValueSetCompose, max: number): Promise<Map<string, string[]> | 'too-large' | 'no-parents'> {
    const graph = new Map<string, string[]>();
    const first = await this.expand(compose, { count: PAGE_SIZE, offset: 0, parents: true });
    if (first.total > max) return 'too-large';
    for (const c of await this.rest(compose, first.concepts, first.total, { parents: true })) {
      if (!c.parents && c.code !== SNOMED_ROOT) return 'no-parents';
      graph.set(c.code, c.parents ?? []);
    }
    return graph;
  }

  countEcl(ecl: string): Promise<number> {
    return this.count({ include: [{ ecl }] });
  }
}
