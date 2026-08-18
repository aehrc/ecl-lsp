// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { FhirTerminologyService } from '../terminology/fhir-service';

// ── Loopback stub server ────────────────────────────────────────────────
// The service resolves `fetch` at module-load time (see terminology/fetch-compat),
// so a global `fetch` monkey-patch installed by a test would never be seen. Every
// FHIR test in this package therefore stubs the transport with an ephemeral
// 127.0.0.1 listener instead: no real network, no external dependency.

interface CapturedRequest {
  method: string;
  url: string;
  body?: string;
}

interface StubResponse {
  status: number;
  body: unknown;
}

type StubHandler = (request: CapturedRequest) => StubResponse;

const OK_EXPANSION = {
  resourceType: 'ValueSet',
  expansion: {
    total: 2,
    contains: [
      { code: '404684003', display: 'Clinical finding' },
      { code: '19829001', display: 'Disorder of lung' },
    ],
  },
};

function createStubServer(): {
  requests: CapturedRequest[];
  setHandler: (handler: StubHandler) => void;
  start: () => Promise<string>;
  stop: () => Promise<void>;
} {
  const requests: CapturedRequest[] = [];
  let handler: StubHandler = (_request: CapturedRequest) => ({ status: 200, body: OK_EXPANSION });

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const captured: CapturedRequest = {
        method: req.method ?? 'GET',
        url: req.url ?? '',
        body: body || undefined,
      };
      requests.push(captured);
      const result = handler(captured);
      res.writeHead(result.status, { 'Content-Type': 'application/fhir+json' });
      res.end(JSON.stringify(result.body));
    });
  });

  return {
    requests,
    setHandler(next: StubHandler) {
      handler = next;
    },
    start(): Promise<string> {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address() as { port: number };
          resolve(`http://127.0.0.1:${address.port}`);
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

/** OperationOutcome body helper. */
function outcome(code: string, diagnostics: string): unknown {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code, diagnostics }],
  };
}

const IMPLICIT_PREFIX = 'http://snomed.info/sct?fhir_vs=ecl/';

/**
 * Recover the ECL a server would see from a captured implicit-URL GET.
 *
 * Mirrors the two decodes a FHIR server performs: the HTTP query-string decode of the
 * `url=` parameter, then the percent-decode of the canonical URL's own components.
 */
function eclSeenByServer(requestUrl: string): string {
  const canonical = decodeURIComponent(/[?&]url=([^&]*)/.exec(requestUrl)?.[1] ?? '');
  assert.ok(canonical.startsWith(IMPLICIT_PREFIX), `canonical URL should be an implicit ECL ValueSet: ${canonical}`);
  const eclPart = canonical.slice(IMPLICIT_PREFIX.length);
  // A FHIR canonical URL splits `system|version` on the LAST bare pipe — any bare pipe
  // reaching this point means the expression would be truncated by the server.
  assert.ok(!eclPart.includes('|'), `ECL portion must not contain a bare pipe: ${eclPart}`);
  assert.ok(!eclPart.includes('#'), `ECL portion must not contain a bare fragment marker: ${eclPart}`);
  return decodeURIComponent(eclPart);
}

/** The `value` of the constraint filter in a POST ValueSet/$expand body. */
function postedConstraint(body: string | undefined): string {
  const parsed = JSON.parse(body ?? '{}') as {
    resourceType?: string;
    compose?: { include?: { system?: string; filter?: { property?: string; op?: string; value?: string }[] }[] };
  };
  assert.strictEqual(parsed.resourceType, 'ValueSet');
  const include = parsed.compose?.include?.[0];
  assert.strictEqual(include?.system, 'http://snomed.info/sct');
  const filter = include?.filter?.[0];
  assert.strictEqual(filter?.property, 'constraint');
  assert.strictEqual(filter?.op, '=');
  return filter?.value ?? '';
}

describe('evaluateEcl — implicit ValueSet URL encoding (issue #68)', () => {
  let stub: ReturnType<typeof createStubServer>;
  let baseUrl: string;

  beforeEach(async () => {
    stub = createStubServer();
    baseUrl = await stub.start();
  });

  afterEach(async () => {
    await stub.stop();
  });

  /** Every expression here must survive the canonical URL round-trip byte for byte. */
  const roundTripCases: [name: string, expression: string][] = [
    ['term annotations', '< 64572001 |Disease|'],
    ['cardinality plus annotation', '^ 929360071000036103 : [1..1] 127489000 |Has active ingredient| = *'],
    [
      'description filter after the last pipe',
      '^ 929360051000036108 : 774158006 = ( < 774167006 |Product name| {{ D term = "Panadol" }})',
    ],
    ['concrete numeric value', '^929360051000036108 : 1142142004 = #20'],
    ['quoted string containing a bare pipe', '< 404684003 {{ term = "a | b" }}'],
    ['block comment containing a bare pipe', '/* a | b */ << 73211009'],
    ['percent sign in a term filter', '< 404684003 {{ D term = "50% dextrose" }}'],
    ['pre-existing percent escape is not double-encoded', '< 404684003 {{ D term = "%7C" }}'],
    ['ampersand and equals cannot inject query parameters', '< 404684003 & extra=injected'],
    ['plus and question mark in a term', '< 404684003 {{ term = "a+b why?" }}'],
  ];

  for (const [name, expression] of roundTripCases) {
    it(`round-trips ${name} through the canonical URL`, async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      await service.evaluateEcl(expression, 10);

      assert.strictEqual(stub.requests.length, 1);
      assert.strictEqual(stub.requests[0].method, 'GET');
      assert.strictEqual(eclSeenByServer(stub.requests[0].url), expression);
    });
  }

  it('percent-encodes pipes as %7C in the request line', async () => {
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    await service.evaluateEcl('< 64572001 |Disease|', 10);

    const url = stub.requests[0].url;
    // Outer encodeURIComponent turns the inner "%7C" into "%257C".
    assert.ok(url.includes('%257C'), `pipe should be double-encoded: ${url}`);
  });

  it('percent-encodes a literal percent before anything else', async () => {
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    await service.evaluateEcl('< 404684003 {{ D term = "50% dextrose" }}', 10);

    const url = stub.requests[0].url;
    assert.ok(url.includes('50%2525'), `literal percent should become %25 inside the canonical URL: ${url}`);
  });

  it('still preserves a pinned SNOMED version in the canonical URL', async () => {
    const version = 'http://snomed.info/sct/32506021000036107/version/20260131';
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version });
    await service.evaluateEcl('< 64572001 |Disease|', 10);

    const canonical = decodeURIComponent(/[?&]url=([^&]*)/.exec(stub.requests[0].url)?.[1] ?? '');
    assert.ok(canonical.startsWith(`${version}?fhir_vs=ecl/`), `versioned implicit URL expected: ${canonical}`);
  });

  it('trims the expression before encoding', async () => {
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    await service.evaluateEcl('   << 73211009   ', 10);
    assert.strictEqual(eclSeenByServer(stub.requests[0].url), '<< 73211009');
  });
});

describe('evaluateEcl — POST $expand fallback (issue #55)', () => {
  let stub: ReturnType<typeof createStubServer>;
  let baseUrl: string;

  beforeEach(async () => {
    stub = createStubServer();
    baseUrl = await stub.start();
  });

  afterEach(async () => {
    await stub.stop();
  });

  /** GET always fails with the given status/body; POST always succeeds. */
  function implicitUnsupported(status: number, body: unknown): void {
    stub.setHandler((request) => (request.method === 'POST' ? { status: 200, body: OK_EXPANSION } : { status, body }));
  }

  it('falls back to POST when the server returns 404', async () => {
    implicitUnsupported(404, outcome('not-found', 'ValueSet not found'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const result = await service.evaluateEcl('<< 50043002 AND << 19829001', 10);

    assert.strictEqual(result.total, 2);
    assert.strictEqual(stub.requests.length, 2);
    assert.strictEqual(stub.requests[0].method, 'GET');
    assert.strictEqual(stub.requests[1].method, 'POST');
    assert.strictEqual(postedConstraint(stub.requests[1].body), '<< 50043002 AND << 19829001');
  });

  it('sends the raw, unencoded expression in the POST body', async () => {
    implicitUnsupported(404, outcome('not-found', 'ValueSet not found'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const expression = '< 64572001 |Disease| {{ D term = "50% x" }}';
    await service.evaluateEcl(expression, 10);

    assert.strictEqual(postedConstraint(stub.requests[1].body), expression);
  });

  it('posts to ValueSet/$expand with the requested count', async () => {
    implicitUnsupported(404, outcome('not-found', 'ValueSet not found'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await service.evaluateEcl('<< 73211009', 42);

    assert.ok(stub.requests[1].url.startsWith('/ValueSet/$expand'), stub.requests[1].url);
    assert.ok(stub.requests[1].url.includes('count=42'), stub.requests[1].url);
  });

  it('includes the pinned SNOMED version in the POST compose', async () => {
    implicitUnsupported(404, outcome('not-found', 'ValueSet not found'));
    const version = 'http://snomed.info/sct/32506021000036107/version/20260131';
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version });

    await service.evaluateEcl('<< 73211009', 10);

    const parsed = JSON.parse(stub.requests[1].body ?? '{}') as {
      compose?: { include?: { version?: string }[] };
    };
    assert.strictEqual(parsed.compose?.include?.[0].version, version);
  });

  it('falls back on HTTP 414 (URI too long)', async () => {
    implicitUnsupported(414, outcome('too-long', 'URI Too Long'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const result = await service.evaluateEcl('<< 73211009', 10);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(stub.requests[1].method, 'POST');
  });

  it('falls back on an OperationOutcome code of not-found regardless of status', async () => {
    implicitUnsupported(422, outcome('not-found', 'Unable to resolve the supplied canonical'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const result = await service.evaluateEcl('<< 73211009', 10);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(stub.requests[1].method, 'POST');
  });

  it('falls back on "ValueSet not found" diagnostics', async () => {
    implicitUnsupported(
      400,
      outcome('processing', 'ValueSet not found: http://snomed.info/sct?fhir_vs=ecl/<< 50043002'),
    );
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const result = await service.evaluateEcl('<< 50043002', 10);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(stub.requests[1].method, 'POST');
  });

  it('falls back on "implicit ValueSet not supported" diagnostics', async () => {
    implicitUnsupported(400, outcome('processing', 'Implicit ValueSets are not supported by this server'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const result = await service.evaluateEcl('<< 50043002', 10);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(stub.requests[1].method, 'POST');
  });

  it('latches the POST strategy for the lifetime of the instance', async () => {
    implicitUnsupported(404, outcome('not-found', 'ValueSet not found'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await service.evaluateEcl('<< 73211009', 10);
    assert.strictEqual(stub.requests.length, 2);

    await service.evaluateEcl('<< 50043002', 10);
    assert.strictEqual(stub.requests.length, 3, 'second call should not repeat the implicit GET');
    assert.strictEqual(stub.requests[2].method, 'POST');

    await service.evaluateEcl('<< 19829001', 10);
    assert.strictEqual(stub.requests.length, 4);
    assert.strictEqual(stub.requests[3].method, 'POST');
  });

  it('does not latch when the POST fallback also fails', async () => {
    stub.setHandler(() => ({ status: 404, body: outcome('not-found', 'ValueSet not found') }));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(() => service.evaluateEcl('<< 73211009', 10));
    assert.strictEqual(stub.requests.length, 2);

    await assert.rejects(() => service.evaluateEcl('<< 73211009', 10));
    assert.strictEqual(stub.requests.length, 4, 'implicit GET should be retried when POST never succeeded');
    assert.strictEqual(stub.requests[2].method, 'GET');
  });

  it('does NOT fall back on HTTP 422 syntax errors', async () => {
    implicitUnsupported(
      422,
      outcome('invalid', "The SNOMED CT ECL expression is invalid: mismatched input '{{' expecting ..."),
    );
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(() => service.evaluateEcl('<< 73211009 AND', 10), /The SNOMED CT ECL expression is invalid/);
    assert.strictEqual(stub.requests.length, 1, '422 syntax errors must not trigger a second request');
  });

  it('does NOT fall back on HTTP 500 server errors', async () => {
    implicitUnsupported(500, outcome('exception', 'Internal server error'));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(() => service.evaluateEcl('<< 73211009', 10), /Internal server error/);
    assert.strictEqual(stub.requests.length, 1);
  });

  it('reports both diagnostics when the POST fallback also fails', async () => {
    stub.setHandler((request) =>
      request.method === 'POST'
        ? { status: 400, body: outcome('processing', 'constraint filter unsupported') }
        : { status: 404, body: outcome('not-found', 'ValueSet not found') },
    );
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(
      () => service.evaluateEcl('<< 73211009', 10),
      (error: Error) => {
        assert.match(error.message, /constraint filter unsupported/);
        assert.match(error.message, /ValueSet not found/);
        return true;
      },
    );
  });
});

describe('evaluateEcl — evaluationStrategy option', () => {
  let stub: ReturnType<typeof createStubServer>;
  let baseUrl: string;

  beforeEach(async () => {
    stub = createStubServer();
    baseUrl = await stub.start();
  });

  afterEach(async () => {
    await stub.stop();
  });

  it("defaults to 'auto' (implicit GET first, POST fallback)", async () => {
    stub.setHandler((request) =>
      request.method === 'POST'
        ? { status: 200, body: OK_EXPANSION }
        : { status: 404, body: outcome('not-found', 'ValueSet not found') },
    );
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await service.evaluateEcl('<< 73211009', 10);
    assert.deepStrictEqual(
      stub.requests.map((r) => r.method),
      ['GET', 'POST'],
    );
  });

  it("'implicit-url' never falls back to POST", async () => {
    stub.setHandler((request) =>
      request.method === 'POST'
        ? { status: 200, body: OK_EXPANSION }
        : { status: 404, body: outcome('not-found', 'ValueSet not found') },
    );
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000, evaluationStrategy: 'implicit-url' });

    await assert.rejects(() => service.evaluateEcl('<< 73211009', 10), /ValueSet not found/);
    assert.strictEqual(stub.requests.length, 1);
    assert.strictEqual(stub.requests[0].method, 'GET');
  });

  it("'implicit-url' still applies the canonical URL encoding", async () => {
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000, evaluationStrategy: 'implicit-url' });
    await service.evaluateEcl('< 64572001 |Disease|', 10);
    assert.strictEqual(eclSeenByServer(stub.requests[0].url), '< 64572001 |Disease|');
  });

  it("'post' goes straight to POST without an implicit GET", async () => {
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000, evaluationStrategy: 'post' });

    const result = await service.evaluateEcl('<< 50043002 AND << 19829001', 10);

    assert.strictEqual(result.total, 2);
    assert.strictEqual(stub.requests.length, 1);
    assert.strictEqual(stub.requests[0].method, 'POST');
    assert.strictEqual(postedConstraint(stub.requests[0].body), '<< 50043002 AND << 19829001');
  });

  it("'post' surfaces POST errors without retrying the implicit form", async () => {
    stub.setHandler(() => ({ status: 422, body: outcome('invalid', 'bad ECL') }));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000, evaluationStrategy: 'post' });

    await assert.rejects(() => service.evaluateEcl('<< 73211009 AND', 10), /bad ECL/);
    assert.strictEqual(stub.requests.length, 1);
    assert.strictEqual(stub.requests[0].method, 'POST');
  });

  it('an unknown strategy value falls back to auto behaviour', async () => {
    const service = new FhirTerminologyService({
      baseUrl,
      timeout: 2000,
      evaluationStrategy: 'nonsense' as unknown as 'auto',
    });
    await service.evaluateEcl('<< 73211009', 10);
    assert.strictEqual(stub.requests[0].method, 'GET');
  });
});

describe('evaluateEcl — error reporting', () => {
  let stub: ReturnType<typeof createStubServer>;
  let baseUrl: string;

  beforeEach(async () => {
    stub = createStubServer();
    baseUrl = await stub.start();
  });

  afterEach(async () => {
    await stub.stop();
  });

  it('returns an empty result for an empty expression without any request', async () => {
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    assert.deepStrictEqual(await service.evaluateEcl('  '), { total: 0, concepts: [], truncated: false });
    assert.strictEqual(stub.requests.length, 0);
  });

  it('strips the server UUID prefix and adds an ECL 2.2 filter note', async () => {
    stub.setHandler(() => ({
      status: 422,
      body: outcome('invalid', "[d4ac2525-1111-2222-3333-444455556666]: no viable alternative at input '{{'"),
    }));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(
      () => service.evaluateEcl('< 404684003 {{ D id = 900000000000003001 }}', 10),
      (error: Error) => {
        assert.ok(!error.message.includes('d4ac2525'), `UUID prefix should be stripped: ${error.message}`);
        assert.match(error.message, /no viable alternative/);
        assert.match(error.message, /ECL 2\.2 filter syntax/);
        return true;
      },
    );
  });

  it('prefixes plain failures with "FHIR evaluation failed"', async () => {
    stub.setHandler(() => ({ status: 422, body: outcome('invalid', 'nope') }));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(() => service.evaluateEcl('<< 73211009', 10), /^Error: FHIR evaluation failed: nope$/);
  });

  it('falls back to the HTTP status when no OperationOutcome is returned', async () => {
    stub.setHandler(() => ({ status: 503, body: 'not json' }));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await assert.rejects(() => service.evaluateEcl('<< 73211009', 10), /HTTP 503/);
  });

  it('marks the result truncated when the server total exceeds the returned concepts', async () => {
    stub.setHandler(() => ({
      status: 200,
      body: { resourceType: 'ValueSet', expansion: { total: 500, contains: [{ code: '1', display: 'x' }] } },
    }));
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    const result = await service.evaluateEcl('<< 73211009', 1);
    assert.strictEqual(result.total, 500);
    assert.strictEqual(result.truncated, true);
  });

  it('captures the resolved version from a POST fallback expansion', async () => {
    stub.setHandler((request) =>
      request.method === 'POST'
        ? {
            status: 200,
            body: {
              resourceType: 'ValueSet',
              expansion: {
                total: 0,
                parameter: [{ name: 'version', valueUri: 'http://snomed.info/sct/32506021000036107/version/20260131' }],
                contains: [],
              },
            },
          }
        : { status: 404, body: outcome('not-found', 'ValueSet not found') },
    );
    const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });

    await service.evaluateEcl('<< 73211009', 10);
    assert.strictEqual(service.getResolvedVersion(), 'http://snomed.info/sct/32506021000036107/version/20260131');
  });
});
