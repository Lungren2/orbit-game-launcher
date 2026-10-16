// Optional live verification. Does not click links inside PlayZip or launch games.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { scanLibrary } = require('../electron/library.cjs');
const { fetchCatalogue } = require('../electron/catalogue.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 940, webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  ipcMain.handle('library', async () => ({ ok: true, data: { ...await scanLibrary('D:\\Games'), favorites: [], recent: {}, executables: {} } }));
  ipcMain.handle('catalogue', async (_, options) => {
    try { return { ok: true, data: await fetchCatalogue(options) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    const data = await win.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-view="catalogue"]').click();
      for(let i=0;i<600&&!document.querySelector('.catalogue-card');i++) {
        if(document.querySelector('#catalogue-retry')) throw new Error(document.querySelector('.catalogue-message').textContent);
        await new Promise(r=>setTimeout(r,50));
      }
      await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,7000))]);
      await new Promise(r=>setTimeout(r,1000));
      return {cards:document.querySelectorAll('.catalogue-card').length,pages:document.querySelector('#catalogue-page').max,overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.querySelectorAll('.catalogue-cover img')].slice(0,6).map(i=>({loaded:i.complete,width:i.naturalWidth,height:i.getBoundingClientRect().height,hidden:i.hidden}))};
    })()`);
    assert.equal(data.cards, 30); assert.equal(data.overflow, false);
    await fs.mkdir(path.join(__dirname, '../research/playzip/screenshots'), { recursive: true });
    await fs.writeFile(path.join(__dirname, '../research/playzip/screenshots/catalogue.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('.catalogue-card').click()`);
    let frame, remote;
    for (let i = 0; i < 150; i++) {
      frame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('https://playzip.com/game/'));
      if (frame) {
        try {
          remote = await frame.executeJavaScript(`({url:location.href,title:document.title,game:document.querySelector('h1')?.textContent,bridge:typeof window.orbit,node:typeof require})`);
          if (remote.game) break;
        } catch {}
      }
      await wait(200);
    }
    assert.ok(remote?.game, `PlayZip frame did not load a game page: ${JSON.stringify(remote)}`);
    assert.equal(remote.bridge, 'undefined'); assert.equal(remote.node, 'undefined');
    await wait(1000);
    await fs.writeFile(path.join(__dirname, '../research/playzip/screenshots/playzip-modal.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('#close-dialog').click()`);
    console.log('Live catalogue and iframe passed:', JSON.stringify({ ...data, remote }));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
