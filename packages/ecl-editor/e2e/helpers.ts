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
export async function triggerFormatDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editors = (window as any).monaco.editor.getEditors();
    const editor = editors[0];
    if (editor) {
      editor.focus();
      editor.trigger('e2e-test', 'editor.action.formatDocument', {});
    }
  });
  await page.waitForTimeout(500);
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
  await page.evaluate(() => {
    const el = document.querySelector('ecl-editor') as any;
    el?.format();
  });
  await page.waitForTimeout(500);
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
