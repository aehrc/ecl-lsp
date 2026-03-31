import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [dts({ rollupTypes: true }), nodePolyfills({ include: ['assert', 'util', 'process'] })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs'),
    },
    rollupOptions: {
      // node-fetch is optional (Node.js only) — keep external so bundlers
      // can tree-shake it and browsers use native fetch
      external: ['node-fetch'],
    },
    sourcemap: false,
    minify: false,
  },
});
