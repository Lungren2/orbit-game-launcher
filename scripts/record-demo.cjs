// Capture the production Electron renderer. No games or downloads are started.
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { scanLibrary, artworkPath } = require('../electron/library.cjs');
const { windowOptions } = require('../electron/window.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
protocol.registerSchemesAsPrivileged([{ scheme: 'orbit-art', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', path.join(app.getPath('temp'), `orbit-demo-${process.pid}`));

app.whenReady().then(async () => {
  let recording = false, pump, encoder, stage = 'startup';
  try {
    const directory = path.join(__dirname, '../docs/media');
    await fs.mkdir(directory, { recursive: true });
    const scratch = path.join(__dirname, '../research/playzip/recording-frames');
    await fs.mkdir(scratch, { recursive: true });
    const library = await scanLibrary('D:\\Games', { platforms:true, cacheDirectory:app.getPath('userData') });
    const options = windowOptions();
    const win = new BrowserWindow({ ...options, show: false, width: 1280, height: 800, webPreferences: { ...options.webPreferences, offscreen: true, backgroundThrottling: false } });
    win.webContents.on('console-message',details=>{if(details.level==='error' || details.level===3)console.error('Demo renderer:',details.message);});
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
    protocol.handle('orbit-art', async request => {
      const url = new URL(request.url);
      return net.fetch(pathToFileURL(await artworkPath(library, url.hostname, url.pathname.slice(1))).href);
    });
    ipcMain.handle('library', () => ({ ok: true, data: { ...library, favorites: [], recent: {}, executables: {} } }));
    ipcMain.handle('downloads', () => ({ ok: true, data: [] }));
    ipcMain.handle('catalogue', () => ({ ok:true,data:{html:'<div class="games_content"></div><div class="pagination"><a>1 / 1</a></div>',url:'https://playzip.com/'} }));
    const js = expression => win.webContents.executeJavaScript(expression);
    const click = selector => { stage=`click ${selector}`;return js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing demo control: '+${JSON.stringify(selector)});e.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));e.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));e.click();return true;})()`); };
    const wait = expression => js(`(async () => { for (let i=0;i<400;i++) { if (${expression}) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Demo page timed out'); })()`);
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    await wait("document.querySelectorAll('.game-tile').length > 0");
    const startingGame = library.games.find(game => game.art === 'cities') || library.games[0];
    await click(`.game-tile[data-id="${startingGame.id}"]`);
    await js('Promise.all([...document.querySelectorAll(".selected img")].map(image => image.decode().catch(() => {})))');
    await delay(800);
    encoder = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '10', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', path.join(scratch, 'demo-capture.mp4')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let errors = '';
    encoder.stderr.on('data', data => { errors += data.toString(); });
    const encoded = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', code => code === 0 ? resolve() : reject(new Error(errors))); });
    // Keep encoder failures observed even if a UI action fails first.
    encoded.catch(() => {});
    recording = true;
    const recordingStart = Date.now();
    let frameCount = 0;
    pump = (async () => {
      while (recording) {
        const start = Date.now();
        if (!encoder.stdin.write((await win.webContents.capturePage()).toPNG())) await once(encoder.stdin, 'drain');
        frameCount++;
        await delay(Math.max(1, 100 - (Date.now() - start)));
      }
    })();
    await delay(2200);
    for (const title of ['Stardew Valley', 'Vampire Survivors', 'Fortnite']) {
      const game = library.games.find(game => game.name === title);
      if (!game) continue;
      await click(`.game-tile[data-id="${game.id}"]`);
      await js(`document.querySelector('.carousel-viewport').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      await delay(2200);
    }
    await click('[data-view="catalogue"]');
    await delay(2500);
    const focusedGame = library.games.find(game=>game.name==='Stardew Valley') || library.games[0];
    await click(`[data-details-installed="${focusedGame.id}"]`);
    await delay(1800);
    await click('#close-dialog');
    await delay(400);
    await click('[data-view="games"]');
    await delay(1200);
    const first = library.games.find(game => game.art === 'cities') || library.games[0];
    await click(`.game-tile[data-id="${first.id}"]`);
    await delay(2000);
    recording = false;
    await pump;
    const timeScale = (Date.now() - recordingStart) / 1000 / (frameCount / 10);
    encoder.stdin.end();
    await encoded;
    // capturePage throughput varies across machines. Preserve the actual walkthrough timing.
    const video = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(scratch, 'demo-capture.mp4'), '-vf', `setpts=${timeScale}*PTS,fps=20`, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(directory, 'orbit-demo.mp4')], { windowsHide: true, stdio: 'inherit' });
    await new Promise((resolve, reject) => { video.once('error', reject); video.once('close', code => code === 0 ? resolve() : reject(new Error(`Video encoding failed: ${code}`))); });
    const preview = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(directory, 'orbit-demo.mp4'), '-filter_complex', 'fps=8,scale=768:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', path.join(directory, 'orbit-demo.gif')], { windowsHide: true, stdio: 'inherit' });
    await new Promise((resolve, reject) => { preview.once('error', reject); preview.once('close', code => code === 0 ? resolve() : reject(new Error(`Preview encoding failed: ${code}`))); });
    console.log(`Demo recorded: ${path.join(directory, 'orbit-demo.mp4')}`);
    app.exit(0);
  } catch (error) {
    recording = false;
    if (pump) await pump.catch(() => {});
    if (encoder) encoder.kill();
    console.error(stage,error);
    app.exit(1);
  }
});
