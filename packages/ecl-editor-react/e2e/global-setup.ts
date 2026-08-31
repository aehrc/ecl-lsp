// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warm Storybook's dev server before the suite runs.
 *
 * These stories bundle monaco from node_modules (#84) rather than pulling a
 * prebuilt copy from a CDN, so the first request for a story makes vite
 * transform monaco on demand. That is slow - slow enough that, with workers
 * running in parallel and all of them hitting a cold server at once, the first
 * several tests exceeded the 30 s timeout and failed while the ones that ran
 * afterwards passed. The result looked like flakiness in the editor rendering
 * tests, but was purely first-request cost.
 *
 * Loading one story here pays that cost once, before any test is timed.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:6006';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/iframe.html?id=ecl-editor-ecleditor--default&viewMode=story`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    // Wait for an editor instance, not just the module graph: creating one is
    // what pulls in the rest of monaco's chunks.
    await page.waitForFunction(
      () => ((window as unknown as { monaco?: any }).monaco?.editor?.getEditors?.().length ?? 0) > 0,
      null,
      { timeout: 120_000 },
    );
  } finally {
    await browser.close();
  }
}

export default globalSetup;
