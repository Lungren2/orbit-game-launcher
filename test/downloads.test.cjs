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
