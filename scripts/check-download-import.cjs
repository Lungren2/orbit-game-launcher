// End-to-end native iframe download test using a tiny local archive, never a real game.
const { app, BrowserWindow, protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DownloadManager } = require('../electron/downloads.cjs');
const { importArchive, run7zip } = require('../electron/importer.cjs');
const { scanLibrary, artworkPath } = require('../electron/library.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'orbit-art', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.whenReady().then(async () => {
  let base, server, win, manager;
  try {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-native-import-'));
    const root = path.join(base, 'Games'), source = path.join(base, 'source');
    await fs.mkdir(root); await fs.mkdir(path.join(source, 'Game/Binaries/Win64'), { recursive: true });
    await fs.writeFile(path.join(source, 'Game/Binaries/Win64/Fixture.exe'), 'MZ-fixture-not-executable');
    const archive = path.join(base, 'Fixture.zip');
    await run7zip(['a', '-tzip', archive, path.join(source, '*')]);
    const bytes = await fs.readFile(archive);
    server = http.createServer((req, res) => {
      if (req.url === '/fixture.zip') { res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Fixture.zip"', 'Content-Length': bytes.length }); return res.end(bytes); }
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><a id="download" href="/fixture.zip">Download fixture</a>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
    manager = new DownloadManager({ session: win.webContents.session, contents: win.webContents, getRoot: () => root, dataDirectory: path.join(base, 'state'), origin, importer: options => importArchive({ ...options, artwork: false }) });
    await manager.initialize();
    await manager.prepare({ id: '1', name: 'Fixture', url: `${origin}/game/1`, coverUrl: null });
    await win.loadURL('data:text/html,' + encodeURIComponent(`<iframe src="${origin}/game/1" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"></iframe>`));
    let frame;
    for (let i = 0; i < 100; i++) { frame = win.webContents.mainFrame.frames.find(frame => frame.url === `${origin}/game/1`); if (frame && await frame.executeJavaScript('!!document.querySelector("#download")')) break; await new Promise(r => setTimeout(r, 50)); }
    assert.ok(frame, 'Fixture frame loaded');
    await frame.executeJavaScript('document.querySelector("#download").click()');
    for (let i = 0; i < 300; i++) { if (manager.jobs[0] && ['ready','failed','needs-executable'].includes(manager.jobs[0].status)) break; await new Promise(r => setTimeout(r, 50)); }
    assert.equal(manager.jobs.length, 1);
    assert.equal(manager.jobs[0].status, 'ready', manager.jobs[0].message);
    const library = await scanLibrary(root);
    assert.equal(library.games.length, 1); assert.equal(library.games[0].name, 'Fixture');
    assert.equal(await fs.readFile(library.games[0].executable, 'utf8'), 'MZ-fixture-not-executable');
    let popupReferrer;
    win.webContents.setWindowOpenHandler(details => { popupReferrer = details.referrer.url; return { action: 'deny' }; });
    await frame.executeJavaScript(`location.href=${JSON.stringify(origin + '/download/1')}`);
    for(let i=0;i<100;i++){frame=win.webContents.mainFrame.frames.find(f=>f.url===origin+'/download/1');if(frame)break;await new Promise(r=>setTimeout(r,30));}
    await frame.executeJavaScript(`window.open('https://files.example/Fixture.zip','_blank');true`);
    for(let i=0;i<100&&!popupReferrer;i++)await new Promise(r=>setTimeout(r,30));
    assert.equal(new URL(popupReferrer).origin, origin);
    await fs.copyFile(path.join(__dirname, '../public/art/stardew-library_600x900.jpg'), path.join(library.games[0].folder, '.orbit-assets/cover'));
    protocol.handle('orbit-art', async request => { const url = new URL(request.url); return net.fetch(pathToFileURL(await artworkPath(library, url.hostname, url.pathname.slice(1))).href); });
    await win.loadURL('data:text/html,' + encodeURIComponent(`<img src="orbit-art://${library.games[0].id}/cover">`));
    const artworkWidth = await win.webContents.executeJavaScript(`(async()=>{await document.querySelector('img').decode();return document.querySelector('img').naturalWidth;})()`);
    assert.ok(artworkWidth > 0, 'Imported artwork loads through the local protocol');
    await manager.flush();
    console.log('Native iframe download -> extraction -> library import passed:', JSON.stringify({ status: manager.jobs[0].status, filename: manager.jobs[0].filename, imported: library.games[0].name, candidateCount: library.games[0].candidates.length }));
    win.destroy(); server.close();
    const real = await fs.realpath(base); assert.ok(real.startsWith(await fs.realpath(os.tmpdir()) + path.sep)); await fs.rm(real, { recursive: true, force: true });
    app.exit(0);
  } catch (error) { console.error(error); await manager?.flush().catch(()=>{}); win?.destroy(); server?.close(); app.exit(1); }
});
