import path from 'path';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// Public base path for static hosting, e.g. VITE_BASE=/FantasyAILab/ for GitHub Pages.
const base = process.env.VITE_BASE || '/';

// arXiv's API sends no CORS headers, so the browser can't call it directly.
// `npm run dev` and `npm run preview` proxy it same-origin at <base>arxiv-api/*.
const arxivProxy: Record<string, ProxyOptions> = {
  [`${base}arxiv-api`]: {
    target: 'https://export.arxiv.org',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^.*?\/arxiv-api/, '/api'),
  },
};

export default defineConfig({
  base,
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: arxivProxy,
  },
  preview: {
    proxy: arxivProxy,
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
