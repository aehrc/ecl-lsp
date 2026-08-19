// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import fetch from './fetch-compat';
import {
  ITerminologyService,
  ConceptInfo,
  SearchResponse,
  ConceptSearchResult,
  EvaluationResponse,
  HistoricalAssociation,
  HistoricalAssociationType,
} from './types';
import { isValidSnomedId } from './verhoeff';
import {
  TerminologyTransportError,
  isTerminologyHttpError,
  isTerminologyTransportError,
  toHttpError,
  toTransportError,
} from './errors';

// ── FHIR response types ────────────────────────────────────────────────

/** A single part within a FHIR Parameters parameter (recursive). */
interface FhirParameterPart {
  name: string;
  valueString?: string;
  valueCode?: string;
  valueBoolean?: boolean;
  valueUri?: string;
  part?: FhirParameterPart[];
}

/** A top-level parameter within a FHIR Parameters resource. */
type FhirParameter = FhirParameterPart;

/** FHIR Parameters resource (returned by $lookup). */
interface FhirParametersResponse {
  resourceType: string;
  parameter?: FhirParameter[];
}

/** A single concept entry inside a ValueSet expansion. */
interface FhirDesignation {
  language?: string;
  use?: { system?: string; code?: string };
  value?: string;
}

interface FhirExpansionContains {
  code?: string;
  display?: string;
  system?: string;
  inactive?: boolean; // FHIR R4 standard field on expansion contains entries
  property?: { code?: string; valueBoolean?: boolean }[];
  designation?: FhirDesignation[];
}

/** The expansion section of a ValueSet. */
interface FhirExpansion {
  total?: number;
  parameter?: { name: string; valueUri?: string; valueString?: string }[];
  contains?: FhirExpansionContains[];
}

/** FHIR ValueSet resource (returned by $expand). */
interface FhirValueSetResponse {
  resourceType: string;
  expansion?: FhirExpansion;
}

/** FHIR OperationOutcome issue entry. */
interface FhirOperationOutcomeIssue {
  severity?: string;
  code?: string;
  diagnostics?: string;
  details?: { text?: string };
}

/** FHIR OperationOutcome resource (returned on errors). */
interface FhirOperationOutcomeResponse {
  resourceType: string;
  issue?: FhirOperationOutcomeIssue[];
}

// ── Module-level constants ──────────────────────────────────────────────

const DEFAULT_USER_AGENT = 'ecl-lsp/1.0.0';

/** True when running in a browser environment. */

const IS_BROWSER = typeof globalThis !== 'undefined' && 'document' in globalThis;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * How {@link FhirTerminologyService.evaluateEcl} carries the ECL to the terminology server.
 *
 * - `'auto'` (default) — try the implicit ValueSet URL `GET` first and fall back to
 *   `POST ValueSet/$expand` when the server shows it cannot serve implicit ValueSets.
 * - `'implicit-url'` — only ever use the implicit ValueSet URL `GET`.
 * - `'post'` — always `POST ValueSet/$expand` with a `constraint` filter.
 */
export type EclEvaluationStrategy = 'auto' | 'implicit-url' | 'post';

/** Type guard for {@link EclEvaluationStrategy} (unknown values degrade to `'auto'`). */
export function isEclEvaluationStrategy(value: unknown): value is EclEvaluationStrategy {
  return value === 'auto' || value === 'implicit-url' || value === 'post';
}

class ConcurrencyQueue {
  private running = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly max: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const attempt = () => {
        this.running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            const next = this.waiters.shift();
            if (next) next();
          });
      };
      if (this.running < this.max) attempt();
      else this.waiters.push(attempt);
    });
  }
}

const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 10_000;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_JITTER_MS = 200;

export interface FhirTerminologyServiceOptions {
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
  snomedVersion?: string;
  /** ECL evaluation transport; defaults to `'auto'`. See {@link EclEvaluationStrategy}. */
  evaluationStrategy?: EclEvaluationStrategy;
  onResolvedVersion?: (versionUri: string) => void;
  maxConcurrency?: number;
}

/**
 * Characters that carry structural meaning inside the *canonical* implicit ValueSet URL
 * (`http://snomed.info/sct?fhir_vs=ecl/<expression>`) and must therefore be percent-encoded
 * within the ECL itself, before the whole canonical URL is escaped again as the `url=` query
 * parameter.
 *
 * `encodeURIComponent` alone only protects the outer HTTP query-string layer. The server
 * decodes that layer and then parses what is left as a canonical URL, where — for example —
 * a trailing `|` is the `system|version` delimiter, so a term annotation such as
 * `|Disease|` truncates the expression (issue #68).
 *
 * `%` is deliberately absent: it must be escaped first and separately, see
 * {@link encodeEclForCanonicalUrl}.
 */
const CANONICAL_URL_RESERVED: readonly (readonly [string, string])[] = [
  ['|', '%7C'], // FHIR canonical `system|version` delimiter — the issue #68 corruption
  ['#', '%23'], // URL fragment delimiter; also introduces ECL concrete values such as `#20`
  ['&', '%26'], // separates parameters within the canonical URL's own query string
  ['+', '%2B'], // read as a space by form-style query decoders
  ['?', '%3F'], // query string introducer
];

/**
 * Percent-encode the characters of an ECL expression that are reserved by the canonical
 * implicit ValueSet URL it gets embedded in.
 *
 * `%` is escaped FIRST so the transform stays injective: a single decode on the server
 * recovers the original expression byte for byte, and an expression that legitimately
 * contains `%7C` round-trips as `%7C` rather than turning into a pipe. Nothing here is
 * ever applied twice, so the function cannot double-encode already-escaped input.
 */
function encodeEclForCanonicalUrl(expression: string): string {
  let encoded = expression.replaceAll('%', '%25');
  for (const [character, escape] of CANONICAL_URL_RESERVED) {
    encoded = encoded.replaceAll(character, escape);
  }
  return encoded;
}

/** Diagnostics wording used by servers that cannot resolve an implicit ValueSet URL. */
const VALUE_SET_NOT_FOUND = /value\s*sets?\s*not\s*found/i;

/** Diagnostics wording used by servers that reject implicit ValueSets as an unsupported feature. */
const IMPLICIT_VALUE_SET_UNSUPPORTED = [
  /implicit[^.]*value\s*sets?[^.]*not\s*supported/i,
  /not\s*supported[^.]*implicit[^.]*value\s*sets?/i,
];

/**
 * A failure the terminology server reported about an ECL evaluation, carrying the raw
 * OperationOutcome diagnostics. Distinguishes server-reported issues (which `evaluateEcl`
 * wraps in a "FHIR evaluation failed:" message) from transport errors such as an aborted
 * fetch, which continue to propagate unchanged.
 */
class EvaluationIssueError extends Error {}

/** A version of a SNOMED CT edition available on the server. */
export interface SnomedVersion {
  uri: string;
  date: string;
}

/** A SNOMED CT edition with its available versions. */
export interface SnomedEdition {
  moduleId: string;
  versions: SnomedVersion[];
}

export class FhirTerminologyService implements ITerminologyService {
  private readonly cache = new Map<string, ConceptInfo>();
  private readonly searchCache = new Map<string, CacheEntry<SearchResponse>>();
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly userAgent: string;
  private readonly evaluationTimeout: number;
  private readonly searchTimeout: number;
  private readonly searchCacheTTL: number; // milliseconds
  private readonly snomedVersion: string | undefined;
  private readonly evaluationStrategy: EclEvaluationStrategy;
  private readonly onResolvedVersion: ((versionUri: string) => void) | undefined;
  private resolvedVersion: string | null = null;
  /**
   * Latched once a POST `ValueSet/$expand` fallback has succeeded in `'auto'` mode: the
   * server has demonstrated it cannot serve the implicit ValueSet URL form, so subsequent
   * evaluations skip the wasted round-trip for the lifetime of this instance.
   */
  private usePostExpand = false;

  /**
   * Latched once a bulk `ValueSet/$expand` has been rejected with a 4xx: the server does
   * not accept a POSTed ValueSet enumerating concepts in `compose.include.concept`, and
   * the request shape never varies, so retrying it on every validation pass only costs a
   * wasted round-trip and a console warning (issue #55). 5xx responses are treated as
   * transient and do not latch.
   */
  private bulkExpandUnsupported = false;
  private readonly queue: ConcurrencyQueue;

  constructor(options: FhirTerminologyServiceOptions = {}) {
    const maxConcurrency = options.maxConcurrency ?? 25;
    if (maxConcurrency <= 0) throw new Error(`maxConcurrency must be > 0, got ${maxConcurrency}`);
    this.queue = new ConcurrencyQueue(maxConcurrency);
    this.baseUrl = options.baseUrl ?? 'https://tx.ontoserver.csiro.au/fhir';
    this.timeout = options.timeout ?? 2000;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.evaluationTimeout = 15000; // 15 seconds for ECL evaluation
    this.searchTimeout = 5000; // 5 seconds for search queries
    this.searchCacheTTL = 5 * 60 * 1000; // 5 minutes
    this.snomedVersion = options.snomedVersion?.trim() ? options.snomedVersion.trim() : undefined;
    this.evaluationStrategy = isEclEvaluationStrategy(options.evaluationStrategy) ? options.evaluationStrategy : 'auto';
    this.onResolvedVersion = options.onResolvedVersion;
  }

  /** The SNOMED CT system URL base for implicit ValueSet URLs. */
  private get snomedSystemUrl(): string {
    return this.snomedVersion ?? 'http://snomed.info/sct'; // eslint-disable-line sonarjs/no-clear-text-protocols -- FHIR system URI, not a network URL
  }

  /** Get the resolved version URI from the most recent FHIR response, if captured. */
  getResolvedVersion(): string | null {
    return this.resolvedVersion;
  }

  /**
   * Extract a SNOMED version URI from an $expand parameter array.
   *
   * FHIR servers may report the resolved version as:
   *   - `{ name: "version", valueUri: "http://snomed.info/sct/.../version/..." }`
   *   - `{ name: "used-codesystem", valueUri: "http://snomed.info/sct|http://snomed.info/sct/.../version/..." }`
   *   - Either field as `valueString` instead of `valueUri`
   */
  private captureResolvedVersion(
    parameters: { name: string; valueUri?: string; valueString?: string }[] | undefined,
  ): void {
    if (this.resolvedVersion || !parameters) return;

    const versionUri = this.extractSnomedVersionFromParams(parameters);
    if (versionUri) {
      this.resolvedVersion = versionUri;
      this.onResolvedVersion?.(versionUri);
    }
  }

  /** Extract resolved version from a $lookup Parameters response. */
  private captureResolvedVersionFromLookup(params: FhirParameter[] | undefined): void {
    if (this.resolvedVersion || !params) return;

    // $lookup returns version as a top-level parameter (may use valueUri or valueString)
    const versionParam = params.find((p) => p.name === 'version');
    const raw = versionParam?.valueUri ?? versionParam?.valueString;
    const versionUri = raw ? this.parseSnomedVersionValue(raw) : null;
    if (versionUri) {
      this.resolvedVersion = versionUri;
      this.onResolvedVersion?.(versionUri);
    }
  }

  /** Search expansion parameters for a SNOMED version URI. */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- version extraction requires checking multiple parameter names and value fields
  private extractSnomedVersionFromParams(
    parameters: { name: string; valueUri?: string; valueString?: string }[],
  ): string | null {
    // Try "version" parameter first (some servers use this)
    const versionParam = parameters.find((p) => p.name === 'version');
    if (versionParam) {
      const raw = versionParam.valueUri ?? versionParam.valueString;
      if (raw) {
        const parsed = this.parseSnomedVersionValue(raw);
        if (parsed) return parsed;
      }
    }

    // Try "used-codesystem" parameter (FHIR R4 standard for $expand)
    for (const p of parameters) {
      if (p.name === 'used-codesystem') {
        const raw = p.valueUri ?? p.valueString;
        if (raw) {
          const parsed = this.parseSnomedVersionValue(raw);
          if (parsed) return parsed;
        }
      }
    }

    return null;
  }

  /**
   * Parse a SNOMED version URI from a raw parameter value.
   * Handles plain URIs and pipe-delimited `system|version` format.
   */
  private parseSnomedVersionValue(raw: string): string | null {
    const snomedVersionPattern = /http:\/\/snomed\.info\/sct\/\d+\/version\/\d+/;
    // Handle pipe-delimited format: "http://snomed.info/sct|http://snomed.info/sct/.../version/..."
    const match = snomedVersionPattern.exec(raw);
    return match ? match[0] : null;
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      // Skip User-Agent in browsers — it triggers CORS preflight
      const headers: Record<string, string> = IS_BROWSER
        ? { ...init?.headers }
        : { 'User-Agent': this.userAgent, ...init?.headers };
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Perform a request, translating any network-level failure (connection
   * refused, DNS failure, timeout/abort) into a {@link TerminologyTransportError}
   * so callers can tell "server unreachable" from "server said no".
   */
  private async request(
    url: string,
    timeoutMs: number,
    operation: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) {
    try {
      // Goes through the concurrency queue and the 429 retry/backoff layer, then
      // translates any network-level failure into a typed transport error.
      return await this.fetchQueued(url, timeoutMs, init);
    } catch (error) {
      throw toTransportError(error, { url, operation, timeoutMs });
    }
  }

  /** Read the body of an error response, extracting a FHIR OperationOutcome if present. */
  private static async readErrorBody(response: {
    text: () => Promise<string>;
  }): Promise<{ outcome: FhirOperationOutcomeResponse | null; detail: string | undefined }> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      return { outcome: null, detail: undefined };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON error body (HTML from a proxy, plain text, empty)
      const trimmed = text.trim();
      return { outcome: null, detail: trimmed ? trimmed.slice(0, 200) : undefined };
    }

    const outcome =
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { resourceType?: unknown }).resourceType === 'OperationOutcome'
        ? (parsed as FhirOperationOutcomeResponse)
        : null;

    const issue = outcome?.issue?.[0];
    const detail = issue?.diagnostics ?? issue?.details?.text;
    return { outcome, detail };
  }

  /** Issue codes a FHIR server uses to say "this code is not in the code system". */
  private static readonly UNKNOWN_CODE_ISSUE_CODES = new Set(['not-found', 'code-invalid', 'invalid-code']);

  /** Phrases servers use in OperationOutcome prose when a code is unknown. */
  private static readonly UNKNOWN_CODE_PHRASES = ['unknown code', 'not found', 'invalid code', 'unable to find'];

  /**
   * True when an error response is the server's well-formed way of saying
   * "I do not know this code" — the one case that maps to `null` rather than
   * an exception.
   *
   * A 404 is only accepted as such when the body is a real FHIR
   * OperationOutcome; a bare 404 (wrong base URL, proxy page) is a fault.
   */
  private static isUnknownCodeResponse(status: number, outcome: FhirOperationOutcomeResponse | null): boolean {
    if (!outcome) return false;
    if (status === 404) return true;
    if (status !== 400 && status !== 422) return false;

    return (outcome.issue ?? []).some((issue) => {
      if (issue.code && FhirTerminologyService.UNKNOWN_CODE_ISSUE_CODES.has(issue.code.toLowerCase())) {
        return true;
      }
      const prose = `${issue.diagnostics ?? ''} ${issue.details?.text ?? ''}`.toLowerCase();
      return FhirTerminologyService.UNKNOWN_CODE_PHRASES.some((phrase) => prose.includes(phrase));
    });
  }

  /**
   * Look up a single concept.
   *
   * @returns the concept, or `null` when the terminology server gave a
   *   well-formed answer saying the code is unknown to it.
   * @throws {TerminologyTransportError} when the server could not be reached,
   *   the request timed out, or the response body was unusable.
   * @throws {TerminologyHttpError} when the server answered with an error
   *   status that is not an "unknown code" response.
   */
  private async fetchWithRetry(
    url: string,
    timeoutMs: number,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
      const response = await this.fetchWithTimeout(url, timeoutMs, init);
      if (response.status !== 429) return response;

      if (attempt === RETRY_MAX_ATTEMPTS - 1) {
        throw new Error(`FHIR request rate-limited after ${RETRY_MAX_ATTEMPTS} attempts`);
      }

      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 0;
      const backoff = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt), RETRY_MAX_DELAY_MS);
      const jitter = Math.random() * RETRY_JITTER_MS; // eslint-disable-line sonarjs/pseudo-random -- jitter for retry backoff; cryptographic randomness not needed
      const waitMs = Math.max(retryAfterMs, backoff + jitter);

      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    throw new Error('Unreachable');
  }

  private fetchQueued(
    url: string,
    timeoutMs: number,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    return this.queue.run(() => this.fetchWithRetry(url, timeoutMs, init));
  }

  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    // Check cache first
    const cached = this.cache.get(conceptId);
    if (cached) {
      return cached;
    }

    let url = `${this.baseUrl}/CodeSystem/$lookup?system=http://snomed.info/sct&code=${encodeURIComponent(conceptId)}`;
    if (this.snomedVersion) {
      url += `&version=${encodeURIComponent(this.snomedVersion)}`;
    }
    const operation = `$lookup of concept ${conceptId}`;
    const response = await this.request(url, this.timeout, operation);

    if (!response.ok) {
      const { outcome, detail } = await FhirTerminologyService.readErrorBody(response);
      if (FhirTerminologyService.isUnknownCodeResponse(response.status, outcome)) {
        return null;
      }
      throw toHttpError({
        status: response.status,
        statusText: response.statusText,
        url,
        operation,
        detail,
      });
    }

    let data: FhirParametersResponse;
    try {
      data = (await response.json()) as FhirParametersResponse;
    } catch (error) {
      throw new TerminologyTransportError(`Terminology server returned an unreadable response for ${operation}`, {
        cause: error,
        url,
      });
    }

    // Parse FHIR Parameters response
    const params = data.parameter ?? [];
    this.captureResolvedVersionFromLookup(params);
    const display = params.find((p) => p.name === 'display')?.valueString ?? '';

    // Check for inactive property (SNOMED uses property array with inactive flag)
    const properties = params.filter((p) => p.name === 'property');
    const inactiveProperty = properties.find((prop) => {
      const parts = prop.part ?? [];
      const codePart = parts.find((p) => p.name === 'code' && p.valueCode === 'inactive');
      return codePart !== undefined;
    });

    let active = true; // Default to active if not specified
    if (inactiveProperty) {
      const valuePart = (inactiveProperty.part ?? []).find((p) => p.name === 'value');
      if (valuePart?.valueBoolean === true) {
        active = false; // Concept is inactive
      }
    }

    const conceptInfo: ConceptInfo = {
      id: conceptId,
      fsn: display,
      pt: display, // Simplified - would need to parse designations
      active,
    };

    // Cache result
    if (this.cache.size < 10000) {
      this.cache.set(conceptId, conceptInfo);
    }

    return conceptInfo;
  }

  /** Map of SNOMED CT historical association reference set IDs to association types. */
  private static readonly ASSOCIATION_REFSETS: Record<string, HistoricalAssociationType> = {
    '900000000000527005': 'same-as',
    '900000000000526001': 'replaced-by',
    '900000000000523009': 'possibly-equivalent-to',
    '900000000000530003': 'alternative',
  };

  async getHistoricalAssociations(conceptId: string): Promise<HistoricalAssociation[]> {
    // Query all 4 association types in parallel via ConceptMap/$translate
    const entries: [string, HistoricalAssociationType][] = Object.entries(FhirTerminologyService.ASSOCIATION_REFSETS);
    const promises = entries.map(async ([refsetId, type]) => {
      const targets = await this.translateAssociation(conceptId, refsetId);
      if (targets.length === 0) return null;
      return { type, refsetId, targets } satisfies HistoricalAssociation;
    });

    const settled = await Promise.all(promises);

    // Return in specificity order (same-as first), filtering out nulls
    const typeOrder: HistoricalAssociationType[] = ['same-as', 'replaced-by', 'possibly-equivalent-to', 'alternative'];
    return typeOrder
      .map((type) => settled.find((a) => a?.type === type))
      .filter((a): a is HistoricalAssociation => a !== null && a !== undefined);
  }

  /** Query a single implicit ConceptMap for historical association targets. */
  private async translateAssociation(
    conceptId: string,
    refsetId: string,
  ): Promise<{ code: string; display: string }[]> {
    try {
      const cmUrl = `${this.snomedSystemUrl}?fhir_cm=${refsetId}`;
      const targetUrl = 'http://snomed.info/sct?fhir_vs'; // eslint-disable-line sonarjs/no-clear-text-protocols -- FHIR system URI, not a network URL
      const url =
        `${this.baseUrl}/ConceptMap/$translate` +
        `?code=${encodeURIComponent(conceptId)}` +
        `&system=${encodeURIComponent('http://snomed.info/sct')}` + // eslint-disable-line sonarjs/no-clear-text-protocols -- FHIR system URI
        `&target=${encodeURIComponent(targetUrl)}` +
        `&url=${encodeURIComponent(cmUrl)}`;

      const response = await this.fetchQueued(url, this.timeout, {
        headers: { Accept: 'application/fhir+json' },
      });
      if (!response.ok) return [];

      const data = (await response.json()) as FhirParametersResponse;
      const params = data.parameter ?? [];
      const resultParam = params.find((p) => p.name === 'result');
      if (resultParam?.valueBoolean !== true) return [];

      // Extract targets from match entries
      const targets: { code: string; display: string }[] = [];
      for (const param of params) {
        if (param.name !== 'match') continue;
        const parts = param.part ?? [];
        const conceptPart = parts.find((p) => p.name === 'concept');
        // valueCoding is not in our FhirParameterPart type — access via type assertion
        const coding = (conceptPart as Record<string, unknown> | undefined)?.valueCoding as
          | { code?: string; display?: string }
          | undefined;
        if (coding?.code) {
          targets.push({ code: coding.code, display: coding.display ?? '' });
        }
      }
      return targets;
    } catch {
      return [];
    }
  }

  /**
   * Validate a batch of concepts.
   *
   * A `null` map value means the terminology server positively reported the
   * code as unknown. Failures are never reported as `null` — they reject.
   *
   * @throws {TerminologyTransportError} when the server could not be reached.
   * @throws {TerminologyHttpError} when the server answered with an error status.
   */
  async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
    const results = new Map<string, ConceptInfo | null>();

    if (conceptIds.length === 0) {
      return results;
    }

    // Return cached results for concepts we already know, collect uncached IDs
    const uncachedIds = this.partitionCached(conceptIds, results);

    if (uncachedIds.length === 0) {
      return results;
    }

    // The server has already rejected this request shape; go straight to lookups.
    if (this.bulkExpandUnsupported) {
      await this.lookupEach(uncachedIds, results);
      return results;
    }

    try {
      const expandResults = await this.bulkExpand(uncachedIds);
      const missingIds = this.mergeExpandResults(uncachedIds, expandResults, results);

      // For concepts not in the expansion, do individual $lookup to distinguish
      // "inactive but filtered out" from "truly unknown". This handles servers
      // that don't support activeOnly=false or filter inactive concepts despite it.
      await this.lookupEach(missingIds, results);

      return results;
    } catch (error) {
      // The server is unreachable — individual lookups would fail the same way,
      // so fail fast rather than hammering a dead server with N more requests.
      if (isTerminologyTransportError(error)) throw error;

      // Otherwise the server rejected the bulk $expand (it may not support
      // POSTed ValueSets); fall back to individual lookups, which propagate
      // their own typed errors if they fail too.
      //
      // A 4xx means this server will not accept the request shape we build, and
      // that shape never varies — so stop attempting it. A 5xx may be transient,
      // so leave bulk expand enabled for the next pass.
      if (isTerminologyHttpError(error) && error.status >= 400 && error.status < 500) {
        this.bulkExpandUnsupported = true;
      }

      await this.lookupEach(uncachedIds, results);
      return results;
    }
  }

  /**
   * Move concepts found in a bulk expansion into `results` (and the cache),
   * returning the IDs that were absent and still need an individual lookup.
   */
  private mergeExpandResults(
    uncachedIds: string[],
    expandResults: Map<string, ConceptInfo>,
    results: Map<string, ConceptInfo | null>,
  ): string[] {
    const missingIds: string[] = [];
    for (const id of uncachedIds) {
      const info = expandResults.get(id);
      if (info) {
        results.set(id, info);
        if (this.cache.size < 10000) {
          this.cache.set(id, info);
        }
      } else {
        missingIds.push(id);
      }
    }
    return missingIds;
  }

  /**
   * Move already-cached concepts into `results`, returning the IDs still to fetch.
   */
  private partitionCached(conceptIds: string[], results: Map<string, ConceptInfo | null>): string[] {
    const uncachedIds: string[] = [];
    for (const id of conceptIds) {
      const cachedInfo = this.cache.get(id);
      if (cachedInfo) {
        results.set(id, cachedInfo);
      } else {
        uncachedIds.push(id);
      }
    }
    return uncachedIds;
  }

  /** Look each concept up individually, recording the result (or `null` if absent). */
  private async lookupEach(conceptIds: string[], results: Map<string, ConceptInfo | null>): Promise<void> {
    if (conceptIds.length === 0) return;
    await Promise.all(
      conceptIds.map(async (id) => {
        const info = await this.getConceptInfo(id);
        results.set(id, info);
      }),
    );
  }

  private async bulkExpand(conceptIds: string[]): Promise<Map<string, ConceptInfo>> {
    const url = `${this.baseUrl}/ValueSet/$expand?property=inactive&activeOnly=false`;

    const include: Record<string, unknown> = {
      system: 'http://snomed.info/sct', // eslint-disable-line sonarjs/no-clear-text-protocols -- FHIR system URI, not a network URL
      concept: conceptIds.map((code) => ({ code })),
    };
    if (this.snomedVersion) {
      include.version = this.snomedVersion;
    }
    const valueSet = {
      resourceType: 'ValueSet',
      compose: { include: [include] },
    };

    const operation = `bulk $expand of ${conceptIds.length} concept(s)`;
    const response = await this.request(url, this.timeout, operation, {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify(valueSet),
    });

    if (!response.ok) {
      const { detail } = await FhirTerminologyService.readErrorBody(response);
      throw toHttpError({
        status: response.status,
        statusText: response.statusText,
        url,
        operation,
        detail,
      });
    }

    const data = (await response.json()) as FhirValueSetResponse;
    this.captureResolvedVersion(data.expansion?.parameter);
    const contains = data.expansion?.contains ?? [];
    const results = new Map<string, ConceptInfo>();

    for (const entry of contains) {
      const code = entry.code;
      if (!code) continue;

      const display = entry.display ?? '';

      // Check inactive status: FHIR R4 puts it directly on the entry,
      // while some servers also use a property array as a fallback.
      let active = true;
      if (entry.inactive === true) {
        active = false;
      } else {
        const properties = entry.property ?? [];
        const inactiveProp = properties.find((p) => p.code === 'inactive');
        if (inactiveProp?.valueBoolean === true) {
          active = false;
        }
      }

      results.set(code, {
        id: code,
        fsn: display,
        pt: display,
        active,
      });
    }

    return results;
  }

  /**
   * Search for concepts by text or SCTID.
   *
   * An empty result set means the server found no matches.
   *
   * @throws {TerminologyTransportError} when the server could not be reached.
   * @throws {TerminologyHttpError} when the server answered with an error status.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- FHIR response parser with nested property traversal
  async searchConcepts(query: string): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      return { results: [], hasMore: false };
    }

    const trimmedQuery = query.trim();

    // Check cache first
    const cached = this.searchCache.get(trimmedQuery);
    if (cached && Date.now() - cached.timestamp < this.searchCacheTTL) {
      return cached.data;
    }

    // Clean up expired cache entries (LRU eviction)
    if (this.searchCache.size >= 100) {
      const now = Date.now();
      const entriesToDelete: string[] = [];

      for (const [key, entry] of this.searchCache.entries()) {
        if (now - entry.timestamp >= this.searchCacheTTL) {
          entriesToDelete.push(key);
        }
      }

      // If no expired entries, remove oldest
      if (entriesToDelete.length === 0) {
        const oldestKey = this.searchCache.keys().next().value;
        if (oldestKey) {
          entriesToDelete.push(oldestKey);
        }
      }

      entriesToDelete.forEach((key) => this.searchCache.delete(key));
    }

    // Failures propagate as typed TerminologyErrors — they are NOT flattened to
    // an opaque string, and an empty result is never invented for a failed call.
    let response: SearchResponse;

    // Determine if query is a valid SNOMED CT ID
    if (/^\d+$/.test(trimmedQuery) && isValidSnomedId(trimmedQuery)) {
      // Valid SCTID - use $lookup
      response = await this.lookupById(trimmedQuery);
    } else {
      // Text or invalid ID - use $expand with filter
      response = await this.searchByFilter(trimmedQuery);
    }

    // Cache the result (only successful responses are cached)
    this.searchCache.set(trimmedQuery, {
      data: response,
      timestamp: Date.now(),
    });

    return response;
  }

  private async lookupById(conceptId: string): Promise<SearchResponse> {
    const info = await this.getConceptInfo(conceptId);

    if (!info?.active) {
      return { results: [], hasMore: false };
    }

    return {
      results: [
        {
          id: info.id,
          fsn: info.fsn,
          pt: info.pt,
        },
      ],
      hasMore: false,
    };
  }

  async evaluateEcl(expression: string, limit = 200): Promise<EvaluationResponse> {
    if (!expression || expression.trim().length === 0) {
      return { total: 0, concepts: [], truncated: false };
    }

    const trimmed = expression.trim();
    // A single budget shared by both transport attempts, so an implicit GET followed by a
    // POST fallback cannot together exceed the configured evaluation timeout.
    const deadline = Date.now() + this.evaluationTimeout;

    try {
      return await this.runEvaluationStrategy(trimmed, limit, deadline);
    } catch (error) {
      // Transport failures (aborted fetch, DNS, ...) propagate untouched; only issues the
      // server actually reported get the "FHIR evaluation failed:" treatment.
      if (!(error instanceof EvaluationIssueError)) throw error;
      throw this.createEvaluationError(trimmed, error);
    }
  }

  /**
   * Transport selection for {@link evaluateEcl}.
   *
   * A forced `'post'` strategy — or a latched successful POST fallback — goes straight to
   * `POST ValueSet/$expand`. Otherwise the implicit ValueSet URL GET runs first, and in
   * `'auto'` mode a failure whose *shape* says the server cannot serve implicit ValueSets
   * (issue #55) is retried over POST.
   */
  private async runEvaluationStrategy(
    expression: string,
    limit: number,
    deadline: number,
  ): Promise<EvaluationResponse> {
    if (this.evaluationStrategy === 'post' || this.usePostExpand) {
      return await this.evaluateViaPostExpand(expression, limit, deadline);
    }

    const response = await this.fetchQueued(
      this.buildImplicitEvaluationUrl(expression, limit),
      this.remainingTimeout(deadline),
    );
    if (response.ok) {
      return this.parseEvaluationResponse((await response.json()) as FhirValueSetResponse);
    }

    const outcome = await this.readOperationOutcome(response);
    if (this.evaluationStrategy === 'implicit-url' || !this.shouldFallbackToPostExpand(response.status, outcome)) {
      throw new EvaluationIssueError(outcome.issue);
    }

    try {
      const result = await this.evaluateViaPostExpand(expression, limit, deadline);
      // Latch only on success: the server has now proved it serves POST $expand but not the
      // implicit ValueSet URL, which is a property of the server, not of this expression.
      this.usePostExpand = true;
      return result;
    } catch (error) {
      if (!(error instanceof EvaluationIssueError)) throw error;
      // Report both diagnostics — the POST failure alone can be misleading when the real
      // problem is that neither form is available.
      throw new EvaluationIssueError(
        `${error.message} (POST ValueSet/$expand fallback; the implicit ValueSet URL also failed: ${outcome.issue})`,
        { cause: error },
      );
    }
  }

  /** `GET ValueSet/$expand?url=<canonical implicit ECL ValueSet>` — see {@link encodeEclForCanonicalUrl}. */
  private buildImplicitEvaluationUrl(expression: string, limit: number): string {
    const implicitVsUrl = `${this.snomedSystemUrl}?fhir_vs=ecl/${encodeEclForCanonicalUrl(expression)}`;
    return `${this.baseUrl}/ValueSet/$expand?url=${encodeURIComponent(implicitVsUrl)}&count=${limit}`;
  }

  /**
   * `POST ValueSet/$expand` carrying the ECL in `compose.include.filter` with
   * `property: "constraint"` — the form requested in issue #55. The expression travels in a
   * JSON body, so it needs no escaping at all.
   */
  private async evaluateViaPostExpand(
    expression: string,
    limit: number,
    deadline: number,
  ): Promise<EvaluationResponse> {
    const include: Record<string, unknown> = {
      system: 'http://snomed.info/sct', // eslint-disable-line sonarjs/no-clear-text-protocols -- FHIR system URI, not a network URL
      ...(this.snomedVersion ? { version: this.snomedVersion } : {}),
      filter: [{ property: 'constraint', op: '=', value: expression }],
    };

    const response = await this.fetchQueued(
      `${this.baseUrl}/ValueSet/$expand?count=${limit}`,
      this.remainingTimeout(deadline),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
        body: JSON.stringify({ resourceType: 'ValueSet', compose: { include: [include] } }),
      },
    );

    if (!response.ok) {
      throw new EvaluationIssueError((await this.readOperationOutcome(response)).issue);
    }

    return this.parseEvaluationResponse((await response.json()) as FhirValueSetResponse);
  }

  /**
   * True when an implicit-URL failure indicates the implicit ValueSet *form* is unsupported
   * rather than the expression being invalid.
   *
   * Deliberately excludes a bare HTTP 422: that is also how a genuine ECL syntax error
   * presents, and retrying those over POST would only turn one clear error into two requests
   * and a muddled message. The `'not-found'` OperationOutcome code is still honoured on any
   * status, which covers servers that report a missing implicit ValueSet as 422.
   */
  private shouldFallbackToPostExpand(status: number, outcome: { code?: string; issue: string }): boolean {
    return (
      status === 404 ||
      status === 414 ||
      outcome.code === 'not-found' ||
      VALUE_SET_NOT_FOUND.test(outcome.issue) ||
      IMPLICIT_VALUE_SET_UNSUPPORTED.some((pattern) => pattern.test(outcome.issue))
    );
  }

  /** Remaining milliseconds in the shared evaluation budget; throws once it is spent. */
  private remainingTimeout(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new EvaluationIssueError('evaluation timed out');
    }
    return remaining;
  }

  /** The machine-readable code and human-readable text of a FHIR error response. */
  private async readOperationOutcome(response: Response): Promise<{ code?: string; issue: string }> {
    const data = (await response.json().catch(() => null)) as FhirOperationOutcomeResponse | null;
    const first = data?.issue?.[0];
    return {
      code: first?.code,
      issue: first?.diagnostics ?? first?.details?.text ?? `HTTP ${response.status}`,
    };
  }

  /** Shared expansion mapping for both the implicit-URL and POST evaluation transports. */
  private parseEvaluationResponse(data: FhirValueSetResponse): EvaluationResponse {
    const expansion = data.expansion ?? {};
    this.captureResolvedVersion(expansion.parameter);
    const total = typeof expansion.total === 'number' ? expansion.total : 0;
    const contains = expansion.contains ?? [];

    const concepts = contains.map((item) => ({
      code: item.code ?? '',
      display: item.display ?? '',
    }));

    return {
      total,
      concepts,
      truncated: total > concepts.length,
    };
  }

  private createEvaluationError(expression: string, error: EvaluationIssueError): Error {
    const issue = error.message;

    // Clean up FHIR OperationOutcome messages: strip server UUIDs and add context
    // when filter syntax is rejected by the server's ECL parser
    if (expression.includes('{{') && /no viable alternative/i.test(issue)) {
      // Strip UUID prefix like "[d4ac2525-...]: "
      const cleaned = issue.replace(/^\[[0-9a-f-]+\]:\s*/i, '');
      return new Error(
        `FHIR evaluation failed: ${cleaned}\n` +
          'Note: Some ECL 2.2 filter syntax (e.g. {{ D id = ... }}) may not be supported by this terminology server.',
        { cause: error },
      );
    }

    return new Error(`FHIR evaluation failed: ${issue}`, { cause: error });
  }

  private async searchByFilter(filter: string): Promise<SearchResponse> {
    const url = `${this.baseUrl}/ValueSet/$expand?url=${this.snomedSystemUrl}?fhir_vs&filter=${encodeURIComponent(filter)}&count=21&includeDesignations=true&activeOnly=true`;

    const operation = `concept search for "${filter}"`;
    const response = await this.request(url, this.searchTimeout, operation);

    if (!response.ok) {
      const { detail } = await FhirTerminologyService.readErrorBody(response);
      throw toHttpError({
        status: response.status,
        statusText: response.statusText,
        url,
        operation,
        detail,
      });
    }

    const data = (await response.json()) as FhirValueSetResponse;
    const expansion = data.expansion ?? {};
    this.captureResolvedVersion(expansion.parameter);
    const contains = expansion.contains ?? [];

    // Limit to 20 results, set hasMore if we got 21
    const hasMore = contains.length > 20;
    const results: ConceptSearchResult[] = contains.slice(0, 20).map((item) => {
      const display = item.display ?? '';
      // Extract FSN from designations (use code 900000000000003001 = Fully Specified Name)
      const fsnDesignation = item.designation?.find((d) => d.use?.code === '900000000000003001');
      return {
        id: item.code ?? '',
        fsn: fsnDesignation?.value ?? display,
        pt: display,
      };
    });

    return { results, hasMore };
  }

  /** Fetch available SNOMED CT editions and versions from the FHIR server. */
  async getSnomedEditions(): Promise<SnomedEdition[]> {
    const url = `${this.baseUrl}/CodeSystem?url=http://snomed.info/sct`;
    const operation = 'SNOMED CT edition discovery';
    const response = await this.request(url, this.searchTimeout, operation);

    if (!response.ok) {
      const { detail } = await FhirTerminologyService.readErrorBody(response);
      throw toHttpError({
        status: response.status,
        statusText: response.statusText,
        url,
        operation,
        detail,
      });
    }

    const data = (await response.json()) as {
      resourceType: string;
      entry?: { resource?: { resourceType: string; version?: string } }[];
    };

    // Parse version URIs from Bundle entries, group by module ID
    const editionMap = new Map<string, SnomedVersion[]>();
    const versionRegex = /^http:\/\/snomed\.info\/sct\/(\d+)\/version\/(\d+)$/;

    for (const entry of data.entry ?? []) {
      const version = entry.resource?.version;
      if (!version) continue;

      const match = versionRegex.exec(version);
      if (match) {
        const moduleId = match[1];
        const date = match[2];
        const versions = editionMap.get(moduleId) ?? [];
        versions.push({ uri: version, date });
        editionMap.set(moduleId, versions);
      }
    }

    // Sort versions descending (newest first) within each edition
    const editions: SnomedEdition[] = [];
    for (const [moduleId, versions] of editionMap) {
      versions.sort((a, b) => b.date.localeCompare(a.date));
      editions.push({ moduleId, versions });
    }

    return editions;
  }
}
