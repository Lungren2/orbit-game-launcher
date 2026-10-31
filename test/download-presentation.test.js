import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadGames, pendingDownloads, installedDownload, downloadStatus, downloadActions, downloadMarkup, sameDownload} from '../src/downloads.js';
const job=(id,status='downloading',extra={})=>({id,status,root:'D:\\Games',game:{id:'42',name:'Same title'},received:50,total:100,...extra});

test('pending cards have isolated identities and never acquire launch fields',()=>{
  const [entry]=downloadGames([job('one')],[],'d:/games/');
  assert.equal(entry.id,'download-one');assert.equal(entry.download.id,'one');
  for(const field of ['executable','aumid','launchUri','folder'])assert.equal(entry[field],undefined);
  for(const status of ['downloading','paused','interrupted','queued','extracting','importing','ready','failed','needs-attention','needs-executable'])assert.equal(downloadGames([job(status,status)],[]).length,1);
  assert.equal(downloadGames([job('c','cancelled')],[]).length,0);
});

test('only verified library identity replaces pending cards, not transfer completion or names',()=>{
  const pending=job('one','ready',{downloadComplete:true,folder:'D:\\Games\\New game',gameId:'local'});
  assert.equal(downloadGames([pending],[{id:'different',name:'Same title'}]).length,1);
  for(const installed of [{id:'local'},{id:'other',folder:'d:/games/new GAME/'},{id:'other',playzipId:42}])assert.equal(installedDownload(pending,[installed]),installed);
  assert.equal(downloadGames([pending],[{id:'local'}]).length,0);
  assert.equal(pendingDownloads([job('one'),job('two','paused')],[]).length,1);
  assert.equal(pendingDownloads([job('one'),job('two','paused',{game:{id:'43',name:'Same title'}})],[]).length,2);
  assert.equal(pendingDownloads([job('one')],[],'E:\\Games').length,0);
});

test('status distinguishes transfer from install phases, unknown totals and recovery controls',()=>{
  assert.equal(downloadStatus(job('one')).percent,50);
  assert.equal(downloadStatus(job('one','downloading',{total:0})).percent,null);
  assert.equal(downloadStatus(job('one','extracting')).percent,null);
  assert.equal(downloadStatus(job('one','downloading',{received:999})).percent,100);
  assert.deepEqual(downloadActions(job('one','paused',{live:true})),[['resume','Resume'],['cancel','Cancel'],['delete','Delete download']]);
  assert.deepEqual(downloadActions(job('one','failed',{downloadComplete:true})),[['retry','Retry installation'],['delete','Delete download']]);
  assert.ok(downloadActions(job('one','ready')).every(([action])=>!['play','folder'].includes(action)));
  assert.ok(downloadActions(job('one','ready')).some(([action])=>action==='reimport'));
  assert.ok(downloadActions(job('one','interrupted')).some(([action])=>action==='restart'));
  assert.match(downloadMarkup(job('one','ready'),s=>s),/Not in library/);assert.doesNotMatch(downloadMarkup(job('one','ready'),s=>s),/<progress/);
});

test('legacy local identities and shared filenames never merge unrelated general imports',()=>{
  const a=job('a','queued',{game:{id:'local',name:'Archive A'}}),b=job('b','queued',{game:{id:'local',name:'Archive B'}});
  assert.equal(pendingDownloads([a,b],[]).length,2);
  assert.equal(pendingDownloads([a,{...b,game:{...b.game,name:'Archive A'}}],[]).length,2);
  assert.equal(installedDownload(b,[{id:'installed-a',folder:'D:/Games/Archive A',playzipId:'local'}]),undefined);
  assert.equal(sameDownload(a,b),false);
  assert.equal(sameDownload(job('old','ready'),job('new')),true);
  assert.equal(installedDownload({...b,folder:'D:/Games/Archive B'},[{id:'installed-b',folder:'d:\\games\\archive b'}]).id,'installed-b');
});
