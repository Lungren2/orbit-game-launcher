const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
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

const vint = value => { const bytes = []; do { let byte = value & 127; value = Math.floor(value / 128); if (value) byte |= 128; bytes.push(byte); } while (value); return Buffer.from(bytes); };
const u32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value >>> 0); return bytes; };
const rarHeader = body => { const sized = Buffer.concat([vint(body.length), body]); return Buffer.concat([u32(zlib.crc32(sized)), sized]); };
// Builds a stored RAR5 archive, since no RAR writer can be redistributed.
function rar5(files, { volume = false } = {}) {
  const blocks = files.flatMap(({ name, data = Buffer.alloc(0), link }) => {
    const title = Buffer.from(name);
    let extra = Buffer.alloc(0);
    if (link) { const target = Buffer.from(link.target), record = Buffer.concat([vint(5), vint(link.type), vint(0), vint(target.length), target]); extra = Buffer.concat([vint(record.length), record]); }
    const header = Buffer.concat([vint(2), vint((extra.length ? 1 : 0) | 2), ...(extra.length ? [vint(extra.length)] : []), vint(data.length), vint(4), vint(data.length), vint(0x20), u32(zlib.crc32(data)), vint(0), vint(0), vint(title.length), title, extra]);
    return [rarHeader(header), data];
  });
  return Buffer.concat([Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]), rarHeader(Buffer.concat([vint(1), vint(0), vint(volume ? 1 : 0)])), ...blocks, rarHeader(Buffer.concat([vint(5), vint(0), vint(0)]))]);
}
async function rarFixture(t, bytes) {
  const { root, archive } = await fixture(t);
  const rar = archive.replace(/\.zip$/, '.rar'); await fs.writeFile(rar, bytes);
  return { root, rar };
}

test('imports a single RAR archive through 7-Zip', async t => {
  const { root, rar } = await rarFixture(t, rar5([{ name: 'Wrapper/Fixture.exe', data: Buffer.from('MZ-fake-game-never-executed') }]));
  const result = await importArchive({ archive: rar, root, game: { id: '1', name: 'Fixture' }, artwork: false, spaceSaving: true });
  assert.equal(result.extractionEngine, '7zip');
  assert.equal(await fs.readFile(path.join(result.folder, 'Wrapper/Fixture.exe'), 'utf8'), 'MZ-fake-game-never-executed');
  assert.equal((await scanLibrary(root)).games[0].name, 'Fixture');
});

test('refuses RAR links, path traversal and multipart volumes before extracting', async t => {
  const data = Buffer.from('MZ');
  const cases = [
    [[{ name: 'Game/link', link: { type: 1, target: '../../evil' } }], {}, /links/],
    [[{ name: 'Game/link', link: { type: 2, target: 'C:\Windows' } }], {}, /links/],
    [[{ name: 'Game/junction', link: { type: 3, target: 'C:\Windows' } }], {}, /links/],
    [[{ name: 'Game/a.exe', data }, { name: 'Game/hard', link: { type: 4, target: 'Game/a.exe' } }], {}, /links/],
    [[{ name: '../evil.exe', data }], {}, /unsafe/],
    [[{ name: 'Game/a.exe', data }], { volume: true }, /multipart/],
  ];
  for (const [files, options, expected] of cases) {
    const { root, rar } = await rarFixture(t, rar5(files, options));
    await assert.rejects(importArchive({ archive: rar, root, game: { id: '1', name: 'Fixture' }, artwork: false, spaceSaving: true }), expected);
    assert.deepEqual((await fs.readdir(root)).filter(name => name !== '.orbit-staging'), []);
  }
});
