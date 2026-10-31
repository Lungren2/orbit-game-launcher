const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const contained = (base, target) => { const relative = path.relative(base, target); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); };

// Steam's text KeyValues format is used by both libraryfolders.vdf and ACF manifests.
function parseKeyValues(text) {
  const tokens = []; let i = 0;
  while (i < text.length) {
    if (/\s|\uFEFF/.test(text[i])) { i++; continue; }
    if (text.slice(i, i + 2) === '//') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (text[i] === '{' || text[i] === '}') { tokens.push(text[i++]); continue; }
    let value = '';
    if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && ['\\', '"'].includes(text[i + 1])) i++;
        value += text[i++];
      }
      if (text[i++] !== '"') throw new Error('Unclosed Steam string.');
    } else {
      while (i < text.length && !/[\s{}]/.test(text[i])) value += text[i++];
    }
    tokens.push({ value });
    if (tokens.length > 100000) throw new Error('Steam file is too large.');
  }
  let index = 0;
  function object(depth, nested = false) {
    if (depth > 32) throw new Error('Steam file is too deeply nested.');
    const result = Object.create(null);
    while (index < tokens.length) {
      const key = tokens[index++];
      if (key === '}' && nested) return result;
      if (typeof key !== 'object') throw new Error('Invalid Steam key.');
      const next = tokens[index++];
      if (next === '{') result[key.value.toLowerCase()] = object(depth + 1, true);
      else if (typeof next === 'object') result[key.value.toLowerCase()] = next.value;
      else throw new Error('Invalid Steam value.');
    }
    if (nested) throw new Error('Unclosed Steam object.');
    return result;
  }
  return object(0);
}

async function readKeyValues(file) {
  if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error('Steam file is too large.');
  return parseKeyValues(await fs.readFile(file, 'utf8'));
}

let rootsPromise, rootsTime = 0;
async function steamDirectories() {
  if (process.platform !== 'win32') return [];
  if (rootsPromise && Date.now() - rootsTime < 30000) return rootsPromise;
  rootsTime = Date.now();
  rootsPromise = (async () => {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(folder => path.join(folder, 'Steam'));
    const registry = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/reg.exe');
    const queries = [['HKCU\\Software\\Valve\\Steam', 'SteamPath'], ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'], ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']];
    const results = await Promise.allSettled(queries.map(([key, value]) => execute(registry, ['query', key, '/v', value], { windowsHide: true, timeout: 3000, maxBuffer: 65536 })));
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const match = /REG_SZ\s+([^\r\n]+)/i.exec(result.value.stdout);
      if (match) roots.unshift(match[1].trim());
    }
    return roots;
  })();
  return rootsPromise;
}

async function scanSteam({ directories, warnings = [] } = {}) {
  const games = [], libraries = new Map(), seen = new Set();
  const warn = () => { if (!warnings.includes('Steam library could not be read. You can rescan in Settings.')) warnings.push('Steam library could not be read. You can rescan in Settings.'); };
  const addLibrary = folder => {
    if (typeof folder === 'string' && path.isAbsolute(folder)) libraries.set(path.resolve(folder).toLowerCase(), path.resolve(folder));
  };
  const roots = new Map();
  for (const folder of directories ?? await steamDirectories()) {
    if (typeof folder === 'string' && path.isAbsolute(folder)) roots.set(path.resolve(folder).toLowerCase(), path.resolve(folder));
  }
  for (const root of roots.values()) {
    addLibrary(root);
    try {
      const data = (await readKeyValues(path.join(root, 'steamapps/libraryfolders.vdf'))).libraryfolders;
      if (!data || typeof data !== 'object') throw new Error('Invalid Steam libraries.');
      for (const [key, entry] of Object.entries(data)) {
        if (/^\d+$/.test(key)) addLibrary(typeof entry === 'string' ? entry : entry.path);
      }
    } catch (error) { if (error.code !== 'ENOENT') warn(); }
  }
  for (const library of libraries.values()) {
    const steamapps = path.join(library, 'steamapps');
    const entries = await fs.readdir(steamapps).catch(error => { if (error.code !== 'ENOENT') warn(); return []; });
    const common = await fs.realpath(path.join(steamapps, 'common')).catch(() => null);
    if (!common) continue;
    for (const entry of entries.filter(name => /^appmanifest_[1-9]\d{0,9}\.acf$/i.test(name)).slice(0, 5000)) {
      try {
        const manifestFile = path.join(steamapps, entry);
        const data = (await readKeyValues(manifestFile)).appstate;
        const id = /^appmanifest_(\d+)\.acf$/i.exec(entry)[1];
        if (!data || data.appid !== id || id === '228980' || seen.has(id)) continue;
        const flags = Number(data.stateflags);
        if (!Number.isSafeInteger(flags) || flags < 0 || !(flags & 4) || (flags & 33)) continue;
        if (typeof data.name !== 'string' || !data.name.trim() || typeof data.installdir !== 'string' || !data.installdir.trim()) continue;
        const candidate = path.resolve(common, data.installdir);
        if (!contained(common, candidate)) continue;
        const folder = await fs.realpath(candidate).catch(() => null);
        if (!folder || !contained(common, folder) || !(await fs.stat(folder)).isDirectory()) continue;
        games.push({ name: data.name, folder, identity: `steam:${id}`, platform: 'Steam', steamAppId: Number(id), steamManifest: manifestFile, launchUri: `steam://rungameid/${id}` });
        seen.add(id);
      } catch { /* Steam can replace manifests while a scan is in progress. */ }
    }
  }
  return games;
}

module.exports = { parseKeyValues, scanSteam };
