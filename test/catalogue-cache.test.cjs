const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {CatalogueCache,CatalogueQueue}=require('../electron/catalogue-cache.cjs');
const {CatalogueCovers}=require('../electron/catalogue-covers.cjs');
const {parseCataloguePage}=require('../electron/catalogue-parser.cjs');

const ids=Array.from({length:35},(_,i)=>String(i+1));
const html=(games,page=1,total=1)=>`<div class="games_content">${games.map(id=>`<a class="game_item" href="/game/${id}"><div><img data-src="https://cdn.steamstatic.com/steam/apps/${id}/cover.jpg" alt="Game ${id}"></div></a>`).join('')}</div><div class="pagination"><a>${page}/${total}</a></div>`;
const response=body=>new Response(body,{headers:{'content-type':'text/html'}});
const fetcher=(calls,fail=()=>false)=>async url=>{
  const parsed=new URL(url);calls.push(url);
  if(fail(parsed))throw Error('Fixture offline');
  let games=parsed.pathname==='/category/action'?ids.filter(id=>Number(id)%2):[...ids];
  if(parsed.searchParams.get('sort')==='latest')games.reverse();
  const page=Number(parsed.searchParams.get('page')||1),total=Math.ceil(games.length/30);
  return response(html(games.slice((page-1)*30,page*30),page,total));
};
async function fixture(t,options={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-catalogue-'));
  const instances=[];
  const create=async extra=>{const store=new CatalogueCache({directory,autoWarm:false,categories:['action'],...options,...extra});instances.push(store);await store.initialize();return store;};
  t.after(async()=>{for(const store of instances)await store.close();const real=await fs.realpath(directory);assert.ok(real.startsWith(await fs.realpath(os.tmpdir())+path.sep));await fs.rm(real,{recursive:true,force:true});});
  return {directory,create};
}

test('catalogue parser decodes names, validates pagination and never treats scripts as cards',()=>{
  const page=parseCataloguePage({html:'<script>"<a class=game_item href=/game/999>"</script><div class="games_content"><a href="/game/42" class="game_item"><img alt="A &amp; B &#x96EA;" data-src="https://cdn.steamstatic.com/steam/apps/17/a.jpg"></a><a class="game_item" href="/game/43"><img alt="Unsafe cover" src="http://127.0.0.1/secrets"></a></div><div class="pagination"><a>2 / 3</a></div>',url:'https://playzip.com'},2);
  assert.equal(page.games.length,2);assert.equal(page.games[0].name,'A & B 雪');assert.equal(page.games[0].steamAppId,17);assert.equal(page.games[1].coverUrl,null);
  assert.throws(()=>parseCataloguePage({html:html(['1'],1,3)},2),/wrong catalogue page/);
  assert.throws(()=>parseCataloguePage({html:html(['1'],1,1001)}),/invalid pagination/);
  assert.throws(()=>parseCataloguePage({html:'<style>.games_content{color:red}</style>'}),/format has changed/);
});

test('full cache serves both orders, genres, searches and clamped pages without network',async t=>{
  const calls=[],{create}=await fixture(t),cache=await create({fetchPage:fetcher(calls)});
  await cache.start();assert.equal(calls.length,6);
  const count=calls.length;
  assert.deepEqual((await cache.get({page:2})).games.map(game=>game.id),['31','32','33','34','35']);
  assert.equal((await cache.get({sort:'latest'})).games[0].id,'35');
  const action=await cache.get({category:'action',sort:'latest'});assert.equal(action.games.length,18);assert.equal(action.games[0].id,'35');
  assert.equal((await cache.get({keywords:'GAME 35'})).games[0].id,'35');
  assert.equal((await cache.get({page:999})).page,2);assert.equal((await cache.get({keywords:'missing'})).totalPages,1);
  assert.match((await cache.get({})).games[0].coverKey,/^[a-f0-9]{64}$/);assert.equal(calls.length,count);
});

test('a full catalogue remains available after restart with the network offline',async t=>{
  const calls=[],{create}=await fixture(t),cache=await create({fetchPage:fetcher(calls)});await cache.start();await cache.close();
  let requests=0;const restored=await create({fetchPage:async()=>{requests++;throw Error('Offline');}});
  const result=await restored.get({page:2});assert.equal(result.games.length,5);assert.equal(result.complete,true);
  assert.equal((await restored.get({category:'action',keywords:'35',sort:'latest'})).games[0].id,'35');assert.equal(requests,0);
});

test('library pages count installed games before slicing and omit their catalogue copies',async t=>{
  const {create}=await fixture(t),cache=await create({fetchPage:fetcher([])});await cache.start();
  const catalogueIds=Array.from({length:135},(_,i)=>String(i+1));
  for(const id of catalogueIds.slice(35))cache.records.set(id,{id,name:`Game ${id}`,url:`https://playzip.com/game/${id}`});
  cache.indexes.get('views').ids=catalogueIds;
  const collection={prefixCount:16,playzipIds:['1'],steamIds:['2']};
  const first=await cache.get({page:1,collection}),second=await cache.get({page:2,collection});
  assert.equal(first.games.length+first.prefixEnd-first.prefixStart,100);
  assert.equal(first.totalGames,149);assert.equal(first.totalPages,2);
  assert.equal(first.prefixStart,0);assert.equal(first.prefixEnd,16);
  assert.equal(second.prefixStart,16);assert.equal(second.prefixEnd,16);
  assert.equal(second.games.length,49);
  const combined=[...first.games,...second.games].map(game=>game.id);
  assert.deepEqual(combined,catalogueIds.slice(2));assert.equal(new Set(combined).size,combined.length);
  const last=await cache.get({page:999,collection});assert.equal(last.page,2);
  // Ordinary catalogue consumers keep the original 30-game pages.
  assert.equal((await cache.get({page:1})).games.length,30);
});

test('installed collections spanning multiple pages keep full rows before the catalogue begins',async t=>{
  const {create}=await fixture(t),cache=await create({fetchPage:fetcher([])});await cache.start();
  const collection={prefixCount:246,playzipIds:[],steamIds:[]};
  const pages=await Promise.all([1,2,3].map(page=>cache.get({page,collection})));
  assert.deepEqual(pages.map(page=>page.games.length+page.prefixEnd-page.prefixStart),[100,100,81]);
  assert.deepEqual(pages.flatMap(page=>page.games.map(game=>game.id)),ids);
  await assert.rejects(()=>cache.get({collection:{...collection,prefixCount:-1}}),/Invalid library pagination/);
});

test('live ranking overlaps cannot hide titles found in another complete order or genre',async t=>{
  const {create}=await fixture(t),cache=await create({fetchPage:fetcher([])});await cache.start();
  cache.records.set('36',{id:'36',name:'Game 36',url:'https://playzip.com/game/36',coverUrl:null});cache.indexes.get('latest').ids.unshift('36');
  assert.equal((await cache.get({})).totalGames,36);assert.equal((await cache.get({page:2})).games.at(-1).id,'36');
  cache.records.set('37',{id:'37',name:'Genre-only title',url:'https://playzip.com/game/37',coverUrl:null});cache.indexes.get('action').ids.push('37');
  assert.equal((await cache.get({category:'action',keywords:'Genre-only'})).games[0].id,'37');
});

test('failed refreshes keep the previous complete index and cached pages usable',async t=>{
  let now=1000,offline=false;const calls=[],{create}=await fixture(t),cache=await create({ttl:1000,now:()=>now,fetchPage:fetcher(calls,url=>offline && url.searchParams.get('page')==='2')});
  await cache.start();const previous=cache.indexes.get('views');now+=2000;offline=true;await cache.start();
  assert.equal(cache.indexes.get('views'),previous);const result=await cache.get({page:2});assert.equal(result.page,2);assert.equal(result.games.length,5);assert.equal(result.stale,true);
});

test('interrupted initial indexing resumes persisted pages rather than starting over',async t=>{
  const calls=[],{create}=await fixture(t),first=await create({fetchPage:fetcher(calls,url=>url.searchParams.get('page')==='2')});
  await first.start();assert.equal(first.indexes.has('views'),false);await first.close();
  const resumedCalls=[],second=await create({fetchPage:fetcher(resumedCalls)});await second.start();
  assert.equal(second.indexes.get('views').ids.length,35);
  assert.ok(!resumedCalls.some(url=>{const value=new URL(url);return value.pathname==='/'&&value.searchParams.get('sort')==='views'&&value.searchParams.get('page')==='1';}));
});

test('foreground page requests retain capacity while background indexing runs',async()=>{
  const queue=new CatalogueQueue(),started=[],release=[];
  const background=id=>queue.run(id,()=>{started.push(id);return new Promise(resolve=>release.push(resolve));},false);
  const a=background('a'),b=background('b'),c=background('c');
  await queue.run('foreground',async()=>{started.push('foreground');return 1;});
  assert.deepEqual(started,['a','b','foreground']);release.splice(0).forEach(resolve=>resolve());await Promise.all([a,b]);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(started.at(-1),'c');release.splice(0).forEach(resolve=>resolve());await c;queue.close();
});

test('posters are coalesced and persisted, and redirects cannot escape trusted image hosts',async t=>{
  const {directory}=await fixture(t),image=Buffer.from([255,216,255,1,2,3]),game={coverUrl:'https://cdn.steamstatic.com/a.jpg'};let calls=0;
  const covers=new CatalogueCovers({directory:path.join(directory,'covers'),getGame:()=>game,fetchImage:async()=>{calls++;return new Response(image,{headers:{'content-type':'image/jpeg'}});}});
  const [a,b]=await Promise.all([covers.get('1'),covers.get('1')]);assert.deepEqual(a,image);assert.deepEqual(b,image);assert.equal(calls,1);covers.close();
  const restored=new CatalogueCovers({directory:path.join(directory,'covers'),getGame:()=>game,fetchImage:async()=>{throw Error('Offline');}});
  assert.deepEqual(await restored.get('1'),image);
  assert.deepEqual(await restored.get('1',true,160),image,'Tiny previews reuse the saved source offline');
  assert.deepEqual(await restored.get('1',true,'full'),image,'Full resolution preserves the original bytes offline');restored.close();
  const unsafe=new CatalogueCovers({directory:path.join(directory,'unsafe'),getGame:()=>game,fetchImage:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})});
  await assert.rejects(unsafe.get('1'),/Invalid catalogue cover redirect/);await assert.rejects(unsafe.get('../1'),/Invalid catalogue cover/);unsafe.close();
});
