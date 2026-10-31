const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { removalTarget, uninstallUri } = require('../electron/removal.cjs');

test('uninstall targets only direct game folders and rejects roots, staging and junctions', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-removal-'));
  t.after(async () => { const resolved = await fs.realpath(base); assert.ok(resolved.startsWith(await fs.realpath(os.tmpdir()) + path.sep)); await fs.rm(resolved, { recursive:true, force:true }); });
  const root = path.join(base,'Games'), game = path.join(root,'Game'), outside = path.join(base,'Outside');
  await fs.mkdir(game, {recursive:true}); await fs.mkdir(outside);
  await fs.mkdir(path.join(root,'.orbit-staging'));
  assert.equal(await removalTarget(root,game),game);
  for (const invalid of [root, outside, path.join(root,'.orbit-staging')]) await assert.rejects(removalTarget(root, invalid), /outside/);
  const link = path.join(root,'Linked'); await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(removalTarget(root,link), /Linked/);
});

test('platform games uninstall through validated launcher routes', () => {
  assert.equal(uninstallUri({launchUri:'steam://rungameid/413150'}),'steam://uninstall/413150');
  assert.equal(uninstallUri({platform:'Epic Games'}),'com.epicgames.launcher://library');
  assert.equal(uninstallUri({aumid:'Some.Game_123!App'}),'ms-settings:appsfeatures');
  assert.equal(uninstallUri({folder:'D:/Games/Local'}),null);
  assert.throws(() => uninstallUri({launchUri:'https://example.com/uninstall'}), /launcher/);
});
