import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globals: true,
    coverage: { reporter: ['text', 'html'] }
  },
  esbuild: { target: 'es2022' }
});

