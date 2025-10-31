import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // <— DO NOT hop ports
    open: true,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  define: { 'process.env': {} },
});
