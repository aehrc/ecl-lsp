import { type Page } from '@playwright/test';

/**
 * Storybook iframe URL for a given story.
 */
export function storyUrl(storyId: string): string {
  return `/iframe.html?id=${storyId}&viewMode=story`;
}

/** Well-known story IDs matching ecl-editor.stories.ts */
export const STORIES = {
  default: 'ecl-editor-ecl-editor--default',
  darkTheme: 'ecl-editor-ecl-editor--dark-theme',
  autoTheme: 'ecl-editor-ecl-editor--auto-theme',
  autoThemeHighContrast: 'ecl-editor-ecl-editor--auto-theme-high-contrast',
  gutterPresets: 'ecl-editor-ecl-editor--gutter-presets',
  gutterOverrides: 'ecl-editor-ecl-editor--gutter-overrides',
  withFhirServer: 'ecl-editor-ecl-editor--with-fhir-server',
  readOnly: 'ecl-editor-ecl-editor--read-only',
  eventListening: 'ecl-editor-ecl-editor--event-listening',
  multipleEditors: 'ecl-editor-ecl-editor--multiple-editors',
};

/**
 * Wait for the <ecl-editor> web component to be fully initialized.
 * Monaco renders in the light DOM inside the custom element.
 */
export async function waitForEditorReady(page: Page): Promise<void> {
  // Wait for the custom element to appear
  await page.waitForSelector('ecl-editor', { timeout: 15_000 });

  // Wait for Monaco to be available globally and editor created inside the element
  await page.waitForFunction(
    () => {
      const el = document.querySelector('ecl-editor');
      if (!el) return false;
      const monacoEl = el.querySelector('.monaco-editor');
      if (!monacoEl) return false;
      // Also check that the global monaco API is available
      return typeof (window as any).monaco !== 'undefined' && (window as any).monaco.editor.getEditors().length > 0;
    },
    { timeout: 15_000 },
  );
}

/**
 * Get the current editor value via the web component's value property.
 */
export async function getEditorValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('ecl-editor') as any;
    return el?.value ?? '';
  });
}

/**
 * Set editor content via the web component's value setter.
 */
export async function setEditorValue(page: Page, value: string): Promise<void> {
  await page.evaluate((val: string) => {
    const el = document.querySelector('ecl-editor') as any;
    if (el) el.value = val;
  }, value);
}

/**
 * Type text into the Monaco editor via Monaco API.
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
 * Set cursor position (1-based).
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
 * Trigger completions programmatically.
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
  await page.waitForFunction(
    () => {
      const widget = document.querySelector('.suggest-widget.visible');
      return !!widget;
    },
    { timeout: 5_000 },
  );
}

/**
 * Get completion labels from the suggest widget.
 */
export async function getCompletionLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll('.suggest-widget .monaco-list-row .label-name');
    return items ? Array.from(items).map((i) => i.textContent?.trim() ?? '') : [];
  });
}

/**
 * Trigger document formatting.
 */
/**
 * Wait for a formatting request to land.
 *
 * Monaco applies formatting edits asynchronously, and how long that takes depends
 * on the monaco build: 0.55.x applies them in ~15 ms, but a build whose editor
 * worker fails to load stalls for ~1 s first. A fixed sleep therefore encodes an
 * assumption about the bundle, and when monaco 0.56.0 broke worker loading the
 * old 500 ms sleep turned a 1 s delay into an apparent "format silently did
 * nothing" - see #75. Waiting for the document to actually change is correct on
 * both.
 *
 * Formatting an already-canonical document produces no change, so a timeout here
 * is not an error: callers that assert "unchanged" depend on this resolving.
 */
async function waitForFormatToApply(page: Page, before: string): Promise<void> {
  await page
    .waitForFunction(
      (prev) => {
        const editors = (
          window as { monaco?: { editor: { getEditors: () => unknown[] } } }
        ).monaco?.editor.getEditors();
        const model = (editors?.[0] as { getModel?: () => { getValue: () => string } } | undefined)?.getModel?.();
        return (model?.getValue() ?? '') !== prev;
      },
      before,
      { timeout: 10_000 },
    )
    .catch(() => {
      /* no change: the document was already formatted */
    });
}

export async function triggerFormatDocument(page: Page): Promise<void> {
  const before = await getEditorValue(page);
  await page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.focus();
      editor.trigger('e2e-test', 'editor.action.formatDocument', {});
    }
  });
  await waitForFormatToApply(page, before);
}

/**
 * Trigger hover and return its content.
 */
export async function triggerHover(page: Page, lineNumber: number, column: number): Promise<string | null> {
  await page.evaluate(
    ({ ln, col }: { ln: number; col: number }) => {
      const editors = (window as any).monaco.editor.getEditors();
      const editor = editors[0];
      if (editor) {
        editor.setPosition({ lineNumber: ln, column: col });
        editor.focus();
        editor.trigger('e2e-test', 'editor.action.showHover', {});
      }
    },
    { ln: lineNumber, col: column },
  );
  try {
    await page.waitForFunction(
      () => {
        return !!document.querySelector('.monaco-hover-content');
      },
      { timeout: 5_000 },
    );
    return page.evaluate(() => {
      const hover = document.querySelector('.monaco-hover-content');
      return hover?.textContent?.trim() ?? null;
    });
  } catch {
    return null;
  }
}

/**
 * Get all diagnostic markers.
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
 * Wait for at least `minCount` markers.
 */
export async function waitForMarkers(page: Page, minCount: number, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (min: number) => {
      const monaco = (window as any).monaco;
      const editors = monaco?.editor?.getEditors();
      const model = editors?.[0]?.getModel();
      if (!model) return false;
      return monaco.editor.getModelMarkers({ resource: model.uri }).length >= min;
    },
    minCount,
    { timeout },
  );
}

/**
 * Wait for 0 markers.
 */
export async function waitForNoMarkers(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const monaco = (window as any).monaco;
      const editors = monaco?.editor?.getEditors();
      const model = editors?.[0]?.getModel();
      if (!model) return false;
      return monaco.editor.getModelMarkers({ resource: model.uri }).length === 0;
    },
    { timeout },
  );
}

/**
 * Call the web component's format() method.
 */
export async function callFormat(page: Page): Promise<void> {
  const before = await getEditorValue(page);
  await page.evaluate(() => {
    const el = document.querySelector('ecl-editor') as any;
    el?.format();
  });
  await waitForFormatToApply(page, before);
}

/**
 * Call the web component's getDiagnostics() method.
 */
export async function callGetDiagnostics(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const el = document.querySelector('ecl-editor') as any;
    return el?.getDiagnostics() ?? [];
  });
}

/**
 * Check that ECL language is registered in Monaco.
 */
export async function isEclLanguageRegistered(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const monaco = (window as any).monaco;
    const languages = monaco?.languages?.getLanguages() ?? [];
    return languages.some((l: any) => l.id === 'ecl');
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
 * (#85); the same reasoning applies here. What the test is actually asserting - that ecl-lsp raises the
 * diagnostic and offers the replacement action - does not depend on the request
 * really being served remotely.
 *
 * Codes not listed in `inactiveCodes` come back as an empty expansion, so an
 * unexpected lookup surfaces as a missing marker rather than silently passing.
 *
 * Routes are per-page in Playwright, so this only affects the test that calls it.
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

/**
 * Read the titles listed in the code action (lightbulb) widget.
 *
 * Monaco renders the widget into `.context-view` at the document level, so this
 * cannot go through the editor element.
 */
export async function getCodeActionTitles(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.context-view .monaco-list-row')).map((el) => el.textContent?.trim() ?? ''),
  );
}

/**
 * Trigger the quick fix widget at the current cursor position.
 */
export async function triggerQuickFix(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    editor?.focus();
    // `editor.trigger(...)`, not `getAction('editor.action.quickFix')`: monaco
    // 0.56.0 no longer returns that id from getAction(), which silently makes
    // `getAction(...)?.run()` a no-op. The command path still works on both
    // 0.55.x and 0.56.x. See #101.
    editor?.trigger('e2e-test', 'editor.action.quickFix', {});
  });
  // The widget renders asynchronously; wait for it rather than for a fixed period,
  // but do not fail here - asserting on its absence is the caller's job.
  await page
    .waitForFunction(() => document.querySelectorAll('.context-view .monaco-list-row').length > 0, null, {
      timeout: 5_000,
    })
    .catch(() => {
      /* no widget appeared; the caller asserts on that */
    });
}

/**
 * Width in pixels of the editor's left margin (line numbers, glyphs, folding).
 *
 * This is what the `gutter` attribute controls, and reading the rendered width
 * is the only way to tell that the space was actually reclaimed rather than
 * merely emptied of content.
 */
export async function getMarginWidth(page: Page, index = 0): Promise<number> {
  return page.evaluate((i) => {
    const margin = document.querySelectorAll('.monaco-editor .margin')[i] as HTMLElement | undefined;
    return margin ? margin.getBoundingClientRect().width : -1;
  }, index);
}

/** Number of rendered line-number elements in the nth editor. */
export async function getLineNumberCount(page: Page, index = 0): Promise<number> {
  return page.evaluate((i) => {
    const editor = document.querySelectorAll('.monaco-editor')[i];
    return editor ? editor.querySelectorAll('.line-numbers').length : -1;
  }, index);
}

/**
 * The Monaco theme currently applied, read from the editor's own class list.
 *
 * Monaco stamps `vs`, `vs-dark` or `hc-black` onto the `.monaco-editor` element,
 * so this reflects what is actually rendered rather than what was requested.
 */
export async function getAppliedTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const editor = document.querySelector('.monaco-editor');
    if (!editor) return null;
    for (const cls of ['hc-black', 'hc-light', 'vs-dark', 'vs']) {
      if (editor.classList.contains(cls)) return cls;
    }
    return null;
  });
}

/** Wait for Monaco to settle on a given theme after a colour-scheme change. */
export async function waitForTheme(page: Page, theme: string, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const editor = document.querySelector('.monaco-editor');
      return editor?.classList.contains(expected) ?? false;
    },
    theme,
    { timeout },
  );
}
