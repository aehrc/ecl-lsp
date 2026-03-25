// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Embedded ECL unit tests — tests the pure extraction and mapping logic
 * in embedded-core.ts directly (no vscode dependency needed).
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  extractFshFragments,
  extractFhirJsonFragments,
  extractFhirXmlFragments,
  extractCommentTriggerFragments,
  decodeXmlEntities,
  hostToVirtualPos,
  virtualToHostRange,
  makeVirtualUriString,
  parseVirtualUriString,
} from '../embedded-core';

// ── FSH extractor ───────────────────────────────────────────────────────────

describe('extractFshFragments', () => {
  it('should extract ECL from a standard FSH filter rule', () => {
    const text = '* codes from system SCT where constraint = "<< 404684003 |Clinical finding|"';
    const frags = extractFshFragments(text);
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003 |Clinical finding|');
    assert.strictEqual(frags[0].range.start.line, 0);
  });

  it('should extract multiple fragments from different lines', () => {
    const text = [
      '* codes from system SCT where constraint = "<< 404684003"',
      '// comment line',
      '* codes from system SCT where constraint = "<< 71388002"',
    ].join('\n');
    const frags = extractFshFragments(text);
    assert.strictEqual(frags.length, 2);
    assert.strictEqual(frags[0].text, '<< 404684003');
    assert.strictEqual(frags[0].range.start.line, 0);
    assert.strictEqual(frags[1].text, '<< 71388002');
    assert.strictEqual(frags[1].range.start.line, 2);
  });

  it('should skip empty and whitespace-only strings', () => {
    assert.strictEqual(extractFshFragments('where constraint = ""').length, 0);
    assert.strictEqual(extractFshFragments('where constraint = "   "').length, 0);
  });

  it('should handle flexible whitespace around equals', () => {
    const frags = extractFshFragments('where constraint="<< 404684003"');
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003');
  });

  it('should compute correct start/end columns', () => {
    const text = 'where constraint = "<< 404684003"';
    const frags = extractFshFragments(text);
    const expectedStart = text.indexOf('"') + 1;
    assert.strictEqual(frags[0].range.start.character, expectedStart);
    assert.strictEqual(frags[0].range.end.character, expectedStart + '<< 404684003'.length);
  });

  it('should assign sequential indices', () => {
    const text = 'where constraint = "<< A"\nwhere constraint = "<< B"\nwhere constraint = "<< C"';
    const frags = extractFshFragments(text);
    assert.deepStrictEqual(
      frags.map((f) => f.index),
      [0, 1, 2],
    );
  });

  it('should not match non-constraint properties', () => {
    assert.strictEqual(extractFshFragments('where concept = "<< 404684003"').length, 0);
  });
});

// ── FHIR JSON extractor ─────────────────────────────────────────────────────

describe('extractFhirJsonFragments', () => {
  it('should extract from compose.include filter with property=constraint', () => {
    const json = JSON.stringify({
      compose: { include: [{ filter: [{ property: 'constraint', op: '=', value: '<< 404684003' }] }] },
    });
    const frags = extractFhirJsonFragments(json);
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003');
  });

  it('should extract from compose.include filter with property=expression', () => {
    const json = JSON.stringify({
      compose: { include: [{ filter: [{ property: 'expression', op: '=', value: '<< 71388002' }] }] },
    });
    assert.strictEqual(extractFhirJsonFragments(json).length, 1);
  });

  it('should NOT extract with property=concept', () => {
    const json = JSON.stringify({
      compose: { include: [{ filter: [{ property: 'concept', op: 'is-a', value: '404684003' }] }] },
    });
    assert.strictEqual(extractFhirJsonFragments(json).length, 0);
  });

  it('should extract from compose.exclude', () => {
    const json = JSON.stringify({
      compose: { exclude: [{ filter: [{ property: 'constraint', op: '=', value: '<< 64572001' }] }] },
    });
    assert.strictEqual(extractFhirJsonFragments(json).length, 1);
  });

  it('should extract from expansion.parameter with name=used-ecl', () => {
    const json = JSON.stringify({ expansion: { parameter: [{ name: 'used-ecl', valueString: '<< 404684003' }] } });
    assert.strictEqual(extractFhirJsonFragments(json).length, 1);
  });

  it('should extract from expansion.parameter with name=ecl', () => {
    const json = JSON.stringify({ expansion: { parameter: [{ name: 'ecl', valueString: '<< 71388002' }] } });
    assert.strictEqual(extractFhirJsonFragments(json).length, 1);
  });

  it('should NOT extract from parameter with name=version', () => {
    const json = JSON.stringify({ expansion: { parameter: [{ name: 'version', valueString: 'some-url' }] } });
    assert.strictEqual(extractFhirJsonFragments(json).length, 0);
  });

  it('should extract from multiple locations', () => {
    const json = JSON.stringify({
      compose: {
        include: [{ filter: [{ property: 'constraint', op: '=', value: '<< A' }] }],
        exclude: [{ filter: [{ property: 'constraint', op: '=', value: '<< B' }] }],
      },
      expansion: { parameter: [{ name: 'ecl', valueString: '<< C' }] },
    });
    assert.strictEqual(extractFhirJsonFragments(json).length, 3);
  });

  it('should handle duplicate ECL values by finding distinct positions', () => {
    const json = JSON.stringify({
      compose: {
        include: [
          { filter: [{ property: 'constraint', op: '=', value: '<< 404684003' }] },
          { filter: [{ property: 'constraint', op: '=', value: '<< 404684003' }] },
        ],
      },
    });
    const frags = extractFhirJsonFragments(json);
    assert.strictEqual(frags.length, 2);
    // The two fragments should have different positions in the raw text
    assert.notStrictEqual(frags[0].range.start.character, frags[1].range.start.character);
  });

  it('should return empty for invalid JSON', () => {
    assert.strictEqual(extractFhirJsonFragments('not json').length, 0);
  });

  it('should return empty for non-object JSON', () => {
    assert.strictEqual(extractFhirJsonFragments('"string"').length, 0);
  });

  it('should skip empty filter values', () => {
    const json = JSON.stringify({
      compose: { include: [{ filter: [{ property: 'constraint', op: '=', value: '' }] }] },
    });
    assert.strictEqual(extractFhirJsonFragments(json).length, 0);
  });

  it('should handle JSON-escaped characters in value using raw length', () => {
    // Value contains a backslash which JSON.stringify escapes to \\
    const json = JSON.stringify({
      compose: { include: [{ filter: [{ property: 'constraint', op: '=', value: '<< 404684003 \\ test' }] }] },
    });
    const frags = extractFhirJsonFragments(json);
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003 \\ test');
  });

  it('should skip files without relevant keywords (pre-check)', () => {
    const json = JSON.stringify({ resourceType: 'Patient', name: [{ family: 'Smith' }] });
    assert.strictEqual(extractFhirJsonFragments(json).length, 0);
  });
});

// ── XML entity decoding ─────────────────────────────────────────────────────

describe('decodeXmlEntities', () => {
  it('should decode &lt; to <', () => {
    assert.strictEqual(decodeXmlEntities('&lt;&lt; 404684003').decoded, '<< 404684003');
  });

  it('should decode &gt; to >', () => {
    assert.strictEqual(decodeXmlEntities('&gt; 404684003').decoded, '> 404684003');
  });

  it('should decode &amp; to &', () => {
    assert.strictEqual(decodeXmlEntities('A &amp; B').decoded, 'A & B');
  });

  it('should pass through text without entities unchanged', () => {
    assert.strictEqual(decodeXmlEntities('no entities').decoded, 'no entities');
  });

  it('should build correct charMap for entity-free text', () => {
    assert.deepStrictEqual(decodeXmlEntities('abc').charMap, [0, 1, 2, 3]);
  });

  it('should build correct charMap with entities', () => {
    const { decoded, charMap } = decodeXmlEntities('&lt;X');
    assert.strictEqual(decoded, '<X');
    assert.deepStrictEqual(charMap, [0, 4, 5]);
  });

  it('should handle consecutive entities', () => {
    const { decoded, charMap } = decodeXmlEntities('&lt;&gt;');
    assert.strictEqual(decoded, '<>');
    assert.deepStrictEqual(charMap, [0, 4, 8]);
  });
});

// ── FHIR XML extractor ──────────────────────────────────────────────────────

describe('extractFhirXmlFragments', () => {
  it('should extract from filter with property=constraint', () => {
    const xml =
      '<ValueSet><compose><include><filter><property value="constraint"/><value value="&lt;&lt; 404684003"/></filter></include></compose></ValueSet>';
    const frags = extractFhirXmlFragments(xml);
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003');
  });

  it('should extract from filter with property=expression', () => {
    const xml =
      '<ValueSet><compose><include><filter><property value="expression"/><value value="&lt;&lt; 71388002"/></filter></include></compose></ValueSet>';
    assert.strictEqual(extractFhirXmlFragments(xml).length, 1);
  });

  it('should NOT extract with property=concept', () => {
    const xml =
      '<ValueSet><compose><include><filter><property value="concept"/><value value="404684003"/></filter></include></compose></ValueSet>';
    assert.strictEqual(extractFhirXmlFragments(xml).length, 0);
  });

  it('should extract from parameter with name=used-ecl', () => {
    const xml =
      '<ValueSet><expansion><parameter><name value="used-ecl"/><valueString value="&lt;&lt; 404684003"/></parameter></expansion></ValueSet>';
    const frags = extractFhirXmlFragments(xml);
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003');
  });

  it('should NOT extract from parameter with name=version', () => {
    const xml =
      '<ValueSet><expansion><parameter><name value="version"/><valueString value="v1"/></parameter></expansion></ValueSet>';
    assert.strictEqual(extractFhirXmlFragments(xml).length, 0);
  });

  it('should return empty for non-ValueSet XML', () => {
    assert.strictEqual(extractFhirXmlFragments('<Patient/>').length, 0);
  });

  it('should include charMap for entity position mapping', () => {
    const xml =
      '<ValueSet><compose><include><filter><property value="constraint"/><value value="&lt;&lt; 404684003"/></filter></include></compose></ValueSet>';
    const frags = extractFhirXmlFragments(xml);
    const map = frags[0].charMap;
    assert.ok(map);
    assert.ok(map.length > 0);
  });
});

// ── Comment-trigger extractor ────────────────────────────────────────────────

describe('extractCommentTriggerFragments', () => {
  it('should extract from double-quoted string after // ecl', () => {
    const frags = extractCommentTriggerFragments('// ecl\nString q = "<< 404684003";');
    assert.strictEqual(frags.length, 1);
    assert.strictEqual(frags[0].text, '<< 404684003');
    assert.strictEqual(frags[0].range.start.line, 1);
  });

  it('should extract from single-quoted string', () => {
    assert.strictEqual(extractCommentTriggerFragments("// ecl\nconst q = '<< 404684003';").length, 1);
  });

  it('should extract from backtick string', () => {
    assert.strictEqual(extractCommentTriggerFragments('// ecl\nconst q = `<< 404684003`;').length, 1);
  });

  it('should extract after /* ecl */ comment', () => {
    assert.strictEqual(extractCommentTriggerFragments('/* ecl */\nString q = "<< 404684003";').length, 1);
  });

  it('should NOT extract without comment trigger', () => {
    assert.strictEqual(extractCommentTriggerFragments('String q = "<< 404684003";').length, 0);
  });

  it('should NOT extract with blank line gap', () => {
    assert.strictEqual(extractCommentTriggerFragments('// ecl\n\nString q = "<< 404684003";').length, 0);
  });

  it('should handle leading whitespace in comment', () => {
    assert.strictEqual(extractCommentTriggerFragments('    // ecl\n    String q = "<< 404684003";').length, 1);
  });

  it('should find multiple triggered strings', () => {
    const text = '// ecl\na = "<< A";\n// normal\nb = "<< B";\n// ecl\nc = "<< C";';
    const frags = extractCommentTriggerFragments(text);
    assert.strictEqual(frags.length, 2);
    assert.strictEqual(frags[0].text, '<< A');
    assert.strictEqual(frags[1].text, '<< C');
  });

  it('should skip empty strings', () => {
    assert.strictEqual(extractCommentTriggerFragments('// ecl\nq = "";').length, 0);
  });

  it('should unescape \\n in string content', () => {
    const frags = extractCommentTriggerFragments('// ecl\nq = "a\\nb";');
    assert.strictEqual(frags[0].text, 'a\nb');
  });

  it('should not crash when // ecl is on the last line (no next line)', () => {
    assert.strictEqual(extractCommentTriggerFragments('// ecl').length, 0);
  });
});

// ── Position mapping ─────────────────────────────────────────────────────────

describe('hostToVirtualPos', () => {
  it('should map fragment start to (0, 0)', () => {
    assert.deepStrictEqual(hostToVirtualPos({ line: 5, character: 10 }, { line: 5, character: 10 }), {
      line: 0,
      character: 0,
    });
  });

  it('should offset character within first line', () => {
    assert.deepStrictEqual(hostToVirtualPos({ line: 5, character: 10 }, { line: 5, character: 15 }), {
      line: 0,
      character: 5,
    });
  });

  it('should clamp negative character to 0', () => {
    assert.deepStrictEqual(hostToVirtualPos({ line: 5, character: 10 }, { line: 5, character: 5 }), {
      line: 0,
      character: 0,
    });
  });

  it('should use charMap for entity-aware mapping', () => {
    const pos = hostToVirtualPos({ line: 0, character: 0 }, { line: 0, character: 4 }, [0, 4, 5]);
    assert.strictEqual(pos.character, 1);
  });
});

describe('virtualToHostRange', () => {
  it('should map back to host coordinates', () => {
    const range = virtualToHostRange(
      { line: 10, character: 20 },
      { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    );
    assert.deepStrictEqual(range, { start: { line: 10, character: 20 }, end: { line: 10, character: 25 } });
  });

  it('should use charMap for entity-aware mapping', () => {
    const range = virtualToHostRange(
      { line: 0, character: 10 },
      { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } },
      [0, 4, 5, 6],
    );
    assert.deepStrictEqual(range, { start: { line: 0, character: 10 }, end: { line: 0, character: 15 } });
  });

  it('should handle end on different line independently from start', () => {
    // Hypothetical multi-line fragment: start on line 0, end on line 1
    // charMap should only apply to line 0 positions
    const range = virtualToHostRange(
      { line: 5, character: 10 },
      { start: { line: 0, character: 2 }, end: { line: 1, character: 3 } },
      [0, 4, 5, 6],
    );
    // start: line 0 → uses charMap: fragStart.char + charMap[2] = 10 + 5 = 15
    // end: line 1 → no charMap, no offset: just virtualChar = 3
    assert.strictEqual(range.start.character, 15);
    assert.strictEqual(range.end.character, 3);
  });
});

// ── Virtual URI helpers ──────────────────────────────────────────────────────

describe('virtual URI helpers', () => {
  it('should roundtrip a file URI', () => {
    const uri = makeVirtualUriString('file', '/Users/user/file.fsh', 0);
    const parsed = parseVirtualUriString(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.hostScheme, 'file');
    assert.strictEqual(parsed.hostPath, '/Users/user/file.fsh');
    assert.strictEqual(parsed.index, 0);
  });

  it('should handle different fragment indices', () => {
    const parsed = parseVirtualUriString(makeVirtualUriString('file', '/path/file.json', 5));
    assert.ok(parsed);
    assert.strictEqual(parsed.index, 5);
  });

  it('should return null for non-ecl-embedded scheme', () => {
    assert.strictEqual(parseVirtualUriString('file:///some/path'), null);
  });

  it('should return null for malformed URI', () => {
    assert.strictEqual(parseVirtualUriString('ecl-embedded://file/path/no-suffix'), null);
  });

  it('should handle paths containing "fragment" directory', () => {
    const parsed = parseVirtualUriString(makeVirtualUriString('file', '/fragment/0/file.fsh', 1));
    assert.ok(parsed);
    assert.strictEqual(parsed.hostPath, '/fragment/0/file.fsh');
    assert.strictEqual(parsed.index, 1);
  });
});
