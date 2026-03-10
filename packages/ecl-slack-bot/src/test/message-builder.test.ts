// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildMessage, buildHelpMessage } from '../message-builder';
import type { ProcessResult } from '../ecl-processor';

describe('buildMessage', () => {
  it('should show formatted ECL in a code block', () => {
    const result: ProcessResult = {
      formatted: '< 404684003 |Clinical finding (finding)|',
      errors: [],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes('```'));
    assert.ok(msg.includes('404684003'));
  });

  it('should show checkmark when no issues', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes('No issues found'));
  });

  it('should show errors with red circle emoji', () => {
    const result: ProcessResult = {
      formatted: '< 404684003 AND AND < 19829001',
      errors: [{ line: 1, column: 17, endColumn: 20, message: 'Duplicate operator `AND`', severity: 'error' }],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':red_circle:'));
    assert.ok(msg.includes('Duplicate operator'));
    assert.ok(msg.includes('Line 1:17'));
  });

  it('should show warnings with warning emoji', () => {
    const result: ProcessResult = {
      formatted: '< 399144008 |Bronze diabetes|',
      errors: [],
      warnings: [
        {
          line: 1,
          column: 3,
          endColumn: 12,
          message: '399144008 |Bronze diabetes| — Inactive concept',
          severity: 'warning',
        },
      ],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':warning:'));
    assert.ok(msg.includes('Inactive concept'));
  });

  it('should show evaluation results with chart emoji', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [],
      warnings: [],
      evaluation: { count: 1247, sample: ['73211009 |Diabetes mellitus|', '44054006 |Type 2 diabetes|'] },
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':bar_chart:'));
    assert.ok(msg.includes('1,247'));
    assert.ok(msg.includes('Diabetes mellitus'));
  });

  it('should always show edition footer', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [],
      warnings: [],
      edition: 'SNOMED CT Australian',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':book:'));
    assert.ok(msg.includes('SNOMED CT Australian'));
  });

  it('should show both errors and warnings in correct order', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [{ line: 1, column: 1, endColumn: 5, message: 'Syntax error', severity: 'error' }],
      warnings: [{ line: 1, column: 3, endColumn: 12, message: 'Inactive concept', severity: 'warning' }],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    const errorIdx = msg.indexOf(':red_circle:');
    const warnIdx = msg.indexOf(':warning:');
    assert.ok(errorIdx < warnIdx, 'Errors should appear before warnings');
  });

  it('should truncate formatted ECL exceeding 2900 chars', () => {
    const longEcl = '< ' + '404684003 '.repeat(400);
    const result: ProcessResult = {
      formatted: longEcl,
      errors: [],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes('… (truncated)'));
  });
});

describe('buildHelpMessage', () => {
  it('should include slash command usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('/ecl'));
  });

  it('should include @mention usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('@ECL Bot'));
  });

  it('should include --eval flag documentation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('--eval'));
  });

  it('should include --edition flag documentation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('--edition'));
  });
});
