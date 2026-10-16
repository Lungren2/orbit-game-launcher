const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { scanLibrary, launchGame, artworkPath } = require('./library.cjs');
const { fetchCatalogue } = require('./catalogue.cjs');
const { DownloadManager } = require('./downloads.cjs');
const metadata = require('./metadata.cjs');
const bundledThemes = require('./themes.json');
const { windowOptions } = require('./window.cjs');
let win, library, downloads, quitting = false, state = { root: 'D:\\Games', favorites: [], recent: {}, executables: {}, autoMetadata: true };
const configured = new Set();
let configuring = false;
function scheduleConfiguration() {
  if (!state.autoMetadata || configuring || !library) return;
  const games = library.games.filter(g => !configured.has(g.folder));
  if (!games.length) return;
  configuring = true;
  setImmediate(async () => {
    try {
      for (const game of games) {
        if (quitting || !state.autoMetadata) break;
        configured.add(game.folder);
        try {
          const result = await metadata.autoConfigure(game, { bundledMusic: !!bundledThemes[path.basename(game.folder)] });
          if (result.metadata || result.music || result.needsMatch) { await getLibrary(); if (win && !win.isDestroyed()) win.webContents.send('library-updated'); }
        } catch (error) { console.warn('Game setup:', game.name, error.message); }
      }
    } finally { configuring = false; scheduleConfiguration(); }
  });
}
protocol.registerSchemesAsPrivileged([{ scheme: 'orbit-art', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let saving = Promise.resolve();
const launching = new Set();
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
const save = () => {
  const snapshot = JSON.stringify(state, null, 2);
  saving = saving.catch(() => {}).then(async () => {
    const target = path.join(app.getPath('userData'), 'library.json');
    await fs.writeFile(target + '.tmp', snapshot);
    await fs.rename(target + '.tmp', target);
  });
  return saving;
};
async function getLibrary() {
  library = await scanLibrary(state.root);
  for (const game of library.games) {
    const chosen = state.executables[game.id];
    if (chosen && !game.candidates.includes(chosen)) game.candidates.push(chosen);
  }
  scheduleConfiguration();
  return { ...library, favorites: state.favorites, recent: state.recent, executables: state.executables, autoMetadata: state.autoMetadata };
}
const gameById = (id) => {
  const game = library?.games.find(g => g.id === id);
  if (!game) throw new Error('Game not found. Refresh your library.');
  return game;
};
const attempt = (handler) => async (event, ...args) => {
  try {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('This action is only available in Orbit.');
    return { ok: true, data: await handler(...args) };
  }
  catch (error) { return { ok: false, error: error.message }; }
};

app.whenReady().then(async () => {
  try { state = { ...state, ...JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'library.json'), 'utf8')) }; } catch {}
  app.setAppUserModelId('Orbit.Launcher');
  win = new BrowserWindow(windowOptions());
  win.removeMenu();
  const appUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
  win.webContents.on('will-navigate', (event, url) => { if (url !== appUrl) event.preventDefault(); });
  downloads = new DownloadManager({ session: win.webContents.session, contents: win.webContents, getRoot: () => state.root, dataDirectory: app.getPath('userData') });
  await downloads.initialize();
  downloads.on('change', jobs => { if (!win.isDestroyed()) win.webContents.send('downloads-changed', jobs); });
  downloads.on('imported', async () => { try { await getLibrary(); if (!win.isDestroyed()) win.webContents.send('library-imported'); } catch {} });
  downloads.on('storage-error', error => console.error('Download history:', error.message));
  win.webContents.setWindowOpenHandler(details => { downloads.popup(details); return { action: 'deny' }; });
  protocol.handle('orbit-art', async request => {
    try { const url = new URL(request.url); return net.fetch(pathToFileURL(await artworkPath(library || await scanLibrary(state.root), url.hostname, url.pathname.slice(1))).href, { headers: request.headers.has('range') ? { Range: request.headers.get('range') } : {} }); }
    catch { return new Response('Artwork not found', { status: 404 }); }
  });
  win.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  ipcMain.handle('library', attempt(getLibrary));
  ipcMain.handle('metadata-search', attempt((id, query) => { gameById(id); return metadata.searchGames(query); }));
  ipcMain.handle('metadata-apply', attempt(async (id, steamId) => { const result = await metadata.applySteam(gameById(id), steamId, { replace: true }); await getLibrary(); return result; }));
  ipcMain.handle('metadata-auto', attempt(async id => { const game = gameById(id); const result = await metadata.autoConfigure(game, { bundledMusic: !!bundledThemes[path.basename(game.folder)], force: true }); await getLibrary(); return result; }));
  ipcMain.handle('music-candidates', attempt(id => metadata.localMusic(gameById(id))));
  ipcMain.handle('music-use', attempt(async (id, file) => { const game = gameById(id); if (!(await metadata.localMusic(game)).some(c => c.file === file)) throw new Error('Choose a track from this game.'); const result = await metadata.importMedia(game, 'music', file, { discovered: true }); await getLibrary(); return result; }));
  ipcMain.handle('choose-media', attempt(async (id, kind) => {
    if (!['cover', 'hero', 'logo', 'music'].includes(kind)) throw new Error('Invalid media type.');
    const game = gameById(id);
    const picked = await dialog.showOpenDialog(win, { title: `Choose ${kind === 'hero' ? 'wallpaper' : kind} for ${game.name}`, defaultPath: game.folder, properties: ['openFile'], filters: [{ name: kind === 'music' ? 'Audio' : 'Images', extensions: kind === 'music' ? ['mp3','ogg','wav','m4a','flac'] : ['jpg','jpeg','png','webp'] }] });
    if (picked.canceled) return null;
    const result = await metadata.importMedia(game, kind, picked.filePaths[0]); await getLibrary(); return result;
  }));
  ipcMain.handle('auto-metadata', attempt(async enabled => { if (typeof enabled !== 'boolean') throw new Error('Invalid preference.'); state.autoMetadata = enabled; await save(); scheduleConfiguration(); return enabled; }));
  ipcMain.handle('catalogue', attempt(fetchCatalogue));
  ipcMain.handle('downloads', attempt(() => downloads.snapshot()));
  ipcMain.handle('prepare-download', attempt(game => downloads.prepare(game)));
  ipcMain.handle('end-download-context', attempt(token => downloads.clear(token)));
  ipcMain.handle('download-control', attempt((id, action) => downloads.control(id, action)));
  ipcMain.handle('add-archive', attempt(async game => {
    const result = await dialog.showOpenDialog(win, { title: 'Import game archive', filters: [{ name: 'Game archives', extensions: ['zip','7z'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    return downloads.addArchive(result.filePaths[0], game);
  }));
  ipcMain.handle('download-folder', attempt(async id => {
    const job = downloads.jobs.find(job => job.id === id);
    if (!job) throw new Error('Download not found.');
    const error = await shell.openPath(job.folder || path.dirname(job.archive)); if (error) throw new Error(error);
  }));
  ipcMain.handle('download-executable', attempt(async id => {
    const job = downloads.jobs.find(job => job.id === id);
    if (!job?.folder) throw new Error('Imported game not found.');
    await getLibrary();
    const game = library.games.find(game => game.folder === job.folder);
    if (!game) throw new Error('This game is outside the current library. Switch to its game folder in Settings.');
    const exe = await chooseExecutable(game.id);
    if (exe) { job.status = 'ready'; job.message = ''; downloads.changed(); win.webContents.send('library-imported'); }
    return exe;
  }));
  ipcMain.handle('launch', attempt(async id => {
    const game = gameById(id);
    if (launching.has(id)) throw new Error('This game is already starting.');
    if (game.needsChoice && !state.executables[id]) throw new Error('Choose the executable in Game details before playing.');
    launching.add(id);
    try {
      const result = await launchGame(game, state.executables[id], undefined, uri => shell.openExternal(uri));
      state.recent[id] = new Date().toISOString();
      await save();
      return { ...result, recent: state.recent };
    } finally { setTimeout(() => launching.delete(id), 5000); }
  }));
  ipcMain.handle('favorite', attempt(async id => {
    gameById(id);
    state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id];
    await save(); return state.favorites;
  }));
  ipcMain.handle('choose-root', attempt(async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Choose your games folder', defaultPath: state.root, properties: ['openDirectory'] });
    if (canceled) return null;
    const next = await scanLibrary(filePaths[0]);
    state.root = filePaths[0]; library = next; await save(); return getLibrary();
  }));
  async function chooseExecutable(id) {
    const game = gameById(id);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: `Choose executable for ${game.name}`, defaultPath: game.folder, filters: [{ name: 'Game executable', extensions: ['exe'] }], properties: ['openFile'] });
    if (canceled) return null;
    const exe = filePaths[0];
    const relative = path.relative(await fs.realpath(game.folder), await fs.realpath(exe));
    if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.exe$/i.test(exe)) throw new Error('Choose an .exe inside this game folder.');
    state.executables[id] = exe; await save();
    if (!game.candidates.includes(exe)) game.candidates.push(exe);
    return exe;
  }
  ipcMain.handle('choose-executable', attempt(chooseExecutable));
  ipcMain.handle('open-folder', attempt(async id => {
    const error = await shell.openPath(gameById(id).folder);
    if (error) throw new Error(error);
  }));
  ipcMain.handle('fullscreen', attempt(() => { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen(); }));
  await win.loadURL(appUrl);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (downloads && !quitting) { event.preventDefault(); quitting = true; downloads.flush().catch(error => console.error('Download history:', error.message)).finally(() => app.quit()); }
});
