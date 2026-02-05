import type { Preview } from '@storybook/web-components-vite';
import * as monaco from 'monaco-editor';

// Expose Monaco globally so e2e tests can access the API
(window as any).monaco = monaco;

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;
