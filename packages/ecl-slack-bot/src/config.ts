// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export const EDITION_ALIASES: Record<string, string> = {
  int: 'http://snomed.info/sct/900000000000207008',
  au: 'http://snomed.info/sct/32506021000036107',
  us: 'http://snomed.info/sct/731000124108',
  uk: 'http://snomed.info/sct/83821000000107',
  nz: 'http://snomed.info/sct/21000210109',
};

/** Reverse map: edition URI to human-readable name. */
const EDITION_NAMES: Record<string, string> = {
  'http://snomed.info/sct/900000000000207008': 'International',
  'http://snomed.info/sct/32506021000036107': 'Australian',
  'http://snomed.info/sct/731000124108': 'US',
  'http://snomed.info/sct/83821000000107': 'UK',
  'http://snomed.info/sct/21000210109': 'New Zealand',
};

/**
 * Parse a resolved SNOMED CT version URI into a human-readable label.
 *
 * Input:  http://snomed.info/sct/900000000000207008/version/20240901
 * Output: International, version 2024-09-01 (http://snomed.info/sct/900000000000207008/version/20240901)
 */
export function formatResolvedVersion(versionUri: string): string {
  const versionPattern = /^(http:\/\/snomed\.info\/sct\/\d+)\/version\/(\d{8})$/;
  const match = versionPattern.exec(versionUri);
  if (!match) {
    return versionUri;
  }

  const editionUri = match[1];
  const dateRaw = match[2];
  const dateFormatted = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
  const editionName = EDITION_NAMES[editionUri];

  const label = editionName ? `${editionName}, version ${dateFormatted}` : `version ${dateFormatted}`;

  return `${label} (${versionUri})`;
}

/**
 * Resolve an edition alias or URI to a SNOMED CT edition URI.
 * Returns null if the value is neither a known alias nor a valid URI.
 */
export function resolveEdition(value: string): string | null {
  const lower = value.toLowerCase();
  if (EDITION_ALIASES[lower]) {
    return EDITION_ALIASES[lower];
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return null;
}

export interface AppConfig {
  slackBotToken: string;
  slackAppToken: string;
  fhirServerUrl: string;
  snomedEdition?: string;
  maxEvalResults: number;
}

export function loadConfig(): AppConfig {
  return {
    slackBotToken: process.env.SLACK_BOT_TOKEN ?? '',
    slackAppToken: process.env.SLACK_APP_TOKEN ?? '',
    fhirServerUrl: process.env.FHIR_SERVER_URL ?? 'https://tx.ontoserver.csiro.au/fhir',
    snomedEdition: process.env.SNOMED_EDITION || undefined, // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing -- empty string should be treated as unset
    maxEvalResults: Number.parseInt(process.env.MAX_EVAL_RESULTS ?? '5', 10) || 5,
  };
}
