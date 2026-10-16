const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { scanLibrary, artworkPath } = require('../electron/library.cjs');
const { autoConfigure, applySteam, importMedia, localMusic, readManifest, searchGames } = require('../electron/metadata.cjs');
const png = Buffer.from([137,80,78,71,13,10,26,10]);
const wav = Buffer.from('RIFFxxxxWAVEfmt fixture');
async function fixture(t, name = 'Example Game') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-metadata-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, name); await fs.mkdir(folder); await fs.writeFile(path.join(folder,'Game.exe'),'fixture');
  const game = (await scanLibrary(root)).games[0];
  const add = async (name, bytes) => { const target = path.join(folder,name); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes); return target; };
  return { root, folder, game, add };
}
function source({ items = [{ id:123, name:'Example Game' }], name = 'Example Game' } = {}) {
  const calls = [];
  const fetchPage = async url => {
    url=String(url); calls.push(url);
    if(url.includes('/storesearch/'))return Response.json({items});
    if(url.includes('/appdetails?'))return Response.json({123:{success:true,data:{type:'game',name,short_description:'A game description.',developers:['Studio'],genres:[{description:'Adventure'}],header_image:'https://shared.akamai.steamstatic.com/header.jpg'}}});
    return new Response(png, { headers:{'content-type':'image/png'} });
  };
  return {fetchPage,calls};
}
test('automatic setup uses a local Steam ID, caches art and finds a unique menu track', async t => {
  const {game,add,root}=await fixture(t,'Abbreviated folder');
  await add('Data/Plugins/steam_settings/steam_appid.txt','123');
  await add('Audio/MainMenu.wav',wav);
  const {fetchPage,calls}=source();
  const result=await autoConfigure(game,{fetchPage});
  assert.equal(result.metadata,true); assert.equal(result.music,true);
  assert.equal(calls.some(url=>url.includes('/storesearch/')),false);
  const saved=await readManifest(game); assert.equal(saved.steamAppId,123); assert.equal(saved.hasMusic,true); assert.equal(saved.hasCover,true); assert.equal(saved.hasHero,true); assert.equal(saved.developer,'Studio');
  const rescanned=(await scanLibrary(root)).games[0];
  assert.equal(rescanned.name,'Example Game'); assert.match(rescanned.musicUrl,/^orbit-art:.*\/music\?v=/);
  assert.equal(await fs.readFile(await artworkPath({games:[rescanned]},rescanned.id,'music'),'utf8'),wav.toString());
});
test('automatic search requires an exact unique match', async t => {
  const {game}=await fixture(t);
  const {fetchPage}=source({items:[{id:123,name:'Example Game Deluxe'},{id:456,name:'Example Game 2'}]});
  const result=await autoConfigure(game,{fetchPage,bundledMusic:true});
  assert.equal(result.needsMatch,true); assert.equal(result.metadata,false);
  const saved=await readManifest(game);assert.equal(saved.steamAppId,undefined);
  await autoConfigure(game,{bundledMusic:true,fetchPage:()=>assert.fail('Do not repeat a recent uncertain search')});
});
test('matching and refresh preserve manual artwork, soundtrack and import fields', async t => {
  const {game,add}=await fixture(t);
  await add('.orbit-game.json',JSON.stringify({version:1,name:game.name,playzipId:'42'}));
  const picture=await add('chosen.png',png);const music=await add('my-theme.wav',wav);
  await importMedia(game,'cover',picture);await importMedia(game,'music',music);
  const {fetchPage,calls}=source();await applySteam(game,123,{fetchPage,replace:true});
  const saved=await readManifest(game);assert.equal(saved.playzipId,'42');assert.equal(saved.assetSources.cover,'file');assert.equal(saved.musicTitle,'my-theme');
  assert.equal(calls.some(url=>url.includes('library_600x900')),false);
});
test('ambiguous menu tracks are offered without automatically choosing one', async t => {
  const {game,add}=await fixture(t);
  await add('Audio/MainMenu1.wav',wav);await add('Audio/MainMenu2.wav',wav);await add('Audio/sfx_theme.wav',wav);
  assert.equal((await localMusic(game)).length,2);
  const {fetchPage}=source({items:[]});await autoConfigure(game,{fetchPage});
  assert.equal((await readManifest(game)).hasMusic,undefined);
});
test('media imports reject executable content, unsupported images and outside discovered tracks', async t => {
  const {game,add,root}=await fixture(t);
  const bad=await add('bad.png','<svg><script>alert(1)</script></svg>');
  await assert.rejects(importMedia(game,'cover',bad),/JPG, PNG or WebP/);
  const exe=await add('fake.mp3','MZ executable');await assert.rejects(importMedia(game,'music',exe),/MP3, OGG/);
  const outside=path.join(root,'outside.wav');await fs.writeFile(outside,wav);await assert.rejects(importMedia(game,'music',outside,{discovered:true}),/inside this game/);
  await assert.rejects(importMedia(game,'../outside',bad),/Invalid media/);
});
test('linked artwork directories cannot redirect writes outside the game', async t => {
  const {game,add,root,folder}=await fixture(t);
  const outside=path.join(root,'outside');await fs.mkdir(outside);
  await fs.symlink(outside,path.join(folder,'.orbit-assets'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(importMedia(game,'cover',await add('cover.png',png)),/inside the game/);
  assert.deepEqual(await fs.readdir(outside),[]);
});
test('search returns a bounded set and rejects untrusted image hosts', async () => {
  const results=await searchGames('Example',async()=>Response.json({items:[{id:123,name:'Example',tiny_image:'https://evil.example/p.png'},{id:'not-id',name:'Invalid'}]}));
  assert.deepEqual(results,[{id:123,name:'Example',image:null}]);
  await assert.rejects(searchGames('x'.repeat(201)),/200 characters/);
});
