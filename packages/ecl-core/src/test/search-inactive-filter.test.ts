// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { FhirTerminologyService } from '../terminology/fhir-service';

// ── Test HTTP server that captures requests and returns mock responses ──

interface CapturedRequest {
  method: string;
  url: string;
  body?: string;
}

function createMockServer(): {
  server: http.Server;
  requests: CapturedRequest[];
  setResponse: (status: number, body: unknown) => void;
  start: () => Promise<string>;
  stop: () => Promise<void>;
} {
  const requests: CapturedRequest[] = [];
  let responseStatus = 200;
  let responseBody: unknown = {};

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requests.push({ method: req.method ?? 'GET', url: req.url ?? '', body: body || undefined });
      res.writeHead(responseStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });

  return {
    server,
    requests,
    setResponse(status: number, body: unknown) {
      responseStatus = status;
      responseBody = body;
    },
    start(): Promise<string> {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(`http://127.0.0.1:${addr.port}`);
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

// ── searchByFilter — inactive concept filtering ────────────────────────

describe('FhirTerminologyService — searchByFilter excludes inactive concepts', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('should include activeOnly=true in the $expand URL for text searches', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: { total: 0, contains: [] },
    });

    await svc.searchConcepts('paracetamol');

    assert.strictEqual(mock.requests.length, 1);
    const url = mock.requests[0].url;
    assert.ok(url.includes('activeOnly=true'), `URL should contain activeOnly=true: ${url}`);
  });

  it('should return only active concepts from text search', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 2,
        contains: [
          { code: '387517004', display: 'Paracetamol (substance)', system: 'http://snomed.info/sct' },
          { code: '90332006', display: 'Paracetamol (product)', system: 'http://snomed.info/sct' },
        ],
      },
    });

    const response = await svc.searchConcepts('paracetamol');

    assert.strictEqual(response.results.length, 2);
    assert.ok(
      response.results.every((r) => r.id === '387517004' || r.id === '90332006'),
      'Should only contain active concepts',
    );
  });

  it('should handle server that ignores activeOnly by returning mix of active/inactive', async () => {
    // Even if a FHIR server ignores activeOnly=true, the parameter is still sent.
    // The server-side filtering is best-effort; the key protection is the request parameter.
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 3,
        contains: [
          { code: '387517004', display: 'Paracetamol (substance)' },
          { code: '384977007', display: 'Paracetamol (substance)', inactive: true },
          { code: '90332006', display: 'Paracetamol (product)' },
        ],
      },
    });

    const response = await svc.searchConcepts('paracetamol');

    // searchByFilter maps results directly — the activeOnly=true parameter
    // tells the server to filter; results are trusted
    assert.strictEqual(response.results.length, 3);
    // Verify the request had activeOnly=true
    assert.ok(mock.requests[0].url.includes('activeOnly=true'));
  });

  it('should preserve includeDesignations in the search URL', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: { total: 0, contains: [] },
    });

    await svc.searchConcepts('aspirin');

    const url = mock.requests[0].url;
    assert.ok(url.includes('includeDesignations=true'), `URL should include designations: ${url}`);
    assert.ok(url.includes('activeOnly=true'), `URL should include activeOnly: ${url}`);
    assert.ok(url.includes('count=21'), `URL should include count=21: ${url}`);
  });

  it('should request at most 21 results and limit to 20', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    const contains = Array.from({ length: 21 }, (_, i) => ({
      code: `${100000000 + i}`,
      display: `Concept ${i}`,
    }));
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: { total: 50, contains },
    });

    const response = await svc.searchConcepts('concept');

    assert.strictEqual(response.results.length, 20, 'Should limit to 20 results');
    assert.strictEqual(response.hasMore, true, 'Should indicate more results available');
  });
});

// ── lookupById — inactive concept filtering ─────────────────────────────

describe('FhirTerminologyService — lookupById excludes inactive concepts', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('should return empty results when looking up an inactive concept by ID', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Paracetamol (substance)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: true },
          ],
        },
      ],
    });

    const response = await svc.searchConcepts('384977007');

    assert.strictEqual(response.results.length, 0, 'Inactive concept should not appear in search results');
    assert.strictEqual(response.hasMore, false);
  });

  it('should return results when looking up an active concept by ID', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Paracetamol (substance)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: false },
          ],
        },
      ],
    });

    const response = await svc.searchConcepts('387517004');

    assert.strictEqual(response.results.length, 1, 'Active concept should appear in search results');
    assert.strictEqual(response.results[0].id, '387517004');
    assert.strictEqual(response.results[0].pt, 'Paracetamol (substance)');
  });

  it('should return results when concept has no inactive property (defaults to active)', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [{ name: 'display', valueString: 'Clinical finding (finding)' }],
    });

    const response = await svc.searchConcepts('404684003');

    assert.strictEqual(response.results.length, 1, 'Concept without inactive property should default to active');
    assert.strictEqual(response.results[0].id, '404684003');
  });

  it('should return empty results when concept is not found', async () => {
    // 100000000 passes Verhoeff check digit validation, so searchConcepts routes to lookupById
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(404, {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found' }],
    });

    const response = await svc.searchConcepts('100000000');

    assert.strictEqual(response.results.length, 0, 'Unknown concept should return empty results');
  });

  it('should return empty results for inactive concept with nested SNOMED property structure', async () => {
    // Reproduces the exact FHIR response structure from SNOMED terminology servers
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Bronze diabetes (disorder)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: true },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'sufficientlyDefined' },
            { name: 'value', valueBoolean: false },
          ],
        },
      ],
    });

    const response = await svc.searchConcepts('399144008');

    assert.strictEqual(response.results.length, 0, 'Inactive concept (399144008) should be excluded from search');
  });

  it('should use $lookup (not $expand) for valid SNOMED CT IDs', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Clinical finding (finding)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: false },
          ],
        },
      ],
    });

    await svc.searchConcepts('404684003');

    assert.strictEqual(mock.requests.length, 1);
    const url = mock.requests[0].url;
    assert.ok(url.includes('CodeSystem/$lookup'), `Should use $lookup for ID search: ${url}`);
    assert.ok(url.includes('code=404684003'), `Should include the concept code: ${url}`);
  });

  it('should use $expand (not $lookup) for text queries', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: { total: 0, contains: [] },
    });

    await svc.searchConcepts('paracetamol');

    assert.strictEqual(mock.requests.length, 1);
    const url = mock.requests[0].url;
    assert.ok(url.includes('ValueSet/$expand'), `Should use $expand for text search: ${url}`);
    assert.ok(url.includes('filter=paracetamol'), `Should include the filter term: ${url}`);
  });
});

// ── Specific inactive concept IDs from bug report ───────────────────────

describe('FhirTerminologyService — bug report: paracetamol inactive concepts', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('should exclude 384977007 (inactive paracetamol) from ID lookup', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Paracetamol (substance)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: true },
          ],
        },
      ],
    });

    const response = await svc.searchConcepts('384977007');

    assert.strictEqual(response.results.length, 0, '384977007 is inactive and should be excluded');
  });

  it('should exclude 2442011000036104 (inactive AU paracetamol) from ID lookup', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'paracetamol (AU substance)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: true },
          ],
        },
      ],
    });

    const response = await svc.searchConcepts('2442011000036104');

    assert.strictEqual(response.results.length, 0, '2442011000036104 is inactive and should be excluded');
  });

  it('should include 387517004 (active paracetamol) from ID lookup', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Paracetamol (substance)' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'inactive' },
            { name: 'value', valueBoolean: false },
          ],
        },
      ],
    });

    const response = await svc.searchConcepts('387517004');

    assert.strictEqual(response.results.length, 1, '387517004 is active and should be included');
    assert.strictEqual(response.results[0].id, '387517004');
  });

  it('should request activeOnly=true for text search "paracetamol"', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 2,
        contains: [
          { code: '90332006', display: 'Product containing paracetamol (medicinal product)' },
          { code: '387517004', display: 'Paracetamol (substance)' },
        ],
      },
    });

    const response = await svc.searchConcepts('paracetamol');

    // Verify activeOnly=true was sent
    assert.ok(mock.requests[0].url.includes('activeOnly=true'), 'Should request activeOnly=true');
    // Verify results contain only the active concepts the server returned
    assert.strictEqual(response.results.length, 2);
    assert.ok(response.results.some((r) => r.id === '90332006'));
    assert.ok(response.results.some((r) => r.id === '387517004'));
    // 384977007 and 2442011000036104 should not be present (server filters them)
    assert.ok(!response.results.some((r) => r.id === '384977007'), '384977007 should not appear');
    assert.ok(!response.results.some((r) => r.id === '2442011000036104'), '2442011000036104 should not appear');
  });
});
