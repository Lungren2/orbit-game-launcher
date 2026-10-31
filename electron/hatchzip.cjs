const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const children = new Set();
const imports = new Set();
const exists = file => fs.lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
const hatchzip = () => process.resourcesPath && __dirname.includes('app.asar')
  ? path.join(process.resourcesPath, 'hatchzip/hatchzip.exe')
  : path.join(__dirname, '../vendor/hatchzip/hatchzip.exe');

function runHatchzip(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NO_COLOR: '1' };
    // Never inherit passwords or upstream fault-injection switches from the host.
    for (const key of Object.keys(env)) if (/^HATCHZIP_/i.test(key)) delete env[key];
    const child = spawn(hatchzip(), args, { env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    child.stdin.end();
    let output = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 4 * 60 * 60 * 1000);
    const collect = bytes => { output = (output + bytes.toString('utf8')).slice(-16000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', error => { clearTimeout(timer); children.delete(child); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); children.delete(child);
      if (code === 0 && !timedOut) return resolve(output);
      const message = timedOut ? 'HatchZip timed out. Retry installation to resume.'
        : code === 3 ? 'HatchZip needs more free disk space. Free space and retry installation.'
        : code === 4 ? 'HatchZip found a damaged archive. Download it again.'
        : code === 5 ? 'This archive requires a password. Extract it manually.'
        : 'HatchZip stopped. Retry installation to resume.';
      const error = new Error(message); error.exitCode = code; error.details = output; reject(error);
    });
  });
}

async function stopHatchzip() {
  await Promise.all([...children].map(child => new Promise(resolve => { child.once('close', resolve); child.kill(); })));
}

async function writeState(file, state) {
  const temporary = file + '.tmp';
  const handle = await fs.open(temporary, 'w');
  try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
}

async function privatePaths(archive, root) {
  const resolvedRoot = await fs.realpath(root);
  const staging = path.join(resolvedRoot, '.orbit-staging');
  const folder = path.dirname(path.resolve(archive));
  if (path.dirname(folder).toLowerCase() !== staging.toLowerCase() || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(path.basename(folder)))
    throw new Error('Space-saving extraction is only available for Orbit-managed archives.');
  for (const directory of [staging, folder]) {
    if ((await fs.lstat(directory)).isSymbolicLink() || (await fs.realpath(directory)).toLowerCase() !== directory.toLowerCase())
      throw new Error('Invalid managed archive directory.');
  }
  if (await exists(archive)) {
    const stat = await fs.lstat(archive);
    if (!stat.isFile() || stat.isSymbolicLink() || (await fs.realpath(archive)).toLowerCase() !== path.resolve(archive).toLowerCase())
      throw new Error('Invalid managed archive.');
  }
  return { root: resolvedRoot, folder, archive: path.resolve(archive), work: path.join(folder, 'hatchzip-work'), stateFile: path.join(folder, '.orbit-import.json') };
}

async function completeTree(directory, entries, verifyTree) {
  await verifyTree(directory);
  for (const entry of entries) {
    const stat = await fs.lstat(path.join(directory, ...entry.name.split('/')));
    if (entry.directory ? !stat.isDirectory() : !stat.isFile() || stat.size !== entry.size)
      throw new Error('Extracted files do not match the validated archive.');
  }
}

async function importManagedArchive(options, helpers) {
  const paths = await privatePaths(options.archive, options.root);
  if (imports.has(paths.archive)) throw new Error('This archive is already being imported.');
  imports.add(paths.archive);
  try { return await importManaged(options, helpers, paths); }
  finally { imports.delete(paths.archive); }
}

async function importManaged({ game, onState = () => {}, artwork = true }, { run7zip, validateListing, verifyTree, safeName, writeGameMetadata }, paths) {
  const { root, archive, work, stateFile } = paths;
  const extracted = path.join(work, 'files');
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state && (state.version !== 1 || state.archive !== archive || state.root !== root || !Array.isArray(state.entries) || !['extracting','extracted','installing','complete'].includes(state.phase)))
    throw new Error('Invalid HatchZip import transaction.');
  const checkpoint = async () => writeState(stateFile, state);
  if (!state) {
    const handle = await fs.open(archive, 'r');
    const signature = Buffer.alloc(6);
    try { await handle.read(signature, 0, 6, 0); } finally { await handle.close(); }
    if (!signature.subarray(0, 4).equals(Buffer.from([80,75,3,4])) && !signature.equals(Buffer.from([55,122,188,175,39,28])))
      throw new Error('Only complete ZIP and 7z game archives can be imported automatically.');
    const listing = validateListing(await run7zip(['l','-slt','-ba','-sccUTF-8','-p-','--',archive], 60000));
    try {
      await runHatchzip(['check','--keep-free','268435456','--quiet','--output',extracted,'--',archive]);
    } catch (error) {
      // Only fall back before a journal/transaction exists and before any archive
      // bytes can have been consumed. Keep legacy codec coverage where possible.
      if (error.exitCode === 1 && /unsupported|not supported/i.test(error.details || '')) error.hatchzipUnsupported = true;
      throw error;
    }
    await fs.mkdir(work, { recursive: true });
    if ((await fs.lstat(work)).isSymbolicLink()) throw new Error('Invalid extraction staging path.');
    state = { version: 1, archive, root, phase: 'extracting', token: randomUUID(), entries: listing.files };
    await checkpoint();
  }
  if (state.phase === 'extracting') {
    onState('extracting');
    for (const item of [work, extracted, archive + '.hatchzip', archive + '.hatchzip-tail']) {
      if (await exists(item) && (await fs.lstat(item)).isSymbolicLink()) throw new Error('Invalid extraction staging path.');
    }
    // If the CLI finished just before Orbit crashed, its archive and journal may
    // already be gone. Only advance after every preflight-listed file is present.
    if (!(await exists(archive)) && !(await exists(archive + '.hatchzip'))) {
      await completeTree(extracted, state.entries, verifyTree);
    } else {
      await runHatchzip(['extract','--yes','--verify-first','--keep-free','268435456','--quiet','--output',extracted,'--',archive]);
      await completeTree(extracted, state.entries, verifyTree);
    }
    state.phase = 'extracted'; await checkpoint();
  }
  if (state.destination) {
    const relative = path.relative(root, state.destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep) || (await fs.lstat(state.destination)).isSymbolicLink())
      throw new Error('Invalid import destination.');
  }
  if (state.phase === 'complete') {
    const manifest = JSON.parse(await fs.readFile(path.join(state.destination, '.orbit-game.json'), 'utf8'));
    if (manifest.importId !== state.token) throw new Error('Import destination no longer belongs to this job.');
    return { folder: state.destination, manifest, extractionEngine: 'hatchzip' };
  }
  onState('importing');
  if (!state.destination) {
    const base = safeName(game.name);
    for (let i = 0; i < 10000; i++) {
      const destination = path.join(root, i ? `${base} (${i + 1})` : base);
      try { await fs.mkdir(destination); }
      catch (error) { if (error.code === 'EEXIST') continue; throw error; }
      await fs.writeFile(path.join(destination, '.orbit-installing'), state.token, { flag: 'wx' });
      state.destination = destination; state.phase = 'installing'; await checkpoint(); break;
    }
    if (!state.destination) throw new Error('Could not allocate a game folder.');
  }
  const marker = path.join(state.destination, '.orbit-installing');
  if (await exists(marker)) {
    if ((await fs.readFile(marker, 'utf8')) !== state.token) throw new Error('Import destination no longer belongs to this job.');
    for (const entry of await fs.readdir(extracted)) {
      const target = path.join(state.destination, entry);
      if (await exists(target)) throw new Error('An import destination file already exists. Files have been preserved.');
      await fs.rename(path.join(extracted, entry), target);
    }
    await verifyTree(state.destination);
    const manifest = await writeGameMetadata(state.destination, game, artwork, state.token);
    await fs.unlink(marker);
    state.phase = 'complete'; await checkpoint();
    return { folder: state.destination, manifest, extractionEngine: 'hatchzip' };
  }
  // A crash after publishing metadata but before the final checkpoint is safe.
  const manifest = JSON.parse(await fs.readFile(path.join(state.destination, '.orbit-game.json'), 'utf8'));
  if (manifest.importId !== state.token) throw new Error('Import destination no longer belongs to this job.');
  state.phase = 'complete'; await checkpoint();
  return { folder: state.destination, manifest, extractionEngine: 'hatchzip' };
}

module.exports = { hatchzip, runHatchzip, stopHatchzip, importManagedArchive };
