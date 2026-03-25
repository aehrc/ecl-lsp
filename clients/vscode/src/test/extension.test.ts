// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * VSCode extension unit tests — pure logic functions extracted from extension.ts.
 *
 * These test the extractable logic (URI parsing, label formatting, status bar text)
 * without requiring a running VSCode instance.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert';

// ── Re-implement pure functions from extension.ts for testing ──────────
// (These are module-private in extension.ts; we duplicate the logic here
//  so we can validate it without importing the VSCode-dependent module.)

const MODULE_TO_COUNTRY = new Map<string, string>([
  ['900000000000207008', 'International'],
  ['32506021000036107', 'Australian'],
  ['731000124108', 'US'],
  ['999000011000000103', 'UK Clinical'],
  ['999000021000000109', 'UK Drug'],
  ['83821000000107', 'UK Composition'],
  ['11000172109', 'Belgian'],
  ['21000210109', 'Danish'],
  ['554471000005108', 'Danish'],
  ['11000146104', 'Dutch'],
  ['11000181102', 'Estonian'],
  ['11000229109', 'Irish'],
  ['11000220105', 'Uruguayan'],
  ['5631000179106', 'Uruguayan'],
  ['45991000052106', 'Swedish'],
  ['11000221109', 'Argentinian'],
  ['20611000087101', 'Canadian'],
  ['11000274103', 'German'],
  ['51000202101', 'Norwegian'],
  ['11000234105', 'Austrian'],
  ['2011000195101', 'Swiss'],
  ['11000315107', 'French'],
  ['900000001000122104', 'Spanish'],
  ['450829007', 'Spanish (Latin America)'],
  ['11000318109', 'Jamaican'],
  ['332351000009108', 'Veterinary (VTSL)'],
  ['11010000107', 'LOINC Extension'],
  ['999991001000101', 'IPS Terminology'],
]);

function parseSnomedVersionUri(uri: string): { moduleId: string; date?: string } | null {
  const pinned = /^http:\/\/snomed\.info\/sct\/(\d+)\/version\/(\d+)$/.exec(uri);
  if (pinned) return { moduleId: pinned[1], date: pinned[2] };
  const editionOnly = /^http:\/\/snomed\.info\/sct\/(\d+)$/.exec(uri);
  if (editionOnly) return { moduleId: editionOnly[1] };
  return null;
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function getEditionLabel(moduleId: string): string {
  return MODULE_TO_COUNTRY.get(moduleId) ?? moduleId;
}

/** Simulate the status bar text generation logic from extension.ts updateStatusBar(). */
function computeStatusBarText(setting: string, resolvedVersionUri: string | null): string {
  if (!setting) {
    if (resolvedVersionUri) {
      const parsed = parseSnomedVersionUri(resolvedVersionUri);
      if (parsed?.date) {
        return `$(globe) (Default) ${getEditionLabel(parsed.moduleId)} ${formatDate(parsed.date)}`;
      }
    }
    return '$(globe) (Default)';
  }

  const parsed = parseSnomedVersionUri(setting);
  if (parsed) {
    const label = getEditionLabel(parsed.moduleId);
    if (parsed.date) {
      return `$(globe) ${label} ${formatDate(parsed.date)}`;
    }
    if (resolvedVersionUri) {
      const resolved = parseSnomedVersionUri(resolvedVersionUri);
      if (resolved?.date) {
        return `$(globe) ${label} ${formatDate(resolved.date)} (latest)`;
      }
    }
    return `$(globe) ${label} (latest)`;
  }
  return `$(globe) Custom edition`;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('parseSnomedVersionUri', () => {
  it('should parse a pinned version URI', () => {
    const result = parseSnomedVersionUri('http://snomed.info/sct/32506021000036107/version/20260131');
    assert.deepStrictEqual(result, { moduleId: '32506021000036107', date: '20260131' });
  });

  it('should parse an edition-only URI', () => {
    const result = parseSnomedVersionUri('http://snomed.info/sct/32506021000036107');
    assert.deepStrictEqual(result, { moduleId: '32506021000036107' });
  });

  it('should return null for invalid URI', () => {
    assert.strictEqual(parseSnomedVersionUri('not-a-uri'), null);
  });

  it('should return null for empty string', () => {
    assert.strictEqual(parseSnomedVersionUri(''), null);
  });

  it('should return null for https scheme (only http)', () => {
    assert.strictEqual(parseSnomedVersionUri('https://snomed.info/sct/32506021000036107'), null);
  });

  it('should parse International module ID', () => {
    const result = parseSnomedVersionUri('http://snomed.info/sct/900000000000207008/version/20240101');
    assert.deepStrictEqual(result, { moduleId: '900000000000207008', date: '20240101' });
  });

  it('should reject URI with trailing slash', () => {
    assert.strictEqual(parseSnomedVersionUri('http://snomed.info/sct/32506021000036107/'), null);
  });

  it('should reject URI with extra path segments', () => {
    assert.strictEqual(parseSnomedVersionUri('http://snomed.info/sct/32506021000036107/version/20260131/extra'), null);
  });
});

describe('formatDate', () => {
  it('should format 8-digit date as YYYY-MM-DD', () => {
    assert.strictEqual(formatDate('20260131'), '2026-01-31');
  });

  it('should return input unchanged if not 8 digits', () => {
    assert.strictEqual(formatDate('202601'), '202601');
  });

  it('should handle first day of year', () => {
    assert.strictEqual(formatDate('20260101'), '2026-01-01');
  });

  it('should handle last day of year', () => {
    assert.strictEqual(formatDate('20261231'), '2026-12-31');
  });

  it('should return empty string unchanged', () => {
    assert.strictEqual(formatDate(''), '');
  });
});

describe('getEditionLabel', () => {
  it('should return "International" for International module', () => {
    assert.strictEqual(getEditionLabel('900000000000207008'), 'International');
  });

  it('should return "Australian" for AU module', () => {
    assert.strictEqual(getEditionLabel('32506021000036107'), 'Australian');
  });

  it('should return "US" for US module', () => {
    assert.strictEqual(getEditionLabel('731000124108'), 'US');
  });

  it('should return module ID for unknown module', () => {
    assert.strictEqual(getEditionLabel('9999999999'), '9999999999');
  });
});

describe('MODULE_TO_COUNTRY', () => {
  it('should have 28 entries', () => {
    assert.strictEqual(MODULE_TO_COUNTRY.size, 28);
  });

  it('should include all major editions', () => {
    const expected = [
      'International',
      'Australian',
      'US',
      'UK Clinical',
      'UK Drug',
      'Belgian',
      'Danish',
      'Dutch',
      'Estonian',
      'Irish',
      'Swedish',
      'Canadian',
      'German',
      'Norwegian',
      'Austrian',
      'Swiss',
      'French',
      'Spanish',
      'Jamaican',
    ];
    const values = [...MODULE_TO_COUNTRY.values()];
    for (const edition of expected) {
      assert.ok(values.includes(edition), `should include ${edition}`);
    }
  });
});

describe('Status bar text generation', () => {
  it('should show "(Default)" when no setting and no resolved version', () => {
    assert.strictEqual(computeStatusBarText('', null), '$(globe) (Default)');
  });

  it('should show resolved edition in default mode', () => {
    const text = computeStatusBarText('', 'http://snomed.info/sct/32506021000036107/version/20260131');
    assert.strictEqual(text, '$(globe) (Default) Australian 2026-01-31');
  });

  it('should show pinned edition with date', () => {
    const text = computeStatusBarText('http://snomed.info/sct/900000000000207008/version/20240101', null);
    assert.strictEqual(text, '$(globe) International 2024-01-01');
  });

  it('should show edition-only with (latest) suffix', () => {
    const text = computeStatusBarText('http://snomed.info/sct/32506021000036107', null);
    assert.strictEqual(text, '$(globe) Australian (latest)');
  });

  it('should show resolved date for edition-only setting', () => {
    const text = computeStatusBarText(
      'http://snomed.info/sct/32506021000036107',
      'http://snomed.info/sct/32506021000036107/version/20260131',
    );
    assert.strictEqual(text, '$(globe) Australian 2026-01-31 (latest)');
  });

  it('should show "Custom edition" for unrecognized URI', () => {
    const text = computeStatusBarText('some-custom-uri', null);
    assert.strictEqual(text, '$(globe) Custom edition');
  });
});

describe('Concept insertion logic', () => {
  it('should format concept with preferred term', () => {
    const concept = { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding' };
    const term = concept.pt || concept.fsn;
    const text = term ? `${concept.id} |${term}|` : concept.id;
    assert.strictEqual(text, '404684003 |Clinical finding|');
  });

  it('should fall back to FSN when PT is empty', () => {
    const concept = { id: '404684003', fsn: 'Clinical finding (finding)', pt: '' };
    const term = concept.pt || concept.fsn;
    const text = term ? `${concept.id} |${term}|` : concept.id;
    assert.strictEqual(text, '404684003 |Clinical finding (finding)|');
  });

  it('should use ID only when no terms available', () => {
    const concept = { id: '404684003', fsn: '', pt: '' };
    const term = concept.pt || concept.fsn;
    const text = term ? `${concept.id} |${term}|` : concept.id;
    assert.strictEqual(text, '404684003');
  });

  it('should detect concept ID pattern in line text', () => {
    const lineText = 'some text 404684003 more text';
    const pattern = /\b(\d{6,18})\b/g;
    const match = pattern.exec(lineText);
    assert.ok(match);
    assert.strictEqual(match[0], '404684003');
    assert.strictEqual(match.index, 10);
  });

  it('should not match numbers shorter than 6 digits', () => {
    const lineText = 'some 12345 text';
    const pattern = /\b(\d{6,18})\b/g;
    const match = pattern.exec(lineText);
    assert.strictEqual(match, null);
  });
});
