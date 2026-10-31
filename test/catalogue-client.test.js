import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogueClient} from '../src/lib/catalogue-client.js';
import {parseCatalogue} from '../src/catalogue-data.js';

const page=(number=1)=>({games:[{id:String(number),name:`Game ${number}`,url:`https://playzip.com/game/${number}`}],page:number,totalPages:4});
const options={page:1,keywords:'',category:'all',sort:'views'};

test('renderer cache coalesces paging and reuses parsed results when routes reopen',async()=>{
  let calls=0;const client=createCatalogueClient({read:async input=>{calls++;return page(input.page);},parse:parseCatalogue});
  const [a,b]=await Promise.all([client.load(options),client.load(options)]);assert.equal(a,b);assert.equal(calls,1);
  assert.equal(client.peek(options),a);assert.equal(await client.load(options),a);assert.equal(calls,1);
  await client.prefetch({...options,page:2});await client.load({...options,page:2});assert.equal(calls,2);
});

test('cache invalidation prevents a stale in-flight request from replacing new results',async()=>{
  let release;let calls=0;
  const client=createCatalogueClient({read:()=>++calls===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(page(2)),parse:parseCatalogue});
  const old=client.load(options);await Promise.resolve();client.invalidate();const fresh=await client.load(options);release(page(1));await old;
  assert.equal(client.peek(options),fresh);assert.equal(client.peek(options).page,2);
});

test('failed prefetches can be retried and clamped page responses get a canonical key',async()=>{
  let offline=true,calls=0;const client=createCatalogueClient({read:async()=>{calls++;if(offline)throw Error('Offline');return page(2);},parse:parseCatalogue});
  assert.equal(await client.prefetch({...options,page:4}),null);offline=false;
  await client.load({...options,page:4});assert.equal(client.peek({...options,page:2}).page,2);await client.load({...options,page:2});assert.equal(calls,2);
});

test('renderer page caches distinguish collection offsets and installed identities',async()=>{
  let calls=0;
  const client=createCatalogueClient({read:async()=>{calls++;return page();},parse:parseCatalogue});
  const collection={prefixCount:16,playzipIds:['42'],steamIds:[]};
  await client.load({...options,collection});await client.load({...options,collection});assert.equal(calls,1);
  await client.load({...options,collection:{...collection,prefixCount:17}});assert.equal(calls,2);
  await client.load({...options,collection:{...collection,playzipIds:['43']}});assert.equal(calls,3);
});
