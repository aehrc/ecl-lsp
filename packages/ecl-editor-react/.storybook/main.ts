import type { StorybookConfig } from '@storybook/react-vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: '@storybook/react-vite',
  addons: [],
  viteFinal: (config) => {
    config.plugins = [...(config.plugins ?? []), nodePolyfills({ include: ['util'] })];
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [...(config.optimizeDeps?.include ?? []), 'ecl-core', 'ecl-editor-core'],
    };
    return config;
  },
};

export default config;
