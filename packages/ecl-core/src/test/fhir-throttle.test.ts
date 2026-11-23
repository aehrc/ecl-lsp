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

  it('should reject once the rate-limit wait budget is spent', async () => {
    mock = createFlexibleMockServer({
      handler: () => [429, {}],
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000, rateLimitWaitMs: 1200 });
    const start = Date.now();
    await assert.rejects(() => svc.evaluateEcl('<< 404684003'), /rate-limited/i);
    const elapsed = Date.now() - start;
    assert.ok(mock.requestCount() >= 2, `retried at least once (made ${mock.requestCount()})`);
    assert.ok(elapsed < 4000, `gave up near the 1.2 s budget (took ${elapsed} ms)`);
  });

  it('should keep retrying past three attempts while the budget lasts', async () => {
    // The public Ontoserver refills about one request every 2 s once its burst
    // is spent, so a fixed three attempts gave up long before it recovered.
    let callCount = 0;
    mock = createFlexibleMockServer({
      handler: () => (++callCount <= 4 ? [429, {}] : [200, OK_EXPAND]),
    });
    baseUrl = await mock.start();

    const svc = new FhirTerminologyService({ baseUrl, timeout: 5000, rateLimitWaitMs: 30_000 });
    const result = await svc.evaluateEcl('<< 404684003');
    assert.strictEqual(result.concepts.length, 1);
    assert.strictEqual(callCount, 5);
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
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    }
  });
});

describe('FhirTerminologyService — x-ratelimit headers', () => {
  /** A server that answers request `idx` with `respond(idx)`, recording when each arrived. */
  async function headerServer(
    respond: (idx: number) => { status: number; headers: Partial<Record<string, string>> },
  ): Promise<{ url: string; times: number[]; stop: () => Promise<void> }> {
    const times: number[] = [];
    const server = http.createServer((_req, res) => {
      const idx = times.length;
      times.push(Date.now());
      const { status, headers } = respond(idx);
      const sent = Object.entries(headers).filter((e): e is [string, string] => e[1] !== undefined);
      res.writeHead(status, { 'Content-Type': 'application/json', ...Object.fromEntries(sent) });
      res.end(JSON.stringify(status === 200 ? OK_EXPAND : {}));
    });
    const url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
      });
    });
    return {
      url,
      times,
      stop: () =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    };
  }

  it('waits x-ratelimit-reset seconds after a 429 that has no Retry-After', async () => {
    const s = await headerServer((idx) =>
      idx === 0
        ? {
            status: 429,
            headers: { 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1' },
          }
        : { status: 200, headers: {} },
    );
    try {
      const svc = new FhirTerminologyService({ baseUrl: s.url, timeout: 5000 });
      await svc.evaluateEcl('<< 404684003');
      assert.strictEqual(s.times.length, 2);
      assert.ok(s.times[1] - s.times[0] >= 900, `waited ${s.times[1] - s.times[0]} ms, want about 1 s`);
    } finally {
      await s.stop();
    }
  });

  it('pauses the next request when a success reports no requests remaining', async () => {
    const s = await headerServer((idx) => ({
      status: 200,
      headers: idx === 0 ? { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1' } : {},
    }));
    try {
      const svc = new FhirTerminologyService({ baseUrl: s.url, timeout: 5000 });
      await svc.evaluateEcl('<< 1');
      await svc.evaluateEcl('<< 2');
      assert.strictEqual(s.times.length, 2);
      assert.ok(s.times[1] - s.times[0] >= 900, `second request after ${s.times[1] - s.times[0]} ms, want about 1 s`);
    } finally {
      await s.stop();
    }
  });

  it('holds every in-flight request while the limit resets, not just the one that hit it', async () => {
    // Before, each concurrent request met its own 429s and spent its own
    // retries; with a shared pause no request is sent again until the reset.
    let resetAt = 0;
    const s = await headerServer(() => {
      const now = Date.now();
      if (resetAt === 0) resetAt = now + 1000;
      return now < resetAt
        ? { status: 429, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1' } }
        : { status: 200, headers: {} };
    });
    try {
      const svc = new FhirTerminologyService({ baseUrl: s.url, timeout: 5000, maxConcurrency: 8 });
      await Promise.all(Array.from({ length: 8 }, (_, i) => svc.evaluateEcl(`<< ${i + 1}`)));
      const early = s.times.filter((t) => t < resetAt).length;
      assert.ok(early <= 8, `${early} requests were sent before the reset; want only the first wave`);
      assert.strictEqual(s.times.length - early, 8, 'each request succeeds once after the reset');
    } finally {
      await s.stop();
    }
  });
  it('lets held requests go one at a time after a reset, so a token bucket serves them all', async () => {
    // A bucket of 5 refilling one every 100 ms, reset given in fractional seconds.
    // Before, every held request fired when a pause ended: one won, the rest met
    // 429s and paused again, with no order, until some ran out their budget.
    const capacity = 5;
    const refillMs = 100;
    let tokens = capacity;
    let last = Date.now();
    let rejected = 0;
    const s = await headerServer(() => {
      const now = Date.now();
      tokens = Math.min(capacity, tokens + (now - last) / refillMs);
      last = now;
      const reset = (((1 - (tokens % 1)) * refillMs) / 1000).toFixed(3);
      if (tokens < 1) {
        rejected++;
        return { status: 429, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } };
      }
      tokens -= 1;
      return {
        status: 200,
        headers: { 'x-ratelimit-remaining': String(Math.floor(tokens)), 'x-ratelimit-reset': reset },
      };
    });
    try {
      const svc = new FhirTerminologyService({
        baseUrl: s.url,
        timeout: 5000,
        maxConcurrency: 25,
        rateLimitWaitMs: 8000,
      });
      const results = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => svc.evaluateEcl(`<< ${i + 1}`)));
      assert.strictEqual(results.filter((r) => r.status === 'rejected').length, 0);
      // Measured: 34-36 with the gate (20 of them the first wave, sent before any
      // answer said the bucket was empty); 254, or failed requests, without it.
      assert.ok(rejected <= 60, `${rejected} requests were rejected with 429 for 60 served`);
    } finally {
      await s.stop();
    }
  });
});
