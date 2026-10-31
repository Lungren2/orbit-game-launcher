const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { parseKeyValues, scanSteam } = require('../electron/steam-library.cjs');
const { scanPlatforms, mergeGames } = require('../electron/platform-library.cjs');
const { scanLibrary, launchGame } = require('../electron/library.cjs');
const { importMedia, autoConfigure } = require('../electron/metadata.cjs');

const vdf = object => Object.entries(object).map(([key, value]) => `${JSON.stringify(key)} ${typeof value === 'object' ? `{\n${vdf(value)}\n}` : JSON.stringify(String(value))}`).join('\n');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-steam-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const steam = path.join(root, 'Steam'), extra = path.join(root, 'Other library');
  for (const library of [steam, extra]) await fs.mkdir(path.join(library, 'steamapps/common'), { recursive: true });
  const options = { cacheDirectory: path.join(root, 'cache'), steamDirectories: [steam], epicDirectory: path.join(root, 'no-epic'), getXbox: async () => [] };
  async function manifest(id, data = {}, library = steam) {
    const fields = { appid: id, name: 'Steam fixture', StateFlags: '4', installdir: `Game ${id}`, ...data };
    const file = path.join(library, `steamapps/appmanifest_${id}.acf`);
    await fs.writeFile(file, vdf({ AppState: fields }));
    return file;
  }
  async function install(id, data = {}, library = steam) {
    const folder = path.join(library, 'steamapps/common', data.installdir || `Game ${id}`);
    await fs.mkdir(folder, { recursive: true });
    await manifest(id, data, library);
    return folder;
  }
  return { root, steam, extra, options, manifest, install };
}

test('parses nested Steam KeyValues, comments, escaped paths and case-insensitive keys', () => {
  const parsed = parseKeyValues('\uFEFF// comment\n' + vdf({ AppState: { Name: 'A "quoted" game', installdir: 'C:\\Games\\Example', nested: { key: 'value' } } }));
  assert.equal(parsed.appstate.name, 'A "quoted" game');
  assert.equal(parsed.appstate.installdir, 'C:\\Games\\Example');
  assert.equal(parsed.appstate.nested.key, 'value');
  for (const invalid of ['"x" {', '"x" "unterminated', '"x" }', '}']) assert.throws(() => parseKeyValues(invalid));
  assert.throws(() => parseKeyValues('"x" {'.repeat(40)), /deeply nested/);
});

test('discovers Steam installs across modern library records, deduplicates roots and uses stable app IDs', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.steam, 'steamapps/libraryfolders.vdf'), vdf({ libraryfolders: { 0: { path: f.steam }, 1: { path: f.extra }, 2: { path: f.extra } } }));
  const folder = await f.install('123');
  await f.install('456', { name: 'Second game', StateFlags: '6' }, f.extra);
  const first = await scanPlatforms(f.options);
  assert.equal(first.games.length, 2);
  const game = first.games.find(game => game.steamAppId === 123);
  assert.equal(game.folder, await fs.realpath(folder));
  assert.equal(game.launchUri, 'steam://rungameid/123');
  assert.equal(game.needsChoice, false);
  assert.equal(game.platform, 'Steam');
  assert.equal(first.warnings.length, 0);
  const relocated = await f.install('123', {}, f.extra);
  await fs.unlink(path.join(f.steam, 'steamapps/appmanifest_123.acf'));
  const moved = (await scanPlatforms(f.options)).games.find(game => game.steamAppId === 123);
  assert.equal(moved.folder, await fs.realpath(relocated));
  assert.equal(moved.id, game.id);
});

test('supports older library records and root scanning when libraryfolders is absent or malformed', async t => {
  const f = await fixture(t);
  await f.install('123'); await f.install('456', {}, f.extra);
  assert.equal((await scanPlatforms(f.options)).games.length, 1);
  const file = path.join(f.steam, 'steamapps/libraryfolders.vdf');
  await fs.writeFile(file, '"libraryfolders" {');
  const malformed = await scanPlatforms(f.options);
  assert.equal(malformed.games.length, 1); assert.equal(malformed.warnings.length, 1);
  await fs.writeFile(file, vdf({ LibraryFolders: { TimeNextStatsReport: '123', 1: f.extra } }));
  assert.equal((await scanPlatforms(f.options)).games.length, 2);
});

test('ignores incomplete, missing, malformed, mismatched, redistributable and escaping installs', async t => {
  const f = await fixture(t);
  await f.install('123');
  await f.install('456', { StateFlags: '1026' });
  await f.install('457', { StateFlags: '36' });
  await f.manifest('458');
  await f.install('459', { appid: '999' });
  await f.install('228980');
  await f.manifest('460', { installdir: '../outside' });
  await fs.mkdir(path.join(f.steam, 'steamapps/outside'));
  await f.manifest('461', { installdir: f.root });
  const linked = path.join(f.steam, 'steamapps/common/Linked');
  await fs.symlink(f.root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await f.manifest('462', { installdir: 'Linked' });
  await fs.writeFile(path.join(f.steam, 'steamapps/appmanifest_463.acf'), '"AppState" {');
  assert.deepEqual((await scanSteam({ directories: [f.steam] })).map(game => game.steamAppId), [123]);
});

test('Steam launches through the client, validates URIs, propagates failures and rejects uninstalled records', async t => {
  const f = await fixture(t); await f.install('123');
  const game = (await scanPlatforms(f.options)).games[0];
  let opened;
  const spawn = () => assert.fail('Steam games must use the client');
  assert.equal((await launchGame(game, 'ignored.exe', spawn, async uri => { opened = uri; })).launcher, 'Steam');
  assert.equal(opened, 'steam://rungameid/123');
  for (const launchUri of ['steam://rungameid/0', 'steam://rungameid/123/extra', 'steam://rungameid/123?x=1', 'steam://install/123', 'https://example.com']) {
    await assert.rejects(launchGame({ ...game, launchUri }, null, spawn, () => assert.fail('Invalid URI opened')), /invalid/);
  }
  await assert.rejects(launchGame(game, null, spawn, async () => { throw Error('Steam unavailable'); }), /Steam unavailable/);
  await fs.unlink(game.steamManifest);
  await assert.rejects(launchGame(game, null, spawn, () => assert.fail('Uninstalled game opened')), /ENOENT/);
});

test('Steam metadata and custom art stay in Orbit cache and survive rescans', async t => {
  const f = await fixture(t); const folder = await f.install('123');
  const game = (await scanPlatforms(f.options)).games[0];
  await importMedia(game, 'cover', path.join(__dirname, '../public/brand/orbit.png'));
  const again = (await scanPlatforms(f.options)).games[0];
  assert.equal(again.hasCover, true); assert.equal(again.steamAppId, 123);
  assert.deepEqual(await fs.readdir(folder), []);
  assert.equal(again.metadataFolder, game.metadataFolder);
});

test('merged Steam installs retain local IDs, artwork and music and distinct platform copies stay separate', async t => {
  const f = await fixture(t); const folder = await f.install('123');
  await fs.writeFile(path.join(folder, 'Game.exe'), 'fixture');
  const localRoot = path.join(f.steam, 'steamapps/common');
  const local = (await scanLibrary(localRoot)).games[0];
  const result = await scanLibrary(localRoot, { platforms: true, cacheDirectory: f.options.cacheDirectory, platformOptions: f.options });
  assert.equal(result.games.length, 1); assert.equal(result.games[0].id, local.id);
  assert.equal(result.games[0].launchUri, 'steam://rungameid/123');
  assert.equal(result.games[0].steamAppId, 123);
  const steam = { name: 'Same title', folder, platform: 'Steam', steamAppId: 123, launchUri: 'steam://rungameid/123' };
  const merged = mergeGames([{ id: 'saved', name: 'Same title', folder: f.root, hasCover: true, musicTitle: 'Theme' }], [steam]);
  assert.equal(merged[0].id, 'saved'); assert.equal(merged[0].hasCover, true); assert.equal(merged[0].musicTitle, 'Theme');
  assert.equal(mergeGames([], [steam, { name: steam.name, folder: f.extra, platform: 'Epic Games', launchUri: 'epic-uri' }]).length, 2);
});

test('automatic metadata uses the discovered Steam app ID without a title search', async t => {
  const f = await fixture(t); await f.install('123', { name: 'Unusual title' });
  const game = (await scanPlatforms(f.options)).games[0];
  let details = false;
  const result = await autoConfigure(game, { bundledMusic: true, fetchPage: async url => {
    assert.ok(!String(url).includes('/storesearch/'), 'Known app IDs must not trigger title matching');
    if (String(url).includes('/appdetails?')) {
      details = true;
      return Response.json({ 123: { success: true, data: { type: 'game', name: game.name } } });
    }
    return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } });
  } });
  assert.equal(details, true); assert.equal(result.metadata, true);
});
