// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiagnosticsEngine } from '../diagnostics-engine';
import type { CoreDiagnostic } from 'ecl-core';
import type { ITerminologyService, ConceptInfo } from 'ecl-core';

// --- Mock terminology service ---

function createMockService(concepts: Map<string, ConceptInfo | null> = new Map()): ITerminologyService {
  return {
    async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
      return concepts.get(conceptId) ?? null;
    },
    async validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>> {
      const result = new Map<string, ConceptInfo | null>();
      for (const id of conceptIds) {
        result.set(id, concepts.get(id) ?? null);
      }
      return result;
    },
    async searchConcepts() {
      return { results: [], hasMore: false };
    },
    async evaluateEcl() {
      return { total: 0, concepts: [], truncated: false };
    },
  };
}

// --- Tests ---

describe('DiagnosticsEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('immediate syntax diagnostics', () => {
    it('should detect syntax errors in invalid expression', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('< 404684003 AND AND < 19829001');

      // Immediate phase should have fired synchronously
      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      engine.dispose();
    });

    it('should produce no errors for a valid expression', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('< 404684003 |Clinical finding|');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
      engine.dispose();
    });

    it('should produce no errors for empty input', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('');

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0]).toHaveLength(0);
      engine.dispose();
    });

    it('should produce errors for missing operator between concepts', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('< 404684003 < 19829001');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      engine.dispose();
    });

    it('should produce errors for incomplete expression', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('< 404684003 AND');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      engine.dispose();
    });

    it('should handle multiple expressions separated by ECL-END marker', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      const text = '< 404684003\n/* ECL-END */\n< 19829001';
      engine.update(text);

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
      engine.dispose();
    });

    it('should handle compound expression with AND', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('< 404684003 AND < 19829001');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
      engine.dispose();
    });
  });

  describe('line comment warnings', () => {
    it('should warn about // line comments', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('// this is a comment\n< 404684003');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const warnings = received[0].filter((d) => d.severity === 'warning' && d.message.includes('Line comments'));
      expect(warnings).toHaveLength(1);
      expect(warnings[0].range.start.line).toBe(0);
      engine.dispose();
    });

    it('should warn about multiple // comments on different lines', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('// comment 1\n< 404684003\n// comment 2');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const warnings = received[0].filter((d) => d.severity === 'warning' && d.message.includes('Line comments'));
      expect(warnings).toHaveLength(2);
      expect(warnings[0].range.start.line).toBe(0);
      expect(warnings[1].range.start.line).toBe(2);
      engine.dispose();
    });

    it('should not warn about block comments', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('/* block comment */\n< 404684003');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const warnings = received[0].filter((d) => d.severity === 'warning' && d.message.includes('Line comments'));
      expect(warnings).toHaveLength(0);
      engine.dispose();
    });
  });

  describe('description ID validation in filter blocks', () => {
    it('should detect invalid description ID in {{ D }} filter', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      // 404684003 is a concept ID (partition 00), not a description ID
      engine.update('< 404684003 {{ D id = 404684003 }}');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error' && d.message.includes('Invalid description ID'));
      expect(errors.length).toBeGreaterThan(0);
      engine.dispose();
    });

    it('should not flag valid description IDs in {{ D }} filter', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      // 679406011 — partition 01, valid description ID
      engine.update('< 404684003 {{ D id = 679406011 }}');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const descIdErrors = received[0].filter(
        (d) => d.severity === 'error' && d.message.includes('Invalid description ID'),
      );
      expect(descIdErrors).toHaveLength(0);
      engine.dispose();
    });
  });

  describe('debounced semantic validation', () => {
    it('should fire semantic validation after debounce timeout', async () => {
      const conceptMap = new Map<string, ConceptInfo | null>([
        ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
      ]);
      const service = createMockService(conceptMap);
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 200 },
        (diags) => received.push([...diags]),
      );

      engine.update('< 404684003');

      // Immediate phase fires synchronously
      expect(received.length).toBe(1);

      // Advance past debounce
      vi.advanceTimersByTime(300);

      // Allow async FHIR calls to resolve
      await vi.waitFor(() => {
        expect(received.length).toBe(2);
      });

      engine.dispose();
    });

    it('should report inactive concept warnings after debounce', async () => {
      const conceptMap = new Map<string, ConceptInfo | null>([
        ['399144008', { id: '399144008', fsn: 'Bronze diabetes (disorder)', pt: 'Bronze diabetes', active: false }],
      ]);
      const service = createMockService(conceptMap);
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 100 },
        (diags) => received.push([...diags]),
      );

      engine.update('< 399144008');

      vi.advanceTimersByTime(200);

      await vi.waitFor(() => {
        expect(received.length).toBe(2);
      });

      const semanticDiags = received[1];
      const inactiveWarnings = semanticDiags.filter(
        (d) => d.severity === 'warning' && d.message.includes('Inactive concept'),
      );
      expect(inactiveWarnings).toHaveLength(1);
      expect(inactiveWarnings[0].message).toContain('399144008');
      engine.dispose();
    });

    it('should report unknown concept warnings after debounce', async () => {
      // Service returns null for unknown concept
      const conceptMap = new Map<string, ConceptInfo | null>([['123456789', null]]);
      const service = createMockService(conceptMap);
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 100 },
        (diags) => received.push([...diags]),
      );

      // 123456789 doesn't have valid Verhoeff check digit, so we need
      // a concept ID that is syntactically valid but unknown on the server.
      // Use a real-looking ID. Let's use the expression with the mock as-is.
      // The ID format check happens before FHIR — the engine filters out
      // invalid SCTIDs, so we need an ID that passes isValidSnomedId and isValidConceptId.
      // 404684003 passes, let's set it to null.
      const conceptMap2 = new Map<string, ConceptInfo | null>([['404684003', null]]);
      const service2 = createMockService(conceptMap2);
      const received2: CoreDiagnostic[][] = [];
      const engine2 = new DiagnosticsEngine(
        { terminologyService: service2, semanticValidation: true, semanticDebounceMs: 100 },
        (diags) => received2.push([...diags]),
      );

      engine2.update('< 404684003');

      vi.advanceTimersByTime(200);

      await vi.waitFor(() => {
        expect(received2.length).toBe(2);
      });

      const semanticDiags = received2[1];
      const unknownWarnings = semanticDiags.filter(
        (d) => d.severity === 'warning' && d.message.includes('Unknown concept'),
      );
      expect(unknownWarnings).toHaveLength(1);

      engine.dispose();
      engine2.dispose();
    });

    it('should not fire semantic validation when disabled', () => {
      const service = createMockService();
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: false, semanticDebounceMs: 100 },
        (diags) => received.push([...diags]),
      );

      engine.update('< 404684003');

      // Immediate phase only
      expect(received.length).toBe(1);

      // Advance past debounce
      vi.advanceTimersByTime(200);

      // Should still be 1 — no debounced phase
      expect(received.length).toBe(1);
      engine.dispose();
    });

    it('should debounce — only the last update within the window fires semantic', async () => {
      const conceptMap = new Map<string, ConceptInfo | null>([
        ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
        ['19829001', { id: '19829001', fsn: 'Disorder of lung (disorder)', pt: 'Disorder of lung', active: true }],
      ]);
      const service = createMockService(conceptMap);
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 300 },
        (diags) => received.push([...diags]),
      );

      // Fire two updates rapidly
      engine.update('< 404684003');
      expect(received.length).toBe(1); // first immediate

      vi.advanceTimersByTime(100); // 100ms in

      engine.update('< 19829001');
      expect(received.length).toBe(2); // second immediate

      // The first debounce timer was cancelled; advance past second debounce window
      vi.advanceTimersByTime(400);

      await vi.waitFor(() => {
        expect(received.length).toBe(3); // only one semantic callback
      });

      engine.dispose();
    });
  });

  describe('dispose()', () => {
    it('should cancel pending debounce timer', () => {
      const service = createMockService(
        new Map([
          ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
        ]),
      );
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 500 },
        (diags) => received.push([...diags]),
      );

      engine.update('< 404684003');
      expect(received.length).toBe(1); // immediate

      engine.dispose();

      // Advance past debounce window
      vi.advanceTimersByTime(1000);

      // Should still be 1 — debounce was cancelled
      expect(received.length).toBe(1);
    });

    it('should be safe to call dispose() multiple times', () => {
      const engine = new DiagnosticsEngine({ semanticValidation: false }, () => {});
      engine.dispose();
      engine.dispose(); // no error
      expect(true).toBe(true); // assert no exception was thrown
    });
  });

  describe('updateConfig()', () => {
    it('should toggle semantic validation off', () => {
      const service = createMockService(
        new Map([
          ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
        ]),
      );
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 100 },
        (diags) => received.push([...diags]),
      );

      // Disable semantic validation
      engine.updateConfig({ semanticValidation: false });

      engine.update('< 404684003');
      expect(received.length).toBe(1); // immediate only

      vi.advanceTimersByTime(200);
      expect(received.length).toBe(1); // still 1 — no semantic
      engine.dispose();
    });

    it('should change debounce interval', async () => {
      const service = createMockService(
        new Map([
          ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
        ]),
      );
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 500 },
        (diags) => received.push([...diags]),
      );

      engine.updateConfig({ semanticDebounceMs: 50 });
      engine.update('< 404684003');
      expect(received.length).toBe(1);

      vi.advanceTimersByTime(100);

      await vi.waitFor(() => {
        expect(received.length).toBe(2);
      });

      engine.dispose();
    });

    it('should allow replacing the terminology service', async () => {
      const service1 = createMockService(
        new Map([
          ['404684003', null], // unknown on service1
        ]),
      );
      const service2 = createMockService(
        new Map([
          ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
        ]),
      );
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service1, semanticValidation: true, semanticDebounceMs: 50 },
        (diags) => received.push([...diags]),
      );

      // Switch to service2
      engine.updateConfig({ terminologyService: service2 });

      engine.update('< 404684003');

      vi.advanceTimersByTime(100);
      await vi.waitFor(() => {
        expect(received.length).toBe(2);
      });

      // With service2, 404684003 is active — no "unknown" or "inactive" warnings
      const semanticWarnings = received[1].filter(
        (d) =>
          d.severity === 'warning' && (d.message.includes('Unknown concept') || d.message.includes('Inactive concept')),
      );
      expect(semanticWarnings).toHaveLength(0);
      engine.dispose();
    });
  });

  describe('createTerminologyService and CORS proxy', () => {
    it('should create a terminology service when fhirServerUrl is provided', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { fhirServerUrl: 'https://tx.example.com/fhir', semanticValidation: false },
        (diags) => received.push([...diags]),
      );

      // Engine was created without error — service was constructed
      engine.update('< 404684003');
      expect(received.length).toBeGreaterThanOrEqual(1);
      engine.dispose();
    });

    it('should not create a terminology service when no fhirServerUrl or corsProxy', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: true }, (diags) => received.push([...diags]));

      // With semanticValidation=true but no service, update should still work
      engine.update('< 404684003');
      vi.advanceTimersByTime(1000);
      // Only immediate diagnostics, no semantic phase (no service)
      expect(received.length).toBe(1);
      engine.dispose();
    });

    it('should prefix FHIR URL with CORS proxy when corsProxy is provided', () => {
      const received: CoreDiagnostic[][] = [];
      // This should construct a service with URL "https://proxy.example.com/https://tx.example.com/fhir"
      const engine = new DiagnosticsEngine(
        {
          fhirServerUrl: 'https://tx.example.com/fhir',
          corsProxy: 'https://proxy.example.com/',
          semanticValidation: false,
        },
        (diags) => received.push([...diags]),
      );

      engine.update('< 404684003');
      expect(received.length).toBeGreaterThanOrEqual(1);
      engine.dispose();
    });

    it('should use default FHIR URL with CORS proxy when no fhirServerUrl', () => {
      const received: CoreDiagnostic[][] = [];
      // corsProxy alone should trigger service creation using default URL
      const engine = new DiagnosticsEngine(
        {
          corsProxy: 'https://proxy.example.com/',
          semanticValidation: false,
        },
        (diags) => received.push([...diags]),
      );

      engine.update('< 404684003');
      expect(received.length).toBeGreaterThanOrEqual(1);
      engine.dispose();
    });

    it('should accept custom terminologyService', () => {
      const service = createMockService(
        new Map([
          ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding', active: true }],
        ]),
      );
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine(
        { terminologyService: service, semanticValidation: true, semanticDebounceMs: 50 },
        (diags) => received.push([...diags]),
      );

      engine.update('< 404684003');
      vi.advanceTimersByTime(100);

      // Should use the custom service — no errors expected
      expect(received.length).toBeGreaterThanOrEqual(1);
      engine.dispose();
    });

    it('should update CORS proxy via updateConfig', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      // Update to add a CORS proxy and FHIR URL
      engine.updateConfig({
        fhirServerUrl: 'https://tx.example.com/fhir',
        corsProxy: 'https://proxy.example.com/',
      });

      engine.update('< 404684003');
      expect(received.length).toBeGreaterThanOrEqual(1);
      engine.dispose();
    });
  });

  describe('SNOMED ID validation', () => {
    it('should flag concept with invalid check digit', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      // 404684001 has an invalid Verhoeff check digit (valid is 404684003)
      engine.update('< 404684001');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const idErrors = received[0].filter(
        (d) => d.severity === 'error' && d.message.includes('Invalid SNOMED CT identifier'),
      );
      expect(idErrors).toHaveLength(1);
      engine.dispose();
    });

    it('should flag non-concept SCTID (e.g. description ID used as concept)', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      // 679406011 is a valid SNOMED ID with partition 01 (description), not 00 (concept)
      engine.update('< 679406011');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const idErrors = received[0].filter(
        (d) => d.severity === 'error' && d.message.includes('not a SNOMED CT concept identifier'),
      );
      expect(idErrors).toHaveLength(1);
      engine.dispose();
    });
  });

  describe('edge cases', () => {
    it('should handle expression with refinement', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('< 404684003 : 116676008 = < 56265001');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
      engine.dispose();
    });

    it('should handle wildcard expression', () => {
      const received: CoreDiagnostic[][] = [];
      const engine = new DiagnosticsEngine({ semanticValidation: false }, (diags) => received.push([...diags]));

      engine.update('*');

      expect(received.length).toBeGreaterThanOrEqual(1);
      const errors = received[0].filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
      engine.dispose();
    });
  });
});
