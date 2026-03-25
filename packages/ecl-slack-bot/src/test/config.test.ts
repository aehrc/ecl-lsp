// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { resolveEdition, formatResolvedVersion, loadConfig, EDITION_ALIASES } from '../config';

// ── EDITION_ALIASES ─────────────────────────────────────────────────────

describe('EDITION_ALIASES', () => {
  it('should contain all 5 expected aliases', () => {
    assert.strictEqual(Object.keys(EDITION_ALIASES).length, 5);
    assert.ok('int' in EDITION_ALIASES);
    assert.ok('au' in EDITION_ALIASES);
    assert.ok('us' in EDITION_ALIASES);
    assert.ok('uk' in EDITION_ALIASES);
    assert.ok('nz' in EDITION_ALIASES);
  });

  it('should map int to International edition URI', () => {
    assert.strictEqual(EDITION_ALIASES.int, 'http://snomed.info/sct/900000000000207008');
  });

  it('should map au to Australian edition URI', () => {
    assert.strictEqual(EDITION_ALIASES.au, 'http://snomed.info/sct/32506021000036107');
  });

  it('should map us to US edition URI', () => {
    assert.strictEqual(EDITION_ALIASES.us, 'http://snomed.info/sct/731000124108');
  });

  it('should map uk to UK edition URI', () => {
    assert.strictEqual(EDITION_ALIASES.uk, 'http://snomed.info/sct/83821000000107');
  });

  it('should map nz to New Zealand edition URI', () => {
    assert.strictEqual(EDITION_ALIASES.nz, 'http://snomed.info/sct/21000210109');
  });
});

// ── resolveEdition ──────────────────────────────────────────────────────

describe('resolveEdition', () => {
  // Happy path: all aliases
  it('should resolve "int" to International URI', () => {
    assert.strictEqual(resolveEdition('int'), 'http://snomed.info/sct/900000000000207008');
  });

  it('should resolve "au" to Australian URI', () => {
    assert.strictEqual(resolveEdition('au'), 'http://snomed.info/sct/32506021000036107');
  });

  it('should resolve "us" to US URI', () => {
    assert.strictEqual(resolveEdition('us'), 'http://snomed.info/sct/731000124108');
  });

  it('should resolve "uk" to UK URI', () => {
    assert.strictEqual(resolveEdition('uk'), 'http://snomed.info/sct/83821000000107');
  });

  it('should resolve "nz" to New Zealand URI', () => {
    assert.strictEqual(resolveEdition('nz'), 'http://snomed.info/sct/21000210109');
  });

  // Case insensitivity
  it('should resolve uppercase "AU"', () => {
    assert.strictEqual(resolveEdition('AU'), 'http://snomed.info/sct/32506021000036107');
  });

  it('should resolve mixed case "Int"', () => {
    assert.strictEqual(resolveEdition('Int'), 'http://snomed.info/sct/900000000000207008');
  });

  it('should resolve uppercase "US"', () => {
    assert.strictEqual(resolveEdition('US'), 'http://snomed.info/sct/731000124108');
  });

  it('should resolve mixed case "Nz"', () => {
    assert.strictEqual(resolveEdition('Nz'), 'http://snomed.info/sct/21000210109');
  });

  // URI passthrough
  it('should pass through http:// URI unchanged', () => {
    const uri = 'http://snomed.info/sct/731000124108';
    assert.strictEqual(resolveEdition(uri), uri);
  });

  it('should pass through https:// URI unchanged', () => {
    const uri = 'https://custom.server.com/sct/123456';
    assert.strictEqual(resolveEdition(uri), uri);
  });

  it('should pass through full version URI unchanged', () => {
    const uri = 'http://snomed.info/sct/32506021000036107/version/20260228';
    assert.strictEqual(resolveEdition(uri), uri);
  });

  // Invalid inputs
  it('should return null for unknown alias', () => {
    assert.strictEqual(resolveEdition('xx'), null);
  });

  it('should return null for empty string', () => {
    assert.strictEqual(resolveEdition(''), null);
  });

  it('should return null for numeric string', () => {
    assert.strictEqual(resolveEdition('12345'), null);
  });

  it('should return null for alias substring', () => {
    assert.strictEqual(resolveEdition('a'), null);
  });

  it('should return null for alias superstring', () => {
    assert.strictEqual(resolveEdition('australia'), null);
  });

  it('should return null for ftp:// URI', () => {
    assert.strictEqual(resolveEdition('ftp://example.com'), null);
  });
});

// ── formatResolvedVersion ───────────────────────────────────────────────

describe('formatResolvedVersion', () => {
  // All known editions
  it('should format International edition version URI', () => {
    const result = formatResolvedVersion('http://snomed.info/sct/900000000000207008/version/20240901');
    assert.strictEqual(
      result,
      'International, version 2024-09-01 (http://snomed.info/sct/900000000000207008/version/20240901)',
    );
  });

  it('should format Australian edition version URI', () => {
    const result = formatResolvedVersion('http://snomed.info/sct/32506021000036107/version/20241231');
    assert.strictEqual(
      result,
      'Australian, version 2024-12-31 (http://snomed.info/sct/32506021000036107/version/20241231)',
    );
  });

  it('should format US edition version URI', () => {
    const result = formatResolvedVersion('http://snomed.info/sct/731000124108/version/20240301');
    assert.strictEqual(result, 'US, version 2024-03-01 (http://snomed.info/sct/731000124108/version/20240301)');
  });

  it('should format UK edition version URI', () => {
    const result = formatResolvedVersion('http://snomed.info/sct/83821000000107/version/20240615');
    assert.strictEqual(result, 'UK, version 2024-06-15 (http://snomed.info/sct/83821000000107/version/20240615)');
  });

  it('should format New Zealand edition version URI', () => {
    const result = formatResolvedVersion('http://snomed.info/sct/21000210109/version/20240101');
    assert.strictEqual(result, 'New Zealand, version 2024-01-01 (http://snomed.info/sct/21000210109/version/20240101)');
  });

  // Unknown edition
  it('should format unknown edition with just version date', () => {
    const result = formatResolvedVersion('http://snomed.info/sct/999999999999999999/version/20240601');
    assert.strictEqual(result, 'version 2024-06-01 (http://snomed.info/sct/999999999999999999/version/20240601)');
  });

  // Non-matching inputs (returned unchanged)
  it('should return edition URI without version suffix unchanged', () => {
    const uri = 'http://snomed.info/sct/900000000000207008';
    assert.strictEqual(formatResolvedVersion(uri), uri);
  });

  it('should return empty string unchanged', () => {
    assert.strictEqual(formatResolvedVersion(''), '');
  });

  it('should return arbitrary string unchanged', () => {
    assert.strictEqual(formatResolvedVersion('not a uri'), 'not a uri');
  });

  it('should return URI with short date unchanged (not 8 digits)', () => {
    const uri = 'http://snomed.info/sct/900000000000207008/version/2024';
    assert.strictEqual(formatResolvedVersion(uri), uri);
  });

  it('should return URI with extra path segments unchanged', () => {
    const uri = 'http://snomed.info/sct/900000000000207008/version/20240901/extra';
    assert.strictEqual(formatResolvedVersion(uri), uri);
  });
});

// ── loadConfig ──────────────────────────────────────────────────────────

describe('loadConfig', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'FHIR_SERVER_URL', 'SNOMED_EDITION', 'MAX_EVAL_RESULTS'];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('should return empty tokens when env vars are not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.slackBotToken, '');
    assert.strictEqual(config.slackAppToken, '');
  });

  it('should return default FHIR server URL when not configured', () => {
    const config = loadConfig();
    assert.strictEqual(config.fhirServerUrl, 'https://tx.ontoserver.csiro.au/fhir');
  });

  it('should return undefined snomedEdition when not configured', () => {
    const config = loadConfig();
    assert.strictEqual(config.snomedEdition, undefined);
  });

  it('should return undefined snomedEdition for empty string', () => {
    process.env.SNOMED_EDITION = '';
    const config = loadConfig();
    assert.strictEqual(config.snomedEdition, undefined);
  });

  it('should default maxEvalResults to 5', () => {
    const config = loadConfig();
    assert.strictEqual(config.maxEvalResults, 5);
  });

  it('should read tokens from environment', () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    process.env.SLACK_APP_TOKEN = 'xapp-test-token';
    const config = loadConfig();
    assert.strictEqual(config.slackBotToken, 'xoxb-test-token');
    assert.strictEqual(config.slackAppToken, 'xapp-test-token');
  });

  it('should read custom FHIR server URL', () => {
    process.env.FHIR_SERVER_URL = 'https://custom.fhir.server/fhir';
    const config = loadConfig();
    assert.strictEqual(config.fhirServerUrl, 'https://custom.fhir.server/fhir');
  });

  it('should read SNOMED edition', () => {
    process.env.SNOMED_EDITION = 'http://snomed.info/sct/32506021000036107';
    const config = loadConfig();
    assert.strictEqual(config.snomedEdition, 'http://snomed.info/sct/32506021000036107');
  });

  it('should parse MAX_EVAL_RESULTS as integer', () => {
    process.env.MAX_EVAL_RESULTS = '10';
    const config = loadConfig();
    assert.strictEqual(config.maxEvalResults, 10);
  });

  it('should default MAX_EVAL_RESULTS to 5 for non-numeric value', () => {
    process.env.MAX_EVAL_RESULTS = 'abc';
    const config = loadConfig();
    assert.strictEqual(config.maxEvalResults, 5);
  });

  it('should default MAX_EVAL_RESULTS to 5 for zero', () => {
    process.env.MAX_EVAL_RESULTS = '0';
    const config = loadConfig();
    assert.strictEqual(config.maxEvalResults, 5);
  });
});
