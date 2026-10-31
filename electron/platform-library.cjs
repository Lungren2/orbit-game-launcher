const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const idFor = value => createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 16);
const contained = (base, target) => { const relative = path.relative(base, target); return !relative.startsWith('..') && !path.isAbsolute(relative); };
let inventory, inventoryTime = 0;

async function xboxInventory() {
  if (process.platform !== 'win32') return [];
  if (inventory && Date.now() - inventoryTime < 30000) return inventory;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const command = await fs.readFile(path.join(__dirname, 'xbox-inventory.ps1'), 'utf8');
  const { stdout } = await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]');
  inventory = Array.isArray(result) ? result : [result]; inventoryTime = Date.now();
  return inventory;
}

async function localImage(folder, relative) {
  if (!relative || typeof relative !== 'string' || path.isAbsolute(relative)) return null;
  const candidate = path.resolve(folder, relative);
  if (!contained(folder, candidate) || !/\.(png|jpg|jpeg|webp)$/i.test(candidate)) return null;
  const actual = await fs.realpath(candidate).catch(() => null);
  if (actual && contained(await fs.realpath(folder), actual)) return actual;
  // Windows package visuals often use scale-qualified filenames.
  const extension = path.extname(candidate), stem = path.basename(candidate, extension);
  const names = await fs.readdir(path.dirname(candidate)).catch(() => []);
  const scaled = names.filter(name => name.startsWith(stem + '.scale-') && name.endsWith(extension)).sort().reverse();
  return scaled.length ? localImage(folder, path.relative(folder, path.join(path.dirname(candidate), scaled[0]))) : null;
}

async function scanPlatforms({ cacheDirectory, epicDirectory = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic/EpicGamesLauncher/Data/Manifests'), getXbox = xboxInventory, steamDirectories } = {}) {
  const games = [], warnings = [];
  const makeGame = async data => {
    const folder = await fs.realpath(data.folder).catch(() => null);
    if (!folder) return;
    const id = idFor(data.identity);
    const metadataFolder = path.join(cacheDirectory, 'platform-games', id);
    await fs.mkdir(metadataFolder, { recursive: true });
    let saved = {};
    try { const parsed = JSON.parse(await fs.readFile(path.join(metadataFolder, '.orbit-game.json'), 'utf8')); if (parsed.version === 1) saved = parsed; } catch {}
    const musicFile = /^music\.(mp3|ogg|wav|m4a|flac)$/.test(saved.musicFile || '') ? saved.musicFile : null;
    const mediaVersion = Date.parse(saved.updatedAt || '') || 0;
    games.push({ ...data, id, folder, metadataFolder, candidates: [], executable: null, needsChoice: false, art: null, genre: saved.genre || 'PC game', developer: saved.developer || data.developer || '', description: saved.description || data.description || '', name: saved.name || data.name, hasCover: !!saved.hasCover || !!data.platformCover, hasHero: !!saved.hasHero, hasLogo: !!saved.hasLogo, hasMusic: !!saved.hasMusic && !!musicFile, musicFile, musicTitle: saved.musicTitle || '', musicUrl: musicFile ? `orbit-art://${id}/music?v=${mediaVersion}` : null, mediaVersion, steamAppId: data.steamAppId || saved.steamAppId || null, metadataSource: saved.metadataSource || data.platform, needsMetadataMatch: !!saved.needsMetadataMatch, platformCover: data.platformCover || null });
  };
  try {
    const { scanSteam } = require('./steam-library.cjs');
    for (const game of await scanSteam({ directories: steamDirectories, warnings })) await makeGame(game);
  } catch { warnings.push('Steam library could not be read. You can rescan in Settings.'); }
  const entries = await fs.readdir(epicDirectory).catch(error => { if (error.code !== 'ENOENT') warnings.push('Epic library could not be read.'); return []; });
  for (const entry of entries.filter(name => name.endsWith('.item')).slice(0, 1000)) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(epicDirectory, entry), 'utf8'));
      if (manifest.bIsIncompleteInstall || manifest.bIsApplication === false || !manifest.AppName || !manifest.DisplayName || !path.isAbsolute(manifest.InstallLocation || '')) continue;
      if (!/^[\w.-]+$/.test(manifest.AppName)) continue;
      const folder = manifest.InstallLocation;
      const executable = path.resolve(folder, manifest.LaunchExecutable || '');
      if (!contained(folder, executable) || !/\.exe$/i.test(executable) || !(await fs.stat(executable).catch(() => null))?.isFile()) continue;
      const app = [manifest.CatalogNamespace, manifest.CatalogItemId, manifest.AppName].every(value => typeof value === 'string' && /^[\w.-]+$/.test(value)) ? `${manifest.CatalogNamespace}:${manifest.CatalogItemId}:${manifest.AppName}` : manifest.AppName;
      await makeGame({ name: manifest.DisplayName, folder, identity: `epic:${manifest.AppName}`, platform: 'Epic Games', launchUri: `com.epicgames.launcher://apps/${encodeURIComponent(app)}?action=launch&silent=true` });
    } catch { /* Ignore stale or partially written launcher manifests. */ }
  }
  try {
    for (const game of (await getXbox()).slice(0, 1000)) {
      if (!game || !/^[\w.-]+_[\w]+![\w.-]+$/.test(game.aumid || '') || !path.isAbsolute(game.folder || '') || !game.name) continue;
      const platformCover = await localImage(game.folder, game.cover) || await localImage(game.folder, game.fallbackCover);
      await makeGame({ name: game.name, folder: game.folder, identity: `xbox:${game.aumid}`, aumid: game.aumid, platform: 'Xbox', developer: game.publisher, description: game.description, platformCover });
    }
  } catch { warnings.push('Xbox library could not be read. You can rescan in Settings.'); }
  return { games, warnings };
}

function mergeGames(local, platforms) {
  const games = [...local];
  const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const platform of platforms) {
    const sameFolder = games.find(game => game.folder.toLowerCase() === platform.folder.toLowerCase());
    const sameTitle = games.filter(game => !game.platform && normalize(game.name) === normalize(platform.name));
    const match = sameFolder || (sameTitle.length === 1 ? sameTitle[0] : null);
    if (match) {
      // Keep existing IDs, artwork, favorites and music; prefer the registered launcher.
      match.platform = platform.platform;
      match.launchUri = platform.launchUri || null;
      match.aumid = platform.aumid || null;
      match.steamManifest = platform.steamManifest || null;
      if (platform.platform === 'Steam') match.steamAppId = platform.steamAppId;
      match.platformFolder = platform.folder;
      match.needsChoice = false;
    } else games.push(platform);
  }
  return games.sort((a, b) => a.name.localeCompare(b.name));
}
module.exports = { scanPlatforms, mergeGames };
