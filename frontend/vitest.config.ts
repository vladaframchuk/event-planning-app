import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  css: {
    // PostCSS config is tailored for Next.js build; tests do not need it.
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'jsdom',
    css: true,
    globals: true,
    setupFiles: ['vitest.setup.ts'],
  },
});
