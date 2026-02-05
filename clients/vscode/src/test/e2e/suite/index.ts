// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import * as path from 'node:path';
import * as fs from 'node:fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', timeout: 60_000 });

  const testsRoot = path.resolve(__dirname);

  return new Promise((resolve, reject) => {
    // Find all .test.js files in the suite directory
    const files = fs.readdirSync(testsRoot).filter((f) => f.endsWith('.test.js'));
    for (const f of files) {
      mocha.addFile(path.resolve(testsRoot, f));
    }

    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
