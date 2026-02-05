// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { knowledgeGuides } from 'ecl-core';

interface EclResource {
  name: string;
  description: string;
  content: string;
}

/**
 * ECL literacy resources for MCP — sourced from ecl-core's knowledge module.
 */
export const resources: Record<string, EclResource> = Object.fromEntries(
  knowledgeGuides.map((guide) => [
    guide.uri,
    {
      name: guide.name,
      description: guide.description,
      content: guide.content,
    },
  ]),
);
