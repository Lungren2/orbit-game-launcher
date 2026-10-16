// Verify the production renderer and sandboxed Electron bridge without launching games.
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const { scanLibrary, artworkPath } = require('../electron/library.cjs');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { windowOptions } = require('../electron/window.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'orbit-art', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.whenReady().then(async () => {
  const library = await scanLibrary('D:\\Games');
  protocol.handle('orbit-art', async request => {
    const url = new URL(request.url);
    return net.fetch(pathToFileURL(await artworkPath(library, url.hostname, url.pathname.slice(1))).href);
  });
  const errors = [];
  const options = windowOptions();
  const nativeCheck = process.env.ORBIT_WINDOW_CHECK === '1';
  const win = new BrowserWindow({ ...options, show: nativeCheck, width: 1280, height: 800, webPreferences: { ...options.webPreferences, offscreen: !nativeCheck, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  ipcMain.handle('library', async () => ({ ok: true, data: { ...library, favorites: [], recent: {}, executables: {} } }));
  ipcMain.handle('launch', async () => ({ ok: false, error: 'Smoke test: launch intercepted' }));
  ipcMain.handle('downloads', async () => ({ ok: true, data: [] }));
  ipcMain.handle('download-control', async (_, id, action) => ({ ok: true, data: [{ id, game: { name: 'Fixture import', coverUrl: null }, status: action === 'pause' ? 'paused' : 'downloading', received: 50, total: 100, live: true, resumable: true }] }));
  ipcMain.handle('prepare-download', async () => ({ ok: true, data: 'smoke-token' }));
  ipcMain.handle('end-download-context', async () => ({ ok: true }));
  ipcMain.handle('catalogue', async (_, options) => {
    if (options.keywords === 'offline-test') return { ok: false, error: 'Catalogue offline test' };
    const sample = JSON.parse(await fs.readFile(path.join(__dirname, '../research/playzip', options.keywords ? 'search-sample.json' : options.page === 2 ? 'category-sample.json' : 'catalogue-sample.json'), 'utf8'));
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const html = `<div class="games_content">${sample.games.map(game => `<a class="game_item" href="/game/${game.id}"><img alt="${escape(game.name)}" src="${escape(game.coverUrl)}"></a>`).join('')}</div><div class="pagination"><a>${sample.page} / ${sample.totalPages}</a></div>`;
    return { ok: true, data: { html, url: 'https://playzip.com/' } };
  });
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 100 && !document.querySelector('#play'); i++) await new Promise(r => setTimeout(r, 50));
      await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
      const data = await window.orbit.library();
      const initial = { bridge: !!window.orbit, games: data.data.games.length, tiles: document.querySelectorAll('.game-tile').length, nodeIsolated: typeof require === 'undefined', brokenImages: [...document.images].filter(i => !i.naturalWidth).map(i => i.src), play: !!document.querySelector('#play') };
      document.querySelector('#play').click();
      await new Promise(r => setTimeout(r, 100));
      initial.launchError = document.querySelector('.toast').textContent;
      return initial;
    })()`);
    assert.equal(result.bridge, true); assert.equal(result.nodeIsolated, true);
    assert.ok(result.games > 0, 'Smoke check needs an installed game in D:\\Games');
    assert.equal(result.tiles, result.games); assert.equal(result.play, true);
    assert.deepEqual(result.brokenImages, []);
    assert.match(result.launchError, /launch intercepted/);
    const catalogue = await win.webContents.executeJavaScript(`(async () => {
      const wait = async test => { for (let i=0;i<200;i++) { if(test()) return; await new Promise(r=>setTimeout(r,25)); } throw new Error('Catalogue UI timed out'); };
      document.querySelector('[data-view="catalogue"]').click();
      await wait(()=>document.querySelectorAll('.catalogue-card').length === 30);
      const data={cards:document.querySelectorAll('.catalogue-card').length,pages:document.querySelector('#catalogue-page').max};
      document.querySelector('#catalogue-next').click();
      await wait(()=>document.querySelector('#catalogue-page').value === '2' && document.querySelectorAll('.catalogue-card').length === 30);
      data.page2=true;
      const search=document.querySelector('#catalogue-search');search.value='Stardew';
      document.querySelector('#catalogue-search-form').requestSubmit();
      await wait(()=>document.querySelectorAll('.catalogue-card').length === 1);
      data.search=document.querySelector('.catalogue-title').textContent;
      document.querySelector('.catalogue-card').click();
      await wait(()=>!!document.querySelector('iframe'));
      data.frame={url:document.querySelector('iframe').src,sandbox:document.querySelector('iframe').getAttribute('sandbox'),modal:document.querySelector('dialog').open};
      document.querySelector('#close-dialog').click();
      await wait(()=>!document.querySelector('iframe'));
      data.frameRemoved=true;
      document.querySelector('#catalogue-search').value='offline-test';
      document.querySelector('#catalogue-search-form').requestSubmit();
      await wait(()=>!!document.querySelector('#catalogue-retry'));
      data.error=document.querySelector('.catalogue-message').textContent;
      document.querySelector('[data-view="games"]').click();
      data.localIntact=document.querySelectorAll('.game-tile').length;
      return data;
    })()`);
    assert.equal(catalogue.cards, 30); assert.equal(catalogue.pages, '96');
    assert.equal(catalogue.page2, true); assert.equal(catalogue.search, 'Stardew Valley');
    assert.equal(catalogue.frame.url, 'https://playzip.com/game/226');
    assert.equal(catalogue.frame.modal, true);
    assert.equal(catalogue.frame.sandbox, 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups');
    assert.equal(catalogue.frameRemoved, true); assert.equal(catalogue.localIntact, result.games);
    assert.match(catalogue.error, /Catalogue offline test/);
    // Check native title-bar geometry and hit regions against the real renderer.
    const checkHeader = async () => win.webContents.executeJavaScript(`(() => {
      const header = document.querySelector('header');
      const utilities = document.querySelector('.utilities').getBoundingClientRect();
      const nav = document.querySelector('nav').getBoundingClientRect();
      const area = navigator.windowControlsOverlay?.getTitlebarAreaRect();
      return { drag: getComputedStyle(header).webkitAppRegion, button: getComputedStyle(document.querySelector('#settings-button')).webkitAppRegion, top: header.getBoundingClientRect().top, right: utilities.right, navRight: nav.right, utilitiesLeft: utilities.left, safeRight: area?.width || innerWidth, logo: document.querySelector('.brand-mark').naturalWidth };
    })()`);
    for (const width of [1280, 900]) {
      win.setSize(width, 800);
      await new Promise(resolve => setTimeout(resolve, 150));
      const header = await checkHeader();
      assert.equal(header.drag, 'drag'); assert.equal(header.button, 'no-drag');
      assert.equal(header.top, 0); assert.ok(header.logo > 0);
      assert.ok(header.right <= header.safeRight, JSON.stringify(header));
      assert.ok(header.navRight < header.utilitiesLeft, JSON.stringify(header));
    }
    win.setSize(1280, 800);
    await new Promise(resolve => setTimeout(resolve, 150));
    await fs.mkdir(path.join(__dirname, '../research/playzip/screenshots'), { recursive: true });
    await fs.writeFile(path.join(__dirname, '../research/playzip/screenshots/integrated-header.png'), (await win.webContents.capturePage()).toPNG());
    if (nativeCheck) {
      const transition = async (event, action) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Window event timed out: ${event}`)), 5000);
          win.once(event, () => { clearTimeout(timeout); resolve(); });
          action();
        });
        await new Promise(resolve => setTimeout(resolve, 150));
      };
      await transition('maximize', () => win.maximize());
      assert.equal(win.isMaximized(), true);
      assert.ok((await checkHeader()).right <= (await checkHeader()).safeRight);
      await transition('unmaximize', () => win.unmaximize());
      await transition('enter-full-screen', () => win.setFullScreen(true));
      assert.equal(win.isFullScreen(), true);
      assert.ok((await checkHeader()).right <= (await checkHeader()).safeRight);
      await transition('leave-full-screen', () => win.setFullScreen(false));
      await transition('minimize', () => win.minimize());
      assert.equal(win.isMinimized(), true);
      await transition('restore', () => win.restore());
      console.log('Native window controls, fullscreen, and restore passed.');
    }
    win.webContents.send('downloads-changed', [{ id: 'fixture-job', game: { name: 'Fixture import', coverUrl: null }, status: 'downloading', received: 50, total: 100, live: true }]);
    await new Promise(resolve => setTimeout(resolve, 50));
    const downloadUI = await win.webContents.executeJavaScript(`(async()=>{
      document.querySelector('#downloads-button').click();
      const result={title:document.querySelector('.download-info h2').textContent,progress:document.querySelector('progress').value};
      document.querySelector('[data-download-action="pause"]').click();
      for(let i=0;i<50&&!document.querySelector('[data-download-action="resume"]');i++)await new Promise(r=>setTimeout(r,20));
      result.paused=!!document.querySelector('[data-download-action="resume"]');
      return result;
    })()`);
    assert.equal(downloadUI.title, 'Fixture import'); assert.equal(downloadUI.progress, 50); assert.equal(downloadUI.paused, true);
    await new Promise(resolve => setTimeout(resolve, 500));
    await fs.mkdir(path.join(__dirname, '../research/playzip/screenshots'), { recursive: true });
    await fs.writeFile(path.join(__dirname, '../research/playzip/screenshots/downloads.png'), (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log('Electron smoke test passed:', JSON.stringify(result));
    console.log('Catalogue UI test passed:', JSON.stringify(catalogue));
    console.log('Downloads UI test passed:', JSON.stringify(downloadUI));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
