const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const locks = new Map();
const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0 && Number(id) < 1e10;
const contained = (base, target) => { const rel = path.relative(base, target); return !rel.startsWith('..') && !path.isAbsolute(rel); };
const imageHost = url => url.protocol === 'https:' && (url.hostname === 'shared.akamai.steamstatic.com' || url.hostname.endsWith('.steamstatic.com'));

async function locked(game, action) {
  const previous = locks.get(game.folder) || Promise.resolve();
  const task = previous.catch(() => {}).then(action);
  locks.set(game.folder, task);
  try { return await task; } finally { if (locks.get(game.folder) === task) locks.delete(game.folder); }
}
async function readManifest(game) {
  const file = path.join(game.folder, '.orbit-game.json');
  try {
    if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Game metadata must not be a link.');
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.version !== 1 || typeof data.name !== 'string') throw new Error('Game metadata is invalid.');
    return data;
  } catch (e) { if (e.code !== 'ENOENT') throw e; return { version: 1, name: game.name }; }
}
async function assetDirectory(game) {
  const folder = await fs.realpath(game.folder);
  const assets = path.join(folder, '.orbit-assets');
  await fs.mkdir(assets, { recursive: true });
  if ((await fs.lstat(assets)).isSymbolicLink() || !contained(folder, await fs.realpath(assets))) throw new Error('Artwork folder must stay inside the game folder.');
  return assets;
}
async function saveManifest(game, data) {
  const temporary = path.join(game.folder, `.orbit-metadata-${randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2));
  try { await fs.rename(temporary, path.join(game.folder, '.orbit-game.json')); }
  catch (e) { await fs.unlink(temporary).catch(() => {}); throw e; }
}
async function writeAsset(game, name, bytes) {
  const assets = await assetDirectory(game);
  const temporary = path.join(assets, `.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, bytes);
  try { await fs.rename(temporary, path.join(assets, name)); }
  catch (e) { await fs.unlink(temporary).catch(() => {}); throw e; }
}
async function readResponse(response, limit) {
  if (!response.ok) throw new Error(`The metadata source returned ${response.status}. Try again later.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.byteLength; if (size > limit) throw new Error('The metadata source returned too much data.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonRequest(url, fetchPage = fetch) {
  const response = await fetchPage(url, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  return JSON.parse((await readResponse(response, 4 * 1024 * 1024)).toString('utf8'));
}
async function searchGames(query, fetchPage = fetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Enter a game title, up to 200 characters.');
  const url = new URL('https://store.steampowered.com/api/storesearch/');
  url.search = new URLSearchParams({ term: query.trim(), l: 'english', cc: 'ZA' });
  const data = await jsonRequest(url.href, fetchPage);
  return (Array.isArray(data.items) ? data.items : []).filter(item => validId(item.id) && typeof item.name === 'string').slice(0, 12).map(item => ({ id: Number(item.id), name: item.name, image: (() => { try { const u = new URL(item.tiny_image); return imageHost(u) ? u.href : null; } catch { return null; } })() }));
}
async function steamDetails(id, fetchPage = fetch) {
  if (!validId(id)) throw new Error('Invalid Steam game ID.');
  const data = await jsonRequest(`https://store.steampowered.com/api/appdetails?appids=${Number(id)}&l=english&cc=ZA`, fetchPage);
  const details = data[String(Number(id))];
  if (!details?.success || !details.data || typeof details.data.name !== 'string') throw new Error('Steam has no details for this game.');
  if (!['game', 'demo', 'dlc'].includes(details.data.type)) throw new Error('Choose a game, rather than a soundtrack or tool.');
  return details.data;
}
function isImage(bytes) {
  return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
async function downloadImage(game, kind, urls, fetchPage = fetch) {
  for (const value of urls.filter(Boolean)) {
    try {
      const url = new URL(value); if (!imageHost(url)) continue;
      const response = await fetchPage(url.href, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      const bytes = await readResponse(response, 12 * 1024 * 1024);
      if (!isImage(bytes)) continue;
      await writeAsset(game, kind, bytes); return url.href;
    } catch {}
  }
  return null;
}
async function applySteam(game, id, { fetchPage = fetch, replace = false } = {}) {
  return locked(game, async () => {
    const details = await steamDetails(id, fetchPage);
    const saved = await readManifest(game);
    const sources = { ...saved.assetSources };
    const prefix = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${Number(id)}`;
    const images = { cover: [`${prefix}/library_600x900.jpg`, details.capsule_imagev5, details.header_image], hero: [`${prefix}/library_hero.jpg`, details.background_raw, details.header_image], logo: [`${prefix}/logo.png`] };
    const changed = [];
    await Promise.all(Object.entries(images).map(async ([kind, urls]) => {
      const key = `has${kind[0].toUpperCase()}${kind.slice(1)}`;
      if (sources[kind] === 'file' || saved[key] && !replace || game.art && !replace && kind !== 'logo') return;
      const source = await downloadImage(game, kind, urls, fetchPage);
      if (source) { saved[key] = true; saved[`${kind}Url`] = source; sources[kind] = 'steam'; changed.push(kind); }
    }));
    Object.assign(saved, { name: details.name, steamAppId: Number(id), description: String(details.short_description || '').replace(/<[^>]*>/g, '').slice(0, 2000), developer: (details.developers || []).join(', ').slice(0, 200), genre: (details.genres || []).map(g => g.description).join(' · ').slice(0, 200), releaseDate: details.release_date?.date || '', metadataSource: 'Steam', metadataCheckedAt: new Date().toISOString(), needsMetadataMatch: false, assetSources: sources });
    await saveManifest(game, saved);
    return { name: saved.name, changed, steamAppId: Number(id) };
  });
}

async function gameFiles(game) {
  const result = []; let visited = 0;
  const base = await fs.realpath(game.folder);
  async function walk(folder, depth) {
    if (depth > 7 || visited++ > 1200 || result.length > 12000) return;
    const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isSymbolicLink() || /^\.orbit-|node_modules|^\.git$/i.test(e.name)) continue;
      const file = path.join(folder, e.name);
      if (e.isFile() && (/^steam_appid\.txt$/i.test(e.name) || /\.(mp3|ogg|wav|m4a|flac)$/i.test(e.name))) result.push(file);
      else if (e.isDirectory()) await walk(file, depth + 1);
    }
  }
  await walk(base, 0); return result;
}
function musicScore(file) {
  const name = path.basename(file, path.extname(file));
  if (/sfx|sound.?effect|introcinematic|voice|ambien|trailer|teaser|speech/i.test(name)) return 0;
  if (/main[ _-]*menu|main[ _-]*theme|overture/i.test(name)) return 100;
  if (/title[ _-]*(theme|screen)|menu[ _-]*(theme|music)|theme[ _-]*(song|music)/i.test(name)) return 90;
  if (/^theme$|^menu$|^title$|^music$/i.test(name)) return 80;
  if (/theme|bgm|music/i.test(name)) return 40;
  return 0;
}
async function localMusic(game, files) {
  const base = await fs.realpath(game.folder);
  return (files || await gameFiles(game)).filter(f => musicScore(f) > 0).map(file => ({ file, name: path.basename(file, path.extname(file)), relative: path.relative(base, file), score: musicScore(file) })).sort((a,b) => b.score - a.score || a.relative.localeCompare(b.relative)).slice(0, 30);
}
function audioExtension(bytes) {
  if (bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return '.mp3';
  if (bytes.toString('ascii', 0, 4) === 'OggS') return '.ogg';
  if (bytes.toString('ascii', 0, 4) === 'fLaC') return '.flac';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return '.wav';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return '.m4a';
  return null;
}
async function importMedia(game, kind, file, { discovered = false } = {}) {
  if (!['cover', 'hero', 'logo', 'music'].includes(kind)) throw new Error('Invalid media type.');
  const real = await fs.realpath(file);
  if (discovered && !contained(await fs.realpath(game.folder), real)) throw new Error('Choose a track inside this game folder.');
  const stat = await fs.stat(real);
  const limit = kind === 'music' ? 64 * 1024 * 1024 : 12 * 1024 * 1024;
  if (!stat.isFile() || stat.size === 0 || stat.size > limit) throw new Error(`Choose a file smaller than ${limit / 1024 / 1024} MB.`);
  const bytes = await fs.readFile(real);
  const extension = kind === 'music' ? audioExtension(bytes) : null;
  if (kind === 'music' ? !extension : !isImage(bytes)) throw new Error(kind === 'music' ? 'Choose an MP3, OGG, WAV, M4A or FLAC audio file.' : 'Choose a JPG, PNG or WebP image.');
  return locked(game, async () => {
    const saved = await readManifest(game);
    await writeAsset(game, kind === 'music' ? `music${extension}` : kind, bytes);
    saved[`has${kind[0].toUpperCase()}${kind.slice(1)}`] = true;
    saved.assetSources = { ...saved.assetSources, [kind]: discovered ? 'game' : 'file' };
    if (kind === 'music') { saved.musicFile = `music${extension}`; saved.musicTitle = path.basename(real, path.extname(real)); }
    await saveManifest(game, saved);
    return { kind, name: kind === 'music' ? saved.musicTitle : path.basename(real) };
  });
}
async function autoConfigure(game, { fetchPage = fetch, bundledMusic = false, force = false } = {}) {
  const saved = await readManifest(game);
  const files = await gameFiles(game);
  const result = { metadata: false, music: false, needsMatch: false };
  if (!saved.hasMusic && !bundledMusic) {
    const candidates = await localMusic(game, files);
    if (candidates[0]?.score >= 80 && (!candidates[1] || candidates[0].score > candidates[1].score)) {
      await importMedia(game, 'music', candidates[0].file, { discovered: true }); result.music = true;
    }
  }
  if (!force && saved.metadataCheckedAt && Date.now() - Date.parse(saved.metadataCheckedAt) < 7 * 86400000) return result;
  let id = validId(saved.steamAppId) ? Number(saved.steamAppId) : null;
  if (!id) {
    const ids = new Set();
    for (const file of files.filter(f => /^steam_appid\.txt$/i.test(path.basename(f)))) { const text = (await fs.readFile(file, 'utf8')).trim(); if (/^\d+$/.test(text) && validId(text)) ids.add(Number(text)); }
    if (ids.size === 1) id = [...ids][0];
  }
  if (!id) {
    const candidates = await searchGames(game.name, fetchPage);
    const exact = candidates.filter(item => normalize(item.name) === normalize(game.name));
    if (exact.length === 1) id = exact[0].id;
  }
  if (id) { await applySteam(game, id, { fetchPage }); result.metadata = true; }
  else {
    result.needsMatch = true;
    await locked(game, async () => { const latest = await readManifest(game); if (!latest.metadataSource) { latest.metadataCheckedAt = new Date().toISOString(); latest.needsMetadataMatch = true; await saveManifest(game, latest); } });
  }
  return result;
}
module.exports = { searchGames, steamDetails, applySteam, autoConfigure, localMusic, importMedia, gameFiles, readManifest, musicScore };
