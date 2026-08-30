import type { Preview } from '@storybook/react-vite';
import loader from '@monaco-editor/loader';
import * as monaco from 'monaco-editor';
// Vite turns a `?worker` import into a constructor for a bundled worker chunk.
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Use the monaco from node_modules rather than the CDN build that
// @monaco-editor/loader fetches by default
// (https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs). Without this the
// tests need public network access at run time, and they exercise a pinned
// CDN version rather than the one this repo depends on - so a monaco upgrade
// could never be validated here. See #84.
loader.config({ monaco });

// The CDN build wires up its own workers; a bundled one does not. Skipping this
// is silent but costly - formatting takes ~1 s instead of ~15 ms. See #75.
(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Expose Monaco globally so e2e tests can access the API. `loader.config` does
// not set this itself, and the CDN path used to provide it as a side effect.
(window as unknown as { monaco: typeof monaco }).monaco = monaco;

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;
