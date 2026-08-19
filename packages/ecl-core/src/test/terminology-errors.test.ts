// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Regression tests for GitHub issues #70 and #71.
//
// The terminology service must never turn a transport failure (server down,
// DNS failure, timeout) or an HTTP error response into the factual claim
// "this concept does not exist in SNOMED CT". `getConceptInfo` resolves to
// `null` only when the server gave a well-formed answer saying the code is
// unknown; every other failure rejects with a typed error carrying a `kind`
// discriminant, the HTTP `status` where there was one, and the original
// failure as `cause`.

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { FhirTerminologyService } from '../terminology/fhir-service';
import {
  TerminologyError,
  TerminologyHttpError,
  TerminologyTransportError,
  isTerminologyError,
  isTerminologyHttpError,
  isTerminologyTransportError,
} from '../terminology/errors';

// ── Routable mock FHIR server ───────────────────────────────────────────

interface MockResponse {
  status: number;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  delayMs?: number;
}

interface CapturedRequest {
  method: string;
  url: string;
  body?: string;
}

function createMockServer(): {
  requests: CapturedRequest[];
  setResponse: (status: number, body: unknown) => void;
  setHandler: (handler: (req: CapturedRequest) => MockResponse) => void;
  start: () => Promise<string>;
  stop: () => Promise<void>;
} {
  const requests: CapturedRequest[] = [];
  let handler: (req: CapturedRequest) => MockResponse = (_req: CapturedRequest) => ({ status: 200, body: {} });

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const captured: CapturedRequest = { method: req.method ?? 'GET', url: req.url ?? '', body: body || undefined };
      requests.push(captured);
      const result = handler(captured);
      const send = () => {
        res.writeHead(result.status, { 'Content-Type': result.contentType ?? 'application/json' });
        res.end(result.rawBody ?? JSON.stringify(result.body ?? {}));
      };
      if (result.delayMs) {
        setTimeout(() => {
          send();
        }, result.delayMs).unref();
      } else {
        send();
      }
    });
  });

  return {
    requests,
    setResponse(status: number, body: unknown) {
      handler = () => ({ status, body });
    },
    setHandler(next) {
      handler = next;
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
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

const NOT_FOUND_OUTCOME = {
  resourceType: 'OperationOutcome',
  issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Unknown code' }],
};

const LOOKUP_OK = {
  resourceType: 'Parameters',
  parameter: [{ name: 'display', valueString: 'Clinical finding (finding)' }],
};

/** A base URL that nothing is listening on — produces ECONNREFUSED. */
const DEAD_URL = 'http://127.0.0.1:1/fhir';

// ── Error type contract ─────────────────────────────────────────────────

describe('terminology error types', () => {
  it('TerminologyTransportError is a TerminologyError with kind "transport"', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new TerminologyTransportError('boom', { cause, url: 'http://x/fhir' });

    assert.ok(error instanceof Error);
    assert.ok(error instanceof TerminologyError);
    assert.strictEqual(error.kind, 'transport');
    assert.strictEqual(error.cause, cause);
    assert.strictEqual(error.url, 'http://x/fhir');
    assert.strictEqual(error.status, undefined);
    assert.strictEqual(error.name, 'TerminologyTransportError');
  });

  it('TerminologyHttpError carries the HTTP status and kind "http"', () => {
    const cause = new Error('original');
    const error = new TerminologyHttpError('boom', { cause, status: 503, statusText: 'Service Unavailable' });

    assert.ok(error instanceof TerminologyError);
    assert.strictEqual(error.kind, 'http');
    assert.strictEqual(error.status, 503);
    assert.strictEqual(error.statusText, 'Service Unavailable');
    assert.strictEqual(error.cause, cause);
    assert.strictEqual(error.name, 'TerminologyHttpError');
  });

  it('type guards classify structurally, not by message text', () => {
    const transport = new TerminologyTransportError('a');
    const httpError = new TerminologyHttpError('b', { status: 500 });

    assert.ok(isTerminologyError(transport));
    assert.ok(isTerminologyError(httpError));
    assert.ok(isTerminologyTransportError(transport));
    assert.ok(!isTerminologyTransportError(httpError));
    assert.ok(isTerminologyHttpError(httpError));
    assert.ok(!isTerminologyHttpError(transport));
    assert.ok(!isTerminologyError(new Error('Terminology server unavailable')));
    assert.ok(!isTerminologyError(null));
    assert.ok(!isTerminologyError('http'));
  });

  it('guards accept structurally-equivalent errors from a duplicate module copy', () => {
    // A dual CJS/ESM build can load two copies of the class, defeating instanceof.
    const clone = Object.assign(new Error('copy'), { name: 'TerminologyHttpError', kind: 'http', status: 500 });
    assert.ok(isTerminologyError(clone));
    assert.ok(isTerminologyHttpError(clone));
  });
});

// ── getConceptInfo (issue #71) ──────────────────────────────────────────

describe('FhirTerminologyService.getConceptInfo — failure discrimination (issue #71)', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('resolves the concept when the server returns it', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(200, LOOKUP_OK);

    const info = await svc.getConceptInfo('404684003');

    assert.ok(info);
    assert.strictEqual(info.id, '404684003');
    assert.strictEqual(info.fsn, 'Clinical finding (finding)');
  });

  it('resolves null when the concept is genuinely absent (404 + OperationOutcome)', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(404, NOT_FOUND_OUTCOME);

    const info = await svc.getConceptInfo('100000000');

    assert.strictEqual(info, null);
  });

  it('resolves null when the server reports an unknown code as HTTP 400', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(400, {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'code-invalid', diagnostics: 'Unknown code "100000000"' }],
    });

    const info = await svc.getConceptInfo('100000000');

    assert.strictEqual(info, null);
  });

  it('rejects with an HTTP-kind error carrying status on 500', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(500, { resourceType: 'OperationOutcome', issue: [{ diagnostics: 'Backend exploded' }] });

    await assert.rejects(
      () => svc.getConceptInfo('404684003'),
      (error: unknown) => {
        assert.ok(isTerminologyHttpError(error), `expected an HTTP terminology error, got ${String(error)}`);
        assert.strictEqual(error.kind, 'http');
        assert.strictEqual(error.status, 500);
        assert.ok(error.message.includes('500'), `message should mention the status: ${error.message}`);
        assert.ok(error.message.includes('Backend exploded'), `message should keep server detail: ${error.message}`);
        assert.ok(!/not found|does not exist/i.test(error.message), `must not claim absence: ${error.message}`);
        return true;
      },
    );
  });

  it('rejects on 503 rather than reporting the concept as missing', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(503, { resourceType: 'OperationOutcome' });

    await assert.rejects(
      () => svc.getConceptInfo('404684003'),
      (error: unknown) => isTerminologyHttpError(error) && error.status === 503,
    );
  });

  it('rejects on a 404 that is not a FHIR OperationOutcome (wrong URL / proxy)', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setHandler(() => ({
      status: 404,
      rawBody: '<html><body>404 Not Found</body></html>',
      contentType: 'text/html',
    }));

    await assert.rejects(
      () => svc.getConceptInfo('404684003'),
      (error: unknown) => isTerminologyHttpError(error) && error.status === 404,
    );
  });

  it('rejects with a transport-kind error carrying cause when the server is unreachable', async () => {
    const svc = new FhirTerminologyService({ baseUrl: DEAD_URL, timeout: 2000 });

    await assert.rejects(
      () => svc.getConceptInfo('404684003'),
      (error: unknown) => {
        assert.ok(isTerminologyTransportError(error), `expected a transport error, got ${String(error)}`);
        assert.strictEqual(error.kind, 'transport');
        assert.strictEqual(error.status, undefined);
        assert.ok(error.cause !== undefined, 'the original failure must be preserved as cause');
        assert.ok(!/not found|does not exist/i.test(error.message), `must not claim absence: ${error.message}`);
        return true;
      },
    );
  });

  it('rejects with a transport-kind error flagged timedOut when the request times out', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 50 });
    mock.setHandler(() => ({ status: 200, body: LOOKUP_OK, delayMs: 1500 }));

    await assert.rejects(
      () => svc.getConceptInfo('404684003'),
      (error: unknown) => {
        assert.ok(isTerminologyTransportError(error), `expected a transport error, got ${String(error)}`);
        assert.strictEqual(error.timedOut, true);
        assert.ok(error.cause !== undefined, 'abort error must be preserved as cause');
        return true;
      },
    );
  });

  it('rejects with a transport-kind error when the success body is not valid JSON', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setHandler(() => ({ status: 200, rawBody: 'not json at all', contentType: 'application/json' }));

    await assert.rejects(
      () => svc.getConceptInfo('404684003'),
      (error: unknown) => isTerminologyTransportError(error) && error.cause !== undefined,
    );
  });

  it('does not cache anything when the lookup fails', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(500, { resourceType: 'OperationOutcome' });
    await assert.rejects(() => svc.getConceptInfo('404684003'));

    mock.setResponse(200, LOOKUP_OK);
    const info = await svc.getConceptInfo('404684003');
    assert.ok(info, 'a later successful lookup must not be poisoned by the earlier failure');
  });
});

// ── validateConcepts ────────────────────────────────────────────────────

describe('FhirTerminologyService.validateConcepts — failure discrimination', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('rejects rather than reporting every concept as unknown when the server is unreachable', async () => {
    const svc = new FhirTerminologyService({ baseUrl: DEAD_URL, timeout: 2000 });

    await assert.rejects(
      () => svc.validateConcepts(['404684003', '19829001']),
      (error: unknown) => isTerminologyTransportError(error),
    );
  });

  it('does not fall back to N individual lookups when the server is unreachable', async () => {
    const svc = new FhirTerminologyService({ baseUrl: DEAD_URL, timeout: 2000 });
    // No assertion on request count is possible against a dead port, so assert the
    // rejection happens promptly and is transport-kind (the fallback is skipped).
    const started = Date.now();
    await assert.rejects(() => svc.validateConcepts(['404684003', '19829001', '39057004']));
    assert.ok(Date.now() - started < 2000, 'should fail fast instead of retrying each concept');
  });

  it('rejects with an HTTP-kind error when bulk expand and the fallback lookups both fail', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(500, { resourceType: 'OperationOutcome' });

    await assert.rejects(
      () => svc.validateConcepts(['404684003']),
      (error: unknown) => isTerminologyHttpError(error) && error.status === 500,
    );
  });

  it('falls back to individual lookups when bulk expand is unsupported', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setHandler((req) =>
      req.method === 'POST'
        ? { status: 400, body: { resourceType: 'OperationOutcome', issue: [{ code: 'not-supported' }] } }
        : { status: 200, body: LOOKUP_OK },
    );

    const results = await svc.validateConcepts(['404684003']);

    assert.strictEqual(results.get('404684003')?.fsn, 'Clinical finding (finding)');
  });

  // Issue #55: the reporter's server 404s the bulk $expand on every validation
  // pass. Without a latch the doomed POST is reissued each time, adding a wasted
  // round-trip and a console warning per pass.
  it('latches an unsupported bulk expand and stops reissuing it', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setHandler((req) =>
      req.method === 'POST'
        ? { status: 404, body: { resourceType: 'OperationOutcome', issue: [{ code: 'not-found' }] } }
        : { status: 200, body: LOOKUP_OK },
    );

    await svc.validateConcepts(['404684003']);
    await svc.validateConcepts(['19829001']);
    await svc.validateConcepts(['39057004']);

    const bulkAttempts = mock.requests.filter((r) => r.method === 'POST').length;
    assert.strictEqual(bulkAttempts, 1, `bulk $expand should be attempted once, was ${bulkAttempts}`);
  });

  it('does not latch on a transient 5xx from bulk expand', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setHandler((req) => (req.method === 'POST' ? { status: 503, body: {} } : { status: 200, body: LOOKUP_OK }));

    await svc.validateConcepts(['404684003']);
    await svc.validateConcepts(['19829001']);

    const bulkAttempts = mock.requests.filter((r) => r.method === 'POST').length;
    assert.strictEqual(bulkAttempts, 2, 'a 5xx is transient and must not disable bulk expand');
  });

  it('maps a genuinely absent concept to null', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setHandler((req) =>
      req.method === 'POST'
        ? { status: 200, body: { resourceType: 'ValueSet', expansion: { contains: [] } } }
        : { status: 404, body: NOT_FOUND_OUTCOME },
    );

    const results = await svc.validateConcepts(['100000000']);

    assert.strictEqual(results.get('100000000'), null);
  });
});

// ── searchConcepts (issue #70) ──────────────────────────────────────────

describe('FhirTerminologyService.searchConcepts — error preservation (issue #70)', () => {
  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('preserves the HTTP status instead of collapsing to "Terminology server unavailable"', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(500, { resourceType: 'OperationOutcome', issue: [{ diagnostics: 'expansion failed' }] });

    await assert.rejects(
      () => svc.searchConcepts('paracetamol'),
      (error: unknown) => {
        assert.ok(isTerminologyHttpError(error), `expected an HTTP terminology error, got ${String(error)}`);
        assert.strictEqual(error.status, 500);
        assert.notStrictEqual(error.message, 'Terminology server unavailable');
        assert.ok(error.message.includes('500'), `status should survive: ${error.message}`);
        return true;
      },
    );
  });

  it('preserves the cause when the server is unreachable', async () => {
    const svc = new FhirTerminologyService({ baseUrl: DEAD_URL, timeout: 2000 });

    await assert.rejects(
      () => svc.searchConcepts('paracetamol'),
      (error: unknown) => {
        assert.ok(isTerminologyTransportError(error), `expected a transport error, got ${String(error)}`);
        assert.ok(error.cause !== undefined, 'original network error must survive as cause');
        assert.notStrictEqual(error.message, 'Terminology server unavailable');
        return true;
      },
    );
  });

  it('propagates the HTTP error when an SCTID lookup fails', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(502, { resourceType: 'OperationOutcome' });

    await assert.rejects(
      () => svc.searchConcepts('404684003'),
      (error: unknown) => isTerminologyHttpError(error) && error.status === 502,
    );
  });

  it('still returns empty results for an SCTID the server does not know', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(404, NOT_FOUND_OUTCOME);

    const response = await svc.searchConcepts('100000000');

    assert.deepStrictEqual(response, { results: [], hasMore: false });
  });

  it('does not cache a failed search', async () => {
    const svc = new FhirTerminologyService({ baseUrl, timeout: 2000 });
    mock.setResponse(500, { resourceType: 'OperationOutcome' });
    await assert.rejects(() => svc.searchConcepts('paracetamol'));

    mock.setResponse(200, {
      resourceType: 'ValueSet',
      expansion: { total: 1, contains: [{ code: '387517004', display: 'Paracetamol (substance)' }] },
    });
    const response = await svc.searchConcepts('paracetamol');
    assert.strictEqual(response.results.length, 1);
  });
});
