const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { scanPlatforms, mergeGames } = require('../electron/platform-library.cjs');
const { launchGame, artworkPath } = require('../electron/library.cjs');
const { importMedia } = require('../electron/metadata.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-platform-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const epicDirectory = path.join(root, 'manifests'), cacheDirectory = path.join(root, 'cache'), folder = path.join(root, 'XboxGame');
  await Promise.all([epicDirectory, folder, cacheDirectory].map(dir => fs.mkdir(dir)));
  const getXbox = async () => [{ name: 'Xbox fixture', folder, aumid: 'Studio.Game_123abc!Game', fallbackCover: 'cover.png' }];
  return { root, folder, epicDirectory, cacheDirectory, getXbox, steamDirectories: [] };
}

test('discovers installed Epic games and excludes incomplete, DLC, missing and escaping entries', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.folder, 'Game.exe'), 'fixture');
  const valid = { AppName: 'fixture', DisplayName: 'Epic fixture', InstallLocation: f.folder, LaunchExecutable: 'Game.exe', CatalogNamespace: 'namespace', CatalogItemId: 'item' };
  const manifests = [valid, { ...valid, bIsIncompleteInstall: true }, { ...valid, bIsApplication: false }, { ...valid, LaunchExecutable: '../Other.exe' }, { ...valid, LaunchExecutable: 'Missing.exe' }];
  for (let i = 0; i < manifests.length; i++) await fs.writeFile(path.join(f.epicDirectory, `${i}.item`), JSON.stringify(manifests[i]));
  const result = await scanPlatforms({ ...f, getXbox: async () => [] });
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0].launchUri, 'com.epicgames.launcher://apps/namespace%3Aitem%3Afixture?action=launch&silent=true');
  let opened;
  await launchGame(result.games[0], null, () => assert.fail('must use Epic authentication'), async uri => { opened = uri; });
  assert.equal(opened, result.games[0].launchUri);
});

test('merges launcher records without losing existing game IDs, artwork or music', () => {
  const local = { id: 'existing', name: 'Fortnite', folder: 'D:/Games/Fortnite', hasCover: true, musicTitle: 'Theme', needsChoice: true };
  const result = mergeGames([local], [{ name: 'Fortnite', folder: 'C:/Epic/Fortnite', platform: 'Epic Games', launchUri: 'epic-uri' }]);
  assert.equal(result.length, 1); assert.equal(result[0].id, 'existing');
  assert.equal(result[0].hasCover, true); assert.equal(result[0].musicTitle, 'Theme');
  assert.equal(result[0].launchUri, 'epic-uri'); assert.equal(result[0].needsChoice, false);
});

test('Xbox games launch through their registered AUMID without selecting an executable', async t => {
  const f = await fixture(t);
  const { games } = await scanPlatforms(f);
  let captured;
  const result = await launchGame(games[0], null, (file, args, options) => {
    captured = { file, args, options };
    const child = new EventEmitter(); child.pid = 42; child.unref = () => {};
    queueMicrotask(() => child.emit('spawn')); return child;
  });
  assert.equal(result.launcher, 'Xbox');
  assert.deepEqual(captured.args, ['shell:AppsFolder\\Studio.Game_123abc!Game']);
  assert.equal(captured.options.shell, false);
  await assert.rejects(launchGame({ ...games[0], aumid: 'bad!id;command' }), /registration is invalid/);
});

test('Xbox artwork is read locally and custom artwork writes only to Orbit cache', async t => {
  const f = await fixture(t);
  const image = await fs.readFile(path.join(__dirname, '../public/brand/orbit.png'));
  await fs.writeFile(path.join(f.folder, 'cover.png'), image);
  const { games } = await scanPlatforms(f);
  const game = games[0];
  assert.equal(await artworkPath({ games }, game.id, 'cover'), await fs.realpath(path.join(f.folder, 'cover.png')));
  await importMedia(game, 'cover', path.join(f.folder, 'cover.png'));
  assert.equal(await fs.stat(path.join(f.folder, '.orbit-assets')).then(() => true).catch(() => false), false);
  assert.equal(await artworkPath({ games }, game.id, 'cover'), path.join(game.metadataFolder, '.orbit-assets', 'cover'));
  const again = await scanPlatforms(f);
  assert.equal(again.games[0].id, game.id); assert.equal(again.games[0].hasCover, true);
});

test('Xbox discovery failure remains nonfatal and malformed registrations are excluded', async t => {
  const f = await fixture(t);
  const failed = await scanPlatforms({ ...f, getXbox: async () => { throw Error('Unavailable'); } });
  assert.equal(failed.warnings.length, 1);
  const invalid = await scanPlatforms({ ...f, getXbox: async () => [{ name: 'bad', folder: f.folder, aumid: '../bad' }] });
  assert.equal(invalid.games.length, 0);
});
