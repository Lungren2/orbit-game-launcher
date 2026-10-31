const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { importArchive, validateListing, run7zip } = require('../electron/importer.cjs');
const { scanLibrary } = require('../electron/library.cjs');

async function fixture(t, extension = 'zip') {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-import-test-'));
  t.after(async () => { const real = await fs.realpath(base); assert.ok(real.startsWith(await fs.realpath(os.tmpdir()) + path.sep)); await fs.rm(real, { recursive: true, force: true }); });
  const root = path.join(base, 'Games'), source = path.join(base, 'source');
  await fs.mkdir(root); await fs.mkdir(path.join(source, 'Wrapper/Binaries/Win64'), { recursive: true });
  await fs.writeFile(path.join(source, 'Wrapper/Binaries/Win64/Fixture.exe'), 'MZ-fake-game-never-executed');
  await fs.writeFile(path.join(source, 'Wrapper/UnityCrashHandler64.exe'), 'not a game');
  const archive = path.join(base, `Fixture.${extension}`);
  await run7zip(['a', `-t${extension}`, '-y', archive, path.join(source, '*')]);
  return { root, archive };
}
test('imports ZIP and 7z wrappers, preserves metadata, and ignores staging', async t => {
  for (const extension of ['zip', '7z']) {
    const { root, archive } = await fixture(t, extension);
    const states = [];
    const imported = await importArchive({ archive, root, game: { id: '1', name: 'Fixture', steamAppId: 413150, coverUrl: null }, artwork: false, onState: state => states.push(state) });
    const library = await scanLibrary(root);
    assert.equal(library.games.length, 1);
    assert.equal(library.games[0].name, 'Fixture');
    assert.equal(library.games[0].imported, true);
    assert.equal(library.games[0].steamAppId, 413150);
    assert.equal(library.games[0].needsChoice, false);
    assert.match(library.games[0].executable, /Wrapper[\\/]Binaries[\\/]Win64[\\/]Fixture.exe$/);
    assert.equal(library.games[0].folder, imported.folder);
    assert.deepEqual(states, ['extracting','importing']);
    assert.equal(await fs.readFile(library.games[0].executable, 'utf8'), 'MZ-fake-game-never-executed');
  }
});
test('does not overwrite an existing game folder', async t => {
  const { root, archive } = await fixture(t);
  await fs.mkdir(path.join(root, 'Fixture')); await fs.writeFile(path.join(root, 'Fixture/keep.txt'), 'preserved');
  const imported = await importArchive({ archive, root, game: { id: '1', name: 'Fixture' }, artwork: false });
  assert.equal(path.basename(imported.folder), 'Fixture (2)');
  assert.equal(await fs.readFile(path.join(root, 'Fixture/keep.txt'), 'utf8'), 'preserved');
});

test('general archives do not persist the local sentinel as a catalogue identity', async t => {
  const {root,archive}=await fixture(t);
  const imported=await importArchive({archive,root,game:{id:'local',name:'Fixture'},artwork:false});
  const metadata=JSON.parse(await fs.readFile(path.join(imported.folder,'.orbit-game.json'),'utf8'));
  assert.equal(metadata.playzipId,null);
  assert.equal((await scanLibrary(root)).games[0].playzipId,null);
});
test('rejects traversal, absolute paths, alternate streams, links, reserved names, and collisions', () => {
  for (const name of ['../evil.exe', 'C:\\evil.exe', '/evil', '\\\\server\\file', 'name:stream', 'CON.txt', 'folder./game.exe', '.orbit-game.json']) assert.throws(() => validateListing(`Path = ${name}\nSize = 1\nAttributes = A\n`));
  assert.throws(() => validateListing('Path = link\nSize = 1\nSymbolic Link = ../outside\n'), /links/);
  assert.throws(() => validateListing('Path = game.exe\nSize = 1\n\nPath = GAME.EXE\nSize = 2\n'), /duplicate/);
  assert.throws(() => validateListing('Path = folder\nSize = 1\nAttributes = A\n\nPath = folder/game.exe\nSize = 1\n'), /conflicting/);
  assert.throws(() => validateListing('Path = game.exe\nSize = 100\n', 99), /free disk/);
  assert.throws(() => validateListing('Path = game.exe\nSize = 1\nEncrypted = +\n'), /password/);
  assert.throws(() => validateListing('Path = game.exe\nPath = other.exe\nSize = 1\n'), /ambiguous/);
});
test('rejects non-archives without creating a visible game', async t => {
  const { root, archive } = await fixture(t);
  await fs.writeFile(archive, 'this is not a zip');
  await assert.rejects(importArchive({ archive, root, game: { id: '1', name: 'Fixture' }, artwork: false }), /complete ZIP/);
  assert.equal((await scanLibrary(root)).games.length, 0);
});
