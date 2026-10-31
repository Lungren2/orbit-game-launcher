const fs = require('node:fs/promises');
const path = require('node:path');

async function removalTarget(root, target) {
  const base = await fs.realpath(root);
  const resolved = path.resolve(target);
  if (path.dirname(resolved).toLowerCase() !== base.toLowerCase() || /^\.orbit-/i.test(path.basename(resolved)))
    throw new Error('This folder is outside the removable game directory.');
  const entry = await fs.lstat(resolved);
  if (!entry.isDirectory() || entry.isSymbolicLink() || (await fs.realpath(resolved)).toLowerCase() !== resolved.toLowerCase())
    throw new Error('Linked folders cannot be removed from Orbit.');
  return resolved;
}

function uninstallUri(game) {
  const steam = /^steam:\/\/rungameid\/([1-9]\d{0,9})$/.exec(game.launchUri || '');
  if (steam) return `steam://uninstall/${steam[1]}`;
  if (game.aumid || game.platform === 'Xbox') return 'ms-settings:appsfeatures';
  if (game.launchUri?.startsWith('com.epicgames.launcher://') || game.platform === 'Epic Games') return 'com.epicgames.launcher://library';
  if (game.platform || game.launchUri) throw new Error('Uninstall this game through its launcher.');
  return null;
}
async function incompleteInstall(job, directory) {
  let state;
  try { state = JSON.parse(await fs.readFile(path.join(directory, '.orbit-import.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (state.phase !== 'installing' || !state.destination) return null;
  if (state.version !== 1 || state.archive !== job.archive || state.root !== await fs.realpath(job.root) || typeof state.token !== 'string' || !/^[0-9a-f-]{36}$/i.test(state.token)) throw new Error('Invalid unfinished installation.');
  const target = await removalTarget(job.root, state.destination);
  if (await fs.readFile(path.join(target, '.orbit-installing'), 'utf8') !== state.token) throw new Error('The unfinished game no longer belongs to this download.');
  return target;
}
module.exports = { removalTarget, uninstallUri, incompleteInstall };
