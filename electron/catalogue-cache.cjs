const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { catalogueUrl, readCatalogue, CATEGORIES } = require('./catalogue.cjs');
const { parseCataloguePage, safeCover } = require('./catalogue-parser.cjs');
const { catalogueWindow, validateCollection } = require('./catalogue-pagination.cjs');
const DAY = 24*60*60*1000;

// Background crawling cannot occupy the slot reserved for a page being opened.
class CatalogueQueue {
  constructor() { this.jobs=new Map();this.waiting=[];this.active=0;this.background=0;this.closed=false; }
  run(key, task, urgent=true) {
    if(this.closed)return Promise.reject(new Error('Catalogue cache closed.'));
    const existing=this.jobs.get(key);
    if(existing){if(urgent && !existing.running)existing.urgent=true;this.pump();return existing.promise;}
    const job={key,task,urgent,running:false};
    job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
    this.jobs.set(key,job);this.waiting.push(job);this.pump();return job.promise;
  }
  pump() {
    while(this.active<3 && this.waiting.length){
      let index=this.waiting.findIndex(job=>job.urgent);
      if(index<0){if(this.background>=2)break;index=0;}
      const [job]=this.waiting.splice(index,1);job.running=true;this.active++;if(!job.urgent)this.background++;
      Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{this.active--;if(!job.urgent)this.background--;this.jobs.delete(job.key);this.pump();});
    }
  }
  close(){this.closed=true;for(const job of this.waiting.splice(0)){this.jobs.delete(job.key);job.reject(new Error('Catalogue cache closed.'));}}
}

class CatalogueCache extends EventEmitter {
  constructor({directory,fetchPage=fetch,now=Date.now,ttl=DAY,categories=CATEGORIES.filter(value=>value!=='all'),autoWarm=true}={}) {
    super();this.directory=directory;this.fetchPage=fetchPage;this.now=now;this.ttl=ttl;this.categories=categories;this.autoWarm=autoWarm;
    this.pages=new Map();this.records=new Map();this.indexes=new Map();this.indexTasks=new Map();this.queue=new CatalogueQueue();
    this.abort=new AbortController();this.saving=Promise.resolve();this.revision=0;this.closed=false;
  }
  async initialize() {
    await fs.mkdir(this.directory,{recursive:true});
    this.file=path.join(this.directory,'catalogue.json');
    try {
      if((await fs.stat(this.file)).size>32*1024*1024)throw new Error('Oversized catalogue cache.');
      const data=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(data.version!==1 || !Array.isArray(data.pages) || !Array.isArray(data.indexes))throw new Error('Invalid catalogue cache.');
      for(const [url,page] of data.pages){
        try {
          const address=new URL(url),category=address.pathname==='/'?'all':/^\/category\/(\w+)$/.exec(address.pathname)?.[1];
          const options={page:Number(address.searchParams.get('page')||1),keywords:address.searchParams.get('keywords')||'',sort:address.searchParams.get('sort')||'views',category};
          if(catalogueUrl(options)!==url || !this.validPage(page))continue;
          this.pages.set(url,page);this.remember(page.games);
        } catch {}
      }
      for(const [key,index] of data.indexes){
        if(!this.planKeys().includes(key) || !index || !Array.isArray(index.ids) || index.ids.length>50000 || !Number.isFinite(index.updatedAt) || index.ids.some(id=>!this.records.has(id)))continue;
        this.indexes.set(key,{ids:[...new Set(index.ids)],updatedAt:index.updatedAt});
      }
      this.revision=Number.isSafeInteger(data.revision)?data.revision:0;
    } catch(error) { if(error.code!=='ENOENT')this.emit('warning',error); }
    if(this.autoWarm){this.interval=setInterval(()=>this.start(),5*60*1000);this.interval.unref?.();}
    return this;
  }
  validPage(page){return page && Array.isArray(page.games) && page.games.length<=2000 && Number.isFinite(page.fetchedAt) && Number.isInteger(page.page) && page.page>=1 && Number.isInteger(page.totalPages) && page.totalPages>=page.page && page.totalPages<=1000 && page.games.every(game=>/^[1-9]\d*$/.test(game.id) && Number.isSafeInteger(Number(game.id)) && typeof game.name==='string' && game.name.length>0 && game.name.length<=500 && game.url===`https://playzip.com/game/${game.id}` && (!game.coverUrl || safeCover(game.coverUrl)===game.coverUrl));}
  remember(games){for(const game of games)this.records.set(game.id,game);}
  planKeys(){return ['views','latest',...this.categories.flatMap(category=>[category,`${category}:latest`])];}
  publicGame(game){return {...game,coverKey:game.coverUrl?createHash('sha256').update(game.coverUrl).digest('hex'):null};}
  result(page,cached=true){return {...page,games:page.games.map(game=>this.publicGame(game)),cached,revision:this.revision};}
  local(options){
    const category=options.category||'all',sort=options.sort||'views';
    const order=this.indexes.get(category==='all'?sort:sort==='latest'?`${category}:latest`:category);
    if(!order)return null;
    const words=(options.keywords||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    // Live popularity ranks can move while pages are crawled. Keep every title
    // discovered in either complete ordering, then apply one stable local slice.
    const other=this.indexes.get(category==='all'?(sort==='views'?'latest':'views'):sort==='views'?`${category}:latest`:category);
    const ordered=[...new Set([...order.ids,...(other?.ids||[])])];
    const games=ordered.map(id=>this.records.get(id)).filter(game=>words.every(word=>game.name.toLocaleLowerCase().includes(word)));
    const window=catalogueWindow(games,options);
    return this.result({...window,complete:true,url:catalogueUrl({...options,page:window.page}),fetchedAt:order.updatedAt,stale:this.now()-order.updatedAt>=this.ttl});
  }
  async get(options={}){
    catalogueUrl(options);
    validateCollection(options.collection);
    if(this.autoWarm)this.start();
    const local=this.local(options);if(local)return local;
    if(options.category && options.category!=='all' && this.autoWarm)this.ensureIndex(options.sort==='latest'?`${options.category}:latest`:options.category).catch(error=>{if(!this.closed)this.emit('warning',error);});
    const url=catalogueUrl(options),cached=this.pages.get(url);
    if(cached)return this.result(cached);
    return this.result(await this.readPage(options,true),false);
  }
  async readPage(options,urgent=false){
    const url=catalogueUrl(options),cached=this.pages.get(url);
    if(cached && this.now()-cached.fetchedAt<this.ttl)return cached;
    return this.queue.run(url,async()=>{
      const parsed=parseCataloguePage(await readCatalogue(url,this.fetchPage,this.abort.signal),options.page||1);
      if(this.closed)throw new Error('Catalogue cache closed.');
      const page={...parsed,fetchedAt:this.now()};this.pages.set(url,page);this.remember(page.games);this.persistSoon();return page;
    },urgent);
  }
  ensureIndex(key){
    if(this.indexTasks.has(key))return this.indexTasks.get(key);
    const index=this.indexes.get(key);if(index && this.now()-index.updatedAt<this.ttl)return Promise.resolve();
    const task=(async()=>{
      const options={category:['views','latest'].includes(key)?'all':key.replace(/:latest$/,''),sort:key==='latest'||key.endsWith(':latest')?'latest':'views',keywords:''};
      const first=await this.readPage({...options,page:1});
      const pages=await Promise.all(Array.from({length:first.totalPages},(_,i)=>i===0?first:this.readPage({...options,page:i+1})));
      if(this.closed)throw new Error('Catalogue cache closed.');
      if(pages.some(page=>page.totalPages!==first.totalPages))throw new Error('PlayZip changed its catalogue during indexing. The previous cache is kept.');
      const ids=[...new Set(pages.flatMap(page=>page.games.map(game=>game.id)))];
      if(!ids.length && index?.ids.length)throw new Error('PlayZip returned an empty catalogue. The previous cache is kept.');
      this.indexes.set(key,{ids,updatedAt:this.now()});this.revision++;await this.flush();this.emit('updated',{revision:this.revision,index:key,games:ids.length});
    })().finally(()=>this.indexTasks.delete(key));
    this.indexTasks.set(key,task);return task;
  }
  start(){
    if(this.closed)return Promise.resolve();if(this.warming)return this.warming;
    this.warming=(async()=>{for(const key of this.planKeys()){if(this.closed)break;await this.ensureIndex(key);}})()
      .catch(error=>{if(!this.closed)this.emit('warning',error);}).finally(()=>{this.warming=null;});
    return this.warming;
  }
  persistSoon(){if(this.saveTimer)return;this.saveTimer=setTimeout(()=>{this.saveTimer=null;this.flush().catch(error=>this.emit('warning',error));},1000);this.saveTimer.unref?.();}
  flush(){
    clearTimeout(this.saveTimer);this.saveTimer=null;
    const content=JSON.stringify({version:1,revision:this.revision,pages:[...this.pages],indexes:[...this.indexes]});
    this.saving=this.saving.catch(()=>{}).then(async()=>{await fs.writeFile(this.file+'.tmp',content);await fs.rename(this.file+'.tmp',this.file);});
    return this.saving;
  }
  async close(){this.closed=true;clearInterval(this.interval);this.abort.abort();this.queue.close();await Promise.allSettled([...this.indexTasks.values()]);await this.flush();}
}
module.exports={CatalogueCache,CatalogueQueue};
