// Drive the production renderer with a simulated standard-mapping gamepad.
// Uses a throwaway library of empty game folders; launches are intercepted.
const path = require('node:path');
if (!process.versions.electron) {
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});
  child.on('error',error=>{console.error(error);process.exitCode=1;});
  child.on('exit',code=>process.exit(code ?? 1));
} else {
  const {app,BrowserWindow,ipcMain} = require('electron');
  const fs = require('node:fs/promises');
  const assert = require('node:assert/strict');
  const root = path.resolve(__dirname,'..');
  const {scanLibrary} = require(path.join(root,'electron/library.cjs'));
  const {catalogueWindow} = require(path.join(root,'electron/catalogue-pagination.cjs'));
  const temp = path.join(app.getPath('temp'),`orbit-gamepad-${process.pid}`);
  app.setPath('userData',path.join(temp,'profile'));
  app.disableHardwareAcceleration();
  app.whenReady().then(async()=>{
    let stage='startup'; const deadline=setTimeout(()=>{console.error('Gamepad check timed out at',stage);app.exit(1);},90000);
    try {
      for (const name of ['Alpha Quest','Beta Racer','Gamma Tactics']) { await fs.mkdir(path.join(temp,'games',name),{recursive:true}); await fs.writeFile(path.join(temp,'games',name,`${name.replace(/ /g,'')}.exe`),''); }
      const library = await scanLibrary(path.join(temp,'games'),{platforms:false,cacheDirectory:app.getPath('userData')});
      assert.equal(library.games.length,3);
      const launches=[];
      const handle=(name,fn)=>ipcMain.handle(name,async(_, ...args)=>({ok:true,data:await fn(...args)}));
      handle('library',()=>({...library,favorites:[],recent:{},executables:{},autoMetadata:false}));
      handle('downloads',()=>[]);
      handle('launch',id=>{launches.push(id);return {recent:{}};});
      handle('music-candidates',()=>[]);
      handle('catalogue',options=>{const page=catalogueWindow(Array.from({length:40},(_,i)=>({id:String(90000+i),name:`Catalogue game ${i+1}`})),options);return {...page,games:page.games.map(game=>({...game,url:`https://playzip.com/game/${game.id}`})),url:'https://playzip.com/'};});
      const options=require(path.join(root,'electron/window.cjs')).windowOptions();
      const win=new BrowserWindow({...options,width:1366,height:768,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});
      win.webContents.setAudioMuted(true);
      win.webContents.session.webRequest.onBeforeRequest({urls:['https://*/*']},(_,callback)=>callback({cancel:true}));
      const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const js=expression=>win.webContents.executeJavaScript(expression);
      const wait=async(expression,timeout=5000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await js(expression))return;await delay(40);}throw Error(`Timed out: ${expression}`);};
      await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
      await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`
        window.__pad={connected:true,index:0,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
        navigator.getGamepads=()=>[window.__pad];document.hasFocus=()=>true;
        window.__errors=[];addEventListener('error',e=>__errors.push(e.message));`});
      await win.loadFile(path.join(root,'dist/index.html'));
      await wait(`document.querySelectorAll('.game-tile').length===3`);
      const BUTTON={a:0,b:1,lb:4,rb:5,start:9,up:12,down:13,left:14,right:15};
      const press=async name=>{stage=`press ${name}`;await js(`__pad.buttons[${BUTTON[name]}]={pressed:true,value:1}`);await delay(80);await js(`__pad.buttons[${BUTTON[name]}]={pressed:false,value:0}`);await delay(160);};
      const focused=()=>js(`(()=>{const e=document.activeElement;return e===document.body?'body':(e.id||e.getAttribute('aria-label')||e.className)})()`);
      const selected=()=>js(`document.querySelector('.selected .game-tile').dataset.id`);

      await press('down');
      assert.match(await focused(),/^Select /,'first press focuses the selected game');
      const first=await selected();
      await press('right');
      assert.notEqual(await selected(),first,'D-pad right moves the carousel');
      assert.equal(await js(`document.activeElement===document.querySelector('.selected .game-tile')`),true);
      await press('left');
      assert.equal(await selected(),first,'D-pad left moves back');
      await press('up');
      assert.equal(await js(`!!document.activeElement.closest('.app-header')`),true,'D-pad up reaches the header');
      await press('down');
      assert.equal(await js(`!!document.activeElement.closest('.game-carousel')`),true,'D-pad down returns to the games');

      await press('rb');
      await wait(`document.body.dataset.view==='catalogue'`);
      await wait(`document.querySelectorAll('.catalogue-card').length>0`);
      for(let i=0;i<3 && !(await js(`!!document.activeElement.closest('.catalogue-card-slot')`));i++)await press('down');
      assert.equal(await js(`!!document.activeElement.closest('.catalogue-card-slot')`),true,'D-pad reaches the Library games');
      assert.equal(await js(`!document.querySelector('[role="listbox"]')`),true,'D-pad passes over dropdowns without opening them');
      const card=await js('document.activeElement.getAttribute("aria-label")');
      await press('right');
      assert.notEqual(await js('document.activeElement.getAttribute("aria-label")'),card,'D-pad right moves across the grid');
      assert.equal(await js(`document.activeElement.closest('.catalogue-card-slot').dataset.expanded`),'true','gamepad focus expands the card like keyboard focus');
      await press('right');
      await press('lb');
      await wait(`document.body.dataset.view==='games'`);

      await press('start');
      await wait(`!!document.querySelector('[role="dialog"]')`);
      await press('down');
      assert.equal(await js(`document.querySelector('[role="dialog"]').contains(document.activeElement)`),true,'focus stays inside the open dialog');
      await press('b');
      await wait(`!document.querySelector('[role="dialog"]')`);

      await press('down');
      if(!(await js(`!!document.activeElement.closest('.game-carousel')`)))await press('down');
      await js(`document.querySelector('.selected .game-tile').focus()`);
      const target=await selected();
      await press('a');
      await wait(`true`);await delay(400);
      assert.deepEqual(launches,[target],'A on the selected game launches it');
      stage='focus ring after mouse';
      for(const type of ['mouseMoved','mousePressed','mouseReleased'])await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:5,y:400,button:type==='mouseMoved'?'none':'left',clickCount:type==='mouseMoved'?0:1});
      await js('document.activeElement.blur()');
      await press('down');
      assert.equal(await js("document.activeElement!==document.body && document.activeElement.matches(':focus-visible')"),true,'gamepad focus shows a ring even after mouse use');
      assert.deepEqual(await js('__errors'),[]);
      console.log('Gamepad navigation check passed');
      clearTimeout(deadline);app.exit(0);
    } catch(error) { console.error('Failed at',stage,error); clearTimeout(deadline); app.exit(1); }
    finally { fs.rm(temp,{recursive:true,force:true}).catch(()=>{}); }
  });
}
