import type { StorybookConfig } from '@storybook/web-components-vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: '@storybook/web-components-vite',
  addons: [],
  viteFinal: (config) => {
    config.plugins = [...(config.plugins ?? []), nodePolyfills({ include: ['util'] })];
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@aehrc/ecl-core': path.resolve(__dirname, '../../ecl-core/src/index.ts'),
        '@aehrc/ecl-editor-core': path.resolve(__dirname, '../../ecl-editor-core/src/index.ts'),
      },
    };
    return config;
  },
};

export default config;
