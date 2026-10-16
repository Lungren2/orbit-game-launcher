import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { scanLibrary, artworkPath } = require('./electron/library.cjs');
const { fetchCatalogue } = require('./electron/catalogue.cjs');

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  plugins: [{
    name: 'local-library-preview',
    configureServer(server) {
      server.middlewares.use('/api/art', async (req, res) => {
        try { const fs = await import('node:fs/promises'); const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean); if (req.method !== 'GET' || parts.length !== 2) throw new Error(); const data = await fs.readFile(await artworkPath(await scanLibrary('D:\\Games'), parts[0], parts[1])); res.setHeader('Content-Type', 'image/jpeg'); res.end(data); }
        catch { res.statusCode = 404; res.end(); }
      });
      server.middlewares.use('/api/catalogue', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          const query = new URL(req.url, 'http://localhost').searchParams;
          const data = await fetchCatalogue({ page: Number(query.get('page') || 1), keywords: query.get('keywords') || '', category: query.get('category') || 'all', sort: query.get('sort') || 'views' });
          res.end(JSON.stringify(data));
        } catch (error) { res.statusCode = 502; res.end(JSON.stringify({ error: error.message })); }
      });
      server.middlewares.use('/api/library', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try { res.end(JSON.stringify(await scanLibrary('D:\\Games'))); }
        catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
      });
    },
  }],
});
