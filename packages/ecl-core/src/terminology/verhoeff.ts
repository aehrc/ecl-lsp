// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Verhoeff check digit algorithm for SNOMED CT identifier validation.
 *
 * References:
 * - https://docs.snomed.org/snomed-ct-specifications/snomed-ct-release-file-specification/snomed-ct-identifiers/6.4-check-digit
 * - J. Verhoeff, "Error Detecting Decimal Codes", Mathematical Center Tract 29, 1969
 */

// Multiplication table (dihedral group D5)
const MULTIPLICATION_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Permutation table
const PERMUTATION_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Validates a string using the Verhoeff algorithm.
 *
 * @param num - The numeric string to validate (must contain only digits)
 * @returns true if the check digit is valid, false otherwise
 */
export function verhoeffCheck(num: string): boolean {
  if (!num || !/^\d+$/.test(num)) {
    return false;
  }

  let check = 0;
  const digits = num.split('').map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    check = MULTIPLICATION_TABLE[check][PERMUTATION_TABLE[i % 8][digits[i]]];
  }

  return check === 0;
}

/**
 * Validates a SNOMED CT identifier format.
 *
 * Rules:
 * - Must be 6-18 digits long
 * - Must pass Verhoeff check digit validation
 * - Penultimate two digits are the partition identifier
 *
 * @param conceptId - The SNOMED CT concept ID to validate
 * @returns true if the ID is a valid SNOMED CT identifier, false otherwise
 */
export function isValidSnomedId(conceptId: string): boolean {
  // Must be a string of digits only
  if (!conceptId || !/^\d+$/.test(conceptId)) {
    return false;
  }

  // Length must be between 6 and 18 digits
  if (conceptId.length < 6 || conceptId.length > 18) {
    return false;
  }

  // Must pass Verhoeff check digit validation
  if (!verhoeffCheck(conceptId)) {
    return false;
  }

  // Valid partition identifiers (penultimate two digits)
  // 00, 01, 02 = core components
  // 10, 11, 12 = extension components with namespace
  const partitionId = conceptId.substring(conceptId.length - 3, conceptId.length - 1);
  const validPartitions = ['00', '01', '02', '10', '11', '12'];

  return validPartitions.includes(partitionId);
}

/**
 * Validates that a SNOMED CT identifier is a concept ID.
 *
 * Concept IDs use partition identifiers 00 (core) or 10 (extension with namespace).
 *
 * @param sctid - The SNOMED CT identifier to validate
 * @returns true if the ID is a valid SNOMED CT concept identifier
 */
export function isValidConceptId(sctid: string): boolean {
  if (!isValidSnomedId(sctid)) {
    return false;
  }

  const partitionId = sctid.substring(sctid.length - 3, sctid.length - 1);
  return partitionId === '00' || partitionId === '10';
}

/**
 * Validates that a SNOMED CT identifier is a description ID.
 *
 * Description IDs use partition identifiers 01 (core) or 11 (extension).
 *
 * @param sctid - The SNOMED CT identifier to validate
 * @returns true if the ID is a valid SNOMED CT description identifier
 */
export function isValidDescriptionId(sctid: string): boolean {
  if (!isValidSnomedId(sctid)) {
    return false;
  }

  const partitionId = sctid.substring(sctid.length - 3, sctid.length - 1);
  return partitionId === '01' || partitionId === '11';
}
