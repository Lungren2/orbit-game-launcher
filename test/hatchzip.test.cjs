const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { importArchive, run7zip } = require('../electron/importer.cjs');
const { runHatchzip, hatchzip } = require('../electron/hatchzip.cjs');
const { scanLibrary } = require('../electron/library.cjs');

async function fixture(t, extension = 'zip') {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-hatchzip-test-'));
  t.after(async () => { const target = await fs.realpath(base); assert.ok(target.startsWith(await fs.realpath(os.tmpdir()) + path.sep)); await fs.rm(target, { recursive: true, force: true }); });
  const root = path.join(base, 'Games');
  const job = path.join(root, '.orbit-staging', randomUUID());
  const source = path.join(base, 'Source');
  await fs.mkdir(job, { recursive: true }); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'Fixture.exe'), 'MZ-never-executed');
  await fs.writeFile(path.join(source, 'data.bin'), Buffer.alloc(200000, 17));
  const original = path.join(base, `Original.${extension}`);
  await run7zip(['a', `-t${extension}`, '-y', original, path.join(source, '*')]);
  const archive = path.join(job, `Fixture.${extension}`); await fs.copyFile(original, archive);
  const options = { archive, root, game: { id: '42', name: 'Fixture' }, spaceSaving: true, artwork: false };
  return { base, root, job, original, archive, options };
}

test('native HatchZip consumes only staged ZIP/7z copies and publishes metadata', async t => {
  for (const extension of ['zip', '7z']) {
    const { root, original, archive, options } = await fixture(t, extension);
    const originalBytes = await fs.readFile(original);
    const result = await importArchive(options);
    assert.equal(result.extractionEngine, 'hatchzip');
    assert.equal(await fs.readFile(path.join(result.folder, 'Fixture.exe'), 'utf8'), 'MZ-never-executed');
    assert.deepEqual(await fs.readFile(path.join(result.folder, 'data.bin')), Buffer.alloc(200000, 17));
    assert.deepEqual(await fs.readFile(original), originalBytes);
    await assert.rejects(fs.stat(archive), { code: 'ENOENT' });
    assert.equal((await scanLibrary(root)).games.length, 1);
    assert.equal(result.manifest.playzipId, '42');
    assert.equal((await importArchive(options)).folder, result.folder, 'Retry after completion must not duplicate the installation');
  }
});

test('retries retain extracted files after archive consumption and before metadata import', async t => {
  const { archive, options } = await fixture(t);
  await assert.rejects(importArchive({ ...options, onState: state => { if (state === 'importing') throw new Error('Simulated interruption'); } }), /Simulated interruption/);
  await assert.rejects(fs.stat(archive), { code: 'ENOENT' });
  const result = await importArchive(options);
  assert.equal(await fs.readFile(path.join(result.folder, 'Fixture.exe'), 'utf8'), 'MZ-never-executed');
});

test('recovers a CLI completion before the Orbit extraction checkpoint', async t => {
  const { archive, job, options } = await fixture(t);
  await assert.rejects(importArchive({ ...options, onState: state => { if (state === 'extracting') throw new Error('Simulated interruption'); } }), /Simulated interruption/);
  await runHatchzip(['extract','--yes','--verify-first','--keep-free','268435456','--quiet','--output',path.join(job,'hatchzip-work/files'),'--',archive]);
  const result = await importArchive(options);
  assert.equal(await fs.readFile(path.join(result.folder, 'Fixture.exe'), 'utf8'), 'MZ-never-executed');
});

test('refuses destructive extraction outside private job folders and unsafe entry paths', async t => {
  const { original, archive, options } = await fixture(t);
  const bytes = await fs.readFile(original);
  await assert.rejects(importArchive({ ...options, archive: original }), /Orbit-managed/);
  assert.deepEqual(await fs.readFile(original), bytes);
  await fs.writeFile(archive, 'not a ZIP');
  await assert.rejects(importArchive(options), /complete ZIP/);
});

test('resumes a real interrupted HatchZip journal without re-listing the truncated archive', async t => {
  const { base, job, archive, options } = await fixture(t);
  const payload = require('node:crypto').randomBytes(1024 * 1024);
  const source = path.join(base, 'Journal-source'); await fs.mkdir(source);
  for (let i = 0; i < 24; i++) await fs.writeFile(path.join(source, `data-${i}.bin`), payload);
  await fs.writeFile(path.join(source, 'Fixture.exe'), 'MZ-journal-fixture');
  // A new archive avoids adding to the earlier fixture.
  const journalArchive = path.join(job, 'Journal.zip');
  await run7zip(['a','-tzip','-mx=0','-y',journalArchive,path.join(source,'*')]);
  const next = { ...options, archive: journalArchive };
  await assert.rejects(importArchive({ ...next, onState: state => { if (state === 'extracting') throw new Error('Prepare transaction'); } }), /Prepare transaction/);
  const child = spawn(hatchzip(), ['extract','--yes','--verify-first','--keep-free','268435456','--quiet','--output',path.join(job,'hatchzip-work/files'),'--',journalArchive], { windowsHide:true, stdio:'ignore' });
  const closed = new Promise((resolve,reject) => { child.once('error',reject); child.once('close',resolve); });
  let journalSeen = false;
  for (let i = 0; i < 2000; i++) {
    if (await fs.stat(journalArchive + '.hatchzip').then(() => true, () => false)) { journalSeen = true; child.kill(); break; }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  if (!journalSeen) child.kill();
  await closed;
  assert.ok(journalSeen, 'HatchZip created a resumable journal');
  const result = await importArchive(next);
  for (let i = 0; i < 24; i++) assert.deepEqual(await fs.readFile(path.join(result.folder,`data-${i}.bin`)), payload);
  assert.equal(await fs.readFile(path.join(result.folder,'Fixture.exe'),'utf8'),'MZ-journal-fixture');
});
