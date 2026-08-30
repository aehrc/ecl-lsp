import { type Page, type FrameLocator, expect } from '@playwright/test';

/**
 * Storybook iframe URL for a given story.
 * Story IDs follow the pattern: category-component--story-name (kebab-case).
 */
export function storyUrl(storyId: string): string {
  return `/iframe.html?id=${storyId}&viewMode=story`;
}

/** Well-known story IDs matching EclEditor.stories.tsx */
export const STORIES = {
  default: 'ecl-editor-ecleditor--default',
  darkTheme: 'ecl-editor-ecleditor--dark-theme',
  withFhirServer: 'ecl-editor-ecleditor--with-fhir-server',
  readOnly: 'ecl-editor-ecleditor--read-only',
  multiLine: 'ecl-editor-ecleditor--multi-line-expression',
  controlled: 'ecl-editor-ecleditor--controlled',
  withHook: 'ecl-editor-ecleditor--with-hook',
  noLineNumbers: 'ecl-editor-ecleditor--no-line-numbers',
};

/**
 * Wait for the Monaco editor to be fully loaded and ready.
 * Returns the page (for chaining).
 */
export async function waitForMonacoReady(page: Page): Promise<void> {
  // Wait for Monaco container to appear in DOM
  await page.waitForSelector('.monaco-editor', { timeout: 15_000 });

  // Wait for Monaco API to be available on the window
  await page.waitForFunction(
    () => {
      return typeof (window as any).monaco !== 'undefined' && (window as any).monaco.editor.getEditors().length > 0;
    },
    { timeout: 15_000 },
  );
}

/**
 * Get the current editor content via Monaco API.
 */
export async function getEditorValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    return editors[0]?.getModel()?.getValue() ?? '';
  });
}

/**
 * Set editor content via Monaco API.
 */
export async function setEditorValue(page: Page, value: string): Promise<void> {
  await page.evaluate((val: string) => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.getModel()?.setValue(val);
      editor.setPosition({ lineNumber: 1, column: 1 });
    }
  }, value);
}

/**
 * Type text into the Monaco editor at the current cursor position.
 * Uses editor.trigger to ensure Monaco processes the input.
 */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  await page.evaluate((t: string) => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.focus();
      editor.trigger('e2e-test', 'type', { text: t });
    }
  }, text);
}

/**
 * Set cursor position (1-based line and column).
 */
export async function setCursorPosition(page: Page, lineNumber: number, column: number): Promise<void> {
  await page.evaluate(
    ({ ln, col }: { ln: number; col: number }) => {
      const editors = (window as any).monaco.editor.getEditors();
      const editor = editors[0];
      if (editor) {
        editor.setPosition({ lineNumber: ln, column: col });
        editor.focus();
      }
    },
    { ln: lineNumber, col: column },
  );
}

/**
 * Trigger the suggest/completion widget programmatically.
 * Returns after the suggest widget becomes visible.
 */
export async function triggerCompletion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.focus();
      editor.trigger('e2e-test', 'editor.action.triggerSuggest', {});
    }
  });
  // Wait for suggest widget to appear
  await page.waitForSelector('.monaco-editor .suggest-widget.visible', { timeout: 5_000 });
}

/**
 * Get visible completion item labels from the suggest widget.
 */
export async function getCompletionLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll('.monaco-editor .suggest-widget .monaco-list-row .label-name');
    return Array.from(items).map((el) => el.textContent?.trim() ?? '');
  });
}

/**
 * Trigger document formatting via Monaco command.
 */
export async function triggerFormatDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.focus();
      editor.trigger('e2e-test', 'editor.action.formatDocument', {});
    }
  });
  // Small wait for formatting to apply
  await page.waitForTimeout(500);
}

/**
 * Trigger hover at a specific position.
 * Returns the hover content text, or null if no hover appears.
 */
export async function triggerHover(page: Page, lineNumber: number, column: number): Promise<string | null> {
  await page.evaluate(
    ({ ln, col }: { ln: number; col: number }) => {
      const editors = (window as any).monaco.editor.getEditors();
      const editor = editors[0];
      if (editor) {
        editor.setPosition({ lineNumber: ln, column: col });
        editor.focus();
        // Trigger the hover content provider
        editor.trigger('e2e-test', 'editor.action.showHover', {});
      }
    },
    { ln: lineNumber, col: column },
  );
  try {
    await page.waitForSelector('.monaco-hover-content', { timeout: 5_000 });
    return page.evaluate(() => {
      const hover = document.querySelector('.monaco-hover-content');
      return hover?.textContent?.trim() ?? null;
    });
  } catch {
    return null;
  }
}

/**
 * Get all diagnostic markers on the current model.
 * Returns array of { message, severity, startLineNumber, startColumn }.
 */
export async function getMarkers(page: Page): Promise<
  Array<{
    message: string;
    severity: number;
    startLineNumber: number;
    startColumn: number;
  }>
> {
  return page.evaluate(() => {
    const monaco = (window as any).monaco;
    const editors = monaco.editor.getEditors();
    const model = editors[0]?.getModel();
    if (!model) return [];
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    return markers.map((m: any) => ({
      message: m.message,
      severity: m.severity,
      startLineNumber: m.startLineNumber,
      startColumn: m.startColumn,
    }));
  });
}

/**
 * Wait for markers to appear (or stabilize after a change).
 * Polls until at least `minCount` markers exist or timeout.
 */
export async function waitForMarkers(page: Page, minCount: number, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (min: number) => {
      const monaco = (window as any).monaco;
      const editors = monaco?.editor?.getEditors();
      const model = editors?.[0]?.getModel();
      if (!model) return false;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.length >= min;
    },
    minCount,
    { timeout },
  );
}

/**
 * Wait until markers count is exactly 0.
 */
export async function waitForNoMarkers(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const monaco = (window as any).monaco;
      const editors = monaco?.editor?.getEditors();
      const model = editors?.[0]?.getModel();
      if (!model) return false;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.length === 0;
    },
    { timeout },
  );
}

/**
 * Trigger code actions (quick fix / refactoring) at current position.
 * Returns available code action titles.
 */
export async function getCodeActionTitles(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.focus();
      editor.trigger('e2e-test', 'editor.action.quickFix', {});
    }
  });
  try {
    await page.waitForSelector('.monaco-action-bar .action-item', { timeout: 3_000 });
    return page.evaluate(() => {
      const items = document.querySelectorAll(
        '.context-view .monaco-list-row .action-label, .context-view .monaco-list-row',
      );
      return Array.from(items)
        .map((el) => el.textContent?.trim() ?? '')
        .filter((t) => t.length > 0);
    });
  } catch {
    return [];
  }
}

/**
 * Check that the ECL language is registered in Monaco.
 */
export async function isEclLanguageRegistered(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const monaco = (window as any).monaco;
    const languages = monaco?.languages?.getLanguages() ?? [];
    return languages.some((l: any) => l.id === 'ecl');
  });
}

/**
 * Get the language ID of the current editor model.
 */
export async function getModelLanguageId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    return editors[0]?.getModel()?.getLanguageId() ?? '';
  });
}

/**
 * Serve a canned `ValueSet/$expand` response for the inactive-concept lookup.
 *
 * The inactive-concept diagnostic and its quick fix need exactly one call to the
 * terminology server:
 *
 *   POST /ValueSet/$expand?property=inactive&activeOnly=false
 *   {"resourceType":"ValueSet","compose":{"include":[
 *     {"system":"http://snomed.info/sct","concept":[{"code":"75304006"}]}]}}
 *
 * Left unstubbed, that is a live round-trip to Ontoserver inside a 15 s budget,
 * which made the test fail whenever the server was slow or briefly unavailable
 * (#85). What the test is actually asserting - that ecl-lsp raises the
 * diagnostic and offers the replacement action - does not depend on the request
 * really being served remotely.
 *
 * Codes not listed in `inactiveCodes` come back as an empty expansion, so an
 * unexpected lookup surfaces as a missing marker rather than silently passing.
 *
 * Routes are per-page in Playwright, so this only affects the test that calls it;
 * the other FHIR-backed tests still exercise the real server.
 */
export async function stubInactiveConceptExpansion(
  page: Page,
  inactiveCodes: Record<string, string> = { '75304006': 'Black heron' },
): Promise<void> {
  // Matched with a predicate rather than a glob: the `$` in `$expand` is
  // awkward to express reliably in Playwright's glob syntax, and a pattern that
  // silently fails to match would leave the live call in place - which is the
  // exact failure mode this helper exists to remove.
  await page.route(
    (url) => url.pathname.endsWith('/ValueSet/$expand'),
    async (route) => {
      const request = route.request();
      let codes: string[] = [];
      try {
        const body = JSON.parse(request.postData() ?? '{}') as {
          compose?: { include?: { concept?: { code?: string }[] }[] };
        };
        codes = (body.compose?.include ?? []).flatMap((inc) =>
          (inc.concept ?? []).map((c) => c.code ?? '').filter(Boolean),
        );
      } catch {
        codes = [];
      }

      const contains = codes
        .filter((code) => code in inactiveCodes)
        .map((code) => ({
          extension: [
            {
              url: 'http://ontoserver.csiro.au/profiles/expansion',
              extension: [{ url: 'inactive', valueBoolean: true }],
            },
          ],
          system: 'http://snomed.info/sct',
          inactive: true,
          code,
          display: inactiveCodes[code],
        }));

      await route.fulfill({
        status: 200,
        contentType: 'application/fhir+json',
        body: JSON.stringify({
          resourceType: 'ValueSet',
          expansion: {
            identifier: 'urn:uuid:00000000-0000-4000-8000-000000000000',
            total: contains.length,
            parameter: [{ name: 'activeOnly', valueBoolean: false }],
            contains,
          },
        }),
      });
    },
  );
}
