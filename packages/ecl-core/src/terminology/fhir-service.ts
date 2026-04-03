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

export interface FhirTerminologyServiceOptions {
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
  snomedVersion?: string;
  onResolvedVersion?: (versionUri: string) => void;
}

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
  private readonly onResolvedVersion: ((versionUri: string) => void) | undefined;
  private resolvedVersion: string | null = null;

  constructor(options: FhirTerminologyServiceOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://tx.ontoserver.csiro.au/fhir';
    this.timeout = options.timeout ?? 2000;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.evaluationTimeout = 15000; // 15 seconds for ECL evaluation
    this.searchTimeout = 5000; // 5 seconds for search queries
    this.searchCacheTTL = 5 * 60 * 1000; // 5 minutes
    this.snomedVersion = options.snomedVersion?.trim() ? options.snomedVersion.trim() : undefined;
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

  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    // Check cache first
    const cached = this.cache.get(conceptId);
    if (cached) {
      return cached;
    }

    try {
      let url = `${this.baseUrl}/CodeSystem/$lookup?system=http://snomed.info/sct&code=${encodeURIComponent(conceptId)}`;
      if (this.snomedVersion) {
        url += `&version=${encodeURIComponent(this.snomedVersion)}`;
      }
      const response = await this.fetchWithTimeout(url, this.timeout);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as FhirParametersResponse;

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
    } catch (error) {
      // eslint-disable-next-line no-console -- no LSP connection available in service layer
      console.warn(`Failed to fetch concept ${conceptId}:`, error);
      return null;
    }
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

      const response = await this.fetchWithTimeout(url, this.timeout, {
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

  async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
    const results = new Map<string, ConceptInfo | null>();

    if (conceptIds.length === 0) {
      return results;
    }

    // Return cached results for concepts we already know, collect uncached IDs
    const uncachedIds: string[] = [];
    for (const id of conceptIds) {
      const cachedInfo = this.cache.get(id);
      if (cachedInfo) {
        results.set(id, cachedInfo);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) {
      return results;
    }

    try {
      const expandResults = await this.bulkExpand(uncachedIds);

      // Process results: concepts in response exist, those missing need individual lookup
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

      // For concepts not in the expansion, do individual $lookup to distinguish
      // "inactive but filtered out" from "truly unknown". This handles servers
      // that don't support activeOnly=false or filter inactive concepts despite it.
      if (missingIds.length > 0) {
        const lookups = missingIds.map(async (id) => {
          const info = await this.getConceptInfo(id);
          results.set(id, info);
        });
        await Promise.all(lookups);
      }

      return results;
    } catch (error) {
      // eslint-disable-next-line no-console -- no LSP connection available in service layer
      console.warn('Bulk concept validation failed, falling back to individual lookups:', error);
      const lookups = uncachedIds.map(async (id) => {
        const info = await this.getConceptInfo(id);
        results.set(id, info);
      });
      await Promise.all(lookups);
      return results;
    }
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

    const response = await this.fetchWithTimeout(url, this.timeout, {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify(valueSet),
    });

    if (!response.ok) {
      throw new Error(`Bulk expand failed: HTTP ${response.status}`);
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

    try {
      let response: SearchResponse;

      // Determine if query is a valid SNOMED CT ID
      if (/^\d+$/.test(trimmedQuery) && isValidSnomedId(trimmedQuery)) {
        // Valid SCTID - use $lookup
        response = await this.lookupById(trimmedQuery);
      } else {
        // Text or invalid ID - use $expand with filter
        response = await this.searchByFilter(trimmedQuery);
      }

      // Cache the result
      this.searchCache.set(trimmedQuery, {
        data: response,
        timestamp: Date.now(),
      });

      return response;
    } catch (error) {
      // eslint-disable-next-line no-console -- no LSP connection available in service layer
      console.warn(`Search failed for query "${trimmedQuery}":`, error);
      // eslint-disable-next-line preserve-caught-error -- Error.cause requires ES2022+; original error already logged above
      throw new Error('Terminology server unavailable');
    }
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

    const implicitVsUrl = `${this.snomedSystemUrl}?fhir_vs=ecl/${expression.trim()}`;
    const url = `${this.baseUrl}/ValueSet/$expand?url=${encodeURIComponent(implicitVsUrl)}&count=${limit}`;

    const response = await this.fetchWithTimeout(url, this.evaluationTimeout);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as FhirOperationOutcomeResponse | null;
      const issue = data?.issue?.[0]?.diagnostics ?? data?.issue?.[0]?.details?.text ?? `HTTP ${response.status}`;

      // Clean up FHIR OperationOutcome messages: strip server UUIDs and add context
      // when filter syntax is rejected by the server's ECL parser
      if (expression.includes('{{') && /no viable alternative/i.test(issue)) {
        // Strip UUID prefix like "[d4ac2525-...]: "
        const cleaned = issue.replace(/^\[[0-9a-f-]+\]:\s*/i, '');
        throw new Error(
          `FHIR evaluation failed: ${cleaned}\n` +
            'Note: Some ECL 2.2 filter syntax (e.g. {{ D id = ... }}) may not be supported by this terminology server.',
        );
      }

      throw new Error(`FHIR evaluation failed: ${issue}`);
    }

    const data = (await response.json()) as FhirValueSetResponse;
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

  private async searchByFilter(filter: string): Promise<SearchResponse> {
    const url = `${this.baseUrl}/ValueSet/$expand?url=${this.snomedSystemUrl}?fhir_vs&filter=${encodeURIComponent(filter)}&count=21&includeDesignations=true&activeOnly=true`;

    const response = await this.fetchWithTimeout(url, this.searchTimeout);

    if (!response.ok) {
      throw new Error(`FHIR request failed: ${response.status}`);
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
    const response = await this.fetchWithTimeout(url, this.searchTimeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch SNOMED editions: HTTP ${response.status}`);
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
