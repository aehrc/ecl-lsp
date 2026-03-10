// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { ProcessResult } from './ecl-processor';

const MAX_CODE_BLOCK_LENGTH = 2900;

export function buildMessage(result: ProcessResult): string {
  const sections: string[] = [];

  // Formatted ECL code block
  let ecl = result.formatted;
  if (ecl.length > MAX_CODE_BLOCK_LENGTH) {
    ecl = ecl.slice(0, MAX_CODE_BLOCK_LENGTH) + '\n… (truncated)';
  }
  sections.push(`*Formatted ECL*\n\`\`\`${ecl}\`\`\``);

  // Errors
  if (result.errors.length > 0) {
    const lines = result.errors.map(
      (e) => `\u2022 Line ${e.line}:${e.column} \u2014 ${e.message}`,
    );
    sections.push(`:red_circle: *Errors*\n${lines.join('\n')}`);
  }

  // Warnings
  if (result.warnings.length > 0) {
    const lines = result.warnings.map(
      (w) => `\u2022 ${w.message}`,
    );
    sections.push(`:warning: *Warnings*\n${lines.join('\n')}`);
  }

  // No issues
  if (result.errors.length === 0 && result.warnings.length === 0) {
    sections.push(':white_check_mark: No issues found');
  }

  // Evaluation
  if (result.evaluation) {
    const count = result.evaluation.count.toLocaleString('en-US');
    let evalText = `:bar_chart: *Evaluation* \u2014 ${count} concepts matched`;
    if (result.evaluation.sample.length > 0) {
      const samples = result.evaluation.sample.map((s) => `\`${s}\``).join(', ');
      evalText += `\n  ${samples} \u2026`;
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
\u2022 \`/ecl --eval < 404684003\` \u2014 include evaluation
\u2022 \`/ecl --edition au < 404684003\` \u2014 specify edition

*@mention (thread reply):*
\u2022 \`@ECL Bot < 404684003 AND < 19829001\`
\u2022 \`@ECL Bot --eval --edition us < 404684003\`

*Options:*
\u2022 \`--eval\` \u2014 evaluate expression and show concept count
\u2022 \`--edition <code|uri>\` \u2014 override SNOMED edition (au, us, uk, nz, int, or full URI)
\u2022 \`help\` \u2014 show this message

Shorthand editions: int, au, us, uk, nz`;
}
