// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { verhoeffCheck, isValidSnomedId } from '../terminology/verhoeff';

// ===========================================================================
// verhoeffCheck edge cases
// ===========================================================================

describe('verhoeffCheck edge cases', () => {
  test('empty string returns false', () => {
    assert.strictEqual(verhoeffCheck(''), false);
  });

  test('undefined and null return false', () => {
    assert.strictEqual(verhoeffCheck(undefined as unknown as string), false);
    assert.strictEqual(verhoeffCheck(null as unknown as string), false);
  });

  describe('single digit inputs 0 through 9', () => {
    // Only '0' has a valid Verhoeff check digit (the identity element)
    test('single digit 0 is valid', () => {
      assert.strictEqual(verhoeffCheck('0'), true);
    });

    for (let d = 1; d <= 9; d++) {
      test(`single digit ${d} is invalid`, () => {
        assert.strictEqual(verhoeffCheck(String(d)), false);
      });
    }
  });

  describe('all-zeros strings', () => {
    // The Verhoeff permutation table has period 8, so all-zeros strings
    // only pass at specific lengths. '0' (1 zero) and '0000000000' (10 zeros)
    // pass; all other lengths up to 20 fail.

    test('1 zero passes (identity element)', () => {
      assert.strictEqual(verhoeffCheck('0'), true);
    });

    test('2 through 9 zeros all fail', () => {
      for (let n = 2; n <= 9; n++) {
        assert.strictEqual(verhoeffCheck('0'.repeat(n)), false, `${n} zeros`);
      }
    });

    test('10 zeros passes (permutation period alignment)', () => {
      assert.strictEqual(verhoeffCheck('0'.repeat(10)), true);
    });

    test('11 through 18 zeros all fail', () => {
      for (let n = 11; n <= 18; n++) {
        assert.strictEqual(verhoeffCheck('0'.repeat(n)), false, `${n} zeros`);
      }
    });
  });

  describe('very long numeric strings (20+ digits)', () => {
    test('valid 20-digit string passes', () => {
      // Generated with Verhoeff check digit appended to '1234567890123456789'
      assert.strictEqual(verhoeffCheck('12345678901234567895'), true);
    });

    test('invalid 20-digit string fails', () => {
      assert.strictEqual(verhoeffCheck('12345678901234567890'), false);
    });

    test('25-digit all-zeros fails', () => {
      assert.strictEqual(verhoeffCheck('0'.repeat(25)), false);
    });
  });

  describe('strings with leading zeros', () => {
    test('leading zero changes Verhoeff result', () => {
      // 404684003 is valid, but prepending a 0 changes the check
      assert.strictEqual(verhoeffCheck('404684003'), true);
      assert.strictEqual(verhoeffCheck('0404684003'), false);
    });

    test('two leading zeros also invalid', () => {
      assert.strictEqual(verhoeffCheck('00404684003'), false);
    });

    test('leading zeros on other valid IDs', () => {
      assert.strictEqual(verhoeffCheck('138875005'), true);
      assert.strictEqual(verhoeffCheck('0138875005'), false);
    });
  });
});

// ===========================================================================
// isValidSnomedId edge cases
// ===========================================================================

describe('isValidSnomedId edge cases', () => {
  describe('empty and null-like inputs', () => {
    test('empty string returns false', () => {
      assert.strictEqual(isValidSnomedId(''), false);
    });

    test('undefined returns false', () => {
      assert.strictEqual(isValidSnomedId(undefined as unknown as string), false);
    });

    test('null returns false', () => {
      assert.strictEqual(isValidSnomedId(null as unknown as string), false);
    });
  });

  describe('all valid partition identifiers', () => {
    // SCTID structure: itemIdentifier + partitionId(2 digits) + checkDigit(1 digit)
    // Partition is at positions [length-3, length-1) (the 2 digits before the check digit)
    // Valid partitions: 00, 01, 02 (core), 10, 11, 12 (extension)

    // These 6-digit SCTIDs were constructed with the correct partition and
    // a valid Verhoeff check digit.

    test('partition 00 (core concept) accepted', () => {
      assert.strictEqual(isValidSnomedId('100005'), true);
    });

    test('partition 01 (core description) accepted', () => {
      assert.strictEqual(isValidSnomedId('100014'), true);
    });

    test('partition 02 (core relationship) accepted', () => {
      assert.strictEqual(isValidSnomedId('100022'), true);
    });

    test('partition 10 (extension concept) accepted', () => {
      assert.strictEqual(isValidSnomedId('100108'), true);
    });

    test('partition 11 (extension description) accepted', () => {
      assert.strictEqual(isValidSnomedId('100112'), true);
    });

    test('partition 12 (extension relationship) accepted', () => {
      assert.strictEqual(isValidSnomedId('100120'), true);
    });
  });

  describe('invalid partition identifiers rejected', () => {
    // These IDs pass Verhoeff validation but have partitions outside {00,01,02,10,11,12}

    test('partition 03 rejected', () => {
      assert.strictEqual(isValidSnomedId('100033'), false);
    });

    test('partition 04 rejected', () => {
      assert.strictEqual(isValidSnomedId('100046'), false);
    });

    test('partition 05 rejected', () => {
      assert.strictEqual(isValidSnomedId('100051'), false);
    });

    test('partition 20 rejected', () => {
      assert.strictEqual(isValidSnomedId('100203'), false);
    });

    test('partition 30 rejected', () => {
      assert.strictEqual(isValidSnomedId('100300'), false);
    });

    test('partition 99 rejected', () => {
      assert.strictEqual(isValidSnomedId('100993'), false);
    });
  });

  describe('minimum length (exactly 6 digits)', () => {
    test('6-digit SCTID with partition 00 is valid', () => {
      assert.strictEqual(isValidSnomedId('100005'), true);
      assert.strictEqual(isValidSnomedId('100005').valueOf(), true);
      // Confirm it is exactly 6 digits
      assert.strictEqual('100005'.length, 6);
    });

    test('5-digit string is rejected (below minimum)', () => {
      assert.strictEqual(isValidSnomedId('10000'), false);
    });
  });

  describe('maximum length (exactly 18 digits)', () => {
    test('18-digit SCTID with partition 00 is valid', () => {
      const id = '100000000000000008';
      assert.strictEqual(id.length, 18);
      assert.strictEqual(isValidSnomedId(id), true);
    });

    test('18-digit SCTID with partition 01 is valid', () => {
      const id = '100000000000000012';
      assert.strictEqual(id.length, 18);
      assert.strictEqual(isValidSnomedId(id), true);
    });

    test('18-digit SCTID with partition 10 is valid', () => {
      const id = '100000000000000106';
      assert.strictEqual(id.length, 18);
      assert.strictEqual(isValidSnomedId(id), true);
    });

    test('18-digit SCTID with partition 12 is valid', () => {
      const id = '100000000000000123';
      assert.strictEqual(id.length, 18);
      assert.strictEqual(isValidSnomedId(id), true);
    });

    test('19-digit string is rejected (above maximum)', () => {
      assert.strictEqual(isValidSnomedId('1234567890123456789'), false);
    });
  });

  describe('known valid SNOMED CT concept IDs', () => {
    const knownIds = [
      { id: '404684003', name: 'Clinical finding' },
      { id: '138875005', name: 'SNOMED CT Concept' },
      { id: '73211009', name: 'Diabetes mellitus' },
      { id: '363698007', name: 'Finding site' },
    ];

    for (const { id, name } of knownIds) {
      test(`${id} (${name}) is valid`, () => {
        assert.strictEqual(isValidSnomedId(id), true);
      });
    }

    test('all known IDs have partition 00 (core concept)', () => {
      for (const { id } of knownIds) {
        const partition = id.substring(id.length - 3, id.length - 1);
        assert.strictEqual(partition, '00', `${id} should have partition 00`);
      }
    });
  });
});
