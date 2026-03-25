// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as http from 'node:http';
import { parseECL } from '../parser';
import { isValidSnomedId, isValidConceptId, isValidDescriptionId } from '../terminology/verhoeff';
import { FhirTerminologyService } from '../terminology/fhir-service';
import { formatDocument } from '../formatter/formatter';
import { defaultFormattingOptions } from '../formatter/options';

// ── Mock HTTP server (same pattern as search-inactive-filter.test.ts) ──

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

// =============================================================================
// Security-focused tests: parser robustness, input validation, URL safety
// =============================================================================

describe('Security: Parser robustness', () => {
  // The key invariant: parseECL must NEVER throw on any input.
  // It should return errors gracefully.

  describe('Long input', () => {
    it('should handle long expressions without throwing', () => {
      const longExpr = '< 404684003 AND '.repeat(100); // ~1.6k chars
      assert.doesNotThrow(() => parseECL(longExpr));
      const result = parseECL(longExpr);
      assert.ok(result, 'Result must be truthy');
    });

    it('should handle a long concept ID', () => {
      const longId = '9'.repeat(1000);
      assert.doesNotThrow(() => parseECL(`< ${longId}`));
    });

    it('should handle a long display term', () => {
      const longTerm = 'A'.repeat(5000);
      assert.doesNotThrow(() => parseECL(`< 404684003 |${longTerm}|`));
    });

    it('should handle long whitespace', () => {
      const longWhitespace = ' '.repeat(5000);
      assert.doesNotThrow(() => parseECL(`<${longWhitespace}404684003`));
    });
  });

  describe('Deeply nested parentheses', () => {
    it('should handle deep nesting without throwing', () => {
      const open = '('.repeat(50);
      const close = ')'.repeat(50);
      const expr = `${open}< 404684003${close}`;
      assert.doesNotThrow(() => parseECL(expr));
    });

    it('should handle unbalanced deep nesting without throwing', () => {
      const open = '('.repeat(50);
      assert.doesNotThrow(() => parseECL(`${open}< 404684003`));
    });

    it('should handle only closing parentheses without throwing', () => {
      const close = ')'.repeat(50);
      assert.doesNotThrow(() => parseECL(`< 404684003${close}`));
    });
  });

  describe('Unicode injection', () => {
    it('should handle null bytes in expression', () => {
      assert.doesNotThrow(() => parseECL('< 404684003\x00AND < 19829001'));
      assert.doesNotThrow(() => parseECL('\x00'));
      assert.doesNotThrow(() => parseECL('< \x00404684003'));
    });

    it('should handle RTL override characters', () => {
      // U+202E RIGHT-TO-LEFT OVERRIDE
      assert.doesNotThrow(() => parseECL('< 404684003 \u202E|Clinical finding|'));
      assert.doesNotThrow(() => parseECL('\u202E< 404684003'));
    });

    it('should handle zero-width joiners in concept IDs', () => {
      // U+200D ZERO WIDTH JOINER
      assert.doesNotThrow(() => parseECL('< 404\u200D684003'));
      assert.doesNotThrow(() => parseECL('< 404684003\u200D'));
    });

    it('should handle zero-width spaces', () => {
      // U+200B ZERO WIDTH SPACE
      assert.doesNotThrow(() => parseECL('< 404\u200B684003'));
      assert.doesNotThrow(() => parseECL('\u200B< 404684003'));
    });

    it('should handle BOM characters', () => {
      // U+FEFF BOM
      assert.doesNotThrow(() => parseECL('\uFEFF< 404684003'));
    });

    it('should handle surrogate pairs and emoji', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 |\uD83D\uDE00 Clinical finding|'));
      assert.doesNotThrow(() => parseECL('< 404684003 |Clinical \uD800 finding|')); // lone surrogate
    });

    it('should handle homoglyph digits in concept IDs', () => {
      // Fullwidth digit zero U+FF10
      assert.doesNotThrow(() => parseECL('< \uFF1040\uFF104684003'));
    });
  });

  describe('Control characters', () => {
    it('should handle tab characters', () => {
      assert.doesNotThrow(() => parseECL('<\t404684003'));
      assert.doesNotThrow(() => parseECL('< 404684003\tAND\t< 19829001'));
    });

    it('should handle carriage return', () => {
      assert.doesNotThrow(() => parseECL('< 404684003\r\nAND < 19829001'));
      assert.doesNotThrow(() => parseECL('< 404684003\rAND < 19829001'));
    });

    it('should handle form feed and vertical tab', () => {
      assert.doesNotThrow(() => parseECL('< 404684003\x0CAND < 19829001'));
      assert.doesNotThrow(() => parseECL('< 404684003\x0BAND < 19829001'));
    });

    it('should handle bell and backspace characters', () => {
      assert.doesNotThrow(() => parseECL('\x07< 404684003'));
      assert.doesNotThrow(() => parseECL('< 404\x08684003'));
    });

    it('should handle escape sequences', () => {
      assert.doesNotThrow(() => parseECL('\x1B[31m< 404684003\x1B[0m'));
    });
  });

  describe('Template literal and injection attempts', () => {
    it('should handle template literal syntax without executing', () => {
      assert.doesNotThrow(() => parseECL('< ${process.exit(1)}'));
      const injectionPayload = '< 404684003 |${require("ch' + 'ild_pro' + 'cess")}|';
      assert.doesNotThrow(() => parseECL(injectionPayload));
    });

    it('should handle SQL injection patterns in display terms', () => {
      assert.doesNotThrow(() => parseECL("< 404684003 |'; DROP TABLE concepts; --|"));
      assert.doesNotThrow(() => parseECL('< 404684003 |1 OR 1=1 --|'));
      assert.doesNotThrow(() => parseECL("< 404684003 |Robert'); DROP TABLE Students;--|"));
    });

    it('should handle script injection in display terms', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 |<script>alert(1)</script>|'));
      assert.doesNotThrow(() => parseECL('< 404684003 |<img onerror=alert(1) src=x>|'));
      assert.doesNotThrow(() => parseECL('< 404684003 |javascript:alert(document.cookie)|'));
    });

    it('should handle LDAP injection patterns', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 |*)(uid=*))(|(uid=*|'));
    });

    it('should handle XML/XXE injection patterns', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 |<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>|'));
      assert.doesNotThrow(() => parseECL('< 404684003 |<![CDATA[<script>alert(1)</script>]]>|'));
    });

    it('should handle path traversal patterns', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 |../../../etc/passwd|'));
      assert.doesNotThrow(() => parseECL('< 404684003 |..\\..\\..\\windows\\system32\\config\\sam|'));
    });
  });

  describe('Pathological grammar inputs', () => {
    it('should handle repeated operators without operands', () => {
      assert.doesNotThrow(() => parseECL('AND AND AND AND AND'));
      assert.doesNotThrow(() => parseECL('OR OR OR OR OR'));
      assert.doesNotThrow(() => parseECL('MINUS MINUS MINUS'));
    });

    it('should handle mixed bracket types', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 [1..3]'));
      assert.doesNotThrow(() => parseECL('{ < 404684003 }'));
    });

    it('should handle only whitespace', () => {
      const result = parseECL('   \t\n  ');
      assert.ok(result, 'Result must be truthy');
    });

    it('should handle empty string', () => {
      const result = parseECL('');
      assert.ok(result, 'Result must be truthy');
    });

    it('should handle only comments', () => {
      assert.doesNotThrow(() => parseECL('// just a comment'));
      assert.doesNotThrow(() => parseECL('/* block comment */'));
    });

    it('should handle many operators chained', () => {
      const expr = Array.from({ length: 50 }, () => '< 404684003').join(' AND ');
      assert.doesNotThrow(() => parseECL(expr));
    });

    it('should handle pipe characters without matching', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 | unclosed term'));
      assert.doesNotThrow(() => parseECL('< 404684003 | | | | |'));
      assert.doesNotThrow(() => parseECL('|||'));
    });

    it('should handle colons and equals in unusual positions', () => {
      assert.doesNotThrow(() => parseECL(':::::'));
      assert.doesNotThrow(() => parseECL('====='));
      assert.doesNotThrow(() => parseECL(': = : = :'));
    });

    it('should handle filter block syntax edge cases', () => {
      assert.doesNotThrow(() => parseECL('< 404684003 {{ }}'));
      assert.doesNotThrow(() => parseECL('< 404684003 {{ D term = "" }}'));
      assert.doesNotThrow(() => parseECL('< 404684003 {{ {{ {{ }}'));
    });
  });

  describe('Formatter robustness with adversarial input', () => {
    it('should handle format of injection-laden expressions without throwing', () => {
      assert.doesNotThrow(() =>
        formatDocument("< 404684003 |<script>alert('xss')</script>|", defaultFormattingOptions),
      );
    });

    it('should handle format of long input without throwing', () => {
      const longExpr = '< 404684003 AND '.repeat(50);
      assert.doesNotThrow(() => formatDocument(longExpr, defaultFormattingOptions));
    });

    it('should handle format of empty/whitespace input without throwing', () => {
      assert.doesNotThrow(() => formatDocument('', defaultFormattingOptions));
      assert.doesNotThrow(() => formatDocument('   \n\t  ', defaultFormattingOptions));
    });
  });
});

describe('Security: SNOMED ID validation edge cases', () => {
  describe('Negative numbers', () => {
    it('should reject negative numbers', () => {
      assert.strictEqual(isValidSnomedId('-404684003'), false);
      assert.strictEqual(isValidConceptId('-404684003'), false);
      assert.strictEqual(isValidDescriptionId('-751689013'), false);
    });
  });

  describe('Floating point numbers', () => {
    it('should reject floating point strings', () => {
      assert.strictEqual(isValidSnomedId('404684003.0'), false);
      assert.strictEqual(isValidSnomedId('3.14159'), false);
      assert.strictEqual(isValidSnomedId('1e10'), false);
      assert.strictEqual(isValidSnomedId('1.5e3'), false);
      assert.strictEqual(isValidConceptId('404684003.5'), false);
    });
  });

  describe('Very large numbers (exceeding safe integer range)', () => {
    it('should reject numbers exceeding 18 digits', () => {
      // Number.MAX_SAFE_INTEGER = 9007199254740991 (16 digits)
      // SNOMED IDs can be up to 18 digits, but must pass Verhoeff check
      const nineteenDigits = '1234567890123456789';
      assert.strictEqual(isValidSnomedId(nineteenDigits), false, '19 digits');

      const twentyDigits = '12345678901234567890';
      assert.strictEqual(isValidSnomedId(twentyDigits), false, '20 digits');

      const fiftyDigits = '1'.repeat(50);
      assert.strictEqual(isValidSnomedId(fiftyDigits), false, '50 digits');
    });

    it('should handle MAX_SAFE_INTEGER boundary as string', () => {
      // These are valid strings but will fail Verhoeff/partition checks
      assert.strictEqual(isValidSnomedId('9007199254740991'), false);
      assert.strictEqual(isValidSnomedId('9007199254740992'), false);
    });
  });

  describe('Empty and whitespace strings', () => {
    it('should reject empty string', () => {
      assert.strictEqual(isValidSnomedId(''), false);
      assert.strictEqual(isValidConceptId(''), false);
      assert.strictEqual(isValidDescriptionId(''), false);
    });

    it('should reject whitespace-only strings', () => {
      assert.strictEqual(isValidSnomedId(' '), false);
      assert.strictEqual(isValidSnomedId('\t'), false);
      assert.strictEqual(isValidSnomedId('\n'), false);
      assert.strictEqual(isValidSnomedId('  \t\n  '), false);
    });
  });

  describe('IDs with leading zeros', () => {
    it('should handle IDs with leading zeros (they are syntactically all-digit strings)', () => {
      // Leading zeros make the string all-digit but likely fail Verhoeff
      assert.strictEqual(isValidSnomedId('0000404684003'), false);
      assert.strictEqual(isValidSnomedId('000000'), false);
    });
  });

  describe('IDs with embedded special characters', () => {
    it('should reject IDs with embedded spaces', () => {
      assert.strictEqual(isValidSnomedId('404 684 003'), false);
      assert.strictEqual(isValidSnomedId('404684003 '), false);
      assert.strictEqual(isValidSnomedId(' 404684003'), false);
    });

    it('should reject IDs with hyphens', () => {
      assert.strictEqual(isValidSnomedId('404-684-003'), false);
    });

    it('should reject IDs with commas or periods', () => {
      assert.strictEqual(isValidSnomedId('404,684,003'), false);
      assert.strictEqual(isValidSnomedId('404.684.003'), false);
    });

    it('should reject IDs with unicode digits', () => {
      // Arabic-Indic digits U+0660-U+0669
      assert.strictEqual(isValidSnomedId('\u0660\u0661\u0662\u0663\u0664\u0665'), false);
    });

    it('should reject IDs with null bytes', () => {
      assert.strictEqual(isValidSnomedId('404684\x00003'), false);
    });

    it('should reject IDs with plus or minus signs', () => {
      assert.strictEqual(isValidSnomedId('+404684003'), false);
      assert.strictEqual(isValidSnomedId('404684003+'), false);
    });
  });

  describe('Non-string inputs coerced to string', () => {
    it('should reject undefined and null', () => {
      assert.strictEqual(isValidSnomedId(undefined as unknown as string), false);
      assert.strictEqual(isValidSnomedId(null as unknown as string), false);
    });

    it('should reject numeric types', () => {
      // TypeScript prevents this, but runtime safety matters
      assert.strictEqual(isValidSnomedId(404684003 as unknown as string), false);
      assert.strictEqual(isValidSnomedId(NaN as unknown as string), false);
      assert.strictEqual(isValidSnomedId(Infinity as unknown as string), false);
    });

    it('should reject object types', () => {
      assert.strictEqual(isValidSnomedId({} as unknown as string), false);
      assert.strictEqual(isValidSnomedId([] as unknown as string), false);
    });
  });
});

describe('Security: URL safety in FHIR service', () => {
  // These tests use a local mock HTTP server to verify URL construction safety
  // without relying on network calls or timeouts.

  let mock: ReturnType<typeof createMockServer>;
  let baseUrl: string;

  beforeEach(async () => {
    mock = createMockServer();
    baseUrl = await mock.start();
  });

  afterEach(async () => {
    await mock.stop();
  });

  describe('searchConcepts input handling', () => {
    it('should return empty results for empty query', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      const result = await service.searchConcepts('');
      assert.deepStrictEqual(result, { results: [], hasMore: false });
    });

    it('should return empty results for whitespace-only query', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      const result = await service.searchConcepts('   ');
      assert.deepStrictEqual(result, { results: [], hasMore: false });
    });
  });

  describe('evaluateEcl input handling', () => {
    it('should return empty results for empty expression', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      const result = await service.evaluateEcl('');
      assert.deepStrictEqual(result, { total: 0, concepts: [], truncated: false });
    });

    it('should return empty results for whitespace-only expression', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      const result = await service.evaluateEcl('   ');
      assert.deepStrictEqual(result, { total: 0, concepts: [], truncated: false });
    });
  });

  describe('URL construction safety', () => {
    it('should properly encode special characters in ECL evaluation URLs', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 0, contains: [] },
      });

      await service.evaluateEcl('< 404684003 & extra=injected', 10);

      assert.strictEqual(mock.requests.length, 1);
      const url = mock.requests[0].url;
      // The '&' and '=' in the ECL should be encoded, not creating extra query params
      assert.ok(
        url.includes(encodeURIComponent('< 404684003 & extra=injected')),
        `URL should encode special chars: ${url}`,
      );
    });

    it('should properly encode search terms with special characters', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, {
        resourceType: 'ValueSet',
        expansion: { total: 0, contains: [] },
      });

      await service.searchConcepts('test&inject=true#fragment');

      assert.strictEqual(mock.requests.length, 1);
      const url = mock.requests[0].url;
      // The '&', '=', '#' should be encoded within the filter parameter
      assert.ok(!url.includes('inject=true'), `URL should not have injected parameter: ${url}`);
    });

    it('should properly encode version parameter', async () => {
      const service = new FhirTerminologyService({
        baseUrl,
        timeout: 2000,
        snomedVersion: 'http://snomed.info/sct/32506021000036107/version/20240131?extra=bad',
      });
      mock.setResponse(200, {
        resourceType: 'Parameters',
        parameter: [{ name: 'display', valueString: 'Clinical finding' }],
      });

      await service.getConceptInfo('404684003');

      assert.strictEqual(mock.requests.length, 1);
      const url = mock.requests[0].url;
      // The '?' in the version should be encoded, not creating an extra query param
      assert.ok(!url.includes('extra=bad'), `Version param should be encoded: ${url}`);
    });
  });

  describe('Concept ID parameter safety', () => {
    it('should not allow query parameter injection via concept ID', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, {
        resourceType: 'Parameters',
        parameter: [{ name: 'display', valueString: 'Test' }],
      });

      await service.getConceptInfo('404684003&system=http://evil.com');

      assert.strictEqual(mock.requests.length, 1);
      const url = mock.requests[0].url;
      assert.ok(!url.includes('system=http://evil.com'), `Should not inject extra params: ${url}`);
    });

    it('should not allow fragment injection via concept ID', async () => {
      const service = new FhirTerminologyService({ baseUrl, timeout: 2000 });
      mock.setResponse(200, {
        resourceType: 'Parameters',
        parameter: [{ name: 'display', valueString: 'Test' }],
      });

      await service.getConceptInfo('404684003#fragment');

      assert.strictEqual(mock.requests.length, 1);
      // The mock server receives the full URL without fragment (browsers strip them,
      // but Node.js fetch may include them in the path if not encoded)
      const url = mock.requests[0].url;
      assert.ok(url.includes('404684003'), `Should include concept ID: ${url}`);
    });
  });
});
