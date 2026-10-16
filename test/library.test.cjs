const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { scanLibrary, launchGame, validatedExecutable } = require('../electron/library.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function add(file) { const p = path.join(root, file); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, 'fixture'); return p; }
  return { root, add };
}
test('finds the actual games and ignores crash handlers, installers, and archives', async t => {
  const { root, add } = await fixture(t);
  await add('Stardew Valley/Stardew Valley.exe');
  await add('Stardew Valley/createdump.exe');
  await add('Stardew Valley/UnityCrashHandler64.exe');
  await add('Other game/Binaries/Win64/OtherGame.exe');
  await add('Other game/setup.exe');
  await add('Archive.7z');
  const library = await scanLibrary(root);
  assert.equal(library.games.length, 2);
  assert.match(library.games[0].executable, /OtherGame.exe$/);
  assert.match(library.games[1].executable, /Stardew Valley.exe$/);
  assert.equal(library.games[1].candidates.length, 1);
  assert.equal(library.games[1].needsChoice, false);
  assert.deepEqual((await scanLibrary(root)).games.map(g => g.id), library.games.map(g => g.id));
});
test('unknown games with multiple executables require a choice', async t => {
  const { root, add } = await fixture(t);
  await add('My game/Game.exe'); await add('My game/Config.exe');
  assert.equal((await scanLibrary(root)).games[0].needsChoice, true);
});
test('launches without a shell and uses the executable directory as cwd', async t => {
  const { root, add } = await fixture(t);
  const exe = await add('Game with spaces/Game.exe');
  const game = (await scanLibrary(root)).games[0];
  let captured;
  const result = await launchGame(game, null, (file, args, options) => {
    captured = { file, args, options };
    const child = new EventEmitter(); child.pid = 123; child.unref = () => {};
    queueMicrotask(() => child.emit('spawn')); return child;
  });
  assert.equal(result.pid, 123); assert.equal(captured.file, await fs.realpath(exe));
  assert.deepEqual(captured.args, []); assert.equal(captured.options.shell, false);
  assert.equal(captured.options.cwd, path.dirname(exe));
});
test('rejects paths outside a game and reports missing executables', async t => {
  const { root, add } = await fixture(t);
  await add('Game/Game.exe'); const outside = await add('Outside/Other.exe');
  const game = (await scanLibrary(root)).games.find(g => g.name === 'Game');
  await assert.rejects(validatedExecutable(game, outside), /Choose a game executable/);
  game.candidates.push(outside);
  await assert.rejects(validatedExecutable(game, outside), /inside the game folder/);
  await fs.rm(game.executable);
  await assert.rejects(validatedExecutable(game), /ENOENT/);
});
test('spawn failures are returned to the caller', async t => {
  const { root, add } = await fixture(t); await add('Game/Game.exe');
  const game = (await scanLibrary(root)).games[0];
  await assert.rejects(launchGame(game, null, () => {
    const child = new EventEmitter(); queueMicrotask(() => child.emit('error', new Error('Launch denied'))); return child;
  }), /Launch denied/);
});

test('Fortnite uses Epic authentication even with a saved executable choice', async t => {
  const { root, add } = await fixture(t);
  await add('Fortnite/FortniteGame/Binaries/Win64/FortniteLauncher.exe');
  const shipping = await add('Fortnite/FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe');
  const game = (await scanLibrary(root)).games[0];
  assert.equal(game.needsChoice, false);
  let opened;
  const spawnUnexpected = () => assert.fail('Fortnite must not be spawned without Epic authentication');
  const result = await launchGame(game, shipping, spawnUnexpected, async uri => { opened = uri; });
  assert.equal(opened, 'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true');
  assert.equal(result.launcher, 'Epic Games Launcher');
  await assert.rejects(launchGame(game, shipping, spawnUnexpected, async () => {
    throw new Error('Epic launcher unavailable');
  }), /Epic launcher unavailable/);
});
