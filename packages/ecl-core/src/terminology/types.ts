// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// FHIR-aligned terminology service types

export interface ConceptInfo {
  id: string;
  fsn: string; // Fully Specified Name
  pt: string; // Preferred Term
  active: boolean;
}

export interface ConceptSearchResult {
  id: string;
  fsn: string; // Fully Specified Name
  pt: string; // Preferred Term
}

export interface SearchResponse {
  results: ConceptSearchResult[];
  hasMore: boolean;
}

export interface EvaluationConcept {
  code: string;
  display: string;
}

export interface EvaluationResponse {
  total: number;
  concepts: EvaluationConcept[];
  truncated: boolean;
}

export type HistoricalAssociationType = 'same-as' | 'replaced-by' | 'possibly-equivalent-to' | 'alternative';

export interface HistoricalAssociation {
  type: HistoricalAssociationType;
  refsetId: string;
  targets: { code: string; display: string }[];
}

/**
 * A source of SNOMED CT terminology facts.
 *
 * **Failure contract.** Implementations MUST distinguish "the server told me
 * this concept does not exist" from "I could not ask the server". A `null`
 * result is a factual claim about SNOMED CT content and is only permitted for
 * the former; every failure — connection refused, DNS failure, timeout, HTTP
 * error status, unreadable body — MUST reject with a `TerminologyError`
 * (`TerminologyTransportError` or `TerminologyHttpError`), so that callers can
 * classify it structurally via its `kind` discriminant and `status`, rather
 * than rendering an outage as "concept not found".
 */
export interface ITerminologyService {
  /**
   * Look up a single concept.
   *
   * @returns the concept, or `null` ONLY when the terminology server gave a
   *   well-formed answer saying the code is unknown to it.
   * @throws `TerminologyTransportError` when the server could not be reached,
   *   the request timed out, or the response was unusable.
   * @throws `TerminologyHttpError` when the server answered with an error status.
   */
  getConceptInfo(conceptId: string): Promise<ConceptInfo | null>;

  /**
   * Validate a batch of concepts.
   *
   * @returns a map from concept ID to its info, or to `null` ONLY when the
   *   server positively reported that code as unknown.
   * @throws `TerminologyTransportError` / `TerminologyHttpError` on failure —
   *   never a map full of `null`s.
   */
  validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>>;

  /**
   * Search for concepts by text or SCTID.
   *
   * @returns matches; an empty result set means the server found none.
   * @throws `TerminologyTransportError` / `TerminologyHttpError` on failure —
   *   never an empty result set, and never an opaque generic `Error`.
   */
  searchConcepts(query: string): Promise<SearchResponse>;

  /** Expand an ECL expression. Throws on failure. */
  evaluateEcl(expression: string, limit?: number): Promise<EvaluationResponse>;

  /** Historical associations for an inactive concept, if the source supports them. */
  getHistoricalAssociations?(conceptId: string): Promise<HistoricalAssociation[]>;
}
