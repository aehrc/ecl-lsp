// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Browser fetch: globalThis.fetch is always available.
export default globalThis.fetch.bind(globalThis);
