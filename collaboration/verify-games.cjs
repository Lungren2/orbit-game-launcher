// Read-only checks against the real library. Does not start games or modify saves.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scanLibrary, validatedExecutable } = require('../electron/library.cjs');

const expected = {
  'Cities: Skylines II': ['Cities Skylines II', 'Cities2.exe'],
  Dimraeth: ['Dimraeth', 'Dimraeth.exe'],
  'Scritchy Scratchy': ['Scritchy Scratchy', 'ScritchyScratchy.exe'],
  'Stardew Valley': ['Stardew Valley', 'Stardew Valley.exe'],
  'Vampire Survivors': ['Vampire Survivors', 'VampireSurvivors.exe'],
};

(async () => {
  const library = await scanLibrary('D:\\Games');
  assert.equal(library.games.length, Object.keys(expected).length, 'Expected five installed games; archives must not become games');
  for (const [name, [folder, filename]] of Object.entries(expected)) {
    const game = library.games.find(g => g.name === name);
    assert.ok(game, `Missing ${name}`);
    const executable = path.join('D:\\Games', folder, filename);
    assert.equal(game.executable, executable);
    assert.equal(game.needsChoice, false);
    assert.equal(await validatedExecutable(game), await fs.realpath(executable));
    assert.ok(game.candidates.every(p => !/crashhandler|createdump|dowser|installer|replication-server|vswhere|modpublisher|modpostprocessor/i.test(path.basename(p))), `Utility listed for ${name}`);
  }
  const again = await scanLibrary('D:\\Games');
  assert.deepEqual(again.games.map(g => g.id), library.games.map(g => g.id), 'IDs must remain stable across scans');
  const report = {
    verifiedAt: new Date().toISOString(),
    root: library.root,
    games: library.games.map(({ id, name, folder, executable, candidates, needsChoice }) => ({ id, name, folder, executable, candidates, needsChoice })),
    checks: ['Five games discovered', 'Correct main executables', 'Utilities excluded', 'Archive excluded', 'Executable validation passed', 'Stable IDs across scans'],
    gamesLaunched: false,
  };
  await fs.writeFile(path.join(__dirname, 'games-verified.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
