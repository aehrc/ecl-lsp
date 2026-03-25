// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

(async () => {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite/index');
    const testWorkspace = path.resolve(__dirname, 'workspace');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        '--disable-extensions', // disable other extensions to isolate tests
      ],
    });
  } catch (err) {
    console.error('Failed to run E2E tests:', err);
    process.exit(1);
  }
})();
