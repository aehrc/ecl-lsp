// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Isomorphic fetch: use globalThis.fetch (Node 18+, all browsers),
// fall back to node-fetch for Node <18.

type FetchFn = typeof globalThis.fetch;

const fetchImpl: FetchFn = (() => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  // Node <18: require node-fetch at runtime.
  // String concatenation prevents bundlers (Vite/esbuild) from statically
  // resolving and bundling node-fetch (which depends on Node APIs).
  const modName = 'node' + '-fetch';

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require needed to avoid bundler static resolution
  const nodeFetch = require(modName) as { default?: FetchFn } & FetchFn;
  return nodeFetch.default ?? (nodeFetch as unknown as FetchFn);
})();

export default fetchImpl;
