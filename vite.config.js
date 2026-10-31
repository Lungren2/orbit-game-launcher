import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const { scanLibrary, artworkPath } = require('./electron/library.cjs');
const { CatalogueCache } = require('./electron/catalogue-cache.cjs');
const { CatalogueCovers, coverContentType } = require('./electron/catalogue-covers.cjs');

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'next/link': fileURLToPath(new URL('./src/adapters/link.tsx', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
      output: { manualChunks(id) {
        if (!id.includes('node_modules')) return;
        if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
        if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
        return 'controls';
      } },
    },
  },
  plugins: [{
    name: 'electron-client-directives',
    enforce: 'pre',
    // This renderer is entirely client-side. Strip the registry's SSR marker
    // at build time without changing installed component source or line numbers.
    transform(code, id) {
      if (/\.[cm]?[jt]sx?$/.test(id) && /^\s*['"]use client['"];?/.test(code)) return code.replace(/(['"])use client\1;?/, '');
    },
  }, tailwindcss(), {
    name: 'local-library-preview',
    configureServer(server) {
      const catalogue = new CatalogueCache({directory:path.join(process.env.LOCALAPPDATA || os.tmpdir(),'Orbit','catalogue-preview')});
      catalogue.on('warning',error=>console.warn('Catalogue cache:',error.message));
      const ready=catalogue.initialize();
      const covers=new CatalogueCovers({directory:path.join(catalogue.directory,'covers'),getGame:id=>catalogue.records.get(id)});
      server.httpServer?.once('close',()=>{covers.close();ready.then(()=>catalogue.close()).catch(()=>{});});
      server.middlewares.use('/api/catalogue-art',async(req,res)=>{
        try {await ready;const url=new URL(req.url,'http://localhost'),id=url.pathname.slice(1);const bytes=await covers.get(id,true,url.searchParams.get('width'));res.setHeader('Content-Type',coverContentType(bytes));res.setHeader('Cache-Control','public, max-age=86400');res.end(bytes);}
        catch {res.statusCode=404;res.end();}
      });
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
          await ready;
          const data = await catalogue.get({ page: Number(query.get('page') || 1), keywords: query.get('keywords') || '', category: query.get('category') || 'all', sort: query.get('sort') || 'views', ...(query.has('collection') ? {collection:JSON.parse(query.get('collection'))} : {}) });
          covers.prefetch(data.games);
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
