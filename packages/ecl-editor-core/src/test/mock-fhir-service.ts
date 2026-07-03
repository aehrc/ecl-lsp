// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { vi } from 'vitest';

/** Constructor options shape asserted on in tests that spy on FhirTerminologyService. */
export interface FhirTerminologyServiceCtorOptions {
  baseUrl?: string;
  snomedVersion?: string;
  eclEvaluationStrategy?: string;
}

/**
 * Mock constructor for FhirTerminologyService, shared by the vi.mock('@aehrc/ecl-core')
 * factories in this package's test files. A named function expression (not an arrow
 * function) so `new FhirTerminologyService(...)` in production code invokes it as a real
 * constructor and uses its returned stub — no network calls are made.
 */
export function createFhirTerminologyServiceMock() {
  return vi.fn().mockImplementation(function FhirTerminologyServiceMock() {
    return {
      async getConceptInfo() {
        return null;
      },
      async validateConcepts(ids: string[]) {
        return new Map(ids.map((id) => [id, null]));
      },
      async searchConcepts() {
        return { results: [], hasMore: false };
      },
      async evaluateEcl() {
        return { total: 0, concepts: [], truncated: false };
      },
    };
  });
}
