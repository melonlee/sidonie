/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base path for static hosting, e.g. "/FantasyAILab/" (read in vite.config.ts) */
  readonly VITE_BASE?: string;
  /** Optional CORS proxy prefix for arXiv; the encoded arXiv URL is appended to it */
  readonly VITE_ARXIV_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
