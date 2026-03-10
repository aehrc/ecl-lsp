// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export const EDITION_ALIASES: Record<string, string> = {
  int: 'http://snomed.info/sct/900000000000207008',
  au: 'http://snomed.info/sct/32506021000036107',
  us: 'http://snomed.info/sct/731000124108',
  uk: 'http://snomed.info/sct/83821000000107',
  nz: 'http://snomed.info/sct/21000210109',
};

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
    snomedEdition: process.env.SNOMED_EDITION || undefined,
    maxEvalResults: Number.parseInt(process.env.MAX_EVAL_RESULTS ?? '5', 10) || 5,
  };
}
