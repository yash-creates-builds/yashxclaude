// Builds a single self-contained page (no service worker, no AI model) for sharing a design preview.
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [tailwindcss()],
  define: { 'import.meta.env.VITE_PREVIEW': JSON.stringify('1') },
  resolve: { alias: { './yamnet.js': fileURLToPath(new URL('./yamnet-stub.js', import.meta.url)) } },
  build: {
    outDir: 'dist-preview',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
