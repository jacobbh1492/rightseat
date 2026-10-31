import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> normal static site (deploy to Vercel/Netlify/S3).
// `npm run build:single` -> one self-contained index.html (used for the preview).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  server: { fs: { allow: ['..'] } },
}));
