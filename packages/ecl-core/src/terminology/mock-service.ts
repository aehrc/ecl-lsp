// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { ITerminologyService, ConceptInfo, SearchResponse, EvaluationResponse } from './types';

/* eslint-disable @typescript-eslint/require-await -- interface mandates async; mock returns synchronously */
export class MockTerminologyService implements ITerminologyService {
  private readonly mockData = new Map<string, ConceptInfo>([
    ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
    ['64572001', { id: '64572001', fsn: 'Disease (disorder)', pt: 'Disease', active: true }],
    ['19829001', { id: '19829001', fsn: 'Disorder of lung (disorder)', pt: 'Disorder of lung', active: true }],
    ['301867009', { id: '301867009', fsn: 'Edema of trunk (finding)', pt: 'Edema of trunk', active: true }],
    [
      '39057004',
      {
        id: '39057004',
        fsn: 'Pulmonary valve structure (body structure)',
        pt: 'Pulmonary valve structure',
        active: true,
      },
    ],
    ['363698007', { id: '363698007', fsn: 'Finding site (attribute)', pt: 'Finding site', active: true }],
    ['123037004', { id: '123037004', fsn: 'Body structure (body structure)', pt: 'Body structure', active: true }],
    ['71388002', { id: '71388002', fsn: 'Procedure (procedure)', pt: 'Procedure', active: true }],
    ['123456001', { id: '123456001', fsn: 'Inactive concept (finding)', pt: 'Inactive concept', active: false }],
    ['246454002', { id: '246454002', fsn: 'Occurrence (attribute)', pt: 'Occurrence', active: true }],
  ]);

  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    return this.mockData.get(conceptId) ?? null;
  }

  async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
    const results = new Map<string, ConceptInfo | null>();
    for (const id of conceptIds) {
      results.set(id, this.mockData.get(id) ?? null);
    }
    return results;
  }

  async searchConcepts(query: string): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      return { results: [], hasMore: false };
    }

    const results = Array.from(this.mockData.values())
      .filter(
        (concept) =>
          concept.active &&
          (concept.id.includes(query) ||
            concept.fsn.toLowerCase().includes(query.toLowerCase()) ||
            concept.pt.toLowerCase().includes(query.toLowerCase())),
      )
      .slice(0, 20)
      .map((c) => ({ id: c.id, fsn: c.fsn, pt: c.pt }));

    return { results, hasMore: false };
  }

  /** Mock results for filter ECL constraint expansions. */
  private readonly filterResults = new Map<string, { code: string; display: string }[]>([
    [
      '< 900000000000446008',
      [
        { code: '900000000000003001', display: 'Fully specified name' },
        { code: '900000000000013009', display: 'Synonym' },
        { code: '900000000000550004', display: 'Definition' },
      ],
    ],
    [
      '< 900000000000506000',
      [
        { code: '900000000000509007', display: 'United States of America English language reference set' },
        { code: '900000000000508004', display: 'Great Britain English language reference set' },
        { code: '32570271000036106', display: 'Australian English language reference set' },
        { code: '21000220103', display: 'New Zealand English language reference set' },
      ],
    ],
    [
      '< 900000000000443000',
      [
        { code: '900000000000207008', display: 'SNOMED CT core module' },
        { code: '900000000000012004', display: 'SNOMED CT model component module' },
        { code: '32506021000036107', display: 'Australian module' },
        { code: '731000124108', display: 'US National Library of Medicine maintained module' },
        { code: '999000011000000103', display: 'United Kingdom Edition clinical module' },
      ],
    ],
  ]);

  async evaluateEcl(expression: string, limit = 200): Promise<EvaluationResponse> {
    if (!expression || expression.trim().length === 0) {
      return { total: 0, concepts: [], truncated: false };
    }

    // Check for filter constraint expressions first
    const filterConcepts = this.filterResults.get(expression.trim());
    if (filterConcepts) {
      const concepts = filterConcepts.slice(0, limit);
      return {
        total: filterConcepts.length,
        concepts,
        truncated: filterConcepts.length > concepts.length,
      };
    }

    const allActive = Array.from(this.mockData.values())
      .filter((c) => c.active)
      .map((c) => ({ code: c.id, display: c.pt }));

    const total = allActive.length;
    const concepts = allActive.slice(0, limit);

    return {
      total,
      concepts,
      truncated: total > concepts.length,
    };
  }
}
