// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { minifyExpression, MinifyError } from '../minify/minify';
import { canonicalise } from '../canonical/comparator';
import { parseECL } from '../parser';
import { roundTripCorpus } from './roundtrip-corpus';

// Characters that must never reach an RF2 file.
const RF2_UNSAFE = /[\t\r\n]/;

describe('minifyExpression — display terms', () => {
  it('removes a term after a concept id', () => {
    assert.strictEqual(minifyExpression('<< 404684003 |Clinical finding|'), '<<404684003');
  });

  it('removes a term after an alternate identifier', () => {
    assert.strictEqual(minifyExpression('LOINC#54486-6 |Some term|'), 'LOINC#54486-6');
  });

  it('removes terms inside a refinement', () => {
    assert.strictEqual(
      minifyExpression('<< 404684003 |Clinical finding| : 363698007 |Finding site| = << 39057004 |Pulmonary valve|'),
      '<<404684003:363698007=<<39057004',
    );
  });

  it('keeps pipes that are inside a quoted string', () => {
    assert.strictEqual(minifyExpression('< 404684003 {{ term = "a |b| c" }}'), '<404684003{{term="a |b| c"}}');
  });
});

describe('minifyExpression — whitespace', () => {
  it('removes optional whitespace and line breaks', () => {
    assert.strictEqual(
      minifyExpression('(<< 404684003 :\r\n\t{ 363698007 = << 39057004 ,\n 116676008 = << 415582006 })'),
      '(<<404684003:{363698007=<<39057004,116676008=<<415582006})',
    );
  });

  it('keeps one space after AND, OR and MINUS, where the grammar requires it', () => {
    assert.strictEqual(
      minifyExpression('(< 404684003 OR < 71388002)\n  AND   (< 373873005 MINUS < 763158003)'),
      '(<404684003 OR <71388002)AND (<373873005 MINUS <763158003)',
    );
  });

  it('keeps the case of a keyword', () => {
    assert.strictEqual(minifyExpression('<< 404684003 or << 71388002'), '<<404684003 or <<71388002');
  });

  it('keeps one space between the items of a set', () => {
    assert.strictEqual(
      minifyExpression('< 404684003 {{ dialect = ( en-au (prefer)  en-gb (accept) ) }}'),
      '<404684003{{dialect=(en-au(prefer) en-gb(accept))}}',
    );
    assert.strictEqual(
      minifyExpression('< 404684003 {{ id = ( 3756161018   3756162013 ) }}'),
      '<404684003{{id=(3756161018 3756162013)}}',
    );
  });

  it('keeps a space between two words', () => {
    assert.strictEqual(minifyExpression('< 404684003 {{ D term = "heart" }}'), '<404684003{{D term="heart"}}');
    assert.strictEqual(minifyExpression('< 404684003 : R 363698007 = 39057004'), '<404684003:R 363698007=39057004');
  });

  it('keeps a space either side of a dot between concept ids', () => {
    assert.strictEqual(minifyExpression('< 19829001 . 363698007'), '<19829001 . 363698007');
  });
});

describe('minifyExpression — quoted strings', () => {
  it('keeps the spacing inside a search term', () => {
    assert.strictEqual(
      minifyExpression('< 404684003 {{ term = "heart  attack" }}'),
      '<404684003{{term="heart  attack"}}',
    );
    assert.strictEqual(
      minifyExpression('< 404684003 {{ term = ( match:"heart att"  wild:"card*" ) }}'),
      '<404684003{{term=(match:"heart att" wild:"card*")}}',
    );
  });

  it('keeps an escaped quote', () => {
    assert.strictEqual(minifyExpression('< 404684003 {{ term = "a \\" b" }}'), '<404684003{{term="a \\" b"}}');
  });

  it('turns a tab or line break inside a string into a space', () => {
    assert.strictEqual(
      minifyExpression('< 404684003 {{ term = "heart\tattack" }}'),
      '<404684003{{term="heart attack"}}',
    );
    assert.strictEqual(
      minifyExpression('< 404684003 {{ term = wild:"heart\n*" }}'),
      '<404684003{{term=wild:"heart *"}}',
    );
  });
});

describe('minifyExpression — comments', () => {
  it('keeps block comments, with their whitespace collapsed', () => {
    assert.strictEqual(
      minifyExpression('/* Excluded items:\n\t keep */\n<< 404684003 |Clinical finding| /* trailing */'),
      '/* Excluded items: keep */<<404684003/* trailing */',
    );
  });

  it('lets a comment stand in for the space after OR', () => {
    assert.strictEqual(minifyExpression('<< 404684003 OR /* y */ << 71388002'), '<<404684003 OR/* y */<<71388002');
  });

  it('keeps comments written around a display term', () => {
    assert.strictEqual(
      minifyExpression('<< 404684003 /* a */ |Clinical finding| /* b */ OR << 71388002'),
      '<<404684003/* a */ /* b */OR <<71388002',
    );
  });

  it('does not let a comment join a wildcard', () => {
    assert.strictEqual(minifyExpression('< 404684003 : * /* any */ = 39057004'), '<404684003:* /* any */=39057004');
  });

  it('removes comments when asked', () => {
    assert.strictEqual(
      minifyExpression('/* x */ << 404684003 |Clinical finding|\n OR /* y */ << 71388002', { removeComments: true }),
      '<<404684003 OR <<71388002',
    );
  });

  it('keeps a space that a removed comment stood for', () => {
    assert.strictEqual(
      minifyExpression('<< 404684003 OR/* y */<< 71388002', { removeComments: true }),
      '<<404684003 OR <<71388002',
    );
  });
});

describe('minifyExpression — invalid input', () => {
  for (const ecl of ['<< 404684003 OR', '<< 404684003 |Clinical', '   ']) {
    it(`throws MinifyError for ${JSON.stringify(ecl)}`, () => {
      assert.throws(
        () => minifyExpression(ecl),
        (err: unknown) => err instanceof MinifyError && err.message.startsWith('Cannot minify invalid ECL'),
      );
    });
  }
});

describe('minifyExpression — round trip', () => {
  const corpus = [
    ...roundTripCorpus,
    largeOrExpression(),
    '/* A comment */ (<< 404684003 |Clinical finding| : { 363698007 |Finding site| = << 39057004 }) OR << 71388002',
  ];

  for (const ecl of corpus) {
    it(`same expression, RF2 safe: ${ecl.slice(0, 80)}`, () => {
      const minified = minifyExpression(ecl);

      assert.doesNotMatch(minified, RF2_UNSAFE);
      assert.ok(!withoutStringsAndComments(minified).includes('|'), `term left in: ${minified}`);
      assert.deepStrictEqual(parseECL(minified).errors, []);
      assert.strictEqual(comparable(canonicalise(minified)), comparable(canonicalise(ecl)));
      assert.ok(minified.length <= ecl.length);
      assert.strictEqual(minifyExpression(minified), minified, 'minifying twice changes nothing');
    });
  }
});

/** A refset-sized expression: many simple clauses joined with OR, with terms, a term filter and a comment. */
function largeOrExpression(): string {
  const ids = ['404684003', '71388002', '373873005', '763158003', '385055001', '39057004'];
  const clauses = Array.from({ length: 120 }, (_, n) => `<< ${ids[n % ids.length]} |Item ${n}|`);
  return [
    '/* Medicines for brand consideration */',
    [...clauses, '<< 404684003 {{ term = "pain" }}'].join('\n  OR '),
  ].join('\n');
}

function withoutStringsAndComments(ecl: string): string {
  return ecl.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/"(?:\\.|[^"\\])*"/g, '');
}

/**
 * canonicalise() copies filter blocks as written, so `{{ term = "x" }}` and
 * `{{term="x"}}` differ there. Remove the spacing inside filter blocks from
 * both sides before comparing.
 */
function comparable(canonical: string): string {
  return canonical
    .split('{{')
    .map((part, i) => {
      if (i === 0) return part;
      const end = part.indexOf('}}');
      return part.slice(0, end).replaceAll(/\s+/g, '') + part.slice(end);
    })
    .join('{{');
}
