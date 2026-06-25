// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { FhirTerminologyService } from '../terminology/fhir-service';

// ── Flexible mock server ───────────────────────────────────────────────────

interface MockServerOptions {
  /** Called on each request. Returns [status, body] for that request. */
  handler: (reqIndex: number, req: http.IncomingMessage) => [number, unknown] | Promise<[number, unknown]>;
  /** If set, hold each response for this many ms before sending (simulates latency). */
  delayMs?: number;
}

function createFlexibleMockServer(options: MockServerOptions): {
  server: http.Server;
  concurrentPeak: () => number;
  requestCount: () => number;
  start: () => Promise<string>;
  stop: () => Promise<void>;
} {
  let reqIndex = 0;
  let activeRequests = 0;
  let peakConcurrent = 0;

  const server = http.createServer((req, res) => {
    const idx = reqIndex++;
    activeRequests++;
    if (activeRequests > peakConcurrent) peakConcurrent = activeRequests;

    const respond = async () => {
      if (options.delayMs) {
        await new Promise<void>((r) => setTimeout(r, options.delayMs));
      }
      const [status, body] = await options.handler(idx, req);
      activeRequests--;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    respond().catch(() => {
      activeRequests--;
      res.writeHead(500);
      res.end('{}');
    });
  });

  return {
    server,
    concurrentPeak: () => peakConcurrent,
    requestCount: () => reqIndex,
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

// ── Shared mock FHIR responses ─────────────────────────────────────────────

const OK_EXPAND = {
  resourceType: 'ValueSet',
  expansion: { total: 1, contains: [{ code: '404684003', display: 'Clinical finding' }] },
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('FhirTerminologyService — ConcurrencyQueue', () => {
  let mock: ReturnType<typeof createFlexibleMockServer> | null = null;
  let baseUrl: string;

  afterEach(async () => {
    await mock?.stop();
    mock = null;
  });

  it('should reject maxConcurrency <= 0 at construction', () => {
    assert.throws(() => new FhirTerminologyService({ maxConcurrency: 0 }), /maxConcurrency must be > 0/);
    assert.throws(() => new FhirTerminologyService({ maxConcurrency: -5 }), /maxConcurrency must be > 0/);
  });

  it('should cap concurrent in-flight requests to maxConcurrency', async () => {
    // Use a 50 ms delay so multiple requests overlap in flight
    mock = createFlexibleMockServer({
      delayMs: 50,
      handler: () => [200, OK_EXPAND],
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000, maxConcurrency: 2 });

    // Fire 6 requests simultaneously
    await Promise.all([
      svc.evaluateEcl('<< 1'),
      svc.evaluateEcl('<< 2'),
      svc.evaluateEcl('<< 3'),
      svc.evaluateEcl('<< 4'),
      svc.evaluateEcl('<< 5'),
      svc.evaluateEcl('<< 6'),
    ]);

    assert.ok(
      mock.concurrentPeak() <= 2,
      `Peak concurrent requests (${mock.concurrentPeak()}) exceeded maxConcurrency=2`,
    );
    assert.strictEqual(mock.requestCount(), 6, 'All 6 requests should complete');
  });

  it('should process queued requests after slots free', async () => {
    const completed: number[] = [];
    mock = createFlexibleMockServer({
      delayMs: 30,
      handler: (idx) => {
        completed.push(idx);
        return [200, OK_EXPAND];
      },
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000, maxConcurrency: 1 });

    await Promise.all([svc.evaluateEcl('<< 1'), svc.evaluateEcl('<< 2'), svc.evaluateEcl('<< 3')]);

    assert.strictEqual(completed.length, 3, 'All queued requests should eventually complete');
    assert.deepStrictEqual(completed, [0, 1, 2], 'Requests should complete in FIFO order');
  });
});

describe('FhirTerminologyService — retry on 429', () => {
  let mock: ReturnType<typeof createFlexibleMockServer> | null = null;
  let baseUrl: string;

  afterEach(async () => {
    await mock?.stop();
    mock = null;
  });

  it('should succeed after a 429 is followed by a 200', async () => {
    let callCount = 0;
    mock = createFlexibleMockServer({
      handler: () => {
        callCount++;
        if (callCount === 1) return [429, {}];
        return [200, OK_EXPAND];
      },
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000 });
    const result = await svc.evaluateEcl('<< 404684003');

    assert.strictEqual(result.concepts.length, 1);
    assert.strictEqual(callCount, 2, 'Should have retried once after 429');
  });

  it('should reject after 3 consecutive 429 responses', async () => {
    mock = createFlexibleMockServer({
      handler: () => [429, {}],
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000 });
    await assert.rejects(() => svc.evaluateEcl('<< 404684003'), /rate-limited/i);
    assert.strictEqual(mock.requestCount(), 3, 'Should have made exactly 3 attempts');
  });

  it('should not retry on non-429 error responses', async () => {
    mock = createFlexibleMockServer({
      handler: () => [400, { resourceType: 'OperationOutcome', issue: [{ diagnostics: 'Bad request' }] }],
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000 });
    // evaluateEcl throws on non-ok non-429 responses
    await assert.rejects(() => svc.evaluateEcl('<< 404684003'));
    assert.strictEqual(mock.requestCount(), 1, 'Should not retry on 400');
  });

  it('should honour Retry-After header when present', async () => {
    const retryAfterSeconds = 1;
    let callCount = 0;

    const server = http.createServer((_req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(429, { 'Retry-After': String(retryAfterSeconds), 'Content-Type': 'application/json' });
        res.end('{}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(OK_EXPAND));
      }
    });

    const serverBaseUrl = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    try {
      const start = Date.now();
      const svc = new FhirTerminologyService({ baseUrl: serverBaseUrl, timeout: 5000 });
      await svc.evaluateEcl('<< 404684003');
      const elapsed = Date.now() - start;

      assert.ok(
        elapsed >= retryAfterSeconds * 1000 - 100,
        `Should have waited at least ${retryAfterSeconds}s (got ${elapsed}ms)`,
      );
      assert.strictEqual(callCount, 2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
    }
  });
});
