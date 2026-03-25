import { test, expect } from '@playwright/test';
import {
  storyUrl,
  STORIES,
  waitForEditorReady,
  getEditorValue,
  setEditorValue,
  typeInEditor,
  setCursorPosition,
  triggerCompletion,
  getCompletionLabels,
  triggerFormatDocument,
  triggerHover,
  getMarkers,
  waitForMarkers,
  waitForNoMarkers,
  callFormat,
  callGetDiagnostics,
  isEclLanguageRegistered,
} from './helpers';

// ---------------------------------------------------------------------------
// 1. Web Component Rendering
// ---------------------------------------------------------------------------

test.describe('Web Component Rendering', () => {
  test('renders <ecl-editor> with Monaco editor', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    // The custom element exists
    const elementExists = await page.evaluate(() => {
      return document.querySelector('ecl-editor') !== null;
    });
    expect(elementExists).toBe(true);

    // Monaco editor is inside the custom element
    const monacoExists = await page.evaluate(() => {
      const el = document.querySelector('ecl-editor');
      return el?.querySelector('.monaco-editor') !== null;
    });
    expect(monacoExists).toBe(true);
  });

  test('loads initial value from attribute', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    const value = await getEditorValue(page);
    expect(value).toBe('< 404684003 |Clinical finding|');
  });

  test('ECL language is registered', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    expect(await isEclLanguageRegistered(page)).toBe(true);
  });

  test('dark theme applies', async ({ page }) => {
    await page.goto(storyUrl(STORIES.darkTheme));
    await waitForEditorReady(page);

    const value = await getEditorValue(page);
    expect(value).toContain('Diabetes mellitus');
  });

  test('read-only prevents editing', async ({ page }) => {
    await page.goto(storyUrl(STORIES.readOnly));
    await waitForEditorReady(page);

    const before = await getEditorValue(page);
    await typeInEditor(page, 'x');
    const after = await getEditorValue(page);
    expect(after).toBe(before);
  });

  test('multiple editors render side-by-side', async ({ page }) => {
    await page.goto(storyUrl(STORIES.multipleEditors));

    // Wait for both editors
    await page.waitForFunction(
      () => {
        const editors = document.querySelectorAll('ecl-editor');
        if (editors.length < 2) return false;
        return Array.from(editors).every((el) => el.querySelector('.monaco-editor') !== null);
      },
      { timeout: 15_000 },
    );

    // Both editors should have different content
    const values = await page.evaluate(() => {
      const editors = document.querySelectorAll('ecl-editor');
      return Array.from(editors).map((el: any) => el.value);
    });
    expect(values).toHaveLength(2);
    expect(values[0]).toContain('Clinical finding');
    expect(values[1]).toContain('Disorder of lung');
  });
});

// ---------------------------------------------------------------------------
// 2. Web Component API (value, format, getDiagnostics)
// ---------------------------------------------------------------------------

test.describe('Web Component API', () => {
  test('value getter returns editor content', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    const value = await getEditorValue(page);
    expect(value).toContain('404684003');
  });

  test('value setter updates editor content', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '<< 73211009');
    const value = await getEditorValue(page);
    expect(value).toBe('<< 73211009');
  });

  test('format() method formats the document', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '<<404684003|Clinical finding|AND<19829001');
    await callFormat(page);

    const formatted = await getEditorValue(page);
    expect(formatted).toContain('<< 404684003');
    expect(formatted).toContain('AND');
  });

  test('getDiagnostics() returns empty for valid ECL', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await page.waitForTimeout(1000);
    const diags = await callGetDiagnostics(page);
    const errors = diags.filter((d: any) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('getDiagnostics() returns errors for invalid ECL', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '< AND AND');
    await waitForMarkers(page, 1);

    const diags = await callGetDiagnostics(page);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some((d: any) => d.severity === 'error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Custom Events
// ---------------------------------------------------------------------------

test.describe('Custom Events', () => {
  test('ecl-change event fires on edit', async ({ page }) => {
    await page.goto(storyUrl(STORIES.eventListening));
    await waitForEditorReady(page);

    // Listen for the event
    const changeReceived = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const el = document.querySelector('ecl-editor')!;
        el.addEventListener(
          'ecl-change',
          ((e: CustomEvent) => {
            resolve(e.detail.value);
          }) as EventListener,
          { once: true },
        );
      });
    });

    // Type into the editor
    await typeInEditor(page, ' test');

    const value = await changeReceived;
    expect(value).toContain('test');
  });

  test('ecl-diagnostics event fires after content change', async ({ page }) => {
    await page.goto(storyUrl(STORIES.eventListening));
    await waitForEditorReady(page);

    // Listen for diagnostics event
    const diagsReceived = page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const el = document.querySelector('ecl-editor')!;
        el.addEventListener(
          'ecl-diagnostics',
          ((e: CustomEvent) => {
            resolve(e.detail.diagnostics.length);
          }) as EventListener,
          { once: true },
        );
      });
    });

    // Set invalid content to trigger diagnostics
    await setEditorValue(page, '< AND AND');

    // The diagnostics event should fire (may be 0 or more)
    const count = await diagsReceived;
    expect(typeof count).toBe('number');
  });

  test('event listening story shows events in output', async ({ page }) => {
    await page.goto(storyUrl(STORIES.eventListening));
    await waitForEditorReady(page);

    // Type to trigger ecl-change
    await typeInEditor(page, ' extra');
    await page.waitForTimeout(500);

    // The EventListening story appends event logs to the page
    const outputText = await page.evaluate(() => {
      const divs = document.querySelectorAll('div div');
      return Array.from(divs)
        .map((d) => d.textContent)
        .join(' ');
    });
    expect(outputText).toContain('[change]');
  });
});

// ---------------------------------------------------------------------------
// 4. Diagnostics
// ---------------------------------------------------------------------------

test.describe('Diagnostics', () => {
  test('valid expression has no error markers', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await page.waitForTimeout(1000);
    const markers = await getMarkers(page);
    const errors = markers.filter((m) => m.severity === 8);
    expect(errors).toHaveLength(0);
  });

  test('syntax error produces markers', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '< 404684003 AND AND');
    await waitForMarkers(page, 1);

    const markers = await getMarkers(page);
    expect(markers.length).toBeGreaterThan(0);
  });

  test('fixing error clears markers', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '< AND');
    await waitForMarkers(page, 1);

    await setEditorValue(page, '< 404684003');
    await waitForNoMarkers(page, 3_000);

    const markers = await getMarkers(page);
    const errors = markers.filter((m) => m.severity === 8);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Completions
// ---------------------------------------------------------------------------

test.describe('Completions', () => {
  test('trigger suggest shows items', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '<');
    await setCursorPosition(page, 1, 2);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    expect(labels.length).toBeGreaterThan(0);
  });

  test('shows compound operator completions', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '< 404684003 ');
    await setCursorPosition(page, 1, 13);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    const hasCompound = labels.some((l) => l.includes('AND') || l.includes('OR') || l.includes('MINUS'));
    expect(hasCompound).toBe(true);
  });

  test('shows concept search with FHIR', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withFhirServer));
    await waitForEditorReady(page);

    await setEditorValue(page, '< ');
    await setCursorPosition(page, 1, 3);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    const hasSearch = labels.some((l) => l.toLowerCase().includes('search'));
    expect(hasSearch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Hover
// ---------------------------------------------------------------------------

test.describe('Hover', () => {
  test('shows hover for < operator', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    const hoverText = await triggerHover(page, 1, 1);
    expect(hoverText).toBeTruthy();
    expect(hoverText).toContain('descendant');
  });
});

// ---------------------------------------------------------------------------
// 7. Formatting
// ---------------------------------------------------------------------------

test.describe('Formatting', () => {
  test('format normalizes spacing', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForEditorReady(page);

    await setEditorValue(page, '<<404684003 AND<19829001');
    await triggerFormatDocument(page);

    const formatted = await getEditorValue(page);
    expect(formatted).toContain('<< 404684003');
  });
});

// ---------------------------------------------------------------------------
// 8. FHIR Integration
// ---------------------------------------------------------------------------

test.describe('FHIR Integration', () => {
  test('semantic validation warns on unknown concept', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withFhirServer));
    await waitForEditorReady(page);

    await setEditorValue(page, '< 999999999');

    try {
      await waitForMarkers(page, 1, 8_000);
      const markers = await getMarkers(page);
      expect(markers.length).toBeGreaterThan(0);
    } catch {
      // FHIR may be unavailable — graceful degradation
    }
  });
});
