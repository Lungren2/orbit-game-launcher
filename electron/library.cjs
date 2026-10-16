const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const known = {
  'Fortnite': { executable: 'FortniteGame/Binaries/Win64/FortniteLauncher.exe', launchUri: 'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true', developer: 'Epic Games' },
  'Cities Skylines II': { executable: 'Cities2.exe', art: 'cities', title: 'Cities: Skylines II', genre: 'City builder', tagline: 'A city of your own.', description: 'Build a city from the ground up. Shape its skyline, connect its neighborhoods, and bring your vision to life.', developer: 'Colossal Order' },
  'Stardew Valley': { executable: 'Stardew Valley.exe', art: 'stardew', genre: 'Farming & life sim', tagline: 'A little change of pace.', description: 'Leave the rush behind. Grow your farm, make new friends, and find your own rhythm in the valley.', developer: 'ConcernedApe' },
  'Vampire Survivors': { executable: 'VampireSurvivors.exe', art: 'vampire', genre: 'Action roguelike', tagline: 'One more run.', description: 'Face the night, gather your arsenal, and hold out against the horde for as long as you can.', developer: 'poncle' },
  'Dimraeth': { executable: 'Dimraeth.exe', art: 'dimraeth', genre: 'Adventure', tagline: 'Your next adventure awaits.', description: 'Step into Dimraeth. Your next journey is ready whenever you are.', developer: '' },
  'Scritchy Scratchy': { executable: 'ScritchyScratchy.exe', art: 'scritchy', genre: 'Incremental', tagline: 'Feeling lucky?', description: 'Settle in for a session of Scritchy Scratchy. Just one more scratch.', developer: '' },
};
const blocked = /crash|unins|setup|install|redist|createdump|report|helper|server|dowser|update|unity/i;
const idFor = (dir) => createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0, 16);

async function findExecutables(folder, depth = 0) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const direct = entries.filter(e => e.isFile() && /\.exe$/i.test(e.name) && !blocked.test(e.name)).map(e => path.join(folder, e.name));
  if (depth >= 6) return direct;
  const nested = [...direct];
  for (const e of entries) {
    if (e.isDirectory() && !/data$|redist|support|\.git|node_modules|^\.orbit-/i.test(e.name)) {
      nested.push(...await findExecutables(path.join(folder, e.name), depth + 1).catch(() => []));
    }
  }
  return nested;
}

async function scanLibrary(root) {
  const resolved = await fs.realpath(root);
  const dirs = (await fs.readdir(resolved, { withFileTypes: true })).filter(e => e.isDirectory() && !/^\.orbit-/i.test(e.name));
  const games = [];
  for (const dir of dirs) {
    const folder = path.join(resolved, dir.name);
    if (await fs.stat(path.join(folder, '.orbit-installing')).then(() => true).catch(() => false)) continue;
    let imported;
    try { const parsed = JSON.parse(await fs.readFile(path.join(folder, '.orbit-game.json'), 'utf8')); if (parsed.version === 1 && typeof parsed.name === 'string') imported = parsed; } catch {}
    const meta = known[dir.name] || {};
    let candidates = await findExecutables(folder).catch(() => []);
    let preferred = meta.executable && path.join(folder, meta.executable);
    if (preferred && !await fs.stat(preferred).then(s => s.isFile()).catch(() => false)) preferred = null;
    if (preferred && await fs.stat(preferred).then(s => s.isFile()).catch(() => false)) candidates = [preferred, ...candidates.filter(p => p !== preferred)];
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const gameName = imported?.name || meta.title || dir.name;
    const exact = candidates.filter(p => normalize(path.basename(p, '.exe')) === normalize(gameName));
    if (!preferred && exact.length === 1) preferred = exact[0];
    if (preferred) candidates = [preferred, ...candidates.filter(p => p !== preferred)];
    const mediaVersion = Date.parse(imported?.updatedAt || imported?.importedAt || '') || 0;
    const musicFile = /^music\.(mp3|ogg|wav|m4a|flac)$/.test(imported?.musicFile || '') ? imported.musicFile : null;
    games.push({ id: idFor(folder), name: gameName, folder, executable: candidates[0] || null, candidates, launchUri: meta.launchUri || null, needsChoice: candidates.length > 1 && !preferred, imported: !!imported, hasCover: !!imported?.hasCover, hasHero: !!imported?.hasHero, hasLogo: !!imported?.hasLogo, hasMusic: !!imported?.hasMusic && !!musicFile, musicFile, musicTitle: imported?.musicTitle || '', musicUrl: imported?.hasMusic && musicFile ? `orbit-art://${idFor(folder)}/music?v=${mediaVersion}` : null, mediaVersion, coverUrl: imported?.coverUrl || null, heroUrl: imported?.heroUrl || null, steamAppId: imported?.steamAppId || null, playzipId: imported?.playzipId || null, art: meta.art || null, genre: imported?.genre || meta.genre || 'PC game', developer: imported?.developer || meta.developer || '', description: imported?.description || meta.description || '', releaseDate: imported?.releaseDate || '', metadataSource: imported?.metadataSource || '', needsMetadataMatch: !!imported?.needsMetadataMatch });
  }
  return { root: resolved, games: games.sort((a, b) => a.name.localeCompare(b.name)), scannedAt: new Date().toISOString() };
}

async function validatedExecutable(game, chosen) {
  const exe = chosen || game.executable;
  if (!exe || !game.candidates.includes(exe)) throw new Error('Choose a game executable first.');
  const real = await fs.realpath(exe);
  const folder = await fs.realpath(game.folder);
  const relative = path.relative(folder, real);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.exe$/i.test(real)) throw new Error('Executable must be inside the game folder.');
  if (!(await fs.stat(real)).isFile()) throw new Error('Game executable is missing.');
  return real;
}

async function launchGame(game, chosen, spawnProcess = spawn, openExternal) {
  const executable = await validatedExecutable(game, chosen);
  if (game.launchUri) {
    if (!openExternal) throw new Error('Launch Fortnite through Epic Games Launcher.');
    await openExternal(game.launchUri);
    return { launcher: 'Epic Games Launcher' };
  }
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, [], { cwd: path.dirname(executable), detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve({ pid: child.pid }); });
  });
}
async function artworkPath(library, id, kind) {
  if (!['cover', 'hero', 'logo', 'music'].includes(kind)) throw new Error('Invalid artwork.');
  const game = library.games.find(game => game.id === id);
  if (!game) throw new Error('Game not found.');
  if (kind === 'music' && !/^music\.(mp3|ogg|wav|m4a|flac)$/.test(game.musicFile || '')) throw new Error('Music not found.');
  const target = await fs.realpath(path.join(game.folder, '.orbit-assets', kind === 'music' ? game.musicFile : kind));
  const relative = path.relative(await fs.realpath(game.folder), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid artwork path.');
  return target;
}
module.exports = { scanLibrary, launchGame, validatedExecutable, artworkPath };
