import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Tiny PWA plugin: writes /sw.js with a precache list of every built file,
// so the whole app (including the lazy TensorFlow.js chunk) works offline.
function seetiServiceWorker() {
  return {
    name: 'seeti-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      // Skip source maps, legacy .woff fonts and scripts we don't render (woff2 covers every modern phone).
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff') && !f.includes('vietnamese'));
      const publicFiles = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
      const urls = ['/', ...publicFiles.map((f) => '/' + f), ...files.map((f) => '/' + f)];
      const version = createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 10);
      const source = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(urls));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), seetiServiceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2500 },
});
