// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildMessage, buildHelpMessage } from '../message-builder';
import type { ProcessResult } from '../ecl-processor';

// ── Helper ──────────────────────────────────────────────────────────────

function makeResult(overrides?: Partial<ProcessResult>): ProcessResult {
  return {
    formatted: '< 404684003',
    errors: [],
    warnings: [],
    edition: 'Server default',
    ...overrides,
  };
}

// ── buildMessage ────────────────────────────────────────────────────────

describe('buildMessage', () => {
  // ── Formatted ECL section ─────────────────────────────────────────────
  it('should show formatted ECL in a code block', () => {
    const msg = buildMessage(makeResult({ formatted: '< 404684003 |Clinical finding (finding)|' }));
    assert.ok(msg.includes('```'));
    assert.ok(msg.includes('404684003'));
    assert.ok(msg.includes('*Formatted ECL*'));
  });

  it('should truncate formatted ECL exceeding 2900 chars', () => {
    const longEcl = '< ' + '404684003 '.repeat(400);
    const msg = buildMessage(makeResult({ formatted: longEcl }));
    assert.ok(msg.includes('… (truncated)'));
  });

  it('should not truncate ECL under 2900 chars', () => {
    const shortEcl = '< 404684003 |Clinical finding|';
    const msg = buildMessage(makeResult({ formatted: shortEcl }));
    assert.ok(!msg.includes('truncated'));
  });

  // ── No issues checkmark ───────────────────────────────────────────────
  it('should show checkmark when no errors and no warnings', () => {
    const msg = buildMessage(makeResult());
    assert.ok(msg.includes(':white_check_mark:'));
    assert.ok(msg.includes('No issues found'));
  });

  it('should not show checkmark when there are errors', () => {
    const msg = buildMessage(
      makeResult({
        errors: [{ line: 1, column: 1, endColumn: 5, message: 'Syntax error', severity: 'error' }],
      }),
    );
    assert.ok(!msg.includes(':white_check_mark:'));
  });

  it('should not show checkmark when there are warnings', () => {
    const msg = buildMessage(
      makeResult({
        warnings: [{ line: 1, column: 1, endColumn: 5, message: 'Inactive concept', severity: 'warning' }],
      }),
    );
    assert.ok(!msg.includes(':white_check_mark:'));
  });

  it('should not show checkmark when there are both errors and warnings', () => {
    const msg = buildMessage(
      makeResult({
        errors: [{ line: 1, column: 1, endColumn: 5, message: 'Syntax error', severity: 'error' }],
        warnings: [{ line: 1, column: 1, endColumn: 5, message: 'Warning', severity: 'warning' }],
      }),
    );
    assert.ok(!msg.includes(':white_check_mark:'));
  });

  // ── Errors section ────────────────────────────────────────────────────
  it('should show errors with red circle emoji', () => {
    const msg = buildMessage(
      makeResult({
        errors: [{ line: 1, column: 17, endColumn: 20, message: 'Duplicate operator `AND`', severity: 'error' }],
      }),
    );
    assert.ok(msg.includes(':red_circle:'));
    assert.ok(msg.includes('*Errors*'));
    assert.ok(msg.includes('Duplicate operator'));
    assert.ok(msg.includes('Line 1:17'));
  });

  it('should show multiple errors', () => {
    const msg = buildMessage(
      makeResult({
        errors: [
          { line: 1, column: 5, endColumn: 10, message: 'First error', severity: 'error' },
          { line: 2, column: 3, endColumn: 8, message: 'Second error', severity: 'error' },
        ],
      }),
    );
    assert.ok(msg.includes('First error'));
    assert.ok(msg.includes('Second error'));
    assert.ok(msg.includes('Line 1:5'));
    assert.ok(msg.includes('Line 2:3'));
  });

  it('should not show errors section when there are none', () => {
    const msg = buildMessage(makeResult());
    assert.ok(!msg.includes(':red_circle:'));
  });

  // ── Warnings section ──────────────────────────────────────────────────
  it('should show warnings with warning emoji', () => {
    const msg = buildMessage(
      makeResult({
        warnings: [
          {
            line: 1,
            column: 3,
            endColumn: 12,
            message: '399144008 |Bronze diabetes| — Inactive concept',
            severity: 'warning',
          },
        ],
      }),
    );
    assert.ok(msg.includes(':warning:'));
    assert.ok(msg.includes('*Warnings*'));
    assert.ok(msg.includes('Inactive concept'));
  });

  it('should show multiple warnings', () => {
    const msg = buildMessage(
      makeResult({
        warnings: [
          { line: 1, column: 1, endColumn: 5, message: 'First warning', severity: 'warning' },
          { line: 1, column: 10, endColumn: 15, message: 'Second warning', severity: 'warning' },
          { line: 2, column: 1, endColumn: 5, message: 'Third warning', severity: 'warning' },
        ],
      }),
    );
    assert.ok(msg.includes('First warning'));
    assert.ok(msg.includes('Second warning'));
    assert.ok(msg.includes('Third warning'));
  });

  it('should not show warnings section when there are none', () => {
    const msg = buildMessage(makeResult());
    assert.ok(!msg.includes(':warning:'));
  });

  // ── Section ordering ──────────────────────────────────────────────────
  it('should show errors before warnings', () => {
    const msg = buildMessage(
      makeResult({
        errors: [{ line: 1, column: 1, endColumn: 5, message: 'Syntax error', severity: 'error' }],
        warnings: [{ line: 1, column: 3, endColumn: 12, message: 'Inactive concept', severity: 'warning' }],
      }),
    );
    const errorIdx = msg.indexOf(':red_circle:');
    const warnIdx = msg.indexOf(':warning:');
    assert.ok(errorIdx < warnIdx, 'Errors should appear before warnings');
  });

  it('should show ECL first, then diagnostics, then evaluation, then edition', () => {
    const msg = buildMessage(
      makeResult({
        warnings: [{ line: 1, column: 1, endColumn: 5, message: 'Test warning', severity: 'warning' }],
        evaluation: { count: 10, concepts: [{ code: '123', display: 'Test' }] },
      }),
    );
    const eclIdx = msg.indexOf('*Formatted ECL*');
    const warnIdx = msg.indexOf(':warning:');
    const evalIdx = msg.indexOf(':bar_chart:');
    const editionIdx = msg.indexOf(':book:');
    assert.ok(eclIdx < warnIdx);
    assert.ok(warnIdx < evalIdx);
    assert.ok(evalIdx < editionIdx);
  });

  // ── Evaluation section ────────────────────────────────────────────────
  it('should show evaluation with concept count', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: {
          count: 1247,
          concepts: [
            { code: '73211009', display: 'Diabetes mellitus' },
            { code: '44054006', display: 'Type 2 diabetes mellitus' },
          ],
        },
      }),
    );
    assert.ok(msg.includes(':bar_chart:'));
    assert.ok(msg.includes('*Evaluation*'));
    assert.ok(msg.includes('1,247 concepts matched'));
  });

  it('should show singular "concept" for count of 1', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
      }),
    );
    assert.ok(msg.includes('1 concept matched'));
    assert.ok(!msg.includes('1 concepts'));
  });

  it('should show plural "concepts" for count > 1', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 5, concepts: [{ code: '123', display: 'Test' }] },
      }),
    );
    assert.ok(msg.includes('concepts matched'));
  });

  it('should show "0 concepts matched" for empty result', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 0, concepts: [] },
      }),
    );
    assert.ok(msg.includes('0 concepts matched'));
  });

  it('should format large counts with commas', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1234567, concepts: [] },
      }),
    );
    assert.ok(msg.includes('1,234,567'));
  });

  it('should show concept code and display in evaluation rows', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: {
          count: 2,
          concepts: [
            { code: '73211009', display: 'Diabetes mellitus' },
            { code: '44054006', display: 'Type 2 diabetes mellitus' },
          ],
        },
      }),
    );
    assert.ok(msg.includes('73211009'));
    assert.ok(msg.includes('Diabetes mellitus'));
    assert.ok(msg.includes('44054006'));
    assert.ok(msg.includes('Type 2 diabetes mellitus'));
  });

  it('should show "and N more" when count exceeds shown concepts', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: {
          count: 1247,
          concepts: [
            { code: '73211009', display: 'Diabetes mellitus' },
            { code: '44054006', display: 'Type 2 diabetes mellitus' },
          ],
        },
      }),
    );
    assert.ok(msg.includes('and 1,245 more'));
  });

  it('should not show "and N more" when all concepts are displayed', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: {
          count: 2,
          concepts: [
            { code: '73211009', display: 'Diabetes mellitus' },
            { code: '44054006', display: 'Type 2 diabetes mellitus' },
          ],
        },
      }),
    );
    assert.ok(!msg.includes('more'));
  });

  it('should not show evaluation section when undefined', () => {
    const msg = buildMessage(makeResult());
    assert.ok(!msg.includes(':bar_chart:'));
  });

  // ── Shrimp links ──────────────────────────────────────────────────────
  it('should render inline code when editionUri is not available', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
      }),
    );
    assert.ok(msg.includes('`73211009`'));
    assert.ok(!msg.includes('ontoserver.csiro.au/shrimp'));
  });

  it('should render Shrimp links when editionUri is available', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
      }),
    );
    assert.ok(msg.includes('ontoserver.csiro.au/shrimp'));
    assert.ok(msg.includes('|73211009>'));
  });

  it('should include concept parameter in Shrimp URL', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
      }),
    );
    assert.ok(msg.includes('concept=73211009'));
  });

  it('should include version parameter in Shrimp URL', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
      }),
    );
    // URL-encoded version URI
    assert.ok(msg.includes('version='));
    assert.ok(msg.includes('snomed.info'));
  });

  it('should include valueset parameter with edition base and fhir_vs', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
      }),
    );
    // valueset should use edition base (without /version/...) + ?fhir_vs
    assert.ok(msg.includes('valueset='));
    assert.ok(msg.includes('fhir_vs'));
  });

  it('should include fhir parameter in Shrimp URL', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        fhirServerUrl: 'https://custom.fhir.server/fhir',
      }),
    );
    assert.ok(msg.includes('fhir='));
    assert.ok(msg.includes('custom.fhir.server'));
  });

  it('should use default FHIR server in Shrimp URL when fhirServerUrl is not set', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: { count: 1, concepts: [{ code: '73211009', display: 'Diabetes mellitus' }] },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        // fhirServerUrl intentionally omitted
      }),
    );
    assert.ok(msg.includes('tx.ontoserver.csiro.au'));
  });

  it('should generate unique Shrimp links for each concept', () => {
    const msg = buildMessage(
      makeResult({
        evaluation: {
          count: 2,
          concepts: [
            { code: '73211009', display: 'Diabetes mellitus' },
            { code: '44054006', display: 'Type 2 diabetes mellitus' },
          ],
        },
        editionUri: 'http://snomed.info/sct/32506021000036107/version/20260228',
        fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
      }),
    );
    assert.ok(msg.includes('concept=73211009'));
    assert.ok(msg.includes('concept=44054006'));
    assert.ok(msg.includes('|73211009>'));
    assert.ok(msg.includes('|44054006>'));
  });

  // ── Edition footer ────────────────────────────────────────────────────
  it('should always show edition footer', () => {
    const msg = buildMessage(makeResult({ edition: 'SNOMED CT Australian' }));
    assert.ok(msg.includes(':book:'));
    assert.ok(msg.includes('SNOMED CT Australian'));
  });

  it('should show "Server default" edition when no edition resolved', () => {
    const msg = buildMessage(makeResult());
    assert.ok(msg.includes('Server default'));
  });

  it('should show human-readable edition with URI', () => {
    const msg = buildMessage(
      makeResult({
        edition: 'International, version 2024-09-01 (http://snomed.info/sct/900000000000207008/version/20240901)',
      }),
    );
    assert.ok(msg.includes('International'));
    assert.ok(msg.includes('2024-09-01'));
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  it('should handle all sections together (errors + warnings + evaluation + edition)', () => {
    const msg = buildMessage(
      makeResult({
        errors: [{ line: 1, column: 1, endColumn: 5, message: 'Error', severity: 'error' }],
        warnings: [{ line: 1, column: 1, endColumn: 5, message: 'Warning', severity: 'warning' }],
        evaluation: { count: 10, concepts: [{ code: '123', display: 'Test' }] },
        edition: 'Test edition',
      }),
    );
    assert.ok(msg.includes(':red_circle:'));
    assert.ok(msg.includes(':warning:'));
    assert.ok(msg.includes(':bar_chart:'));
    assert.ok(msg.includes(':book:'));
  });

  it('should handle empty formatted ECL', () => {
    const msg = buildMessage(makeResult({ formatted: '' }));
    assert.ok(msg.includes('```'));
  });
});

// ── buildHelpMessage ────────────────────────────────────────────────────

describe('buildHelpMessage', () => {
  it('should include title', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('*ECL Bot Usage*'));
  });

  it('should include slash command usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('/ecl'));
  });

  it('should include @mention usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('@ECL Bot'));
  });

  it('should include DM usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('Direct message'));
  });

  it('should mention automatic evaluation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('automatically evaluated'));
  });

  it('should include --edition flag documentation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('--edition'));
  });

  it('should include help command documentation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('`help`'));
  });

  it('should list all edition shorthand codes', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('int'));
    assert.ok(msg.includes('au'));
    assert.ok(msg.includes('us'));
    assert.ok(msg.includes('uk'));
    assert.ok(msg.includes('nz'));
  });

  it('should mention full URI support for edition', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('full URI'));
  });

  it('should not include --eval flag (evaluation is now automatic)', () => {
    const msg = buildHelpMessage();
    assert.ok(!msg.includes('--eval'));
  });
});
