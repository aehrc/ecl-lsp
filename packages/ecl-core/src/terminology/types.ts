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

export interface ITerminologyService {
  getConceptInfo(conceptId: string): Promise<ConceptInfo | null>;
  validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>>;
  searchConcepts(query: string): Promise<SearchResponse>;
  evaluateEcl(expression: string, limit?: number): Promise<EvaluationResponse>;
}
