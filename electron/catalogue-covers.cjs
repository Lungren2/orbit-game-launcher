const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { CatalogueQueue } = require('./catalogue-cache.cjs');
const { safeCover } = require('./catalogue-parser.cjs');
const COVER_WIDTHS=[160,300,600];
const coverWidth=value=>COVER_WIDTHS.find(width=>width>=Number(value||300)) || 600;

class CatalogueCovers {
  constructor({directory,getGame,fetchImage=fetch,encode=buffer=>buffer}) {
    this.directory=directory;this.getGame=getGame;this.fetchImage=fetchImage;this.encode=encode;
    this.queue=new CatalogueQueue();this.abort=new AbortController();this.failed=new Map();this.variants=new Map();
  }
  async get(id,urgent=true,requestedWidth=300) {
    if(!/^[1-9]\d*$/.test(id))throw new Error('Invalid catalogue cover.');
    const url=safeCover(this.getGame(id)?.coverUrl);
    if(!url)throw new Error('Catalogue cover not found.');
    const key=createHash('sha256').update(url).digest('hex'),width=coverWidth(requestedWidth);
    if(requestedWidth==='full')return this.source(url,key,urgent);
    const file=path.join(this.directory,`${key}${width===300?'':`-${width}`}.jpg`),variant=`${key}:${width}`;
    try { return await fs.readFile(file); } catch(error) { if(error.code!=='ENOENT')throw error; }
    if(this.failed.get(key)>Date.now())throw new Error('Catalogue cover unavailable.');
    if(this.variants.has(variant))return this.variants.get(variant);
    const task=(async()=>{
      // Existing installations already have 300px thumbnails. Reuse those for
      // the first paint, even if the original needs fetching again afterward.
      let source;
      if(width===160){try{source=await fs.readFile(path.join(this.directory,`${key}.jpg`));}catch(error){if(error.code!=='ENOENT')throw error;}}
      source ||= await this.source(url,key,urgent);
      const bytes=await this.encode(source,width);
      if(!Buffer.isBuffer(bytes) || !bytes.length || bytes.length>8*1024*1024)throw new Error('Invalid catalogue thumbnail.');
      await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(file+'.tmp',bytes);await fs.rename(file+'.tmp',file);
      return bytes;
    })().finally(()=>this.variants.delete(variant));
    this.variants.set(variant,task);return task;
  }
  source(url,key,urgent){
    const sourceFile=path.join(this.directory,`${key}.source`);
    return this.queue.run(key,async()=>{
      try {
        try{return await fs.readFile(sourceFile);}catch(error){if(error.code!=='ENOENT')throw error;}
        if(this.failed.get(key)>Date.now())throw new Error('Catalogue cover unavailable.');
        let address=url,response;
        for(let redirects=0;redirects<=3;redirects++){
          response=await this.fetchImage(address,{redirect:'manual',signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(15000)])});
          if(response.status>=300 && response.status<400){
            const next=new URL(response.headers.get('location') || '',address).href;
            if(redirects===3 || !safeCover(next))throw new Error('Invalid catalogue cover redirect.');
            address=next;continue;
          }
          break;
        }
        if(!response.ok || !/^image\//i.test(response.headers.get('content-type') || ''))throw new Error('Catalogue cover unavailable.');
        const chunks=[];let size=0;
        for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw new Error('Catalogue cover is too large.');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks);
        await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(sourceFile+'.tmp',bytes);await fs.rename(sourceFile+'.tmp',sourceFile);
        return bytes;
      } catch(error) { this.failed.set(key,Date.now()+5*60*1000);throw error; }
      },urgent);
  }
  prefetch(games){return Promise.allSettled(games.filter(game=>game.coverUrl).map(game=>this.get(game.id,false,160)));}
  close(){this.abort.abort();this.queue.close();}
}

function encodeCover(buffer,width=300) {
  const image=require('electron').nativeImage.createFromBuffer(buffer);
  const size=image.getSize();
  if(image.isEmpty() || size.width>8192 || size.height>8192 || size.width*size.height>32000000)throw new Error('Invalid catalogue image.');
  return image.resize({width:Math.min(coverWidth(width),size.width),quality:'good'}).toJPEG(82);
}
function coverContentType(bytes){
  if(bytes[0]===0xff && bytes[1]===0xd8)return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(bytes.toString('ascii',0,3)==='GIF')return 'image/gif';
  return 'image/jpeg';
}
module.exports={CatalogueCovers,encodeCover,coverContentType,coverWidth};
