// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { ProcessResult } from './ecl-processor';

const MAX_CODE_BLOCK_LENGTH = 2900;
const SHRIMP_BASE = 'https://ontoserver.csiro.au/shrimp/';

/** Build a Shrimp browser link for a concept, or return the code as-is if no edition URI. */
function shrimpLink(code: string, editionUri?: string, fhirServerUrl?: string): string {
  if (!editionUri) {
    return `\`${code}\``;
  }
  // Extract edition base URI (without /version/...) for the valueset parameter
  const editionBase = editionUri.replace(/\/version\/\d+$/, '');
  const params = new URLSearchParams({
    concept: code,
    version: editionUri,
    valueset: `${editionBase}?fhir_vs`,
    fhir: fhirServerUrl ?? 'https://tx.ontoserver.csiro.au/fhir',
  });
  return `<${SHRIMP_BASE}?${params.toString()}|${code}>`;
}

export function buildMessage(result: ProcessResult): string {
  const sections: string[] = [];

  // Formatted ECL code block
  let ecl = result.formatted;
  if (ecl.length > MAX_CODE_BLOCK_LENGTH) {
    ecl = ecl.slice(0, MAX_CODE_BLOCK_LENGTH) + '\n… (truncated)';
  }
  sections.push(`*Formatted ECL*\n\`\`\`\n${ecl}\n\`\`\``);

  // Errors
  if (result.errors.length > 0) {
    const lines = result.errors.map((e) => `\u2022 Line ${e.line}:${e.column} \u2014 ${e.message}`);
    sections.push(`:red_circle: *Errors*\n${lines.join('\n')}`);
  }

  // Warnings
  if (result.warnings.length > 0) {
    const lines = result.warnings.map((w) => `\u2022 ${w.message}`);
    sections.push(`:warning: *Warnings*\n${lines.join('\n')}`);
  }

  // No issues
  if (result.errors.length === 0 && result.warnings.length === 0) {
    sections.push(':white_check_mark: No issues found');
  }

  // Evaluation
  if (result.evaluation) {
    const count = result.evaluation.count.toLocaleString('en-US');
    let evalText = `:bar_chart: *Evaluation* \u2014 ${count} concept${result.evaluation.count === 1 ? '' : 's'} matched`;
    if (result.evaluation.concepts.length > 0) {
      const rows = result.evaluation.concepts.map(
        (c) => `${shrimpLink(c.code, result.editionUri, result.fhirServerUrl)}  ${c.display}`,
      );
      evalText += '\n' + rows.join('\n');
      if (result.evaluation.count > result.evaluation.concepts.length) {
        evalText += `\n\u2026 and ${(result.evaluation.count - result.evaluation.concepts.length).toLocaleString('en-US')} more`;
      }
    }
    sections.push(evalText);
  }

  // Edition footer
  sections.push(`:book: Edition: ${result.edition}`);

  return sections.join('\n');
}

export function buildHelpMessage(): string {
  return `*ECL Bot Usage*

*Slash command (private response):*
\u2022 \`/ecl < 404684003 |Clinical finding|\`
\u2022 \`/ecl --edition au < 404684003\` \u2014 specify edition

*@mention (thread reply):*
\u2022 \`@ECL Bot < 404684003 AND < 19829001\`
\u2022 \`@ECL Bot --edition us < 404684003\`

*Direct message:*
\u2022 Just send your ECL expression directly

*Options:*
\u2022 \`--edition <code|uri>\` \u2014 override SNOMED edition (au, us, uk, nz, int, or full URI)
\u2022 \`--no-terms\` \u2014 format and validate without adding display terms
\u2022 \`help\` \u2014 show this message

Valid expressions are automatically evaluated (up to 5 results shown).
Shorthand editions: int, au, us, uk, nz`;
}
