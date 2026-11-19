import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const GEN = path.resolve('assets/generated');
// Files that must keep a stable, un-hashed name at the site root (link previews, icons).
const ROOT_FILES = ['og-image.jpg', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png'];

// Absolute site URL for Open Graph tags (WhatsApp prefers absolute image URLs).
// Set SITE_URL=https://your-site.netlify.app when building; Netlify/Vercel CI vars are used if present.
const siteUrl = (
  process.env.SITE_URL ||
  process.env.URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  ''
).replace(/\/$/, '');

function rootFiles() {
  return {
    name: 'invite-root-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = ROOT_FILES.find((n) => req.url === '/' + n);
        if (!f) return next();
        res.setHeader('Content-Type', f.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
        fs.createReadStream(path.join(GEN, f)).pipe(res);
      });
    },
    generateBundle() {
      for (const f of ROOT_FILES) {
        const p = path.join(GEN, f);
        if (fs.existsSync(p)) this.emitFile({ type: 'asset', fileName: f, source: fs.readFileSync(p) });
      }
    },
    transformIndexHtml(html) {
      const og = siteUrl ? `${siteUrl}/og-image.jpg` : 'og-image.jpg';
      return html.replaceAll('__OG_IMAGE__', og).replaceAll('__SITE_URL__', siteUrl ? siteUrl + '/' : '');
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [rootFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'es2019',
    chunkSizeWarningLimit: 800,
  },
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
});
