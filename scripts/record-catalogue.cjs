// Record the real production UI and live catalogue, without launching or downloading games.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { scanLibrary } = require('../electron/library.cjs');
const { fetchCatalogue } = require('../electron/catalogue.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const output = path.join(__dirname, '../research/playzip/orbit-catalogue-walkthrough.mp4');
  const frames = path.join(__dirname, '../research/playzip/recording-frames');
  const win = new BrowserWindow({ show: false, width: 1366, height: 768, webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  ipcMain.handle('library', async () => ({ ok: true, data: { ...await scanLibrary('D:\\Games'), favorites: [], recent: {}, executables: {} } }));
  ipcMain.handle('catalogue', async (_, options) => {
    try { return { ok: true, data: await fetchCatalogue(options) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  const js = expression => win.webContents.executeJavaScript(expression);
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const ready = () => js(`(async()=>{for(let i=0;i<400;i++){if(document.querySelector('.catalogue-card'))break;if(document.querySelector('#catalogue-retry'))throw new Error(document.querySelector('.catalogue-message').textContent);await new Promise(r=>setTimeout(r,50));}await Promise.race([Promise.all([...document.querySelectorAll('.catalogue-cover img')].slice(0,6).map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,5000))]);return true;})()`);
  let ffmpeg, recording = false, pump;
  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.mkdir(frames, { recursive: true });
    await Promise.all([fetchCatalogue({ page: 1 }), fetchCatalogue({ page: 2 }), fetchCatalogue({ keywords: 'Stardew' })]);
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    await click('[data-view="catalogue"]');
    await ready(); await delay(1000);
    recording = true;
    let frameNumber = 0, firstFrameTime = 0, lastFrameTime = 0;
    pump = (async () => {
      while (recording) {
        const started = Date.now();
        const frame = (await win.webContents.capturePage()).toPNG();
        await fs.writeFile(path.join(frames, `frame-${String(frameNumber++).padStart(5,'0')}.png`), frame);
        lastFrameTime = Date.now(); if (!firstFrameTime) firstFrameTime = lastFrameTime;
        await delay(Math.max(1,100-(Date.now()-started)));
      }
    })();
    await delay(2200);
    await js(`document.querySelector('.catalogue-results').scrollTo({top:360,behavior:'smooth'})`);
    await delay(1700);
    await click('#catalogue-next');
    await ready(); await delay(2000);
    await js(`document.querySelector('#catalogue-search').value='Stardew';document.querySelector('#catalogue-search-form').requestSubmit();true`);
    await ready(); await delay(1500);
    await click('.catalogue-card');
    let loaded = false;
    for(let i=0;i<125;i++) {
      const remote = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('https://playzip.com/game/'));
      if(remote) { try { loaded = await remote.executeJavaScript(`!!document.querySelector('h1')`); } catch {} }
      if(loaded) break;
      await delay(200);
    }
    if(!loaded) throw new Error('The PlayZip game page did not load.');
    await delay(4000);
    await click('#close-dialog');
    await delay(1500);
    recording = false; await pump;
    const captureRate = (frameNumber-1)*1000/Math.max(1,lastFrameTime-firstFrameTime);
    ffmpeg = spawn('ffmpeg', ['-y','-hide_banner','-loglevel','error','-framerate',String(captureRate),'-i',path.join(frames,'frame-%05d.png'),'-t',String(frameNumber/captureRate),'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=20','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',output], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
    let encoderErrors='';ffmpeg.stderr.on('data',bytes=>encoderErrors+=bytes.toString());
    await new Promise((resolve,reject)=>{ffmpeg.once('error',reject);ffmpeg.once('close',code=>code===0?resolve():reject(new Error(encoderErrors||`Encoder exited ${code}`)));});
    console.log(`Recording ready: ${output}`);
    app.exit(0);
  } catch (error) {
    recording = false;
    if(pump) await pump.catch(()=>{});
    console.error(error); app.exit(1);
  }
});
