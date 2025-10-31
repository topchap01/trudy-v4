import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
        globals: true,
        // Explicit coverage provider avoids plugin confusion
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        },
    },
    esbuild: { target: 'es2022' },
});
