const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=process.env.ORBIT_CHECK_OUTPUT || path.join(root,'research/playzip/screenshots');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(require(root+'/node_modules/electron'),[__filename],{env,stdio:'inherit',windowsHide:true});
  child.on('exit',code=>process.exit(code??1));
}else{
  const {app,BrowserWindow,ipcMain,protocol,net}=require('electron');
  const fs=require('node:fs/promises');const {pathToFileURL}=require('node:url');const assert=require('node:assert/strict');
  const {scanLibrary,artworkPath}=require(root+'/electron/library.cjs');
  app.setPath('userData',path.join(app.getPath('temp'),'orbit-home-check-'+process.pid));
  protocol.registerSchemesAsPrivileged([{scheme:'orbit-art',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
  app.whenReady().then(async()=>{
    const timeout=setTimeout(()=>{console.error('Home preview timed out');app.exit(1);},60000);
    try{
      await fs.mkdir(output,{recursive:true});
      const original=await scanLibrary('D:/Games');let library=original,launchCalls=0,swallowed=false;
      const options=require(root+'/electron/window.cjs').windowOptions();
      const win=new BrowserWindow({...options,show:false,width:1346,height:900,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});
      win.webContents.setAudioMuted(true);
      ipcMain.handle('library',()=>({ok:true,data:{...library,favorites:[],recent:{},executables:{},autoMetadata:true}}));
      ipcMain.handle('downloads',()=>({ok:true,data:[]}));
      ipcMain.handle('launch',async()=>{launchCalls++;swallowed=await win.webContents.executeJavaScript(`[...document.querySelectorAll('.vortex-card')].every(el=>parseFloat(getComputedStyle(el).opacity)<.02)`);return {ok:false,error:'Preview launch intercepted'};});
      protocol.handle('orbit-art',async req=>{const u=new URL(req.url);return net.fetch(pathToFileURL(await artworkPath({games:[...original.games,...library.games]},u.hostname,u.pathname.slice(1))).href,{headers:req.headers.has('range')?{Range:req.headers.get('range')}:{}})});
      await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
      await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`
        Object.defineProperty(document,'hidden',{get:()=>false});
        localStorage.setItem('orbit-appearance',JSON.stringify({jungle:true,launchVortex:true}));
        localStorage.setItem('orbit-theme-music',JSON.stringify({muted:true,volume:.18}));
        window.__errors=[];addEventListener('error',e=>{if(e.message)window.__errors.push(e.message)});addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));
      `});
      await win.loadFile(root+'/dist/index.html');
      const wait=async(expression,label)=>{for(let i=0;i<160;i++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out '+label);};
      await wait(`document.querySelectorAll('.game-tile').length===${original.games.length}`,'home');
      const fortnite=original.games.find(g=>g.name==='Fortnite');
      await win.webContents.executeJavaScript(`document.querySelector('[data-id="${fortnite.id}"]').click()`);
      await wait(`document.querySelector('.jungle-video').readyState>=2 && document.querySelector('.jungle-video').currentTime>.1`,'4K jungle playback');
      await win.webContents.executeJavaScript(`Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))`);
      await new Promise(r=>setTimeout(r,250));
      console.log('Home image diagnostics '+await win.webContents.executeJavaScript(`JSON.stringify({title:document.querySelector('h1').textContent,broken:[...document.images].filter(i=>!i.naturalWidth||i.hidden).map(i=>i.src)})`));
      const initial=await win.webContents.executeJavaScript(`(()=>{const rail=document.querySelector('.game-rail'),tile=document.querySelector('.tile-art');return {tiles:document.querySelectorAll('.game-tile').length,tileWidth:tile.getBoundingClientRect().width,columns:getComputedStyle(rail).gridTemplateColumns,railWidth:rail.clientWidth,scrollWidth:rail.scrollWidth,railHeight:rail.clientHeight,scrollHeight:rail.scrollHeight,videoWidth:document.querySelector('video').videoWidth,videoHeight:document.querySelector('video').videoHeight};})()`);
      assert.equal(initial.tiles,original.games.length);assert.equal(initial.videoWidth,3840);assert.equal(initial.videoHeight,2160);assert.ok(initial.scrollWidth<=initial.railWidth+2);
      await fs.writeFile(output+'/orbit-jungle-home.png',(await win.webContents.capturePage()).toPNG());
      console.log('Home screenshot ready '+JSON.stringify(initial));
      await win.webContents.executeJavaScript(`document.querySelector('#play').click()`);
      await wait(`!!document.querySelector('.launch-vortex')`,'vortex');
      await new Promise(r=>setTimeout(r,850));
      assert.equal(launchCalls,0);
      await fs.writeFile(output+'/orbit-vortex-launch.png',(await win.webContents.capturePage()).toPNG());
      await wait(`!document.querySelector('.launch-vortex') && document.querySelector('.toast').textContent==='Preview launch intercepted'`,'animation completion');
      assert.equal(launchCalls,1);assert.equal(swallowed,true);
      console.log('Vortex timing passed');
      await win.webContents.executeJavaScript(`(()=>{document.querySelector('#settings-button').click();const input=document.querySelector('#jungle-mode');input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#close-dialog').click();})()`);
      const off=await win.webContents.executeJavaScript(`({off:document.body.dataset.jungle==='false',paused:document.querySelector('video').paused,unloaded:!document.querySelector('video').hasAttribute('src'),saved:JSON.parse(localStorage.getItem('orbit-appearance')).jungle===false})`);
      assert.ok(Object.values(off).every(Boolean));
      await fs.writeFile(output+'/orbit-jungle-off.png',(await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`(()=>{document.querySelector('#settings-button').click();const input=document.querySelector('#jungle-mode');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#close-dialog').click();})()`);
      library={...original,games:Array.from({length:24},(_,i)=>({...original.games[i%original.games.length],id:'f'+String(i+1).padStart(15,'0'),name:original.games[i%original.games.length].name+(i>=original.games.length?' '+(Math.floor(i/original.games.length)+1):'')}))};
      await win.webContents.executeJavaScript(`document.querySelector('#settings-button').click();document.querySelector('#rescan').click();`);
      await wait(`document.querySelectorAll('.game-tile').length===24 && !document.querySelector('dialog').open`,'larger library');
      const many=await win.webContents.executeJavaScript(`({tiles:document.querySelectorAll('.game-tile').length,tileWidth:document.querySelector('.tile-art').getBoundingClientRect().width,railWidth:document.querySelector('.game-rail').clientWidth,scrollWidth:document.querySelector('.game-rail').scrollWidth})`);
      assert.ok(many.tileWidth<initial.tileWidth);assert.ok(many.tileWidth>=62);assert.ok(many.scrollWidth<=many.railWidth+2);
      await fs.writeFile(output+'/orbit-larger-library.png',(await win.webContents.capturePage()).toPNG());
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:3840,height:2160,deviceScaleFactor:1,mobile:false});
      await new Promise(r=>setTimeout(r,250));
      const large=await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth})`);
      assert.equal(large.width,3840);assert.equal(large.overflow,false);
      const errors=await win.webContents.executeJavaScript('window.__errors');assert.deepEqual(errors,[]);
      await fs.writeFile(output+'/home-look-verified.json',JSON.stringify({initial,off,many,large,swallowed,errors},null,2));
      console.log('Home, 4K playback, 24-game fit, jungle toggle and vortex ordering passed.');clearTimeout(timeout);app.exit(0);
    }catch(e){console.error(e);app.exit(1)}
  });
}
