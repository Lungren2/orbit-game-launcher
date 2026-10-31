// Native image encoding, custom protocol, persisted restart and offline paging.
const path=require('node:path');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});
  child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>process.exit(code??1));
}else{
  const {app,protocol,BrowserWindow,nativeImage}=require('electron');
  const fs=require('node:fs/promises'),os=require('node:os'),assert=require('node:assert/strict');
  const application=process.env.ORBIT_SMOKE_APP||path.resolve(__dirname,'..');
  const {CatalogueCache}=require(path.join(application,'electron/catalogue-cache.cjs'));
  const {CatalogueCovers,encodeCover}=require(path.join(application,'electron/catalogue-covers.cjs'));
  app.disableHardwareAcceleration();
  protocol.registerSchemesAsPrivileged([{scheme:'orbit-catalogue',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
  app.whenReady().then(async()=>{
    let directory,cache,covers,win;const deadline=setTimeout(()=>app.exit(1),20000);
    try{
      directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-catalogue-native-'));
      let calls=0,imageCalls=0;
      cache=new CatalogueCache({directory,autoWarm:false,categories:[],fetchPage:async address=>{
        calls++;const url=new URL(address),page=Number(url.searchParams.get('page')||1);
        const ids=Array.from({length:page===1?30:5},(_,i)=>i+1+(page-1)*30);
        return new Response(`<div class="games_content">${ids.map(id=>`<a class="game_item" href="/game/${id}"><img alt="Game ${id}" src="https://cdn.steamstatic.com/steam/apps/${id}/cover.jpg"></a>`).join('')}</div><div class="pagination"><a>${page} / 2</a></div>`,{headers:{'content-type':'text/html'}});
      }});await cache.initialize();await cache.start();assert.equal(calls,4);
      const png=nativeImage.createFromBitmap(Buffer.alloc(640*960*4,255),{width:640,height:960}).toPNG();
      assert.ok(png.length);
      covers=new CatalogueCovers({directory:path.join(directory,'covers'),getGame:id=>cache.records.get(id),encode:encodeCover,fetchImage:async()=>{imageCalls++;return new Response(png,{headers:{'content-type':'image/png'}});}});
      const bytes=await covers.get('1');assert.equal(bytes[0],255);assert.equal(bytes[1],216);
      assert.equal(nativeImage.createFromBuffer(bytes).getSize().width,300);
      assert.equal(nativeImage.createFromBuffer(await covers.get('1',true,160)).getSize().width,160);
      assert.equal(nativeImage.createFromBuffer(await covers.get('1',true,'full')).getSize().width,640);
      await cache.close();covers.close();
      const offline=async()=>{throw Error('Offline fixture attempted network');};
      cache=new CatalogueCache({directory,autoWarm:false,categories:[],fetchPage:offline});await cache.initialize();
      assert.equal((await cache.get({page:2})).games.length,5);assert.equal((await cache.get({keywords:'game 35'})).games[0].id,'35');
      covers=new CatalogueCovers({directory:path.join(directory,'covers'),getGame:id=>cache.records.get(id),encode:encodeCover,fetchImage:offline});
      protocol.handle('orbit-catalogue',async request=>{try{return new Response(await covers.get(new URL(request.url).pathname.slice(1)),{headers:{'content-type':'image/jpeg'}});}catch{return new Response('',{status:404});}});
      win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
      await win.loadURL('about:blank');
      const decoded=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth);image.onerror=()=>reject(Error('Cached protocol image failed'));image.src='orbit-catalogue://cover/1';})`);
      assert.equal(decoded,300);assert.equal(imageCalls,1);
      console.log('Native catalogue checks passed: packaged parser, JPEG encoding, custom protocol, offline restart and paging.');
    }finally{
      win?.destroy();covers?.close();await cache?.close();clearTimeout(deadline);
      if(directory){const real=await fs.realpath(directory);assert.ok(real.startsWith(await fs.realpath(os.tmpdir())+path.sep));await fs.rm(real,{recursive:true,force:true});}
    }
  }).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
}
