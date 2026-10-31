const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DownloadManager, validateGame } = require('../electron/downloads.cjs');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-download-test-'));
  let manager;
  t.after(async () => { await manager?.flush(); const real = await fs.realpath(base); assert.ok(real.startsWith(await fs.realpath(os.tmpdir()) + path.sep)); await fs.rm(real, { recursive: true, force: true }); });
  const root = path.join(base, 'Games'); await fs.mkdir(root);
  const session = new EventEmitter(); session.webRequest = { onBeforeRequest: fn => { session.beforeRequest = fn; } };
  const contents = { id: 9, mainFrame: {}, downloadURL: url => { contents.url = url; } };
  manager = new DownloadManager({ session, contents, getRoot: () => root, dataDirectory: path.join(base, 'state') });
  await manager.initialize();
  const game = { id: '226', name: 'Fixture', url: 'https://playzip.com/game/226', coverUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/library_600x900.jpg' };
  return { manager, game, contents, session, root };
}
function item(url, filename = 'Fixture.zip') {
  const value = new EventEmitter();
  Object.assign(value, { getURLChain: () => [url], getFilename: () => filename, setSavePath: p => { value.path = p; }, getTotalBytes: () => 100, getReceivedBytes: () => 50, isPaused: () => !!value.paused, canResume: () => true, pause: () => { value.paused = true; }, resume: () => { value.paused = false; }, cancel: () => value.emit('done', {}, 'cancelled') });
  return value;
}

test('delete removes only private staging and history, keeping installed and original files', async t => {
  const { manager, game, root } = await fixture(t);
  const original = path.join(root,'original.zip'), folder = path.join(root,'Installed');
  await fs.writeFile(original,'original'); await fs.mkdir(folder); await fs.writeFile(path.join(folder,'game.exe'),'game');
  const job = manager.newJob(game, root, 'Fixture.zip'); job.status = 'ready'; job.folder = folder;
  await fs.mkdir(path.dirname(job.archive), {recursive:true}); await fs.writeFile(job.archive,'archive');
  assert.deepEqual(await manager.control(job.id,'delete'),[]);
  assert.equal(await fs.readFile(original,'utf8'),'original');
  assert.equal(await fs.readFile(path.join(folder,'game.exe'),'utf8'),'game');
  await assert.rejects(fs.stat(path.dirname(job.archive)), {code:'ENOENT'});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(manager.dataDirectory,'downloads.json'),'utf8')),[]);
});

test('delete rejects forged archive paths, staging junctions and active imports', async t => {
  const { manager, game, root } = await fixture(t);
  const job = manager.newJob(game, root, 'Fixture.zip'); job.status = 'failed';
  const archive = job.archive; job.archive = path.join(root,'Other','game.zip');
  await assert.rejects(manager.control(job.id,'delete'), /Invalid download/);
  job.archive = archive; job.status = 'extracting';
  await assert.rejects(manager.control(job.id,'delete'), /Wait for installation/);
  job.status = 'queued'; manager.activeImport = job.id;
  await assert.rejects(manager.control(job.id,'delete'), /Wait for installation/);
  manager.activeImport = null; job.status = 'failed';
  const outside = path.join(root,'Outside'); await fs.mkdir(outside);
  await fs.symlink(outside,path.join(root,'.orbit-staging'),process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(manager.control(job.id,'delete'), /Invalid staging/);
});

test('deleting live downloads cancels transfer and deleting queued jobs prevents import', async t => {
  const { manager, game, root, contents, session } = await fixture(t);
  await manager.prepare(game);
  session.beforeRequest({url:'https://cdn.example/live.zip',webContentsId:9,frame:{parent:contents.mainFrame,url:game.url}},()=>{});
  const transfer = item('https://cdn.example/live.zip');
  manager.capture({preventDefault:()=>assert.fail('blocked')},transfer,contents);
  await manager.control(manager.jobs[0].id,'delete');
  assert.equal(manager.jobs.length,0); assert.equal(manager.items.size,0);
  let release; manager.importTail = new Promise(resolve => { release = resolve; });
  let imported = false; manager.importer = async () => { imported = true; throw new Error('Unexpected import'); };
  const queued = manager.newJob(game,root,'Queued.zip');
  manager.enqueue(queued);
  await manager.control(queued.id,'delete'); release(); await manager.importTail;
  assert.equal(imported,false); assert.equal(manager.jobs.length,0);
});

test('delete cleans only an unfinished HatchZip destination owned by its transaction', async t => {
  const { manager, game, root } = await fixture(t);
  const job = manager.newJob(game,root,'Fixture.zip'); job.status = 'failed';
  const directory = path.dirname(job.archive), destination = path.join(root,'Unfinished');
  const token = require('node:crypto').randomUUID();
  await fs.mkdir(directory,{recursive:true}); await fs.mkdir(destination);
  await fs.writeFile(path.join(destination,'.orbit-installing'),'different-owner');
  await fs.writeFile(path.join(directory,'.orbit-import.json'),JSON.stringify({version:1,root:await fs.realpath(root),archive:job.archive,phase:'installing',destination,token}));
  await assert.rejects(manager.control(job.id,'delete'), /no longer belongs/);
  assert.ok(await fs.stat(destination)); assert.equal(manager.jobs.length,1);
  await fs.writeFile(path.join(destination,'.orbit-installing'),token);
  await manager.control(job.id,'delete');
  await assert.rejects(fs.stat(destination),{code:'ENOENT'});
  assert.equal(manager.jobs.length,0);
});
test('rejects unrelated downloads and only tracks a prepared game frame', async t => {
  const { manager, game, contents, session } = await fixture(t);
  let prevented = false;
  manager.capture({ preventDefault: () => { prevented = true; } }, item('https://cdn.example/file.zip'), contents);
  assert.equal(prevented, true); assert.equal(manager.jobs.length, 0);
  const token = await manager.prepare(game);
  session.beforeRequest({ url: 'https://cdn.example/file.zip', webContentsId: 9, frame: { parent: contents.mainFrame, url: game.url } }, () => {});
  manager.clear(token); // Headers may arrive after the game modal is closed.
  const download = item('https://cdn.example/file.zip');
  manager.capture({ preventDefault: () => assert.fail('valid download blocked') }, download, contents);
  assert.match(download.path, /\.orbit-staging/);
  const job = manager.jobs[0];
  await manager.control(job.id, 'pause'); assert.equal(job.status, 'paused');
  await manager.control(job.id, 'resume'); assert.equal(job.status, 'downloading');
  await manager.control(job.id, 'cancel'); assert.equal(job.status, 'cancelled');
  manager.clear(token); assert.equal(manager.context, null);
});
test('download-page popups become managed downloads rather than windows', async t => {
  const { manager, game, contents } = await fixture(t); await manager.prepare(game);
  contents.mainFrame.frames = [{ parent: contents.mainFrame, url: 'https://playzip.com/download/226' }];
  assert.equal(manager.popup({ url: 'https://files.example/game.zip', referrer: { url: 'https://playzip.com/download/226' } }), true);
  assert.equal(contents.url, 'https://files.example/game.zip');
  assert.equal(manager.popup({ url: 'https://files.example/game.zip', referrer: { url: 'https://playzip.com/' } }), true);
  assert.equal(manager.popup({ url: 'file:///C:/something', referrer: { url: 'https://playzip.com/download/226' } }), false);
  assert.equal(manager.popup({ url: 'https://files.example/game.zip', referrer: { url: 'https://ads.example/' } }), false);
  const executable = item(contents.url, 'setup.exe');
  let prevented = false; manager.capture({ preventDefault: () => { prevented = true; } }, executable, contents);
  assert.equal(prevented, true); assert.equal(manager.jobs[0].status, 'needs-attention');
});
test('catalogue metadata cannot supply arbitrary artwork URLs or game paths', () => {
  assert.throws(() => validateGame({ id: '../x', name: 'x', url: 'https://playzip.com/game/../x' }));
  const game = validateGame({ id: '1', name: 'Game', url: 'https://playzip.com/game/1', coverUrl: 'http://127.0.0.1/secrets' });
  assert.equal(game.coverUrl, null); assert.equal(game.steamAppId, null);
});
test('restart preserves completed archive metadata and marks unfinished transfers interrupted', async t => {
  const { manager, game, root } = await fixture(t);
  const job = manager.newJob(game, root, 'Fixture.zip'); job.status = 'extracting'; job.downloadComplete = true;
  await manager.flush();
  const session = new EventEmitter(); session.webRequest = { onBeforeRequest: () => {} };
  const restored = new DownloadManager({ session, contents: { id: 10, mainFrame: {} }, getRoot: () => root, dataDirectory: manager.dataDirectory });
  await restored.initialize();
  assert.equal(restored.jobs.length, 1); assert.equal(restored.jobs[0].status, 'interrupted'); assert.equal(restored.jobs[0].downloadComplete, true);
});

test('Retry installation finishes a HatchZip transaction even after its archive is consumed', async t => {
  const { manager, game, root } = await fixture(t);
  const { importArchive, run7zip } = require('../electron/importer.cjs');
  const source = path.join(path.dirname(root), 'source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source,'Fixture.exe'),'MZ-retry-fixture-not-executed');
  const archive = path.join(path.dirname(root),'fixture.zip');
  await run7zip(['a','-tzip','-y',archive,path.join(source,'*')]);
  manager.importer = options => importArchive({ ...options, artwork:false, onState: state => { options.onState(state); if(state === 'importing') throw new Error('Interrupted after extraction'); } });
  const id = await manager.addArchive(archive,game); await manager.importTail;
  const job = manager.jobs.find(job => job.id === id);
  assert.equal(job.status,'failed');
  await assert.rejects(fs.stat(job.archive),{code:'ENOENT'});
  assert.ok((await fs.stat(archive)).isFile(),'The manually chosen source is retained');
  manager.importer = options => importArchive({ ...options, artwork:false });
  await manager.control(id,'retry'); await manager.importTail;
  assert.equal(job.status,'ready'); assert.equal(job.extractionEngine,'hatchzip');
  assert.equal(await fs.readFile(path.join(job.folder,'Fixture.exe'),'utf8'),'MZ-retry-fixture-not-executed');
});

test('job history is durable before a fast completed archive reaches the consuming importer', async t => {
  const { manager, game, root } = await fixture(t);
  const archive = path.join(path.dirname(root),'fast.zip'); await fs.writeFile(archive,'fixture');
  let observed = false;
  manager.importer = async options => {
    const stored = JSON.parse(await fs.readFile(path.join(manager.dataDirectory,'downloads.json'),'utf8'));
    const job = stored.find(job => job.archive === options.archive);
    assert.equal(job.downloadComplete,true); assert.equal(options.spaceSaving,true); observed=true;
    throw new Error('Fixture stops before extraction');
  };
  await manager.addArchive(archive,game); await manager.importTail;
  assert.equal(observed,true);
});
