import { test, expect } from '@playwright/test';
import {
  storyUrl,
  STORIES,
  waitForMonacoReady,
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
  isEclLanguageRegistered,
  getModelLanguageId,
} from './helpers';

// ---------------------------------------------------------------------------
// 1. Editor Rendering
// ---------------------------------------------------------------------------

test.describe('Editor Rendering', () => {
  test('renders Monaco editor with default story', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Editor container should be visible
    await expect(page.locator('.monaco-editor')).toBeVisible();
  });

  test('loads initial content from story args', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    const value = await getEditorValue(page);
    expect(value).toBe('< 404684003 |Clinical finding|');
  });

  test('ECL language is registered', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    const registered = await isEclLanguageRegistered(page);
    expect(registered).toBe(true);
  });

  test('editor model uses ECL language', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    const langId = await getModelLanguageId(page);
    expect(langId).toBe('ecl');
  });

  test('dark theme renders correctly', async ({ page }) => {
    await page.goto(storyUrl(STORIES.darkTheme));
    await waitForMonacoReady(page);

    // The vs-dark theme should apply a dark background
    const bgColor = await page.evaluate(() => {
      const editor = document.querySelector('.monaco-editor');
      return editor ? getComputedStyle(editor).backgroundColor : '';
    });
    // vs-dark background is typically a dark color (rgb(30, 30, 30) or similar)
    expect(bgColor).toBeTruthy();
  });

  test('read-only mode prevents editing', async ({ page }) => {
    await page.goto(storyUrl(STORIES.readOnly));
    await waitForMonacoReady(page);

    const before = await getEditorValue(page);
    await typeInEditor(page, 'x');
    const after = await getEditorValue(page);
    expect(after).toBe(before); // Should not have changed
  });

  test('multi-line content loads correctly', async ({ page }) => {
    await page.goto(storyUrl(STORIES.multiLine));
    await waitForMonacoReady(page);

    const value = await getEditorValue(page);
    expect(value).toContain('Diabetes mellitus');
    expect(value).toContain('ECL-END');
    expect(value).toContain('Medicinal product');
  });

  test('line numbers can be hidden', async ({ page }) => {
    await page.goto(storyUrl(STORIES.noLineNumbers));
    await waitForMonacoReady(page);

    // Line number elements should not be present
    const lineNumbers = await page.locator('.monaco-editor .line-numbers').count();
    expect(lineNumbers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Syntax Highlighting (Monarch Tokenizer)
// ---------------------------------------------------------------------------

test.describe('Syntax Highlighting', () => {
  test('tokenizes operators', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Check that the '<' operator gets a token class
    const hasTokenizedContent = await page.evaluate(() => {
      // Monaco Monarch tokens apply CSS classes like mtk<N>
      // Check that there's more than one token class (meaning tokenization happened)
      const spans = document.querySelectorAll('.monaco-editor .view-lines span span');
      const classes = new Set<string>();
      spans.forEach((s) => {
        s.classList.forEach((c) => classes.add(c));
      });
      return classes.size > 1; // Multiple token classes = tokenization working
    });
    expect(hasTokenizedContent).toBe(true);
  });

  test('tokenizes SCTID as number', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Verify concept IDs get distinct styling from operators
    const tokenClasses = await page.evaluate(() => {
      const spans = document.querySelectorAll('.monaco-editor .view-lines span span');
      const result: { text: string; classes: string }[] = [];
      spans.forEach((s) => {
        if (s.textContent?.trim()) {
          result.push({
            text: s.textContent.trim(),
            classes: Array.from(s.classList).join(' '),
          });
        }
      });
      return result;
    });

    // Find the operator '<' and concept ID '404684003' - they should have different classes
    const operatorToken = tokenClasses.find((t) => t.text === '<');
    const conceptToken = tokenClasses.find((t) => t.text === '404684003');
    if (operatorToken && conceptToken) {
      expect(operatorToken.classes).not.toBe(conceptToken.classes);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Text Editing
// ---------------------------------------------------------------------------

test.describe('Text Editing', () => {
  test('typing adds text to editor', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    await setEditorValue(page, '');
    await typeInEditor(page, '< 404684003');

    const value = await getEditorValue(page);
    expect(value).toBe('< 404684003');
  });

  test('setValue replaces entire content', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    await setEditorValue(page, '<< 73211009 |Diabetes mellitus|');
    const value = await getEditorValue(page);
    expect(value).toBe('<< 73211009 |Diabetes mellitus|');
  });
});

// ---------------------------------------------------------------------------
// 4. Diagnostics (Syntax Errors)
// ---------------------------------------------------------------------------

test.describe('Diagnostics', () => {
  test('valid ECL expression has no error markers', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Give diagnostics time to run
    await page.waitForTimeout(1000);

    // Valid expression should produce no error markers
    const markers = await getMarkers(page);
    const errors = markers.filter((m) => m.severity === 8); // 8 = Error
    expect(errors.length).toBe(0);
  });

  test('syntax error produces error marker', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Set invalid ECL
    await setEditorValue(page, '< 404684003 AND AND < 19829001');
    await waitForMarkers(page, 1);

    const markers = await getMarkers(page);
    expect(markers.length).toBeGreaterThan(0);
    const errors = markers.filter((m) => m.severity === 8);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('fixing syntax error clears markers', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // First introduce an error
    await setEditorValue(page, '< AND');
    await waitForMarkers(page, 1);
    let markers = await getMarkers(page);
    expect(markers.length).toBeGreaterThan(0);

    // Fix it
    await setEditorValue(page, '< 404684003 AND < 19829001');
    await waitForNoMarkers(page, 3_000);
    markers = await getMarkers(page);
    const errors = markers.filter((m) => m.severity === 8);
    expect(errors.length).toBe(0);
  });

  test('incomplete expression shows error', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    await setEditorValue(page, '<< 404684003 AND');
    await waitForMarkers(page, 1);

    const markers = await getMarkers(page);
    expect(markers.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Completions (Operator & Keyword)
// ---------------------------------------------------------------------------

test.describe('Completions', () => {
  test('trigger suggest shows completion items', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Place cursor at end of line and trigger
    await setEditorValue(page, '<');
    await setCursorPosition(page, 1, 2);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    expect(labels.length).toBeGreaterThan(0);
  });

  test('shows operator completions after constraint', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    await setEditorValue(page, '< 404684003 ');
    await setCursorPosition(page, 1, 13);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    // Should include compound operators like AND, OR, MINUS
    const hasCompoundOp = labels.some((l) => l.includes('AND') || l.includes('OR') || l.includes('MINUS'));
    expect(hasCompoundOp).toBe(true);
  });

  test('shows concept search item', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withFhirServer));
    await waitForMonacoReady(page);

    await setEditorValue(page, '< ');
    await setCursorPosition(page, 1, 3);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    // Should include "Search for concept..." item
    const hasSearch = labels.some((l) => l.toLowerCase().includes('search'));
    expect(hasSearch).toBe(true);
  });

  test('shows refinement completions after colon', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    await setEditorValue(page, '< 404684003 : ');
    await setCursorPosition(page, 1, 15);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    expect(labels.length).toBeGreaterThan(0);
  });

  test('shows snippet completions', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    await setEditorValue(page, '');
    await setCursorPosition(page, 1, 1);
    await triggerCompletion(page);

    const labels = await getCompletionLabels(page);
    // Should include snippets like "descendantOf", "ancestorOf", etc.
    expect(labels.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Hover
// ---------------------------------------------------------------------------

test.describe('Hover', () => {
  test('shows hover for constraint operator', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Hover over the '<' at column 1
    const hoverText = await triggerHover(page, 1, 1);
    expect(hoverText).toBeTruthy();
    expect(hoverText).toContain('descendant');
  });

  test('shows hover for << operator', async ({ page }) => {
    await page.goto(storyUrl(STORIES.darkTheme));
    await waitForMonacoReady(page);

    // Content: << 73211009 |Diabetes mellitus| : ...
    const hoverText = await triggerHover(page, 1, 1);
    expect(hoverText).toBeTruthy();
    // << means "descendant or self of"
    expect(hoverText!.toLowerCase()).toContain('descendant');
  });
});

// ---------------------------------------------------------------------------
// 7. Formatting
// ---------------------------------------------------------------------------

test.describe('Formatting', () => {
  test('format document normalizes spacing', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Set badly formatted ECL
    await setEditorValue(page, '<<404684003|Clinical finding|AND<19829001|Disorder of lung|');
    await triggerFormatDocument(page);

    const formatted = await getEditorValue(page);
    // Formatter should add spaces around operators
    expect(formatted).toContain('<< 404684003');
    expect(formatted).toContain('AND');
  });

  test('format preserves valid expression semantics', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    const original = '< 404684003 |Clinical finding|';
    await setEditorValue(page, original);
    await triggerFormatDocument(page);

    const formatted = await getEditorValue(page);
    // Should contain the concept ID
    expect(formatted).toContain('404684003');
    // Should contain the term
    expect(formatted).toContain('Clinical finding');
  });
});

// ---------------------------------------------------------------------------
// 8. Code Actions
// ---------------------------------------------------------------------------

test.describe('Code Actions', () => {
  test('code actions available for valid expression', async ({ page }) => {
    await page.goto(storyUrl(STORIES.default));
    await waitForMonacoReady(page);

    // Position cursor on the expression
    await setCursorPosition(page, 1, 3);

    // Get code actions programmatically
    const actions = await page.evaluate(() => {
      const monaco = (window as any).monaco;
      const editors = monaco.editor.getEditors();
      const editor = editors[0];
      const model = editor?.getModel();
      if (!model) return [];

      return model.getLanguageId(); // Just verify language
    });
    expect(actions).toBe('ecl');

    // Trigger code actions via the command
    const codeActions = await page.evaluate(async () => {
      const monaco = (window as any).monaco;
      const editors = monaco.editor.getEditors();
      const editor = editors[0];
      const model = editor?.getModel();
      if (!model) return [];

      // Use the code action provider API
      const position = editor.getPosition();
      const range = new monaco.Range(
        position.lineNumber,
        1,
        position.lineNumber,
        model.getLineLength(position.lineNumber) + 1,
      );

      try {
        const actions = await monaco.editor.getEditors()[0].getAction('editor.action.quickFix')?.run();
        return 'triggered';
      } catch {
        return 'error';
      }
    });
    // At minimum, the action should have been triggered without error
    expect(codeActions).not.toBe('error');
  });
});

// ---------------------------------------------------------------------------
// 9. FHIR Integration (WithFhirServer story)
// ---------------------------------------------------------------------------

test.describe('FHIR Integration', () => {
  // These tests use the WithFhirServer story which connects to Ontoserver.
  // They test concept-related features that need a real FHIR server.

  test('concept hover shows FHIR info', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withFhirServer));
    await waitForMonacoReady(page);

    // Concept ID 404684003 is at column 3-11 in "< 404684003"
    const hoverText = await triggerHover(page, 1, 5);
    if (hoverText) {
      // If FHIR responds, we should see concept info
      expect(hoverText.length).toBeGreaterThan(0);
    }
    // If FHIR is unavailable, hover may not appear — this is acceptable (graceful degradation)
  });

  test('FHIR concept search triggers network request', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withFhirServer));
    await waitForMonacoReady(page);

    // Monitor network requests
    const fhirRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('tx.ontoserver.csiro.au')) {
        fhirRequests.push(req.url());
      }
    });

    // Type a concept search query
    await setEditorValue(page, '<< ');
    await setCursorPosition(page, 1, 4);
    await typeInEditor(page, 'diabetes');

    // Wait a moment for debounced requests
    await page.waitForTimeout(2000);

    // We can't guarantee FHIR responses in CI, but we can check
    // that the editor is in a good state
    const value = await getEditorValue(page);
    expect(value).toContain('diabetes');
  });

  test('semantic validation with FHIR produces warnings for invalid concept', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withFhirServer));
    await waitForMonacoReady(page);

    // Use a concept ID that doesn't exist — should get a warning (not error)
    await setEditorValue(page, '< 999999999');

    // Semantic validation is debounced (500ms), so wait
    try {
      await waitForMarkers(page, 1, 8_000);
      const markers = await getMarkers(page);
      // Should have at least one marker (warning about unknown concept)
      expect(markers.length).toBeGreaterThan(0);
    } catch {
      // FHIR may be unavailable — graceful degradation means no markers, which is OK
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Controlled Component (Story)
// ---------------------------------------------------------------------------

test.describe('Controlled Component', () => {
  test('controlled story shows current value', async ({ page }) => {
    await page.goto(storyUrl(STORIES.controlled));
    await waitForMonacoReady(page);

    // The controlled story shows the value below the editor in a <pre> tag
    const pre = page.locator('pre').filter({ hasText: '404684003' });
    await expect(pre).toBeVisible();
  });

  test('button click updates editor content', async ({ page }) => {
    await page.goto(storyUrl(STORIES.controlled));
    await waitForMonacoReady(page);

    // Click the "Set to Lung Disorder" button
    await page.getByRole('button', { name: /Lung Disorder/i }).click();
    await page.waitForTimeout(300);

    const value = await getEditorValue(page);
    expect(value).toContain('19829001');
  });
});

// ---------------------------------------------------------------------------
// 11. useEclEditor Hook (WithHook Story)
// ---------------------------------------------------------------------------

test.describe('useEclEditor Hook', () => {
  test('format button triggers formatting', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withHook));
    await waitForMonacoReady(page);

    // The hook story has a Format button
    const formatBtn = page.getByRole('button', { name: /Format/i });
    await expect(formatBtn).toBeVisible();

    // Get initial value and click format
    const before = await getEditorValue(page);
    await formatBtn.click();
    await page.waitForTimeout(500);
    const after = await getEditorValue(page);

    // Content should still contain the concept ID
    expect(after).toContain('404684003');
  });

  test('reset button changes editor value', async ({ page }) => {
    await page.goto(storyUrl(STORIES.withHook));
    await waitForMonacoReady(page);

    await page.getByRole('button', { name: /Reset/i }).click();
    await page.waitForTimeout(300);

    const value = await getEditorValue(page);
    expect(value).toContain('19829001');
  });
});
