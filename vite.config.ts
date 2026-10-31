import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Sub-path for static hosting, e.g. VITE_BASE=/FantasyAILab/ for GitHub Pages.
  base: process.env.VITE_BASE || '/',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // NOTE: no `define` for API keys. Keys are entered by the user in Settings (BYOK),
  // stay in the browser, and must never be inlined into the client bundle.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
