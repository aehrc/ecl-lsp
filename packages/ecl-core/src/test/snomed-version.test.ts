// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { FhirTerminologyService, SnomedEdition } from '../terminology/fhir-service';

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

// ── Mock FHIR responses ─────────────────────────────────────────────────

const MOCK_LOOKUP_RESPONSE = {
  resourceType: 'Parameters',
  parameter: [
    { name: 'display', valueString: 'Clinical finding (finding)' },
    { name: 'version', valueUri: 'http://snomed.info/sct/900000000000207008/version/20250301' },
    {
      name: 'property',
      part: [
        { name: 'code', valueCode: 'inactive' },
        { name: 'value', valueBoolean: false },
      ],
    },
  ],
};

const MOCK_EXPAND_RESPONSE = {
  resourceType: 'ValueSet',
  expansion: {
    total: 2,
    parameter: [{ name: 'version', valueUri: 'http://snomed.info/sct/32506021000036107/version/20260131' }],
    contains: [
      { code: '404684003', display: 'Clinical finding' },
      { code: '19829001', display: 'Disorder of lung' },
    ],
  },
};

const MOCK_EDITION_BUNDLE = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'CodeSystem',
        version: 'http://snomed.info/sct/900000000000207008/version/20250301',
      },
    },
    {
      resource: {
        resourceType: 'CodeSystem',
        version: 'http://snomed.info/sct/900000000000207008/version/20240901',
      },
    },
    {
      resource: {
        resourceType: 'CodeSystem',
        version: 'http://snomed.info/sct/32506021000036107/version/20260131',
      },
    },
    {
      resource: {
        resourceType: 'CodeSystem',
        version: 'http://snomed.info/sct/32506021000036107/version/20250731',
      },
    },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────

describe('FhirTerminologyService — SNOMED version threading', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  // 9.1 Constructor stores snomedVersion field
  describe('constructor', () => {
    it('should store snomedVersion when provided', () => {
      const svc = new FhirTerminologyService({
        baseUrl,
        timeout: 2000,
        snomedVersion: 'http://snomed.info/sct/32506021000036107/version/20260131',
      });
      assert.strictEqual(svc.getResolvedVersion(), null, 'resolved version starts null');
    });

    it('should treat empty string as no version', async () => {
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: '' });
      mock.setResponse(200, MOCK_EXPAND_RESPONSE);
      await svc.evaluateEcl('<< 404684003');
      // URL should use default system URL (no version in path)
      const url = mock.requests[0].url;
      assert.ok(url.includes('http%3A%2F%2Fsnomed.info%2Fsct%3Ffhir_vs'), 'should use default system URL');
    });

    it('should trim whitespace from snomedVersion', async () => {
      const svc = new FhirTerminologyService({
        baseUrl,
        timeout: 2000,
        snomedVersion: '  http://snomed.info/sct/32506021000036107  ',
      });
      mock.setResponse(200, MOCK_EXPAND_RESPONSE);
      await svc.evaluateEcl('<< 404684003');
      const url = mock.requests[0].url;
      assert.ok(
        url.includes(encodeURIComponent('http://snomed.info/sct/32506021000036107')),
        'should use trimmed version in URL',
      );
    });
  });

  // 9.2 getConceptInfo URL includes version parameter
  describe('getConceptInfo — version threading', () => {
    it('should append version parameter when snomedVersion is set', async () => {
      const version = 'http://snomed.info/sct/32506021000036107/version/20260131';
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version });
      mock.setResponse(200, MOCK_LOOKUP_RESPONSE);

      await svc.getConceptInfo('404684003');

      assert.strictEqual(mock.requests.length, 1);
      const url = mock.requests[0].url;
      assert.ok(url.includes(`version=${encodeURIComponent(version)}`), `URL should include version param: ${url}`);
    });

    // 9.6 Unversioned URL when no snomedVersion
    it('should not include version parameter when snomedVersion is not set', async () => {
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, MOCK_LOOKUP_RESPONSE);

      await svc.getConceptInfo('404684003');

      const url = mock.requests[0].url;
      assert.ok(!url.includes('version='), `URL should not include version param: ${url}`);
    });

    // 9.7 Edition-only URI works
    it('should work with edition-only URI (no /version/ suffix)', async () => {
      const svc = new FhirTerminologyService({
        baseUrl,
        timeout: 2000,
        snomedVersion: 'http://snomed.info/sct/32506021000036107',
      });
      mock.setResponse(200, MOCK_LOOKUP_RESPONSE);

      await svc.getConceptInfo('404684003');

      const url = mock.requests[0].url;
      assert.ok(
        url.includes(`version=${encodeURIComponent('http://snomed.info/sct/32506021000036107')}`),
        `URL should include edition-only version: ${url}`,
      );
    });
  });

  // 9.3 evaluateEcl URL uses versioned implicit ValueSet URL
  describe('evaluateEcl — version threading', () => {
    it('should use versioned implicit ValueSet URL when snomedVersion is set', async () => {
      const version = 'http://snomed.info/sct/32506021000036107/version/20260131';
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version });
      mock.setResponse(200, MOCK_EXPAND_RESPONSE);

      await svc.evaluateEcl('<< 404684003');

      const url = mock.requests[0].url;
      const expectedBase = encodeURIComponent(`${version}?fhir_vs=ecl/`);
      assert.ok(url.includes(expectedBase), `URL should contain versioned implicit VS URL: ${url}`);
    });

    // 9.6
    it('should use default system URL when snomedVersion is not set', async () => {
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, MOCK_EXPAND_RESPONSE);

      await svc.evaluateEcl('<< 404684003');

      const url = mock.requests[0].url;
      assert.ok(
        url.includes(encodeURIComponent('http://snomed.info/sct?fhir_vs=ecl/')),
        `URL should use default system URL: ${url}`,
      );
    });

    // 9.7
    it('should work with edition-only URI for evaluateEcl', async () => {
      const svc = new FhirTerminologyService({
        baseUrl,
        timeout: 2000,
        snomedVersion: 'http://snomed.info/sct/32506021000036107',
      });
      mock.setResponse(200, MOCK_EXPAND_RESPONSE);

      await svc.evaluateEcl('<< 404684003');

      const url = mock.requests[0].url;
      assert.ok(
        url.includes(encodeURIComponent('http://snomed.info/sct/32506021000036107?fhir_vs=ecl/')),
        `URL should contain edition-only implicit VS URL: ${url}`,
      );
    });
  });

  // 9.4 bulkExpand POST body includes version in compose include
  describe('bulkExpand — version threading', () => {
    it('should include version in compose include when snomedVersion is set', async () => {
      const version = 'http://snomed.info/sct/32506021000036107/version/20260131';
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
      });

      // bulkExpand is private, so we call validateConcepts which triggers it
      await svc.validateConcepts(['404684003']);

      // Find the POST request (bulkExpand uses POST)
      const postReq = mock.requests.find((r) => r.method === 'POST');
      assert.ok(postReq, 'Should make a POST request for bulk expand');
      const body = JSON.parse(postReq.body!);
      assert.strictEqual(body.compose.include[0].version, version, 'compose include should contain version');
    });

    // 9.6
    it('should not include version in compose include when snomedVersion is not set', async () => {
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
      });

      await svc.validateConcepts(['404684003']);

      const postReq = mock.requests.find((r) => r.method === 'POST');
      assert.ok(postReq, 'Should make a POST request');
      const body = JSON.parse(postReq.body!);
      assert.strictEqual(body.compose.include[0].version, undefined, 'compose include should not have version');
    });

    // 9.7
    it('should work with edition-only URI in bulkExpand', async () => {
      const svc = new FhirTerminologyService({
        baseUrl,
        timeout: 2000,
        snomedVersion: 'http://snomed.info/sct/32506021000036107',
      });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
      });

      await svc.validateConcepts(['404684003']);

      const postReq = mock.requests.find((r) => r.method === 'POST');
      assert.ok(postReq, 'Should make a POST request');
      const body = JSON.parse(postReq.body!);
      assert.strictEqual(
        body.compose.include[0].version,
        'http://snomed.info/sct/32506021000036107',
        'compose include should contain edition-only version',
      );
    });
  });

  // 9.5 searchByFilter URL uses versioned implicit ValueSet URL
  describe('searchByFilter — version threading', () => {
    it('should use versioned implicit ValueSet URL when snomedVersion is set', async () => {
      const version = 'http://snomed.info/sct/32506021000036107/version/20260131';
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
      });

      await svc.searchConcepts('clinical');

      // searchConcepts calls searchByFilter for text queries — version appears in the URL unencoded
      const url = mock.requests[0].url;
      assert.ok(url.includes('32506021000036107/version/20260131'), `URL should contain versioned system URL: ${url}`);
    });

    // 9.6
    it('should use default system URL when snomedVersion is not set', async () => {
      const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
      });

      await svc.searchConcepts('clinical');

      const url = mock.requests[0].url;
      assert.ok(!url.includes('32506021000036107'), `URL should not contain version-specific path: ${url}`);
    });
  });
});

describe('FhirTerminologyService — edition discovery', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  // 9.8 getSnomedEditions parses a mock FHIR Bundle
  it('should parse FHIR Bundle into grouped editions', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, MOCK_EDITION_BUNDLE);

    const editions = await svc.getSnomedEditions();

    assert.strictEqual(editions.length, 2, 'Should find 2 editions');

    // Find the International edition
    const international = editions.find((e: SnomedEdition) => e.moduleId === '900000000000207008');
    assert.ok(international, 'Should find International edition');
    assert.strictEqual(international.versions.length, 2, 'International should have 2 versions');
    // Versions should be sorted descending
    assert.strictEqual(international.versions[0].date, '20250301');
    assert.strictEqual(international.versions[1].date, '20240901');

    // Find the Australian edition
    const australian = editions.find((e: SnomedEdition) => e.moduleId === '32506021000036107');
    assert.ok(australian, 'Should find Australian edition');
    assert.strictEqual(australian.versions.length, 2, 'Australian should have 2 versions');
    assert.strictEqual(australian.versions[0].date, '20260131');
    assert.strictEqual(australian.versions[1].date, '20250731');
  });

  it('should request the correct URL for edition discovery', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, { resourceType: 'Bundle', entry: [] });

    await svc.getSnomedEditions();

    assert.strictEqual(mock.requests.length, 1);
    assert.ok(
      mock.requests[0].url.includes('/CodeSystem?url=http://snomed.info/sct'),
      `URL should query CodeSystem: ${mock.requests[0].url}`,
    );
  });

  // 9.9 Empty bundle and error responses
  it('should return empty array for empty Bundle', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, { resourceType: 'Bundle', entry: [] });

    const editions = await svc.getSnomedEditions();
    assert.deepStrictEqual(editions, []);
  });

  it('should return empty array for Bundle with no entry field', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, { resourceType: 'Bundle' });

    const editions = await svc.getSnomedEditions();
    assert.deepStrictEqual(editions, []);
  });

  it('should throw on HTTP error response', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(500, { resourceType: 'OperationOutcome' });

    await assert.rejects(() => svc.getSnomedEditions(), /HTTP 500/);
  });

  it('should skip entries without version field', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'CodeSystem' } }, // no version
        {
          resource: {
            resourceType: 'CodeSystem',
            version: 'http://snomed.info/sct/900000000000207008/version/20250301',
          },
        },
      ],
    });

    const editions = await svc.getSnomedEditions();
    assert.strictEqual(editions.length, 1);
    assert.strictEqual(editions[0].moduleId, '900000000000207008');
  });
});

describe('FhirTerminologyService — resolved version extraction', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  // 9.10 Resolved version extraction from $expand response
  it('should capture resolved version from $expand parameter array', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, MOCK_EXPAND_RESPONSE);

    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(
      svc.getResolvedVersion(),
      'http://snomed.info/sct/32506021000036107/version/20260131',
      'Should capture version from expand response',
    );
  });

  // 9.11 Resolved version extraction from $lookup response
  it('should capture resolved version from $lookup parameter array', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, MOCK_LOOKUP_RESPONSE);

    await svc.getConceptInfo('404684003');

    assert.strictEqual(
      svc.getResolvedVersion(),
      'http://snomed.info/sct/900000000000207008/version/20250301',
      'Should capture version from lookup response',
    );
  });

  it('should not capture version when response has no parameter array', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
    });

    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(svc.getResolvedVersion(), null, 'Should remain null without parameter array');
  });

  // 9.12 Resolved version is only captured once
  it('should only capture resolved version once per service lifetime', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    // First call — captures version from expand
    mock.setResponse(200, MOCK_EXPAND_RESPONSE);
    await svc.evaluateEcl('<< 404684003');
    assert.strictEqual(svc.getResolvedVersion(), 'http://snomed.info/sct/32506021000036107/version/20260131');

    // Second call — different version in response, should NOT overwrite
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [{ name: 'version', valueUri: 'http://snomed.info/sct/999999/version/20990101' }],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });
    await svc.evaluateEcl('<< 19829001');
    assert.strictEqual(
      svc.getResolvedVersion(),
      'http://snomed.info/sct/32506021000036107/version/20260131',
      'Should not overwrite first captured version',
    );
  });

  // 9.13 Resolved version callback is invoked on first capture
  it('should invoke onResolvedVersion callback on first capture', async () => {
    const capturedVersions: string[] = [];
    const svc = new FhirTerminologyService({
      baseUrl,
      timeout: 2000,
      onResolvedVersion: (uri) => {
        capturedVersions.push(uri);
      },
    });

    mock.setResponse(200, MOCK_EXPAND_RESPONSE);
    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(capturedVersions.length, 1, 'Callback should be invoked once');
    assert.strictEqual(capturedVersions[0], 'http://snomed.info/sct/32506021000036107/version/20260131');
  });

  it('should not invoke callback on subsequent responses', async () => {
    const capturedVersions: string[] = [];
    const svc = new FhirTerminologyService({
      baseUrl,
      timeout: 2000,
      onResolvedVersion: (uri) => {
        capturedVersions.push(uri);
      },
    });

    // First call
    mock.setResponse(200, MOCK_EXPAND_RESPONSE);
    await svc.evaluateEcl('<< 404684003');

    // Second call with different version
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [{ name: 'version', valueUri: 'http://snomed.info/sct/999/version/20990101' }],
        contains: [{ code: '19829001', display: 'Disorder of lung' }],
      },
    });
    await svc.evaluateEcl('<< 19829001');

    assert.strictEqual(capturedVersions.length, 1, 'Callback should only fire once');
  });

  it('should capture resolved version from searchByFilter via searchConcepts', async () => {
    const capturedVersions: string[] = [];
    const svc = new FhirTerminologyService({
      baseUrl,
      timeout: 2000,
      onResolvedVersion: (uri) => {
        capturedVersions.push(uri);
      },
    });

    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [{ name: 'version', valueUri: 'http://snomed.info/sct/900000000000207008/version/20250301' }],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });

    await svc.searchConcepts('clinical');

    assert.strictEqual(capturedVersions.length, 1);
    assert.strictEqual(capturedVersions[0], 'http://snomed.info/sct/900000000000207008/version/20250301');
  });

  it('should capture resolved version from bulkExpand via validateConcepts', async () => {
    const capturedVersions: string[] = [];
    const svc = new FhirTerminologyService({
      baseUrl,
      timeout: 2000,
      onResolvedVersion: (uri) => {
        capturedVersions.push(uri);
      },
    });

    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [{ name: 'version', valueUri: 'http://snomed.info/sct/32506021000036107/version/20260131' }],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });

    await svc.validateConcepts(['404684003']);

    assert.strictEqual(capturedVersions.length, 1);
    assert.strictEqual(capturedVersions[0], 'http://snomed.info/sct/32506021000036107/version/20260131');
  });

  // ── FHIR response format variations ──

  it('should capture version from used-codesystem parameter (FHIR R4 standard)', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [
          {
            name: 'used-codesystem',
            valueUri: 'http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250301',
          },
        ],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });

    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(
      svc.getResolvedVersion(),
      'http://snomed.info/sct/900000000000207008/version/20250301',
      'Should extract version from pipe-delimited used-codesystem value',
    );
  });

  it('should capture version from valueString (instead of valueUri)', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [
          {
            name: 'version',
            valueString: 'http://snomed.info/sct/32506021000036107/version/20260131',
          },
        ],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });

    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(svc.getResolvedVersion(), 'http://snomed.info/sct/32506021000036107/version/20260131');
  });

  it('should capture version from $lookup valueString', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'Parameters',
      parameter: [
        { name: 'display', valueString: 'Clinical finding (finding)' },
        { name: 'version', valueString: 'http://snomed.info/sct/900000000000207008/version/20250301' },
      ],
    });

    await svc.getConceptInfo('404684003');

    assert.strictEqual(svc.getResolvedVersion(), 'http://snomed.info/sct/900000000000207008/version/20250301');
  });

  it('should prefer version parameter over used-codesystem', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [
          { name: 'version', valueUri: 'http://snomed.info/sct/32506021000036107/version/20260131' },
          {
            name: 'used-codesystem',
            valueUri: 'http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250301',
          },
        ],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });

    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(
      svc.getResolvedVersion(),
      'http://snomed.info/sct/32506021000036107/version/20260131',
      'Should prefer "version" over "used-codesystem"',
    );
  });

  it('should ignore non-SNOMED used-codesystem entries', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: {
        total: 1,
        parameter: [
          { name: 'used-codesystem', valueUri: 'http://loinc.org|2.77' },
          {
            name: 'used-codesystem',
            valueUri: 'http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250301',
          },
        ],
        contains: [{ code: '404684003', display: 'Clinical finding' }],
      },
    });

    await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(
      svc.getResolvedVersion(),
      'http://snomed.info/sct/900000000000207008/version/20250301',
      'Should skip non-SNOMED used-codesystem entries',
    );
  });
});
