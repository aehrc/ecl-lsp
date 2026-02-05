// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  parseECL,
  formatDocument,
  defaultFormattingOptions,
  FhirTerminologyService,
  checkMixedRefinementOperators,
  extractConceptIds,
  groupIntoExpressions,
} from 'ecl-core';
import type { FormattingOptions } from 'ecl-core';
import { resources } from './resources';

// ── Configuration from environment ──────────────────────────────────────

const DEFAULT_FHIR_SERVER = 'https://tx.ontoserver.csiro.au/fhir';
const DEFAULT_TIMEOUT = 2000;

const config = {
  fhirServer: process.env.ECL_FHIR_SERVER ?? DEFAULT_FHIR_SERVER,
  fhirTimeout: Number.parseInt(process.env.ECL_FHIR_TIMEOUT ?? String(DEFAULT_TIMEOUT), 10) || DEFAULT_TIMEOUT,
  snomedVersion: process.env.ECL_SNOMED_VERSION ?? '',
};

// ── Helpers ─────────────────────────────────────────────────────────────

function createTerminologyService(
  fhirServer?: string,
  snomedVersion?: string,
  timeout?: number,
): FhirTerminologyService {
  return new FhirTerminologyService(
    fhirServer ?? config.fhirServer,
    timeout ?? config.fhirTimeout,
    snomedVersion ?? config.snomedVersion,
  );
}

// ── Per-call override schema (shared across tools) ──────────────────────

const fhirOverrideSchema = {
  fhirServer: z.string().url().optional().describe('Override FHIR terminology server URL for this call'),
  snomedVersion: z.string().optional().describe('Override SNOMED CT edition/version URI for this call'),
};

// ── MCP Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'ecl-mcp-server',
  version: '1.0.0',
});

// ── Tool: validate_ecl ──────────────────────────────────────────────────

server.tool(
  'validate_ecl',
  'Parse and validate an ECL expression, returning syntax errors and warnings',
  {
    expression: z.string().describe('The ECL expression to validate'),
    ...fhirOverrideSchema,
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- validation logic requires branching over parse results, concepts, and FHIR responses
  async ({ expression, fhirServer, snomedVersion }) => {
    const errors: { message: string; line: number; column: number }[] = [];
    const warnings: { message: string; line: number; column: number }[] = [];

    // Parse each non-empty, non-comment expression
    const expressions = groupIntoExpressions(expression);
    for (const expr of expressions) {
      const result = parseECL(expr.text);
      for (const err of result.errors) {
        errors.push({
          message: err.message,
          line: expr.startLine + err.line - 1,
          column: err.column,
        });
      }
    }

    // Check for mixed refinement operators (warnings)
    const fullResult = parseECL(expression);
    if (fullResult.ast) {
      const mixedWarnings = checkMixedRefinementOperators(fullResult.ast, expression);
      for (const w of mixedWarnings) {
        warnings.push({
          message: w.message,
          line: w.line,
          column: w.column,
        });
      }
    }

    // Run FHIR-based concept validation if no syntax errors
    if (errors.length === 0 && fullResult.ast) {
      const svc = createTerminologyService(fhirServer, snomedVersion);
      try {
        const concepts = extractConceptIds(fullResult.ast);
        for (const concept of concepts) {
          const info = await svc.getConceptInfo(concept.id);
          if (info === null) {
            warnings.push({
              message: `Unknown concept: ${concept.id}`,
              line: concept.range.start.line,
              column: concept.range.start.column,
            });
          } else if (!info.active) {
            warnings.push({
              message: `Inactive concept: ${concept.id} |${info.fsn}|`,
              line: concept.range.start.line,
              column: concept.range.start.column,
            });
          }
        }
      } catch {
        // FHIR unavailable — skip concept validation
      }
    }

    const valid = errors.length === 0;
    const warningsSummary =
      warnings.length > 0 ? `Valid ECL with ${warnings.length} warning(s)` : 'Valid ECL expression';
    const summary = valid ? warningsSummary : `Invalid ECL: ${errors.length} error(s)`;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ valid, errors, warnings, summary }, null, 2),
        },
      ],
    };
  },
);

// ── Tool: evaluate_ecl ──────────────────────────────────────────────────

server.tool(
  'evaluate_ecl',
  'Evaluate an ECL expression against a FHIR terminology server and return matching SNOMED CT concepts',
  {
    expression: z.string().describe('The ECL expression to evaluate'),
    limit: z.number().optional().default(200).describe('Maximum number of concepts to return'),
    ...fhirOverrideSchema,
  },
  async ({ expression, limit, fhirServer, snomedVersion }) => {
    // Pre-validate syntax
    const result = parseECL(expression.trim());
    if (result.errors.length > 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { error: `Syntax error: ${result.errors[0].message}`, total: 0, concepts: [] },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const svc = createTerminologyService(fhirServer, snomedVersion);
    try {
      const evalResult = await svc.evaluateEcl(expression.trim(), limit);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(evalResult, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: String(error), total: 0, concepts: [] }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: lookup_concept ────────────────────────────────────────────────

server.tool(
  'lookup_concept',
  'Look up a SNOMED CT concept by ID and return its FSN, preferred term, and active status',
  {
    conceptId: z.string().describe('The SNOMED CT concept ID (SCTID)'),
    ...fhirOverrideSchema,
  },
  async ({ conceptId, fhirServer, snomedVersion }) => {
    const svc = createTerminologyService(fhirServer, snomedVersion);
    try {
      const info = await svc.getConceptInfo(conceptId);
      if (info === null) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ found: false, conceptId, message: 'Concept not found' }, null, 2),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ found: true, conceptId, fsn: info.fsn, pt: info.pt, active: info.active }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: String(error), conceptId }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: search_concepts ───────────────────────────────────────────────

server.tool(
  'search_concepts',
  'Search for SNOMED CT concepts by term, returning matching concepts with IDs and display names',
  {
    term: z.string().describe('The search term to find matching concepts'),
    ...fhirOverrideSchema,
  },
  async ({ term, fhirServer, snomedVersion }) => {
    const svc = createTerminologyService(fhirServer, snomedVersion);
    try {
      const results = await svc.searchConcepts(term);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: String(error), results: [], hasMore: false }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: format_ecl ────────────────────────────────────────────────────

server.tool(
  'format_ecl',
  'Format an ECL expression with configurable formatting options',
  {
    expression: z.string().describe('The ECL expression to format'),
    indentSize: z.number().optional().describe('Number of spaces per indentation level (1-8)'),
    indentStyle: z.enum(['space', 'tab']).optional().describe('Indentation style'),
    maxLineLength: z.number().optional().describe('Maximum line length before wrapping (0 for unlimited)'),
    spaceAroundOperators: z.boolean().optional().describe('Add spaces around AND/OR/MINUS operators'),
    alignTerms: z.boolean().optional().describe('Vertically align pipe-delimited terms'),
    breakOnOperators: z.boolean().optional().describe('Break before every logical operator'),
    breakOnRefinementComma: z.boolean().optional().describe('Break after commas in refinements'),
    breakAfterColon: z.boolean().optional().describe('Break after the refinement colon'),
    wrapComments: z.boolean().optional().describe('Wrap long comments'),
  },
  async ({
    expression,
    indentSize,
    indentStyle,
    maxLineLength,
    spaceAroundOperators,
    alignTerms,
    breakOnOperators,
    breakOnRefinementComma,
    breakAfterColon,
    wrapComments,
    // eslint-disable-next-line @typescript-eslint/require-await -- MCP tool callback signature requires async
  }) => {
    const options: FormattingOptions = {
      ...defaultFormattingOptions,
      ...(indentSize !== undefined && { indentSize }),
      ...(indentStyle !== undefined && { indentStyle }),
      ...(maxLineLength !== undefined && { maxLineLength }),
      ...(spaceAroundOperators !== undefined && { spaceAroundOperators }),
      ...(alignTerms !== undefined && { alignTerms }),
      ...(breakOnOperators !== undefined && { breakOnOperators }),
      ...(breakOnRefinementComma !== undefined && { breakOnRefinementComma }),
      ...(breakAfterColon !== undefined && { breakAfterColon }),
      ...(wrapComments !== undefined && { wrapComments }),
    };

    const formatted = formatDocument(expression, options);
    return {
      content: [
        {
          type: 'text' as const,
          text: formatted,
        },
      ],
    };
  },
);

// ── Tool: list_snomed_editions ──────────────────────────────────────────

server.tool(
  'list_snomed_editions',
  'List available SNOMED CT editions and versions from the FHIR terminology server',
  {
    fhirServer: z.string().url().optional().describe('Override FHIR server URL for this call'),
  },
  async ({ fhirServer }) => {
    const svc = createTerminologyService(fhirServer);
    try {
      const editions = await svc.getSnomedEditions();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ editions }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: String(error), editions: [] }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Resources: ECL literacy guides ──────────────────────────────────────

for (const [uri, resource] of Object.entries(resources)) {
  // eslint-disable-next-line @typescript-eslint/require-await -- MCP resource callback signature requires async
  server.resource(resource.name, uri, { description: resource.description, mimeType: 'text/markdown' }, async () => ({
    contents: [{ uri, text: resource.content, mimeType: 'text/markdown' }],
  }));
}

// ── Start server ────────────────────────────────────────────────────────

void (async () => {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- startup error must go to stderr
    console.error('MCP server failed to start:', error);
    process.exit(1);
  }
})();
