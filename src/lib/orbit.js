import { createCatalogueClient } from './catalogue-client.js';
import { parseCatalogue } from '../catalogue-data.js';
export const desktop = Boolean(window.orbit);

export async function request(name, ...args) {
  if (typeof window.orbit?.[name] !== 'function') throw new Error('Open the desktop app to use this feature.');
  const result = await window.orbit[name](...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function readLibrary() {
  if (desktop) return request('library');
  const response = await fetch('/api/library');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('orbit-preview') || '{}'); } catch {}
  return { ...data, ...saved };
}

export async function readCatalogue(options) {
  if (desktop) return request('catalogue', options);
  const {collection,...query}=options;
  const response = await fetch(`/api/catalogue?${new URLSearchParams({...query,...(collection ? {collection:JSON.stringify(collection)} : {})})}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Catalogue unavailable.');
  return data;
}

export const catalogueClient=createCatalogueClient({read:readCatalogue,parse:parseCatalogue});
export function catalogueArtwork(game,width=300) {
  if(!game.coverUrl)return '';
  if(!game.coverKey)return game.coverUrl;
  return `${desktop?'orbit-catalogue://cover/':'/api/catalogue-art/'}${game.id}?v=${game.coverKey}&width=${width}`;
}

export function artwork(game, kind = 'hero') {
  if (!game) return '';
  if (game[`has${kind[0].toUpperCase()}${kind.slice(1)}`])
    return `${desktop ? 'orbit-art://' : '/api/art/'}${game.id}/${kind}?v=${game.mediaVersion || 0}`;
  if (game.art) return kind === 'logo' ? `./art/${game.art}-logo.png` : `./art/${game.art}-library_${kind === 'hero' ? 'hero' : '600x900'}.jpg`;
  if (kind === 'logo') return '';
  if (kind === 'hero' && game.hasCover) return artwork(game, 'cover');
  return kind === 'hero' ? game.heroUrl || game.coverUrl || '' : game.coverUrl || '';
}

export const canPlay = (game, library) => Boolean(game && !game.download && (game.executable || game.launchUri || game.aumid || library.executables?.[game.id]));
